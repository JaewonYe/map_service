# TPK 기반 오프라인 위성지도

기존 **Next.js 16.4.5 App Router + TypeScript + Docker**를 유지합니다. Leaflet을 클라이언트에서만 로드하며, **Next.js Route Handler가 로컬 TPK를 직접 읽습니다.** 별도의 Python/FastAPI/타일 서버는 실행하지 않습니다.

## Quick Guide — Windows 11 / Ubuntu 24.04

필수: Windows의 Docker Desktop(WSL 2·Linux containers) 또는 Ubuntu의 Docker Engine + Compose v2. 개발·파일 분석에는 Node.js 22.2 이상도 필요합니다.

1. 받은 TPK를 **`data/tpk/map.tpk`**에 복사합니다. 원본을 이동하거나 수정하지 않아도 됩니다.
2. `.env.example`을 `.env`로 복사합니다. 기존 `.env`가 있으면 필요한 항목만 반영하세요.
3. 파일 형식과 아래 메타데이터 검사 결과·원본 이용 조건을 확인합니다. 허용되는 사내 로컬 웹 사용이 확인됐을 때만 `.env`에 **`TPK_USAGE_CONFIRMED=true`**를 설정합니다.
4. 실행합니다.

```sh
docker compose up -d --build
```

브라우저: **http://localhost:3001**. 기존 `.env`를 사용한다면 `PORT=3001`로 변경하세요. Windows에서는 `실행.cmd` 메뉴 2로도 시작할 수 있습니다. 종료는 `docker compose down` 또는 메뉴 4입니다. TPK·로컬 OSM·캐시 데이터는 유지됩니다.

현재 저장소에는 **실제 사용자 TPK가 없습니다.** 실제 파일을 첨부하거나 위 위치에 준비해야 실제 형식·화질·영역 검증을 완료할 수 있습니다. 합성 테스트 패키지를 실제 Esri 영상으로 제공하지 않습니다.

## 메타데이터 먼저 검사

PowerShell에서는 `npm` 대신 `npm.cmd`를 사용할 수 있습니다.

```sh
npm ci
npm run inspect:tpk -- data/tpk/map.tpk
```

Node.js가 없는 운영 PC에서는 서버를 기본 권한 미확인 상태로 시작한 뒤 `/api/map-info`에서도 메타데이터를 확인할 수 있습니다.

이 명령은 ZIP 디렉터리, `conf.xml`, `conf.cdi`, `esriinfo/iteminfo.xml`을 읽고 종료합니다. **타일 영상은 추출하지 않습니다.** 버전·StorageFormat·이미지 형식·tileSize·좌표계·경계·실제 bundle 레벨·사용 조건 원문을 출력합니다. 메타데이터의 문구만으로 사용 권한이 자동 승인되지는 않습니다. 본인이 받은 서비스/내보내기/오프라인 웹 사용 조건을 함께 확인하세요. 비밀 키·Esri 로그인·외부 API는 필요하지 않습니다.

지원하지 않는 파일은 임의로 좌표나 인덱스를 추정하지 않고 오류로 중단합니다. 실제 파일이 여러 레이어이거나 JSON 전용 TPKX, Exploded Cache, 비표준 원점·좌표계·512px 타일이면 별도 분석이 필요합니다.

## 구현과 파일

| 파일 | 기능 |
| --- | --- |
| `lib/tiles/tpk.ts` | ZIP/메타데이터, Compact V1/V2 인덱스, 범위 검사, 캐시 |
| `app/api/map-info/route.ts` | 실제 파일의 메타데이터와 OSM 제공 상태 |
| `app/api/tiles/[z]/[x]/[y]/route.ts` | XYZ → 원본 타일 응답 |
| `app/api/osm/[z]/[x]/[y]/route.ts` | 사용 허가가 확인된 로컬 XYZ OSM PNG/JPEG |
| `components/MapCanvas.tsx` | Leaflet, 좌표·줌, 클릭 위치, scale bar, 경계·레이어 전환 |
| `scripts/inspect-tpk.ts` | 원본을 변경하지 않는 검사 CLI |
| `data/tpk/` | 사용자 원본, 읽기 전용 볼륨 |
| Docker `tpk-cache` 볼륨 | ZIP 압축 bundle의 재사용 캐시 |

