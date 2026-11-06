# Next.js 기반 자체 호스팅 OSM 지도

## Quick Guide (Windows PowerShell)

**준비:** Git, Node.js 22 이상, Docker Desktop(WSL 2·Linux containers)을 설치하고 Docker Desktop을 실행하세요. 아래 명령은 순서대로 실행하며, 실패하면 다음 단계로 넘어가지 마세요.

**1. 최초 설정** — 저장소를 복제하고 의존성과 환경설정을 준비합니다. 이미 복제했다면 기존 폴더에서 `npm.cmd ci`부터 실행하세요.

```powershell
git clone https://github.com/JaewonYe/map_service.git
Set-Location .\map_service
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

**2. 지도 데이터 준비 (최초 1회)** — 작은 모나코 데이터를 다운로드하고 DB에 가져옵니다. 완료까지 시간이 걸립니다. 기존 DB에는 import를 다시 실행하지 마세요.

```powershell
New-Item -ItemType Directory -Force -Path .\data | Out-Null
curl.exe --fail --location --retry 3 --output .\data\region.osm.pbf https://download.geofabrik.de/europe/monaco-latest.osm.pbf
# 다운로드 성공 후 실행합니다.
docker compose --profile tools run --rm import
```

**3. 개발 서버 실행** — 데이터 가져오기가 성공한 후 실행하고, 브라우저에서 `http://127.0.0.1:3000`을 엽니다. 이후에는 이 단계만 반복하면 됩니다.

```powershell
docker compose up -d tiles
npm.cmd run dev
```

**종료:** `Ctrl+C`로 Next.js를 종료한 뒤 `docker compose down`으로 타일 서버를 중지합니다. 지도 데이터는 유지됩니다.

설치·배포·테스트의 상세 설명은 아래 항목을 참고하세요.

---

Next.js App Router + React + TypeScript 프런트엔드입니다. Leaflet을 클라이언트 컴포넌트에서 `dynamic(..., { ssr: false })`로 로드합니다. 지도 라이브러리와 스타일은 Next.js 번들로 제공하며 외부 CDN이나 OSM 공용 타일 서버를 사용하지 않습니다.

지도 백엔드는 별도 Docker 서비스입니다. OpenStreetMap 추출본을 PostgreSQL/PostGIS에 가져오고 Mapnik/renderd가 PNG 타일을 생성합니다. Next.js `rewrites`가 `/tile/{z}/{x}/{y}.png` 요청을 타일 서버로 전달하므로 브라우저의 별도 CORS 설정이 필요 없습니다. 기존 Nginx 정적 웹 서버는 제거했습니다.

```text
브라우저 → Next.js (React/Leaflet 화면)
         → Next.js /tile/... 프록시 → tiles (Mapnik/renderd + PostGIS)
```

## Windows 준비

아래 명령은 **Windows 10/11의 PowerShell** 기준입니다. CMD나 Git Bash 대신 PowerShell에서 실행하세요. Windows에서 Next.js를 실행하고, 지도 백엔드는 Docker Desktop의 Linux 컨테이너에서 실행합니다. Ubuntu를 별도로 설치할 필요는 없습니다.

1. [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/)를 설치하고 WSL 2 백엔드와 **Linux containers** 모드를 사용합니다. WSL이 없다면 관리자 PowerShell에서 `wsl --install`을 실행한 뒤 재부팅하고 Docker Desktop을 시작하세요. 자세한 OS·가상화 요구사항은 Docker Desktop 설치 문서를 확인하세요.
2. Git for Windows와 Node.js 22 이상(LTS 권장)을 설치합니다. Node.js 설치 후 PowerShell을 새로 열어 PATH를 반영하세요.
3. 작은 지역부터 시작하세요. 이미지 및 해안선 등 공통 데이터 때문에 작은 추출본도 수 GB 이상의 저장공간과 가져오기 시간이 필요합니다. Docker/WSL에 사용 가능한 RAM 8GB 이상, 여유 디스크 수십 GB를 우선 권장하며 실제 필요량은 지역에 따라 달라집니다. Windows x64와 Linux amd64 이미지 조합을 대상으로 하며, Windows ARM64는 별도 확인이 필요합니다.

