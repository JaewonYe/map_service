# 지도 모듈 플랫폼 연동 조사·검토안

조사 기준: 2026-11-14, `1731d34054f511aef87372e04611e57f9aaf575f`.
작업: [map_service #1](https://github.com/JaewonYe/map_service/issues/1).
이 문서는 현재 코드와 승인 전 제안이다. 플랫폼 공통 OpenAPI는 `paths: {}`이며 아래 경로는 승인된 플랫폼 계약이 아니다.

## 현행 API

근거: `app/api/**/route.ts`, `lib/buildings/{model,http,store}.ts`, `lib/tiles/{http,tpk,catalog,osm}.ts`, `lib/maps/{layers,elevation,types}.ts`.
모든 핸들러는 Node.js 런타임이다. 사용자 로그인·토큰·역할 권한 검사는 없다. `usageConfirmed`는 데이터 이용 조건 확인이며 사용자 인증이 아니다. 건물 쓰기 출처 검사도 사용자 인증을 대체하지 않는다.

| 메서드·경로 | 입력 | 성공 응답 | 실패·의존성 |
| --- | --- | --- | --- |
| GET `/api/map-info` | 없음 | 200 JSON: 카탈로그 메타데이터, `mode`, `sources`, `warnings`, `revision`, `usageConfirmed`, `center`, `bounds`, `minZoom/maxZoom`, `zoom`, `tileSize`, `projection`, `attribution`, `layers`, `osm` | 부분 레이어 실패는 `available:false`와 안내로 축소될 수 있다. 200만으로 데이터 준비 완료를 판단하지 않는다. 예외는 공통 타일 오류 처리. TPK·street·DEM·OSM 상태에 의존 |
| GET `/api/tiles/{z}/{x}/{y}` | XYZ | 200 PNG/JPEG 바이트, ETag; 일치하는 `If-None-Match`는 304 | 누락 404, 좌표 400, 이용 미확인 403, 대기열 429, 파일/설정 변경 또는 데이터 부재 503, 형식 오류 422·일반 IO 오류 500. 위성 카탈로그/TPK 필요 |
| GET `/api/street/{z}/{x}/{y}` | XYZ | 위성 타일과 같은 형식·캐시·소스 헤더 | 위 타일 오류 체계. 별도 street 카탈로그/TPK와 별도 이용 확인 필요 |
| GET `/api/osm/{z}/{x}/{y}` | XYZ | 200 PNG/JPEG, ETag, 조건부 304 | 누락·로컬 미제공 404, 좌표 400, 렌더러 과부하 429, 형식 오류 422·일반 IO 오류 500 등. 준비된 SQLite 또는 허용된 XYZ 폴더 필요. 온라인 OSM의 프록시가 아니다 |
| GET `/api/elevation/tiles/{z}/{x}/{y}` | XYZ | 200 RGBA PNG 색상/음영, ETag, 조건부 304 | 누락·원본 줌 범위 밖 404, 좌표 400, 이용 미확인 403, 과부하 429, 미준비 503, 형식 오류 422·일반 IO 오류 500. 변환 DEM 필요 |
| GET `/api/elevation` | 필수 `lat`, `lon` 쿼리 | 200 `{elevationMeters,nativeZoom,units:'m',verticalDatum}` 또는 `{elevationMeters:null,reason:'outside'|'nodata'|'missing'}` | 빈 값·비유한값·범위 오류 400, 이용 미확인 403, 과부하 429, 미준비 503, 형식 오류 422·일반 IO 오류 500 |
| GET `/api/buildings` | 없음; 페이지/필터 없음 | 200 `{buildings: Building[]}`, 수정일 내림차순 후 ID 정렬 | 폴더 부재는 빈 목록. 손상·IO·지원 수 초과 503 |
| POST `/api/buildings` | JSON BuildingInput | 201 `{building}`, `Location` | 입력 400, 출처 403, 용량 한도 409, 본문 413, 형식 415, 저장 실패 503 |
| GET `/api/buildings/{id}` | UUID v4 | 200 `{building}`, ETag=`"버전"` | 잘못된 ID 400, 없음 404, 읽기 실패 503. 조건부 GET 304 처리 없음 |
| PUT `/api/buildings/{id}` | UUID v4, JSON 전체 입력, `If-Match: "현재버전"` | 200 `{building}`, 증가한 버전의 ETag | 입력 400, 출처 403, 없음 404, 버전 충돌 409, 본문 413, 형식 415, 버전 헤더 428, 저장 실패 503 |
| DELETE `/api/buildings/{id}` | UUID v4, `If-Match` | 204 빈 본문 | ID 400, 출처 403, 없음 404, 충돌 409, 헤더 428, 저장 실패 503 |

### 데이터·오류 세부

- XYZ 문자열은 선행 0 없는 0 이상의 정수, z ≤ 24, x/y < 2^z. 각 데이터의 실제 제공 줌은 더 좁을 수 있다. 위경도는 lat ±85.05112878, lon ±180 범위다.
- `bounds`는 `{south,west,north,east}`. 카메라 `center`는 `[위도,경도]`다. `layers`의 satellite/street/elevation에는 `available`, 선택적 `reason/url/revision/bounds/minNativeZoom/maxNativeZoom/attribution/online`이 있고 고도에는 최저·최고 고도와 기준이 추가된다. OSM에는 `mode`, `url`, `attribution`과 준비 상태·범위 등이 있다.
- BuildingInput: 필수 `name`(trim 후 1–120자), 숫자 `latitude/longitude`; 선택 문자열 `description`(5000), `address`(300), `contact`(160), `website`(2048, http/https), `category`(기본 미분류; 주거/상업/공공시설/공장·창고/교육/의료/문화·관광/기타). 생략 문자열은 빈 값이다. PUT은 부분 패치가 아니다.
- Building은 입력에 UUID v4 `id`, 양의 정수 `version`, ISO `createdAt/updatedAt`을 더한다. UUID는 지도 건물 레코드 ID이며 플랫폼 시설 ID가 아니다. `BUILDINGS_DIR/<id>.json`에 저장하며 최대 10,000개다. 프로세스 내부 쓰기 직렬화와 버전 검사이며 여러 인스턴스 간 트랜잭션 보장은 없다.
- 쓰기는 `Sec-Fetch-Site: cross-site`를 거부하고 Origin이 있으면 요청 Host와 비교한다. Origin이 없는 요청도 가능하다. 공개 서비스용 접근 제어가 승인·구축됐다고 간주할 수 없다.
- `TileError`의 기본 상태는 422이며 메타데이터·형식·경로 검증 오류에 사용된다. 일반 예외는 500이다. OSM 준비 데이터 검증 실패는 `osmInfo`에서 mode:error로 축소되어 타일 요청에서는 404로 나타날 수 있다.
- 오류 본문은 보통 `{error: string}`. 타일의 누락 404와 304, 건물 삭제 204는 빈 본문이다. 타일 오류는 no-store, 429는 `Retry-After: 1`. 건물은 no-store. 타일 성공은 private max-age=3600, 위성/street 누락은 public max-age=60, OSM/DEM 누락은 private max-age=60. map-info는 no-store, 고도 점 조회는 private max-age=60이다.
- 위성/street 200에는 `X-Map-Source`, `X-Map-Native-Zoom`, `X-Map-Fallback`, `X-Map-Contributors`가 있다. 원본 줌 확대·합성 결과를 실제 고해상도 원본으로 해석하지 않는다. 고도 0m·음수는 유효하고 null과 다르다.
- 일반 지도 선택 순서는 street TPK → 준비된 OSM 색인 → 허용된 로컬 XYZ → 명시적 online 모드의 외부 OSM이다. 온라인 URL은 브라우저가 직접 요청하며 `/api/osm`이 다운로드하지 않는다.

## 플랫폼 최소 읽기 연동안 — 승인 전 제안

1. 우선 map-info에서 제공 가능한 레이어와 타일 URL·영역을 읽고 준비 상태를 표시한다. 현재 상대 URL을 사용할 때 배치 경로·리버스 프록시 경로를 명시적으로 결정해야 한다. `available:false`, 외부 `online:true`, 부분 실패를 처리한다.
2. 지도 건물 목록·단건 조회로 위치와 표시 정보를 연동한다. 현재 전체 목록 방식의 성능·페이지네이션 필요성을 실제 규모로 검토한다. 예약 가능 여부를 건물 category나 좌표로 추정하지 않는다.
3. 고도 점 조회는 선택 기능으로 두고 null/NoData/기준 미확인을 표시한다. 예약 규칙이나 안전 판정에 자동 적용하지 않는다.
4. API 제공자·소비자, 필요한 필드, 인증·권한, 배포 주소, 버전·오류 규칙이 승인된 후에만 공통 명세와 실제 소비자/제공자 계약 테스트를 연결한다. 현행 응답을 문서화한 것만으로 계약 준수를 증명하지 않는다.

| 결정 필요 항목 | 승인 전 검토 사항·영향 |
| --- | --- |
| 시설 원장과 ID | 원장 소유자·발급 주체, 건물↔시설 1:1/1:N/N:M 여부, 미연결·삭제·재연결 정책. 별도 연계표 후보를 검토하며 지도 UUID를 공통 ID로 자동 채택하지 않는다 |
| 데이터 책임 | 지도는 지도/공간정보·현행 건물 레코드를 관리. 예약은 예약 데이터를 관리. 시설 공통 속성의 소유자는 미정. 타 모듈 DB 직접 조회·수정 없이 API로 연동 |
| 보안·네트워크 | 포털 인증 전달, 조회/관리 권한, CSRF·CORS, 외부 노출·프록시·캐시 정책. 현재 인증 부재와 출처 검사를 그대로 공통 보안으로 채택하지 않는다 |
| 계약·호환성 | 기존 경로/응답 변경 시 현재 Leaflet 클라이언트에 영향. 우선 기존 기능을 유지하며 어댑터 또는 버전 경로의 필요성을 검토. 승인 없이 운영 API·스키마 추가 안 함 |
| 동시성·운영 | 여러 서버에서 JSON 저장소를 공유할지, DB 전환과 잠금 전략, 최대 건물 수·페이지네이션·동기화/삭제 전파·장애 시 동작을 결정 |

이번 작업은 조사 문서이며 앱 코드·공통 API·예약 DB·상위 submodule SHA를 변경하지 않는다. 병합 후 통합 저장소의 별도 PR에서 검증된 모듈 커밋을 선택한다.

## 클라우드 실행·준비·종료

Node.js ≥22.13 (이번 검증 v24.22.1), npm 및 작업 공간 쓰기 권한이 필요하다. 초기 설치·이미지 빌드에는 네트워크가 필요할 수 있다. 원본 파일·비밀 키를 저장소에 추가하지 않는다.

```sh
npm ci --cache /workspace/work/npm-cache
npm run typecheck
npm run dev
```

일반 환경에서는 `npm ci`로 충분하다. 캐시 경로는 이 클라우드의 기본 npm 폴더가 읽기 전용인 경우의 예다. 개발 서버는 127.0.0.1:3001이다. `predev`가 새 PBF를 발견하면 Docker 준비를 먼저 수행하며 실패 시 시작을 중단한다. PBF가 없으면 변환을 요구하지 않는다. 이미 준비된 로컬 데이터의 조회에는 별도 Python/타일 서버가 필요 없다.

다른 터미널에서:

```sh
curl --fail http://127.0.0.1:3001/api/map-info
curl --fail http://127.0.0.1:3001/api/buildings
```

map-info 200 이후 필요한 `layers.*.available`, `osm.mode`, `reason`, 범위와 실제 해당 타일을 확인한다. 빈 데이터 상태의 200은 지도 준비 완료가 아니다. `npm run smoke`는 허용된 위성 TPK와 중심 타일을 요구하므로 데이터 없는 환경의 일반 헬스체크가 아니다. 실제 데이터 사용 확인값은 이용 조건을 확인한 경우에만 설정한다.

종료는 실행 터미널 Ctrl+C. 운영은 `npm run build` 후 `npm run start`이며 start는 0.0.0.0:3001에 바인딩하므로 배포 경계 설정을 별도 결정한다. Compose는 `docker compose up -d --build`, 종료는 `docker compose down`; 데이터 삭제 옵션은 사용하지 않는다. Windows/Ubuntu 실행과 데이터 준비 상세는 상위 README를 따른다.

### 비밀이 아닌 설정 이름

| 그룹 | 설정 및 의존성 |
| --- | --- |
| 위성 | 개발 `TPK_PATH`, `MAP_CONFIG_FILE`, `TPK_CACHE_DIR`, `TPK_USAGE_CONFIRMED`; Compose `TPK_HOST_DIR`, `TPK_FILE`. 다중 maps.json은 항목별 이용 확인 |
| 일반 TPK | `STREET_TPK_DIR`, `STREET_USAGE_CONFIRMED`; Compose `STREET_HOST_DIR` |
| OSM | `MAP_MODE`(기본 offline), `OSM_TILE_DIR`, `OSM_PBF_FILE`, `OSM_USAGE_CONFIRMED`(직접 XYZ용), Compose `OSM_HOST_DIR`. PBF 변환 결과 metadata.json·SQLite와 이용 확인 필요 |
| 고도 | `ELEVATION_DIR`, `ELEVATION_USAGE_CONFIRMED`(변환), Compose `ELEVATION_HOST_DIR`; `DEM_MIN_ZOOM/MAX_ZOOM`, `DEM_SOURCE`, `DEM_ATTRIBUTION`, `DEM_VERTICAL_DATUM`. 단일 밴드 미터 DEM → metadata·color/height 타일 |
| 건물·공개 주소 | `BUILDINGS_DIR`(쓰기 필요), Compose `BUILDINGS_HOST_DIR`, `BIND_ADDRESS`, `PORT`. 개발 포트는 package.json의 3001과 구분 |

`.env.example`을 참고하고 기존 .env·데이터는 보존한다. TPK·DEM·PBF·사용자 건물 JSON·키는 커밋하지 않는다. 이 조사에는 외부 API 키가 필요 없다.

검증 기록과 환경별 미실행 범위는 [VALIDATION.md](VALIDATION.md)를 참조한다.
