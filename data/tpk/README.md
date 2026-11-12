# 원본 TPK 보관

받은 실제 파일을 `map.tpk`로 복사하거나 `.env`의 `TPK_FILE`(Compose), `TPK_PATH`(호스트 개발)를 변경하세요.
여러 파일은 `maps.example.json`을 `maps.json`으로 복사하고 기본 지도/관심 지역 TPK를 상대 경로로 등록합니다.
`bounds`와 실제 줌은 각 원본에서 읽으며, `usageConfirmed`는 파일별로 확인해야 합니다.
JSON과 하위 폴더 전체를 함께 복사하면 서버를 이전할 수 있습니다. 추가/교체 후 서버를 재시작하세요.
원본은 읽기 전용으로 마운트되며 이미지나 Git에 포함되지 않습니다.
메타데이터 검사에는 타일 추출 권한 확인이 필요하지 않습니다. 실제 타일 제공·압축 bundle 캐시는 사용 권한 확인 후에만 실행합니다.
현재 저장소에는 실제 사용자 TPK가 없습니다. 예제 테스트 TPK는 `.cache/test-tpk/`와 `.cache/test-catalog/`에 생성됩니다.
