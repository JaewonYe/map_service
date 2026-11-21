# 이슈 #1 검증 기록

2026-11-14 Linux 클라우드, 코드 기준 `1731d34054f511aef87372e04611e57f9aaf575f`, Node.js v24.22.1.
이번 변경은 문서만 추가·수정하며 아래 결과는 기존 구현의 재검증이다.

| 명령 | 결과 |
| --- | --- |
| `npm ci --cache /workspace/work/npm-cache` | 53개 패키지 설치 성공 |
| `npm run typecheck` | 통과 |
| `npm run test:tiles` | 22 통과, 실패/스킵 0 |
| `npm run test:buildings` | 7 통과, 실패/스킵 0 |
| `npm run test:layers` | 6 통과, 실패/스킵 0 |
| `npm run test:osm` | 4 통과, 실패/스킵 0 |
| `npm run test:measure` | 9 통과, 실패/스킵 0 |
| `npm run test:launcher` | 22 통과, 실패/스킵 0 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test` | 29 통과, 실패/스킵 0. fixture 생성·`npm run build`·5개 서버 준비·브라우저 검증·종료 포함 |
| `/usr/bin/python3 -m unittest discover -s tests -p elevation_prepare_test.py` | GDAL 합성 DEM 변환 3개 통과 |
| `docker compose --profile tools build prepare-osm` | 기존 Dockerfile로 도구 이미지 빌드 성공 |
| `docker compose --profile tools run --rm --entrypoint python3 -v ./tests:/tests:ro -e OSM_PREPARE_SCRIPT=/tools/prepare.py prepare-osm -m unittest discover -s /tests -p osm_prepare_test.py` | 합성 PBF 변환·원본 보존·재사용·실패 처리 4개 통과 |
| 문서 로컬 링크 검사·`git diff --check` | 통과 |

Node 테스트 합계 70개, 브라우저 29개다. 합성 V1/V2 TPK와 공식 Apache-2.0 Esri 형식 샘플, 합성 고도·OSM·건물 데이터를 사용했다. 사용자 데이터·키는 사용하거나 커밋하지 않았다.

## 환경 문제와 처리

- 최초 `npm ci`는 기본 `/home/agent/.npm`이 읽기 전용이라 EROFS. 작업 공간 캐시를 명시해 성공했다. 네트워크 오류가 아니다.
- `npx playwright install chromium`은 기본 사용자 캐시 폴더를 만들 수 없어 실패했다. 이미 설치된 `/usr/bin/chromium`으로 전체 브라우저 검증을 완료했다.
- 기본 Python의 전체 unittest 탐색은 osgeo/shapely import 오류 2건으로 실행 실패했다. 시스템 Python의 GDAL로 고도 테스트 3개를 별도 실행했고, 기존 Dockerfile로 빌드한 OSM 도구에서 나머지 4개를 통과했다. 이 최초 오류를 테스트 성공이나 스킵으로 계산하지 않는다.
- GitHub 연결 도구의 문서/이슈 조회 및 git fetch·작업 브랜치 push는 성공했다. `gh auth status`는 환경 GH_TOKEN 인증 실패를 보고했다. CLI 인증 문제와 네트워크 차단을 구분한다. 네트워크 허용 목록은 변경하지 않았다.

## 검증 한계

실제 사용자 TPK·DEM·대한민국 전체 PBF가 제공되지 않아 해당 데이터의 형식·정확도·성능·라이선스 검증은 미실행이다. Windows 11/Ubuntu 24.04 실기 검증과 공개 배포·인증·다중 인스턴스 운영 검증도 미실행이다. 이 결과를 실제 플랫폼 계약 준수나 운영 준비 완료로 해석하지 않는다.

## 이슈 #3 시설·건물 관리 구현 검증

2026-11-14, 동일 Linux 클라우드·Node.js v24.22.1에서 실행했다.

- `npm run test:buildings`: 8개 통과, 실패/스킵 0. 기존 건물과 시험장·주차장·야외 공간이 별도 사용자 ID 입력 없이 저장·재조회되는지 추가 확인.
- `npm run test:measure`: 9개 통과, 실패/스킵 0.
- `npm run typecheck`: 통과.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test`: 최종 30개 통과, 실패/스킵 0. production build와 기존 지도·측정·고도·OSM 검증을 포함한다.
- 모바일에서 추가 버튼·위치 선택·버튼/Esc 취소·저장·새로고침 후 마커 조회·읽기 전용 상세 화면을 확인했다. 기존 등록·수정·삭제·저장 오류·지연 응답·문자열 안전 표시 테스트도 통과했다.
- 최초 브라우저 실행은 28개 통과/2개 실패였다. 신규 테스트의 분류 선택 locator를 수정하고, 전체 폭 상태 안내가 지도 클릭을 가로막는 문제를 수정한 후 위 전체 30개를 재실행해 통과했다.
- 문서 링크·`git diff --check` 확인. 실제 사용자 데이터와 OS 실기 검증 범위는 앞 절의 미실행 상태를 유지한다.

