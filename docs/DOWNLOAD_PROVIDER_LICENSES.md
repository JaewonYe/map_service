# 다운로드 제공처·라이선스 확인 (#20)

확인일: 2026-11-22 KST. 아래 공식 문서에서 확인한 일반 조건과, 실제 사용 계정/자료에 별도로 확인해야 할 권한을 구분한다. 다운로드 API 응답 성공이나 체크박스만으로 계약상 사용 권한이 만들어지지는 않는다. 현재 클라우드에서는 공식 원본 연결이 차단되어 계정별 권한/수신 원본은 미검증이다.

## World Imagery for Export

- [공식 export 항목](https://www.arcgis.com/home/item.html?id=226d23f076da478bba4589e7eae95952), [서비스](https://tiledbasemaps.arcgis.com/arcgis/rest/services/World_Imagery/MapServer), [exportTiles REST](https://developers.arcgis.com/rest/services-reference/enterprise/export-tiles-map-service/).
- 공식 오프라인 export 경로, async job/results, TPK/TPKX/저장 형식·LOD·서비스별 타일 한도와 관련된 문서를 확인했다. 공개 tile endpoint의 일괄 수집으로 대체하지 않는다. 구현은 매번 실제 capabilities와 현재 리더 지원 형식을 검사한다.
- 사용자는 기존 ArcGIS 계정에서 ExportTiles POST / EPSG:3857 / levels15–17 / tilePackage=true로 TPK를 받은 경험을 확인했다. **현재 토큰·서비스 export 권한·Next.js/Leaflet 내부 표시 및 타 PC 이전 권한은 확인되지 않았다.** 공식 항목은 ArcGIS 앱/Runtime의 오프라인 사용 맥락을 설명하므로 임의의 웹 앱 사용을 포괄 승인한다고 해석하지 않는다. 계정 담당자/Esri의 해당 이용 조건에서 앱과 이전 대상 범위를 확인해야 한다.
- 항목의 모든 동적 약관 본문을 이 환경에서 읽고 계정별 승인까지 확인한 것은 아니다. 지역별 영상 기여자·시점·상세 조건은 결과 메타데이터/계약에서 확인한다. 기본 출처는 Esri, Maxar, Earthstar Geographics, GIS User Community이며 개별 영상의 추가 credit을 대체하지 않는다.
- XML Compact V1/V2 TPK + EPSG:3857 + 256px만 지원한다. TPKX나 다른 export 저장소는 지원 확대 검토 전 실패로 남긴다. 실제 영상 누락과 각 LOD를 확인하고 데이터 시점 미확정은 그대로 기록한다.

## OpenTopography / Copernicus GLO-30

- [OpenTopography 개발자 안내](https://opentopography.org/developers), [API 이용 조건](https://opentopography.org/usageterms), [globaldem API](https://portal.opentopography.org/API/globaldem).
- COP30의 수치 GeoTIFF 선택 영역 수신에는 개인 API Key가 필요하다. 개인 한 사람의 키를 여러 사용자에게 공유하지 않는다. 상업 제품/서비스에 API를 통합하는 경우 OpenTopography Enterprise 조건을 확인한다. 본 앱은 별도 계약을 체결하지 않으며 공개 서버용 키 공유/무료 한도 우회를 구현하지 않는다.
- 계정별 요청량·영역 제한이 적용된다. 공식 설명의 30m 자료 면적 한도와 별개로 앱은 요청1,000km²라는 작은 상한을 둔다. 무료 할당량은 변경될 수 있어 고정 수치를 약속하지 않는다. 429 Retry-After를 존중한다. OpenTopography 지원 출처 표시는 NSF awards 2410799, 2410800, 2410801을 함께 기록한다.
- [Copernicus DEM 공식 자료/라이선스](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM): GLO-30은 지표·건물·식생을 포함하는 DSM이며 nominal30m, 높이 기준 EGM2008이다. 원본/변형 산출물의 출처·권리 보유자·수정 사실·책임 관련 조건을 지켜야 한다. 무료 접근을 무조건적인 권리 포기로 해석하지 않는다.
- 준비 metadata/화면/ZIP에는 Copernicus WorldDEM-30 기반 산출물임과 DLR e.V. 2010–2014 / Airbus Defence and Space GmbH 2014–2018 / European Union·ESA COPERNICUS 출처, 권리·책임 안내를 한국어로 기록한다. 재배포·출판할 때는 해당 라이선스의 정확한 원문 고지 요건도 확인한다. 앱의 번역 요약이 원문을 대체하지 않는다.
- 원본 해상도와 표시 zoom은 다르다. clip/재투영/타일 준비는 지상 정확도를 높이지 않으며 지형 측량용 bare-earth DTM으로 바꾸지 않는다. NoData·m·EGM2008과 변형 과정을 유지한다.

## AWS GLO-30 대안

- [AWS Open Data 등록](https://registry.opendata.aws/copernicus-dem/), [GLO-30 배포 README](https://copernicus-dem-30m.s3.amazonaws.com/readme.html).
- 익명 접근 가능한 공식 1도 COG 경로를 명시적으로 선택할 수 있다. 필요한 타일 전체를 받으므로 작은 bbox도 원본 수신량이 클 수 있다. coverage 밖/누락 파일은 실패 사유로 남긴다. 위 Copernicus 조건은 그대로 적용된다.
- ETag를 항상 MD5라고 가정하지 않는다. TLS/길이/GTiff 형식/자체 SHA256를 기록하고, strong ETag+길이가 일치하는 캐시도 로컬 SHA를 확인한다.

## Geofabrik / OpenStreetMap

- [Geofabrik 다운로드 설명](https://www.geofabrik.de/data/download.html), [기술 안내](https://download.geofabrik.de/technical.html), [OSM 저작권/ODbL](https://www.openstreetmap.org/copyright).
- 대한민국/Monaco 공식 지역 PBF 및 MD5 sidecar를 받는다. ODbL-1.0과 © OpenStreetMap contributors 출처를 유지한다. 데이터베이스/변형 DB를 공개 배포할 경우 해당 share-alike·출처 조건을 검토한다. Geofabrik의 배포 조건/서버 자원도 존중한다.
- PBF는 지역 원본 전체이며 후속 bbox complete_ways 추출/SQLite 렌더링은 로컬에서 수행한다. 앱이 공용 OSM PNG 타일을 대량 수집하지 않는다. 원본 수정 사항을 OSM 서버에 전송하지 않는다.

## 최초 설치 개요와 이번 검증의 한계

[Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/)의 Public domain 110m Admin0 국가 윤곽을 번들한다. 원본·변형·SHA는 [overview README](../public/overview/README.md)에 기록했다. 이 공개 파일만 현재 허용 호스트에서 실제 다운로드했다. 국가 개요를 고해상도 위성/도로/DEM 수신 증거로 사용하지 않는다.

실제 호출의 네 호스트는 모두 프록시 CONNECT 403으로 차단됐다. 따라서 제공처 HTTP401/403이나 토큰 만료 응답을 실제로 받았다고 보고하지 않는다. 클라우드의 기존 `naturalearth.s3.amazonaws.com`, `osmdata.openstreetmap.de` 및 `package_managers` 허용 설정은 변경하지 않았다. 환경 편집 도구가 없으며 비활성 Cloud Environment 버튼으로 해결됐다고 주장하지 않는다. 사용자 PC의 Docker/Node 절차로 인증·원본 연결 검증을 진행할 수 있다. 비밀값은 채팅에 보낼 필요가 없다.
