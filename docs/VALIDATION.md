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
- Python/GDAL/Docker 합성 변환 7개는 CI 미포함이다. 실제 사용자 TPK/DEM/PBF, Windows/Ubuntu 실기, 인증/운영과 승인된 플랫폼 계약 검증은 미실행이다. GitHub runner의 Ubuntu 테스트를 Ubuntu 실기 검증으로 표현하지 않는다.
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
