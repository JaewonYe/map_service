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

## 이슈 #11 시설 경계 영구 저장·조회·수정

2026-11-21 Linux 클라우드, Node.js v24.22.1. 경계 확장 전 main `723155db0ec3ee8ae23aec042d31a3cbbe8e3640`에서 시작했다. 모델/요청·응답 변경안과 구형 소비자 영향을 [사전 댓글](https://github.com/JaewonYe/map_service/issues/11#issuecomment-7059051807)에 기록한 후 구현했다. 선택적 GeoJSON boundary 외 기존 경로/ID/버전/일반 필드·공통 OpenAPI·상위 gitlink는 유지한다.

### 기준별 검증

| 완료 기준 | 구현 및 증거 |
| --- | --- |
| 영구 저장/복원 | 실제 파일 저장 후 브라우저 새로고침에서 같은 경계를 조회. BuildingStore 재생성 및 종료되는 독립 Node 프로세스를 두 번 시작해 같은 UUID/version/좌표 조회. HTTP 서버 프로세스 자체의 별도 재시작 실험과 구분 |
| 수정/취소/제거/삭제 격리 | 초안 미리보기·마지막 점 취소·취소/Esc·저장·null 제거·시설 삭제 검사. 다른 시설 레코드와 기존 임시 측정 점/선 보존, 측정 초기화 후 저장 경계 유지 |
| 레거시 호환 | 경계 없는 파일 정상 읽기와 바이트 불변, 기존 일반 PUT 생략 시 경계 유지, null만 제거, UUID/등록일 유지·version 증가. 최대 일반 필드+128개 경계를 저장/재조회 |
| 서버 검증/정규화 | 단위 검사에 형식/구멍/분리 영역·최소 점/중복/반올림 중복·퇴화/교차/접촉·숫자/NaN/Infinity/범위/좌표 순서·128/129 정점·32KiB·날짜변경선/180도 폭, CCW/시작점/폐합/7자리·위도 끝값 재검증 추가. API 400/409/428과 기존 데이터 보존도 확인 |
| 실패/경합/지연 | 실제 디렉터리 쓰기 권한을 제거해 파일 바이트 보존/복구 후 재시도. API 503 모의 저장/제거 실패·실제 오래된 버전 409·지연 저장 중 대상 전환/Esc 차단·저장 전 다른 시설 선택 초안 폐기 확인. 늦은 응답/컴포넌트 종료 guard 유지 |
| UI/접근성/기존 도구 | 같은 필터의 목록/마커/경계·도형 키보드 상세 연결. 모바일 390×844, 외부 네트워크 요청 차단, 좌표 입력/정점 수정/Enter 저장·제거, 기존 측정과 등록 도구 재사용. 편집 중 저장 도형의 클릭은 드로잉으로 전달, 더블클릭 확대 억제 검사 |
| 전체 회귀 | 아래 로컬 실행과 최종 SHA의 원격 3개 job을 구분해 기록. 기존 assertion/worker/timeout/skip 기준 유지 |
| 문서 | README 사용법·제한·실패 복구, PROJECT_CONTEXT 현황, PLATFORM_INTEGRATION 스키마·요청/파일/소비자 호환성, 이 문서와 이슈 완료 댓글 |

### 테스트 수와 로컬 실행

- buildings 단위 12 → 20개: 경계 정규화/검증/크기/레거시 호환/독립 프로세스 재로드/충돌/실제 쓰기 실패의 8개 추가. Node 앱 75 → 83개(tiles 22/buildings 20/layers 6/osm 4/measure 9/launcher 22), 별도 Node 집계 도구 5개 유지. typecheck와 npm run ci:node 통과, 실패/취소/스킵/todo 0.
- 브라우저 37 → 43개: 경계 저장/새로고침/도형 상세/측정 격리, 편집/취소/제거/삭제, API 호환/검증, 오류/충돌, 대상 전환/지연 저장, 모바일/키보드/필터의 6개 시나리오 추가. 기존 5개 프로젝트 유지(single 4/multi 15/osm 2/layers 3/buildings 19).
- 최초 buildings 프로젝트 실행: 14 통과/5 실패. 새 합성 시설이 기존 테스트 위치와 겹치고, 서로의 목록에 들어가 전체 도형 수가 달라지며, 이름 필터 때문에 전환 대상이 숨겨졌다. 새 테스트의 합성 위치와 자체 목록 조회 범위를 분리하고 전환 테스트에서 전체 조건을 사용했다. 다음 실행 18 통과/1 실패는 모바일 기대 문자열의 좌표 오타였으며 실제 입력과 맞춰 수정했다. 실행/성공 수를 부풀리거나 timeout/worker/skip을 완화하지 않았다.
- 수정 후 CI 모드 전체 브라우저 43개 통과, 실패/flaky/스킵 0. 추가 검토로 저장 도형 내부를 클릭해 재편집할 때 상세 선택 대신 드로잉되도록 하고 공유 도구 전환 중 더블클릭 확대 억제 수명을 보강했다. 해당 동작을 기존 경계 시나리오에 추가한 최종 재실행에서도 typecheck·Node 앱 83개/도구 5개·전체 브라우저 43개가 통과했다(실패/취소/flaky/스킵 0). 모바일 편집/저장 화면 합성 스크린샷도 검토했다.
- 변환 코드는 변경하지 않았다. 기존 production DEM/PBF 이미지에서 bash scripts/ci/conversion-tests.sh 및 summary: DEM 3/PBF 4 통과, 실패/오류/스킵 0. Python 집계 도구 5개도 통과. 합성 데이터·읽기 전용/비루트/network=none 실행이며 이미지/패키지 버전은 이슈 #7 로컬 기록과 동일했다.
- npm ci는 작업 공간 캐시를 사용했다. git diff --check 및 문서 로컬 링크 검사 통과. 사용자 데이터·지도 파일·키는 추가하지 않는다.

### 원격 증거와 한계

실제 최종 head SHA·PR·PR/main push별 run URL·job/테스트 결과·artifact는 실행 완료 후 [이슈 #11](https://github.com/JaewonYe/map_service/issues/11) 완료 댓글에 기록한다. 다른 SHA/로컬 통과를 원격 성공으로 간주하지 않는다.

실제 사용자 경계/대규모 성능·TPK/DEM/PBF·Windows/Ubuntu 실기·인증/운영·승인된 플랫폼 소비자 계약은 미검증이다. 관리용 경계의 법적/실측 정확도는 보장하지 않는다. 구멍/여러 영역/날짜변경선·공유 경계·예약 규칙은 제외하며 다중 서버 동시 쓰기 한계도 유지한다. 상위 gitlink·공통 OpenAPI를 변경하지 않았다.


### 작업 중 추가된 main 디자인 기준 반영

PR #12 생성 후 최신 main의 `5f365d30f4967eb6a23a9c37d6b77be5ba96b091`에서 공통 UI 디자인 스킬·토큰·무결성 workflow가 추가된 것을 확인했다. 이를 병합하면서 PROJECT_CONTEXT의 양쪽 기록을 모두 유지했다. 새 AGENTS 지침에 따라 두 스킬/공통 MASTER/토큰을 읽고 로컬 검색·변경 UI 검토를 수행했다. 자세한 파일:줄 결과와 검토 한계는 [BOUNDARY_UI_REVIEW](BOUNDARY_UI_REVIEW.md)에 기록한다.

변경한 경계/상세 UI에 공통 토큰과 44px 조작 높이·hover/focus·입력 metadata·초안 이탈 경고를 적용했다. 기존 지도 레이어 색상/도형 구분과 작업 공간은 유지한다. 공통 스냅샷과 lock은 수정하지 않았고 `python3 scripts/check_design_skills.py`가 통과했다. main 반영 후 최종 SHA에 대해 기존 3개 회귀 job과 추가된 Design skill integrity 결과도 확인한다.

main 디자인 기준 반영 후 로컬 typecheck, Node 앱 83개/집계 도구 5개, CI 모드 Playwright 전체 43개 재실행 통과(실패/취소/flaky/스킵 0). 데스크톱/모바일 편집 스크린샷을 직접 검토했다. 변환 코드는 추가 변경하지 않았다.


### 추가된 Light/Dark 기준 반영

이어 main의 `cf1b07d3f733dd2ac8e1142e0a75149b037ce4ed`가 프로젝트 전용 디자인 스킬과 양 테마 기준을 추가했다. 최신 문서를 읽고 병합해 변경한 경계/상세 UI에서 같은 토큰을 적용했다. 저장 경계/마커는 accent 계열, 측정은 짧은 점선, 초안은 붉은 긴 점선으로 구분한다. 실제 타일 픽셀/지도 데이터는 바꾸지 않는다. 참고 HTML을 localhost로 열어 양 테마/크기를 비교했으며, 앱 편집 화면의 light/dark × 1440×900/390×844 스크린샷과 OS 테마 변경 시 입력 보존·다크 상세도 기존 회귀 시나리오에 추가했다. 전체 화면 리디자인이나 사용자 테마 선택·보관 기능의 구현 완료를 뜻하지 않는다. 자세한 범위/미검증 항목은 UI 검토 문서에 기록한다.

최초 원격 PR 검증은 [run 44895519259](https://github.com/JaewonYe/map_service/actions/runs/44895519259), head `a6a8cad20c1dea3d91f54ea18bf75ac0cea2f19f`에서 Map regression의 세 job이 모두 통과했다. 이 실행 이후 main의 Light/Dark 기준을 추가 반영했으므로 이 과거 SHA의 성공을 최종 SHA 결과로 전용하지 않는다. 최종 SHA의 PR/main push 검사 결과는 이슈 #11 완료 댓글에 별도로 기록한다.

추가 기준 반영 후 로컬 typecheck·Node 앱 83/도구 5·전체 Playwright 43개가 모두 통과했다(실패/취소/flaky/스킵 0). 참고 화면과 실제 앱의 양 테마·두 화면 크기 스크린샷을 비교했다. 최종 무결성 검사는 92개 locked asset/세 스킬·토큰/명암비를 통과했다.

마지막 좌표 입력의 테마 배경 보완 후 관련 데스크톱/모바일 경계 시나리오 2개를 다시 실행해 모두 통과했다. 최종 CI는 전체 43개를 다시 실행한다.

## 이슈 #13 전체 지도 UI·Light/Dark/System

2026-11-21–22(KST). 기준 main `1cf49525be87cde44b1f119708d6818f6ad5c69d`에서 시작했다. 최신 플랫폼 역할/절차/계약 문서와 공통 디자인 스킬·원본 기준을 읽었으며 공통 파일과 API/모델/store/변환 코드는 변경하지 않는다.

### 시각 검증

변경 전 실제 앱을 먼저 실행하여 양 테마 × desktop 1440×900/mobile 390×844의 기본·선택·경계 상태 12장을 촬영했다. 참고 HTML 4장을 별도로 열고, 변경 후 같은 합성 fixture/크기/상태 12장과 대조한다. 이미지/manifest는 docs/ui/issue-13에 커밋하여 PR에서 열 수 있고 만료 artifact만으로 증거를 남기지 않는다. 헤더·좌측 패널·지도 공간·도구/카드·글꼴/컨트롤·모바일·원본 데이터의 일치/의도적 차이와 구체적 파일:줄 검토는 [UI_REDESIGN_REVIEW](UI_REDESIGN_REVIEW.md)를 참조한다.

### 기능 검증과 실행 수

- typecheck 통과. Node 앱 83개(tiles 22/buildings 20/layers 6/osm 4/measure 9/launcher 22) + Node 집계 도구 5개 통과, 실패/취소/스킵/todo 0. API/UUID/boundary/파일 저장 형식 변경 없음.
- 테마/전체 배치 Playwright 7개 추가: 56px/320px 골격·양 테마 카드/메뉴/컨트롤, 첫 paint/하이드레이션, 저장/새로고침/OS 추종, storage 거부/잘못된 값 fallback, 검색/카메라/폼/경계 보존, 모바일/긴 텍스트/키보드/resize/줌 비중첩, 다른 탭 동기화. 기존 43개를 유지해 총 50개(single 4/multi 15/osm 2/layers 3/buildings 26).
- 기존 테스트는 재배치한 지도 정보 진입과 데스크톱 목록 유지/모바일 도구 위치에 맞춰 조작/기하 기대를 갱신했다. 기존 API/도형/좌표/오프라인/실패/충돌/assertion을 삭제하거나 timeout/worker/skip을 완화하지 않았다. fixture 이름/배지와 숨은 상세의 중복을 제거했다.
- 실제 production DEM 3/PBF 4와 Python 집계 도구 5개 통과(실패/오류/스킵 0). 동일 production 이미지·읽기 전용·비루트·network=none 합성 변환이며 사용자 데이터를 사용하지 않는다.
- `python3 scripts/check_design_skills.py`: 92개 locked asset/세 스킬·양 테마 토큰/명암비·로컬 UX 검색 통과. 앱 시각·기능 검사와 구분한다.

### 발견한 문제와 재검증

첫 전체 실행은 38 통과/12 실패였다. 상태 문구가 footer 높이를 바꿔 줌 도중 resize/moveend가 발생하고 중심이 변하는 문제, 정보/선택 카드와 줌/모바일 취소 버튼 가림, 새 정보 진입이 필요한 테스트 조작, 초기화 전 줌 캡처와 textarea locator/테마 준비 코드 문제를 확인했다. 상태 공간 예약, 실제 크기 변화만 감지/정확한 카메라 복원, 비모달 카드/줌 분리·포커스 정리, 새 흐름의 조작/준비를 보완했다.

두 번째 전체 실행은 47 통과/3 실패였다. 모바일 레이어/서랍 중첩·위치 선택 취소와 nonempty textarea label 선택 문제를 수정했다. 세 번째 49 통과/1 실패는 분류 배지와 숨은 상세 중복으로 발생했으며 중복 표시를 제거했다. 이후 전체 50개 통과(실패/flaky/스킵 0). 저장 오류 초점/위험 버튼 보완 후 buildings 프로젝트 26개도 통과했다. 모바일 경계 저장/취소를 스크롤 본문과 분리하고 관련 재검증 결과를 아래/이슈 완료 댓글에 기록한다.

수동 최초 build는 기본 설정 폴더 `/home/agent/.config` 쓰기 시 EROFS로 실패했다. 기존 CI와 같이 NEXT_TELEMETRY_DISABLED=1로 실행해 성공했다. 네트워크/이슈 권한 실패와 구분하며 허용 목록은 변경하지 않았다. 사용자 HOME이나 공통 환경 설정은 변경하지 않았다.

### 원격 최종 증거와 한계

최종 SHA·PR·PR/main push 이벤트별 Map regression 3개 job 및 Design skill integrity 결과, 실제 수·run URL·artifact는 실행 후 이슈 #13 완료 댓글/PR에 기록한다. 로컬 성공을 원격/다른 SHA 결과로 전용하지 않는다. 스크린샷은 저장소에 영구 보관하고 CI 진단 artifact는 기존 7일 보관 정책을 따른다.

원본 타일/DEM 색상, 기존 상세 지역/메타데이터, 사용자 데이터와 OS 실기/실제 터치·스크린 리더/외부 접근성 인증·대규모 성능·인증/운영·승인된 플랫폼 계약의 미검증 범위는 유지한다. 상위 gitlink는 변경하지 않고 검증된 모듈 SHA를 별도 통합용으로 보고한다.

마지막 모바일 경계 본문/저장 영역 분리 후 typecheck와 buildings 프로젝트 26개를 재실행하여 모두 통과했다(실패/flaky/스킵 0). 저장 버튼이 스크롤 전에 viewport 안에 있고 초점을 받아도 줌/하단 좌표를 가리지 않는 검사도 포함한다. 최종 코드의 직접 캡처와 문서 링크/diff 검사를 마치고 원격 최종 SHA에서는 전체 50개를 실행한다.

최종 production build 후 캡처 도구를 실제 localhost 앱에 실행해 12장 전체를 갱신했다. before/after의 각 12장·양 크기/테마/세 상태·PNG 존재와 문서 로컬 링크/diff 검사가 통과했다. 최종 화면에서 저장/취소 분리와 source/원본 픽셀 구분을 직접 확인했다.


### 최초 원격 main 실패와 반응형 상태 보완

구현 PR #14의 [PR run 44936400096](https://github.com/JaewonYe/map_service/actions/runs/44936400096), head `cfc4a36b00ec43cb162e7549c6bc1b9371ee0e01`에서 typecheck·Node/변환/디자인 검사와 Playwright 50개가 모두 통과했다. 같은 SHA의 [main push run 44936595555](https://github.com/JaewonYe/map_service/actions/runs/44936595555)는 브라우저 49 통과/1 실패였다. 이를 최종 성공으로 보고하지 않았고 이슈 #13을 다시 열어 보완했다.

실패는 `mobile drawer long names...resize` 시나리오의 두 번째 모바일 복귀 직후 목록 조회 단계다. 비동기 matchMedia change effect가 사용자 열림 상태를 늦게 초기화해 닫을 수 있었다. `useSyncExternalStore`로 CSS breakpoint를 구독하고 데스크톱/모바일 목록 상태를 따로 보관하도록 변경했다. 테스트는 실제 data-layout 상태를 확인한 후 조작하며 열린 목록의 크기 전환을 3회 더 반복한다. timeout/worker/retry/skip은 늘리지 않았다.

보완 후 로컬 typecheck와 해당 시나리오 10회 반복(각 3회 추가 크기 전환) 모두 통과했다. 이 반복 수는 앱 기본 회귀 50개와 별도로 기록한다. 이후 전체 회귀와 새 최종 SHA의 PR/main 결과를 완료 댓글에 기록한다. 최초 실패 artifact `browser-diagnostics-44936595555-1`(ID 14718974548) 및 conversion artifact(ID 14720125082)의 업로드/7일 만료를 확인했다. 실패 원인은 job 로그로 확인했으며 원격 trace 파일을 내려받아 검토했다고 주장하지 않는다.

반응형 상태 보완 후 전체 Playwright 50개도 로컬에서 다시 통과했다(실패/flaky/스킵 0). 같은 촬영 도구로 변경 후 12장을 다시 캡처했다. 시각/테마/기본 배치는 유지되며 최초 원격 main 실패 이력과 수정 SHA의 결과를 구분한다.

### 보완 PR의 체크아웃 정체 재시도

보완 코드 `dcdfe26b2d31b6790048f65a7add97f88ee691fc`의 PR run [44937344600](https://github.com/JaewonYe/map_service/actions/runs/44937344600)에서 브라우저 50개·변환·디자인 검사는 통과했다. Node job(ID 136946761788)은 checkout 단계에서 수 분간 진행되지 않았고 아직 typecheck/Node 테스트를 시작하지 못했다. 로그 archive 조회도 준비되지 않은 BlobNotFound를 반환했다. 원인을 코드/네트워크 허용 목록 문제로 단정하지 않으며 이 상태를 Node 테스트 성공이나 실패 수에 합산하지 않는다.

해당 진행 기록을 추가한 새 커밋으로 PR 전체 CI를 다시 시작한다. 기존 concurrency 규칙이 이전 진행 중 실행을 정리하며 workflow·timeout·worker·retry·skip·코드는 바꾸지 않는다. 최종 새 SHA의 실제 전체 검사 결과를 완료 댓글/PR에 별도 기록한다.

## 이슈 #16 시설 대표 지점 이동·경계 꼭짓점 직접 편집

2026-11-22(KST), main `f28e4f050d98bfc9f0835761db8464e94a0de961`에서 시작했다. 최신 플랫폼 AGENTS/역할/절차/계약 및 모듈 문서·#11/#13/#16과 현재 코드를 확인했다. 기존 숫자 좌표 수정/삭제를 유지하며 신규 지도 조작과 구분한다. 공통 API·UUID·boundary 형식/정규화·저장·타 DB·예약·공통 디자인/lock/reference·상위 gitlink는 변경하지 않았다. 기존 네트워크 허용 목록은 유지했고 GitHub connector 조회와 Git fetch가 성공했다.

### 완료 기준별 증거

| 기준 | 검증 |
| --- | --- |
| 신규/기존 구분 | README/PROJECT_CONTEXT에 새 위치/정점 직접 조작과 기존 숫자 좌표 수정·시설 삭제 재사용을 명시. DELETE 처리/API 중복 없음 |
| 대표 지점 이동 | 명시적 위치 수정, 마커 드래그/빈 지도 클릭/좌표 입력 미리보기, 원래 위치와 초안/되돌리기, 저장 전 원본 동일·취소/Esc 복원, 실제 PUT 저장 후 상세/마커 동기화·새로고침 |
| 경계/다른 시설 보존 | boundary 생략 PUT으로 대표 좌표만 변경. 실제 저장소 reopen·UUID/등록일/다른 속성·boundary 동일 및 이웃 파일 바이트 불변, 브라우저 이웃 레코드 동일 |
| 직접 정점 조작 | 마우스/Chromium 터치 드래그·실시간 면적/둘레, 중간 + 삽입 1회·선택 삭제·undo·좌표 대안, 정규화 저장 후 재조회. 3개 선택 삭제 제한/128개 추가 제한·중복/교차/범위/퇴화 저장 차단. 기존 검증/서버 경계 테스트 유지 |
| 삭제 의미 구분 | 정점 삭제는 초안, 경계 전체 제거는 기존 PUT null, 시설 삭제는 기존 DELETE + If-Match. 삭제 확인에 레코드/마커/경계 명시, 돌아가기·실패·충돌·성공 후 목록/수/선택/마커/경계 및 이웃 격리 |
| 실패/동시성 | 실제 디렉터리 권한 제거 후 DELETE 실패·파일/이웃 유지/복구 재시도. 위치와 드래그 정점 503/실제 오래된 버전 409·초안 유지, 저장 전 대상 전환 폐기, 지연 저장 시 대상 전환/Esc/중복 저장·편집 차단 및 최종 원래 UUID에만 반영 |
| UI/입력/모드 | 기존 #13 테마7개 및 전체 지도/측정/레이어/오프라인 회귀 유지. 모바일 touchStart/Move/End·tap 삽입/삭제/저장, 키보드 숫자/선택/Enter·Delete/Backspace 비삭제, theme/resize 초안/검색/카메라 보존과 44px/줌 비중첩 검사 |
| 시각 증거 | 실제 localhost production 앱, desktop1440×900/mobile390×844 × Light/Dark × 위치 초안/정점 편집/시설 삭제 확인12장 + 모바일 스크롤 대안4장. 합성 fixture/manifest·원본16장과 검토는 [DIRECT_EDIT_REVIEW](DIRECT_EDIT_REVIEW.md) |
| 문서/최종 CI | README/PROJECT_CONTEXT/검증·검토 문서 갱신, 최종 SHA의 PR/main Map regression 3job + Design skill integrity는 실제 완료 후 이슈 #16/PR에 별도 기록. 상위 gitlink 통합용 SHA만 보고 |

### 로컬 실행 수와 실패 보완

- Typecheck 성공. Node buildings 20→24개: 순수 초안 연산/undo·최소/최대/invalid 복구, 대표 지점 이동의 영구 저장/metadata/이웃 보존, 실제 DELETE 쓰기 실패 검사4개 추가. 앱 총87개(tiles22/buildings24/layers6/osm4/measure9/launcher22) + Node 집계 도구5개 통과, 실패/취소/스킵/todo0. 집계 도구의 의도적인 실패/스킵 fixture 출력을 앱 실패 수에 합산하지 않는다.
- Playwright 기존50개를 그대로 유지하고 직접 편집9개를 추가해 총59개(single4/multi15/osm2/layers3/buildings35). 기존 worker2/timeout/retry/skip·검증 조건은 완화하지 않았다.
- 첫 buildings 실행34개는31통과/3실패. 선택 정점 select의 wrapping label이 옵션 문자열까지 포함해 exact label 조회가 실패하는2건, 모바일 터치 드래그의 지도 pan 애니메이션 완료 전 좌표 조작1건이었다. 명시적 label/id 연결, 정점 핸들의 삽입 핸들 위 우선순위, 실제 pan class 종료 확인을 적용했다.
- 직접 편집8개 재실행은7통과/1실패. 교차 fixture로 지정한 좌표가 실제로는 유효한 오목 다각형이었다. 기존 교차 검사를 바꾸지 않고 실제 반대 변을 가로지르는 좌표로 수정했다.
- 이후 **전체59개 통과**, 실패/flaky/스킵0. 추가로 실제 터치 삭제/저장 및 지연 정점 저장/대상 전환 시나리오2개를 최종 테스트 코드에서 재실행해 모두 통과했다. 별도 확인 수는 기본59개에 합산하지 않는다.
- 기존 production DEM3/PBF4와 Python 집계 도구5개 통과, 실패/오류/스킵0. 저장된 production 이미지(`map-service-elevation-tools:ci` 60c0bde27f16 / `map-service-osm-tools:ci` 8ecec9525561), 읽기 전용·비루트·network=none·합성 데이터로 실행했고 변환 코드/이미지는 이번 작업에서 바꾸지 않았다. 상세 버전과 hash는 기존 이슈 #7 기록과 실행 결과를 따른다.
- 디자인 무결성: locked asset92개·세 스킬·Light/Dark 토큰/명암비·로컬 UX 검색 통과. 무결성과 실제 앱 화면 검토는 별도다. 원본 지도 픽셀·공통 reference/lock 및 #13 기존 캡처는 바꾸지 않았다.

캡처 도구는 pan 애니메이션 종료 후 모바일 지도 작업 공간을 확보하고 각 상태를 기록한다. 본문 위/아래 스크롤 상태를 별도로 보관해 항상 보이는 저장/취소와 숫자 입력/선택 대안을 확인했다. 촬영 중 저장/삭제는 확정하지 않았고 시작/종료 레코드 동일을 검사했다.

### 원격 증거와 한계

최종 커밋 SHA, PR URL, 같은 SHA의 pull_request/main push별 Map regression과 Design skill integrity run·실제 검사 수/실패/스킵·artifact 이름/ID/7일 보관은 [이슈 #16](https://github.com/JaewonYe/map_service/issues/16) 완료 댓글과 PR에 기록한다. 다른 SHA나 로컬 성공을 원격 성공으로 보고하지 않는다. UI PNG/manifest는 저장소에 보관한다.

실제 사용자 시설/지도·실제 터치 기기/스크린 리더·Windows/Ubuntu 실기·외부 접근성 인증·모든 확대/회전·대규모 성능·법적 측량 정확도·인증/운영·승인된 플랫폼 계약은 미검증이다. 대표 지점과 경계 동시 이동·경계 안 위치 강제·위치 필드만 제거·새 데이터 타입/API/예약 정책은 도입하지 않았다.

## 이슈 #18 오프라인 OSM 일반 지도 편집

2026-11-22 Linux 클라우드, Node.js v24.22.1. 기준 main `1d6e7dae269f9e4e642ef06771a23343527fe533`. 최신 platform_core 역할/절차와 map AGENTS를 확인하고 [사전 변경안](https://github.com/JaewonYe/map_service/issues/18#issuecomment-7075008375)을 게시한 후 구현했다. 기반만 완료한 상태에서 닫지 않고 조회·실제 PNG 합성·UI·충돌 복구까지 진행했다.

### 완료 조건별 증거

| # | 완료 조건 | 증거 |
| --- | --- | --- |
| 1 | 실제 prepared 객체 선택/현재 정보 | production importer가 만든 합성 PBF SQLite로 way:103 건물/node:24 지명 선택, 목록·클릭/겹친 후보와 현재 이름/분류/좌표/source/state 확인. [실제 화면](OSM_EDIT_UI_REVIEW.md) |
| 2 | Point/도로/건물 CRUD·취소·복원 | Node API/renderer와 브라우저에서 이름/분류/좌표·정점 삽입/삭제/undo·신규/숨김/복원/취소 검증. unsupported/영역/구형 안내 포함 |
| 3 | 원본/시설 보존 | PBF/SQLite 수정 전후 SHA256 동일, 기존 시설 파일/UUID/boundary 보존 및 기존 시설 브라우저35개 통과. 시설과 일반 지도 저장 API 분리 |
| 4 | reload/restart·실제 PNG·캐시 | 독립 Node 프로세스, 실제 production HTTP 서버 종료/재시작, PNG 바이트/ETag/304·메모리/pending 경쟁·이동 전후/인접/다른 줌·Leaflet URL 갱신 검사 |
| 5 | 충돌/실패/입력 한도 | 실제 디렉터리 쓰기 실패/손상 저장소, 409/428/origin/body/geometry·대량201개/대형geometry, 조회 오류/빈 화면, 지연 저장/대상 잠금/초안 보존 검증 |
| 6 | PBF 재준비/구형 호환 | 실제 PBF 순서 변경/source 이름 변경/도로 삭제 변환, 동일 key/fingerprint와 changed/deleted 충돌, 명시적 reapply/restore, 실제 schema1 컬럼 호환·수정 기록 보존. 준비 실패 시 기존 세트/수정 파일 유지 |
| 7 | 시각/기능 회귀 | desktop1440×900/mobile390×844 × Light/Dark × 선택/편집/삭제 확인/충돌 16개 + 모바일 내부 스크롤4개 =20PNG와 [검토표](OSM_EDIT_UI_REVIEW.md). 키보드/터치/테마·크기 변경, 기존 5프로젝트 전체 회귀 |
| 8 | 최종 SHA 원격 CI | 아래 로컬 실제 수와 구분. 최종 커밋의 PR/main push별 Map 3job 및 Design 1job, run URL/아티팩트/최초 실패 이력은 실행 후 이슈 완료 댓글에 기록 |
| 9 | 계약/복원/한계·보고 | [OSM_EDITING](OSM_EDITING.md), README/PROJECT_CONTEXT/데이터 폴더 안내, 이 문서/화면 검토. 공통 API·타 DB·상위 gitlink 유지, 통합용 최종 모듈 SHA 보고 |

### 로컬 실행 수와 결과

- typecheck/production build 및 `git diff --check`, Compose config 검증 통과.
- Node 앱 **97**(tiles22/buildings24/layers6/osm14/measure9/launcher22), 별도 Node 집계 도구 **5** 통과. osm은 기존4→14로10개 추가. 실패/취소/스킵/todo0.
- Playwright 전체 **67**(single4/multi15/osm10/layers3/buildings35), 기존59→신규8 추가, 실패/flaky/스킵0. 최신 확인 문구·Leaflet URL 검사 추가 후 osm10개를 다시 통과했다. 최종 geometry 보강은 Node14개로 확인하고 최종 SHA 전체 브라우저 결과는 원격 CI에서 확인한다.
- 신규 OSM 편집 파일은 하나의 준비 데이터셋/전체 revision을 공유하므로 이 파일의 테스트만 default 순차 실행한다. 기존 fullyParallel/2worker·timeout·retry·assert/skip 기준은 유지한다. 원본 OSM2개 및 다른 프로젝트는 기존 병렬 설정이다.
- 변환 **DEM3/PBF7 =10**, Python 보고 도구 **5** 통과. PBF는 기존4→7로3개 추가. production 도구에 실제 합성 PBF를 입력하고 readonly/nonroot/network=none 실행·schema/source identity·원본 보존·재사용·실패를 검사한다. CI 집계 예상 PBF 수만4→7로 갱신했다.
- production OSM 도구 image `6778d300ec3369d0fea50fcc743cb9243051412d0b74956fb4ea18a0b0f5a41a`; prepare.py SHA256 `abe6527feeb8f95f3baba184fd129d4130b5ba098ab16214503beca70fee30b2`; schema.sql SHA256 `b9899fabc8008931abdf6ebb9a8122e391769e5c2477d19b0a96790832ed5e35`. 원격 image ID는 별도 runner에서 생성되므로 로컬과 같다고 가정하지 않는다.
- 디자인 무결성 **92assets/3skills**, Light/Dark 토큰·대비·로컬 UX 검색 통과. 공통 skill/lock/theme/reference 변경 없음. 이 검사를 실제 앱 캡처 검토로 대신하지 않았다.

### 최초 실패와 보완

- 최초 추가 Node11개 중10통과/1실패: tile 경계 바깥 anchor 라벨이 제외되어 실제 PNG가 바뀌지 않는 문제. query/label padding을128px로 맞추고 경계 주변 라벨을 렌더하도록 수정해 통과했다.
- 한도 검사 추가 후14개 중13통과/1실패: 32KiB 초과를 의도한 대형 fixture가 실제로 약30KiB였다. 6000좌표로 실제 초과 입력을 만들었고 제품 제한은 완화하지 않았다. 이후14개 통과.
- 최초 신규 포함 OSM browser10개 중5통과/5실패: wrapping select label이 옵션 문자열을 accessible name에 포함(4), unnamed source 두 개의 locator 중복(1). 명시적 label/id·읽기 전용 대상 locator로 수정.
- 다음10개 중9통과/1실패: undo가 functional state update 시점에 갱신된 ref를 읽어 이전 geometry를 잃었다. 조작 전 좌표를 먼저 캡처해 수정했다. 다음 OSM10/전체67 통과. 마지막 검토에서는 도로가 인접 구간을 되짚는 겹침도 거부하고 순방향 일직선은 유지하는 assertion을 추가했다. 저장 파일 크기는 마지막 newline까지 계산한다.
- 캡처/수동 HTTP 재시작 확인 도구의 첫 assertion은 Cache-Control 쉼표 뒤 공백 표기를 가정해 실패했다. 동일 객체/revision/PNG는 이미 유지됐으며 헤더 공백을 정규화한 확인에서304와 복원까지 통과했다. 제품 실패나 자동 테스트 수로 계산하지 않는다.
- PR 후 최종 코드 검토에서 새 원본 bounds 밖이 된 로컬 신규 객체도 원본 객체와 같은 조건으로 재적용 버튼이 잠기는 문제를 발견했다. 로컬 신규 객체는 새 범위 안으로 옮긴 뒤 재적용할 수 있게 하고 기존 충돌 브라우저 시나리오에 실제 metadata 범위 축소·초안 수정·재적용 검사를 더했다. 원본 삭제/읽기 전용 source의 재적용은 계속 차단한다. 이 보완 이후의 최종 SHA를 전체 원격 검증 대상으로 사용한다.
- Fontconfig의 쓰기 불가 캐시 경고가 있었지만 PNG/build/테스트는 통과했다. GitHub connector와 git fetch/push는 가능했고 네트워크 허용 목록을 바꾸지 않았다.

### 실제 PBF 화면·HTTP 프로세스 재시작

추가 수동 브라우저 확인에서 실제 합성 street TPK와 prepared OSM이 함께 있는 서버를 실행했다. 우선 표시 PNG가 `/api/street/`인 상태에서 일반 지도 편집 진입 후 `/api/osm/`으로 전환되고 종료 후 `/api/street/`으로 돌아오는 것을 확인했다. map-info/타일 API를 모의하지 않았으며 외부 요청은 차단했다. 이 수동 확인을 자동 브라우저67개에 더하지 않는다.

캡처는 생성 CC0 PBF → production schema2 SQLite를 사용했다. 브라우저 회귀의 손으로 구성한 SQLite fixture와 구분한다. 원본 PBF SHA256 `eccc5bddd45f31710c04a5d13f878a7dbcdf5d97e3aa38dfc61f1a1fb6e7cb19`, SQLite SHA256 `0e6f885e693a20a4abd6aeb8583352bb4cb958759050553c77d58f42eb082923`. 캡처 전후 동일하며 manifest에도 기록했다. 충돌은 published set 복사본+metadata 교체와 실제 API 저장으로 재현했고 원본 metadata 복구/테스트 수정 해제까지 확인했다.

격리된 같은 폴더로 실제 production HTTP 서버를 재시작했다. 재시작 전 local Point를 저장하고 `/api/osm/16/55750/25597`이 base와 달라지는 것을 확인했다. 기존 프로세스 종료 후 새 프로세스에서 동일 store revision5·이름/좌표/key/state와 PNG SHA256 `b30686c9b08cdb467cd52dcd32f970b9cbec02aa70fd41a632608304cd412cda` 유지, 동일 ETag와 If-None-Match304, private/no-cache를 확인했다. 테스트 기록만 restore하여 빈 수정 저장소로 돌렸다. 이는 독립 Store/renderer 프로세스 단위 검증과 별도의 실제 HTTP 서버 재시작 실험이다.

### 원격 증거·제한

최종 SHA·PR/병합·PR/main push별 Map/Design run URL·실제 테스트 수·job 결과·7일 artifact ID는 **원격 실행 후 [이슈 #18](https://github.com/JaewonYe/map_service/issues/18)의 완료 댓글**에 남긴다. 이전 SHA/로컬 결과를 최종 원격 성공으로 보고하지 않는다. README와 이 문서의 과거 이슈 수는 해당 시점 기록이며 현재 수는 위97/67/10을 기준으로 한다.

실제 사용자 PBF/시설 데이터·대한민국 전체 성능·Windows11/Ubuntu24.04 실기·다중 서버 동시 쓰기/인증 운영·법적 측량 정확도·임의 태그/관계·routing topology 완전 편집은 미검증/제외다. 단일 서버의 모듈 내부 도구이며 새 공개 인증 정책을 도입하지 않았다. 원본 파일·시설 데이터·키는 커밋/CI artifact에 포함하지 않는다. 상위 gitlink는 별도 통합용 최종 SHA만 보고한다.
