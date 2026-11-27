# 지도 다운로드·관리 (#20)

`/downloads`에서 영역·원본·상세도를 선택하고 별도 worker에 작업을 보낸다. 기존 Next.js/Leaflet, 시설 API, OSM schema2 및 DEM 준비 도구를 재사용한다. 최초 설치의 미리보기는 번들 Natural Earth 110m 국가 개요이며 위성/도로/시설 상세 미리보기가 아니다. 외부 preview 요청은 없다. 현재 로컬 지도 보기는 설치된 데이터만 사용한다.

**현재 공식 제공처 원본 다운로드 검증은 미완료다.** 클라우드 프록시가 네 호스트의 CONNECT를 403으로 거부했고 ArcGIS 토큰/OpenTopography 키도 이 환경에 없다. 계정 권한 부족으로 판정한 것이 아니다. 합성 HTTP 전송·실제 변환·격리 복원 증거는 [검증 기록](VALIDATION.md#이슈-20-지도-다운로드관리)에 별도로 남긴다. #20의 실제 원본 다운로드/표시 조건은 열린 상태다.

## 실행: Windows / Ubuntu

Docker Desktop의 Linux containers 또는 Docker Engine + Compose v2, Node.js 22.13 이상이 필요하다. Windows는 PowerShell에서 같은 Node/Docker 명령을 사용한다. Docker 빌드와 원본 수신은 인터넷이 있는 준비 단계다. 기존 `.env`와 데이터는 유지한다.

1. `downloads.worker.env.example`을 **기존 파일이 없을 때만** `.env.downloads`로 복사하고 로컬 편집기로 연다. 이 파일은 Git/Docker build context에서 제외된다.
2. 계정의 export 권한과 **이 Next.js/Leaflet 앱에서 오프라인 표시·다른 PC 이전까지 허용되는지** 확인한다. ArcGIS 계정 보유만으로 이 권한을 추정하지 않는다. 조직에서 승인한 ArcGIS 앱/OAuth 로그인 절차로 얻은 유효한 access token을 로컬 `ARCGIS_TOKEN`에 설정한다. 조직 로그인/동의가 필요하면 브라우저에서 직접 완료한다. 비밀번호나 토큰을 채팅·소스·URL에 넣지 않는다. 이 앱은 사용자 비밀번호를 받거나 계정 로그인을 대행하지 않는다.
3. [OpenTopography](https://portal.opentopography.org/)에 직접 로그인해 본인 API Key를 발급하고 `OPENTOPOGRAPHY_API_KEY`에 설정한다. 개인 키는 공유하지 않으며 상업 서비스 통합은 Enterprise 조건을 먼저 확인한다. [제공처별 조건](DOWNLOAD_PROVIDER_LICENSES.md)을 읽는다.
4. 다음 명령을 실행한다. `--accept-usage`는 선택 원본의 이용 조건·표시·이전 권한을 작업자가 확인했다는 명시 입력이다.

```sh
node --env-file=.env.downloads scripts/download-taean.mjs --help
node --env-file=.env.downloads scripts/download-taean.mjs --accept-usage
```

기본은 **태안 위성 + 고도만** 준비한다. 대한민국 지역 PBF 전체를 추가로 받으려면 `--osm`, 같은 요청의 유효한 기존 파일을 재사용하지 않고 원본을 새로 받으려면 `--refresh`를 붙인다. 부분 성공은 종료 코드 1이며 성공한 레이어와 ZIP은 보존된다. `--help`는 Docker/원본 다운로드를 실행하지 않는다. 실제 수신 바이트·단계·오류를 출력하며 미확정 전체 진행률/시간을 만들어내지 않는다. Windows/Ubuntu 공용 실행 코드는 테스트했지만 두 OS의 실기 다운로드는 아직 검증하지 않았다.

Docker Desktop이 꺼져 `dockerDesktopLinuxEngine` 파이프를 찾지 못하면 요청만 저장되고 worker는 실행되지 않는다. Docker Desktop을 켜고 `docker info --format '{{.OSType}}'`가 `linux`인지 확인한다. 같은 환경에서 단일 미완료 태안 작업을 재개하려면 다음을 실행한다.

```powershell
node --env-file=.env.downloads scripts/download-taean.mjs --resume --accept-usage
```

`--resume`은 요청 원문/ID/revision을 바꾸거나 새 요청을 추가하지 않고 기존 작업을 실행·모니터한다. 새 환경변수는 worker에 전달되지만 원본 선택/등록 요청은 유지하며 `--refresh`/`--osm`으로 재정의할 수 없다. 일반 CLI는 미완료 작업이 있으면 새 요청을 만들지 않는다. 여러 미완료 작업이나 다른 종류 작업은 `/downloads`에서 먼저 확인한다. 이미 끝난 failed/partial/interrupted 작업은 `--resume` 대상이 아니며, 원인을 고친 후 일반 CLI 또는 웹의 새 작업으로 재시도한다. 실행 중 worker가 중단됐다면 기존 복구 절차가 interrupted로 기록하며, 재개 옵션으로 성공을 강제하지 않는다. 이 옵션은 HTTP Range 파일 이어받기가 아니다. 동시 CLI/웹 등록에 대한 기존 revision 충돌 보호도 유지한다.

웹 페이지에서 계속 관리하려면 로컬 폴더를 먼저 만든 후 worker와 web을 실행한다. 사용자 지정 폴더를 쓰는 경우 web과 worker에 **같은 MAP_DOWNLOADS_HOST_DIR**를 적용한다.

```sh
# Ubuntu; Windows에서는 탐색기/PowerShell로 같은 세 폴더를 생성한다.
mkdir -p data/downloads data/imagery data/dem
# 새 세 폴더는 worker/web의 UID 1000이 읽고 쓸 수 있어야 한다.
docker compose --env-file .env.downloads --profile downloads up -d --build download-worker
# 기존 .env의 web 포트/원본 설정을 유지한다.
docker compose up -d --build web
```

브라우저 `http://localhost:3001/downloads`. 기존 원본 폴더의 read-only bind와 준비 도구의 `network_mode:none`은 유지된다. web은 임의 shell/Docker socket/worker 인증값을 받지 않는다. 다운로드 worker만 공식 제공처에 연결하고 전용 다운로드·원본 폴더에 쓴다. 이미지의 세 준비 코드 디렉터리는 UID/GID1000 소유로 복사해 호스트 소스가0600이어도 nonroot worker가 읽을 수 있다. 기본 web bind는 127.0.0.1이며 기존 앱처럼 외부 공개용 로그인/관리 권한 체계를 구현한 것은 아니다. 여러 web 프로세스가 쓰는 운영 구성은 지원하지 않는다.

토큰 파일을 쓰려면 로컬 Compose override에서 개인 파일을 worker에만 read-only로 마운트한다. 대상은 `/run/secrets/arcgis_export_token`, `/run/secrets/opentopography_api_key`다. 값은 각각 한 줄의 토큰/키다. ARCGIS_TOKEN/OPENTOPOGRAPHY_API_KEY 환경변수를 우선 읽고, 비어 있을 때 명시한 비밀 파일을 읽는다. 기본 *_FILE 경로는 비어 있으며 파일을 쓸 경우 해당 변수를 컨테이너 경로로 설정하고 같은 경로로 마운트해야 한다. 파일 자체를 이미지에 COPY하지 않는다. Python worker를 호스트 Linux에서 직접 실행할 때는 `MAP_DOWNLOAD_ARCGIS_TOKEN_FILE`, `MAP_DOWNLOAD_OPENTOPOGRAPHY_KEY_FILE`을 설정할 수 있다. Windows에서는 fcntl/GDAL가 포함된 Linux worker 컨테이너를 사용한다.

## Windows PowerShell에서 토큰 설정이 사라진 경우

토큰 발급 코드가 `$env:ARCGIS_TOKEN`에 설정한 값은 그 PowerShell 창과 이후 실행한 자식 프로세스에만 전달된다. 다른 창에서 다운로드하면 설정이 없을 수 있다. 발급과 다운로드를 같은 창에서 실행한다. 값 없이 설정 유무를 확인하려면 다음 한 줄을 실행한다.

```powershell
[string]::IsNullOrWhiteSpace($env:ARCGIS_TOKEN)
```

True면 현재 창에 토큰이 없으므로 같은 창에서 다시 발급하거나 안전한 로컬 `.env.downloads`에 설정한다. False는 값이 있다는 뜻이며 유효기간·export 권한까지 확인한 결과는 아니다. Node `--env-file=.env.downloads`는 기존 프로세스 환경변수를 우선하므로 파일의 빈 ARCGIS_TOKEN 항목이 현재 창의 값을 덮어쓰지 않는다. CLI도 인증값/파일 경로 설정의 유무만 true/false로 출력하고 값은 출력하지 않는다. 기존에 실행 중인 worker는 컨테이너 생성 당시 설정을 사용하므로 토큰 갱신 후 새로 시작해야 한다.

기본 Compose는 존재하지 않는 `/run/secrets/...` 파일을 자동 지정하지 않는다. 환경변수와 명시 파일이 모두 없으면 현재 터미널의 설정 방법을 안내하며, 파일을 명시했는데 읽을 수 없는 경우에만 마운트/권한 오류를 표시한다. ArcGIS 토큰 누락은 다운로드 전 확인하고 정상 원본 캐시 재사용은 유지한다.

`partial`은 일부 레이어만 성공한 상태다. 예를 들어 고도 completed/등록 완료와 위성 blocked가 함께 있으면 고도 패키지/ZIP은 성공이고 위성은 아직 준비되지 않았다. 성공한 고도 원본은 이후 같은 요청에서 재사용하므로 위성 인증을 고친 뒤 실행할 때 `--refresh`를 붙일 필요가 없다. 고도를 새로 수신할 때는 OpenTopography Key도 실행 환경에 설정해야 한다. 검증된 고도 원본을 재사용할 때는 추가 원본 수신이 필요 없다.

## 계정 API는 정상인데 World Imagery가498일 때

계정 API의 signedIn/organizationMember와 World Imagery 사용 가능 여부를 구분한다. 498만으로 전체 토큰 만료나 export 권한 부족을 단정하지 않는다. 498=서비스가 토큰을 유효하지 않다고 응답,499=토큰 필요,401/403=인증·권한 거부로 구분한다.

공식 조직 URL에서 client=referer 토큰을 발급하고 worker의 ARCGIS_REFERER를 발급 당시 URL과 일치시킬 수 있다. [Windows 수동 로그인·서비스 확인](ARCGIS_AUTH_POWERSHELL.md)의 블록을 사용한다. 조직 주소 조회는 `node --env-file=.env.downloads scripts/arcgis-organization.mjs`이며 토큰/이름/이메일 대신 공식 조직 URL만 출력한다. 임의 호스트로 비밀번호를 보내지 않도록 주소를 검사한다. ARCGIS_REFERER는 worker 전용이며 비어 있으면 기존 동작을 유지하고, 설정하면 tiledbasemaps.arcgis.com으로만 보낸다. OpenTopography/OSM/AWS 및 그쪽 redirect에는 전달하지 않는다. URL에 인증정보·query/fragment·제어문자를 넣지 않는다.

이 경로의 실제 서비스 성공은 사용자 PC에서 새 토큰 응답으로 확인해야 한다. 코드 지원/합성 테스트를 실제 export 성공이나 권한 부여로 보고하지 않는다.

## 태안 CLI의 기본 영역과 원본

| 항목 | 기본값 / 처리 |
| --- | --- |
| 태안 영역 | South 36.585138820015565 / North 36.61063932151162 / West 126.230336932571 / East 126.24993476192829 |
| 좌표 | WGS84 입력, 처리 시 소수 7자리 정규화. ArcGIS export extent는 EPSG:3857로 변환 |
| 위성 | World Imagery **for Export**, exportTiles **POST**, tilePackage=true, XML Compact TPK 요청, level 15–17 |
| 상세도 | 지역 개요 0–11 / 시설 주변 15–17 / 상세 15–19. 실제 capabilities LOD가 확인되면 지원 값으로 제한·조정 안내 |
| 기본 고도 | OpenTopography globaldem, demtype=COP30, outputFormat=GTiff, 선택 사각형, API Key 필요 |
| 고도 대안 | 명시적으로 선택하는 AWS 공개 GLO-30 1도 COG. 필요한 원본 전체를 받은 뒤 mosaic/clip |
| DEM | nominal 약30m/1 arc-second DSM, EGM2008 미터, 건물/식생 포함. 표시 줌 8–13 기본값은 원본 정확도가 아님 |
| 일반 지도 | Geofabrik 대한민국 또는 Monaco **지역 PBF 전체** + MD5 → osmium complete_ways bbox 추출 → 기존 importer schema2. 공용 OSM 타일 수집 없음 |

사각형 두 점/보이는 범위/기존 지도 viewport/시설 Polygon의 bbox/숫자 좌표로 영역을 선택한다. Polygon bbox를 정확한 Polygon clipping으로 표시하지 않는다. OSM complete_ways는 경계 밖으로 이어진 도형을 보존할 수 있다. 원본 범위/수신량과 선택 면적은 다르다. 제공처 HEAD 크기나 전체 전송량을 알 수 없으면 미확정으로 표시한다. ArcGIS 실제 영상 해상도·촬영일은 지역마다 달라 다운로드 시점을 촬영일로 표시하지 않는다.

ArcGIS는 실제 exportTilesAllowed, 좌표계/타일 크기, LOD, maxExportTilesCount를 검사한다. 비동기 job/result/cancel을 처리하고 하나의 지원 TPK만 받는다. TPKX/JSON-only 패키지, 알 수 없는 결과 호스트, 지원하지 않는 좌표계/Compact header/offset/실제 요청 LOD 누락은 실패로 남긴다. 확장자만 바꾸거나 공개 타일 대량 수집으로 대체하지 않는다. 기본 허용 결과 호스트와 다른 공식 export 호스트가 실제로 반환되면 별도 검토 후 코드/환경 허용 목록을 갱신해야 한다.

공식 [Map Service Result 명세](https://developers.arcgis.com/rest/services-reference/enterprise/map-service-result/)의 `out_service_url.value`는 파일 대신 결과 디렉터리 URL일 수 있다. 직접 TPK URL 또는 같은 `tiledbasemaps.arcgis.com`의 `arcgisoutput`/`arcgisjobs` 결과 디렉터리를 처리한다. 디렉터리의 JSON 파일 목록 또는 정적 HTML 링크에서 **바로 아래의 단일 TPK**를 선택하며 재귀 탐색하지 않는다. 목록은 1MiB/256링크 한도로 읽고, 외부 호스트·경로 이동·다중 TPK·파일 누락·실제 TPKX를 구분해 중단한다. `공식 export 결과 파일 목록 확인` 다음에 `위성 TPK 다운로드` 단계가 표시된다. 필요한 토큰과 Referer는 메모리 내 요청에만 전달하고 결과 URL은 상태/manifest/ZIP에 저장하지 않는다.

이전 버전의 `현재 리더가 지원하지 않는 TPKX/기타 형식` 오류는 URL 확장자 검사만으로도 발생했으므로 실제 파일이 TPKX였다는 증거가 아니다. 최신 코드를 `git pull --ff-only origin main`으로 받은 뒤 **토큰을 설정한 같은 PowerShell 창**에서 기존 CLI를 다시 실행한다. CLI가 worker 이미지를 자동 빌드하며 `--refresh` 없이 검증된 고도 원본을 재사용한다. 기존 ZIP/원본은 삭제하거나 확장자를 바꾸지 않는다. 수정 지원과 합성 테스트 통과는 실제 공식 TPK 다운로드·앱 표시 성공과 구분한다.

Compact V1은 60바이트 bundle header 뒤의 4바이트 길이 레코드를 `.bundlx`의 5바이트 column-major offset으로 찾는다. offset60의 길이0 레코드도 정상적인 빈 타일일 수 있다. V2의 64바이트 header/index 한도를 V1에 적용하지 않으며, V1의 60 미만 위치·잘린 길이·파일 밖 payload·크기 초과와 실제 타일이 없는 패키지는 계속 거부한다. 앱 리더도 같은 V1 최소 위치를 적용한다. 빈 bundle만 있는 LOD는 실제 수신 LOD에 포함하지 않으며 요청한 LOD 전체가 실제 타일을 포함하는지 검사한다. 형식 차이는 [독립 구현과 검증 기록](VALIDATION.md#20-후속-compact-v1-header60과-등록-충돌)에서 확인한다.

conf.xml의 전체 tiling scheme에 실제 export하지 않은 LOD20–24가 남을 수 있다. metadata는 앱 TS 리더와 같은 XYZ0–24 범위/정상 resolution으로 검사하고, 실제 bundle이 있을 때만 다운로드 지원 범위0–19와 실타일 여부를 검사한다. 실제 수신 LOD와 요청LOD 검증을 생략하거나 지원하지 않는 해상도를 임의 보정하지 않는다. 미지원 LOD 오류에는 level/XYZ 숫자를 표시하며 토큰이나 결과 URL을 넣지 않는다.

`등록 revision 충돌`은 요청 이후 다른 등록으로 active 상태가 변경됐을 때 기존 지도를 보호하는 검사다. ZIP/준비 패키지가 만들어져도 **자동 등록은 완료되지 않은 상태**이며 재다운로드나 active.json 삭제로 해결하지 않는다. 진행 중인 다른 작업이 끝난 뒤 `/downloads`를 다시 조회하고 해당 작업의 **준비된 지도 다시 등록**을 명시적으로 선택한다. 위성 검사에 실패해 고도만 포함된 ZIP에는 이 동작으로 위성이 추가되지 않는다. 위성 리더 수정 후에는 기존 고도를 재사용하는 새 작업에서 위성 검증/등록을 확인한다.

DEM은 단일 수치 밴드 GTiff인지 검사하며 RGB/Byte 영상을 받지 않는다. GDAL child에서 EPSG:4326 1 arc-second Float32 mosaic/clip, NoData −32767 후 기존 준비 절차의 EPSG:3857 Terrarium height/color 타일을 만든다. source의 vertical datum을 변환한 것으로 보고하지 않는다. NoData는 투명/유효 높이 없음으로 유지한다.

## 저장·재사용·복구

| 위치 | 내용 |
| --- | --- |
| `data/imagery` | 검증한 위성 원본 TPK; 요청 hash + 내용 hash 파일명, 사용자 기존 파일 덮어쓰기 없음 |
| `data/dem` | OpenTopography 수신 GTiff. AWS 대안은 선택 영역 mosaic/clip GTiff, 원래 1도 COG는 source-cache에 보관 |
| `data/downloads/jobs` | version1 불변 요청, worker 상태, 취소 요청, 실패한 native 도구 로그 |
| `source-cache`, `originals-index` | 제공처 원본 캐시/원본 재사용 인덱스. 검증한 MD5 또는 strong ETag+길이+SHA, 로컬 원본 SHA/포맷 확인 |
| `staging/<job>` | 미완료 다운로드/변환. 정상 활성 디렉터리와 분리 |
| `packages/<UUID>` | 검증된 불변 준비 패키지, 원본별 상대 경로 설정과 manifest |
| `exports/<UUID>.zip` | **서버**의 오프라인 이전 ZIP. 웹의 ‘이전 ZIP 내려받기’를 눌러야 브라우저 PC에 저장됨 |
| `active.json`, `history` | version1 활성 레이어/증가 revision 및 이전 레지스트리 |

동일 영역/원본 설정의 기존 원본은 SHA·형식 검사 후 재사용한다. 재사용은 최신 자료라는 보장이 아니며 `--refresh`/웹의 새 원본 수신 선택으로 갱신한다. 임의 사용자 파일은 자동 채택하지 않는다. 손상 원본도 자동 덮어쓰지 않는다. HTTP Range 부분 재개는 지원하지 않으며 부분 파일은 폐기하고 새 요청으로 재시도한다.

단일 Linux worker의 flock이 파일 writer를 제한한다. 작업은 탭과 독립적이고 웹 재진입·앱/worker 재시작 후 다시 조회한다. 중단된 실행은 interrupted로 기록하고 staging과 worker 전용 미완료 ZIP을 정리한 뒤 새 작업 ID로 재시도한다. 웹에서 진행 중일 수 있는 incoming 업로드는 worker 시작 때 임의 삭제하지 않는다. 등록은 revision 비교 후 active.json을 원자 교체한다. 충돌하면 준비된 패키지/ZIP을 보존하고 사용자가 최신 상태에서 명시적으로 재등록한다. 일부 종류만 성공하면 partial로 표시하고 성공 데이터만 등록한다. 취소는 worker 확인 전까지 ‘취소 요청 대기’다. 활성화가 완료된 후 취소로 이미 등록된 결과를 실패라고 뒤집지 않는다.

기존 시설/경계, 원본 PBF/TPK/DEM/catalog와 OSM_EDITS_DIR를 수정하지 않는다. managed OSM의 source_key/fingerprint로 기존 수정 내역을 재적용하고 원본 변경/삭제 시 #18 충돌 흐름을 유지한다. ‘기존 파일 기반 지도 사용’은 활성 managed 선택을 해제하며 패키지/원본을 삭제하지 않는다. 백업은 다운로드 폴더, 원본 두 폴더, 기존 시설/OSM 수정 내역을 각각 포함한다. 실행 중 active/현재 package를 수동 정리하지 않는다.

앱 자체 제한: bbox 각 축15도·위도±85도, **위성 후보150,000타일/고도 표시 후보10,000타일**, OpenTopography 요청1,000km², AWS 원본4×4도, 원본/ZIP 단일2GiB·작업 수신/해제4GiB·여유512MiB, 작업2시간·개별 전송/도구/export대기30분·HTTP연결20초. 실제 위성 export 한도는 `min(현재 서비스 maxExportTilesCount,150000)`이며 현재 계정/서비스를 worker가 매 요청에서 확인한다. 이 앱 제한은 제공처 계약/할당량을 대체하지 않는다. 제공처 429 Retry-After는 디스크에 기록하고 대기 전 재요청을 차단한다. 대기/실행10개·보관 기록100개·업로드 동시2개, ZIP50,000파일·압축률1,000 한도다. 웹 업로드는 스트리밍·용량/디스크/중단 청소를 제공하지만 별도 유휴 업로드 제한/자동 보관기간 삭제는 없다.

### 대한민국 위성 level0–13

기존 `위성 작업은 최대10,000타일`은 앱의 위성/고도 공통 상한이었다. 위성만 별도 상한으로 분리했으며 [공식 World Imagery export 항목](https://www.arcgis.com/home/item.html?id=226d23f076da478bba4589e7eae95952)은 요청당150,000타일을 안내한다. [일반 REST 문서](https://developers.arcgis.com/rest/services-reference/enterprise/export-tiles-map-service/)의 기본값100,000과 특정 서비스의 실제 값을 구분하고, worker는 실제 서비스가 더 작은 값을 반환하면 export 제출 전에 거부한다. 계정별 허용 범위와 기존 오프라인 표시/이전 조건은 그대로 적용한다. 한도 우회용 분할 export나 공개 타일 수집은 추가하지 않는다.

`/downloads`에서 **위성만 선택**하고 기존 영역 선택/고급 좌표와 level 범위를 사용한다. 예를 들어 서124/남33/동132/북39.5 사각형은 level0–11=2,912,0–12=11,376,0–13=45,048 후보 타일이다. 국경 Polygon clip이 아니므로 주변 바다/일부 주변 지역도 포함한다. 실제 선택 좌표에 따라 개수가 달라지며 후보 수는 실제 파일 크기/수신량/시간/coverage 보장이 아니다. 이 범위의 level0–14는 앱150,000 한도를 초과한다. 서비스의 실제 한도가 충분하면0–13을 단일 공식 export로 요청한다. 고도를 함께 선택하면 기존 고도 타일/면적 한도가 별도로 적용된다.

업데이트 후 web과 worker를 모두 새 코드로 빌드해야 한다. 기존 `.env`의 web 접속 포트와 데이터를 유지하며, worker 인증값은 같은 PowerShell 환경변수 또는 `.env.downloads`로 전달한다. 기본 다운로드 경로를 쓰는 경우 다음을 실행할 수 있다. 사용자 지정 경로가 있으면 web/worker의 MAP_DOWNLOADS_HOST_DIR가 같아야 한다.

```powershell
git pull --ff-only origin main
docker compose up -d --build web
docker compose --env-file .env.downloads --profile downloads up -d --build download-worker
```

worker가 갱신한 지원 LOD/최대 타일 정보를 확인하고 영역·작업량 확인 후 요청한다. 새 위성 패키지를 등록하면 기존 활성 위성 패키지와 함께 표시한다. 기존 코드에서 교체돼 빠진 태안 상세 패키지는 해당 작업의 ‘준비된 지도 다시 등록’으로 다시 추가한다. 원본/준비 패키지/ZIP을 삭제하거나 다시 다운로드할 필요가 없다. 대한민국 전체 공식 원본 다운로드/coverage/앱 표시는 사용자 PC에서 별도 검증할 항목이다.

## 전국 개요와 지역 상세를 함께 표시하기

위성 다운로드·명시 재등록·ZIP 가져오기는 현재 선택된 위성 목록에 해당 패키지를 추가한다. 같은 패키지 ID는 중복시키지 않고 최근 등록 순서로 이동한다. **실제 native 줌이 높은 타일을 먼저** 사용하므로 전국0–13을 나중에 등록해도 기존 지역14–19를 가리지 않는다. 상세 범위 내에 빈 타일이 있으면 다른 상세/낮은 줌을 순서대로 찾고, 지역 밖은 전국 개요로 대체한다. 낮은 줌 확대는 원본 해상도를 높이지 않으며 투명 PNG는 기존 합성 규칙을 따른다. 같은 native 줌·role·명시 priority의 다운로드 패키지는 더 좁은 유효 요청 범위를, 같은 범위면 최근 선택 자료를 우선한다. 수동 maps.json 우선순위는 유지한다. 각 TPK의 실제 범위·LOD·사용 권한 검사는 그대로 적용한다.

업데이트 전 단일 위성 선택을 그대로 읽는다. 과거의 모든 완료/실패/준비 패키지나 `data/imagery` 파일을 자동 스캔해 표시하지 않는다. 이미 교체돼 빠진 상세 지도는 `/downloads`에서 이전 작업을 선택해 **준비된 지도 다시 등록**을 누른다. ‘함께 표시할 위성 패키지’ 수와 해당 작업의 ‘현재 위성 합성에 포함’ 표시를 확인하고 앱을 새로고침한다. 사용자의 기존 web 접속 주소는 `http://127.0.0.1:8085`다. 이 버튼은 패키지에 함께 포함된 일반/고도 지도도 기존 규칙대로 선택하므로, 이전 패키지가 어떤 레이어를 담는지 먼저 확인한다.

최대32개 패키지를 함께 선택한다. 한도를 넘으면 준비 파일·ZIP과 기존 선택을 보존한 채 중단한다. 선택을 다시 구성하려면 아래의 ‘다운로드한 위성 지도 표시’ 목록을 사용한다. 이것은 파일 삭제가 아니다. 수동 `data/tpk/maps.json`의 다중 소스 설정은 계속 지원하지만 managed 위성 선택이 있는 동안에는 managed 카탈로그가 우선한다. 수동 파일은 해당 수동 카탈로그에서 구성하거나 다운로드 선택을 해제해 사용한다.

이전 ZIP은 **해당 작업의 패키지 한 개**를 담는다. 전국 ZIP에 이전 지역 상세가 자동 추가되는 것은 아니므로 다른 PC에서는 전국·지역 ZIP을 각각 가져와 등록한다. 확인된 이용·복제 조건과 기존 ZIP 해시/상대 경로/형식 검사, revision 충돌 보호는 유지한다.

`active.json`은 version1/revision/`layers.satellite`(최근 등록 ID)를 유지하고 선택 순서의 `satellitePackages: [UUID, …]`를 추가한다. 필드가 없으면 기존 단일 ID를 사용한다. 배열은 중복 없는 최대32개이며 마지막 ID가 `layers.satellite`와 같아야 한다. 일반/고도 등록은 이 목록을 유지하고 reset은 비운다. 복구 시 주 ID가 아닌 목록 내 패키지도 등록 완료로 인식한다. 등록부/원본을 직접 수정하지 말고 web과 worker를 함께 업데이트한다. **구버전 worker와 혼용하거나 다운그레이드하지 않는다.** 백업 후 검증된 코드/전체 등록부 세트로 복원한다. 공통 플랫폼 API 계약 변경은 아니다.

## 내부 API / 설정 호환성

모듈 내부 API이며 공통 OpenAPI나 타 모듈 계약은 바꾸지 않는다. JSON 요청16KiB, same-origin 검사, no-store 응답을 사용한다.

| 경로 | 동작 |
| --- | --- |
| GET `/api/downloads` | jobs + registry + worker heartbeat + provider capabilities/크기 확인값 + 서버 디스크 여유 |
| POST `/api/downloads/plan` | bounds/kinds/region/demProvider/levels/refresh 검증·면적/후보 수. 제공처 확인 전 용량·시간 null |
| POST `/api/downloads` | 기본 download, 또는 action=activate(packageId)/reset. 현재 registryRevision 필요, 충돌409 |
| GET/POST `/api/downloads/<id>` | 저장 상태 조회 / action=cancel 또는 retry. retry는 종료된 download를 새 ID로 제출 |
| GET `/api/downloads/<id>/archive` | 준비된 ZIP 스트림 |
| POST `/api/downloads/import` | application/zip 스트림, `If-Match: "<revision>"`, `X-Map-Confirm-Usage: true` |

Download request version1: id/createdAt/type/name, WGS84 bounds, kinds=[satellite/osm/elevation], 닫힌 region·demProvider, min/max levels, per-kind accepted=true, refresh, registryRevision. 브라우저는 원본 URL·명령·파일시스템 경로·인증값을 전송하지 않는다. 상태 version1은 queued/running/completed/partial/blocked/failed/cancelled/interrupted, stage·종류별 actual downloaded/total(null 허용)·결과/이유·packageId·registered를 가진다. active version1은 revision 및 kind→package UUID 매핑이다. UI가 읽는 자료와 worker가 쓰는 상태를 분리한다.

기존 source resolver는 활성 package가 있으면 해당 종류만 managed 경로로 읽고 없으면 기존 원본 설정으로 돌아간다. OSM 편집/타일도 같은 resolver를 쓴다. TPK reader/기존 importer·DEM metadata 형식은 유지한다. OSM 데이터 교체 중 이전 pending 요청은 닫힌 DB를 다시 쓰지 않고 재조회하도록 처리한다.

## 오프라인 이전

ZIP manifest version1은 id/createdAt/requestedBounds/items, 제공처·license·attribution·실제 범위/LOD·해상도/고도 기준·수신 checksum/ETag/lastModified(있을 때), 상대 파일 목록/bytes/SHA256를 담는다. 준비 TPK/catalog, 추출 PBF/SQLite, clip DEM/준비 타일과 metadata를 포함한다. **계정/키/서명 URL, 전체 지역 PBF/1도 원본 캐시, 시설/OSM 사용자 수정, Docker 이미지/프로그램은 제외**한다.

인터넷이 있는 PC에서 앱/worker 이미지도 먼저 준비한다. 다른 PC에서 같은 버전 앱/worker를 설치하고 ZIP을 `/downloads`에 가져온다. import/activate/reset에는 원본 네트워크가 필요 없다. 완전히 오프라인인 worker는 `--offline`과 Docker `--network none`을 함께 사용해 provider probe도 끈다. 예: 준비된 `map-service-download-worker:local` 이미지에 다운로드 폴더를 `/data/downloads`로 bind한 뒤 `docker run --rm --network none ... map-service-download-worker:local --offline`. 앱 자체는 MAP_MODE=offline을 유지한다.

ZIP은 해시·형식·버전·상대 경로·중복/대소문자 중복·symlink·해제 크기·압축률·계정 URL을 검사한 뒤 새 UUID 폴더에 복원한다. 기존 설정/사용자 파일을 덮어쓰지 않는다. 현재 도구 이미지에 검증용 GDAL/osmium/Python이 필요하지만 재다운로드나 재변환은 하지 않는다. 모든 복원 후 앱에서 각 레이어·범위·고도값을 확인한다. 원본 이용 조건상 다른 PC 이전이 허용되지 않으면 ZIP을 이전하지 않는다.

## 웹에서 지도 삭제·전체 초기화·복원

`/downloads`의 **지도 데이터 삭제·초기화**에서 다음을 실행한다. worker가 `maintenanceVersion:1`로 연결돼야 버튼이 활성화된다. 기존 **기존 파일 기반 지도로 돌아가기**는 적용 선택만 해제하며 파일을 정리하지 않는 동작으로 유지한다.

| 기능 | 정리 범위 | 확인 문구 |
| --- | --- | --- |
| 선택 작업·지도 삭제 | 선택한 종료 작업의 패키지·이전 ZIP·연결된 재등록 기록. 적용 중이면 해당 선택 해제, 남은 위성 유지. 패키지가 없는 실패 작업은 기록만 정리 | `지도 삭제` |
| 지도 데이터 전체 초기화 | 진행/대기 다운로드 취소, 다운로드 이력·패키지·이전 ZIP·원본 캐시/인덱스·위성/DEM 원본·적용 상태 | `전체 초기화` |
| 직접 설치한 지도도 포함(초기화 옵션) | 기존 TPK/일반 지도/고도/PBF 폴더의 데이터 추가 정리. 기본 선택됨 | 위와 같음 |
| 이 백업 복원 | 백업 파일과 당시 적용 선택. 취소된 다운로드는 취소 상태로 복원 | `백업 복원` |

파일은 **각 지도 폴더의 `.map-trash/<정리ID>/`로 같은 파일시스템 안에서 이동**한다. 물리 삭제·디스크 공간 확보 기능은 아니며 자동 백업 삭제/영구 삭제 버튼은 제공하지 않는다. 다운로드 폴더의 `maintenance/<ID>.journal.json`과 `.state.json`이 이동 목록·복원 상태를 보관하므로 각 지도 폴더와 다운로드 폴더를 함께 백업한다. README/maps.example/`.gitkeep`와 `.env*`는 남기며 시설·경계·OSM 수정 폴더와 인증/환경 파일은 정리 대상 마운트에 포함하지 않는다. 명시한 비밀 파일이 정리 대상에 들어 있으면 중단한다. 개별 삭제는 공유 원본 캐시를 지우지 않는다. 한 패키지를 참조하는 종료된 재등록 기록은 함께 정리한다.

개별 삭제·복원은 다른 다운로드가 완료/취소된 뒤 실행한다. 전체 초기화는 현재 worker 다운로드를 취소하고 대기 요청도 취소 상태로 백업한다. **별도로 실행한 CLI/OSM·고도 준비 도구를 먼저 종료한다.** 외부 파일 변경이나 여러 web writer를 동시에 운용하는 구성은 지원하지 않는다. CLI도 진행 중인 웹 정리 표시가 있으면 새 요청/worker 실행을 거부한다. 긴 상태 조회는 한 번에 하나만 실행해 느린 Windows bind에서도 주기 조회가 앞선 응답을 계속 무효화하지 않게 한다.

정리 요청은 same-origin/16KiB/UUID·확인 문구·registryRevision을 검사하고 내부 allowlist 경로만 worker에 전달한다. 임의 경로·shell·Docker socket은 받지 않는다. `maintenance.pending.json`이 새 웹 다운로드/등록/업로드와 지도 읽기를 일시 중지한다. web이 TPK/OSM 리더를 닫고 `ready`를 기록한 뒤 worker가 단일 flock 안에서 처리한다. 리더 종료 확인이120초 내 끝나지 않으면 파일을 바꾸지 않고 요청을 실패 처리한다. 변경 전 revision 검사, 변경 중 이동 저널, 각 파일의 atomic rename을 사용한다. 충돌/심볼릭 링크/권한·파일 잠금 실패는 파일을 덮어쓰지 않는다. 이미 시작한 이동은 읽기/쓰기 중지를 유지하고30초마다 또는 worker 재시작 후 같은 저널로 재시도한다. 저널을 임의 삭제해 강제로 잠금을 풀지 않는다.

복원은 복원할 위치의 새 파일·변경된 적용 상태·백업 누락을 먼저 검사한다. 당시 적용할 managed 패키지의 manifest SHA/크기/형식·이용 확인도 다시 검증한 뒤 이동/등록한다. 수동 설치 원본 전체의 독립 checksum을 새로 만들지는 않으며 기존 리더 검사를 사용한다. 원본 백업을 보존한 채 중단하므로 새 자료를 지우며 강제 복원하지 않는다. 정리 후 홈 지도를 새로고침한다. 백업20개/정리 기록100개/이동 항목1000개 한도이며 자동 보관 정책은 없다. 보관 파일을 관리자가 정리할 때는 정리 작업이 없는 상태에서 전체 경로/저널 세트를 함께 확인한다.

### 업데이트

web은 기존 원본 read-only bind를 유지한다. worker에만 `TPK_HOST_DIR`, `OSM_HOST_DIR`, `STREET_HOST_DIR`, `ELEVATION_HOST_DIR`의 지도 전용 쓰기 bind를 추가한다. 시설·OSM 수정·인증/환경 폴더를 이 지도 경로로 지정하지 않는다. 지도 전용 경로는 서로 겹치지 않게 구성한다. 기존 `.env`의 포트·HOST_DIR와 `.env.downloads` 인증을 함께 유지해 **web/worker를 모두 업데이트**한다. 아래는 프로젝트 폴더의 PowerShell 예시다.

```powershell
git pull --ff-only origin main
docker compose up -d --build web
$downloadEnvArgs = @()
if (Test-Path .env) { $downloadEnvArgs += @('--env-file', '.env') }
$downloadEnvArgs += @('--env-file', '.env.downloads')
docker compose @downloadEnvArgs --profile downloads up -d --build download-worker
```

`.env.downloads`의 동일 HOST_DIR 항목이 `.env`보다 우선하므로 서로 같은 실제 데이터 경로인지 확인한다. 기존 사용자 web 주소는 `http://127.0.0.1:8085/downloads`다. 초기화는 접속 자체를 복구하는 기능이 아니므로 web 미실행/포트 오류가 있으면 먼저 `docker compose ps -a web`, `docker compose port web 3001`, web 로그로 확인한다.

내부 POST `/api/downloads`: `action=maintenance`, `operation=delete|clear|restore`, `confirmation`, `registryRevision`, delete의 `targetId`, clear의 `includeLegacy`, restore의 `backupId`. GET 응답의 `maintenance.pending`, `maintenance.operations`가 요청·진행·성공/실패/복구 필요 상태를 제공한다. 기존 작업 목록은 유지·삭제 대상의 실제 작업만 보여주며 정리 결과는 별도 영역에 남는다. 공통 플랫폼 API 계약 변경은 아니다.


### 다운로드한 위성 지도 선택

`/downloads`의 **다운로드한 위성 지도 표시**에서 위성 패키지를 체크하고 **선택한 지도 표시**를 누른다. **전체 선택 / 전체 해제**는 초안 체크 상태를 바꾸며, 적용 버튼을 눌러 worker의 검사가 완료되어야 홈 지도·다운로드 미리보기에 반영된다. 일반 지도(OSM)/고도 선택은 기존 방식을 유지한다. 준비된 패키지만 최대32개를 함께 표시하며 32개를 넘는 전체 선택은 조용히 일부만 적용하지 않고 적용을 비활성화한다. 누락·권한 미확인 manifest는 선택 불가로 표시한다. 서버에는 최대100개 패키지/작업 보관 한도가 있다.

선택 목록은 기존 원본 파일 목록과 다르다. 준비가 끝난 packages의 위성 manifest 요약만 조회하고, worker는 적용 전 파일 해시·형식·이용 확인을 다시 검사한다. 원본 TPK·DEM·이전 ZIP·시설·OSM 수정은 변경하거나 다시 받지 않는다. 선택 요청도 작업 기록에 남으므로 보관 한도에 도달하면 기존 정리 기능을 사용한다. 최신 worker의 `selectionVersion:1`과 최근 heartbeat가 필요하다. **web과 worker를 함께 업데이트**하고 기존 `.env`의 host 경로 및 `.env.downloads` 인증을 유지한다.

실제 native 줌이 높은 타일 → 기존 role/명시 priority → managed 패키지의 더 좁은 유효 요청 범위 → 같은 범위의 최근 선택 순서로 고른다. 전체 선택은 생성일이 오래된 것부터 선택 순서를 구성한다. 빈 타일은 다른 선택 자료와 낮은 줌에서 찾는다. 단순히 파일명/목록 맨 위나 최신 파일만 사용하는 방식이 아니다. 유효 범위는 실제 TPK/카탈로그 범위와 요청 범위의 교집합이며, 같은 줌의 범위 비교는 경위도 사각형 크기 기준이다. 고해상도 실타일이 없으면 원본보다 정밀해지지 않는다.

미리보기는 적용 revision에 맞춰 타일만 갱신하고 현재 위치·줌·입력 좌표·다운로드 사각형을 유지한다. **영역 보기**는 해당 패키지 범위로 카메라만 이동한다. **미리보기로 이동**은 모바일의 상단 지도에 접근하는 링크다. 미수록 범위에는 번들 국가 개요를 아래에 표시하며 이것은 위성영상이 아니다. 현재 로컬 지도/국가 개요 전환은 유지한다.

전체 해제를 적용하면 위성 표시를 끈 상태를 저장하고 수동 TPK로 자동 대체하지 않는다. 새로고침/서버 재시작에도 유지한다. 수동 파일 지도로 돌아가려면 별도의 **기존 파일 기반 지도로 돌아가기**를 사용한다(다른 managed 레이어도 해제하는 기존 동작). 새 위성 다운로드·명시 재등록·ZIP 가져오기는 기존처럼 위성을 다시 추가/표시한다. 같은 패키지의 고도/일반 지도는 이번 체크 선택으로 바뀌지 않는다.

내부 queue의 `type:select`, `packageIds:[UUID,…]`, `registryRevision`은 기존 단일 worker/flock/CAS 처리로 등록한다. active.json version1에 `satelliteVisible`과 복구용 `satelliteSelectionJob`을 더하며 false일 때 위성 ID/목록이 없어야 한다. reset은 이 필드를 지우고, 삭제·백업 복원은 명시 표시 상태를 보존한다. 충돌/손상/취소 시 기존 선택·자료를 보존한다. 구버전 worker 혼용/등록부 직접 수정은 지원하지 않는다. 공통 플랫폼 API 변경은 아니다.


### 범용 다운로드 화면과 사용자 지정 level

웹 `/downloads`는 특정 지명·시험장 목적 없이 **지도 데이터**라는 브랜드/기본 작업 이름과 **지도 다운로드·관리** 브라우저 제목을 사용한다. 고정 지역 프리셋과 태안 초기 사각형을 제거했다. 처음에는 세계 국가 개요만 표시하고 다운로드 영역/좌표는 비워 둔다. 지도를 확대해 **보이는 영역 선택 / 사각형 두 점 선택**, 기존 지도 화면 범위, 저장된 시설 경계 또는 고급 좌표로 영역을 명시해야 작업량 확인/다운로드를 시작할 수 있다. 세계 개요 화면 자체가 전세계 다운로드 영역은 아니며 기존 bbox 각 축15도 한도를 유지한다. Geofabrik의 실제 제공 지역 이름은 원본 선택 정보로 유지한다.

**표시 상세도 → 사용자 지정**을 고르면 **위성 최소 level / 위성 최대 level**을 직접 입력한다. 0–19 정수와 최소≤최대를 요구하고 확인된 제공처 LOD에 없는 중간 level도 거부한다. LOD 조회 전에도 입력할 수 있지만 실제 지원·export 권한·타일 한도는 worker가 다시 확인한다. 사용자 지정 값은 제공처 갱신이나 테마 변경으로 자동 보정하지 않고, 지원하지 않으면 입력을 유지하며 수정 안내를 표시한다. 다른 프리셋을 골랐다 다시 사용자 지정으로 돌아와도 초안을 보존한다. 위성을 해제하면 그 초안은 다른 원본의 작업을 막지 않는다. 사용자 지정은 고도 level을 바꾸지 않으며 개요/기본/상세 프리셋과 고급 고도 설정도 유지한다.

예를 들어 위성0–13은 사용자 지정에 최소0/최대13을 입력한 뒤 영역·작업량을 확인한다. 더 큰 숫자는 더 높은 해상도의 원본이 실제 존재함을 보장하지 않는다. 기존150,000 위성 타일 한도·원본/시간/디스크 제한·인증·이용 확인·CAS는 그대로다. 과거 작업·패키지·시설의 사용자 이름은 수정하거나 숨기지 않으며 새 화면의 기본 문구만 일반화했다. 기존 태안 전용 CLI는 호환을 위해 유지하고 웹의 초기값으로 사용하지 않는다. 공통 API/worker 요청 형식 변경은 없다.

Git을 사용할 수 없는 환경에서는 [최신 소스 ZIP](https://github.com/JaewonYe/map_service/archive/refs/heads/main.zip)을 별도 폴더에 풀어 코드만 갱신하고 기존 `.env`, `.env.downloads`, 실제 데이터 폴더와 사용자 지정 host 경로는 유지한다. 이 변경은 web을 다시 빌드해야 반영되며 다운로드 원본을 다시 받을 필요는 없다. 프로젝트 폴더 PowerShell 예시:

```powershell
$downloadEnvArgs = @()
if (Test-Path .env) { $downloadEnvArgs += @('--env-file', '.env') }
$downloadEnvArgs += @('--env-file', '.env.downloads')
docker compose @downloadEnvArgs up -d --build web
docker compose @downloadEnvArgs port web 3001
```
