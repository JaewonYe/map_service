# 태안군 OSM 지도 — Next.js + MapLibre

## 간편 실행 (Windows)

**Docker Desktop을 시작한 뒤 저장소의 `실행.cmd`를 더블클릭하세요.** Node.js 22 이상과 Docker Desktop이 필요합니다.

| 메뉴 | 기능 |
| --- | --- |
| 1 | 지도 데이터 최초 준비: 원본 다운로드 → 태안군 추출 → 타일 생성 |
| 2 | 위성영상 준비: 밴드 다운로드 → RGB·근적외선·NDVI 생성·검증 |
| 3 | **평소 실행:** Docker 서비스 시작 후 브라우저 열기 |
| 4 | 개발 실행: Next.js 변경을 바로 반영 |
| 5 | Docker 서비스 종료 (데이터 유지) |
| 6 | 상태·오류 로그 확인 |
| 7 / 8 | 보관한 원본으로 지도 / 위성영상 재가공 |
| 0 | 메뉴 닫기 (실행 중인 Docker 서비스는 유지) |

최초에는 **1 → 2(선택) → 3**, 이미 데이터를 준비했다면 **3만** 선택하세요. 기존 지도·위성자료는 재사용하며 매번 다운로드하지 않습니다. 완료되지 않은 단계에서 오류가 발생하면 이후 단계로 진행하지 않습니다. 메뉴 7/8도 원본을 새 버전으로 다운로드하는 기능은 아닙니다.

PowerShell에서 프로젝트 폴더에 있다면 아래 한 줄로 메뉴를 열 수 있습니다.

```powershell
.\실행.cmd
```

바로 실행하거나 종료하려면 `.\실행.cmd start`, `.\실행.cmd stop`을 사용하세요. Node를 직접 쓰려면 `node scripts/manage.mjs start`도 가능합니다. 메뉴 3의 서비스는 터미널을 닫아도 유지됩니다. 메뉴 4의 개발 서버는 터미널을 유지해야 하며 `Ctrl+C`로 종료합니다. 이때 Docker 서비스는 메뉴 5로 별도 중지하세요.

실행 메뉴의 데이터 재사용·실패 중단·포트 처리 테스트 6개는 Linux에서 통과했습니다. Windows에서 더블클릭 및 PowerShell 다운로드를 직접 실행한 검증은 아직 하지 않았습니다.

다운로드는 Windows PowerShell의 `Invoke-WebRequest`를 사용합니다. 이 작은 다운로드 스크립트를 실행할 때만 프로세스 단위 실행 정책을 지정하며 시스템의 실행 정책은 변경하지 않습니다. 조직 정책으로 스크립트 실행이 차단되면 아래 수동 다운로드 절차를 사용하세요. 실제 위성자료 다운로드에는 네트워크 접근이 필요하며, 실행 스크립트가 서버 차단을 해제하지는 않습니다.

## Quick Guide (Windows PowerShell)

**준비:** Git, Node.js 22 이상, Docker Desktop(WSL 2·Linux containers)을 설치하고 Docker Desktop을 실행하세요. 명령이 실패하면 다음 단계로 넘어가지 마세요.

**1. 최초 설정** — 이미 복제했다면 해당 저장소 폴더에서 `npm.cmd ci`부터 실행합니다.

```powershell
git clone https://github.com/JaewonYe/map_service.git
Set-Location .\map_service
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

**2. 대한민국 원본에서 태안군 PBF 생성** — 이미 태안군 PBF가 있다면 `data/taean.osm.pbf`로 복사하고 다음 단계로 넘어갑니다. 모나코 PBF의 파일명만 바꿔 사용하면 안 됩니다.

```powershell
New-Item -ItemType Directory -Force -Path .\data\vector | Out-Null
Invoke-WebRequest -Uri "https://download.geofabrik.de/asia/south-korea-latest.osm.pbf" -OutFile ".\data\south-korea.osm.pbf" -ErrorAction Stop
docker compose build extract
# 다운로드와 빌드가 성공한 후 실행합니다.
docker compose --profile tools run --rm extract
```

추출기는 대한민국 PBF의 OSM 태안군 행정경계(`admin_level=6`)를 찾아 `data/taean.osm.pbf`를 생성합니다. 외부 해안선 ZIP은 필요 없습니다.

**3. 벡터 타일 생성** — 태안군 PBF에서 `data/vector/region.mbtiles`를 생성합니다. 최초 1회 또는 데이터 갱신 시 실행합니다.

```powershell
docker compose stop tiles
docker compose --profile tools run --rm import
```

**4. 개발 실행** — 생성이 성공한 뒤 실행하고 `http://127.0.0.1:3000`을 엽니다.

