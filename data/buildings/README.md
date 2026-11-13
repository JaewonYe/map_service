# 등록 건물 데이터

건물명·설명·분류·주소·연락처·URL·좌표를 건물 ID별 JSON 파일로 저장합니다.
실제 등록 파일은 Git과 Docker 이미지에 포함되지 않습니다.

Docker는 이 폴더를 `/data/buildings`에 읽기/쓰기 마운트합니다.
개발 서버는 `BUILDINGS_DIR`(기본 `data/buildings`)을 사용합니다.
서버 이전/백업은 서비스를 종료한 뒤 이 폴더의 JSON 파일 전체를 복사하세요.
Ubuntu에서는 컨테이너의 node 사용자(UID 1000)가 폴더에 쓸 수 있어야 합니다.
