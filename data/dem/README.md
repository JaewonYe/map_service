# 다운로드한 DEM 원본

지도 다운로드 worker/태안 CLI가 검증한 OpenTopography COP30 원본 GeoTIFF를 요청·내용 해시가 포함된 파일명으로 보존합니다. 키/토큰을 파일명·sidecar·manifest에 넣지 않습니다. 원본 파일과 재사용 index는 별도 data/downloads/originals-index에서 연결합니다. AWS 대안을 선택하면 다운로드한 원본 타일은 source-cache에 남고 이 폴더에는 영역 모자이크/clip GeoTIFF를 보존합니다.

실제 수신 파일은 Git에 넣지 않습니다. 기존 사용자 파일을 덮어쓰지 않으며 명시적 다시 받기도 새 내용 파일을 만듭니다. 원본 API 이용·복제 조건과 단위/EGM2008·NoData를 확인하세요. API Key는 worker 환경변수 OPENTOPOGRAPHY_API_KEY 또는 읽기 전용 비밀 파일로 제공하고 채팅/URL 예시/커밋에 기록하지 않습니다.
