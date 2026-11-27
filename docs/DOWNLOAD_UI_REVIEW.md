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

## 웹 지도 삭제·초기화·복원 검토

프로젝트 platform-ui-design과 MASTER/IMPLEMENTATION, 로컬 reference 양 테마/크기, UI UX Pro Max의 `destructive action undo confirmation` 검색(확인·결과 전달), Web Design Guidelines 번들 기준을 적용했다. 공통 디자인 자산/토큰은 변경하지 않았다.

| Desktop Light | Desktop Dark | Mobile Light | Mobile Dark |
| --- | --- | --- | --- |
| [초기화 확인](ui/map-maintenance/desktop-light-confirm.png) | [초기화 확인](ui/map-maintenance/desktop-dark-confirm.png) | [초기화 확인](ui/map-maintenance/mobile-light-confirm.png) | [초기화 확인](ui/map-maintenance/mobile-dark-confirm.png) |

[Manifest](ui/map-maintenance/manifest.json) / `scripts/capture-map-maintenance-review.ts`: production build의 실제 Next.js HTTP와 **production Docker worker(network none/read-only image)**를 연결했다. CC0 합성 TPK·manifest·초기 작업/등록부를 만든 뒤 UI에서 전체 초기화→백업 복원→개별 삭제→복원을 실제 실행했다. 초기화 뒤 jobs0/활성0/수동 위성 unavailable, 복원 뒤 jobs2/위성2/19레벨 실제 PNG 픽셀, 개별 삭제 뒤 jobs1/위성1과 다시 복원을 확인했다. 원본·수동 지도·시설·OSM 수정·설정 sentinel은 보존됐다. 실제 production의 ZIP 업로드 route와 초기화 route를 동시에 호출해409·중단 업로드의 부분 파일 청소도 확인했다. 최초 지도 준비 작업의 completed는 fixture이며, 이번 정리/복원 상태는 실제 worker 결과다. 공식 imagery 다운로드 증거가 아니다. 외부 요청0,1440×900/390×844 가로 넘침 없음.

재현: `docker build -f scripts/downloads/Dockerfile -t map-service-download-worker:maintenance .`, `NEXT_TELEMETRY_DISABLED=1 npm run build`, `npx tsx scripts/capture-map-maintenance-review.ts`. 자체 `.cache/map-maintenance-review` 자료만 정리하고 테스트 컨테이너를 종료한다. 호스트에 Docker·Chromium이 필요하며 기존 실제 data 폴더를 초기화하는 스크립트가 아니다.

검토 결과: `components/MapDataMaintenance.tsx`의 named section/heading/inline confirmation group·연결된 label/name/자동완성 off·정확한 확인 문구·disabled/진행/실패 텍스트·aria-live·danger/on-danger·visible focus를 확인했다. 확인창을 열면 제목으로, 취소하면 실행 버튼으로 포커스가 돌아간다. 충돌 시 문구/스냅샷 revision을 보존하고 오류에 포커스한다. 초기화 범위·적용 중 선택 해제·관련 재등록 기록·백업이 공간을 사용한다는 설명이 실제 처리와 일치한다. 터치44px·체크 라벨·모바일 줄바꿈과 양 테마 명암비를 유지했다. 전체 초기화는 외부 CLI/준비 도구를 먼저 종료하도록 안내한다. 서버가 연결되지 않거나 구 worker이면 지원 조건과 disabled 상태를 표시한다. 테마 전환·OS 변경·저장 불가·초기 hydration·지도/폼 상태·시설/경계/OSM 편집 회귀를 기존 브라우저 전체 검증에 포함한다.

## 위성 표시 선택·전체 선택/해제 검토

사용자 확인 범위는 위성 지도 우선이다. platform-ui-design/MASTER/IMPLEMENTATION과 로컬 reference의 양 테마·크기를 비교했다. UI UX Pro Max의 `selection status feedback` 검색 중 Submit Feedback 권고(요청 중→성공/오류 전달)와 Web Design Guidelines 번들 규칙을 적용했다. 공통 토큰·디자인 자산은 변경하지 않았다.

| Desktop Light | Desktop Dark | Mobile Light | Mobile Dark |
| --- | --- | --- | --- |
| [선택 화면](ui/map-selection/desktop-light-selection.png) | [선택 화면](ui/map-selection/desktop-dark-selection.png) | [선택 화면](ui/map-selection/mobile-light-selection.png) | [선택 화면](ui/map-selection/mobile-dark-selection.png) |

[Manifest](ui/map-selection/manifest.json), `scripts/capture-map-selection-review.ts`: 실제 production Next.js HTTP와 production Docker worker(network none/read-only)를 사용했다. CC0 전국0–13·지역14/16/19·중첩16 패키지/초기 완료 기록 fixture를 만든 뒤 실제 UI에서 전체 선택→적용→전체 해제→적용→새로고침→지역만 선택을 실행했다. 초기 completed는 fixture, select 작업은 실제 worker 결과다. 14/19 지역 파랑, 같은 범위16의 나중 선택 빨강, 지역 밖13 초록의 HTTP 실제 PNG/native 헤더를 확인했다. 단색 지도는 CC0 합성 영상이며 공식 위성 수신/coverage 증거가 아니다.