TPK가 ZIP Stored 형식이면 bundle 전체를 추출하지 않고 필요한 인덱스/영상 범위만 읽습니다. Deflate로 압축된 bundle은 첫 접근 시 스트리밍으로 캐시 파일에 풀고 크기·CRC를 검사합니다. 캐시 파일명은 원본 식별값과 멤버 이름의 해시이며 ZIP 경로를 출력 경로로 사용하지 않습니다. **원본 TPK는 항상 변경하지 않습니다.** 전체 XYZ 변환은 하지 않으며 패키지 교체 전 서버를 중지하고 교체 후 재시작합니다. 파일 식별값을 타일 URL에 포함해 교체 전 브라우저 캐시와 구분합니다.

Compact V1은 별도 `.bundlx`의 5바이트 offset과 **column-major** 인덱스, V2는 bundle 내 8바이트 offset/size와 **row-major** 인덱스를 처리합니다. EPSG:3857의 표준 원점·256px 타일을 확인하고, LOD ID와 해상도 기반 XYZ zoom을 매핑합니다. 실제 bundle이 있는 레벨만 제공하므로 `conf.xml` 전체 LOD 목록을 다운로드된 레벨로 오인하지 않습니다.

[Esri Compact Cache V2 형식 문서](https://github.com/Esri/raster-tiles-compactcache/blob/master/CompactCacheV2.md)를 기준으로 구현했습니다. 저장 방식과 실제 이미지의 JPEG/PNG magic bytes를 검증합니다.

## API 동작

- `GET /api/map-info`: 실제 TPK의 `center`, `bounds`, `zoom`, `zoomLevels`, `minZoom`, `maxZoom`, `projection`, `tileSize`, `storage`, `format`, `packageVersion`, `licenseNotice`, `usageConfirmed`, `osm`
- `GET /api/tiles/16/{x}/{y}`: 실제 JPEG/PNG MIME, ETag 및 `If-None-Match`의 304 처리
- 범위 밖·패키지에 없는 타일: **404**; 잘못된 좌표: **400**; 사용 확인 전 타일 접근: **403**; 파일 없음/교체 후 재시작 필요: **503**
- 손상·미지원 형식: **422**. 원본 경로·상세 파일 시스템 오류를 API에 노출하지 않습니다.
- 최대 32개 타일 읽기 동시 처리, 중복 요청 공유, 큐가 꽉 차면 429 + Retry-After, 타일 메모리 캐시 32MiB·최대 256개, bundle 인덱스 최대 16개
- 압축된 bundle 하나는 최대 512MiB, 이미지 하나는 최대 20MiB입니다. 디스크 캐시 총량은 자동 삭제하지 않으므로 큰 패키지는 여유 공간을 확보하세요.

초기 중심 희망값은 **36.597889, 126.240136**, zoom **16**입니다. 실제 파일 경계 밖이면 메타데이터 경계 중심을 쓰고, zoom도 실제 레벨에 맞춥니다. 질문의 경계/레벨 15~17은 실제 파일 확인 전에는 데이터 사실로 확정하지 않습니다.

## OSM과 오프라인 모드

기본 `MAP_MODE=offline`에서는 외부 지도 요청이 없습니다. 필수 JS/CSS와 Leaflet은 Next.js가 로컬 제공하며 외부 CDN·폰트·위성 API를 요청하지 않습니다.

오프라인 OSM을 함께 쓰려면 사용이 허가된 XYZ 타일을 **`data/osm/z/x/y.png` 또는 `.jpg`**에 두고 `OSM_USAGE_CONFIRMED=true`를 설정하세요. 그러면 레이어 선택기에 OSM이 나타납니다. 파일이 없거나 권한이 확인되지 않으면 OSM을 표시하지 않습니다.

온라인 OSM이 필요할 때만 `MAP_MODE=online`으로 바꾸고 컨테이너를 재생성합니다. 이때 브라우저가 공용 OSM 타일을 요청하며 [OSM 타일 이용 정책](https://operations.osmfoundation.org/policies/tiles/)을 따라야 합니다. 이 프로젝트는 공용 OSM 타일의 일괄 다운로드 기능을 제공하지 않습니다.

## 환경변수와 개발

- `PORT`, `BIND_ADDRESS`: Docker 호스트 공개 포트/주소 (기본 localhost:3001)
- `TPK_HOST_DIR`: Compose 원본 폴더 (기본 `./data/tpk`, 폴더가 존재해야 함)
- `TPK_FILE`: 해당 폴더 아래 파일명
- `TPK_PATH`: **호스트 개발·검사**에서 사용할 경로. 컨테이너에서는 `/data/tpk/<TPK_FILE>`로 설정됩니다.
- `TPK_CACHE_DIR`: 호스트 개발은 `.cache/tpk`, 컨테이너는 `/cache`
- `TPK_USAGE_CONFIRMED`: 허용된 실제 패키지 사용을 확인한 뒤 `true`
- `MAP_MODE`, `OSM_HOST_DIR`(Compose 호스트 폴더), `OSM_TILE_DIR`(호스트 개발 경로), `OSM_USAGE_CONFIRMED`: OSM 제공 방식

```sh
npm ci
npm run dev
```

경로는 프로젝트 상대 경로 또는 환경변수로 지정하며 Windows/Ubuntu 전용 절대 경로를 코드에 넣지 않습니다. 패키지 원본은 컨테이너의 node 사용자에게 읽기 권한이 있어야 합니다. 기존 Python 기반 서비스를 사용했다면 한 번만 `docker compose down --remove-orphans`로 이전 컨테이너를 정리하세요. 기존 영상 아카이브는 삭제하지 않습니다.

## 인터넷 없는 PC로 이미지·데이터 옮기기

인터넷 사용 PC에서 빌드하고 이미지를 저장합니다. 플랫폼이 다르면 대상 플랫폼에 맞는 이미지를 준비하세요. 아키텍처는 강제하지 않습니다.

```sh
docker compose build
docker save -o map-service-image.tar map-service-web:local
```

`map-service-image.tar`, 저장소의 `compose.yaml`/`.env`, `data/tpk/` 원본, 필요 시 `data/osm/`을 대상 PC에 복사합니다. 대상 PC에서:

```sh
docker load -i map-service-image.tar
docker compose up -d --no-build --pull never
```

설치/빌드에는 인터넷이 필요할 수 있지만 **런타임에는 인터넷이 필요하지 않습니다.** TPK를 이미지에 COPY하지 않으며, 새 PC의 압축 bundle 캐시는 로컬에서 다시 생성합니다. 서버 런타임은 별도 타일 서버 없이 Next.js 컨테이너 하나입니다.

## 검증

```sh
npm run test:tiles
npm run test:launcher
npx playwright install chromium
npm test
npm run typecheck
```

테스트용 TPK는 직접 생성한 CC0 픽셀과 메타데이터로 `.cache/test-tpk/`에 만듭니다. V1/V2·Stored/Deflate ZIP, Esri 공식 Apache-2.0 V2 샘플의 JPEG와 바이트 단위 대조, 비대칭 row/column, JPEG/PNG, 동시 중복 요청, 원본 불변, 권한 게이트, 손상 인덱스, XYZ 검증, 로컬 OSM 정책 및 UI를 검사합니다. 브라우저 테스트에서는 외부 호스트를 차단하고 로컬 타일이 보이는지 확인합니다.

**검증 범위:** 현재 Linux 클라우드의 합성 패키지 테스트이며, 실제 사용자 TPK 검증과 Windows 11/Ubuntu 24.04 실기 검증은 아직 완료되지 않았습니다. 실제 파일의 라이선스·내보내기 정보와 패키지 구조를 확인한 뒤 실제 위성영상 검증을 진행해야 합니다.

현재 검증 결과: 타일·형식 테스트 8개, 실행 메뉴 테스트 4개, 브라우저 테스트 4개 및 외부 호스트 차단 검증을 수행했습니다. Docker의 외부 통신 차단 네트워크 안에서도 압축 TPK 읽기와 캐시 쓰기를 확인했습니다. 모두 합성/공개 형식 샘플 기준이며 실제 사용자 패키지의 완료 증거는 아닙니다.
