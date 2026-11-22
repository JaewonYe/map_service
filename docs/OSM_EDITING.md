# 오프라인 일반 지도 편집 계약

[이슈 #18](https://github.com/JaewonYe/map_service/issues/18)의 지도 모듈 내부 기능이다. 구현 전 [변경안](https://github.com/JaewonYe/map_service/issues/18#issuecomment-7075008375)을 기록했다. 공통 OpenAPI·시설 원장·예약 계약을 변경하지 않는다.

## 데이터 흐름과 호환성

`PBF → prepare.py → 읽기 전용 base SQLite → source 조회 + 별도 edits.json → PNG 렌더` 순서다. UI 초안은 저장 전까지 Leaflet 미리보기이며 저장 후 실제 `/api/osm/{z}/{x}/{y}` PNG에 합성한다. 시설 UUID/대표 지점/boundary/JSON 및 시설 API는 이 저장소와 별개다. 공용 OSM 업로드·계정·토큰은 없다.

새 importer는 SQLite `PRAGMA user_version=2`와 `features.source_key/fingerprint/readonly_reason`을 쓴다. metadata의 기존 `version:1` 계약은 유지하고 `indexVersion:2`를 추가한다. source key는 실제 OGR `osm_id/osm_way_id`에서 얻은 `node:ID`, `way:ID`, `relation:ID`다. 원본 객체 fingerprint는 kind/class/name/전체 EPSG:3857 geometry의 canonical SHA256이며 준비 순번을 포함하지 않는다. 지원하지 않는 임의 태그 변경까지 추적하는 OSM 서버 version은 아니다.

`features.id`는 공간 색인의 내부 순번이다. 재준비 시 순번·좌표 근접·이름으로 수정 대상을 연결하지 않는다. 원본 key와 fingerprint가 같을 때만 자동 적용한다. metadata 바이트의 SHA256을 dataset revision으로 사용한다. 원본이 변경/삭제되거나 읽기 전용이 되면 기록은 conflict로 남고 새 base를 표시한다. 수정 해제 또는 최신 원본 fingerprint를 확인한 명시적 재적용만 허용한다. 새 원본 범위 밖으로 벗어난 로컬 객체도 충돌이다. 로컬 신규 객체는 형상을 새 범위 안으로 옮긴 뒤 재적용하거나 신규 객체를 제거할 수 있다.

schema1은 기존대로 렌더/조회한다. source 정보가 없어 `legacy:순번`은 읽기 전용이고 다른 데이터셋에 재연결하지 않는다. 같은 PBF의 기존 준비 결과는 자동 덮어쓰지 않는다. **메뉴 7 또는 `docker compose --profile tools run --rm --build prepare-osm --force`**로 새 세트를 만들고 앱을 다시 조회한다. 실패하면 기존 metadata/set/수정 기록을 보존한다. 이전 세트는 자동 삭제하지 않는다. 새 앱은 schema1/2를 읽지만 과거 schema1 전용 앱으로 되돌릴 때는 이전 세트의 metadata도 함께 복구해야 한다.

## 지원 범위와 좌표

편집은 prepared OSM SQLite의 bounds 안에서만 가능하다. street TPK가 우선이면 편집 진입 시 별도 **OSM 로컬 일반 지도**로 전환하고 종료 시 이전 레이어로 돌아간다. TPK/XYZ/온라인/위성/DEM은 이 기능의 편집 대상이 아니다.

| 종류 | 형상 | 정점 | 표시 분류 |
| --- | --- | --- | --- |
| 지명/표시 지점 | Point | 1 | place: city/town/village/suburb/neighbourhood/hamlet, poi: cafe/school/parking/hospital/viewpoint |
| 도로 | LineString | 2–256 | motorway/trunk/primary/secondary/tertiary/unclassified/residential/living_street/service/pedestrian/footway/path/cycleway/steps/track |
| 건물 외곽 | 구멍 없는 단일 Polygon | 3–128, 폐합점 제외 | yes/house/industrial/commercial/public |

MultiPolygon/관계/해안선·자동 파생/분할/중복 source/수선된 원본/대형 객체/미지원 분류는 사유를 표시하고 읽기 전용이다. OGR이 단일 closed way 건물을 MultiPolygon wrapper로 반환하는 경우만 원래 way의 단일 외곽을 보존한다. 실제 relation이나 여러 영역·구멍을 평탄화하지 않는다.

API/저장은 GeoJSON EPSG:4326 `[경도,위도]`, UI 핸들은 Leaflet `[위도,경도]`, base/렌더는 EPSG:3857로 명시 변환한다. 경도 ±180, 위도 ±85.05112878, 소수 7자리(극한 위도는 안쪽 clamp), bounds 양자화 오차 1e-7만 허용한다. 날짜변경선/경도 폭 180도 이상·빈/중복/퇴화/자기 교차·접촉·구멍/다중 영역을 거부한다. Polygon은 폐합·반시계 방향으로 정규화한다. 이름은 trim 후 최대 160자, 지명/표시 지점에는 필수다. 공유 node topology/라우팅망/임의 OSM 태그 편집은 지원하지 않는다.

## 모듈 내부 API

모든 객체 응답은 `Cache-Control:no-store`. 오류는 `{error:string}`이다.

| 요청 | 의미 |
| --- | --- |
| `GET /api/osm/objects?bbox=west,south,east,north&zoom=16&offset=0` | viewport 조회. zoom14–19, 각 축 최대 0.25도, 최대 200개. 과밀은 422와 확대 안내 |
| `GET /api/osm/objects?changes=1&offset=0` | bbox 없이 수정 내역 조회. 50개씩, offset0–500 |
| `GET /api/osm/objects/{encoded-key}` | 현재 객체와 최신 원본, revision/dataset/bounds |
| `POST /api/osm/objects` | add/update/hide/restore/reapply. JSON, 같은 origin 검사, 최대 32KiB, `If-Match:"현재 revision"` 필수 |

목록 응답은 `{revision,dataset,bounds,editable,reason,objects,changes,changeCount}`다. 객체는 `{key,name,kind,class,geometry,fingerprint,editable,reason?,source,state}`이며 source는 base/local, state는 original/modified/hidden/conflict다. 상세는 `{revision,dataset,bounds,object,original}`이다. JSON 응답은 최대 1MiB, 상세 source geometry는 32KiB 초과 시 SQL에서 제외하고 읽기 전용 사유를 반환한다.

POST body는 `{action,key?,dataset,fingerprint?,value?}`다. value는 `{name,kind,class,geometry}`. add는 서버가 `local:UUIDv4`를 발급한다. update/hide는 선택한 원본 fingerprint, reapply는 검토한 최신 원본 fingerprint가 필요하다. restore는 해당 수정만 제거한다. source hide는 tombstone, local hide/restore는 신규 기록 제거다. hide 충돌을 재적용하면 숨김 의도를 유지한다. 응답은 `{revision,dataset,key,object}`이며 신규 제거 후 object는 null이다.

revision은 **수정 저장소 전체의 낙관적 버전**이다. 오래된 탭은 대상이 달라도 409를 받으며 초안을 유지한다. dataset 교체·source 변경도 409, If-Match 누락/형식 오류는 428, 잘못된 JSON/형상은 400, 본문 초과 413, origin 거부 403, 저장소 장애 503이다. 오류 후 최신 정보를 확인하고 초안 취소/재선택 후 다시 편집한다. 충돌 상태의 ‘객체 수정’에서는 초안을 검토한 뒤 ‘원본 검토 후 재적용’을 누른다. 원본 삭제/읽기 전용이면 원본 복원으로 수정만 해제할 수 있다.

## 저장·실패 복구

`OSM_EDITS_DIR` 기본은 `data/osm-edits`, 파일은 `edits.json`이다. `{version:1,revision,edits:[{key,action,baseFingerprint,dataset,value,updatedAt}]}`. 최대 500개/8MiB. 실제 수정 파일과 PBF/base/시설 데이터는 Git에 넣지 않는다.

동일 프로세스의 저장소 인스턴스는 경로별 queue를 공유한다. 버전을 검사하고 새 파일을 wx/0600으로 작성·fsync한 뒤 rename하며 실패 시 임시 파일을 정리한다. 손상/미지원 버전/심볼릭 링크는 503으로 중단하고 자동 초기화하지 않는다. 서버를 중지하고 원본 오류 파일을 보존한 뒤 백업에서 복구한다. 디렉터리 쓰기 권한/공간을 확인하고 다시 조회한다. 디렉터리 fsync·전원 장애 내구성·프로세스 간 분산 잠금은 보장하지 않는다. **동시에 쓰는 서버는 하나만 운영**한다.

Compose는 `OSM_EDITS_HOST_DIR`(기본 `./data/osm-edits`)를 `/data/osm-edits`에 별도 쓰기 가능 bind mount한다. 원본 OSM mount는 읽기 전용이다. 커스텀 호스트 폴더는 미리 만들고 컨테이너 node 사용자의 읽기/쓰기 권한을 준다. Node 실행과 Compose를 번갈아 쓰면 같은 수정 폴더를 지정한다. `data/osm`, 수정 폴더, `data/buildings`를 함께 백업·이전한다. 재준비나 컨테이너 재생성은 수정 폴더를 삭제하지 않는다.

## 실제 PNG와 캐시

유효한 수정 source key를 base query에서 먼저 제외하고 update/add만 EPSG:3857로 합성한다. hide와 충돌은 합성하지 않는다. 충돌은 새 base를 유지한다. 이전 label/형상을 위에 덧그리는 방식으로 남기지 않는다.

메모리 LRU와 pending 렌더 key에 base revision + store revision + z/x/y를 넣는다. 전 revision 렌더가 늦게 완료돼도 새 key를 오염시키지 않는다. 전체 revision 무효화로 이동 전후·다른 줌을 함께 갱신하고 128px query/label 여유를 둔다. PNG 바이트 SHA256 ETag와 `private,no-cache`(404 포함), If-None-Match 304를 제공한다. 저장/재조회 revision 변경 시 Leaflet URL도 갱신한다. 다른 탭의 변경은 현재 화면 다시 조회/지도 이동/새로고침으로 가져온다.

## UI와 검증

지도 클릭 12 CSS px 이내(Polygon 내부 포함) 후보를 최대 10개 제시하고 viewport 목록을 키보드 대안으로 제공한다. 초안은 선택 당시 dataset/revision/fingerprint에 고정한다. 미저장 종료/Esc/대상 전환 확인, beforeunload 경고, 실패 보존, 저장 중 중복·대상 변경 차단을 제공한다. 도형 이력은 UI 최근 100회만 유지한다.

[실제 화면 검토](OSM_EDIT_UI_REVIEW.md), [완료 조건별 검증](VALIDATION.md#이슈-18-오프라인-osm-일반-지도-편집)을 참조한다. 합성 데이터 검증이며 대한민국 전체 실데이터·OS 실기·다중 서버/인증 운영·법적 측량 정확도·전체 OSM 편집기 호환성은 검증하지 않았다. same-origin 검사는 사용자 인증/공개 인터넷 운영 정책을 대신하지 않는다.
