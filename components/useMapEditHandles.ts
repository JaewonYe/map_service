'use client';
import {useEffect, useRef} from 'react';
import L from 'leaflet';
import type {Coordinate} from '../lib/map-measure';

type Options = {scope?: 'osm'; points: Coordinate[]; selected: number | null; disabled: boolean; insert?: (after: number, point: Coordinate) => void;
  select: (index: number) => void; start: (index: number) => void; move: (index: number, point: Coordinate) => void; end: (index: number, point: Coordinate) => void; position?: boolean};
/** Keep Leaflet marker instances alive while React updates the live drag preview. */
export function useMapEditHandles(map: L.Map, options: Options) {
  const latest = useRef(options), handles = useRef<L.Marker[]>([]), inserts = useRef<L.Marker[]>([]);
  useEffect(() => {latest.current = options;});
  const canInsert = !!options.insert;
  useEffect(() => {
    if (options.disabled) return;
    const group = L.layerGroup().addTo(map);
    handles.current = options.points.map((point, index) => {
      const icon = L.divIcon({className: options.position ? 'facility-position-handle' : 'facility-boundary-vertex', iconSize: [44,44], iconAnchor:[22,22],
        html: `<span aria-hidden="true">${options.position ? '이동' : index + 1}</span>`});
      const marker = L.marker([point[0],point[1]], {icon, zIndexOffset:1000, draggable:true, autoPan:true, keyboard:true, bubblingMouseEvents:false, autoPanOnFocus:false}).addTo(group);
      marker.on('click', () => latest.current.select(index));
      marker.on('dragstart', () => latest.current.start(index));
      marker.on('drag', () => {const p=marker.getLatLng();latest.current.move(index,[p.lat,p.lng]);});
      marker.on('dragend', () => {const p=marker.getLatLng();latest.current.end(index,[p.lat,p.lng]);});
      const element=marker.getElement()!;element.setAttribute('aria-label',options.position?(options.scope==='osm'?'미저장 지도 지점 이동':'미저장 시설 지점 이동'):`${index+1}번 ${options.scope==='osm'?'지도':'경계'} 정점 선택·이동`);
      element.addEventListener('keydown', event=>{if(event.key===' '){event.preventDefault();event.stopPropagation();latest.current.select(index);}});
      return marker;
    });
    if(canInsert && options.points.length>=3) inserts.current=options.points.map((point,index)=>{
      const next=options.points[(index+1)%options.points.length];
      const marker=L.marker([(point[0]+next[0])/2,(point[1]+next[1])/2],{icon:L.divIcon({className:'facility-boundary-insert',iconSize:[44,44],iconAnchor:[22,22],html:'<span aria-hidden="true">+</span>'}),bubblingMouseEvents:false,keyboard:true,autoPanOnFocus:false}).addTo(group);
      const insert=()=>{const p=marker.getLatLng();latest.current.insert?.(index,[p.lat,p.lng]);};
      marker.on('click',insert);
      const element=marker.getElement()!;element.setAttribute('aria-label',`${index+1}번 ${options.scope==='osm'?'지도 변':'변'}에 정점 삽입`);
      element.addEventListener('keydown',event=>{if(event.key===' '){event.preventDefault();event.stopPropagation();insert();}});
      return marker;
    });
    return()=>{group.remove();handles.current=[];inserts.current=[];};
  // Coordinates/selection are reconciled below, without destroying a dragging marker.
  },[map,options.points.length,options.disabled,options.position,options.scope,canInsert]);
  useEffect(()=>{
    handles.current.forEach((marker,index)=>{
      const p=options.points[index];if(p)marker.setLatLng([p[0],p[1]]);
      marker.getElement()?.setAttribute('aria-pressed',String(options.selected===index));
    });
    inserts.current.forEach((marker,index)=>{const p=options.points[index],q=options.points[(index+1)%options.points.length];if(p&&q)marker.setLatLng([(p[0]+q[0])/2,(p[1]+q[1])/2]);});
  },[options.points,options.selected,options.disabled,canInsert]);
}
