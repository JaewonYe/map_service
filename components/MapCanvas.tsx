'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Map, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import { mapConfig } from '../lib/map-config';
import { mapStyle } from '../lib/map-style';

type Imagery = {
  id: string; label: string; ready: boolean; nominal_resolution_m?: number;
  bbox?: [number, number, number, number]; minzoom?: number; maxzoom?: number;
  attribution?: string; dates?: string[]; partial?: boolean; coverage?: number; coverage_scope?: string;
};

type Camera = { center: [number, number]; zoom: number; bearing: number; pitch: number };
type PanelProps = { fixedMode?: string; initialCamera: Camera; onReady: (map: Map) => void; onDispose: (map: Map) => void; onMetadata: (entries: Imagery[]) => void };

function MapPanel({ fixedMode, initialCamera, onReady, onDispose, onMetadata }: PanelProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [tileError, setTileError] = useState(false);
  const [imageryError, setImageryError] = useState(false);
  const [imagery, setImagery] = useState<Imagery[]>([]);
  const [mode, setMode] = useState('osm');
  const [overlay, setOverlay] = useState(true);

  useEffect(() => {
    if (!container.current) return;
    setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
    let map: Map;
    try {
      map = new Map({ container: container.current, style: mapStyle,
        minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom, ...initialCamera });
    } catch { setTileError(true); return; }
    mapRef.current = map;
    onReady(map);
    const abort = new AbortController();
    map.addControl(new NavigationControl(), 'top-right');
    map.on('error', event => {
      console.error('Map rendering failed:', event.error);
      if ((event as { sourceId?: string }).sourceId?.startsWith('image-')) setImageryError(true);
      else setTileError(true);
    });
    map.on('sourcedata', event => {
      if (event.sourceDataType === 'content') {
        if (event.sourceId === 'osm') setTileError(false);
        if (event.sourceId?.startsWith('image-')) setImageryError(false);
      }
    });
    map.on('style.load', async () => {
      try {
        const response = await fetch('/imagery/metadata.json', { signal: abort.signal });
        if (!response.ok) return;
        const metadata: { datasets: Imagery[] } = await response.json();
        if (abort.signal.aborted) return;
        for (const entry of metadata.datasets) {
          if (!entry.ready) continue;
          const id = `image-${entry.id}`;
          map.addSource(id, { type: 'raster', tiles: [`/imagery/${entry.id}/{z}/{x}/{y}.png`],
            tileSize: 256, bounds: entry.bbox, minzoom: entry.minzoom,
            maxzoom: entry.maxzoom, attribution: entry.attribution });
          map.addLayer({ id, type: 'raster', source: id,
            layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0 } }, 'water');
        }
        setImagery(metadata.datasets);
        setMode(fixedMode || metadata.datasets.find(entry => entry.ready)?.id || 'osm');
        onMetadata(metadata.datasets);
      } catch (error) {
        if (!abort.signal.aborted) console.warn('Local satellite imagery is unavailable:', error);
      }
    });
    return () => { abort.abort(); mapRef.current = null; onDispose(map); map.remove(); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('water')) return;
    for (const entry of imagery) {
      const id = `image-${entry.id}`;
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', mode === entry.id ? 'visible' : 'none');
    }
    map.setLayoutProperty('water', 'visibility', mode === 'osm' ? 'visible' : 'none');
    for (const layer of ['roads', 'buildings']) {
      map.setLayoutProperty(layer, 'visibility', mode === 'osm' || overlay ? 'visible' : 'none');
    }
  }, [mode, overlay, imagery]);

  const selected = imagery.find(entry => entry.id === mode);
  return <section className="map-panel">
    <div ref={container} className="map-canvas" aria-label="태안군 지도" />
    <div className="map-options">
      {fixedMode ? <strong>{selected?.label || fixedMode}</strong> : <label>지도 종류 <select aria-label="지도 종류" value={mode} onChange={event => setMode(event.target.value)}>
        <option value="osm">일반 지도</option>
        {imagery.map(entry => <option key={entry.id} value={entry.id} disabled={!entry.ready}>
          {entry.label}{!entry.ready ? ' (데이터 준비 필요)' : ''}
        </option>)}
      </select></label>}
      {mode !== 'osm' && <>
        <label><input type="checkbox" checked={overlay} onChange={event => setOverlay(event.target.checked)} /> 도로·건물 표시</label>
        <small>{selected?.label}{selected?.nominal_resolution_m ? ` 약 ${selected.nominal_resolution_m}m` : ''} · {selected?.dates?.join(', ')}</small>
        {selected?.partial && <small className="coverage-warning">일부 영상 누락 · 유효 픽셀 {((selected.coverage || 0)*100).toFixed(1)}% ({selected.coverage_scope === 'county_boundary' ? '군 경계' : '사각형 범위'}) · 누락 영역은 투명 표시</small>}
        {mode === 'ndvi' && <small>NDVI: −1 (물·낮은 값) → +1 (높은 식생 반응)</small>}
      </>}
    </div>
    {(tileError || (mode !== 'osm' && imageryError)) && <p className="map-status" role="status">
      지도를 불러오지 못했습니다. 벡터 타일 생성·위성영상 서버 상태와 WebGL 지원을 확인하세요.
    </p>}
  </section>;
}


export default function MapCanvas() {
  const [compare, setCompare] = useState(false);
  const [canCompare, setCanCompare] = useState(false);
  const maps = useRef(new Set<Map>());
  const syncing = useRef(false);
  const camera = useRef<Camera>({ center: [mapConfig.center[1], mapConfig.center[0]], zoom: mapConfig.zoom, bearing: 0, pitch: 0 });
  const onReady = useCallback((map: Map) => {
    maps.current.add(map);
    map.on('move', () => {
      if (syncing.current) return;
      const center = map.getCenter();
      camera.current = { center: [center.lng, center.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
      syncing.current = true;
      try { for (const other of maps.current) if (other !== map) other.jumpTo(camera.current); }
      finally { syncing.current = false; }
    });
  }, []);
  const onDispose = useCallback((map: Map) => { maps.current.delete(map); }, []);
  const onMetadata = useCallback((entries: Imagery[]) => {
    setCanCompare(['rgb', 'infrared', 'ndvi'].every(id => entries.some(entry => entry.id === id && entry.ready)));
  }, []);
  const modes = compare ? ['rgb', 'infrared', 'ndvi'] : [undefined];
  return <div className="map-workspace">
    <button className="compare-toggle" disabled={!compare && !canCompare} onClick={() => setCompare(value => !value)}>
      {compare ? '단일 지도 보기' : '세 영상 나란히 비교'}
    </button>
    <div className={compare ? 'comparison-grid' : 'single-map'}>
      {modes.map(mode => <MapPanel key={mode || 'single'} fixedMode={mode} initialCamera={camera.current}
        onReady={onReady} onDispose={onDispose} onMetadata={onMetadata} />)}
    </div>
  </div>;
}
