# #20 다운로드 화면·오프라인 복원 검토

2026-11-22 KST. 프로젝트 platform-ui-design을 먼저 적용하고 MASTER/IMPLEMENTATION/reference.html/themes/tokens, UI UX Pro Max의 `progress task cancel recovery` UX 검색 및 Web Design Guidelines의 번들 references/command.md를 확인했다. 공통 skill/lock/토큰/시안 자산은 변경하지 않았다. 참고 시안은 데스크톱/모바일·양 테마로 열어 비교했다.

## 실제 앱 화면

[캡처 manifest](ui/issue-20/manifest.json)는 viewport·상태·합성 자료 provenance·복원 파일 hash 증거·외부 요청 수를 기록한다. 앱의 API를 통째로 흉내 낸 캡처가 아니다. CC0 localhost 원본을 production adapters/GDAL/osmium으로 준비하고 격리된 폴더에 NoNetwork import한 실제 Next.js 앱을 사용했다. 진행 화면은 1바이트씩 흘리는 실제 HTTP 전송을 열어둔 상태다. 실패 화면은 실제 MD5 불일치 작업, 완료는 실제 검증/등록 결과다. **제공처 이름은 adapter 메타데이터이며 공식 제공처의 수신/권한 성공을 의미하지 않는다.** 합성 레코드의 ‘태안 시험지명’·고도42.5m는 실제 태안 지리/고도 주장이 아니다.

| 상태 | Desktop Light | Desktop Dark | Mobile Light | Mobile Dark |
| --- | --- | --- | --- | --- |
| 영역 선택 | [화면](ui/issue-20/desktop-light-area.png) | [화면](ui/issue-20/desktop-dark-area.png) | [화면](ui/issue-20/mobile-light-area.png) | [화면](ui/issue-20/mobile-dark-area.png) |
| 설정/예상 작업량 | [화면](ui/issue-20/desktop-light-settings.png) | [화면](ui/issue-20/desktop-dark-settings.png) | [화면](ui/issue-20/mobile-light-settings.png) | [화면](ui/issue-20/mobile-dark-settings.png) |
| 실제 전송 진행 | [화면](ui/issue-20/desktop-light-progress.png) | [화면](ui/issue-20/desktop-dark-progress.png) | [화면](ui/issue-20/mobile-light-progress.png) | [화면](ui/issue-20/mobile-dark-progress.png) |
| checksum 실패 | [화면](ui/issue-20/desktop-light-failure.png) | [화면](ui/issue-20/desktop-dark-failure.png) | [화면](ui/issue-20/mobile-light-failure.png) | [화면](ui/issue-20/mobile-dark-failure.png) |
| 격리 복원 완료 | [화면](ui/issue-20/desktop-light-complete.png) | [화면](ui/issue-20/desktop-dark-complete.png) | [화면](ui/issue-20/mobile-light-complete.png) | [화면](ui/issue-20/mobile-dark-complete.png) |

데스크톱1440×900, 모바일390×844. 긴 설정/완료 문서는 내부 또는 페이지 스크롤의 해당 상태를 캡처했으며 모든 내용을 한 viewport에 축소하지 않는다. 실제 지원 fixture LOD는16뿐이므로 설정이16으로 조정된 모습은 실제 제공처 전체 LOD 목록이 아니다. worker가 전송 후 종료되면 과거 완료 작업은 유지되고 현재 worker 미연결 경고는 사실대로 표시된다.

복원한 자료를 홈 지도에서 실제 일반/고도/위성 레이어로 전환해 로드된 이미지를 검사했고 외부 요청은0이다. 일반 지도 실제 표시도 [Light](ui/issue-20/desktop-light-offline-restored-map.png) / [Dark](ui/issue-20/desktop-dark-offline-restored-map.png)로 추가했다. 이 이미지의 일부 바깥 영역은 합성 fixture coverage 밖이다. tile 요청/고도값/hash·앱 재시작 보존 결과는 VALIDATION에 별도로 기록한다.

## 기준 비교·의도적 차이

- 56px 헤더·남색/청록·공통 글꼴·surface/border/primary/danger/focus 토큰을 사용한다. 선택·진행·실패 상태는 텍스트와 색을 함께 사용하고 앱 테마로 원본 지도 픽셀을 재색칠하지 않는다.
- 기존 홈 지도는320px 시설 패널을 유지한다. 별도 다운로드 페이지는 긴 원본 설정을 위해360px 폼 + 우측 개요/작업으로 배치했다. 업무별 배치 차이이며 공통 컨트롤 상태/테마는 같다.
- 모바일은 개요→폼→작업의 세로 흐름으로 전환한다. 한 번에 모두 보이게 압축하지 않으며 지도 줌/원본 선택/설정/실패 복구를 스크롤로 접근한다. 설정 footer는 작업 시작과 상태 이동을 제공한다. 초기에 폼 flex 높이가 축소되어 작업과 겹친 문제를 수정하고 실제 캡처/모바일 브라우저 검사로 재확인했다.
- 최초 설치 국가 개요는 110m 윤곽이라 태안 위치의 도로/시설은 보이지 않는다. 개요라는 안내, 정확한 선택 사각형, 기본 지역/시설 bbox/숫자 조정 대안을 유지한다. 데이터가 생기면 현재 로컬 지도로 전환할 수 있다.

