# 오프라인 지도 — 위성영상·일반 지도·고도 지도

기존 **Next.js 16.4.5 App Router + TypeScript + Docker**를 유지합니다. Leaflet을 클라이언트에서만 로드하며, **Next.js Route Handler가 로컬 TPK를 직접 읽습니다.** 별도의 Python/FastAPI/타일 서버는 실행하지 않습니다.

## Quick Guide — Windows 11 / Ubuntu 24.04

필수: Windows의 Docker Desktop(WSL 2·Linux containers) 또는 Ubuntu의 Docker Engine + Compose v2. 개발·파일 분석에는 Node.js 22.2 이상도 필요합니다.

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

## 일반 지도·고도 지도 추가

현재 보유한 **World Imagery TPK(대한민국 0–13, 태안 14–19)는 위성영상**입니다. 이 영상의 줌을 늘려도 도로·건물명 지도나 실제 고도값이 생성되지는 않습니다. 아래 데이터를 별도로 준비해야 합니다. **데이터가 없는 레이어는 선택기에 표시되지 않으며, 오른쪽 `지도 데이터 준비`에서 상태와 필요한 파일을 확인할 수 있습니다.**

| 기능 | 필요한 데이터 | 복사할 위치 |
| --- | --- | --- |
| 일반 지도 | 도로·지명이 렌더링된 래스터 **TPK** (EPSG:3857, 256px, Compact V1/V2) | `data/street/map.tpk` |
| 고도 지도 | 미터 단위 높이를 가진 **단일 밴드 DEM GeoTIFF** (`.tif`) | `data/elevation/source/dem.tif` |

### 일반 지도

1. 허용된 **일반 지도 TPK**를 위 위치에 복사하고 `.env`에 `STREET_USAGE_CONFIRMED=true`를 설정합니다. 위성용 `TPK_USAGE_CONFIRMED`와 별개입니다.
2. 여러 일반 지도 TPK가 있다면 `data/street/maps.example.json`을 `maps.json`으로 복사하고, 위성 카탈로그와 동일한 형식으로 기본/상세 TPK와 각각의 `usageConfirmed`를 등록합니다. `file` 경로는 **data/street 기준**입니다. 단일 파일은 모든 원본 줌을 사용하고, 다중 파일은 `minZoom`/`maxZoom`을 실제 데이터에 맞추세요.
3. 서비스를 재시작하고 새로고침한 뒤 오른쪽 **일반 지도**를 선택합니다. 초기 선택은 위성영상 → 일반 지도 → 고도 지도 순으로 준비된 첫 레이어입니다.

일반 지도에는 별도의 TPK 카탈로그가 적용됩니다. 겹침·우선순위·빈 상세 타일의 낮은 줌 대체 규칙은 기존 위성 지도와 같습니다. 위성 TPK와 파일을 혼합하지 마세요. `.pbf`와 벡터 MBTiles는 이 래스터 API에 바로 넣을 수 없습니다. 저장소에 남아 있는 예전 `data/vector/region.mbtiles`는 **모나코 영역의 벡터 데이터**로 태안 일반 지도 대신 사용할 수 없습니다.

기존 `data/osm/z/x/y.png` 또는 `.jpg` 로컬 OSM도 사용할 수 있습니다. TPK 일반 지도가 준비되면 우선 사용하고, 없으면 허용된 로컬 OSM, 마지막으로 **명시적으로 MAP_MODE=online인 경우만** 공용 OSM을 사용합니다. 인터넷 연결을 켠다고 자동으로 온라인 모드로 바뀌지 않습니다. 로컬 XYZ에는 필요한 줌을 모두 준비해야 하며, TPK의 부모 타일 대체 기능은 적용되지 않습니다.

### 고도 지도

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

`maps.json`에 등록한 **`role: "detail"` 항목**은 지도 왼쪽 위의 **상세 지역** 목록에 자동 표시됩니다. 항목을 선택하면 해당 TPK의 실제 경계(또는 설정에서 축소한 경계)가 화면에 들어오도록 중심·줌을 조정합니다. 최대 줌은 해당 파일의 실제 `maxZoom`을 넘지 않으며 목록은 선택 후 접힙니다. 제목을 누르면 다시 펼칠 수 있습니다.

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

## 건물 정보 등록·조회·수정