```powershell
docker compose up -d tiles imagery
npm.cmd run dev
```

**종료:** `Ctrl+C` 후 `docker compose down`. PBF와 생성된 타일 파일은 유지됩니다.

## 무엇이 표시되나요?

- 도로와 건물, PBF의 닫힌 수면 도형을 표시합니다.
- **일반 지도에는 바다/해안선, 지형, 글자 라벨, POI가 없습니다.** 위성영상은 아래 별도 준비 절차를 완료하면 사용할 수 있습니다. 바다 영역도 기본 배경색으로 보일 수 있습니다. 지역 경계에서 잘린 수면 및 복잡한 관계 도형은 완전하지 않을 수 있습니다.
- 폰트·스프라이트·외부 스타일·외부 ZIP을 요청하지 않습니다. `osmdata.openstreetmap.de`, Natural Earth, PostgreSQL/PostGIS가 필요 없습니다.
- 타일은 z6~14에서 생성하며, 더 확대하면 z14 타일을 확대 표시합니다. 데이터 지역 밖에는 기본 배경만 보일 수 있습니다.
- 최초 Docker 이미지와 npm 패키지 설치에는 인터넷이 필요합니다. 이미 준비된 이미지·의존성과 로컬 PBF가 있으면 타일 생성 및 지도 제공에는 외부 데이터 다운로드가 필요 없습니다.

## 위성영상 3종 다운로드·비교·이동

같은 Sentinel-2 자료(약 10m)의 **자연색 RGB / 근적외선 강조 / 식생지수 NDVI**를 제공합니다. 열화상이나 건물 식별용 항공사진은 아닙니다. 원본 Red·Green·Blue·NIR 밴드는 한 번만 다운로드하며 세 영상이 같은 장면을 공유합니다.

**1. 도구 빌드·다운로드** — 아래 두 도메인의 HTTPS 접근이 필요합니다.

- `earth-search.aws.element84.com` (카탈로그)
- `sentinel-cogs.s3.us-west-2.amazonaws.com` (원본 밴드)

```powershell
docker compose --profile imagery-tools build imagery-download
docker compose --profile imagery-tools run --rm imagery-download
```

기본 검색 기간은 **2025년 10월**, 장면 전체 구름 비율 15% 이하입니다. 다른 기간은 다운로드 명령 뒤에 `--dates "2025-09-01T00:00:00Z/2025-09-30T23:59:59Z" --max-cloud 20`을 붙이세요. 격자별로 구름이 적은 장면을 선택하므로 하나의 모자이크에 여러 촬영일이 포함될 수 있고 태안군에 구름이 남을 수 있습니다. 경계 파일이 있으면 도서를 포함하는 행정경계의 사각형 범위를 사용하며, 없으면 서쪽 도서까지 포함하는 기본 범위를 사용합니다. 주변 지역·바다도 영상에 포함될 수 있습니다.

장면 전체 원본 밴드를 보관하므로 여러 장면이면 수 GB 이상의 디스크가 필요할 수 있습니다. 처리용 RAM 8~16GB와 충분한 SSD를 준비하고 실제 사용량을 확인하세요.

**2. 오프라인 가공·적용** — 다운로드가 성공한 후 순서대로 실행합니다. 가공과 검증 컨테이너는 네트워크가 차단됩니다.

```powershell
docker compose stop imagery
docker compose --profile imagery-tools run --rm imagery-build
docker compose --profile imagery-tools run --rm imagery-verify
docker compose up -d imagery
```

개발 서버를 실행하고 페이지를 새로고침하면 자연색 영상이 기본으로 표시됩니다. **지도 종류**에서 세 영상을 전환하거나 **세 영상 나란히 비교**를 누르세요. 세 지도의 위치·확대·회전이 함께 움직입니다. 도로·건물을 겹쳐 볼 수도 있습니다. Docker 웹은 새 프록시 설정을 위해 `docker compose up -d --build web`으로 다시 빌드합니다. 데이터가 없으면 영상 옵션과 비교 버튼은 비활성화되고 일반 지도는 유지됩니다.

