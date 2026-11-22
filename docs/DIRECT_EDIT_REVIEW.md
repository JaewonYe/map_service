# 이슈 #16 대표 지점·경계 정점 직접 편집 검토

2026-11-22(KST). 기준 main `f28e4f050d98bfc9f0835761db8464e94a0de961`. 기존 #13 전체 UI/테마와 #11 경계 검증을 유지했다. 기존 숫자 좌표 수정과 시설 삭제는 재사용하며 새 지도 편집 동작과 구분한다.

## 기준과 촬영

platform-ui-design, MASTER/IMPLEMENTATION/themes/tokens와 참고 HTML 지도 모듈을 Light/Dark × 데스크톱/모바일로 직접 열었다. 로컬 UI UX Pro Max `dragging alternative keyboard`는 Dragging Movements/Map Keyboard and Non-Drag Navigation/Keyboard Navigation 3건, React `event cleanup refs`는 effect 정리·타입·ref 3건을 반환했다. 번들 Web Design Guidelines references/command.md로 아래 변경 UI를 검토한다. 공통 스냅샷/lock/reference는 바꾸지 않았다.

실제 앱 `http://127.0.0.1:3120/`의 Next production/Leaflet/시설 API에서 촬영한다. 별도 `.cache/ui-16-data`의 합성 시설 1개와 CC0 합성 catalog TPK만 사용한다. 녹색/빨강/파랑 픽셀은 합성 지도 데이터이며 실제 위성/DEM/다크 벡터 지도 품질의 증거가 아니다. 외부 타일/CDN·사용자 데이터/키를 추가하지 않았다.

`scripts/capture-direct-edit-review.mjs`는 서버의 CC0 catalog 및 예상 시설명/설명을 검사해 예상하지 못한 데이터면 중단한다. 비어 있는 격리 저장소만 준비하며 저장/삭제는 확정하지 않는다. 시작/종료 레코드가 같은지도 확인한다. 크기·테마·카메라·미저장 상태는 [manifest](ui/issue-16/manifest.json)에 기록한다. 모바일은 지도 키보드 이동으로 핸들을 편집 패널 위 작업 공간에 둔다. 원본 PNG 16장(주요 상태 12장 + 모바일 스크롤 대안 4장)은 저장소에 보관하여 임시 경로나 만료 artifact만 남기지 않는다.

| 조건 | 대표 지점 이동 초안 | 정점 편집·선택·삽입 핸들 | 기존 시설 삭제 확인 |
| --- | --- | --- | --- |
| 1440×900 Light | [이동](ui/issue-16/desktop-light-position.png) | [정점](ui/issue-16/desktop-light-vertices.png) | [삭제](ui/issue-16/desktop-light-delete-confirm.png) |
| 1440×900 Dark | [이동](ui/issue-16/desktop-dark-position.png) | [정점](ui/issue-16/desktop-dark-vertices.png) | [삭제](ui/issue-16/desktop-dark-delete-confirm.png) |
| 390×844 Light | [이동](ui/issue-16/mobile-light-position.png) | [정점](ui/issue-16/mobile-light-vertices.png) | [삭제](ui/issue-16/mobile-light-delete-confirm.png) |
| 390×844 Dark | [이동](ui/issue-16/mobile-dark-position.png) | [정점](ui/issue-16/mobile-dark-vertices.png) | [삭제](ui/issue-16/mobile-dark-delete-confirm.png) |

모바일 스크롤 대안: [Light 좌표](ui/issue-16/mobile-light-position-coordinates.png) · [Dark 좌표](ui/issue-16/mobile-dark-position-coordinates.png) · [Light 정점 선택/삭제](ui/issue-16/mobile-light-vertices-controls.png) · [Dark 정점 선택/삭제](ui/issue-16/mobile-dark-vertices-controls.png). 본문을 스크롤해도 저장/취소 footer와 줌 영역은 보존된다.

## UI 검토

- `components/FacilityPositionEditor.tsx:17`, `:54`, `:68`: 명시적 모드·원래/미저장 좌표·대표 지점만 이동 안내, 저장 전 API 불변, 실패 입력·충돌 안내/오류 초점, beforeunload, Esc·숫자 입력·원래 위치 복원. 기존 PUT/If-Match를 재사용한다.
- `components/FacilityBoundaryEditor.tsx:48`, `:109`, `:114`: 정점 선택 label/select, 명시적 선택 삭제와 삼각형 최소 안내, 128개 제한, 좌표 대안·삽입 후 퇴화 오류 안내, 직전 조작 되돌리기. 기존 저장 전 검증과 서버 정규화를 그대로 사용한다.
- `components/useMapEditHandles.ts:17`, `:24`, `:37`: 44px 히트 영역·번호/+와 실제 접근 가능한 이름·Enter/Space, 선택 pressed 상태·focus, 드래그 중 마커 인스턴스 유지. 시설 전환/종료/저장 시 이벤트와 레이어를 정리한다. 핸들 클릭은 지도 끝 추가로 전파하지 않는다. 정점이 삽입 핸들보다 위에 있어 꼭짓점 중심을 가로채지 않는다.
- `components/MapBuildings.tsx:91`, `:218`, `:336`: 기존 삭제 확인/DELETE 처리 한 곳을 재사용하고 삭제 결과(레코드·대표 마커·경계)를 명시한다. 저장 중 대상 전환 차단, 저장 전 전환은 초안 폐기, 위치 저장 후 새 상세/선택/목록/마커 동기화.
- `app/globals.css:141`, `:156`, `:190`: 기존 56px 헤더·320px 좌측 구조와 양 테마 표면·청록 선택 유지, 원본 지도 픽셀 유지. 편집 본문은 내부 스크롤, 저장/취소는 별도 footer, 모바일 줌·좌표 영역과 분리. 새 핸들·경고·상태는 공통 의미 토큰이며 드래그만 touch-action:none/user-select:none으로 제한한다. 일반 지도 pan/zoom/키보드는 유지한다.

선택 정점 삭제/전체 경계 제거/시설 삭제는 서로 다른 행동과 문구를 사용한다. 정점 하나 삭제는 초안이며 시설 삭제 확인은 위험 버튼과 취소 경로를 제공한다. 그리기 취소로 최소 수 미만이 된 초안은 저장 불가다. 자동 Delete/Backspace 삭제 단축키는 없다.

## 기능과 한계

마우스 드래그·Chromium 모바일 터치 이벤트·터치 삽입/삭제/저장·키보드 좌표 대안, 원본/다른 시설 격리, 새로고침, 실패/충돌·지연 저장·대상 전환, 테마/크기 전환과 기존 지도/측정·오프라인 회귀를 검증한다. 구체적 수·실패 보완·최종 SHA/PR/main CI·artifact7일 보관은 [VALIDATION](VALIDATION.md)과 [이슈 #16](https://github.com/JaewonYe/map_service/issues/16) 완료 댓글에서 확인한다. 무결성 검사를 앱 시각 증거로 대체하지 않는다.

지도 영상과 모바일 작업 패널은 업무에 맞춘 의도적 차이다. 최근 100회 되돌리기는 브라우저 편집 세션 안에서만 유효하다. 실제 사용자 데이터·실제 터치 기기·스크린 리더·Windows/Ubuntu 실기·외부 접근성 인증·대규모 성능·법적 측량 정확도·인증/운영·승인된 플랫폼 공통 계약은 미검증이다. 상위 gitlink는 별도 통합용 검증 SHA만 보고한다.
