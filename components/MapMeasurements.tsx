'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import L from 'leaflet';
import {areaSquareMeters, distanceMeters, formatArea, formatDistance, isSelfIntersecting, segmentMeters, type Coordinate} from '../lib/map-measure';

type Kind = 'distance' | 'area';
export default function MapMeasurements({map}: {map: L.Map}) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState<Coordinate[]>([]);
  const layer = useRef<L.LayerGroup | null>(null);
  const invalid = useMemo(() => kind === 'area' && isSelfIntersecting(points), [kind, points]);
  const distance = useMemo(() => distanceMeters(points), [points]);
  const area = useMemo(() => kind === 'area' && !invalid ? areaSquareMeters(points) : 0, [kind, invalid, points]);
  const perimeter = kind === 'area' && points.length >= 3 ? distance + segmentMeters(points.at(-1)!, points[0]) : 0;
  const ready = kind === 'distance' ? points.length >= 2 : kind === 'area' && points.length >= 3 && !invalid && area > 0;

  useEffect(() => {
    const group = L.layerGroup().addTo(map); layer.current = group;
    return () => {group.remove(); layer.current = null;};
  }, [map]);

  useEffect(() => {
    if (!drawing) return;
    const container = map.getContainer(), restoreZoom = map.doubleClickZoom.enabled();
    container.classList.add('measurement-drawing'); map.doubleClickZoom.disable();
    const add = (event: L.LeafletMouseEvent) => {
      const point: Coordinate = [event.latlng.lat, event.latlng.lng];
      setPoints(previous => previous.length && segmentMeters(previous.at(-1)!, point) < 0.01 ? previous : [...previous, point]);
    };
    map.on('click', add);
    return () => {
      map.off('click', add); container.classList.remove('measurement-drawing');
      if (restoreZoom) map.doubleClickZoom.enable();
    };
  }, [map, drawing]);

  useEffect(() => {
    const group = layer.current; if (!group) return; group.clearLayers();
    const coordinates = points.map(point => L.latLng(point[0], point[1]));
    if (coordinates.length >= 2) {
      const options = {color: invalid ? '#b91c1c' : '#087f8c', weight: 3, interactive: false};
      if (kind === 'area' && coordinates.length >= 3) {
        L.polygon(coordinates, {...options, fillOpacity: 0.2, className: 'measurement-polygon'}).addTo(group);
      } else L.polyline(coordinates, {...options, className: 'measurement-line'}).addTo(group);
    }
    coordinates.forEach((point, index) => {
      L.circleMarker(point, {radius: 4, color: '#087f8c', fillColor: '#fff', fillOpacity: 1, weight: 2,
        interactive: false, className: 'measurement-vertex'}).bindTooltip(String(index + 1), {permanent: true, direction: 'top', className: 'measurement-label'}).addTo(group);
    });
  }, [map, points, kind, invalid]);

  function start(next: Kind) {setKind(next); setPoints([]); setDrawing(true);}
  function stop() {setDrawing(false);}
  function undo() {setPoints(previous => previous.slice(0, -1)); if (kind) setDrawing(true);}
  function clear() {setDrawing(false); setKind(null); setPoints([]);}

  return <aside className="map-measurements" aria-label="거리와 면적 측정">
    <strong>거리·면적 측정</strong>
    <div className="measurement-buttons" role="group" aria-label="측정 도구">
      <button type="button" aria-pressed={!drawing} onClick={stop}>이동</button>
      <button type="button" aria-pressed={drawing && kind === 'distance'} onClick={() => start('distance')}>거리</button>
      <button type="button" aria-pressed={drawing && kind === 'area'} onClick={() => start('area')}>면적</button>
    </div>
    <p className="measurement-help">{drawing ? (kind === 'distance' ? '지도를 차례로 클릭해 경로를 선택하세요.' : '경계를 따라 점을 선택하세요. 마지막 변은 자동 연결됩니다.') : kind ? '측정 결과가 유지됩니다. 지도를 이동하거나 새 측정을 시작하세요.' : '거리 또는 면적을 선택한 뒤 지도를 클릭하세요.'}</p>
    <div data-testid="measurement-points">선택한 점: {points.length}개</div>
    <output data-testid="measurement-result" aria-live="polite">
      {kind === 'distance' ? `거리: ${formatDistance(distance)}` : kind === 'area' ? `면적: ${points.length >= 3 && !invalid ? formatArea(area) : '—'}` : '측정값: —'}
    </output>
    {kind === 'area' && points.length >= 3 && <div>둘레: {formatDistance(perimeter)}</div>}
    {invalid && <p className="measurement-error" role="alert">선이 서로 교차합니다. 마지막 점을 취소하고 다시 선택하세요.</p>}
    <div className="measurement-buttons">
      <button type="button" onClick={stop} disabled={!drawing || !ready}>측정 완료</button>
      <button type="button" onClick={undo} disabled={!points.length}>마지막 점 취소</button>
      <button type="button" onClick={clear} disabled={!kind}>초기화</button>
    </div>
  </aside>;
}
