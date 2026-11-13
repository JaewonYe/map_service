# 일반 지도 데이터

도로·건물명·지명이 포함된 **래스터 일반 지도 TPK**를 `map.tpk`로 보관하세요.
World Imagery 위성 TPK, 벡터 PBF/MBTiles, TPKX는 일반 지도 TPK를 대신하지 못합니다.

- 단일 파일: `map.tpk` + `.env`의 `STREET_USAGE_CONFIRMED=true`
- 여러 파일: `maps.example.json`을 `maps.json`으로 복사하여 파일별 `usageConfirmed` 등록
- 지원: EPSG:3857, 256px, Compact V1/V2, JPEG/PNG
- JSON 경로는 이 폴더 기준 상대 경로입니다. 원본 줌·경계·우선순위·하위 줌 대체는 위성 카탈로그와 같은 규칙을 사용합니다.
- 위성 `data/tpk/` 및 `TPK_USAGE_CONFIRMED`와 권한·파일이 분리됩니다.

원본 파일과 설정을 함께 복사하여 다른 PC로 옮기고 서비스를 재시작하세요.
다운로드나 재배포를 허용하지 않는 공용 지도 서버에서 타일을 일괄 수집하지 마세요.