```powershell
wsl --status
docker version
docker compose version
node --version
npm.cmd --version
git --version
```

`docker version`에 Server 정보도 나와야 합니다. 연결 오류가 나면 Docker Desktop이 실행 중인지, Linux containers 모드인지 확인하세요. 아래에서는 PowerShell 실행 정책으로 `npm.ps1`이 차단되는 문제를 피하도록 `npm.cmd`와 `npx.cmd`를 사용합니다. 실행 정책을 변경할 필요는 없습니다.

## 빠른 시작: 모나코

최초 한 번 저장소를 복제합니다. 이미 복제했다면 `git clone`을 생략하고 기존 저장소 폴더로 이동하세요. 이후 명령도 모두 저장소 루트에서 실행합니다.

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\source" | Out-Null
Set-Location "$HOME\source"
git clone https://github.com/JaewonYe/map_service.git
Set-Location .\map_service
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "의존성 설치 실패" }

# 기존 .env는 유지합니다. 필요한 새 항목은 .env.example을 보고 직접 반영하세요.
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
New-Item -ItemType Directory -Force -Path .\data | Out-Null
curl.exe --fail --location --retry 3 --output .\data\region.osm.pbf https://download.geofabrik.de/europe/monaco-latest.osm.pbf
if ($LASTEXITCODE -ne 0) { throw "지도 데이터 다운로드 실패" }

# 새 데이터 볼륨에서 한 번 실행합니다. 성공한 후에만 서버를 시작하세요.
docker compose --profile tools run --rm import
if ($LASTEXITCODE -ne 0) { throw "지도 데이터 가져오기 실패: 로그를 확인하세요" }
```

`curl.exe`는 Windows PowerShell의 `curl` 별칭과 구분하기 위한 표기입니다. `curl.exe`가 없다면 다운로드 명령 대신 `Invoke-WebRequest -Uri "https://download.geofabrik.de/europe/monaco-latest.osm.pbf" -OutFile .\data\region.osm.pbf`를 사용하세요. 다운로드 도중 종료되었거나 실패한 파일은 가져오지 말고 다시 다운로드하세요.

가져오기에는 `download.geofabrik.de`, `osmdata.openstreetmap.de`, `naturalearth.s3.amazonaws.com`에 HTTPS 접근이 필요합니다. 이미지 다운로드에는 Docker Hub, npm 설치에는 npm 레지스트리 접근도 필요합니다. 회사 프록시를 사용한다면 컨테이너에도 프록시와 신뢰할 CA를 전달하세요. 인증서 검증을 끄지 마세요.

### 로컬 개발: Next.js 빠른 새로고침

```powershell
docker compose up -d tiles
if ($LASTEXITCODE -ne 0) { throw "타일 서버 시작 실패" }
npm.cmd run dev
```

브라우저에서 `http://127.0.0.1:3000`을 엽니다. 서버는 이 터미널을 유지하는 동안 실행되며 `Ctrl+C`로 종료합니다.

개발 화면은 포트 3000입니다. Next.js는 `.env`의 `TILE_SERVER_URL`(기본 `http://127.0.0.1:8081`)로 타일을 프록시합니다. 타일 서비스 포트를 변경하면 `TILE_PORT`와 `TILE_SERVER_URL`을 함께 바꾸세요. 환경변수 변경 후 개발 서버를 재시작합니다.

### Docker로 전체 서비스 실행

```powershell
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { throw "서비스 빌드 또는 시작 실패" }
npm.cmd run smoke
```

브라우저에서 `http://127.0.0.1:8080`을 엽니다. Docker 컨테이너는 터미널을 닫아도 실행되며 `docker compose down`으로 중지합니다.

웹 포트는 기본 8080이며 로컬 인터페이스에만 바인딩됩니다. Next.js 컨테이너는 Docker 네트워크의 `http://tiles:80`을 사용합니다. 이미지 빌드에 Node.js 22와 잠금 파일을 사용하고, 실행 이미지는 Next.js standalone 출력으로 구성됩니다.

