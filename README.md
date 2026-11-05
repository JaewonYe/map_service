# Next.js 기반 자체 호스팅 OSM 지도

Next.js App Router + React + TypeScript 프런트엔드입니다. Leaflet을 클라이언트 컴포넌트에서 `dynamic(..., { ssr: false })`로 로드합니다. 지도 라이브러리와 스타일은 Next.js 번들로 제공하며 외부 CDN이나 OSM 공용 타일 서버를 사용하지 않습니다.

지도 백엔드는 별도 Docker 서비스입니다. OpenStreetMap 추출본을 PostgreSQL/PostGIS에 가져오고 Mapnik/renderd가 PNG 타일을 생성합니다. Next.js `rewrites`가 `/tile/{z}/{x}/{y}.png` 요청을 타일 서버로 전달하므로 브라우저의 별도 CORS 설정이 필요 없습니다. 기존 Nginx 정적 웹 서버는 제거했습니다.

```text
브라우저 → Next.js (React/Leaflet 화면)
         → Next.js /tile/... 프록시 → tiles (Mapnik/renderd + PostGIS)
```

## 빠른 시작: 모나코

필수: Docker Engine + Compose v2, Node.js 22 이상, npm, curl. Linux amd64를 기준으로 구성했습니다. 작은 지역부터 시작하세요. 이미지 및 해안선 등 공통 데이터 때문에 작은 추출본도 수 GB 이상의 저장공간과 가져오기 시간이 필요합니다. 우선 RAM 8GB 이상, 여유 디스크 수십 GB를 권장하며 실제 필요량은 지역에 따라 달라집니다.

```sh
cd /workspace/map_service  # 다른 곳에 clone했다면 해당 경로 사용
npm ci
cp .env.example .env  # 기존 설정이 있으면 덮어쓰지 말고 필요한 항목만 반영
mkdir -p data
curl --fail --location --retry 3 \
  https://download.geofabrik.de/europe/monaco-latest.osm.pbf \
  --output data/region.osm.pbf
# 새 데이터 볼륨에서 한 번 실행. 종료 코드 0을 확인한 후 시작합니다.
docker compose --profile tools run --rm import
```

가져오기에는 `download.geofabrik.de`, `osmdata.openstreetmap.de`, `naturalearth.s3.amazonaws.com`에 HTTPS 접근이 필요합니다. 이미지 다운로드에는 Docker Hub, npm 설치에는 npm 레지스트리 접근도 필요합니다. 회사 프록시를 사용한다면 컨테이너에도 프록시와 신뢰할 CA를 전달하세요. 인증서 검증을 끄지 마세요.

### 로컬 개발: Next.js 빠른 새로고침

```sh
docker compose up -d tiles
npm run dev
```

개발 화면은 포트 3000입니다. Next.js는 `.env`의 `TILE_SERVER_URL`(기본 `http://127.0.0.1:8081`)로 타일을 프록시합니다. 타일 서비스 포트를 변경하면 `TILE_PORT`와 `TILE_SERVER_URL`을 함께 바꾸세요. 환경변수 변경 후 개발 서버를 재시작합니다.

### Docker로 전체 서비스 실행

```sh
docker compose up -d --build
npm run smoke
```

웹 포트는 기본 8080이며 로컬 인터페이스에만 바인딩됩니다. Next.js 컨테이너는 Docker 네트워크의 `http://tiles:80`을 사용합니다. 이미지 빌드에 Node.js 22와 잠금 파일을 사용하고, 실행 이미지는 Next.js standalone 출력으로 구성됩니다.

Dockerfile은 관리형 프록시 CA를 선택적으로 지원합니다. 이 클라우드에서 빌드하려면 다음과 같이 신뢰할 CA를 빌드 시에만 마운트할 수 있습니다. CA는 이미지에 복사하지 않습니다.

```sh
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t map-service-web:local .
docker compose up -d --no-build
```

### Docker 없이 Next.js 프로덕션 서버 실행

```sh
# 접근 가능한 타일 서버가 별도로 필요합니다.
TILE_SERVER_URL=http://127.0.0.1:8081 npm run build
npm run start -- --port 3000
MAP_URL=http://127.0.0.1:3000 npm run smoke
```

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

```sh
# 최초 한 번 브라우저 설치 (환경에 따라 Linux 시스템 의존성도 필요)
npx playwright install --with-deps chromium
npm test
npm run typecheck
```

