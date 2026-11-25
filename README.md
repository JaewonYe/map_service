# 오프라인 지도 — 위성영상·일반 지도·고도 지도

기존 **Next.js 16.4.5 App Router + TypeScript + Docker**를 유지합니다. Leaflet을 클라이언트에서만 로드하며, **Next.js Route Handler가 로컬 TPK를 직접 읽습니다.** 별도의 Python/FastAPI/타일 서버는 실행하지 않습니다.

## Quick Guide — Windows 11 / Ubuntu 24.04

필수: Windows의 Docker Desktop(WSL 2·Linux containers) 또는 Ubuntu의 Docker Engine + Compose v2. 개발·파일 분석에는 Node.js 22.13 이상 (24 LTS 권장)도 필요합니다.

**OSM 일반 지도부터 시작:** 다운로드한 PBF를 `data/osm/south-korea.osm.pbf` 또는 `south-korea-latest.osm.pbf`로 보관하고 Docker를 실행한 뒤 **`실행.cmd` → 3번**을 선택하세요. 새 PBF는 자동 준비하며, 완료 후 오른쪽 **일반 지도**를 선택합니다. Docker 운영은 **2번**, 수동 재준비는 **7번**입니다. DEM이 없다면 6번을 실행할 필요가 없습니다.

1. 단일 TPK는 **`data/tpk/map.tpk`**에 복사합니다. 다중 해상도는 **`data/tpk/maps.example.json` → `maps.json`**으로 복사한 뒤 TPK 파일들을 등록합니다. [여러 TPK 등록 방법](#여러-tpk-등록-방법)을 참고하세요.
2. `.env.example`을 `.env`로 복사합니다. 기존 `.env`가 있으면 필요한 항목만 반영하세요.
3. 아래 명령 또는 실행 메뉴 1로 메타데이터·이용 조건을 확인합니다. 허용된 TPK에 한해 단일 모드는 `.env`의 **`TPK_USAGE_CONFIRMED=true`**, 다중 모드는 각 `maps.json` 항목의 **`usageConfirmed: true`**를 설정합니다.
4. 일반 지도·고도 지도가 필요하면 아래 [데이터 추가](#일반-지도고도-지도-추가) 절차를 진행합니다. 기존 위성 TPK는 그대로 사용합니다.
5. 실행합니다.

```sh
docker compose up -d --build
```

브라우저: **http://localhost:3001**. 기존 `.env`를 사용한다면 `PORT=3001`로 변경하세요. Windows에서는 `실행.cmd` 메뉴 2로도 시작할 수 있습니다. 종료는 `docker compose down` 또는 메뉴 4입니다. TPK·로컬 OSM·캐시 데이터는 유지됩니다.

현재 저장소에는 **실제 사용자 TPK가 없습니다.** 실제 파일을 첨부하거나 위 위치에 준비해야 실제 형식·화질·영역 검증을 완료할 수 있습니다. 합성 테스트 패키지를 실제 Esri 영상으로 제공하지 않습니다.

## 지도에서 영역을 고르고 원본 다운로드하기

태안 CLI 실행 전에 Docker Desktop의 Linux 엔진이 실행 중인지 확인하세요. Docker 실행 실패로 요청만 저장됐다면 같은 환경에서 `node --env-file=.env.downloads scripts/download-taean.mjs --resume --accept-usage`로 단일 미완료 태안 작업을 이어서 처리할 수 있습니다. 일반 실행은 기존 미완료 작업이 있으면 새 요청을 추가하지 않습니다. [실행·재개·등록 충돌 안내](docs/DOWNLOAD_MANAGER.md)를 참고하세요.

별도 **`http://localhost:3001/downloads`** 페이지에서 사각형/시설 범위와 위성·일반·고도를 선택해 다운로드→검사·준비→등록을 요청하고, 진행·취소·재시도·이전 ZIP을 관리합니다. 최초 설치에도 번들 국가 개요가 있어 좌표를 외부 지도에서 복사할 필요가 없습니다. 상세 지도 미리보기는 현재 설치된 로컬 자료만 사용합니다.

전국 개요와 지역 상세 **다운로드 위성 패키지는 함께 등록**하며 실제 고해상도 타일을 우선 표시합니다. 이전 버전에서 교체돼 빠진 지역은 `/downloads`의 해당 작업에서 **준비된 지도 다시 등록**으로 재다운로드 없이 추가하세요. 화면의 함께 표시할 패키지 수를 확인한 뒤 지도를 새로고침합니다. ZIP은 작업별 데이터이므로 PC 이전 시 필요한 ZIP을 각각 가져오세요. [위성 합성·업데이트 호환성](docs/DOWNLOAD_MANAGER.md#전국-개요와-지역-상세를-함께-표시하기)을 참고하세요.

태안 기본값은 사용자 지정 영역의 **World Imagery for Export POST / EPSG:3857 / TPK level15–17**, **OpenTopography COP30 GeoTIFF**입니다. 원본은 `data/imagery`, `data/dem`, 작업·준비 패키지·ZIP은 `data/downloads`에 저장합니다. 검증한 기존 원본을 재사용하며 기존 시설/경계·OSM 수정·원본 폴더를 덮어쓰지 않습니다. 위성 export/이 앱의 오프라인 표시·이전 권한과 개인/Enterprise API Key 조건을 먼저 확인하세요.

Windows/Ubuntu 공용 CLI: `downloads.worker.env.example`을 기존 파일이 없을 때만 로컬 `.env.downloads`로 복사합니다. 인증값은 Git에서 제외된 이 파일 또는 **실행할 같은 터미널의 환경변수**에 안전하게 설정합니다. PowerShell 로그인 블록이 설정한 토큰/Referer는 파일에 다시 쓰지 않아도 됩니다. 현재 터미널의 값이 env-file보다 우선합니다. Docker 실행 후:

```sh
node --env-file=.env.downloads scripts/download-taean.mjs --accept-usage
```

기본 위성+고도, `--osm`은 대한민국 지역 PBF **전체 수신**을 추가하고 `--refresh`는 원본을 다시 받습니다. 웹 관리용 worker 실행·안전한 인증/수동 로그인·오프라인 복원·제한은 [다운로드 운영 안내](docs/DOWNLOAD_MANAGER.md), 라이선스와 계정별 선행 조건은 [제공처 확인](docs/DOWNLOAD_PROVIDER_LICENSES.md)을 참고하세요. 토큰/키를 채팅에 보낼 필요는 없습니다. 계정 API는 정상인데 위성 서비스가498을 반환하면 [ArcGIS 조직·Referer 로그인 안내](docs/ARCGIS_AUTH_POWERSHELL.md)를 따라 서비스 접근부터 확인하세요.

대한민국 level0–13 위성은 웹에서 **위성만 선택**하고 범위·고급 level을 지정합니다. 예시 사각형124–132E/33–39.5N은45,048후보 타일이며, 위성의 앱 상한150,000과 실제 서비스 한도 중 작은 값을 적용합니다. 고도 표시 타일은 기존10,000 한도를 유지합니다. [국가 범위 실행·worker 갱신 안내](docs/DOWNLOAD_MANAGER.md#대한민국-위성-level013)를 참고하세요. 국가 개요의 공식 실데이터 수신/표시는 별도 확인이 필요합니다.

**현재 공식 원본 전체 검증은 미완료입니다.** 클라우드의 네 공식 호스트는 프록시 CONNECT403으로 차단됐고 인증값도 연결되지 않았습니다. 사용자 Windows PC의 태안 작업6f79d3ac-65a3-4c3d-ad9d-b6d6c51fda18은 공식 TPK1,567,737바이트 수신·형식/LOD 검사, DEM 재사용/준비, ZIP·등록이 모두completed로 보고됐습니다. 실제 앱 표시/고도값·일반 지도 공식 원본·국가 범위 실데이터는 후속 확인이 필요합니다. 합성 테스트·사용자 보고·직접 파일/앱 검증을 구분합니다. [검증 기록](docs/VALIDATION.md#이슈-20-지도-다운로드관리)과 [화면 검토](docs/DOWNLOAD_UI_REVIEW.md)를 참고하세요. 클라우드의 비활성 설정 버튼을 조작하지 않아도 위 로컬 절차를 사용할 수 있습니다.

## 일반 지도·고도 지도 추가

현재 보유한 **World Imagery TPK(대한민국 0–13, 태안 14–19)는 위성영상**입니다. 이 영상의 줌을 늘려도 도로·건물명 지도나 실제 고도값이 생성되지는 않습니다. 아래 데이터를 별도로 준비해야 합니다. **데이터가 없는 레이어는 선택기에 표시되지 않으며, 오른쪽 `지도 데이터 준비`에서 상태와 필요한 파일을 확인할 수 있습니다.**

| 기능 | 필요한 데이터 | 복사할 위치 |
| --- | --- | --- |
| 일반 지도 (권장) | OpenStreetMap **`.osm.pbf` 원본** | `data/osm/south-korea.osm.pbf` |
| 일반 지도 (별도 TPK) | 도로·지명이 렌더링된 래스터 **TPK** (EPSG:3857, 256px, Compact V1/V2) | `data/street/map.tpk` |
| 고도 지도 | 미터 단위 높이를 가진 **단일 밴드 DEM GeoTIFF** (`.tif`) | `data/elevation/source/dem.tif` |

### 일반 지도

**OSM PBF를 복사한 뒤 3번을 실행했는데 일반 지도가 없었던 원인**은 기존 버전에 PBF 변환 기능이 없었기 때문입니다. 최신 버전은 PBF를 로컬 공간 색인으로 변환한 뒤 Next.js에서 일반 지도 타일을 제공합니다.

1. [Geofabrik 대한민국 다운로드](https://download.geofabrik.de/asia/south-korea.html)에서 `.osm.pbf`를 받아 `data/osm/`에 넣습니다. `south-korea.osm.pbf`와 `south-korea-latest.osm.pbf`를 모두 인식하므로 이름 변경은 선택입니다.
2. 현재 개발 서버가 실행 중이면 **Ctrl+C로 종료**하고 최신 코드를 반영합니다. `.env`와 기존 `data/`는 보존하세요.
3. Docker Desktop/Engine을 실행하고 **실행 메뉴 3**을 선택합니다. 최초에는 작업 이미지를 준비하고 PBF를 변환한 뒤 개발 서버가 시작됩니다. `npm run dev`도 사전 준비를 수행합니다. **2번 Docker 시작**에서도 새 PBF를 자동 준비합니다.
4. http://localhost:3001 을 새로고침하고 **일반 지도**를 선택합니다. 기본 선택은 기존처럼 위성영상 → 일반 지도 → 고도 지도 순서입니다.

PBF가 바뀌지 않았다면 원본 파일명·크기·수정 시간을 비교해 준비된 색인을 재사용합니다. PC 이전 등으로 시간이 달라졌지만 파일 크기가 같다면 SHA256을 확인하여 동일한 원본의 불필요한 재변환을 피합니다. 개발 서버 실행에 매번 Docker가 필요하지는 않으며 **새 PBF의 최초 준비/갱신 시**에만 사용합니다. **7번 OSM 일반 지도 준비·갱신**을 선택하면 수동으로 다시 변환합니다. 명시적으로 7번을 실행했는데 파일이 없거나 자동 변환에 실패한 경우 원인을 안내하고 기존 결과를 보존합니다. PBF가 없는 환경에서는 기존 위성/고도 지도를 그대로 실행할 수 있습니다. 입력이 준비되지 않은 상태로 서버를 직접 시작했다면 화면의 `지도 데이터 준비`에서 PBF 준비 안내를 확인할 수 있습니다.

직접 명령을 사용하는 경우 두 OS에서 다음과 같습니다. PowerShell에서는 `npm.cmd`를 사용할 수 있습니다.

```sh
# 첫 1회 변환·색인 준비 (실행 메뉴 7에 해당)
docker compose --profile tools run --rm --build prepare-osm
# 개발 실행: 새 PBF는 자동 감지·변환
npm run dev
```

준비 결과는 `data/osm/metadata.json`과 `data/osm/sets/<id>/map.sqlite`입니다. 원본 PBF는 수정하지 않고 SHA256을 기록합니다. **별도 타일 서버·Python 서버 없이 Next.js Route Handler가 공간 색인에서 필요한 도형을 조회해 PNG 타일을 생성**합니다. 지원 줌은 0–19이며 모든 줌의 전국 이미지 파일을 미리 생성하지 않습니다. 타일 응답은 ETag/캐시·중복 요청 병합·렌더링 대기열을 사용합니다. 지원 범위 밖은 404입니다.

도로·건물·지명·공원/산림·수면/해안선을 표시하는 간단한 자체 스타일입니다. 한글 지명이 있으면 우선 사용하며 Docker 이미지에 한글 폰트를 포함합니다. **openstreetmap.org 표준 스타일과 동일한 디자인은 아닙니다.** 원본에 없는 객체는 나타나지 않습니다. 열린 해안선은 추출 데이터 외곽으로 연결하므로 잘린 데이터 경계의 해안 표현에는 한계가 있습니다. 전국 PBF는 준비에 시간과 여유 디스크가 필요하며 실제 처리 시간은 파일 크기와 PC 사양에 따라 달라집니다.

입력·결과를 포함한 **data/osm 전체**를 백업하면 다른 PC로 옮길 수 있습니다. 새 PBF로 갱신할 때는 파일을 교체하고 메뉴 2/3을 다시 실행하세요. 직접 등록한 건물은 `data/buildings`에 분리되어 유지됩니다. 이전 결과 세트는 자동 삭제하지 않으므로 서비스를 중지한 뒤 현재 metadata.json이 참조하지 않는 세트만 정리합니다. 공용 OSM 타일 서버를 대량 수집하지 않으며, PBF는 [ODbL·출처 표시 조건](https://www.openstreetmap.org/copyright)에 따라 사용합니다.

추가 환경변수: `OSM_PBF_FILE`은 폴더 없는 입력 파일명(기본 `south-korea.osm.pbf`), `OSM_HOST_DIR`은 Docker 호스트 폴더, `OSM_TILE_DIR`은 개발 서버가 읽을 폴더(기본 `data/osm`)입니다. 두 실행 방식을 번갈아 쓰면 같은 폴더를 가리키도록 설정하세요. 기본 제공 경로는 동일합니다. OSM 색인에서는 `metadata.json`의 이용 확인 상태를 사용하므로 기존 `.env`의 `OSM_USAGE_CONFIRMED=false`여도 변환된 OSM이 표시됩니다. 해당 환경변수는 기존 직접 준비한 XYZ 이미지 타일용입니다.

직접 준비한 일반 지도 TPK를 사용하는 방법도 유지합니다.

1. 허용된 **일반 지도 TPK**를 위 위치에 복사하고 `.env`에 `STREET_USAGE_CONFIRMED=true`를 설정합니다. 위성용 `TPK_USAGE_CONFIRMED`와 별개입니다.
2. 여러 일반 지도 TPK가 있다면 `data/street/maps.example.json`을 `maps.json`으로 복사하고, 위성 카탈로그와 동일한 형식으로 기본/상세 TPK와 각각의 `usageConfirmed`를 등록합니다. `file` 경로는 **data/street 기준**입니다. 단일 파일은 모든 원본 줌을 사용하고, 다중 파일은 `minZoom`/`maxZoom`을 실제 데이터에 맞추세요.
3. 서비스를 재시작하고 새로고침한 뒤 오른쪽 **일반 지도**를 선택합니다. 초기 선택은 위성영상 → 일반 지도 → 고도 지도 순으로 준비된 첫 레이어입니다.

일반 지도에는 별도의 TPK 카탈로그가 적용됩니다. 겹침·우선순위·빈 상세 타일의 낮은 줌 대체 규칙은 기존 위성 지도와 같습니다. 위성 TPK와 파일을 혼합하지 마세요. 별도 TPK API에는 `.pbf`와 벡터 MBTiles를 직접 넣지 않으며, PBF는 위의 OSM 준비 절차를 사용합니다. 저장소에 남아 있는 예전 `data/vector/region.mbtiles`는 **모나코 영역의 벡터 데이터**로 태안 일반 지도 대신 사용할 수 없습니다.

기존 `data/osm/z/x/y.png` 또는 `.jpg` 로컬 OSM도 사용할 수 있습니다. TPK 일반 지도가 준비되면 우선 사용하고, 없으면 PBF로 준비한 로컬 OSM, 직접 준비한 XYZ OSM, 마지막으로 **명시적으로 MAP_MODE=online인 경우만** 공용 OSM을 사용합니다. 인터넷 연결을 켠다고 자동으로 온라인 모드로 바뀌지 않습니다. 로컬 XYZ에는 필요한 줌을 모두 준비해야 하며, TPK의 부모 타일 대체 기능은 적용되지 않습니다.

### 일반 지도 객체 편집

**지도 정보 → 일반 지도 편집**에서 준비된 로컬 OSM의 도로·건물 외곽·지명/표시 지점을 선택합니다. 이름·표시 분류·형상을 수정하거나 새 객체 유형을 선택해 추가합니다. 지도 클릭/핸들 드래그 외에 목록·정점 선택·숫자 좌표·삽입/삭제·직전 조작 되돌리기를 사용할 수 있습니다. 저장하면 실제 일반 지도 PNG가 갱신됩니다. 저장 전 초안 취소, Esc/종료/대상 전환 확인과 새로고침 경고를 제공합니다.

- 원본 객체의 **로컬 삭제**는 숨김이며 원본 파일은 유지합니다. **로컬 수정 내역 → 원본으로 복원**은 해당 수정만 해제합니다. 신규 로컬 객체를 삭제/복원하면 그 신규 기록만 제거합니다.
- 새 PBF 재준비 후 같은 source ID/fingerprint만 자동 적용합니다. 변경/삭제/지원 불가 원본은 **충돌**로 기록을 보존합니다. 최신 원본을 조회하고 **객체 수정 → 원본 검토 후 재적용**, 또는 **원본으로 복원**하세요. 원본이 없거나 읽기 전용이면 수정 해제만 가능합니다.
- 편집 대상은 prepared OSM SQLite입니다. street TPK가 먼저 보이면 진입 시 **OSM 로컬 일반 지도**로 전환하고 종료 시 이전 레이어로 돌아갑니다. TPK/XYZ PNG/온라인 OSM·위성·DEM 편집은 지원하지 않습니다. 구형 schema1은 계속 볼 수 있지만 편집하려면 **메뉴 7 또는 `prepare-osm --force`**로 원본 PBF를 재준비해야 합니다.
- 저장은 prepared bounds 안에서만 허용합니다. Point1개, 도로2–256정점, 구멍 없는 건물3–128정점, 이름 최대160자입니다. 관계/MultiPolygon/파생/분할/대형/미지원 객체는 사유를 표시하고 읽기 전용입니다. zoom14–19·현재 화면 최대200개 조회이며 과밀하면 확대하세요. 임의 태그/공유 node/라우팅망 편집은 제공하지 않습니다.

수정은 별도 **`data/osm-edits/edits.json`**에 보존합니다. Node는 `OSM_EDITS_DIR`, Compose는 `OSM_EDITS_HOST_DIR`(기본 `./data/osm-edits`) → `/data/osm-edits` 쓰기 가능 bind mount를 사용합니다. 커스텀 호스트 폴더는 미리 만들고 컨테이너 node 사용자 권한을 부여하세요. `data/osm`·수정 폴더·`data/buildings`를 함께 백업합니다. Node/Compose를 번갈아 쓰면 같은 수정 폴더를 지정하고 동시에 쓰는 서버는 하나만 운영하세요. 재준비/컨테이너 재생성으로 수정 폴더를 지우지 않습니다. 오류 시 기존 파일을 보존하고 권한/공간/백업본을 확인합니다. 오래된 탭의 409는 초안을 유지하므로 최신 정보를 확인하고 다시 선택해 편집하세요.

시설 UUID/boundary/JSON과 원본 PBF/base SQLite는 변경하지 않으며 공개 OSM으로 전송하지 않습니다. [API·저장/복구·캐시 계약](docs/OSM_EDITING.md), [실제 화면 20개와 검토표](docs/OSM_EDIT_UI_REVIEW.md), [검증 기록](docs/VALIDATION.md#이슈-18-오프라인-osm-일반-지도-편집)을 참조하세요.

### 고도 지도

**실행 메뉴 6번은 고도용 DEM `.tif` 전용입니다.** `No such file or directory: /data/elevation/source/dem.tif`는 해당 DEM이 없다는 뜻입니다. OSM에서 받은 `south-korea.osm.pbf`를 DEM으로 이름 변경하거나 고도 폴더에 넣지 마세요. OSM 원본의 보관 위치는 `data/osm/south-korea.osm.pbf`이며, PBF 일반 지도는 **7번 메뉴 또는 3번의 자동 준비**를 사용합니다. 온라인 일반 지도는 `.env`의 `MAP_MODE=online` 설정 후 서비스를 다시 실행하여 확인할 수 있습니다. DEM이 없어도 메뉴 2 또는 3으로 기존 지도를 실행할 수 있습니다.

메뉴 6은 Compose가 해석한 실제 데이터 폴더(`ELEVATION_HOST_DIR`)에서 `source/dem.tif`가 존재하는 비어 있지 않은 파일인지, 기존 변환 권한 확인값이 설정됐는지 먼저 검사합니다. 준비되지 않았다면 이미지 빌드 전에 이유와 경로를 안내합니다. 전체 GeoTIFF 형식·좌표계 검증은 GDAL 변환 도구에서 수행합니다.

**DEM은 위성 RGB 사진과 다른 수치 데이터**입니다. 태안부터 시작한다면 해당 영역을 포함하는 Copernicus DEM GLO-30 또는 SRTM 등 약 30m DEM GeoTIFF를 준비할 수 있습니다. 사용 조건과 고도 기준(해발/타원체고)을 함께 확인하고 `DEM_SOURCE`, `DEM_ATTRIBUTION`, `DEM_VERTICAL_DATUM`에 기록하세요. 측정 정확도는 원본 DEM에 따르며 확대해도 정밀도가 높아지지 않습니다.

1. 원본 DEM을 `data/elevation/source/dem.tif`에 복사합니다. 입력 좌표계는 GDAL로 EPSG:3857에 재투영합니다. RGB GeoTIFF·위성 TPK·단위가 feet인 DEM은 직접 사용할 수 없습니다.
2. 허가된 데이터의 변환·자체 웹 사용을 확인하고 `.env`에 `ELEVATION_USAGE_CONFIRMED=true`를 설정합니다. 기본 변환은 `DEM_MIN_ZOOM=8`, `DEM_MAX_ZOOM=13`입니다. 줌 19에서도 원본 최대 줌을 확대 표시하므로 해상도가 낮다는 이유로 줌 19 타일을 모두 생성할 필요는 없습니다.
3. Windows `실행.cmd`의 **6. 고도 지도 준비**를 선택하거나 두 OS에서 아래 명령을 실행합니다.

```sh
docker compose --profile tools run --rm --build prepare-elevation
docker compose up -d --build
```

이미 최신 웹 이미지가 실행 중이면 두 번째 명령 대신 `docker compose restart web`이면 됩니다. 최초 도구 이미지 빌드에는 인터넷이 필요할 수 있습니다. 변환은 로컬 파일만 읽고 **네트워크 없는 작업 컨테이너**에서 수행합니다. 추가 Python 서버는 실행하지 않습니다.

권한 확인 전 메타데이터만 검사하려면 다음 명령을 사용하세요. 변환 결과는 만들지 않습니다.

```sh
docker compose --profile tools run --rm --build prepare-elevation --inspect
```

**고도 지도**는 고도별 색상과 북서 방향 광원의 음영을 표시합니다. 범례는 해당 DEM의 최저~최고 고도이며, 어느 레이어에서든 지도를 클릭하면 **고도(m)**를 조회합니다. 고도 기준이 미확인이면 그대로 표시합니다. 경계 밖·NoData·누락 데이터는 `데이터 없음`이며, **0m와 음수 고도는 정상 값**입니다. NoData 영역은 투명하며 임의의 고도를 생성하지 않습니다. 거리·면적 측정은 기존처럼 수평 구면 기준이며 지형 경사를 반영하지 않습니다.

```text
data/
├── tpk/                       # 기존 위성 TPK + maps.json 유지
├── street/                    # 일반 지도 TPK + 선택적 maps.json
└── elevation/
    ├── source/dem.tif          # 원본 DEM, 수정하지 않음
    ├── metadata.json          # 경계·줌·고도 범위·단위·고도 기준·원본 SHA256
    └── sets/<id>/
        ├── color/z/x/y.png     # 고도 색상 + 음영, 로컬 제공
        └── height/z/x/y.png    # Terrarium RGBA 수치 고도; 투명 픽셀은 NoData
```

변환은 **각 줌에서 수치 DEM을 먼저 재투영·보간한 뒤** 높이를 PNG로 인코딩합니다. 이미 인코딩된 RGB를 축소하여 높이값을 손상시키지 않습니다. 타일 바깥 1픽셀을 함께 읽어 음영 경계가 이어지도록 합니다. 경계·줌·표시 범위는 `metadata.json`과 TPK 원본에서 읽으며 프론트엔드 수정은 필요하지 않습니다. 변환 대상이 기본 제한 20,000 타일을 넘으면 줌을 낮추거나 DEM을 잘라서 시작하세요. 스케일/오프셋이 있는 DEM은 먼저 GDAL의 `gdal_translate -unscale -ot Float32`로 실제 미터 값으로 정규화해야 합니다.

완료한 데이터는 **data/street 및 data/elevation 전체**를 복사해 이전하세요. 원본·메타데이터·color/height를 함께 보관하며 Docker 이미지에는 넣지 않습니다. 변환 성공 시에만 메타데이터가 새 세트를 가리키도록 바꾸고, 실패 시 기존 결과를 유지합니다. 이전 `sets/`는 보관하므로 필요 없을 때 서비스를 중지한 뒤 현재 metadata.json이 참조하지 않는 세트만 정리하세요.

처음 이 기능을 받으면 `docker compose up -d --build`로 웹 이미지를 갱신합니다. 이후 **지도 파일·설정 변경은 재시작과 새로고침**만 필요합니다. 고도 데이터는 새 DEM을 사용할 때만 다시 변환하세요. 일반/고도 데이터가 없거나 손상돼도 기존 위성 레이어는 계속 사용할 수 있고, 위성 TPK 없이 일반/고도 데이터만 준비한 환경도 실행할 수 있습니다.

추가 환경변수: `STREET_HOST_DIR`/`STREET_TPK_DIR`, `ELEVATION_HOST_DIR`/`ELEVATION_DIR`은 각각 Docker 호스트/개발 서버 경로입니다. 컨테이너 내부는 `/data/street`, `/data/elevation`으로 고정합니다. `.env.example`의 새 항목을 기존 `.env`에 병합하세요.

추가 API:

- `GET /api/map-info`: `layers.satellite`, `layers.street`, `layers.elevation`에 제공 상태·경계·원본 줌·로컬 URL·고도 범위를 제공합니다.
- `GET /api/street/{z}/{x}/{y}`: 일반 지도 TPK XYZ 타일, 권한 검사·ETag·상위 줌 대체.
- `GET /api/elevation/tiles/{z}/{x}/{y}`: 변환된 고도 색상/음영 PNG. 원본 줌만 반환하며 브라우저가 확대합니다.
- `GET /api/elevation?lat=36.597889&lon=126.240136`: 미터 단위 고도·고도 기준·원본 줌. 데이터가 없으면 `elevationMeters: null`; 잘못된 좌표 400, 미확인 권한 403, 없는 타일 404.

## 메타데이터 먼저 검사

PowerShell에서는 `npm` 대신 `npm.cmd`를 사용할 수 있습니다.

Windows에서는 `실행.cmd` 메뉴 **1**을 선택하면 필요한 패키지가 없을 때 `npm ci --include=dev`로 자동 설치한 뒤 검사합니다. 최초 설치에는 인터넷이 필요하며, 준비된 패키지는 오프라인에서 재사용합니다. 메뉴 **3**의 개발 서버도 동일하게 준비합니다. Windows의 npm 실행에는 `shell: true`를 사용하지 않습니다.

```sh
npm ci --include=dev
npm run inspect:tpk
```

인수 없이 실행하면 등록된 `maps.json`을 검사하고, 해당 파일이 없으면 기존 단일 TPK를 검사합니다. 개별 파일은 `npm run inspect:tpk -- data/tpk/regions/taean.tpk`, 별도 JSON은 `npm run inspect:tpk -- data/tpk/maps.json`으로 검사합니다.

Node.js가 없는 운영 PC에서는 서버를 기본 권한 미확인 상태로 시작한 뒤 `/api/map-info`에서도 메타데이터를 확인할 수 있습니다.

이 명령은 ZIP 디렉터리, `conf.xml`, `conf.cdi`, `esriinfo/iteminfo.xml`을 읽고 종료합니다. **타일 영상은 추출하지 않습니다.** 버전·StorageFormat·이미지 형식·tileSize·좌표계·경계·실제 bundle 레벨·사용 조건 원문을 출력합니다. 메타데이터의 문구만으로 사용 권한이 자동 승인되지는 않습니다. 본인이 받은 서비스/내보내기/오프라인 웹 사용 조건을 함께 확인하세요. 비밀 키·Esri 로그인·외부 API는 필요하지 않습니다.

지원하지 않는 파일은 임의로 좌표나 인덱스를 추정하지 않고 오류로 중단합니다. 실제 파일이 여러 레이어이거나 JSON 전용 TPKX, Exploded Cache, 비표준 원점·좌표계·512px 타일이면 별도 분석이 필요합니다.

## 여러 TPK 등록 방법

대한민국 기본 지도와 관심 지역 영상을 다음처럼 보관합니다. **아래 실제 데이터는 사용자가 준비해야 합니다.** 저장소에 대한민국/관심 지역 위성영상이 포함되거나 자동 다운로드되는 것은 아닙니다.

```text
data/tpk/
├── maps.json
├── korea/
│   └── base.tpk          # 대한민국 기본 지도: native zoom 0–13
└── regions/
    ├── taean.tpk         # 관심 지역: native zoom 14–19
    └── another-area.tpk  # 추가 관심 지역
```

`maps.example.json`을 `maps.json`으로 복사하고 실제 파일명·우선순위·이용 확인 상태를 수정합니다. 필수 구성은 다음과 같습니다.

```json
{
  "version": 1,
  "sources": [
    {
      "id": "korea-base",
      "name": "대한민국 기본 지도",
      "file": "korea/base.tpk",
      "role": "base",
      "minZoom": 0,
      "maxZoom": 13,
      "priority": 0,
      "usageConfirmed": false
    },
    {
      "id": "taean",
      "name": "태안 관심 지역",
      "file": "regions/taean.tpk",
      "role": "detail",
      "minZoom": 14,
      "maxZoom": 19,
      "priority": 100,
      "usageConfirmed": false
    }
  ]
}
```

| 항목 | 의미 |
| --- | --- |
| `id` | 고유 식별자. 영문 소문자·숫자·`-`·`_`, 최대 64자 |
| `file` | **JSON 파일의 폴더 기준 상대 경로**. Windows에서도 `/` 권장. `../`·절대 경로·마운트 밖 심볼릭 링크는 거부 |
| `role` | `base`: 기본 줌 0–13, `detail`: 기본 줌 14–19 |
| `minZoom`, `maxZoom` | 사용할 원본 레벨 제한. 실제 TPK LOD/bundle과 교집합만 사용하며, 없는 레벨을 생성한 것으로 표시하지 않음 |
| `priority` | 같은 원본 줌·종류에서 큰 값 우선. 예: 항구 200 > 태안 100 |
| `usageConfirmed` | 실제 사용 조건을 확인한 파일만 `true`. 생략 시 `false` |
| `enabled` | 생략 시 `true`. `false`이면 검사·타일 제공에서 제외 |
| `bounds` | 생략 시 TPK의 실제 경계 사용. 필요하면 `{south, west, north, east}`로 범위를 축소할 수 있으며 원본 밖으로 확장 불가 |

여러 기본/상세 TPK를 최대 32개 등록할 수 있습니다. 각 파일의 실제 경계·원본 줌·다운로드된 레벨·상태·권한 정보는 `/api/map-info`의 `sources[]`로 제공하고, 지도 화면의 **지도 데이터**에서도 확인할 수 있습니다. 미확인 파일은 메타데이터만 읽으며 타일과 압축 bundle을 추출하지 않습니다. **다중 모드에서는 기존 전역 `TPK_USAGE_CONFIRMED=true`로 새 파일이 자동 승인되지 않습니다.**

새 관심 지역은 `regions/`에 파일을 복사하고 `sources`에 항목을 추가하면 됩니다. 서버를 중지한 상태에서 JSON/TPK를 변경한 뒤 다음 명령으로 다시 시작하고 브라우저를 새로고침하세요. **프론트엔드 수정·이미지 재빌드·전체 TPK 재변환은 필요하지 않습니다.** 개발 서버는 재시작하고, Docker 이미지는 이 기능을 포함한 버전으로 최초 한 번 준비해야 합니다.

```sh
docker compose restart web
```

실행 중 JSON/TPK 변경이 감지되면 503과 재시작 안내를 반환해 서로 다른 패키지의 타일이 섞이지 않도록 합니다. 새 프로세스는 등록 정보를 다시 읽고 브라우저 타일 URL의 revision도 갱신합니다. 기존 압축 캐시는 원본이 같으면 재사용합니다.

## 상세 지역 목록과 위치 이동

`maps.json`에 등록한 **`role: "detail"` 항목**은 **지도 정보** 패널의 **상세 지역** 목록에 자동 표시됩니다. 항목을 선택하면 해당 TPK의 실제 경계(또는 설정에서 축소한 경계)가 화면에 들어오도록 중심·줌을 조정합니다. 최대 줌은 해당 파일의 실제 `maxZoom`을 넘지 않으며 목록은 선택 후 접힙니다. 제목을 누르면 다시 펼칠 수 있습니다.

기본 지도(`role: "base"`)는 이 목록에서 제외됩니다. 비활성·파일 누락 등으로 위치를 확인할 수 없는 항목은 상태를 표시하고 이동 버튼을 비활성화합니다. 사용 권한 미확인 항목도 정상 메타데이터가 있으면 경계 위치로 이동할 수 있지만, 타일 사용 권한이 바뀌지는 않습니다. 지역 선택은 위치만 이동하며 기존 타일 해상도·우선순위 규칙과 측정 결과를 유지합니다. 새 지역 등록 후 서버를 재시작하고 페이지를 새로고침하면 목록에도 반영됩니다.

## 자동 선택·대체 표시 규칙

각 XYZ 타일마다 요청 타일과 경계가 겹치고, 사용이 확인된 데이터만 후보로 선택합니다. 지도 이동·확대·축소 시 같은 API가 다시 판단하므로 지역별 프론트엔드 코드가 필요하지 않습니다.

1. 요청 줌과 같거나 낮은 **원본 줌 중 가장 높은 해상도**를 먼저 확인합니다.
2. 같은 원본 줌에서는 `detail` > `base`, 이어서 **`priority` 큰 순서**, 마지막으로 **`id` 사전순**입니다. JSON 등록 순서에 의존하지 않습니다.
3. 선택한 파일에 해당 타일이 없으면 같은 줌의 다음 후보를 확인하고, 모두 없으면 더 낮은 원본 줌으로 내려갑니다. 더 선명한 다른 파일이 있으면 낮은 해상도의 높은 우선순위 파일보다 먼저 사용합니다.
4. 상세 원본이 부족하면 사용 가능한 상세의 낮은 줌을 먼저 활용하고, 최종적으로 기본 지도(예: z13)를 **현재 위치에 맞게 잘라 z14–19로 확대**합니다. 전체 부모 타일을 그대로 늘이지 않습니다.
5. PNG 상세 타일의 투명 부분은 다음 후보와 합성해 기본 지도가 비치도록 합니다. 읽을 수 없는 상세 데이터는 서버 로그에 기록하고 다음 후보로 대체합니다.

예: z16에서 항구(우선순위 200)와 태안(100)이 겹치면 항구를 표시합니다. 항구 타일이 없으면 태안 z16, 그것도 없으면 가능한 낮은 상세 줌, 마지막으로 기본 z13 이하를 표시합니다. **확대는 새로운 영상 세부 정보를 만들지는 않습니다.**

빈 화면 방지는 **해당 위치를 덮는 허가된 기본 타일이 실제로 있을 때** 가능합니다. 기본 데이터 자체의 누락·권한 미확인·대한민국 경계 밖에서는 제공할 영상이 없어 404가 발생할 수 있습니다. 높은 줌 파일만으로 빠진 z0–13 전체를 자동 생성하지 않습니다. 메타데이터의 경계는 완전한 타일 보유를 보장하지 않으므로 개별 타일 누락도 요청 시 검사합니다.

## 거리·면적 측정

지도 왼쪽 아래의 **거리·면적 측정** 도구를 사용합니다.

**지도에서 우클릭 → 거리 측정 시작 / 면적 측정 시작**으로도 시작할 수 있습니다. 우클릭한 위치가 첫 점으로 자동 등록되며, 이후 지도를 왼쪽 클릭해 점을 추가합니다. 메뉴를 열기만 하거나 Esc로 닫으면 기존 측정은 유지되고, 시작 항목을 선택하면 새 측정으로 전환됩니다. 메뉴는 화면 가장자리 안쪽에 표시되며 바깥 클릭·지도 이동/확대·Esc로 닫힙니다. 키보드로는 위/아래 방향키로 항목을 선택하고 Enter로 실행할 수 있습니다. 기존 측정 버튼도 계속 사용할 수 있습니다.

1. **거리**: 지도를 순서대로 클릭해 두 점 이상 선택하면 경로의 총 거리를 m/km로 표시합니다.
2. **면적**: 경계를 따라 세 점 이상 선택하면 마지막 점과 첫 점을 자동 연결해 면적(m²/km²)과 둘레를 표시합니다.
3. **측정 완료**: 점 추가를 종료합니다. 결과와 도형은 지도 이동·확대·축소 후에도 유지됩니다.
4. **마지막 점 취소**: 마지막 점을 제거하고 측정을 이어갑니다. **초기화**는 측정 도형과 결과를 지웁니다.
5. **이동**: 점 추가를 멈추고 지도를 탐색합니다. 거리/면적 버튼을 다시 누르면 새 측정을 시작합니다.

면적 경계가 교차하면 안내 메시지를 표시하고 완료 버튼을 비활성화합니다. 마지막 점을 취소해 경계를 수정하세요. 측정 중에는 더블클릭 확대를 잠시 중지하며 완료/이동/초기화 후 복원합니다. 기존 클릭 위치 좌표 표시는 계속 동작합니다.

측정은 **평균 지구 반경 6,371,008.8m의 구면**에서 위경도로 계산하며, 화면 픽셀이나 EPSG:3857 평면 면적에 의존하지 않습니다. 거리는 선택한 점 사이 최단 구면 경로의 합, 면적은 구면 다각형 면적입니다. 지형 고도는 반영하지 않습니다. 브라우저 안에서 계산하므로 외부 API·CDN·새 패키지 설치가 필요하지 않고 오프라인에서도 동작합니다. 측정 결과는 현재 화면에만 유지하며 페이지 새로고침 시 초기화됩니다. 계산 검증은 적도 1도 거리·구면 팔분구 면적·날짜 변경선·태안 부근 1m² 도형·교차 판정을 포함하고, 브라우저에서는 점 선택·되돌리기·완료·초기화·확대 후 유지·모바일·오프라인을 확인합니다.

## 시설·건물 정보 등록·조회·수정

**시설·건물 추가 → 지도에서 위치 선택** 후 시설명과 정보를 입력하고 저장하세요. 모바일에서도 같은 버튼으로 추가할 수 있습니다. 위치 선택은 취소 버튼 또는 Esc로 중단하며 **지도 우클릭 → 시설·건물 정보 등록**도 지원합니다. 저장하면 청록색 마커가 나타나고, 마커를 누르면 지도 위의 선택 카드에서 최신 시설명·분류·설명을 읽고 **시설 상세 정보**를 펼쳐 주소·연락처·URL·위치를 확인할 수 있습니다. 수정 버튼으로 편집하고, 삭제는 별도 확인을 거칩니다. 등록을 시작하면 진행 중인 측정은 멈추지만 기존 측정 결과는 유지됩니다.

건물과 시험장·주차장·야외 공간을 같은 방식으로 관리합니다. 사용자가 별도 시설 ID를 만들거나 입력할 필요는 없습니다. 기존 내부 UUID와 버전은 저장·수정 대상 구분에만 사용합니다. 지점 마커를 유지하면서 시설당 선택적인 경계 다각형 하나를 저장할 수 있습니다.

데스크톱 왼쪽 **시설 찾기(시설 목록)**을 펼치면 등록 시설을 찾을 수 있습니다. **시설명 검색**은 앞뒤 공백을 제외한 부분 일치이며 영문 대소문자를 구분하지 않습니다. **시설 분류**는 기존 분류를 사용하며 기본값은 전체입니다. 두 조건은 함께 적용되고 결과 수·목록·마커·저장된 경계가 같은 조건을 반영합니다. **검색·분류 초기화**로 전체 시설을 다시 표시합니다. 검색이나 필터링으로 저장 데이터를 삭제·수정하지 않습니다.

목록의 시설을 선택하면 경계가 없는 경우 현재 줌을 유지해 최신 좌표로 이동하고, 경계가 있으면 기존 줌보다 확대하지 않고 마커와 경계 범위를 함께 보여줍니다. 기존 지도 줌 제한은 유지하며, 마커와 같은 최신 상세 화면을 엽니다. 화면 밖 시설도 선택할 수 있습니다. 데스크톱 목록은 선택 행을 강조하며 유지되고, 모바일 목록은 선택 후 접힙니다. 검색 조건은 유지됩니다. 등록·수정·삭제·**시설 목록 다시 불러오기** 후에도 현재 조건을 적용하며, 삭제되거나 조건에서 벗어난 선택 상태는 해제됩니다. 처음 불러오는 중, 실제 등록 시설 없음, 검색 결과 없음, 조회 실패를 구분합니다. 실패하면 재조회 버튼을 사용하며 이전 자료를 표시하는 경우 이를 안내합니다. 접힌 패널과 내부 스크롤로 모바일에서도 지도·측정·시설 추가 도구를 사용할 수 있고 키보드 Tab/Enter와 기본 선택 상자 조작을 지원합니다.

| 항목 | 입력 방식 |
| --- | --- |
| 시설명 | 필수, 최대 120자 |
| 설명 | 선택, 최대 5,000자, 여러 줄 지원 |
| 용도·분류 | 미분류·주거·상업·공공시설·공장/창고·교육·의료·문화/관광·기타·시험장·주차장·야외 공간 |
| 주소·연락처·관련 URL | 선택. URL은 HTTP/HTTPS만 지원하며 자동 외부 조회는 하지 않음 |
| 위도·경도 | 선택한 위치에서 자동 입력, 필요 시 직접 수정 가능 |
| 등록일·수정일 | 서버가 자동 기록, 화면에서는 한국 시간으로 표시 |

추천하는 후속 확장 항목은 **관리 담당자, 관리 상태, 층수, 최근 점검일, 현장 사진**입니다. 현재 버전에는 위 표의 항목을 제공합니다. 주소는 직접 입력하며 온라인 주소 검색·지오코딩에 의존하지 않습니다.

등록 정보는 브라우저가 아닌 **`data/buildings/<내부 UUID>.json`**에 저장합니다. 새로고침·Docker 종료·컨테이너 재생성·이미지 재빌드 후에도 남습니다. TPK·타일 캐시와 별도 보관하며 Git/Docker 이미지에 실제 등록 데이터를 포함하지 않습니다. **백업·서버 이전 시 서비스를 종료한 뒤 `data/buildings/` 전체를 함께 복사**하세요. 기존 `data/tpk/`, `.env`, Compose 파일도 기존 절차대로 옮깁니다.

- 호스트 개발: `BUILDINGS_DIR` (기본 `data/buildings`)
- Docker 호스트: `BUILDINGS_HOST_DIR` (기본 `./data/buildings`, 디렉터리가 존재해야 함)
- Docker 내부: `/data/buildings` 읽기/쓰기 마운트. Ubuntu에서는 컨테이너 node 사용자(UID 1000)의 쓰기 권한이 필요함

저장은 임시 파일을 완성한 뒤 원자적으로 교체합니다. 같은 서버 프로세스 안에서 쓰기를 순서대로 처리하며, 다른 화면에서 먼저 수정한 내용은 409 충돌로 알려 덮어쓰지 않습니다. 충돌 시 창을 닫고 마커를 다시 열면 최신 버전을 읽습니다. 저장 실패 시 입력 중인 내용은 창에 유지됩니다. 현재 파일 저장 방식은 **웹 서버 프로세스 1개**, 건물 최대 10,000개를 대상으로 하며 여러 서버의 동시 쓰기는 지원하지 않습니다. 기존 서비스처럼 로그인 없이 로컬에서 사용하며, 새 쓰기 API는 다른 출처의 브라우저 요청을 거부합니다.

### 대표 지점 위치 수정과 시설 삭제

- **새 지도 조작(#16)**: 시설 상세 → **위치 수정**에서만 ‘이동’ 마커를 끌거나 빈 지도를 클릭해 대표 지점을 옮깁니다. 평소 시설 마커는 드래그되지 않습니다. **위치 위도/경도 → 좌표 미리보기**도 같은 대안이며, 원래 저장 위치와 미저장 위치를 함께 표시합니다.
- **위치 저장** 전에는 서버 값이 바뀌지 않습니다. **원래 위치로 되돌리기**, **위치 수정 취소** 또는 Esc로 복원할 수 있습니다. 저장 후 상세 좌표·목록·마커를 갱신하고 새로고침에도 유지합니다. 기존 ‘수정’ 폼의 숫자 좌표 수정도 계속 사용할 수 있습니다.
- 이동은 **대표 지점만** 바꿉니다. UUID·시설명·등록일·저장된 boundary 좌표와 다른 시설은 유지합니다. 경계를 평행 이동하거나 대표 지점을 경계 안으로 제한하지 않습니다. 기존 PUT/version/If-Match와 경계 생략 시 보존 규칙을 사용합니다.
- **기존 삭제 재사용**: 시설 상세 → **수정 → 삭제 → 삭제 확인**. 확인 화면에서 시설 레코드·대표 마커·저장 경계가 모두 삭제됨을 안내합니다. ‘돌아가기’는 삭제하지 않습니다. 정점 하나 삭제/경계만 제거와 다르며 다른 시설은 유지합니다. 위치 필드만 지우거나 마커만 숨기는 새 정책은 없습니다.
- 저장/삭제 실패와 버전 충돌은 입력과 저장된 원본을 보존합니다. 일시 오류는 재시도하고 충돌은 취소 후 최신 시설을 다시 여세요. 이동/경계 저장 중에는 대상 전환·중복 저장·취소를 막습니다. 저장 전 다른 시설을 열면 이전 초안은 저장하지 않고 버립니다.

### 시설 경계 저장·수정·제거

1. 마커 또는 시설 목록에서 상세를 열고 **경계 추가** 또는 **경계 수정**을 선택합니다. 대상 시설명이 편집창에 표시됩니다.
2. 지도에서 세 점 이상 차례로 선택합니다. 마지막 변은 자동 연결됩니다. **다시 그리기**, **경계 마지막 점 취소**로 그리기 초안을 수정하고 미리보기의 면적·둘레를 확인하세요. 편집 중 숫자 핸들을 드래그하면 정점과 면적·둘레·교차 오류가 즉시 갱신됩니다. **+ 삽입 핸들** 또는 **선택 정점 뒤에 삽입**으로 변 중간에 넣고, **선택 정점 → 선택 정점 삭제**로 중간 정점만 지울 수 있습니다. 선택 삭제는 최소 3개를 유지하고 최대 128개에서 추가를 막습니다. 삽입한 점이 일직선이면 이동/좌표 수정 후 저장하세요. **직전 조작 되돌리기**는 드래그 한 번·삽입·삭제·좌표 수정·다시 그리기를 최근 100회까지 되돌립니다. **좌표로 정점 추가·수정**에서 위도·경도를 입력해 정점을 추가하거나 번호별 수정 버튼으로 기존 점을 바꿀 수 있습니다. 숫자 선택/좌표 입력·버튼은 키보드와 터치에서도 사용할 수 있으며 Delete/Backspace로 시설/정점을 지우는 전역 단축키는 없습니다. 그리기 취소로 0–2개가 된 초안이나 교차/중복/퇴화/범위 오류는 저장할 수 없습니다. 편집용 선택/되돌리기 정보는 서버에 저장하지 않습니다.
3. **경계 저장**은 시설 정보와 함께 서버 파일에 저장합니다. **경계 편집 취소** 또는 Esc는 미저장 도형을 버리고 저장된 경계를 유지합니다. 다른 시설 마커를 선택해도 이전 초안은 저장되지 않습니다. 변경된 초안이 있을 때 브라우저를 벗어나면 이탈 경고를 제공합니다. 저장 중에는 대상 변경과 취소를 잠시 막습니다.
4. 상세의 **경계 제거 → 경계 제거 확인**은 경계만 지웁니다. 시설 삭제는 해당 시설의 마커·경계만 함께 삭제합니다. 다른 시설과 임시 측정 도형은 유지됩니다.

청록 실선·채움은 저장된 시설 경계, 붉은 점선은 편집 중 초안, 청록 짧은 점선은 임시 측정입니다. 파랑/노랑의 지도 데이터 제공 범위와 구분합니다. 저장된 경계를 클릭하거나 Tab으로 선택 후 Enter/Space를 누르면 같은 시설 상세가 열립니다. 목록 검색·분류는 마커와 경계를 함께 표시/숨깁니다. 작은 화면의 편집창은 본문 내부 스크롤과 항상 보이는 저장·취소 영역을 제공합니다. 키보드로 좌표 입력·버튼을 조작할 수 있고 **지도 이동**은 화살표 이동이 가능한 지도에 초점을 돌립니다. 편집 중 측정/새 시설 추가는 일시 중지되며 기존 측정 결과는 유지됩니다. 편집을 끝내면 도구를 다시 쓸 수 있습니다. **측정 초기화**는 저장 경계를 지우지 않습니다.

저장 실패 시 기존 경계와 편집 좌표는 유지됩니다. 일시적인 저장 공간/연결 오류는 복구 후 **경계 저장**으로 재시도하세요. 409 버전 충돌은 자동 덮어쓰지 않으며, 필요한 편집 좌표를 확인한 뒤 취소하고 시설을 다시 열어 최신 정보로 편집합니다. 경계 제거 실패도 저장 경계를 유지합니다. 응답이 유실된 경우 실제 저장됐을 수 있으므로 시설을 다시 열어 결과와 버전을 확인하세요.

시설당 구멍 없는 단일 Polygon만 지원합니다. 서로 다른 정점 3–128개, 유효한 숫자와 양의 면적이 필요하며 자기교차/접촉·중복·같은 선 위의 퇴화 정점은 거부합니다. 날짜변경선을 가로지르거나 경도 폭이 180도 이상인 도형, 여러 분리 영역·공유 경계·예약 구역 규칙은 지원하지 않습니다. **시설 관리용 입력 정보이며 법적 지적 경계·실측 정확도를 보증하지 않습니다.** 좌표계·정밀도·API 호환성과 크기 한도는 [API 경계 명세](docs/PLATFORM_INTEGRATION.md#이슈-11-시설-경계-확장)를 참고하세요.

## 화면 구성과 Light/Dark/System

상단은 56px 남색 헤더와 실제 지도 메뉴·테마 선택 도구입니다. 데스크톱은 320px 시설 찾기 패널과 나머지 지도 작업 공간으로 나뉩니다. 모바일에서는 **시설 목록** 버튼으로 검색 drawer를 열고 닫고, Esc로 닫아 지도에 돌아갈 수 있습니다. 데스크톱과 모바일의 목록 열림 상태는 화면 크기를 바꿔도 각각 유지합니다. 선택 카드는 지도를 이동할 수 있는 작은 비모달 영역이며 **수정**은 기존 편집 대화상자를 엽니다.

**시설 추가**, **이동·거리·면적**, **지도 정보**는 지도 상단에 모았습니다. 측정 값/undo/완료는 측정 중 보이는 작은 영역에 표시합니다. 좌표·줌·클릭 정보는 하단, 데이터 제공 범위·상세 지역·소스·고도 범례·데이터 준비 도움말은 **지도 정보**에 있습니다. 모바일 검색/경계 편집 중 레이어 버튼을 잠시 숨겨 패널과 겹치지 않게 하며 닫으면 다시 사용할 수 있습니다. 줌·축척·출처는 유지합니다.

헤더의 **화면 테마**에서 **라이트·다크·시스템**을 선택하세요. 시스템은 OS 설정을 따르고, 명시적인 라이트/다크는 OS 변경과 관계없이 유지합니다. 선호는 같은 브라우저/origin의 `platform.theme`에 저장하며 새로고침·다른 탭에 반영됩니다. 저장소 접근이 차단되거나 값이 잘못되면 시스템 설정으로 시작합니다. 설정 저장이 실패해도 현재 화면의 선택은 동작하며 다음 방문의 저장 선호 보장은 없습니다. 네이티브 시설 편집창 안의 **편집창 화면 테마**도 같은 선택을 사용합니다. 테마를 바꿔도 지도 위치·검색/분류·선택 시설·입력·경계 초안이 초기화되지 않습니다.

앱 UI와 지도 데이터는 구분합니다. 실제 위성·DEM·래스터 픽셀은 테마 때문에 반전하거나 어둡게 만들지 않습니다. 어두운 벡터 지도를 새로 제공하는 기능이나 외부 타일/CDN은 추가하지 않았습니다. 실제 전후 화면과 참고 시안의 차이는 [전체 화면 UI 검토](docs/UI_REDESIGN_REVIEW.md)에서 비교할 수 있습니다.

## 구현과 파일

| 파일 | 기능 |
| --- | --- |
| `lib/tiles/tpk.ts` | ZIP/메타데이터, Compact V1/V2 인덱스, 범위 검사, 캐시 |
| `lib/tiles/catalog.ts` | 여러 TPK 등록·권한·해상도·우선순위 선택, Sharp 확대/투명 합성 |
| `app/api/map-info/route.ts` | 실제 파일의 메타데이터와 OSM 제공 상태 |
| `app/api/tiles/[z]/[x]/[y]/route.ts` | XYZ → 원본 타일 응답 |
| `app/api/osm/[z]/[x]/[y]/route.ts` | prepared SQLite+로컬 수정 합성 PNG 및 기존 XYZ PNG/JPEG |
| `app/api/osm/objects/` | 제한된 객체 조회·상세·낙관적 버전 수정 API |
| `components/MapCanvas.tsx` | 좌측 패널/지도 골격, 도구·정보·좌표, Leaflet 크기/카메라·레이어 |
| `components/ThemeControl.tsx`, `lib/theme.ts` | 첫 표시·Light/Dark/System 선택·저장/실패/동기화 |
| `components/DetailLocations.tsx` | detail 지역 목록·상태 표시·경계에 맞춘 위치 이동 |
| `components/MapMeasurements.tsx` | 거리·면적 도구, 점 선택·완료·되돌리기·초기화 |
| `components/MapBuildings.tsx` | 시설 목록·마커·저장 경계·상세 조회·등록/수정/제거 |
| `components/FacilityBoundaryEditor.tsx` | 대상 시설·버전에 고정된 경계 초안·미리보기·저장/취소 |
| `components/useMapPointDrawing.ts` | 측정·시설 경계가 공유하는 지도 점 선택 수명 |
| `lib/buildings/boundary.ts` | GeoJSON 좌표 변환·검증·정규화·면적/둘레 |
| `lib/buildings/` | 건물 입력 검증·원자적 JSON 저장·버전 충돌 처리 |
| `app/api/buildings/` | 건물 목록·등록·단건 조회/수정/삭제 API |
| `lib/map-measure.ts` | 구면 거리·면적, 경계 교차 판정, 단위 표시 |
| `scripts/inspect-tpk.ts` | 원본을 변경하지 않는 검사 CLI |
| `data/tpk/` | 사용자 원본, 읽기 전용 볼륨 |
| Docker `tpk-cache` 볼륨 | ZIP 압축 bundle의 재사용 캐시 |

TPK가 ZIP Stored 형식이면 bundle 전체를 추출하지 않고 필요한 인덱스/영상 범위만 읽습니다. Deflate로 압축된 bundle은 첫 접근 시 스트리밍으로 캐시 파일에 풀고 크기·CRC를 검사합니다. 캐시 파일명은 원본 식별값과 멤버 이름의 해시이며 ZIP 경로를 출력 경로로 사용하지 않습니다. **원본 TPK는 항상 변경하지 않습니다.** 전체 XYZ 변환은 하지 않으며 패키지 교체 전 서버를 중지하고 교체 후 재시작합니다. 파일 식별값을 타일 URL에 포함해 교체 전 브라우저 캐시와 구분합니다.

Compact V1은 별도 `.bundlx`의 5바이트 offset과 **column-major** 인덱스, V2는 bundle 내 8바이트 offset/size와 **row-major** 인덱스를 처리합니다. EPSG:3857의 표준 원점·256px 타일을 확인하고, LOD ID와 해상도 기반 XYZ zoom을 매핑합니다. 실제 bundle이 있는 레벨만 제공하므로 `conf.xml` 전체 LOD 목록을 다운로드된 레벨로 오인하지 않습니다.

[Esri Compact Cache V2 형식 문서](https://github.com/Esri/raster-tiles-compactcache/blob/master/CompactCacheV2.md)를 기준으로 구현했습니다. 저장 방식과 실제 이미지의 JPEG/PNG magic bytes를 검증합니다.

## API 동작

건물 등록 API는 다음과 같습니다. 모든 응답은 `no-store`이며, 수정·삭제는 단건 조회의 `ETag` 또는 응답 데이터 `version`을 `If-Match: "현재 버전"`으로 전달합니다.

- `GET /api/buildings`: `{buildings: [...]}` 목록
- `POST /api/buildings`: 건물 정보를 JSON으로 등록, 201과 `{building: ...}` 반환
- `GET /api/buildings/{id}`: 단건 조회와 버전 ETag
- `PUT /api/buildings/{id}`: 정보 수정, `DELETE /api/buildings/{id}`: 삭제(204)
- 입력 오류 400, 다른 출처 쓰기 403, 없음 404, 버전 충돌 409, 본문 32KiB 초과 413, 버전 누락 428, 저장소 오류 503

- `GET /api/map-info`: 카메라·전체 경계·표시 줌 및 `sources[]`의 실제 TPK 메타데이터. 다중 모드의 표시 줌은 0–19, 실제 원본 줌은 각 `sources[].zoomLevels`이며 누락 상태는 `warnings`로 제공
- `GET /api/tiles/16/{x}/{y}`: 실제 JPEG/PNG MIME, ETag 및 `If-None-Match`의 304 처리
- 응답 헤더 `X-Map-Source`, `X-Map-Native-Zoom`, `X-Map-Fallback`, `X-Map-Contributors`: 사용 원본·원본 줌·확대 대체 여부·투명 합성에 사용한 원본
- 범위 밖·패키지에 없는 타일: **404**; 잘못된 좌표: **400**; 사용 확인 전 타일 접근: **403**; 파일 없음/교체 후 재시작 필요: **503**
- 손상·미지원 형식: **422**. 원본 경로·상세 파일 시스템 오류를 API에 노출하지 않습니다.
- 최대 32개 타일 읽기 동시 처리, 중복 요청 공유, 큐가 꽉 차면 429 + Retry-After, 타일 메모리 캐시 32MiB·최대 256개, bundle 인덱스 최대 16개
- 다중 선택/확대 작업은 전체 최대 8개 동시 실행, 대기/실행 요청 최대 256개, 결과 캐시 총 32MiB·최대 256개. 다중 모드의 원본별 타일 캐시는 각각 최대 4MiB
- 압축된 bundle 하나는 최대 512MiB, 이미지 하나는 최대 20MiB입니다. 디스크 캐시 총량은 자동 삭제하지 않으므로 큰 패키지는 여유 공간을 확보하세요.

초기 중심 희망값은 **36.597889, 126.240136**, zoom **16**입니다. 실제 파일 경계 밖이면 메타데이터 경계 중심을 쓰고, zoom도 실제 레벨에 맞춥니다. 질문의 경계/레벨 15~17은 실제 파일 확인 전에는 데이터 사실로 확정하지 않습니다.

## OSM과 오프라인 모드

기본 `MAP_MODE=offline`에서는 외부 지도 요청이 없습니다. 필수 JS/CSS와 Leaflet은 Next.js가 로컬 제공하며 외부 CDN·폰트·위성 API를 요청하지 않습니다.

오프라인 OSM을 함께 쓰려면 사용이 허가된 XYZ 타일을 **`data/osm/z/x/y.png` 또는 `.jpg`**에 두고 `OSM_USAGE_CONFIRMED=true`를 설정하세요. 그러면 별도 일반 TPK가 없을 때 레이어 선택기에 **일반 지도**가 나타납니다. 파일이 없거나 권한이 확인되지 않으면 OSM을 표시하지 않습니다.

온라인 OSM이 필요할 때만 `MAP_MODE=online`으로 바꾸고 컨테이너를 재생성합니다. 이때 브라우저가 공용 OSM 타일을 요청하며 [OSM 타일 이용 정책](https://operations.osmfoundation.org/policies/tiles/)을 따라야 합니다. 이 프로젝트는 공용 OSM 타일의 일괄 다운로드 기능을 제공하지 않습니다.

## 환경변수와 개발

- `PORT`, `BIND_ADDRESS`: Docker 호스트 공개 포트/주소 (기본 localhost:3001)
- `TPK_HOST_DIR`: Compose 원본 폴더 (기본 `./data/tpk`, 폴더가 존재해야 함)
- `TPK_FILE`: 해당 폴더 아래 파일명
- `MAP_CONFIG_FILE`: 같은 폴더의 등록 JSON 파일명 (기본 `maps.json`). 기본 파일이 없으면 단일 모드 유지; 별도로 지정한 파일이 없으면 오류
- `TPK_PATH`: **호스트 개발·검사**에서 사용할 경로. 컨테이너에서는 `/data/tpk/<TPK_FILE>`로 설정됩니다.
- `TPK_CACHE_DIR`: 호스트 개발은 `.cache/tpk`, 컨테이너는 `/cache`
- `TPK_USAGE_CONFIRMED`: 허용된 실제 패키지 사용을 확인한 뒤 `true`
- `MAP_MODE`, `OSM_HOST_DIR`(Compose 호스트 폴더), `OSM_TILE_DIR`(호스트 개발 경로), `OSM_USAGE_CONFIRMED`: OSM 제공 방식
- `BUILDINGS_HOST_DIR`(Compose 호스트 폴더), `BUILDINGS_DIR`(호스트 개발 경로): 등록 건물 데이터 보관 위치

```sh
npm ci
npm run dev
```

경로는 프로젝트 상대 경로 또는 환경변수로 지정하며 Windows/Ubuntu 전용 절대 경로를 코드에 넣지 않습니다. 패키지 원본은 컨테이너의 node 사용자에게 읽기 권한이 있어야 합니다. 기존 Python 기반 서비스를 사용했다면 한 번만 `docker compose down --remove-orphans`로 이전 컨테이너를 정리하세요. 기존 영상 아카이브는 삭제하지 않습니다.

## ZIP 업데이트 후 빌드 오류

새 ZIP을 기존 폴더에 덮어쓰면 이전 버전에서 삭제된 파일이 남을 수 있습니다. `lib/map-style.ts`에서 `Cannot find module 'maplibre-gl'`이 발생하면 이전 MapLibre 스타일 파일이 남은 경우입니다. 현재 지도는 Leaflet을 사용합니다.

PowerShell에서 프로젝트 폴더를 연 뒤 다음 명령으로 해당 파일만 삭제하고 실행 메뉴 2를 다시 선택하세요. `.env`와 `data/`는 그대로 유지합니다. Docker Desktop은 실행 중이어야 합니다.

```powershell
Remove-Item .\lib\map-style.ts -ErrorAction SilentlyContinue
.\실행.cmd
```

빌드 설정에서도 이 잔여 파일을 Docker 전송과 TypeScript 검사에서 제외합니다. 이후 ZIP 업데이트는 새 폴더에 압축을 풀고 기존 `.env`와 `data/`만 옮기는 방식을 권장합니다.

## z19에서 지도 전체가 회색으로 바뀌는 경우

이전 코드에서는 지도 전체의 최대 줌은 19지만 Leaflet 위성 타일 레이어의 기본 최대 줌 18이 적용돼 z19 요청이 중단됐습니다. 현재는 타일 레이어에도 메타데이터의 `minZoom`/`maxZoom`을 명시합니다. 브라우저 회귀 테스트에서 수정 전 z19 요청 중단을 재현하고 수정 후 z19 타일 요청·실제 영상 픽셀 표시를 확인했습니다. 이 수정은 프론트엔드 변경이므로 Docker에서는 최신 코드로 `docker compose up -d --build`한 뒤 브라우저를 새로고침하세요. 개발 서버는 다시 실행합니다. TPK의 원본 레벨과 권한 설정은 그대로 유지합니다.

## 인터넷 없는 PC로 이미지·데이터 옮기기

인터넷 사용 PC에서 빌드하고 이미지를 저장합니다. 플랫폼이 다르면 대상 플랫폼에 맞는 이미지를 준비하세요. 아키텍처는 강제하지 않습니다.

```sh
docker compose build
docker save -o map-service-image.tar map-service-web:local
```

`map-service-image.tar`, 저장소의 `compose.yaml`/`.env`, **`maps.json`과 하위 폴더를 포함한 `data/tpk/` 전체**, **`data/buildings/`**, **`data/street/`와 `data/elevation/` 전체**, 필요 시 `data/osm/`을 대상 PC에 복사합니다. 새 폴더에는 최소한 저장소의 README 파일을 포함해 폴더가 존재하도록 합니다. JSON은 상대 경로를 유지하므로 Windows/Ubuntu 사이에서도 동일하게 사용합니다. 대상 PC에서:

```sh
docker load -i map-service-image.tar
docker compose up -d --no-build --pull never
```

설치/빌드에는 인터넷이 필요할 수 있지만 **런타임에는 인터넷이 필요하지 않습니다.** TPK를 이미지에 COPY하지 않으며, 새 PC의 압축 bundle 캐시는 로컬에서 다시 생성합니다. 서버 런타임은 별도 타일 서버 없이 Next.js 컨테이너 하나입니다.

## 검증

```sh
npm run test:tiles
npm run test:launcher
npm run test:measure
npm run test:buildings
npm run test:layers
npm run test:osm
npx playwright install chromium
npm test
npm run typecheck
```

테스트용 TPK는 직접 생성한 CC0 픽셀과 메타데이터로 `.cache/test-tpk/`에 만듭니다. V1/V2·Stored/Deflate ZIP, Esri 공식 Apache-2.0 V2 샘플의 JPEG와 바이트 단위 대조, 비대칭 row/column, JPEG/PNG, 동시 중복 요청, 원본 불변, 권한 게이트, 손상 인덱스, XYZ 검증, 로컬 OSM 정책 및 UI를 검사합니다. 브라우저 테스트에서는 외부 호스트를 차단하고 로컬 타일이 보이는지 확인합니다.

**검증 범위:** 현재 Linux 클라우드의 합성 패키지 테스트이며, 실제 사용자 TPK 검증과 Windows 11/Ubuntu 24.04 실기 검증은 아직 완료되지 않았습니다. 실제 파일의 라이선스·내보내기 정보와 패키지 구조를 확인한 뒤 실제 위성영상 검증을 진행해야 합니다.

현재 합성 데이터 검증은 Node 앱 **97개**(tiles22/buildings24/layers6/osm14/measure9/launcher22), Node 도구5개, 브라우저 **67개**, 변환 DEM3/PBF7개와 Python 도구5개를 통과했습니다. 상세·최종 SHA 원격 증거는 [검증 기록](docs/VALIDATION.md#이슈-18-오프라인-osm-일반-지도-편집)과 이슈 완료 댓글을 참조하세요. 다중 등록에서는 z0–13 기본 지도, z14–19 상세/누락 줌, 겹침·동일 우선순위, 부모 타일 위치별 crop, 투명 PNG 합성, 권한 격리, 손상/누락 상세 파일, 설정 변경 감지와 기존 단일 TPK 호환성을 검사합니다. Docker Compose의 외부 통신 차단 네트워크에서도 **3개 TPK의 선택·확대 대체·압축 bundle 캐시·404·비루트 실행·원본 읽기 전용 마운트**를 확인했습니다. 실행 메뉴에서는 의존성 설치·오프라인 재사용·설치 실패 처리·Windows npm 명령 구성도 검사합니다. 모두 합성/공개 형식 샘플 기준이며 실제 사용자 패키지의 완료 증거는 아닙니다.

건물 기능은 등록·새로고침 후 유지·수정·삭제·저장 실패 시 입력 보존·지연 응답·문자열 표시·버전 충돌·모바일을 검증했습니다. 외부 통신이 차단된 Docker Compose에서도 비루트 사용자로 건물을 등록·수정한 뒤 컨테이너를 강제로 재생성해 내용과 버전의 보존, 기존 z19 타일 제공, 삭제를 확인했습니다. 실제 사용자 건물 데이터는 테스트에 사용하지 않았습니다.

고도 변환 검증은 GDAL·NumPy가 설치된 환경에서 `python3 -m unittest discover -s tests -p '*_test.py'`로 실행합니다. Node 단위 테스트는 수치 인코딩·0m/음수/NoData·경로 격리·권한 분리를 확인하며, 브라우저 테스트는 세 레이어 전환·원본 줌 확대·고도 API·오프라인 요청을 검사합니다. 테스트 데이터는 CC0 합성 데이터이며 실제 태안 지형을 나타내지 않습니다.

오프라인 PC에서 **새 DEM 변환도** 하려면 인터넷이 있는 PC에서 `docker compose --profile tools build prepare-elevation` 후 `docker save -o elevation-tools-image.tar map-service-elevation-tools:local`로 도구 이미지도 복사하고, 대상 PC에서 `docker load -i elevation-tools-image.tar` 후 **`--build` 없이** `docker compose --profile tools run --rm --pull never prepare-elevation`을 사용하세요. 이미 변환된 데이터의 지도 표시에는 도구 이미지가 필요 없습니다.

일반/고도 확장 검증: Node 단위 테스트 **6개**, GDAL 변환 테스트 **3개**, 추가 브라우저 테스트 **3개**를 통과했습니다. 네트워크가 차단된 Docker Compose에서 합성 GeoTIFF의 실제 변환, 세 레이어의 로컬 타일, 클릭 고도 123.5m, PNG/404, 비루트 실행, 읽기 전용 마운트를 확인했습니다. Windows/Ubuntu 실기와 실제 사용자 태안 데이터는 검증하지 않았습니다.

OSM 검증: Node 렌더링 테스트 **4개**, PBF 변환 테스트 **4개**, 신규 브라우저 테스트 **2개**를 추가했습니다. 실행 메뉴는 자동 준비·원본 다운로드 파일명·변경 감지·캐시 재사용·이미지 재사용·실패 시 시작 중단을 포함합니다. Python 변환 테스트는 `docker compose --profile tools run --rm --entrypoint python3 -v ./tests:/tests:ro -e OSM_PREPARE_SCRIPT=/tools/prepare.py prepare-osm -m unittest discover -s /tests -p osm_prepare_test.py`로 실행할 수 있습니다. Windows PowerShell/Ubuntu에서 같은 상대 경로 마운트를 사용합니다. 실제 대한민국 전체 PBF와 Windows/Ubuntu 실기는 별도 검증 대상입니다.

오프라인 PC에서 **새 PBF 준비도** 하려면 `map-service-osm-tools:local` 이미지를 함께 `docker save`/`docker load`로 옮기세요. 실행 메뉴는 해당 이미지가 있으면 네트워크 없이 재사용하며, 이미지가 없을 때만 빌드합니다. 명령으로 실행할 때는 `docker compose --profile tools run --rm --pull never prepare-osm`을 사용합니다. 준비된 지도 표시에는 도구 이미지가 필요 없습니다. 도구 코드가 바뀐 버전으로 갱신할 때는 인터넷 가능한 PC에서 `docker compose --profile tools build prepare-osm`으로 작업 이미지도 갱신하세요. 색인이 손상됐을 때의 강제 재변환은 메뉴 7 또는 `docker compose --profile tools run --rm --pull never prepare-osm --force`입니다.

최종 OSM 통합 검증에서는 외부 통신이 차단된 Docker Compose에서 PBF → SQLite → Next.js PNG, 줌 0/13/16/19, ETag·404/400, 비루트 실행과 읽기 전용 원본, 로컬 한글 폰트를 확인했습니다. 공개 모나코 PBF로도 도로·건물·바다·지명 표시를 시각 확인했으며, 사용자 대한민국 PBF가 검증 환경에 제공된 것은 아닙니다.

## 플랫폼 연동 검토

현행 API·데이터 책임·승인 전 연동안은 [플랫폼 연동 조사](docs/PLATFORM_INTEGRATION.md), 이번 실행 결과는 [검증 기록](docs/VALIDATION.md)을 참고하세요. 공통 API 계약이나 시설 식별자 정책의 승인을 의미하지 않습니다.

## GitHub Actions 회귀 검사

`.github/workflows/map-regression.yml`은 모든 PR과 main push에서 Node.js 24 / Ubuntu 24.04 GitHub runner를 사용합니다. Node·브라우저·변환 job은 별도 checkout과 작업 공간에서 실행하므로 fixture·캐시·포트가 공유되지 않습니다. 외부 의존성 설치에는 인터넷이 필요하지만 브라우저의 오프라인 회귀 시나리오는 외부 지도 요청을 차단해 별도로 검증합니다. 실제 사용자 TPK·DEM·PBF나 비밀 설정은 필요하지 않습니다.

- **Node regression and typecheck**: `npm ci` → `npm run typecheck` → `npm run ci:node`. 기존 tiles/buildings/layers/osm/measure/launcher 6개 명령을 모두 실행하며 실패 종료 코드를 유지합니다. 추가 `test:ci-tools`는 집계기의 실패 전달·빈 실행·전체 스킵 처리 등을 검증합니다. 현재 앱 회귀 75개(이슈 #9 검색·지연 목록 병합 검사 4개 추가)와 도구 검증 5개를 구분합니다.
- **Playwright regression**: `npm ci` → `npx playwright install --with-deps chromium` → `npm test`. 기존 5개 프로젝트·workers=2를 유지하며 합성 fixture 생성, production build 1회, 서버 5개의 준비/종료를 기존 Playwright 설정이 담당합니다. 별도 build step은 추가하지 않습니다.
- 각 job의 Step summary에서 총수·통과·실패·스킵·미실행을 확인합니다. 0개/전체 스킵, 누락된 결과, 실행되지 않은 브라우저 프로젝트는 성공 증거로 취급하지 않습니다. 자동 재시도·timeout 증가는 추가하지 않았습니다.
- 브라우저 HTML/JSON 보고서와 build/서버/테스트 로그는 `browser-diagnostics-<run_id>-<attempt>`에 7일 보관합니다. 실패한 테스트에는 trace·스크린샷·error context를 포함합니다. Node 실패 로그/집계 JSON은 `node-diagnostics-<run_id>-<attempt>`에 7일 보관합니다. 업로드 대상은 보고서 경로만 지정하며 원본 데이터·.env·전체 환경변수·fixture 캐시는 포함하지 않습니다. setup 실패 등으로 파일이 없으면 해당 step 로그를 확인합니다.

로컬에서는 `npm ci`, `npm run typecheck`, `npm run ci:node`를 실행하고 브라우저는 Chromium 설치 후 `CI=true npm test`로 보고서를 생성합니다. `TYPECHECK_OUTCOME=success node scripts/ci/summary.mjs node`는 실제 typecheck 성공 후에만 사용하며 브라우저 집계는 `node scripts/ci/summary.mjs browser`입니다. npm 기본 캐시가 읽기 전용인 클라우드는 작업 공간 캐시 경로를 지정할 수 있습니다.

관리자는 Actions 사용 허용과 runner 용량을 확인하고, 실제 성공 check가 생성된 뒤 main의 브랜치 보호/Ruleset 필수 검사에 `Node regression and typecheck`, `Playwright regression`, `Conversion regression`을 등록해야 합니다. 실패 PR의 병합 차단도 별도로 확인해야 하며 이 workflow 추가만으로 보호 설정 완료를 뜻하지 않습니다. 실제 run URL/SHA와 현재 미포함 범위는 [검증 기록](docs/VALIDATION.md)에 기록합니다.

최초 원격 PR 검증은 [Actions run 44870551061](https://github.com/JaewonYe/map_service/actions/runs/44870551061), head `55bf43827d0c14ab0fb652a939e43abbfca218c2`에서 성공했습니다(앱 71개·도구 5개·브라우저 30개, 실패/스킵 0). 이후 최종 SHA와 main push 실행 결과는 [이슈 #5](https://github.com/JaewonYe/map_service/issues/5)의 완료 기록을 확인하세요.


## 합성 DEM·OSM 변환 CI와 로컬 재현

`Conversion regression` job은 PR과 main push에서 production 변환 이미지 두 개를 빌드합니다. 기존 DEM 3개·PBF 4개 테스트의 assertion을 그대로 실행하며, 별도 Python 집계 도구 검사 5개는 import 오류·실제 assertion 실패·0개/전체 스킵·하위 종료 코드 보존을 검증합니다. Node/브라우저 검사와 독립된 runner입니다.

저장소 루트에서 Linux/WSL 또는 Docker가 준비된 환경에서 실행합니다. 아래 명령은 테스트 이미지 태그만 사용하며 사용자 data 폴더를 마운트하지 않습니다.

```sh
docker build --progress plain -t map-service-elevation-tools:ci scripts/elevation
docker build --progress plain -t map-service-osm-tools:ci scripts/osm
bash scripts/ci/conversion-tests.sh
python3 scripts/ci/conversion.py summary
```

기존 운영 Compose 빌드는 `docker compose --profile tools build prepare-elevation prepare-osm`으로 유지합니다. CI 테스트 실행은 실제 데이터 폴더가 연결된 Compose 서비스 대신 위 이미지에 저장소 전체를 `/workspace`로 읽기 전용 마운트합니다. 작업 디렉터리는 `/workspace`, 인터프리터는 이미지의 `/usr/bin/python3`입니다. DEM 테스트는 `/workspace/scripts/elevation/prepare.py`를 참조하고, OSM은 기존 `OSM_PREPARE_SCRIPT=/tools/prepare.py`를 사용합니다. 이미지의 production script/schema와 저장소 파일의 SHA256이 일치하는지도 검사해 오래된 이미지 재사용을 거부합니다.

테스트 컨테이너는 비루트·읽기 전용 rootfs·네트워크 없음이며 합성 GeoTIFF/PBF와 결과는 임시 `/tmp`에만 만듭니다. 원본 해시·이전 데이터 보존·OSM 재사용·음수/0m/NoData assertions를 유지합니다. `.cache/ci/conversion/`에는 호스트가 실행 로그만 저장하고, CI summary는 DEM/PBF 수치와 실행 버전을 구분합니다. 누락 결과·import 오류·0개/전체 스킵·예상 수 불일치는 실패입니다. 파이프 로그 기록 중에도 Docker/Python의 실패 종료 코드를 보존합니다.

두 Dockerfile의 기반은 `debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc`(multi-platform index)입니다. Linux amd64 manifest는 `sha256:c67e92c8099ba22853ab4cfda7cfb494d253d6012ca82dee98ba8976772af018`입니다. 로컬 검증에서 Python 3.11.2 / GDAL 3.6.2 / NumPy 1.24.2 / Shapely 1.8.5(OSM)를 확인했습니다. 실행별 정확한 Debian package 버전·GDAL 드라이버·production SHA256은 `dem.log`/`osm.log`, 실제 빌드 image ID는 `images.log`에 기록합니다.

**고정 범위:** 기반 image digest는 고정했지만 APT 저장소·전이 의존성·`docker/dockerfile:1` frontend와 GitHub runner/Docker 버전은 가변입니다. 전체 환경의 byte 단위 재현성을 보장하지 않습니다. 갱신 시 `docker buildx imagetools inspect debian:bookworm-slim`으로 새 digest/아키텍처를 확인하고 두 Dockerfile을 함께 갱신한 뒤 `--pull --no-cache`로 두 이미지를 다시 빌드하고 7개 변환 및 기존 Node/브라우저 CI를 확인합니다. 패키지 버전과 image ID 차이를 검토해 문서를 갱신합니다. APT 서명/체크섬과 registry/TLS 검증은 끄지 않으며 관리 환경의 CA는 기존 선택적 BuildKit `proxy_ca` secret만 사용합니다.

CI는 `conversion-diagnostics-<run_id>-<attempt>`에 빌드·테스트·버전·image ID 로그만 7일 보관합니다. 합성 데이터 전체·원본 사용자 데이터·이미지 tar·환경변수·비밀은 업로드하지 않습니다. 원격 run URL/SHA는 [검증 기록](docs/VALIDATION.md)과 [이슈 #7](https://github.com/JaewonYe/map_service/issues/7) 완료 댓글에서 확인합니다. 새 job의 필수 검사 등록과 실제 병합 차단 확인은 관리자 후속 작업입니다. 실데이터·Windows/Ubuntu 실기·인증/운영·공통 플랫폼 계약 검증은 여전히 미실행입니다.

수정 후 최초 원격 변환 검증은 [run 44874199867](https://github.com/JaewonYe/map_service/actions/runs/44874199867), PR head `fd3a1beed3cadb3cfdde50e39ad8c3b81fa4aaae`에서 세 job 모두 성공했습니다. 변환 7개·Python 도구 5개와 기존 앱 71개·Node 도구 5개·브라우저 30개가 통과했습니다. 최초 guard 실패 원인·수정·실행별 버전/image ID는 검증 기록에, 최종 SHA의 두 이벤트 결과는 이슈 #7에 기록합니다.

## 공통 UI 디자인 스킬

[공통 디자인 기준](design-system/platform/MASTER.md)을 읽고 `.agents/skills/ui-ux-pro-max`로 디자인 권고를 검색한 뒤 `.agents/skills/web-design-guidelines`로 UI를 검토합니다. `python3 scripts/check_design_skills.py`로 설치를 검증합니다. Python 3 표준 라이브러리만 필요하며 런타임 웹 의존성은 추가하지 않습니다.

대표 지점 이동·정점 편집·기존 삭제 확인의 양 테마/크기 실제 앱 캡처와 접근성 검토는 [DIRECT_EDIT_REVIEW](docs/DIRECT_EDIT_REVIEW.md), 실행 수·실패 보완·원격 증거는 [VALIDATION](docs/VALIDATION.md) 및 이슈 #16 완료 기록을 참조하세요.

`/downloads`의 **지도 데이터 삭제·초기화**에서 선택 작업·패키지 삭제, 전체 초기화, 백업 복원을 실행할 수 있습니다. 확인 문구를 입력한 뒤 worker가 처리하며 시설·경계·OSM 수정·인증 설정은 보존합니다. 파일은 백업으로 옮기므로 디스크 공간은 계속 사용합니다. [정리 범위·복원·web/worker 업데이트](docs/DOWNLOAD_MANAGER.md#웹에서-지도-삭제전체-초기화복원)를 먼저 확인하세요.


`/downloads`의 **다운로드한 위성 지도 표시**에서 개별 체크나 **전체 선택 / 전체 해제** 후 **선택한 지도 표시**를 누르면 위성 표시 선택을 저장합니다. 전국 개요와 지역 상세를 함께 선택하면 위치·실제 줌·범위에 맞는 타일을 우선합니다. 전체 해제는 파일 삭제 없이 위성 표시만 끕니다. [선택 기준·업데이트·복구](docs/DOWNLOAD_MANAGER.md#다운로드한-위성-지도-선택)를 참고하세요.