Dockerfile은 프록시 CA를 선택적으로 지원합니다. 회사 프록시의 인증서를 사용해야 할 때만 신뢰할 CA 파일 경로를 지정하세요. 일반적인 로컬 실행에는 아래 명령이 필요 없습니다. CA는 빌드에만 마운트하고 이미지에 복사하지 않습니다.

```powershell
$proxyCaPath = "C:\certs\company-proxy-ca.pem" # 실제 CA 파일 경로로 변경
docker build --secret "id=proxy_ca,src=$proxyCaPath" -t map-service-web:local .
if ($LASTEXITCODE -ne 0) { throw "이미지 빌드 실패" }
docker compose up -d --no-build
```

### Next.js 프로덕션 서버를 Windows에서 직접 실행

타일 서버는 별도로 필요합니다. 앞서 데이터를 가져온 Docker 타일 서비스를 사용한다면 다음과 같이 실행합니다.

```powershell
docker compose up -d tiles
if ($LASTEXITCODE -ne 0) { throw "타일 서버 시작 실패" }
$env:TILE_SERVER_URL = "http://127.0.0.1:8081"
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Next.js 빌드 실패" }
npm.cmd run start -- --port 3000
```

서버를 실행한 터미널은 그대로 두고, **두 번째 PowerShell**에서 저장소 폴더로 이동한 후 확인합니다.

```powershell
Set-Location "$HOME\source\map_service" # 실제 복제한 경로로 변경
$env:MAP_URL = "http://127.0.0.1:3000"
npm.cmd run smoke
Remove-Item Env:MAP_URL
```

PowerShell의 `$env:이름 = "값"`은 해당 터미널 세션과 그 자식 프로세스에 적용됩니다. 위에서 지정한 빌드 주소를 해제하려면 서버 종료 후 `Remove-Item Env:TILE_SERVER_URL`을 실행하세요. `.env`는 Next.js와 Docker Compose가 읽지만 `scripts/smoke.mjs`는 자동으로 읽지 않으므로, 기본 8080 이외의 웹 포트를 검증할 때는 `$env:MAP_URL`을 지정해야 합니다.

**타일 서버 주소는 빌드 시 고정됩니다.** 프로덕션의 `TILE_SERVER_URL`을 바꾸려면 다시 빌드해야 합니다. 외부 출처 URL은 서버 설정에만 두며 브라우저는 항상 `/tile/...`을 요청합니다.

## 파일 구성

| 경로 | 역할 |
| --- | --- |
| `app/` | App Router 페이지, 루트 레이아웃, 전역 스타일 |
| `components/MapView.tsx` | Leaflet 컴포넌트를 SSR 없이 로드 |
| `components/MapCanvas.tsx` | 지도, 확대·이동, 레이어 선택, 타일 오류 표시 및 정리 |
| `lib/map-config.ts` | 초기 지역과 확대 수준 |
| `next.config.mjs` | 타일 프록시와 standalone 빌드 설정 |
| `compose.yaml` | 데이터 가져오기, 타일 서버, Next.js 서비스 |

## 검증

```powershell
# 최초 한 번 테스트용 Chromium 설치
npx.cmd playwright install chromium
if ($LASTEXITCODE -ne 0) { throw "Chromium 설치 실패" }
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw "브라우저 테스트 실패" }
npm.cmd run typecheck
```

기본적으로 Playwright가 설치한 Chromium을 사용합니다. 별도 브라우저 실행 파일을 사용하려면 `$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = "C:\실제경로\chrome.exe"`를 지정하고 테스트하세요. 기본 브라우저로 돌아가려면 `Remove-Item Env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`를 실행합니다.

테스트는 포트 3100/3101을 사용하며, Next.js 프로덕션 빌드 및 서버를 자동 실행합니다. 테스트 빌드는 테스트용 타일 서버를 가리키므로 실제 서비스 실행 전 올바른 `TILE_SERVER_URL`로 다시 빌드하세요.

브라우저 테스트는 지도 표시·확대, 로컬 리소스 사용, 저작자 표시, 타일 프록시의 바이트와 오류 전달, 실패 안내와 복구를 검증합니다. **테스트용 PNG 서버를 사용하므로 실제 OSM 렌더링 검증을 대신하지 않습니다.**

