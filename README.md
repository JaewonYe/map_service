# 태안군 Esri RGB 지도

## 간편 실행 (Windows)

Node.js 22 이상을 설치하고 Docker Desktop(WSL 2·Linux containers)을 시작한 뒤 **`실행.cmd`를 더블클릭**하세요.

| 메뉴 | 기능 |
| --- | --- |
| 1 | Esri RGB 다운로드·보관·호스팅 파일 생성 (최초 1회) |
| 2 | 서비스 시작 후 브라우저 열기 (평소 사용) |
| 3 | Next.js 개발 서버 |
| 4 | 서비스 종료, 데이터 유지 |
| 5 | 상태·오류 로그 |
| 6 | 다운로드한 원본으로 호스팅 파일 재구성 |
| 0 | 메뉴 닫기, 실행 중인 서비스는 유지 |

처음에는 **1 → 2**, 이후에는 **2**만 선택합니다. 이전 구성을 사용했다면 한 번만 `docker compose down --remove-orphans`로 이전 컨테이너를 정리한 뒤 시작하세요. 이 명령은 데이터 폴더와 기존 DB 볼륨을 삭제하지 않습니다. 기존 Esri 원본은 체크섬을 확인해 재사용합니다. 새 실행 메뉴에서는 OSM·Sentinel-2·근적외선·NDVI를 사용하지 않습니다. 기존 다운로드 파일과 Docker 볼륨은 자동 삭제하지 않습니다.

PowerShell에서는 프로젝트 폴더에서 `.\실행.cmd` 또는 `.\실행.cmd start`를 실행합니다. 기본 주소는 `http://127.0.0.1:8085`입니다. 기존 `.env`는 유지되므로 포트가 충돌하면 해당 파일의 `PORT`를 바꾸세요.

## 데이터 준비

원본 서비스는 Esri World Imagery입니다. 적용되는 계정·서비스 이용 권한 범위에서 사용하는 RGB 타일 아카이브이며, 원본 다중분광 GeoTIFF 다운로드나 오프라인 내보내기 권한을 대신하지 않습니다. 현재 사용자의 비공개 자체 프로젝트 용도를 전제로 합니다.

`services.arcgisonline.com` HTTPS 접근이 필요합니다. 계정 인증이 필요한 경우 로컬 `.env`의 `ESRI_API_KEY`에 본인의 토큰을 설정하세요. 비밀번호나 토큰을 Git에 올리지 마세요. 토큰은 다운로드 컨테이너에만 전달하며 원본·manifest·브라우저에 저장하지 않습니다. 서버가 401/403/498/499를 반환하면 인증·서비스 권한을 먼저 확인합니다.

기본 범위는 태안군과 서쪽 도서를 포함한 사각형 `[125.45,36.35,126.55,37.08]`, 확대 수준 z6~15입니다. **촬영 날짜·원본 해상도는 위치마다 다르며**, z15보다 확대하면 저장된 타일을 확대 표시합니다. 추가적인 밝기·감마 보정은 하지 않습니다.

더 높은 확대 수준은 타일 수·디스크·요청량이 크게 증가합니다. 기본 안전 한도는 15,000개이며 한 번에 하나씩 요청합니다. 필요 시 명시적으로 범위·확대·한도를 지정하세요.

```powershell
docker compose --profile imagery-tools build imagery-download
docker compose --profile imagery-tools run --rm imagery-download --maxzoom 16 --max-tiles 80000
docker compose stop imagery
docker compose --profile imagery-tools run --rm imagery-build
docker compose --profile imagery-tools run --rm imagery-verify
```

다운로드가 실패하면 원본을 지우지 말고 원인을 해결한 후 재시도합니다. 완료되지 않은 아카이브는 화면에서 준비됐다고 표시하지 않습니다. 이 클라우드에서 Esri 서버에 접근이 차단되어 실제 Esri 다운로드·촬영일·태안군 화질은 아직 검증하지 못했습니다.

## 파일 보관·서버 이전

**`data/imagery/taean/esri/` 전체를 복사**하면 됩니다.

```text
source/tiles/z/x/y.tile     # Esri 원본 JPEG/PNG 응답 (재다운로드 없이 재구성 가능)
source/tiles/z/x/y.sha256   # 원본 체크섬
source/service.json        # 서비스 정보·출처
source/acquisition.json    # 영역·확대 수준·파일 목록·체크섬 (인증 토큰 없음)
processed/esri-rgb-*.mbtiles # 호스팅용 JPEG 타일
manifest.json              # 현재 호스팅 파일·출처·체크섬
```

복사 전 서비스를 중지합니다. 새 PC의 같은 위치에 붙여넣고 메뉴 1로 검증한 뒤 메뉴 2로 시작하세요. 영상이 이미 있으면 다시 다운로드하지 않습니다. 완전 오프라인 실행에는 Docker 이미지도 미리 준비해야 합니다. 다운로드 자료는 Git에서 제외됩니다.

## 개발·배포

```powershell
npm.cmd ci
docker compose up -d imagery
npm.cmd run dev
```

개발 주소는 `http://127.0.0.1:3000`입니다. Next.js는 `/imagery/...`만 로컬 영상 서버(8082)로 전달합니다. Docker 전체 실행은 `docker compose up -d --build`, 종료는 `docker compose down`입니다. 공개 외부 배포는 이 프로젝트의 현재 용도에 포함하지 않습니다.

검증: `npm.cmd test`, `npm.cmd run test:launcher`, `npm.cmd run typecheck`. 영상 도구의 테스트는 합성 RGB로 다운로드 응답·원본 보존·파일 이전·서빙을 검사하며 실제 Esri 영상의 이용 권한·화질 검증을 대신하지 않습니다.