**지도 우클릭 → 건물 정보 등록**을 선택하면 해당 위치의 좌표가 자동 입력됩니다. 건물명을 입력하고 저장하면 보라색 건물 마커가 나타납니다. 마커를 클릭하면 최신 정보를 다시 읽어 수정할 수 있고, 삭제는 별도 확인 버튼을 눌러야 실행됩니다. 건물 등록을 시작할 때 진행 중인 측정은 멈추지만 기존 측정 결과는 유지됩니다.

| 항목 | 입력 방식 |
| --- | --- |
| 건물명 | 필수, 최대 120자 |
| 설명 | 선택, 최대 5,000자, 여러 줄 지원 |
| 용도·분류 | 미분류·주거·상업·공공시설·공장/창고·교육·의료·문화/관광·기타 |
| 주소·연락처·관련 URL | 선택. URL은 HTTP/HTTPS만 지원하며 자동 외부 조회는 하지 않음 |
| 위도·경도 | 우클릭한 위치에서 자동 입력, 필요 시 직접 수정 가능 |
| 등록일·수정일 | 서버가 자동 기록, 화면에서는 한국 시간으로 표시 |

추천하는 후속 확장 항목은 **관리 담당자, 관리 상태, 층수, 최근 점검일, 현장 사진**입니다. 현재 버전에는 위 표의 항목을 제공합니다. 주소는 직접 입력하며 온라인 주소 검색·지오코딩에 의존하지 않습니다.

등록 정보는 브라우저가 아닌 **`data/buildings/<건물 ID>.json`**에 저장합니다. 새로고침·Docker 종료·컨테이너 재생성·이미지 재빌드 후에도 남습니다. TPK·타일 캐시와 별도 보관하며 Git/Docker 이미지에 실제 등록 데이터를 포함하지 않습니다. **백업·서버 이전 시 서비스를 종료한 뒤 `data/buildings/` 전체를 함께 복사**하세요. 기존 `data/tpk/`, `.env`, Compose 파일도 기존 절차대로 옮깁니다.

- 호스트 개발: `BUILDINGS_DIR` (기본 `data/buildings`)
- Docker 호스트: `BUILDINGS_HOST_DIR` (기본 `./data/buildings`, 디렉터리가 존재해야 함)
- Docker 내부: `/data/buildings` 읽기/쓰기 마운트. Ubuntu에서는 컨테이너 node 사용자(UID 1000)의 쓰기 권한이 필요함

저장은 임시 파일을 완성한 뒤 원자적으로 교체합니다. 같은 서버 프로세스 안에서 쓰기를 순서대로 처리하며, 다른 화면에서 먼저 수정한 내용은 409 충돌로 알려 덮어쓰지 않습니다. 충돌 시 창을 닫고 마커를 다시 열면 최신 버전을 읽습니다. 저장 실패 시 입력 중인 내용은 창에 유지됩니다. 현재 파일 저장 방식은 **웹 서버 프로세스 1개**, 건물 최대 10,000개를 대상으로 하며 여러 서버의 동시 쓰기는 지원하지 않습니다. 기존 서비스처럼 로그인 없이 로컬에서 사용하며, 새 쓰기 API는 다른 출처의 브라우저 요청을 거부합니다.

## 구현과 파일

