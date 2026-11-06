import type { StyleSpecification } from 'maplibre-gl';

// Entire style is local. No glyphs/sprites/terrain/shapefiles are requested.
export const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'vector',
      tiles: ['/tile/{z}/{x}/{y}.pbf'],
      minzoom: 6,
      maxzoom: 14,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f4f1e9' } },
    { id: 'water', type: 'fill', source: 'osm', 'source-layer': 'water', paint: { 'fill-color': '#a7d4ec' } },
    { id: 'buildings', type: 'fill', source: 'osm', 'source-layer': 'buildings', paint: { 'fill-color': '#c7b8a5', 'fill-outline-color': '#aa9985' } },
    { id: 'roads', type: 'line', source: 'osm', 'source-layer': 'roads', paint: {
      'line-color': '#cf9644',
      'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 14, 2, 19, 8]
    } }
  ]
};