## Web Design Guidelines 검토 (file:line)

| 파일:줄 | 검토/결과 |
| --- | --- |
| `app/downloads/page.tsx:3` | skip link/main·제목·현재 페이지 nav·장식 SVG aria-hidden·기존 ThemeControl 재사용 |
| `components/DownloadManager.tsx:33` | fieldset/legend·연결 label/name·좌표 number/inputMode·네이티브 select/checkbox·버튼/링크 구분 |
| `components/DownloadManager.tsx:19` | 제출 오류 focus와 alert, 작업/안내 role=status, 지연 응답 순서 보호, 입력 보존 |
| `components/DownloadManager.tsx:65` | 실제 downloaded/total 또는 indeterminate progress·텍스트 상태·취소 대기·재시도/ZIP·선택 aria-pressed |
| `components/DownloadManager.tsx:66` | 명시적 파일/이용 조건·크기 안내·업로드 중단, 숨은 임의 경로 입력 없음 |
| `components/DownloadAreaMap.tsx:18` | 두 점 클릭/터치·Esc, native 숫자 좌표/시설/지역 대안, 지도 제거/abort/ResizeObserver 정리 |
| `app/globals.css:205` | minmax(0,1fr)/min-width:0·긴 ID/파일명 줄바꿈·44px 입력/버튼·선택/disabled·공통 focus-visible |
| `app/globals.css:250` | 모바일 세로 스크롤·폼 축소 방지·고정 footer와 keyboard/resize·가로 넘침 회귀 검사 |

위 검토에서 남은 기능 차단 UI 결함은 발견하지 않았다. 접근성 인증·스크린리더 실기·Windows 터치 실기는 수행하지 않았다. 이번 캡처는 위 네 조합이며 System의 저장/OS 추종과 기존 시설/편집·측정 상태 보존은 기존 자동 회귀 검사로 확인했다.

## 재현

production worker 이미지로 `tests/fixtures/downloads-proof.py <새 격리 폴더> --progress`를 실행하고 해당 isolated 디렉터리를 MAP_DOWNLOADS_DIR로 지정한 실제 앱을 띄운다. `scripts/capture-download-review.mjs`의 고정 증거 경로/포트3120에 맞춰 캡처한다. 완료된 fixture의 다른 상태를 다시 캡처할 때만 `--reuse-progress`를 사용한다. 동일 progressJob의 기존 네 실제 진행 이미지만 유지하며 새 가짜 진행 상태를 만들지 않는다. localhost 외 요청을 차단·계수하고 실제 지도 이미지는 opacity/네트워크 완료를 기다린다. 단위/API mock 시나리오와 이 수동 격리 앱 증거, 공식 제공처 연결 실패는 서로 다른 검증이다.

## 위성 패키지 동시 표시 후속 검토

다운로드 화면의 ‘함께 표시할 위성 패키지’ 수·합성 기준·이전 지역 재등록 안내와 선택 작업의 현재 합성 포함 여부를 추가했다. 기존 남색/청록 토큰·조회/등록 버튼·키보드 동작을 사용하고 지도 픽셀/CSS/테마 구현은 변경하지 않았다. `platform-ui-design`과 MASTER/IMPLEMENTATION/로컬 reference 양 테마, `UI UX Pro Max`의 status feedback 검색(제출 결과 표시), Web Design Guidelines 번들 기준을 적용했다.

| Desktop Light | Desktop Dark | Mobile Light | Mobile Dark |
| --- | --- | --- | --- |
| [화면](ui/satellite-coexistence/desktop-light.png) | [화면](ui/satellite-coexistence/desktop-dark.png) | [화면](ui/satellite-coexistence/mobile-light.png) | [화면](ui/satellite-coexistence/mobile-dark.png) |

[캡처 manifest](ui/satellite-coexistence/manifest.json), 재현 스크립트 `npx tsx scripts/capture-satellite-review.ts`(먼저 production build). 실제 Next.js/로컬 카탈로그/타일 API를 사용하지만 패키지는 CC0 합성 PNG와 수동 구성한 등록부/완료 작업 fixture다. 이 화면의 completed는 worker 실행 증거가 아니며, worker32 시험과 구분한다. worker를 띄우지 않아 미연결 경고가 그대로 보인다. HTTP에서13레벨 개요/14·16·19레벨 상세의 픽셀과 native zoom 헤더, 지역 밖13레벨 대체를 확인했다. 외부 요청0,1440×900/390×844에서 가로 넘침 없음. 실제 전국·태안 원본을 합성해 캡처한 화면은 아니다.

검토: `components/DownloadManager.tsx` 새 named section은 개수·선택 기준을 색과 무관한 텍스트로 전달하고 기존 카드/작업 목록·터치 높이·네이티브 버튼·포커스를 유지한다. 안내/목록/선택 카드가 양 테마·모바일에서 겹치거나 잘리지 않는 것을 확인했다. 재등록은 키보드 Enter로 현재 revision의 activate 요청 한 건만 전송하며 완료 후 개수·포함 상태가 갱신되고 재조회/새로고침에도 유지되는 브라우저 회귀를 추가했다. 기존 테마 저장/시스템 변경/저장 불가/초기 hydration/지도·폼 보존·모바일 키보드 회귀도 통과했다. 공통 디자인 자산92개/스킬3개 검사는 별도 통과했다.