- 자연색: Red·Green·Blue, 반사도 0~0.3 및 감마 2.2 표시 보정
- 근적외선 강조: NIR·Red·Green을 RGB로 배치한 가색상 영상 (열화상 아님)
- NDVI: STAC의 scale/offset을 적용한 반사도로 `(NIR-Red)/(NIR+Red)` 계산; −1~1을 색상으로 표시

명시적인 반사도 보정 정보가 없거나 장면별 보정값이 다르면 임의 추정하지 않고 중단합니다. 가시광·NIR 정렬 후 NDVI를 계산하므로 재표본화 영향이 있으며, 구름·그림자·대기 영향이 남을 수 있습니다. **NDVI 타일은 비교용 색상 시각화이며 검증된 농작물 진단이나 정량 지수 파일이 아닙니다.** 원본 밴드와 보정 정보를 보관해 추후 다시 처리할 수 있습니다.

영역의 유효 픽셀 비율이 98% 미만이면 생성을 실패 처리합니다. 이것은 구름이 없다는 검증이 아닙니다. 새 파일 3종 생성이 완료된 뒤에만 manifest를 교체하므로 실패 시 기존 완료 버전이 유지됩니다.

**3. 백업·이동** — 아래 **`data/imagery/taean/sentinel2/` 폴더 전체**를 복사하세요. 실제 영상은 Git에 업로드하지 않습니다.

```text
data/imagery/taean/sentinel2/
├── source/
│   ├── <장면ID>-red.tif / -green.tif / -blue.tif / -nir.tif
│   ├── *.stac.json              # 촬영일·출처·공간정보·밴드 보정값
│   ├── *.sha256                 # 원본 체크섬
│   └── acquisition.json         # 선택 장면·상대경로·체크섬
├── processed/
│   ├── rgb-<체크섬>.mbtiles
│   ├── infrared-<체크섬>.mbtiles
│   └── ndvi-<체크섬>.mbtiles
└── manifest.json                # 날짜·이용 조건·표시 방식·현재 파일 참조·체크섬
```

복사 전 `docker compose stop imagery`로 중지합니다. 다른 PC의 동일한 경로에 붙여넣고 아래 명령을 실행하면 **재다운로드·재가공 없이** 사용할 수 있습니다. 새 PC는 위 1단계의 **빌드만** 수행하거나 이미지도 미리 옮겨야 합니다.

```powershell
docker compose --profile imagery-tools run --rm imagery-verify
docker compose up -d tiles imagery
npm.cmd run dev
```

원본·촬영 메타데이터·가공 타일을 SHA256으로 검사합니다. `source/`와 Copernicus 출처·이용 조건 링크도 함께 보관하세요. 이전 가공 버전은 자동 삭제하지 않습니다. 영상 서버 포트는 기본 8082이며 `IMAGERY_PORT`, `IMAGERY_SERVER_URL`을 함께 조절합니다.

**현재 실제 다운로드 상태:** 클라우드 정책의 HTTP 403으로 실제 태안군 위성자료는 아직 다운로드하지 못했습니다. 폴더가 존재하는 것만으로 다운로드 완료를 판단하지 마세요. 합성 시험 자료는 실제 데이터 폴더에 넣지 않습니다.

## 구성

```text
대한민국 .osm.pbf → osmium 행정경계 추출 → 태안군 .osm.pbf → tilemaker (자체 JSON/Lua 설정) → region.mbtiles
브라우저 → Next.js + MapLibre → /tile/z/x/y.pbf → Python 읽기 전용 타일 서버
```

| 위치 | 역할 |
| --- | --- |
| `data/south-korea.osm.pbf` | 다운로드한 대한민국 OSM 원본 |
| `data/taean.osm.pbf` | 행정경계로 추출한 태안군 OSM 원본 |
| `data/taean.boundary.geojson` | 추출에 사용한 행정경계 |
| `data/taean.manifest.json` | 원본·결과 SHA256 및 객체 수 |
| `extract/extract.py` | 태안군 경계 선택 및 PBF 추출 |
| `data/vector/region.mbtiles` | 생성된 벡터 타일 (Git 제외) |
| `tilemaker/config.json`, `tilemaker/process.lua` | 외부 자료 없는 최소 레이어 생성 |
| `tile-server/server.py` | MBTiles(TMS)를 XYZ HTTP 타일로 제공; gzip 처리 |
| `lib/map-style.ts` | MapLibre의 로컬 스타일 |
| `lib/map-config.ts` | 중심 좌표·확대 수준 (기본 태안군 전체 보기) |
| `components/MapCanvas.tsx` | 클라이언트 전용 지도와 확대·이동 제어 |
| `next.config.mjs` | 동일 출처 타일 프록시 |

