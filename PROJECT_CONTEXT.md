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
- 현재 표현은 지점 마커다. 면/경계 편집, 플랫폼 시설 ID 연계, 공통 인증과 다중 서버 운영은 후속 범위다.

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
- 검증에 검색 단위 3개와 브라우저 7개를 추가한다. 실제 실행 수·최종 SHA/run URL은 검증 문서와 이슈 #9 완료 댓글에 기록한다.
