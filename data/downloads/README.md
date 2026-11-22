# 지도 다운로드 작업 데이터

작업 요청·상태·원본 캐시·검증된 패키지·ZIP·활성 레지스트리를 별도로 저장합니다. 실제 데이터는 Git에 추가하지 않습니다. MAP_DOWNLOADS_DIR(Node/worker), MAP_DOWNLOADS_HOST_DIR(Compose bind)를 같은 위치에 맞추고 쓰는 worker는 하나만 운영합니다. 기존 OSM edits/facility 데이터는 여기에 이동하지 않습니다.

Compose: docker compose --profile downloads up -d --build. 로컬 Python worker는 /usr/bin/python3 scripts/downloads/worker.py이며 GDAL/NumPy/Shapely/osmium-tool이 필요합니다. 제공처 접속과 데이터 사용 조건은 별도 확인합니다. ArcGIS export 토큰은 worker에만 읽기 전용 비밀 파일로 제공하세요.

active.json 변경 전 전체 폴더를 백업하세요. 손상 파일은 보존하고 worker를 중지한 뒤 백업본을 복구합니다. 원본 캐시와 terminal 작업 로그는 자동 삭제하지 않으므로 백업 후 명시적으로 정리합니다. 전체 사용·한도·오프라인 이전은 docs/DOWNLOAD_MANAGER.md를 참조합니다.
