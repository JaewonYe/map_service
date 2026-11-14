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
