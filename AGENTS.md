# 저장소 작업 지침

사용자가 요청한 코드 변경은 관련 검증을 마친 후,
추가 확인 없이 커밋하고 origin/main에 push한다.

## 공통 UI 디자인 스킬

UI 생성·수정·검토 작업에서는 다음 파일을 읽고 적용한다.

- [공통 디자인 기준](design-system/platform/MASTER.md)과 [색상·글꼴·간격 토큰](design-system/platform/tokens.css)
- [UI UX Pro Max](.agents/skills/ui-ux-pro-max/SKILL.md): 로컬 데이터 기반 디자인·접근성·상호작용 권고
- [Web Design Guidelines](.agents/skills/web-design-guidelines/SKILL.md): 변경한 UI의 품질 검토. 번들 references/command.md를 읽는다.

이 저장소 루트에서 `python3 .agents/skills/ui-ux-pro-max/scripts/search.py "keyboard focus modal" --domain ux`를 실행할 수 있다. 검색 결과는 권고이며 공통 토큰이나 기존 업무 규칙을 자동 덮어쓰지 않는다. 공유 기준의 원본은 platform_core이며 이 저장소의 스냅샷을 사용하면 독립 작업에서도 같은 규칙을 따른다. `python3 scripts/check_design_skills.py`로 설치 무결성과 검색 동작을 확인한다. 새 작업에서 스킬 목록을 갱신하고, 목록에 보이지 않으면 위 SKILL.md 경로를 직접 읽는다.

실제 UI 변경 시 지도/예약 업무별 배치는 허용하되 공통 색상·글꼴·컨트롤 상태를 유지하고 변경 화면의 데스크톱/모바일 검토를 기록한다. 이 설치는 공통 API·예약 정책·기술 선택·화면 전체 리디자인을 승인하는 것이 아니다.