다른 지역을 쓰려면 `extract/extract.py`의 경계 선택 조건, Compose 입력 파일과 `lib/map-config.ts`의 중심 좌표를 함께 바꾸세요. MapLibre 사용 중 좌표는 컴포넌트에서 `[경도, 위도]`로 변환됩니다. 브라우저에 WebGL 지원이 필요합니다.

## 추출 범위와 기존 데이터 전환

- 태안군 전체는 사각형이 아닌 **OSM 행정경계 폴리곤**으로 선택합니다. 경계에 포함된 도서도 대한민국 원본에 존재하면 포함됩니다. OSM 경계의 완전성·정확성에 의존하며 공식 지적 경계 데이터를 대신하지 않습니다.
- 경계를 통과하는 도로·건물은 잘라내지 않고 온전한 way로 보존(`complete_ways`)하므로 일부 도형은 군 밖까지 이어집니다. 경계 부근 relation은 불완전할 수 있습니다.
- 태안군 경계가 없거나 여러 개라면 추출을 실패 처리합니다. 사각형 범위로 자동 대체하지 않습니다. 추출은 네트워크 차단 상태에서 수행되며 원본 파일을 수정하지 않습니다.
- 대한민국 원본 처리는 태안군 타일 호스팅보다 RAM·디스크를 더 사용합니다. 추출용으로 RAM 8~16GB와 충분한 SSD 여유를 우선 준비하고 실제 사용량을 확인하세요. 생성 후 호스팅에는 `region.mbtiles`만 필요합니다.
- 기존 모나코·래스터 데이터를 사용 중이라면 `docker compose down`으로 중지하고 `npm.cmd ci` 후 위 Quick Guide 2~4단계를 수행하세요. 기존 `data/region.osm.pbf`는 보존하지만 새 구성에서는 사용하지 않습니다.
- 기존 DB 볼륨과 ZIP은 삭제하지 않습니다. `down -v`, `docker volume prune`은 실행하지 마세요. 태안군 추출이 성공한 뒤에만 타일을 재생성하세요.

## Docker로 전체 실행

타일 생성 후 실행합니다. 웹은 기본 `http://127.0.0.1:8080`입니다.

```powershell
docker compose up -d --build
npm.cmd run smoke
```

개발 타일 서버는 `127.0.0.1:8081`이며 `.env`의 `TILE_PORT`, `TILE_SERVER_URL`을 함께 조절합니다. Docker의 Next.js는 `http://tiles:80`을 사용합니다. 주소는 빌드 시 고정되므로 변경 시 다시 빌드하세요. 공개 운영에는 TLS, 요청 제한, 모니터링 및 용량 계획을 별도로 추가해야 합니다. Python 서버는 작은 지역 개발을 위한 최소 구현입니다.

프록시 CA가 필요한 관리형 환경에서는 Dockerfile의 선택적 빌드 secret을 사용할 수 있습니다. 일반 로컬 실행에는 필요 없습니다.

```powershell
$proxyCaPath = "C:\certs\company-proxy-ca.pem"
docker build --secret "id=proxy_ca,src=$proxyCaPath" -t map-service-web:local .
```

## 검증·문제 확인

### import에서 `set: Illegal option` 오류가 나는 경우

Windows의 CRLF 줄바꿈이 Linux 셸에 전달되면 발생할 수 있습니다. 최신 Compose 구성은 임시 복사본을 LF로 변환해서 실행하며, `.gitattributes`도 셸 스크립트의 LF 체크아웃을 지정합니다. 이전 구성을 사용 중이라면 PowerShell에서 아래 명령으로 현재 파일을 LF·UTF-8(BOM 없음)으로 저장한 뒤 다시 생성하세요. 관리자 권한이나 `chmod`는 필요 없습니다.

