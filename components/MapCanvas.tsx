'use client';

import { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import { mapConfig } from '../lib/map-config';
import { mapStyle } from '../lib/map-style';

export default function MapCanvas() {
  const container = useRef<HTMLDivElement>(null);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
    let map: Map;
    try {
      map = new Map({
        container: container.current,
        style: mapStyle,
        center: [mapConfig.center[1], mapConfig.center[0]],
        zoom: mapConfig.zoom,
        minZoom: mapConfig.minZoom,
        maxZoom: mapConfig.maxZoom
      });
    } catch {
      setTileError(true);
      return;
    }
    map.addControl(new NavigationControl(), 'top-right');
    map.on('error', event => {
      console.error('Map rendering failed:', event.error);
      setTileError(true);
    });
    map.on('sourcedata', event => {
      if (event.sourceId === 'osm' && event.sourceDataType === 'content') setTileError(false);
    });
    return () => { map.remove(); };
  }, []);

  return <>
    <div ref={container} id="map" aria-label="OpenStreetMap 지도" />
    {tileError && <p className="map-status" role="status">
      지도를 불러오지 못했습니다. 벡터 타일 생성·서버 상태와 WebGL 지원을 확인하세요.
    </p>}
  </>;
}
