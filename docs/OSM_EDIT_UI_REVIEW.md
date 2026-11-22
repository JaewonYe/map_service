# 일반 지도 편집 화면 검토 — #18

2026-11-22. 기준은 [platform-ui-design](../.agents/skills/platform-ui-design/SKILL.md) → [MASTER](../design-system/platform/MASTER.md)/[IMPLEMENTATION](../design-system/platform/IMPLEMENTATION.md)/reference.html/themes.json → UI UX Pro Max → Web Design Guidelines 순서다. 로컬 reference의 desktop/mobile 양 테마를 다시 열어 비교했다. 공통 snapshot/lock/토큰은 수정하지 않았다.

UX 검색 `map selection dragging alternatives --domain ux`의 Map Keyboard/Non-Drag, Alt Text, Cluster Dense Points 권고를 확인했다. viewport 목록·겹친 후보·숫자 좌표/선택/삽입/삭제 버튼을 적용하고 기존 Leaflet 핸들 수명을 재사용했다. 지도 픽셀에는 테마 필터를 적용하지 않았다.

## 실제 앱 캡처

production build, localhost:3120, desktop1440×900/mobile390×844. 외부 호스트를 차단했다. [manifest](ui/issue-18/manifest.json)에는 viewport/theme/camera/zoom/원본 해시를 기록했다. 아래 16개 기본 상태와 모바일 내부 스크롤 4개를 합해 **20 PNG**다.

| 화면 | 선택 | 편집 | 삭제 확인 | 충돌 |
| --- | --- | --- | --- | --- |
| Desktop Light | [PNG](ui/issue-18/desktop-light-selected.png) | [PNG](ui/issue-18/desktop-light-editing.png) | [PNG](ui/issue-18/desktop-light-delete-confirm.png) | [PNG](ui/issue-18/desktop-light-conflict.png) |
| Desktop Dark | [PNG](ui/issue-18/desktop-dark-selected.png) | [PNG](ui/issue-18/desktop-dark-editing.png) | [PNG](ui/issue-18/desktop-dark-delete-confirm.png) | [PNG](ui/issue-18/desktop-dark-conflict.png) |
| Mobile Light | [PNG](ui/issue-18/mobile-light-selected.png) | [PNG](ui/issue-18/mobile-light-editing.png) | [PNG](ui/issue-18/mobile-light-delete-confirm.png) | [PNG](ui/issue-18/mobile-light-conflict.png) |
| Mobile Dark | [PNG](ui/issue-18/mobile-dark-selected.png) | [PNG](ui/issue-18/mobile-dark-editing.png) | [PNG](ui/issue-18/mobile-dark-delete-confirm.png) | [PNG](ui/issue-18/mobile-dark-conflict.png) |

모바일 내부 스크롤: 편집 필드 [Light](ui/issue-18/mobile-light-editing-fields.png)/[Dark](ui/issue-18/mobile-dark-editing-fields.png), 충돌 복원 버튼 [Light](ui/issue-18/mobile-light-conflict-actions.png)/[Dark](ui/issue-18/mobile-dark-conflict-actions.png). 작은 패널에 모든 필드를 한 번에 넣지 않고 내용을 스크롤하며 고정 footer를 유지한다. 캡처마다 보이는 스크롤 위치가 다르다.

### 데이터 출처

`tests/osm_fixture.py`가 생성한 **CC0 합성 PBF를 실제 production prepare.py로 변환한 SQLite**다. 선택은 way:103 `Test building`, 충돌은 node:24 `태안 시험지명`이다. 브라우저 회귀의 수작업 SQLite fixture와 구분한다. 사용자 PBF/시설을 사용하지 않았다. 큰 초록 면과 단순 도로는 이 합성 지형이며 실제 태안 현황/표준 OSM 스타일을 뜻하지 않는다.

PBF SHA256 `eccc5bddd45f31710c04a5d13f878a7dbcdf5d97e3aa38dfc61f1a1fb6e7cb19`, 원본 prepared SQLite SHA256 `0e6f885e693a20a4abd6aeb8583352bb4cb958759050553c77d58f42eb082923`. 캡처 전후 동일하다. 충돌 화면은 실제 API로 로컬 수정을 저장한 뒤 **published set의 복사본**에서 원본 이름/fingerprint를 변경하고 metadata를 교체해 생성했다. 종료 시 기존 metadata를 복구하고 테스트 수정만 해제했다. 원본 PBF/base 파일을 수정하지 않았다. 캡처 도구는 `scripts/capture-osm-edit-review.mjs`이며 정확한 fixture 해시·빈 격리 저장소를 검사한다.

