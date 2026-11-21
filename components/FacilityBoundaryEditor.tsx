'use client';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import L from 'leaflet';
import type {Building} from '../lib/buildings/model';
import {boundaryFromPoints, boundaryMetrics, boundaryPoint, boundaryPoints, MAX_BOUNDARY_VERTICES} from '../lib/buildings/boundary';
import {formatArea, formatDistance, segmentMeters, type Coordinate} from '../lib/map-measure';
import {useMapPointDrawing} from './useMapPointDrawing';

type Props = {map: L.Map; building: Building; onSaved: (value: Building) => void; onCancel: () => void; onBusy: (busy: boolean) => void};
export default function FacilityBoundaryEditor({map, building, onSaved, onCancel, onBusy}: Props) {
  // The snapshot and its version belong to this editor instance, never to the latest selection.
  const [points, setPoints] = useState<Coordinate[]>(() => building.boundary ? boundaryPoints(building.boundary) : []);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [latitude, setLatitude] = useState(''), [longitude, setLongitude] = useState('');
  const alive = useRef(false), saving = useRef(false), controller = useRef<AbortController | null>(null);
  const panel = useRef<HTMLElement>(null), errorElement = useRef<HTMLParagraphElement>(null);
  const preview = useMemo(() => {
    try {const boundary = boundaryFromPoints(points); return {boundary, metrics: boundaryMetrics(boundary), error: ''};}
    catch (error) {return {boundary: null, metrics: null, error: error instanceof Error ? error.message : '경계를 확인하세요.'};}
  }, [points]);
  const dirty = JSON.stringify(points) !== JSON.stringify(building.boundary ? boundaryPoints(building.boundary) : []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {event.preventDefault(); event.returnValue = '';};
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {if (error) errorElement.current?.focus({preventScroll: false});}, [error]);
  const addPoint = useCallback((point: Coordinate) => {
    if (saving.current) return;
    try {
      const normalized = boundaryPoint(point);
      setPoints(previous => previous.length >= MAX_BOUNDARY_VERTICES || previous.length && segmentMeters(previous.at(-1)!, normalized) < 0.01
        ? previous : [...previous, normalized]); setError('');
    } catch (error) {setError(error instanceof Error ? error.message : '좌표를 확인하세요.');}
  }, []);
  useMapPointDrawing(map, !busy, addPoint);
  useEffect(() => {
    alive.current = true; panel.current?.focus({preventScroll: true});
    return () => {alive.current = false; controller.current?.abort(); map.getContainer().focus({preventScroll: true});};
  }, [map]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {if (event.key === 'Escape' && !saving.current) {event.preventDefault(); onCancel();}};
    document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape);
  }, [onCancel]);
  useEffect(() => {
    const color = getComputedStyle(map.getContainer()).getPropertyValue('--color-danger').trim();
    const group = L.layerGroup().addTo(map), coordinates = points.map(([lat, lon]) => L.latLng(lat, lon));
    if (coordinates.length >= 2) {
      const options = {color, weight: 3, dashArray: '7 5', interactive: false, className: 'facility-boundary-draft'};
      if (coordinates.length >= 3) L.polygon(coordinates, {...options, fillOpacity: 0.12}).addTo(group);
      else L.polyline(coordinates, options).addTo(group);
    }
    coordinates.forEach((point, index) => L.circleMarker(point, {radius: 5, color, fillColor: 'var(--color-surface)', fillOpacity: 1,
      interactive: false, className: 'facility-boundary-vertex'}).bindTooltip(String(index + 1), {permanent: true, direction: 'top'}).addTo(group));
    return () => {group.remove();};
  }, [map, points]);
  async function save() {
    if (saving.current || !preview.boundary) return;
    saving.current = true; setBusy(true); onBusy(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    try {
      const response = await fetch(`/api/buildings/${building.id}`, {method: 'PUT', signal: abort.signal,
        headers: {'Content-Type': 'application/json', 'If-Match': `"${building.version}"`},
        body: JSON.stringify({...building, boundary: preview.boundary})});
      const body = await response.json();
      if (!response.ok) throw Error(body.error || '경계를 저장하지 못했습니다.');
      if (alive.current) onSaved(body.building);
    } catch (error) {
      if (alive.current) setError(`${error instanceof Error ? error.message : '저장 실패'} 편집 내용은 유지됩니다. 일시 오류는 재시도하고, 버전 충돌은 취소 후 시설을 다시 열어 최신 정보를 확인하세요.`);
    } finally {
      saving.current = false; onBusy(false);
      if (alive.current) setBusy(false);
    }
  }
  return <section ref={panel} tabIndex={-1} className="facility-boundary-editor" aria-label="시설 경계 편집" aria-busy={busy}>
    <div className="boundary-editor-content"><h2>{building.name} · 경계 편집</h2>
    <p>지도에서 경계를 따라 점을 선택하세요. 붉은 점선은 미저장 편집, 청록 실선은 저장된 경계입니다.</p>
    <p role="status" data-testid="boundary-point-count">정점 {points.length} / {MAX_BOUNDARY_VERTICES}개</p>
    <output aria-live="polite">{preview.metrics ? `면적 ${formatArea(preview.metrics.area)} · 둘레 ${formatDistance(preview.metrics.perimeter)}` : preview.error}</output>
    {error && <p ref={errorElement} tabIndex={-1} role="alert" className="building-error">{error}</p>}
    <fieldset disabled={busy}>
      <div className="boundary-actions">
        <button type="button" onClick={() => setPoints([])}>다시 그리기</button>
        <button type="button" disabled={!points.length} onClick={() => setPoints(value => value.slice(0, -1))}>경계 마지막 점 취소</button>
        <button type="button" onClick={() => map.getContainer().focus()}>지도 이동</button>
      </div>
      <details><summary>좌표로 정점 추가·수정</summary>
        <div className="boundary-coordinate-entry">
          <label>정점 위도<input name="boundary-latitude" autoComplete="off" inputMode="decimal" type="number" step="any" min={-85.05112878} max={85.05112878} value={latitude} onChange={e => setLatitude(e.target.value)}/></label>
          <label>정점 경도<input name="boundary-longitude" autoComplete="off" inputMode="decimal" type="number" step="any" min={-180} max={180} value={longitude} onChange={e => setLongitude(e.target.value)}/></label>
        </div>
        <button type="button" disabled={!latitude.trim() || !longitude.trim() || points.length >= MAX_BOUNDARY_VERTICES}
          onClick={() => {addPoint([Number(latitude), Number(longitude)]);}}>정점 추가</button>
        <ol className="boundary-coordinate-list">{points.map((point, index) => <li key={index}>
          <span>{index + 1}: {point[0]}, {point[1]}</span>
          <button type="button" disabled={!latitude.trim() || !longitude.trim()} onClick={() => {
            try {const value = boundaryPoint([Number(latitude), Number(longitude)]); setPoints(previous => previous.map((p, i) => i === index ? value : p)); setError('');}
            catch (error) {setError(error instanceof Error ? error.message : '좌표를 확인하세요.');}
          }}>{index + 1}번 정점 수정</button>
        </li>)}</ol>
      </details>
    </fieldset></div>
      <div className="boundary-editor-footer">
        <button className="boundary-save" type="button" disabled={busy || !preview.boundary} onClick={() => void save()}>{busy ? '경계 저장 중…' : '경계 저장'}</button>
        <button type="button" disabled={busy} onClick={onCancel}>경계 편집 취소</button>
      </div>
    <small>관리용 경계 · 법적 측량 경계 아님 · Esc 취소</small>
  </section>;
}