| 파일 | 기능 |
| --- | --- |
| `lib/tiles/tpk.ts` | ZIP/메타데이터, Compact V1/V2 인덱스, 범위 검사, 캐시 |
| `lib/tiles/catalog.ts` | 여러 TPK 등록·권한·해상도·우선순위 선택, Sharp 확대/투명 합성 |
| `app/api/map-info/route.ts` | 실제 파일의 메타데이터와 OSM 제공 상태 |
| `app/api/tiles/[z]/[x]/[y]/route.ts` | XYZ → 원본 타일 응답 |
| `app/api/osm/[z]/[x]/[y]/route.ts` | 사용 허가가 확인된 로컬 XYZ OSM PNG/JPEG |
| `components/MapCanvas.tsx` | Leaflet, 좌표·줌, 클릭 위치, scale bar, 경계·레이어 전환 |
| `components/DetailLocations.tsx` | detail 지역 목록·상태 표시·경계에 맞춘 위치 이동 |
| `components/MapMeasurements.tsx` | 거리·면적 도구, 점 선택·완료·되돌리기·초기화 |
| `components/MapBuildings.tsx` | 건물 마커·등록/수정 창·저장 실패 표시 |
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
npx playwright install chromium
npm test
npm run typecheck
```

테스트용 TPK는 직접 생성한 CC0 픽셀과 메타데이터로 `.cache/test-tpk/`에 만듭니다. V1/V2·Stored/Deflate ZIP, Esri 공식 Apache-2.0 V2 샘플의 JPEG와 바이트 단위 대조, 비대칭 row/column, JPEG/PNG, 동시 중복 요청, 원본 불변, 권한 게이트, 손상 인덱스, XYZ 검증, 로컬 OSM 정책 및 UI를 검사합니다. 브라우저 테스트에서는 외부 호스트를 차단하고 로컬 타일이 보이는지 확인합니다.

**검증 범위:** 현재 Linux 클라우드의 합성 패키지 테스트이며, 실제 사용자 TPK 검증과 Windows 11/Ubuntu 24.04 실기 검증은 아직 완료되지 않았습니다. 실제 파일의 라이선스·내보내기 정보와 패키지 구조를 확인한 뒤 실제 위성영상 검증을 진행해야 합니다.

현재 검증 결과: 타일·형식・다중 등록 테스트 **22개**, 실행 메뉴 **12개**, 거리·면적 계산 **9개**, 건물 저장소 **7개**, 단일/다중/측정/지역 이동/건물/추가 레이어 브라우저 **27개**를 통과했습니다. 다중 등록에서는 z0–13 기본 지도, z14–19 상세/누락 줌, 겹침·동일 우선순위, 부모 타일 위치별 crop, 투명 PNG 합성, 권한 격리, 손상/누락 상세 파일, 설정 변경 감지와 기존 단일 TPK 호환성을 검사합니다. Docker Compose의 외부 통신 차단 네트워크에서도 **3개 TPK의 선택·확대 대체·압축 bundle 캐시·404·비루트 실행·원본 읽기 전용 마운트**를 확인했습니다. 실행 메뉴에서는 의존성 설치·오프라인 재사용·설치 실패 처리·Windows npm 명령 구성도 검사합니다. 모두 합성/공개 형식 샘플 기준이며 실제 사용자 패키지의 완료 증거는 아닙니다.

건물 기능은 등록·새로고침 후 유지·수정·삭제·저장 실패 시 입력 보존·지연 응답·문자열 표시·버전 충돌·모바일을 검증했습니다. 외부 통신이 차단된 Docker Compose에서도 비루트 사용자로 건물을 등록·수정한 뒤 컨테이너를 강제로 재생성해 내용과 버전의 보존, 기존 z19 타일 제공, 삭제를 확인했습니다. 실제 사용자 건물 데이터는 테스트에 사용하지 않았습니다.

고도 변환 검증은 GDAL·NumPy가 설치된 환경에서 `python3 -m unittest discover -s tests -p '*_test.py'`로 실행합니다. Node 단위 테스트는 수치 인코딩·0m/음수/NoData·경로 격리·권한 분리를 확인하며, 브라우저 테스트는 세 레이어 전환·원본 줌 확대·고도 API·오프라인 요청을 검사합니다. 테스트 데이터는 CC0 합성 데이터이며 실제 태안 지형을 나타내지 않습니다.

오프라인 PC에서 **새 DEM 변환도** 하려면 인터넷이 있는 PC에서 `docker compose --profile tools build prepare-elevation` 후 `docker save -o elevation-tools-image.tar map-service-elevation-tools:local`로 도구 이미지도 복사하고, 대상 PC에서 `docker load -i elevation-tools-image.tar` 후 **`--build` 없이** `docker compose --profile tools run --rm --pull never prepare-elevation`을 사용하세요. 이미 변환된 데이터의 지도 표시에는 도구 이미지가 필요 없습니다.

일반/고도 확장 검증: Node 단위 테스트 **6개**, GDAL 변환 테스트 **3개**, 추가 브라우저 테스트 **3개**를 통과했습니다. 네트워크가 차단된 Docker Compose에서 합성 GeoTIFF의 실제 변환, 세 레이어의 로컬 타일, 클릭 고도 123.5m, PNG/404, 비루트 실행, 읽기 전용 마운트를 확인했습니다. Windows/Ubuntu 실기와 실제 사용자 태안 데이터는 검증하지 않았습니다.