`npm run smoke`는 실행 중인 서비스의 페이지·JS/CSS와 실제 지도 타일의 HTTP 상태·PNG 서명·256×256 크기를 확인합니다. 첫 렌더링은 오래 걸릴 수 있습니다. 실패 시 `docker compose logs --tail=100 tiles web`로 확인하세요. 데이터 가져오기에 성공하기 전에는 지도가 작동하지 않습니다.

이 클라우드에서는 이전 시도에서 Geofabrik 다운로드가 네트워크 정책에 의해 HTTP 403으로 차단되었습니다. 실제 OSM 가져오기와 실제 지도 렌더링은 아직 검증되지 않았습니다. 필요한 외부 도메인 접근을 허용하거나 추출본을 준비한 뒤 가져오기 및 smoke 검증을 수행하세요.

## 다른 지역과 운영

- 원하는 Geofabrik `.osm.pbf`를 `data/region.osm.pbf`에 준비하고 처음 가져옵니다. `lib/map-config.ts`의 중심·확대 수준을 바꾸세요. 다른 지역의 확인은 PowerShell에서 `$env:SMOKE_TILE = "z/x/y"`로 타일 좌표를 지정한 뒤 `npm.cmd run smoke`로 수행합니다. 검증 후 `Remove-Item Env:SMOKE_TILE`로 해제하세요.
- 기존 DB에 import를 다시 실행하지 마세요. 자동 증분 갱신은 설정하지 않았습니다. 갱신·지역 교체 시 별도 Compose 프로젝트(`docker compose -p map-next ...`)에 새 볼륨으로 가져오고 검증한 뒤 전환하세요. 프로젝트별 `PORT`, `TILE_PORT` 충돌도 피해야 합니다.
- `docker compose down`은 데이터를 유지합니다. **`docker compose down -v`는 지도 DB와 타일 캐시를 삭제합니다.** 운영 데이터는 PostgreSQL 백업과 복구 절차를 별도로 마련하세요.
- PostgreSQL은 호스트에 공개하지 않습니다. 타일 서버는 로컬 개발을 위해 127.0.0.1:8081에만 바인딩됩니다. 인터넷 공개 시 TLS 리버스 프록시, 요청 제한, 접근 제어, 모니터링 및 용량 계획을 추가하세요. `.env`의 `BIND_ADDRESS`와 `PORT`로 웹 바인딩을 조절합니다.
- 이미지 보안 업데이트와 digest 고정을 운영 전 검토하세요. 전체 지구 서비스에는 더 큰 인프라가 필요합니다.

## 위성 지도와 결합하는 방향

OSM은 도로·건물 등 벡터 데이터이며 위성 사진을 제공하지 않습니다. USGS 영상은 데이터셋별 지리 범위, 촬영 시기, 해상도 및 이용 조건을 먼저 확인해야 합니다. 예를 들어 Landsat과 미국 고해상도 정사영상은 제공 범위와 용도가 다릅니다.

다음 단계는 사용 지역의 영상 소스를 정하고 별도 베이스 레이어로 추가하는 것입니다. `MapCanvas`의 Leaflet 레이어 선택기에 연결할 수 있습니다. 도로·라벨을 위성 위에 겹치려면 별도의 투명 스타일 타일 또는 벡터 타일 렌더링이 필요합니다. 현재 OSM 타일은 불투명합니다.

지도에는 OSM 저작자 표시를 유지해야 합니다. 데이터 재배포와 파생 데이터베이스에는 [ODbL 조건](https://www.openstreetmap.org/copyright)을 확인하세요. 지도 원본과 생성 타일은 커밋하지 않습니다.

기존 Linux 클라우드에서 수행한 전환 검증: Next.js 프로덕션 빌드, TypeScript 검사, Chromium 테스트 3개, Compose 설정 검증이 통과했습니다. Windows에서 직접 실행한 결과는 아직 없습니다. standalone Docker 이미지에서도 페이지·번들·타일 프록시 smoke 검증을 통과했습니다. 브라우저 및 Docker 검증의 타일은 모두 테스트용 PNG이며 실제 OSM 렌더링은 위 제한사항에 해당합니다.
