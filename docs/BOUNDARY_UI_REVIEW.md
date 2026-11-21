# 시설 경계 UI 검토 (#11)

2026-11-21. 작업 중 main에 추가된 공통 디자인 스냅샷 `5f365d30f4967eb6a23a9c37d6b77be5ba96b091`을 병합해 적용했다. 공통 파일/스킬/lock은 수정하지 않았다. [MASTER](../design-system/platform/MASTER.md), [토큰](../design-system/platform/tokens.css), UI UX Pro Max와 Web Design Guidelines의 번들 지침을 읽었다. 기존 지도 화면 전체 리디자인은 범위에 포함하지 않는다.

## 로컬 권고 조회

- `map drawing keyboard alternative --domain ux`: Web용 Map Text Alternative, Map Keyboard and Non-Drag Navigation 확인. 좌표 입력·시설 목록/마커·지도 이동 버튼과 기존 Leaflet 키보드 처리를 유지한다. 수천 개 점의 군집화 권고는 이번 단일 경계 편집 검증으로 완료했다고 간주하지 않는다.
- `focus not obscured --domain ux`: AA 최소/AAA 향상 기준을 구분했다. 내부 스크롤로 입력/저장 버튼이 초점 이동에 따라 보이고 지도/편집창/하단 도구를 각각 사용할 수 있는지 모바일에서 확인했다.
- `controlled input accessibility --stack nextjs`: 입력 검증/안전한 렌더링 결과를 확인했다. 이 결과를 포커스 권고로 전용하지 않았다. 서버 경계 검증과 React/DOM textContent 렌더링을 유지하며 새 HTML 삽입/패키지/외부 폰트 요청은 없다.
- `python3 scripts/check_design_skills.py`: 87개 locked asset·2개 스킬·실제 로컬 검색 무결성 통과. 앱 UI 테스트와 별도 결과다.

## 파일별 검토 결과

- `app/globals.css:89` — 패널 본문/입력/컨트롤의 임의 색상과 작은 버튼을 공통 토큰으로 수정. 로컬 글꼴, 패널 8px/컨트롤 6px, 입력 16px·보조 14px, 44px 버튼/입력, hover/active/disabled/focus, 내부 스크롤·safe-area 여백 적용.
- `app/globals.css:111` — 저장/경계 시작은 청록 주요 동작, 제거는 위험 색상과 확인 흐름. 흰 표면 기준 계산 명암비: 본문 14.10:1, 주요 버튼 5.47:1, 입력 식별 경계 4.76:1, 포커스 5.17:1, 위험 텍스트 6.47:1. 실제 지도 이미지 위의 모든 벡터 선 대비를 인증한 결과는 아니다.
- `components/FacilityBoundaryEditor.tsx:21` — 변경된 초안이 있으면 브라우저 이탈 경고 연결. 명시적인 취소/Esc/다른 시설 선택은 이슈 요구대로 초안을 저장하지 않는다.
- `components/FacilityBoundaryEditor.tsx:27` — 실패 안내로 키보드 초점 이동, 입력/저장 경계 보존 및 구체적 재시도/재조회 안내.
- `components/FacilityBoundaryEditor.tsx:75` — 대상 시설명·정점 수·면적/둘레·미저장/저장 선 구분을 텍스트로 제공. 색만으로 상태를 구별하지 않는다. 필수 조작에 실제 버튼과 명시적 label 사용.
- `components/FacilityBoundaryEditor.tsx:89` — 정점 입력에 name/autocomplete/inputmode/숫자 범위 추가. 좌표로 정점 추가·수정 가능하며 드래그를 강제하지 않는다.
- `components/FacilityBoundaryEditor.tsx:103` — 저장 중 disabled/aria-busy와 로딩 문구. 유효하지 않은 도형은 저장할 수 없고 이유를 live output으로 안내한다(일반 가이드의 항상 활성 submit 권고보다 이슈의 도형 검증 요구를 우선).
- `components/MapBuildings.tsx` — 저장 경계 키보드 Enter/Space 상세, 편집 중 클릭은 지도 점 선택으로 전달. 상세에는 경계 추가/수정/제거 확인, 날짜 Intl 표시, 안전한 일반 텍스트와 포커스 복귀를 유지했다. 기존 일반 입력에 name/autocomplete와 연락처 type도 보완했다.

## 시각·기능 확인과 한계

Playwright 경계 시나리오에서 데스크톱/모바일(390×844) 편집·저장 스크린샷을 생성해 검토했다. 실제 지도 점 선택/기존 경계 내부 재그리기·초점/44px·좌표 수정·Enter 저장·제거·Esc·기존 측정 보존은 브라우저 회귀에 포함한다. main 디자인 기준 반영 후 전체 43개가 통과했으며 원격 최종 SHA 결과는 [검증 기록](VALIDATION.md)과 이슈 완료 댓글에 별도로 남긴다.

외부 접근성 인증, 실제 스크린 리더/터치 기기, 모든 지도 배경의 선 대비, 확대 글꼴/모든 회전 화면, 대규모 시설 목록 군집화·가상화는 검증하지 않았다. 필터 URL 동기화·기존 화면 전체 토큰 전환은 이번 범위 밖이며 승인된 플랫폼 업무/계약을 추가하지 않는다.