시스템 Chromium이 이미 있으면 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test`로 사용할 수 있습니다. 테스트는 포트 3100/3101을 사용하며, Next.js 프로덕션 빌드 및 서버를 자동 실행합니다. 테스트 빌드는 테스트용 타일 서버를 가리키므로 실제 서비스 실행 전 올바른 `TILE_SERVER_URL`로 다시 빌드하세요.

브라우저 테스트는 지도 표시·확대, 로컬 리소스 사용, 저작자 표시, 타일 프록시의 바이트와 오류 전달, 실패 안내와 복구를 검증합니다. **테스트용 PNG 서버를 사용하므로 실제 OSM 렌더링 검증을 대신하지 않습니다.**

`npm run smoke`는 실행 중인 서비스의 페이지·JS/CSS와 실제 지도 타일의 HTTP 상태·PNG 서명·256×256 크기를 확인합니다. 첫 렌더링은 오래 걸릴 수 있습니다. 실패 시 `docker compose logs --tail=100 tiles web`로 확인하세요. 데이터 가져오기에 성공하기 전에는 지도가 작동하지 않습니다.

이 클라우드에서는 이전 시도에서 Geofabrik 다운로드가 네트워크 정책에 의해 HTTP 403으로 차단되었습니다. 실제 OSM 가져오기와 실제 지도 렌더링은 아직 검증되지 않았습니다. 필요한 외부 도메인 접근을 허용하거나 추출본을 준비한 뒤 가져오기 및 smoke 검증을 수행하세요.

## 다른 지역과 운영

- 원하는 Geofabrik `.osm.pbf`를 `data/region.osm.pbf`에 준비하고 처음 가져옵니다. `lib/map-config.ts`의 중심·확대 수준을 바꾸세요. 다른 지역의 확인은 `SMOKE_TILE=z/x/y npm run smoke`로 수행합니다.
- 기존 DB에 import를 다시 실행하지 마세요. 자동 증분 갱신은 설정하지 않았습니다. 갱신·지역 교체 시 별도 Compose 프로젝트(`docker compose -p map-next ...`)에 새 볼륨으로 가져오고 검증한 뒤 전환하세요. 프로젝트별 `PORT`, `TILE_PORT` 충돌도 피해야 합니다.
- `docker compose down`은 데이터를 유지합니다. **`docker compose down -v`는 지도 DB와 타일 캐시를 삭제합니다.** 운영 데이터는 PostgreSQL 백업과 복구 절차를 별도로 마련하세요.
- PostgreSQL은 호스트에 공개하지 않습니다. 타일 서버는 로컬 개발을 위해 127.0.0.1:8081에만 바인딩됩니다. 인터넷 공개 시 TLS 리버스 프록시, 요청 제한, 접근 제어, 모니터링 및 용량 계획을 추가하세요. `.env`의 `BIND_ADDRESS`와 `PORT`로 웹 바인딩을 조절합니다.
- 이미지 보안 업데이트와 digest 고정을 운영 전 검토하세요. 전체 지구 서비스에는 더 큰 인프라가 필요합니다.

## 위성 지도와 결합하는 방향

OSM은 도로·건물 등 벡터 데이터이며 위성 사진을 제공하지 않습니다. USGS 영상은 데이터셋별 지리 범위, 촬영 시기, 해상도 및 이용 조건을 먼저 확인해야 합니다. 예를 들어 Landsat과 미국 고해상도 정사영상은 제공 범위와 용도가 다릅니다.

다음 단계는 사용 지역의 영상 소스를 정하고 별도 베이스 레이어로 추가하는 것입니다. `MapCanvas`의 Leaflet 레이어 선택기에 연결할 수 있습니다. 도로·라벨을 위성 위에 겹치려면 별도의 투명 스타일 타일 또는 벡터 타일 렌더링이 필요합니다. 현재 OSM 타일은 불투명합니다.

지도에는 OSM 저작자 표시를 유지해야 합니다. 데이터 재배포와 파생 데이터베이스에는 [ODbL 조건](https://www.openstreetmap.org/copyright)을 확인하세요. 지도 원본과 생성 타일은 커밋하지 않습니다.

현재 전환 검증: Next.js 프로덕션 빌드, TypeScript 검사, Chromium 테스트 3개, Compose 설정 검증이 통과했습니다. standalone Docker 이미지에서도 페이지·번들·타일 프록시 smoke 검증을 통과했습니다. 브라우저 및 Docker 검증의 타일은 모두 테스트용 PNG이며 실제 OSM 렌더링은 위 제한사항에 해당합니다.
