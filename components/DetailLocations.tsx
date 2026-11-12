'use client';

import {useState} from 'react';
import L from 'leaflet';
import type {SourceInfo} from '../lib/tiles/catalog';

export default function DetailLocations({map, sources}: {map: L.Map; sources: SourceInfo[]}) {
  const locations = sources.filter(source => source.role === 'detail');
  const [expanded, setExpanded] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = locations.find(source => source.id === selectedId);

  function goTo(source: SourceInfo) {
    if (source.status !== 'ready' || !source.bounds) return;
    const b = source.bounds;
    map.fitBounds(L.latLngBounds([b.south, b.west], [b.north, b.east]), {
      padding: [28, 28], maxZoom: Math.min(map.getMaxZoom(), source.maxZoom), animate: false
    });
    setSelectedId(source.id); setExpanded(false);
    map.getContainer().focus({preventScroll: true});
  }

  return <details className="detail-locations" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>상세 지역 {locations.length}개{selected && ` · ${selected.name || selected.id}`}</summary>
    {!locations.length ? <p className="detail-locations-empty">등록된 상세 지역이 없습니다.</p> :
      <ul className="detail-location-list" aria-label="상세 지역 목록">
        {locations.map(source => {
          const available = source.status === 'ready' && Boolean(source.bounds);
          const label = source.name || source.id;
          const status = source.status === 'disabled' ? '비활성' : !available ? '위치 확인 불가' :
            source.usageConfirmed ? '이동' : '메타데이터만';
          return <li key={source.id}>
            <button type="button" disabled={!available} aria-label={`${label} 위치로 이동`}
              aria-current={selectedId === source.id ? 'location' : undefined}
              title={available ? `${label}의 전체 경계로 이동` : source.error || status}
              onClick={() => goTo(source)}>
              <span className="detail-location-name">{label}</span>
              <span className="detail-location-meta">Zoom {source.minZoom}–{source.maxZoom} · {status}</span>
            </button>
          </li>;
        })}
      </ul>}
  </details>;
}