전체 해제 뒤 미리보기 타일0/위성 unavailable/수동 TPK 자동 대체 없음, 새로고침 상태 유지, 지역만 선택 시 미선택 중첩 자료 제외를 확인했다. 선택 적용 중 지도 카메라·줌·입력 좌표·사각형 유지, 영역 보기 뒤 입력 사각형 유지, manifest/TPK/maps.json 해시·원본/ZIP·시설/OSM 수정 sentinel 보존을 확인했다. 외부 요청0,1440×900/390×844에서 가로 넘침 없음. 첫 캡처 실행은 스크립트의 잘못된 CSS selector로 중단됐으며 실제 `.download-map`으로 수정 후 전 동작/4장 캡처를 통과했다.

검토: named section/순서 있는 제목·네이티브 체크박스와 클릭 라벨/name·버튼/링크 구분·visible focus·44px 컨트롤·비활성/진행/오류 상태·aria-live 개수·오류 포커스를 유지한다. 체크 초안/적용 상태를 문자로 구분하고 충돌 시 입력과 원래 revision을 보존한다. 많은 패키지는 스크롤 목록/content-visibility로 처리하고 긴 이름은 줄바꿈한다. 모바일에서도 적용 버튼을 목록 앞에 두고 상단 미리보기 이동 링크를 제공한다. 빈 목록/권한 미확인/구 worker 조건을 설명한다. 회귀80개는 두 선택 시나리오와 기존 테마/지도/시설/경계/OSM 편집을 포함한다.

재현: `docker build -f scripts/downloads/Dockerfile -t map-service-download-worker:selection .`, `npm run build`, `npx tsx scripts/capture-map-selection-review.ts`. 자체 `.cache/map-selection-review`만 사용하며 실제 data 폴더를 변경하지 않는다. Docker/Chromium이 필요하고 테스트 컨테이너는 종료한다.

## 범용 다운로드·사용자 지정 level 검토 (2026-11-27)

다운로드 페이지의 브랜드/브라우저 제목·기본 작업명과 고정 지역 프리셋·초기 사각형을 일반화했다. 세계 국가 개요는 초기 탐색용이며 다운로드 영역은 명시 선택 전까지 없다. 사용자 지정 상세도의 위성 최소·최대 level은 숫자 필드로 노출한다. platform-ui-design/MASTER/IMPLEMENTATION 및 로컬 reference 양 테마·크기, UI UX Pro Max의 `numeric input validation` 검색(Input Types/Input Labels/Inline Validation 권고), Web Design Guidelines 번들 기준을 적용했다. 공통 토큰/디자인 자산은 유지했다.

| Desktop Light | Desktop Dark | Mobile Light | Mobile Dark |
| --- | --- | --- | --- |
| [사용자 지정](ui/generic-download/desktop-light-custom.png) | [사용자 지정](ui/generic-download/desktop-dark-custom.png) | [사용자 지정](ui/generic-download/mobile-light-custom.png) | [사용자 지정](ui/generic-download/mobile-dark-custom.png) |

[초기 화면](ui/generic-download/desktop-light-initial.png) / [manifest](ui/generic-download/manifest.json). 실제 production Next.js HTTP와 빈 전용 review 데이터 폴더를 사용했다. mock 응답/worker/제공처 인증·다운로드는 사용하지 않았으며 worker 미연결을 그대로 표시한다. 양 테마에서 헤더/제목·고정 지명 부재/미선택 사각형/사용자 지정0–13/역전·빈 값 오류·기본 상태를 확인했다. 1440×900/390×844 가로 넘침 없음, 포커스한 입력이 sticky header/footer에 가리지 않음, 외부 요청0. 처음 캡처의 모바일 필드가 화면 아래에 잘려 보여 입력을 가운데로 스크롤하도록 캡처 스크립트를 보완한 뒤 4장을 다시 확인했다. 이는 제공처 실원본/coverage 검증이 아니다.

검토 파일: `app/downloads/page.tsx:4` 제목 override와 일반 브랜드, `components/DownloadManager.tsx:25` 별도 입력 초안/계획 무효화, `components/DownloadManager.tsx:31` 정수·범위·순서·확인 LOD 검사, `components/DownloadManager.tsx:60` label/id/name·number/min/max/step/inputMode·autocomplete·aria-invalid/describedby/문자 오류 안내, `components/DownloadAreaMap.tsx:8` 세계 개요와 `:32` null 사각형 처리. 네이티브 키보드·버튼·visible focus·양 테마 컨트롤·44px 터치를 유지하며 새로운 확인창/외부 타일/테마 변형은 추가하지 않았다. 초기 타입검사에서 nullable viewTarget 타입을 좁혀 수정한 뒤 typecheck/build와 전체 브라우저82개를 통과했다. 신규2개는 실제 계획/queue에 영역·level 보존 및 capability 갱신/테마/프리셋 전환 시 초안 유지와 오류 차단을 검사한다. 기존 테마/시설/경계/OSM 편집 회귀도 포함한다.

재현: `npm run build`, `node scripts/capture-generic-download-review.mjs`. 자체 `.cache/generic-download-review`만 사용하며 실제 data/env를 변경하지 않는다. Chromium이 필요하며 테스트 서버는 종료한다.
