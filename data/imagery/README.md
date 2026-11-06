# 이동·백업 가능한 위성영상 보관 폴더

`taean/sentinel2/` 아래 원본과 가공 결과를 분리합니다.

- `source/*-red.tif`, `*-green.tif`, `*-blue.tif`, `*-nir.tif`: 원본 밴드 COG
- `source/*.stac.json`, `*.sha256`, `acquisition.json`: 출처·촬영일·밴드 보정값·체크섬
- `processed/rgb-*.mbtiles`: 자연색
- `processed/infrared-*.mbtiles`: 근적외선 강조 (열화상 아님)
- `processed/ndvi-*.mbtiles`: NDVI 색상 시각화
- `manifest.json`: 현재 파일 참조·이용 조건·촬영일·계산 방식·체크섬

`taean/sentinel2/` 전체를 그대로 복사하면 재다운로드·재가공 없이 사용 가능합니다.
폴더가 없거나 비어 있으면 다운로드가 완료된 것이 아닙니다. 합성 테스트 영상은 여기에 저장하지 않습니다.
원본·타일은 Git에 업로드하지 않습니다. 상세 명령은 루트 README를 참고하세요.
