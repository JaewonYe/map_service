# 이전 영상 아카이브

기존 `taean/esri/`의 `source/`, `processed/`, `manifest.json`은 보관용입니다.
현재 TPK 서비스는 이 경로를 읽지 않으며, 기존 데이터는 삭제하지 않습니다.

새로 받은 TPK 원본은 `data/tpk/map.tpk`에 복사하세요.
설정·메타데이터 검사·서버 이전 절차는 프로젝트 루트의 `README.md`를 참고하세요.

## 공식 export 다운로드 원본

지도 다운로드 worker/태안 CLI는 World Imagery (for Export)의 검증된 TPK를 이 폴더의 요청·내용 해시 파일명으로 추가합니다. 예전 아카이브와 사용자 파일은 덮어쓰지 않습니다. 준비된 사본은 data/downloads/packages에 별도로 등록하므로 새 다운로드를 수동으로 data/tpk/map.tpk에 덮어쓸 필요가 없습니다.

ArcGIS 계정의 export 권한과 Next.js/Leaflet 오프라인 표시·이전 허용 범위는 별도로 확인합니다. 토큰은 worker 전용 환경변수/비밀 파일로 제공하며 여기나 manifest에 저장하지 않습니다. 같은 요청의 검증된 기존 파일은 재사용하고 명시적 다시 받기는 새 내용 파일을 보존합니다.