## 이슈 #5 GitHub Actions 자동화

2026-11-21. `.github/workflows/map-regression.yml`은 PR과 main push에서 실행한다. job 이름은 `Node regression and typecheck`, `Playwright regression`이다. Node.js 24와 잠금 파일 설치를 사용하고 두 job은 별도 GitHub runner에서 실행한다.

### 실행·증거 확인 방법

- Node job: `npm ci`, `npm run typecheck`, `npm run ci:node`. 기존 6개 명령의 앱 회귀 수는 tiles 22/buildings 8/layers 6/osm 4/measure 9/launcher 22 = 71개다. 추가 도구 검사는 5개이며 기존 앱 테스트 수는 변경하지 않았다.
- 브라우저 job: `npm ci`, `npx playwright install --with-deps chromium`, `npm test`. 기존 fixture 생성과 build/서버 생명주기를 재사용한다. single 4/multi 15/osm 2/layers 3/buildings 6 = 30개다. assert/스킵/timeout/worker 수를 완화하지 않았다.
- `scripts/ci/summary.mjs`는 Step summary에 결과를 기록하며 미실행·0개·전체 스킵을 거부한다. Node 실행기는 명령 실패 코드를 보존하면서 나머지 명령 결과도 수집한다. 도구 검사는 의도적인 자식 명령 실패(종료 코드 7), 실제 assertion 실패, 빈 실행/전체 스킵, 브라우저 프로젝트 누락을 검증한다.
- `browser-diagnostics-<run_id>-<attempt>` artifact: HTML/JSON 보고서, build/서버/테스트 로그, 실패 시 trace·스크린샷/error context. Node 실패 artifact `node-diagnostics-<run_id>-<attempt>`: 명령별 로그와 집계 JSON. 보관 7일. 파일 생성 전 setup 실패는 Actions step 로그를 사용한다.
- 이슈 #5 시점에는 Python/GDAL/Docker 합성 변환 7개가 CI 미포함이었다(아래 이슈 #7 확장 참조). 실제 사용자 TPK/DEM/PBF, Windows/Ubuntu 실기, 인증/운영과 승인된 플랫폼 계약 검증은 미실행이다. GitHub runner의 Ubuntu 테스트를 Ubuntu 실기 검증으로 표현하지 않는다.
- 관리자는 두 job을 실제 필수 검사로 등록하고 실패 PR 차단을 확인해야 한다. 브랜치 보호/Ruleset은 이 작업에서 적용하지 않았다.

### 검증 진행 기록

로컬: 작업 공간 npm 캐시로 잠금 파일 설치, typecheck, CI 모드 브라우저 30개와 보고서 집계 통과. 도구 자체 검사에서 자식 Node 테스트가 부모 runner 문맥/중복 reporter 옵션을 상속하는 문제를 발견해 독립 실행하도록 수정했다. 원격 결과는 실제 실행 후 아래 또는 이슈 완료 댓글에 run URL·head SHA·이벤트와 함께 기록한다. 이 문서만으로 아직 실행되지 않은 원격 검증을 성공으로 간주하지 않는다.

### 실제 원격 PR 검증