## 시안 비교

| 항목 | 검토 결과 |
| --- | --- |
| 배치/글꼴 | 기존 56px 헤더·320px sidebar·지도·하단 좌표 골격, 같은 글꼴/14px 폼·제목 위계 유지 |
| Light/Dark | 남색/청록 surface/foreground/control/focus/danger/warning 의미 토큰, native select 배경·글자 유지. 지도 원본 색상은 동일 |
| 상태 구분 | 선택 source/key/분류/형상/state, 점선+숫자 핸들 초안, 대상 이름을 포함한 빨간 삭제 확인, 문장으로 설명하는 황색 충돌 |
| 모바일 | 390px 가로 overflow 없음. 지도 pan으로 객체를 패널 위로 볼 수 있고 줌/축척/출처/좌표가 남는다. 내부 스크롤과 고정 저장·취소·종료 유지 |
| 조작 | 44px 폼/버튼·터치 핸들, 선택 목록/좌표/정점 버튼 대안. 지도 선택 후보는 최대 10개. 모드 중 시설/측정 조작은 잠금 |
| 접근성 | 명시적 label/name·semantic button/select/details, focus ring·패널/오류 초점, 상태 live region, 종료 시 지도 초점 복귀. 테마/크기 변경은 초안 유지 |
| 오류/대기 | 저장 중 fieldset/footer 잠금과 저장 중 문구, 조회/실패/빈 화면 구분, 오류 후 입력 보존, 늦은 선택 응답 무시 |

## Web Design Guidelines 파일·줄 검토

번들 [references/command.md](../.agents/skills/web-design-guidelines/references/command.md)의 전체 규칙으로 아래 변경 파일을 검토했다. 수정 결과 및 의도적 적용 범위다.

- `components/MapOsmEditor.tsx:30` — pass: 패널/오류 초점·이벤트 정리·beforeunload. 지도 클릭만 강제하지 않으며 목록 대안 제공.
- `components/MapOsmEditor.tsx:76` — pass: 명시적 폼 label/id. 초기 wrapping select label의 옵션 포함 accessible name 문제를 수정.
- `components/MapOsmEditor.tsx:96` — pass: 이름/좌표 name·autocomplete·숫자 inputMode, 입력 유지·정점 오류 live output. 붙여넣기 차단 없음.
- `components/MapOsmEditor.tsx:110` — pass: 삭제/복원/초안 폐기 확인과 대상 이름, 확정 전 변경 없음.
- `components/MapOsmEditor.tsx:114` — pass: 고정 footer 저장/취소, 요청 중 잠금·대기 문구. 유효하지 않은 geometry는 저장 버튼 비활성+구체적 이유로 설명.
- `components/MapCanvas.tsx:140` — pass: 명시적 편집 진입, OSM 레이어 전환, 종료 시 이전 지도/초점 복귀. 외부 font/tile 의존성 추가 없음.
- `components/MapBuildings.tsx:127` — pass: 비활성 상태에서 시설 레이어 제거/복구, 시설 컴포넌트를 언마운트해 검색 상태를 잃지 않음.
- `components/useMapEditHandles.ts:24` — pass: OSM/시설 대상별 accessible name과 선택 상태, 키보드 선택/좌표 대안, 드래그 중 마커 인스턴스 유지.
- `app/globals.css:166` — pass: 의미 토큰·긴 문자열 wrapping·목록 content-visibility와 내부 스크롤. 기존 :focus-visible/44px/overscroll/reduced-motion 규칙 재사용.

임시 편집 모드/미저장 초안은 URL에 직렬화하지 않는다. 지도 객체 목록은 최대 200개에 content-visibility, 수정 내역은 50개씩 제한한다. 참조 시안의 허구 시설/예약 상태를 복제하지 않는다. 실제 보조기기·OS 실기·접근성 인증 검증은 수행하지 않았다. 디자인 무결성 검사와 이 실제 앱 검토는 별도 증거다.

## 기능 검증 연결

Node 앱 97개+도구 5개, 브라우저 전체 67개(기존 59+신규 8), 변환 DEM3/PBF7, Python 도구5와 디자인 검사를 기록한다. 최종 SHA의 원격 결과는 [이슈 #18](https://github.com/JaewonYe/map_service/issues/18) 완료 댓글 및 [VALIDATION](VALIDATION.md#이슈-18-오프라인-osm-일반-지도-편집) 참조. 실제 사용자 데이터·대한민국 전체 성능·Windows/Ubuntu 실기 검증으로 확대 해석하지 않는다.
