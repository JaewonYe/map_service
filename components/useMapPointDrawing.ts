'use client';
import {useEffect} from 'react';
import type L from 'leaflet';
import type {Coordinate} from '../lib/map-measure';

const drawingMaps = new WeakMap<L.Map, {count: number; restoreZoom: boolean}>();

/** Shared map drawing lifecycle for temporary measurements and saved facility drafts. */
export function useMapPointDrawing(map: L.Map, active: boolean, onPoint: (point: Coordinate) => void) {
  useEffect(() => {
    if (!active) return;
    const container = map.getContainer();
    const state = drawingMaps.get(map) || {count: 0, restoreZoom: map.doubleClickZoom.enabled()};
    state.count++; drawingMaps.set(map, state);
    container.classList.add('measurement-drawing'); map.doubleClickZoom.disable();
    const add = (event: L.LeafletMouseEvent) => onPoint([event.latlng.lat, event.latlng.lng]);
    map.on('click', add);
    return () => {
      map.off('click', add); state.count--;
      if (!state.count) {
        container.classList.remove('measurement-drawing'); drawingMaps.delete(map);
        if (state.restoreZoom) map.doubleClickZoom.enable();
      }
    };
  }, [map, active, onPoint]);
}
