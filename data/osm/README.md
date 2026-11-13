# OpenStreetMap 일반 지도

1. Geofabrik 대한민국 원본을 `south-korea.osm.pbf` 또는 다운로드한 이름 그대로 `south-korea-latest.osm.pbf`로 이 폴더에 둡니다.
2. Docker Desktop/Engine을 실행한 뒤 `실행.cmd`의 **3번**을 실행합니다. 새 PBF를 감지하면 최초 준비 후 개발 서버가 시작됩니다. `npm run dev`도 같은 사전 준비를 수행합니다.
3. http://localhost:3001 에서 **일반 지도**를 선택합니다. 위성 TPK가 없어도 일반 지도만 실행할 수 있습니다.

**2번 Docker 시작**도 새 PBF를 자동 준비합니다. **7번 OSM 일반 지도 준비·갱신**은 명시적으로 다시 변환할 때 사용합니다. **6번은 별도 DEM 고도 지도용**입니다.

첫 준비에는 작업 이미지 빌드를 위한 인터넷이 필요할 수 있습니다. 변환 자체와 지도 런타임은 로컬 파일만 사용합니다. 준비된 데이터·도구 이미지가 있으면 오프라인에서도 재사용합니다.

```text
data/osm/
├── south-korea.osm.pbf        # 원본, 변경하지 않음
├── metadata.json             # 경계·원본 SHA256·파일 변경 정보·데이터 경로
└── sets/<id>/map.sqlite       # 도로·건물·지명·지형 도형 + 공간 색인
```

Next.js가 색인에서 필요한 도형을 조회해 EPSG:3857 / 256px PNG를 생성합니다. 줌 0–19를 지원하며, 모든 줌의 전국 이미지 타일을 미리 저장하지 않습니다. 도로·건물·한글 우선 지명·공원·산림·수면·해안선의 간단한 로컬 스타일이며 openstreetmap.org의 표준 스타일과 동일한 디자인은 아닙니다. 원본에 없는 지명·건물은 표시되지 않습니다. 잘린 PBF의 열린 해안선 끝은 데이터 외곽에 연결해 육지를 구성하므로 경계 부근의 해안 표시는 원본 추출 범위에 영향을 받습니다.

원본 갱신은 PBF 파일 교체 후 메뉴 2/3으로 다시 실행하면 됩니다. 준비가 성공해야 metadata.json을 교체하므로 실패하면 기존 세트를 보존합니다. 명시적 재변환은 메뉴 7입니다. 이전 sets는 남겨두며, 서비스 중지 후 metadata.json이 참조하지 않는 세트만 수동 정리하세요.

이 폴더 전체를 백업·이전하세요. 건물 등록 정보는 별도의 data/buildings에 보관되어 PBF 갱신의 영향을 받지 않습니다. 원본과 색인 DB는 Docker 이미지에 포함하지 않습니다. DB를 직접 수정하지 마세요.

OSM은 [ODbL](https://www.openstreetmap.org/copyright)로 제공됩니다. 화면에 © OpenStreetMap contributors 출처 링크를 표시합니다. 기존 OSM_USAGE_CONFIRMED는 직접 준비한 XYZ 이미지 타일에 적용되며 이 변환 도구의 OSM 데이터는 생성 메타데이터를 사용합니다.
