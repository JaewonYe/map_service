# 지도 모듈 작업 현황

## 책임·기준

지도·공간정보와 현행 건물 표시 데이터를 담당한다. 통합 기준은 [platform_core](https://github.com/JaewonYe/platform_core)의 AGENTS.md, PROJECT_CONTEXT.md, docs/ROLES.md, docs/WORKFLOW.md, docs/ARCHITECTURE.md 및 계약 관리 가이드다. 새 작업은 최신 문서와 Issue/PR을 먼저 조회한다.

## 이슈 #1 조사

- 기존 구현 기준: `1731d34054f511aef87372e04611e57f9aaf575f`.
- [현행 API와 연동 검토안](docs/PLATFORM_INTEGRATION.md), [검증 결과](docs/VALIDATION.md)를 작성했다.
- 기존 Next.js/Leaflet·TPK·OSM·고도·건물 구현은 유지한다.
- 공통 OpenAPI는 업무 경로가 없는 기본 문서이며 이번 조사는 승인된 공통 계약이 아니다.
- 시설 원장 소유자·공통 ID·인증/권한·배포/주소·API 버전·다중 서버 저장 정책은 미결정이다.
- 예약 데이터와 타 모듈 DB를 직접 조회·수정하지 않는다.
- 변경은 검토 PR로 제출하며 상위 저장소 gitlink는 별도 통합 작업에서 갱신한다.

## 다음 단계

사용자가 연동 범위·시설 연계·보안 정책을 결정한 후 아키텍처 Codex와 공통 계약을 검토하고 실제 구현 계약 테스트를 연결한다. 실제 사용자 TPK/DEM/PBF와 Windows 11/Ubuntu 24.04 실기 검증은 별도로 필요하다.


## 이슈 #3 시설·건물 관리

- 사용자 확정: 별도 공통 시설 ID 없이 맵에서 정보를 추가·조회하며, 건물과 시험장·주차장·야외 공간을 모두 포함한다.
- 지도 버튼 → 위치 선택 → 시설 정보 저장 → 마커 상세 조회 → 수정/삭제 흐름을 제공한다. 우클릭 등록과 기존 건물 자료를 유지한다.
- 기존 `/api/buildings` 경로·내부 UUID·버전·파일 저장 방식은 유지하며 야외 시설 분류만 추가했다. 공통 시설 원장·예약 데이터 연동·공통 OpenAPI는 확정하지 않았다.
- 이슈 #3 당시 표현은 지점 마커였다. 경계는 아래 이슈 #11에서 확장하며 플랫폼 시설 ID 연계·공통 인증·다중 서버 운영은 후속 범위다.

## 이슈 #5 회귀 테스트 CI

- PR/main push용 GitHub Actions workflow와 안정적인 job 이름 `Node regression and typecheck`, `Playwright regression`을 추가한다.
- Node.js 24, npm 잠금 파일 설치, 기존 Node 명령 6개(앱 회귀 71개), 별도 집계 도구 검사 5개, Playwright 5개 프로젝트(30개)와 타입 검사를 자동화한다. 두 job의 작업 공간은 분리된다.
- CI 요약·진단 artifact를 제공하고 빈 실행·전체 스킵을 성공 증거에서 제외한다. 원격 실행 결과는 [검증 기록](docs/VALIDATION.md)과 이슈 #5 완료 댓글에서 SHA별로 확인한다.
- 이슈 #5 당시 Python/GDAL/Docker 변환 7개는 CI에 포함하지 않았다(아래 이슈 #7 확장 참조). 실제 사용자 데이터·OS 실기·인증/운영·승인된 플랫폼 계약 검증과 브랜치 보호 적용도 완료로 간주하지 않는다.
- 상위 platform_core submodule 포인터는 이번 작업에서 변경하지 않는다.
- 최초 원격 PR 검증 성공: [run 44870551061](https://github.com/JaewonYe/map_service/actions/runs/44870551061), head `55bf43827d0c14ab0fb652a939e43abbfca218c2`. 앱 71개·도구 5개·브라우저 30개 통과, 실패/스킵 0. 최종 SHA 및 main push 증거는 [이슈 #5](https://github.com/JaewonYe/map_service/issues/5) 완료 기록을 확인한다.


## 이슈 #7 합성 변환 회귀 CI

- 기존 workflow에 독립 `Conversion regression` job을 추가한다. production DEM/PBF 이미지에서 기존 변환 테스트 3개+4개와 Python 집계 도구 검사 5개를 실행한다. 기존 Node·브라우저 검사는 유지한다.
- 기반 Debian multi-platform image digest를 고정하고 실제 Python/GDAL/NumPy/Shapely·패키지 버전과 이미지 ID를 기록한다. APT 저장소/전이 의존성/빌드 frontend는 가변이므로 완전 고정 환경으로 표현하지 않는다.
- `/usr/bin/python3`, 읽기 전용 저장소/컨테이너, 비루트, 네트워크 없는 실행과 `/tmp` 합성 데이터만 사용한다. 0개/전체 스킵/import 오류를 거부하고 실패 코드와 소규모 진단 로그를 보존한다.
- 실제 run/event/SHA/테스트 수는 [검증 기록](docs/VALIDATION.md)과 [이슈 #7](https://github.com/JaewonYe/map_service/issues/7) 완료 댓글을 확인한다. 필수 검사 등록은 관리자 작업이며 실데이터·OS 실기·인증/운영·공통 계약 검증과 상위 gitlink 갱신은 별도 범위다.
- 수정 후 원격 PR 검증: [run 44874199867](https://github.com/JaewonYe/map_service/actions/runs/44874199867), head `fd3a1beed3cadb3cfdde50e39ad8c3b81fa4aaae`, 세 job 성공. DEM 3/PBF 4/Python 도구 5, 기존 앱 71/Node 도구 5/브라우저 30 통과. 최초 guard 실패와 수정 내역은 검증 문서에 기록했으며 최종 SHA/main push 증거는 이슈 #7 완료 댓글에 남긴다.


## 이슈 #9 시설 목록·검색·분류

- 기존 `GET /api/buildings` 응답을 클라이언트에서 필터링한다. 시설명은 trim 후 부분 일치·영문 대소문자 무시, 분류 기본은 전체이며 두 조건을 함께 적용한다.
- 결과 수·목록·마커를 동일 조건으로 표시하고 목록 선택 시 현재 줌을 유지해 최신 좌표/상세를 조회한다. 패널은 접기/펼치기와 내부 스크롤을 지원하며 선택 시 접힌다.
- 초기 로딩·실제 등록 0개·검색 결과 0개·오류/재시도를 구분한다. 변경·재조회 후 조건을 유지하고 삭제/필터 이탈 선택 및 지연 응답을 처리한다.
- 새 서버 검색/페이지 API, ID·분류·스키마·저장 형식·모듈 책임 변경과 예약 연계는 없다. 상위 gitlink는 별도 통합 범위다.
- 검증에 검색·지연 목록 병합 단위 4개와 브라우저 7개를 추가한다. 실제 실행 수·최종 SHA/run URL은 검증 문서와 이슈 #9 완료 댓글에 기록한다.


## 이슈 #11 시설 경계 영구 저장

- 시설 상세에서 단일 다각형 경계 추가·수정·제거를 제공한다. 지도 점 선택 수명은 측정 도구와 공유하고 계산/교차 판정은 기존 lib/map-measure를 재사용한다. 미저장 초안·임시 측정·저장 경계의 상태와 레이어는 분리한다.
- 기존 `/api/buildings`, 내부 UUID/version, JSON 파일 저장을 유지하면서 선택적 GeoJSON `boundary`를 추가한다. EPSG:4326의 [경도,위도], 닫힌 단일 ring, 7자리 소수·반시계 방향·최소 좌표 시작점으로 정규화한다. 3–128 정점, 본문 32KiB, 파일 64KiB 한도를 유지한다.
- 경계 없는 파일은 그대로 로드하며 전체 파일을 재작성하지 않는다. PUT 생략은 기존 경계 유지, 명시적 null은 제거다. 구형 소비자는 새 응답 필드를 무시해야 하며 엄격한 스키마 소비자는 별도 갱신이 필요하다. 변경안은 구현 전 [이슈 댓글](https://github.com/JaewonYe/map_service/issues/11#issuecomment-7059051807)에 기록했다.
- 검색·분류·목록·마커·경계·상세를 연결한다. 편집은 시설/버전에 고정하고 저장 중 대상 변경을 막는다. 실패/충돌은 초안과 저장 도형을 보존하며 재시도·재조회 안내를 제공한다. 취소/Esc/다른 시설 선택은 초안을 저장하지 않는다.
- 서버에서 형식·숫자/범위·중복/퇴화·면적·교차/접촉·정점 수·경도 폭을 검증한다. 날짜변경선·구멍·여러 영역·공유 경계·예약 규칙은 제외한다. 관리용 경계이며 법적 측량 정확도를 보증하지 않는다.
- 공통 OpenAPI·모듈 책임·타 DB·상위 gitlink는 변경하지 않는다. 검증 결과와 최종 SHA·PR/CI 증거는 [VALIDATION](docs/VALIDATION.md)과 [이슈 #11](https://github.com/JaewonYe/map_service/issues/11) 완료 댓글에 기록한다. 실데이터·OS 실기·인증/운영·플랫폼 공통 계약은 미검증이다.

## 공통 디자인 스킬 설치

UI UX Pro Max와 Web Design Guidelines를 `.agents/skills/`에 설치하고 AGENTS.md에 UI 작업 시 사용 절차를 연결했다. 공통 기준은 [MASTER.md](design-system/platform/MASTER.md)와 tokens.css이며 upstream 커밋/파일 해시는 skills.lock.json에 기록한다. 실제 화면을 일괄 변경하지 않았고 기존 업무·API·기술 승인 상태를 유지한다.

## Light/Dark 시안 구현 스킬

사용자 요청에 따라 프로젝트 전용 `platform-ui-design`과 두 테마 토큰·시안 구현 규칙·로컬 참고 화면을 공통 버전 2.0.0으로 연결한다. 모듈 UI 구현은 같은 기준을 참조하며 실제 앱 리디자인/테마 전환 완료 여부는 별도 구현·검증으로 보고한다.


## 이슈 #13 전체 지도 UI·테마

- 이슈 #11의 기능을 유지하면서 화면 전체를 공통 Light/Dark 시안에 맞춰 재구성한다. 56px 헤더 + 320px 좌측 시설 찾기 + 나머지 지도, 상단 주요/보조 도구, 하단 좌표, 작은 선택 카드와 내부 스크롤 편집 패널을 제공한다. 모바일은 접는 drawer와 줌을 가리지 않는 선택/경계 영역을 사용한다.
- 앱 배경/헤더/목록/폼/메뉴/측정/정보/Leaflet 컨트롤·tooltip과 상태를 같은 의미 토큰으로 전환한다. 기존 누적 흰색/보라 primary override를 정리하며 원본 지도/DEM 데이터 색상은 보존한다.
- Light/Dark/System 선택을 헤더/네이티브 편집창에 제공한다. 첫 paint 전 저장 선호 적용, platform.theme 저장·오류/잘못된 값 fallback, OS 추종·동일 탭/다른 탭 동기화, theme 변경 중 카메라/선택/입력/초안 보존을 검증한다.
- 공통 skill/lock/themes/reference를 수정하거나 새 API/데이터/예약/로그인을 도입하지 않는다. API·UUID·boundary·저장 방식과 오프라인 제한은 유지한다. ResizeObserver는 실제 지도 크기 변경만 처리하고 카메라를 보존한다.
- 실제 변경 전/참고/후 캡처와 기준별 일치/의도적 차이는 [UI_REDESIGN_REVIEW](docs/UI_REDESIGN_REVIEW.md)에 남긴다. 이미지와 manifest를 저장소에 보관하여 PR에서 직접 조회할 수 있다. 합성 fixture이며 실데이터/OS 실기/접근성 인증은 미검증이다.
- 테마/전체 배치 브라우저 검사 7개를 추가해 기존 43 → 50개, 기존 5개 프로젝트와 Node 앱 83/도구 5·변환 7/도구 5를 유지한다. 최종 SHA·PR/main CI 증거는 검증 문서 및 이슈 #13 완료 댓글에 기록한다. 검증된 모듈 SHA를 상위 별도 gitlink 통합용으로 보고하며 포인터는 직접 바꾸지 않는다.

- #13 최초 PR CI는 통과했으나 main에서 반응형 목록 초기화 경합 1건이 발생해 보완했다. 데스크톱/모바일 상태를 분리하고 breakpoint를 useSyncExternalStore로 구독하며 최종 보완 SHA의 전체 PR/main 증거를 따로 기록한다.


## 이슈 #16 대표 지점 이동·경계 직접 편집

- 기존 숫자 좌표 수정·시설 삭제 API/확인 흐름을 유지한다. 새 기능은 상세에서 명시적으로 시작하는 대표 지점 지도 드래그/클릭 이동, 경계 정점 드래그·변 중간 삽입·선택 삭제·직전 조작 되돌리기다. 기존 삭제를 신규 기능으로 보고하지 않는다.
- 이동/경계 초안은 편집 인스턴스의 시설/버전에 고정한다. 저장 전 원본은 유지하며 취소/Esc/저장 전 대상 전환 시 초안을 버린다. 실패/충돌 시 입력을 보존하고 지연 저장 중 대상/초안 변경·중복 저장을 차단한다. 대표 지점 이동은 boundary를 생략한 기존 PUT으로 경계와 다른 필드를 보존한다.
- Leaflet 마커 인스턴스를 드래그 중 유지해 미리보기와 계산을 갱신한다. 정점/삽입 핸들은 모드 안에서만 표시하고 클릭 전파·중복 추가를 막는다. 선택 정점 삭제는 최소 3개/삽입 최대 128개, 기존 좌표 검증과 정규화는 유지한다. 최근 100회 UI 이력/선택 정보는 저장 스키마에 추가하지 않는다.
- 숫자 좌표/선택 상자/버튼 대안, 모바일 터치·키보드·테마·크기 전환을 지원한다. #13의 56px/320px 골격·drawer·스크롤과 항상 보이는 저장/취소를 재사용한다. 시설 삭제 확인은 레코드·대표 마커·경계를 함께 지운다고 안내하며 기존 DELETE/If-Match를 호출한다.
- API·UUID·boundary 스키마·파일 저장·타 DB·예약 규칙·공통 디자인/lock·상위 gitlink는 변경하지 않는다. 단위/API·실제 저장소 실패·브라우저 회귀 및 [시각 검토](docs/DIRECT_EDIT_REVIEW.md)를 별도로 기록하며 최종 SHA/PR/main 증거는 이슈 완료 댓글로 보고한다. 실제 사용자 데이터/OS 실기/법적 측량 정확도는 미검증이다.

## 이슈 #18 오프라인 OSM 일반 지도 편집

- 지도 정보의 명시적 모드에서 prepared SQLite 객체를 viewport/줌별로 선택·조회한다. Point/도로 LineString/구멍 없는 단일 건물 Polygon의 이름·닫힌 목록 표시 분류·형상을 수정하고 새 객체 추가/로컬 삭제/취소/원본 복원/충돌 재적용을 제공한다. 시설/측정 상태와 저장 대상은 분리하며 기존 지도/테마 골격을 유지한다.
- importer schema2는 실제 node/way/relation source key와 canonical fingerprint를 보존한다. features.id 순번으로 재연결하지 않는다. schema1 렌더/조회는 유지하고 편집에는 메뉴 7/--force 명시 재준비를 안내한다. 실제 관계/MultiPolygon/해안선·파생·분할·대형 객체는 평탄화하지 않고 읽기 전용이다.
- 원본 PBF/base SQLite와 시설 UUID/boundary/파일을 보존하며 별도 OSM_EDITS_DIR의 version1 edits.json에 add/update/hide를 원자 저장한다. 글로벌 If-Match revision/dataset/source fingerprint 검사, 단일 프로세스 경로별 queue, 쓰기 실패/손상 보존을 제공한다. Compose에는 별도 영속 쓰기 bind mount를 연결하며 다중 서버/인증 정책은 확정하지 않는다.
- 원본 key+fingerprint 일치 수정만 base에서 제외/합성해 실제 PNG에 반영한다. source 변경/삭제·지원 불가는 conflict로 기록을 보존하고 최신 원본을 표시한다. 메모리/pending/base/store revision, ETag/no-cache, Leaflet URL 갱신으로 이전 위치·라벨 잔상을 처리한다. 다른 탭의 변경은 재조회/지도 이동/새로고침으로 가져온다.
- 새 모듈 내부 /api/osm/objects 목록/상세/수정 인터페이스, 좌표·geometry·요청/응답/저장 한도와 호환성은 [OSM_EDITING](docs/OSM_EDITING.md)에 기록한다. 구현 전 변경안은 이슈 댓글에 남겼다. 공통 OpenAPI·타 DB·상위 gitlink·공개 OSM 전송은 변경하지 않는다.
- Node 앱97+도구5, 브라우저67(기존59+신규8), 변환DEM3/PBF7+Python도구5, 디자인 무결성과 실제 합성 PBF 앱20PNG를 검증한다. 실제 실행/최초 실패 보완/서버 재시작/원본 해시/최종 SHA PR·main CI 증거는 [VALIDATION](docs/VALIDATION.md#이슈-18-오프라인-osm-일반-지도-편집)과 이슈 완료 댓글에 기록한다. 실데이터·OS 실기·다중 서버/인증 운영·법적 측량 정확도는 미검증이다.

## 이슈 #20 지도 다운로드·관리 (실제 제공처 검증 대기)

- `/downloads`에서 로컬 Natural Earth 국가 개요/기존 지도·사각형 두 점·숫자 좌표·시설 bbox로 범위와 원본/상세도를 선택한다. 실제 지원 LOD, 선택 면적/타일 후보/지역 원본 수신량·미확정 용량·서버 여유를 구분한다. Light/Dark/System과 모바일/키보드 대안을 유지한다.
- 사용자 확인 방법에 따라 World Imagery for Export POST/EPSG:3857/TPK level15–17, OpenTopography COP30 GTiff/API Key를 태안 기본값으로 연결한다. Geofabrik 지역 전체 PBF→complete_ways bbox→기존 schema2 importer, AWS GLO-30 대안→GDAL clip/기존 DEM 준비를 지원한다. 원본 해상도·표시 LOD·권한/이전 조건은 별개다.
- 별도 Docker worker가 영속 요청/상태, 공식 호스트 스트림, 체크섬·형식·한도·취소/실패/재시작, immutable package와 revision 원자 등록을 처리한다. web에 Docker socket/임의 명령/인증값을 전달하지 않는다. 기존 source read-only 및 준비 도구 network:none을 유지한다.
- 원본은 data/imagery·data/dem, 작업/패키지/ZIP/활성 레지스트리는 data/downloads에 분리한다. 같은 요청의 원본은 SHA/형식 검사 후 재사용하며 refresh로 새 수신한다. 시설/경계·기존 PBF/TPK/DEM/catalog·OSM 로컬 수정은 보존한다. managed OSM의 안정적 source key/fingerprint로 #18 수정/충돌 흐름을 유지한다.
- version1 내부 downloads API·상태/manifest·배포·복원은 [DOWNLOAD_MANAGER](docs/DOWNLOAD_MANAGER.md), 제공처/계정 조건은 [DOWNLOAD_PROVIDER_LICENSES](docs/DOWNLOAD_PROVIDER_LICENSES.md), 4×5 화면과 격리 실제 앱 검토는 [DOWNLOAD_UI_REVIEW](docs/DOWNLOAD_UI_REVIEW.md)에 기록한다. 공통 OpenAPI·모듈 책임·상위 gitlink는 변경하지 않는다.
- 합성 로컬 HTTP→production adapters/GDAL/osmium→ZIP→네트워크 금지 격리 복원/앱 타일·42.5m 검증을 공식 원본 검증과 분리한다. 네 공식 호스트 CONNECT403, 현재 worker 인증값 없음, ArcGIS/Next.js·Leaflet 사용/이전 권한 미확인으로 실제 원본 조건은 미완료이며 #20을 닫지 않는다. 기존 네트워크 허용 목록/프리셋은 유지한다. 로컬 Windows/Ubuntu CLI를 제공하며 두 OS 실기·실제 제공처 다운로드·공개 운영/다중 서버는 미검증이다.

- #20 사용자 PC 후속 로그에서 OpenTopography COP30 7,898바이트 수신→GDAL 준비→ZIP 생성→등록 완료(partial)가 보고됐다(ZIP ID82e660b9-1d3b-4e8f-98c7-2da97ac7f3ff). 사용자 제공 로그로 기록하며 직접 원본 메타데이터/앱 고도값을 검토한 증거와 구분한다. 위성은 worker 인증 설정 단계에서 막혔고 사용자 확인 결과 현재 PowerShell ARCGIS_TOKEN이 비어 있었다.
- 인증 전달 보완: Compose의 기본 *_FILE 경로를 비우고 명시 파일+마운트만 사용한다. 기존 환경변수 우선순위를 문서와 일치시키고, CLI는 인증 설정 유무만 출력한다. ArcGIS 누락은 네트워크 전 안내하며 기존 정상 원본/고도 ZIP/시설/OSM 수정은 보존한다. 회귀 worker18, Node 앱105+도구5, 실제 network:none Compose4경우와 최종 PR/main CI 증거는 이슈 #20 후속 댓글에 기록한다.

- #20 추가 인증 진단에서 사용자 PC의 community/self는 signedIn=true/organizationMember=true이나 World Imagery 직접 요청은 POST 및 Authorization+Referer GET 모두498이었다. 전역 토큰 만료/개인 공개계정/Docker만의 오류로 단정하지 않는다. 공식 조직 URL/client=referer 발급과 일치하는 ARCGIS_REFERER 전달을 지원하고, read-only 조직 조회 CLI는 공식 URL만 반환한다. 비밀번호는 사용자 PC의 수동 공식 HTTPS POST에만 사용하며 실제 export 성공은 별도 검증을 유지한다.

- #20 조직 토큰의 사용자 PC 검사에서 tokenIssued=True/exportTilesAllowed=True가 보고됐고, 이후 실제 CLI는 export 결과 URL 검사에서 실패해 고도 재사용/등록만 성공했다(partial, ZIP ID90509ec5-93f7-4ba2-a1e6-08802b1ccbe7). 공식 결과가 디렉터리 URL일 수 있는데 직접 .tpk만 허용한 누락을 보완했다. 같은 공식 호스트/결과 디렉터리의 제한된 JSON/HTML 목록에서 단일 TPK를 선택하고 기존 형식·LOD·CRC·해시 검사를 유지한다. worker24/Compose4와 PR/main CI 증거는 이슈 댓글에 기록한다. 실제 사용자 결과의 URL/파일 형식은 수집하지 않았으므로 TPKX였다고 단정하지 않으며 공식 TPK 수신·앱 표시는 아직 확인이 필요하다.

- #20 다음 사용자 PC 로그(f09532c0-9ab3-4544-b45d-98bfe74c8abe)에서는 공식 export/결과 디렉터리 처리와 TPK1,567,737바이트 전량 수신이 성공했으나 V1 offset 검사에서 실패했다. 독립 공개 V1 샘플의 offset60/length0를 분석해 V2의64바이트 최소 위치를 V1에도 적용한 누락을 재현했다. V1 header60/length4와 앱 리더의 최소 위치를 일치시키고 CC0 첫 레코드60·비영 빈 레코드·손상/등록 충돌 회귀를 추가했다(worker28, Node앱109+도구5). 마지막 등록 revision 충돌은 준비 ZIP/패키지를 보존하며 기존 active 상태의 자동 덮어쓰기를 막는 보호다. 최신 상태 조회 후 명시 등록을 안내하고 우회하지 않는다. 사용자 실제 원본 검사·앱 표시는 후속 확인이 필요해 OPEN을 유지한다.

- #20 V1 보완 PR #25의 PR CI는 성공했지만 main Map45168085326은 DEM3/PBF7 통과 뒤 stdout/stderr 병합으로 DEM result marker가 진행 줄에 붙어 집계 실패했다. unittest 진행/결과·변환 traceback을 stdout으로 통일하고 parser의 엄격한 줄 시작/실패 거부 기준은 유지한다. 변환 보고 도구6과 로컬 실제 변환10/worker28이 통과했으며 후속 최종 SHA의 PR/main 전체 검증과 최초 실패 run은 이슈 댓글에 함께 보고한다.

- #20 사용자 PC에서 Docker 미기동으로 f5073c94-8d64-40f9-9323-966c0235ef27 요청만 저장된 뒤 새 abd30b49-c3ff-4e15-a121-edbb1ff019a6 작업이 생성됐다. Docker 복구 후 V1 offset을 지나 LOD 검사에서 실패했고 등록도 충돌했다. Python이 config-only LOD20–24까지 실제 타일의19 한도로 거부하는 차이를 보완해 metadata는 앱 리더와 같은0–24/정상resolution, 실제bundle은0–19/요청LOD실타일을 검사한다. CLI는 pending/running이 있으면 새 요청을 추가하지 않고 --resume으로 단일 미완료 태안 요청을 ID/내용/revision 변경 없이 실행·모니터한다. 여러 작업/다른 작업/종료 작업과 옵션 재정의는 거부한다. 로컬 worker29·Node앱111+도구5=116·Compose4가 통과했으며 최종 PR/main 증거는 이슈 댓글에 기록한다. 사용자 실제 원본의 LOD 값과 충돌 상대 작업은 미수집이므로 코드 차이와 실제 파일 판정을 구분한다.

- #20 최종 c76a111 보완 후 사용자 PC의 태안 작업6f79d3ac-65a3-4c3d-ad9d-b6d6c51fda18은 위성1,567,737바이트 수신·TPK검사, 고도 재사용/준비, 해시·ZIP·등록 모두completed로 보고됐다. web은127.0.0.1:8085→container3001로 정상 실행됐으나 실제 지도 표시/고도값 직접 검증과 구분한다. 국가0–13 요청의10,000타일 오류는 내부 위성/고도 공통 제한이었으며, 대한민국 기본 사각형의45,048후보를 지원하도록 위성 앱 상한150,000/실제서비스 한도 중 작은 값으로 분리했다. DEM10,000/기존 byte·시간·디스크/CAS 한도는 유지한다. Node앱112+도구5=117/worker30 및 PR/main CI 증거는 #20 댓글에 기록하며 국가 공식 원본 다운로드는 아직 미검증이다.

- #20 전국 개요와 지역 상세 다운로드를 함께 표시하는 사용자 요구에 따라 내부 active.json의 version1/revision/layers.satellite를 유지하고 satellitePackages(최대32개)를 추가한다. 기존 단일 ID는 호환해서 읽으며 신규/명시 재등록/ZIP 복원은 중복 없이 추가한다. 각 패키지 카탈로그의 경로·권한을 유지하고 native 줌 우선/빈 타일 fallback/같은 해상도의 최근 등록 우선으로 합성한다. 과거 교체된 패키지는 명시 재등록하며 임의 과거 원본은 자동 채택하지 않는다. ZIP은 여전히 패키지 단위, reset은 선택만 해제하고 파일/시설/OSM 수정 보존, CAS도 유지한다. web/worker 동시 업그레이드가 필요하다. 사용자 조회로 전국 작업8c9a5c80-2348-4a34-a880-7c910b3ac773의 completed/registered=true와 주 ID 일치는 확인됐지만 실제 앱 합성·전국 coverage 직접 검증과 구분한다. 공통 API/상위 gitlink는 변경하지 않는다. 검증·PR/main 증거는 #20 댓글과 VALIDATION.md에 기록한다.

- #20 후속 사용자 요청으로 웹 지도 삭제/초기화/백업 복원을 추가한다. 선택 패키지와 연결된 종료 기록 삭제, 다운로드/원본/적용 초기화 및 선택적 수동 지도 정리는 worker 단일 writer·동결 표시·리더 종료 확인·revision/CAS·같은 파일시스템 백업 이동/저널로 처리한다. 시설/경계/OSM 수정·인증·공통 API/상위 gitlink는 유지한다. 복원은 새 파일/적용 변경·누락·활성 패키지 해시/형식을 검사하고, 취소한 다운로드를 자동 재실행하지 않는다. worker에만 지도 전용 쓰기 마운트4개를 추가하므로 web/worker 동시 업데이트와 기존 HOST_DIR 유지가 필요하다. 백업은 공간을 사용하며 영구 삭제/자동 보관 정책은 미구현이다. 외부 CLI/준비 도구는 종료 후 정리하며 다중 web writer는 지원하지 않는다. 공식 원본·실제 사용자 Windows 자료 검증과 기능 합성 시험은 구분한다. 최종 CI/화면/HTTP+worker 증거는 VALIDATION과 #20 댓글에 기록한다.
