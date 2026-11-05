'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { mapConfig } from '../lib/map-config';

export default function MapCanvas() {
  const container = useRef<HTMLDivElement>(null);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, {
      minZoom: mapConfig.minZoom,
      maxZoom: mapConfig.maxZoom
    }).setView(mapConfig.center, mapConfig.zoom);
    const osm = L.tileLayer('/tile/{z}/{x}/{y}.png', {
      maxZoom: mapConfig.maxZoom,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    let failed = false;
    osm.on('loading', () => { failed = false; });
    osm.on('tileerror', () => { failed = true; setTileError(true); });
    osm.on('load', () => { if (!failed) setTileError(false); });
    osm.addTo(map);
    // Add future imagery providers as independent base layers here.
    L.control.layers({ OpenStreetMap: osm }).addTo(map);
    // Required for navigation, hot reload, and React Strict Mode remounts.
    return () => { map.remove(); };
  }, []);

  return <>
    <div ref={container} id="map" aria-label="OpenStreetMap 지도" />
    {tileError && <p className="map-status" role="status">
      지도 타일을 불러오지 못했습니다. 데이터 가져오기 및 타일 서버 상태를 확인하세요.
    </p>}
  </>;
}