```powershell
$path = Join-Path (Get-Location) "tilemaker\import.sh"
$text = [System.IO.File]::ReadAllText($path).Replace("`r`n", "`n")
[System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))
docker compose --profile tools run --rm import
```


### Windows에서 MapLibre worker 파일이 없다는 오류가 나는 경우

`predev`에서 `maplibre-gl-worker.mjs`를 찾지 못하면, 이전 버전의 `node_modules`가 남았거나 의존성 설치가 완료되지 않았을 수 있습니다. 다운로드한 최신 저장소 폴더에서 다음을 실행하세요.

```powershell
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "의존성 설치 실패: 위 설치 로그를 확인하세요" }
npm.cmd run dev
```

`npm.cmd ci`는 잠금 파일에 맞춰 의존성을 다시 설치합니다. 기존 지도 PBF와 MBTiles는 삭제하지 않습니다. 설치가 실패하면 개발 서버 실행 전에 설치 오류를 해결해야 합니다. `package-lock.json`은 삭제하지 마세요. 계속 실패하면 `npm.cmd ls maplibre-gl` 결과와 설치 오류를 확인하세요.


```powershell
npx.cmd playwright install chromium
npm.cmd test
npm.cmd run typecheck
```

브라우저 테스트는 실제 모나코 PBF에서 생성한 테스트 벡터 타일을 사용합니다. Next.js 프로덕션 빌드 및 포트 3100/3101 서버를 자동으로 실행하여 로컬 요청·프록시·도형·오류 안내를 검사합니다. 테스트 후 실제 서버용 주소로 다시 빌드하세요. 테스트는 GPU가 없는 환경에서도 Chromium 소프트웨어 WebGL을 사용합니다.

현재 실행 중인 타일 서버에서 실제 도로·건물 도형을 검사하려면:

```powershell
npm.cmd run test:tiles
```

전체 Docker 서비스 검사는 `npm.cmd run smoke`입니다. 웹 포트를 바꿨다면 `$env:MAP_URL = "http://127.0.0.1:포트"`를 지정합니다. 다른 지역은 `$env:SMOKE_TILE = "z/x/y"`로 도로·건물이 존재하는 타일을 선택하세요. 환경변수는 `Remove-Item Env:MAP_URL`, `Remove-Item Env:SMOKE_TILE`로 해제합니다.

오류는 `docker compose logs --tail=100 tiles web`으로 확인합니다. 생성 파일이 없으면 타일 서버는 시작되지 않습니다. 빈 영역은 HTTP 204, 잘못된 좌표는 HTTP 400, 잘못된 경로는 HTTP 404를 반환합니다. 타일 재생성 전 파일을 백업하고 서버를 중지하세요. 변환은 임시 MBTiles로 진행하고 성공한 경우에만 완성 파일을 교체합니다. 생성 실패 시 기존 완성 파일은 유지됩니다.

OSM 저작자 표시를 유지하며, 데이터 재배포·파생 DB에는 [ODbL 조건](https://www.openstreetmap.org/copyright)을 확인하세요. 향후 위성 영상을 배경 레이어로 추가하고 현재 벡터 도로·건물을 겹칠 수 있습니다.

태안군 실제 데이터 생성 상태: 현재 클라우드에서는 `download.geofabrik.de` 접근이 HTTP 403으로 차단되어 실제 대한민국 원본 및 태안군 PBF·타일을 아직 생성하지 못했습니다. 합성 데이터 검증과 실제 지역 데이터 검증을 구분해야 합니다. Windows에서 직접 실행한 검증도 아직 하지 않았습니다.

원본 다운로드가 차단되면 접속 가능한 다른 네트워크에서 [대한민국 PBF](https://download.geofabrik.de/asia/south-korea-latest.osm.pbf)를 받고 `data/south-korea.osm.pbf`에 복사한 뒤 추출 명령부터 실행하세요.

검증: 합성 행정경계의 내부 도로·건물 포함 및 외부 도로 제외, 실패 시 기존 PBF 보존, 추출 PBF의 벡터 타일 변환을 확인했습니다. 경계 추출 테스트 3개, 브라우저 테스트 3개와 TypeScript 검사도 통과했습니다. 이는 실제 태안군 데이터 검증 결과가 아닙니다.

위성 기능 검증: 합성 반사도 밴드로 RGB/NIR/NDVI 생성·계산식·음수 offset 적용·세 타일 제공·폴더 복사·체크섬 검사 4개, Chromium 테스트 5개, 타입 검사를 통과했습니다. 실제 위성자료 다운로드·화질·촬영 범위 검증은 HTTP 403 해소 후 별도로 필요합니다.
