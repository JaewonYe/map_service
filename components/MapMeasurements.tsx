'use client';

import {useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent} from 'react';
import L from 'leaflet';
import {areaSquareMeters, distanceMeters, formatArea, formatDistance, isSelfIntersecting, segmentMeters, type Coordinate} from '../lib/map-measure';

type Kind = 'distance' | 'area';
type ContextMenu = {point: Coordinate; x: number; y: number};
export default function MapMeasurements({map, onRegisterBuilding}: {map: L.Map; onRegisterBuilding: (point: Coordinate) => void}) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [selectingFacility, setSelectingFacility] = useState(false);
  const [points, setPoints] = useState<Coordinate[]>([]);
  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const menuElement = useRef<HTMLDivElement>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const invalid = useMemo(() => kind === 'area' && isSelfIntersecting(points), [kind, points]);
  const distance = useMemo(() => distanceMeters(points), [points]);
  const area = useMemo(() => kind === 'area' && !invalid ? areaSquareMeters(points) : 0, [kind, invalid, points]);
  const perimeter = kind === 'area' && points.length >= 3 ? distance + segmentMeters(points.at(-1)!, points[0]) : 0;
  const ready = kind === 'distance' ? points.length >= 2 : kind === 'area' && points.length >= 3 && !invalid && area > 0;

  useEffect(() => {
    if (!selectingFacility) return;
    const container = map.getContainer();
    container.classList.add('facility-selecting');
    const select = (event: L.LeafletMouseEvent) => {
      setSelectingFacility(false); onRegisterBuilding([event.latlng.lat, event.latlng.lng]);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setSelectingFacility(false);
    };
    map.on('click', select); document.addEventListener('keydown', escape);
    return () => {
      map.off('click', select); document.removeEventListener('keydown', escape);
      container.classList.remove('facility-selecting');
    };
  }, [map, selectingFacility, onRegisterBuilding]);

  useEffect(() => {
    const group = L.layerGroup().addTo(map); layer.current = group;
    return () => {group.remove(); layer.current = null;};
  }, [map]);

  useEffect(() => {
    const open = (event: L.LeafletMouseEvent) => {
      event.originalEvent.preventDefault();
      const rect = map.getContainer().getBoundingClientRect();
      setMenu({point: [event.latlng.lat, event.latlng.lng],
        x: rect.left + event.containerPoint.x, y: rect.top + event.containerPoint.y});
    };
    const close = () => setMenu(null);
    map.on('contextmenu', open); map.on('movestart zoomstart resize', close);
    return () => {map.off('contextmenu', open); map.off('movestart zoomstart resize', close);};
  }, [map]);

  useLayoutEffect(() => {
    if (!menu || !menuElement.current) return;
    const rect = map.getContainer().getBoundingClientRect(), size = menuElement.current.getBoundingClientRect();
    const left = Math.max(8, rect.left + 8), top = Math.max(8, rect.top + 8);
    const x = Math.max(left, Math.min(menu.x, Math.min(rect.right, window.innerWidth) - size.width - 8));
    const y = Math.max(top, Math.min(menu.y, Math.min(rect.bottom, window.innerHeight) - size.height - 8));
    if (x !== menu.x || y !== menu.y) setMenu({...menu, x, y});
    menuElement.current.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({preventScroll: true});
  }, [map, menu]);

  useEffect(() => {
    if (!menu) return;
    const outside = (event: PointerEvent) => {
      if (!menuElement.current?.contains(event.target as Node)) setMenu(null);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); setMenu(null); map.getContainer().focus({preventScroll: true});
      }
    };
    const close = () => setMenu(null);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', close, true);
    };
  }, [map, menu]);

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

  function start(next: Kind, first?: Coordinate) {setSelectingFacility(false); setMenu(null); setKind(next); setPoints(first ? [first] : []); setDrawing(true);}
  function stop() {setSelectingFacility(false); setMenu(null); setDrawing(false);}
  function undo() {setSelectingFacility(false); setMenu(null); setPoints(previous => previous.slice(0, -1)); if (kind) setDrawing(true);}
  function clear() {setSelectingFacility(false); setMenu(null); setDrawing(false); setKind(null); setPoints([]);}
  function navigateMenu(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
        (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === 'Tab') {
      event.preventDefault(); setMenu(null); map.getContainer().focus({preventScroll: true});
    }
  }

  return <><aside className="map-measurements" aria-label="거리와 면적 측정">
    <div className="facility-tools">
      <button type="button" aria-pressed={selectingFacility} onClick={() => {setMenu(null); setDrawing(false); setSelectingFacility(value => !value);}}>시설·건물 추가</button>
      {selectingFacility && <button type="button" onClick={() => setSelectingFacility(false)}>위치 선택 취소</button>}
    </div>
    <p className="measurement-help" role="status">{selectingFacility ? '지도에서 등록할 위치를 선택하세요. Esc로 취소할 수 있습니다.' : '시설·건물을 추가하고 마커를 눌러 정보를 확인하세요.'}</p>
    <strong>거리·면적 측정</strong>
    <div className="measurement-buttons" role="group" aria-label="측정 도구">
      <button type="button" aria-pressed={!drawing && !selectingFacility} onClick={stop}>이동</button>
      <button type="button" aria-pressed={drawing && kind === 'distance'} onClick={() => start('distance')}>거리</button>
      <button type="button" aria-pressed={drawing && kind === 'area'} onClick={() => start('area')}>면적</button>
    </div>
    <p className="measurement-help">{drawing ? (kind === 'distance' ? '지도를 차례로 클릭해 경로를 선택하세요.' : '경계를 따라 점을 선택하세요. 마지막 변은 자동 연결됩니다.') : kind ? '측정 결과가 유지됩니다. 지도를 이동하거나 새 측정을 시작하세요.' : '지도 우클릭 또는 측정 버튼으로 거리·면적 측정을 시작하세요.'}</p>
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
  </aside>
    {menu && <div ref={menuElement} role="menu" aria-label="지도 메뉴" className="map-context-menu"
      style={{left: menu.x, top: menu.y, maxWidth: Math.max(0, map.getSize().x - 16)}}
      onKeyDown={navigateMenu} onContextMenu={event => event.preventDefault()}>
      <button type="button" role="menuitem" onClick={() => start('distance', menu.point)}>거리 측정 시작</button>
      <button type="button" role="menuitem" onClick={() => start('area', menu.point)}>면적 측정 시작</button>
      <button type="button" role="menuitem" onClick={() => {const point = menu.point; stop(); onRegisterBuilding(point);}}>시설·건물 정보 등록</button>
    </div>}
  </>;
}
