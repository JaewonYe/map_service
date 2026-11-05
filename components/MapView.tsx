'use client';

import dynamic from 'next/dynamic';

// Leaflet accesses window/document; never import the canvas on the server.
const MapCanvas = dynamic(() => import('./MapCanvas'), {
  ssr: false,
  loading: () => <p role="status">지도를 준비하고 있습니다…</p>
});

export default function MapView() {
  return <MapCanvas />;
}