- 이벤트: `pull_request`, 최초 실행 1회 성공(원격 CI 실패/재실행 없음).
- head SHA: `55bf43827d0c14ab0fb652a939e43abbfca218c2`.
- Run: https://github.com/JaewonYe/map_service/actions/runs/44870551061
- PR: https://github.com/JaewonYe/map_service/pull/6
- 두 job 모두 새 Ubuntu 24.04 GitHub runner에서 설치와 검사를 성공했다. Node.js 24의 fresh checkout에서 build 전 typecheck가 성공하여 별도 중복 build가 필요하지 않았다.
- 앱 회귀 71개와 도구 검사 5개 통과, 실패/취소/스킵/todo 0. Playwright 30개 통과, 실패/flaky/스킵 0. 기존 다섯 프로젝트 전부 실행됐다.
- 브라우저 artifact `browser-diagnostics-44870551061-1`(ID `14693518351`)의 업로드 성공 및 7일 만료를 확인했다. 성공 실행이므로 Node 실패 artifact는 생성되지 않았다. 실패 trace 보존은 설정 및 집계 도구의 실패 경로 검증 범위이며 실제 원격 브라우저 실패 artifact를 생성했다고 보고하지 않는다.
- 이 실행은 위 SHA의 PR 이벤트 증거다. 이후 문서 변경 SHA와 main push 이벤트의 run URL·결과는 [이슈 #5](https://github.com/JaewonYe/map_service/issues/5) 완료 댓글에 별도로 기록한다. 최초 실행의 성공을 다른 SHA나 발생하지 않은 이벤트에 전용하지 않는다.


## 이슈 #7 합성 DEM·PBF 변환 CI

2026-11-21. 기존 workflow에 `Conversion regression` 독립 job을 추가했다. 기존 Node/브라우저 job과 테스트를 유지하며 기존 production 변환 테스트 DEM 3개와 PBF 4개의 assertion은 변경하지 않았다. 별도 Python CI 집계/종료 코드 검사는 5개다(앱 변환 테스트 수와 구분).

### 실행 환경과 재현

README의 합성 변환 CI 절차대로 두 production Dockerfile을 `map-service-elevation-tools:ci`, `map-service-osm-tools:ci`로 빌드하고 `bash scripts/ci/conversion-tests.sh`, `python3 scripts/ci/conversion.py summary`를 실행한다. 시스템 Python/GDAL을 호스트에 설치할 필요는 없으며 host summary는 표준 라이브러리만 사용한다.

- 기반 multi-platform digest: `sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc`; linux/amd64 manifest: `sha256:c67e92c8099ba22853ab4cfda7cfb494d253d6012ca82dee98ba8976772af018`.
- 두 Dockerfile의 `COPY --chmod=0644`로 production script/schema의 읽기 권한을 보장한다. 로컬 최초 비루트 실행에서 읽기 권한 문제로 preflight가 실패(DEM/PBF 실행 0개)했고, 명시적 권한 수정·재빌드 후 3개/4개가 통과했다. 이를 테스트 실행 성공이나 스킵으로 계산하지 않았다.
- 이미지의 `/usr/bin/python3`와 GDAL·NumPy·OSM driver(및 Shapely)를 실제 import/확인한다. DEM은 읽기 전용 `/workspace` 저장소 상대 경로의 production script, OSM은 `/tools/prepare.py` override를 사용한다. baked script/schema와 소스 SHA256 일치를 확인한다.
- 컨테이너 rootfs/저장소는 읽기 전용, 실행 사용자는 host UID/GID, network=none, 임시 데이터는 `/tmp` tmpfs다. 사용자 data 마운트·외부 지도 다운로드는 없다. 기존 해시 불변·원자적 게시/실패 보존·재사용·음수/0/NoData 검증을 유지한다.
- APT 저장소/패키지와 전이 의존성, Dockerfile frontend/runner는 가변이다. 이미지 digest만으로 완전 고정 환경이라고 표현하지 않는다. 갱신 절차와 보안 검증 유지 원칙은 README에 기록했다.

### 로컬 검증

- 실제 production 이미지에서 DEM 3개/PBF 4개 모두 통과, 실패/오류/스킵 0. Python 집계 도구 검사 5개 통과. import 오류·0개·전체 스킵·예상 수 불일치는 실패로 처리한다. shell 검사에서는 첫 하위 명령의 종료 코드 7 보존과 두 번째 suite 시도를 확인했다.
- 실행 버전: Python 3.11.2, GDAL 3.6.2, NumPy 1.24.2, Shapely 1.8.5(OSM). Debian 패키지: python3=3.11.2-1+b1, python3-gdal/libgdal32=3.6.2+dfsg-1+b2, python3-numpy=1:1.24.2-1+deb12u1, python3-shapely=1.8.5-2+b1. 원격 버전은 각 실행 로그에서 별도로 확인한다.
- 로컬 built image ID: DEM `sha256:60c0bde27f16ef9a8f033bfe2696153d37ea284564ffcc360ce9561076af7519`, OSM `sha256:8ecec952556164c135d157a04cfca37fb2693638ef95ce5a14d790432b70c881`. 빌드별 ID이며 고정된 배포 이미지 digest로 간주하지 않는다.
- `conversion-diagnostics-<run_id>-<attempt>` artifact에 build 로그, `images.log`, `dem.log`, `osm.log`만 7일 보관한다. 각 로그의 machine result와 Step summary에 실제 실행 수·실패·오류·스킵·미실행을 구분한다. build/setup 실패로 결과가 없으면 미실행/unknown으로 보고하고 summary도 실패한다.
- 필수 검사 `Conversion regression` 등록과 병합 차단 검증은 관리자 후속 작업이다. 실제 사용자 지도 데이터, Windows/Ubuntu 실기, 인증/운영, 승인된 플랫폼 공통 계약은 계속 미검증이다. 상위 gitlink는 변경하지 않는다.

### 원격 실행 기록

실제 run/event/SHA/결과는 원격 실행 후 이 절과 이슈 #7 완료 댓글에 기록한다. 로컬 통과를 원격 CI 성공으로 간주하지 않는다.


최초 PR run [44874055430](https://github.com/JaewonYe/map_service/actions/runs/44874055430), head `08428451a6d7073a6e0068a838eb1618d62e3c23`에서 conversion 도구 검사의 임시 폴더 탐색이 실패했다. runner Python의 바깥 unittest discover가 default loader에 남긴 top-level 경로를 재사용한 원인이며 fresh `TestLoader`로 격리했다. 이 실행에서는 DEM/PBF 변환 7개가 미실행이며, 성공으로 계산하지 않는다. 초기 실패는 Actions job 로그에 남아 있고, 초기 guard 단계부터 `reporting-gates.log` artifact를 보존하도록 보완했다. 수정 SHA의 재실행 결과는 실제 완료 후 기록한다.

### 수정 후 실제 원격 PR 검증

- Run: https://github.com/JaewonYe/map_service/actions/runs/44874199867
- 이벤트 `pull_request`, head SHA `fd3a1beed3cadb3cfdde50e39ad8c3b81fa4aaae`, 세 job 모두 success. PR: https://github.com/JaewonYe/map_service/pull/8
- Conversion regression: 실제 production DEM 3개/PBF 4개와 Python 집계 도구 5개 통과. 오류/실패/스킵 0. `/usr/bin/python3`와 GDAL 실제 import/GTiff·PNG·OSM driver, source/baked script SHA256 일치 확인.
- 기존 앱 회귀 71개와 Node 집계 도구 5개, typecheck 및 Playwright 5개 프로젝트 30개도 성공. 기존 테스트 수·assertion·worker·timeout은 변경하지 않았다.
- 원격 변환 버전/패키지 버전은 위 로컬 기록과 일치했다. 원격 built image ID: DEM `sha256:43f632879738a5dae8931e1996bb42a5db97300042b9599452fe5633ce4edd53`, OSM `sha256:6484aeaa9a3826c7202d6efa6a66d5761c5865aa7999b14a66b4bfa345a159df`. 로컬/원격 image ID가 같다고 주장하지 않는다.
- `conversion-diagnostics-44874199867-1` artifact(ID `14694923723`, 약 21KB) 업로드와 7일 만료를 확인했다. reporting-gates/build/test/version/image ID 로그만 대상으로 하며 실제 원본/결과 데이터는 제외한다. 브라우저 artifact `browser-diagnostics-44874199867-1`도 업로드됐다.
- 최초 실패 run과 수정 후 성공 run을 구분했다. 실패 artifact의 업로드/내용은 검증했다고 주장하지 않으며, 실패 원인은 최초 Actions step 로그로 확인했다.
- 이 기록 이후 문서 변경을 포함한 최종 SHA의 PR/main push 실행 결과는 [이슈 #7](https://github.com/JaewonYe/map_service/issues/7) 완료 댓글에서 이벤트별로 확인한다.


## 이슈 #9 시설 목록·이름 검색·분류 필터

2026-11-21. 기존 GET /api/buildings를 재사용해 클라이언트에서 이름 부분 일치(trim·영문 대소문자 무시)와 기존 분류 조건을 함께 적용한다. API·요청/응답·ID·분류·파일 저장 형식·모듈 책임·상위 gitlink는 변경하지 않았다. 서버 검색/페이지 API나 예약 연계를 추가하지 않았다.

### 검증 항목과 수 변경

- buildings 단위 테스트 8 → 12개: 한글/공백/영문 대소문자, 검색·분류 조합과 초기화, 필터링 중 원본/저장 데이터 보존 및 지연 목록 snapshot/최신 변경 병합 검사 4개 추가. 전체 Node 앱 테스트는 71 → 75개이며 Node 집계 도구 5개는 유지한다.
- 브라우저 30 → 37개: 목록/검색/분류/마커 동기화, loading/등록0/결과0/조회 실패와 재시도, 화면 밖 시설의 최신 상세·좌표/줌, 등록/수정/삭제/재조회와 조건 유지, 지연 상세 무시·선택 삭제/조건 이탈, 모바일/키보드/측정·추가 도구, 상세 실패/재시도/404 처리의 7개 시나리오 추가. 기존 30개를 유지하며 assertion·skip·timeout·worker를 완화하지 않았다.
- 결과 이름은 일반 텍스트로 렌더링한다. 목록에서 선택한 뒤 패널은 접히고 최신 상세로 연결되며, 닫은 뒤 목록 토글로 키보드 초점을 돌린다. 모바일 390×844에서 패널 경계와 추가 도구 비중첩을 확인하고 합성 데이터 스크린샷을 검토했다.
- 외부 요청을 차단한 모바일/기존 오프라인 회귀를 유지한다. 일부 경계/오류 검사는 합성 API 응답을 사용하며 변경 검사는 실제 기존 파일 저장 API로 실행한다. 사용자 데이터·키·지도 파일을 추가하지 않는다.

### 로컬 실행

- 작업 공간 캐시를 사용한 npm ci, typecheck 및 Node 전체 앱 75개+집계 도구 5개 통과, 실패/스킵 0.
- CI 모드 전체 브라우저 최종 37개 통과, 실패/flaky/스킵 0. 최초 실행은 36개 통과/1개 실패였다. 오류 텍스트와 재시도 버튼이 같은 요소에 있어 정확한 문구 확인이 실패했으며 오류 문구를 별도 span으로 분리한 뒤 전체 37개를 재실행해 통과했다.
- 이후 재조회 시 이전 상세 오류도 해제하는 정리를 추가하고 관련 buildings 프로젝트 13개를 다시 실행해 모두 통과했다(실패/스킵 0). 원격 최종 SHA의 전체 3개 job 결과를 완료 댓글에서 확인한다.
- 문서 로컬 링크·git diff --check, API/모델/store/변환 코드 변경 없음 확인. 실데이터·Windows/Ubuntu 실기·인증/운영·공통 플랫폼 계약 검증은 미실행이다.

### 원격 실행 증거

실제 run URL·이벤트·SHA·테스트 수·artifact는 원격 실행 후 이 절과 [이슈 #9](https://github.com/JaewonYe/map_service/issues/9) 완료 댓글에 기록한다. 과거 CI/다른 SHA나 로컬 실행을 현재 원격 실행의 성공으로 보고하지 않는다.


### 최초 원격 검증과 지연 목록 병합 보강

- 최초 PR [run 44877570199](https://github.com/JaewonYe/map_service/actions/runs/44877570199), head `ec49a8a28192d2b2c74f43b43e78e01915e80f2a`에서 세 job이 성공했다. 이 시점 앱 74개/Node 도구 5개/브라우저 37개/변환 7개가 통과했다. 이후 추가한 병합 단위 1개를 이 과거 SHA의 결과로 계산하지 않는다.
- 최초 조회가 진행 중일 때 등록/수정/삭제/최신 상세 결과가 생기면 요청 시작 revision 이후 변경을 목록 snapshot에 병합하도록 보강했다. 늦은 목록이 새 시설을 지우지 않으면서 기존 시설도 빠지지 않게 한다. 저장된 데이터·API 스키마에는 영향이 없다.
- 병합 보강 후 typecheck, Node 앱 75개+도구 5개 및 전체 브라우저 37개를 로컬에서 재실행해 모두 통과했다(실패/스킵 0). 기존 지연 응답 테스트에 기존 항목과 새 항목이 함께 남는 검사를 더했고, 모바일 키보드 End 조작이 실제 분류값을 변경하는지도 명시적으로 확인했다.
- 보강을 포함한 최종 SHA의 세 job과 PR/main push 이벤트 증거는 실제 실행 후 이슈 #9 완료 댓글에 기록한다.
