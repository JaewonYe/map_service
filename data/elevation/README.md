# 고도 데이터

원본(값이 미터 단위인 단일 밴드 DEM GeoTIFF)을 `source/dem.tif`에 보관합니다.
**메뉴 6은 DEM `.tif` 전용이며 OSM `.osm.pbf`는 사용할 수 없습니다.** DEM이 없으면 해당 메뉴를 실행하지 않아도 기존 지도는 사용할 수 있습니다. 메뉴에서 파일·설정을 확인한 뒤 이미지 빌드를 시작합니다.
사진으로 된 위성 TPK에는 DEM 높이값이 없습니다.

1. `.env`의 `ELEVATION_USAGE_CONFIRMED=true`를 허용된 데이터에 한해 설정합니다.
2. Windows `실행.cmd` 메뉴 **6**, 또는 두 OS에서:

   ```sh
   docker compose --profile tools run --rm --build prepare-elevation
   docker compose restart web
   ```

3. 브라우저 새로고침 후 **고도 지도**를 선택합니다. 클릭 위치의 고도는 어느 레이어에서도 조회할 수 있습니다.

`metadata.json`에는 원본 경계·줌·고도 범위·높이 기준·원본 SHA256을 기록합니다.
`sets/<id>/color/`는 고도별 색상+음영 PNG, `sets/<id>/height/`는 Terrarium RGBA 수치 PNG입니다.
NoData는 투명 픽셀로 구분하며 0m와 음수 높이도 유효합니다.

**이 폴더 전체**를 보관·복사하세요. 서버는 읽기 전용으로 사용하며 원본은 변환 시에도 수정하지 않습니다.
변환이 성공한 경우에만 `metadata.json`을 교체합니다. 이전 `sets/`는 수동 정리 전까지 보존되므로 서비스 중 삭제하지 마세요.
데이터가 바뀌면 서버를 재시작하고 새로고침하세요.

변환 도구는 Docker 작업 컨테이너이며, 고도 서버를 별도로 실행하지 않습니다.
오프라인 PC에 새 변환 도구도 필요한 경우 `map-service-elevation-tools:local` 이미지를 함께 `docker save`/`docker load`로 옮기세요.
