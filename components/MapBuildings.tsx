'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import L from 'leaflet';
import {BUILDING_CATEGORIES, FIELD_LIMITS, type Building, type BuildingInput} from '../lib/buildings/model';
import type {Coordinate} from '../lib/map-measure';

async function responseData(response: Response) {
  const body = await response.json();
  if (!response.ok) throw Error(body.error || '건물 정보 요청을 처리하지 못했습니다.');
  return body;
}
type Editor = {building: Building | null; point: Coordinate};
type Props = {map: L.Map; requestedPoint: Coordinate | null; onRequestClosed: () => void};

export default function MapBuildings({map, requestedPoint, onRequestClosed}: Props) {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState('');
  const selectionRequest = useRef(0);
  const listRequest = useRef(0);

  async function load(signal?: AbortSignal) {
    const sequence = ++listRequest.current;
    try {
      const body = await responseData(await fetch('/api/buildings', {signal, cache: 'no-store'}));
      if (!signal?.aborted && sequence === listRequest.current) {setBuildings(body.buildings); setError('');}
    } catch (error) {if (!signal?.aborted && sequence === listRequest.current) setError(error instanceof Error ? error.message : '건물 정보를 불러오지 못했습니다.');}
  }
  useEffect(() => {const abort = new AbortController(); void load(abort.signal); return () => abort.abort();}, []);
  useEffect(() => {
    if (requestedPoint) {selectionRequest.current++; setEditor({building: null, point: requestedPoint});}
  }, [requestedPoint]);

  async function openBuilding(id: string) {
    const sequence = ++selectionRequest.current;
    try {
      const {building} = await responseData(await fetch(`/api/buildings/${id}`, {cache: 'no-store'}));
      if (sequence !== selectionRequest.current) return;
      listRequest.current++;
      setBuildings(previous => previous.map(item => item.id === id ? building : item));
      setEditor({building, point: [building.latitude, building.longitude]}); setError('');
    } catch (error) {if (sequence === selectionRequest.current) setError(error instanceof Error ? error.message : '건물 정보를 불러오지 못했습니다.');}
  }

  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    const icon = L.divIcon({className: 'building-marker', iconSize: [28, 28], iconAnchor: [14, 14],
      html: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="#6941a5" stroke="white" stroke-width="2"/><path d="M8 21V8h12v13M11 11h2m2 0h2m-6 4h2m2 0h2m-4 6v-3h2v3" fill="none" stroke="white" stroke-width="1.6"/></svg>'});
    for (const building of buildings) {
      const text = document.createElement('span'); text.textContent = building.name;
      const marker = L.marker([building.latitude, building.longitude], {icon, keyboard: true, bubblingMouseEvents: false})
        .bindTooltip(text, {direction: 'top', className: 'building-tooltip'})
        .on('click', () => void openBuilding(building.id)).addTo(group);
      marker.getElement()?.setAttribute('aria-label', `${building.name} 건물 정보 보기`);
    }
    return () => {group.remove();};
  }, [map, buildings]);

  function close() {selectionRequest.current++; setEditor(null); onRequestClosed();}
  function saved(building: Building) {
    listRequest.current++;
    setBuildings(previous => [building, ...previous.filter(item => item.id !== building.id)]); setError(''); close();
  }
  function deleted(id: string) {listRequest.current++; setBuildings(previous => previous.filter(building => building.id !== id)); close();}

  return <>
    {error && <div className="building-load-error" role="status">{error}<button type="button" onClick={() => void load()}>건물 다시 불러오기</button></div>}
    {editor && <BuildingDialog key={editor.building?.id || 'new'} editor={editor} returnFocus={map.getContainer()}
      onClose={close} onSaved={saved} onDeleted={deleted}/>}
  </>;
}

function BuildingDialog({editor, returnFocus, onClose, onSaved, onDeleted}: {
  editor: Editor; returnFocus: HTMLElement; onClose: () => void;
  onSaved: (building: Building) => void; onDeleted: (id: string) => void;
}) {
  const {building, point} = editor;
  const dialog = useRef<HTMLDialogElement>(null);
  const [input, setInput] = useState({name: building?.name || '', description: building?.description || '',
    category: building?.category || BUILDING_CATEGORIES[0], address: building?.address || '', contact: building?.contact || '', website: building?.website || '',
    latitude: String(Number(point[0].toFixed(7))), longitude: String(Number(point[1].toFixed(7)))});
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    const element = dialog.current!; element.showModal();
    return () => {element.close(); returnFocus.focus({preventScroll: true});};
  }, [returnFocus]);
  const change = (key: keyof typeof input, value: string) => setInput(previous => ({...previous, [key]: value}));

  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    const value: BuildingInput = {...input, latitude: Number(input.latitude), longitude: Number(input.longitude)};
    try {
      const response = await fetch(building ? `/api/buildings/${building.id}` : '/api/buildings', {
        method: building ? 'PUT' : 'POST', headers: {'Content-Type': 'application/json', ...(building ? {'If-Match': `"${building.version}"`} : {})},
        body: JSON.stringify(value)
      });
      const body = await responseData(response); onSaved(body.building);
    } catch (error) {setError(error instanceof Error ? error.message : '저장하지 못했습니다.');}
    finally {setBusy(false);}
  }
  async function remove() {
    if (!building || busy) return; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/buildings/${building.id}`, {method: 'DELETE', headers: {'If-Match': `"${building.version}"`}});
      if (!response.ok) await responseData(response);
      onDeleted(building.id);
    } catch (error) {setError(error instanceof Error ? error.message : '삭제하지 못했습니다.');}
    finally {setBusy(false);}
  }
  const date = (value: string) => new Intl.DateTimeFormat('ko-KR', {dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Seoul'}).format(new Date(value));

  return <dialog ref={dialog} className="building-dialog" aria-labelledby="building-dialog-title"
    onCancel={event => {event.preventDefault(); if (!busy) onClose();}}>
    <h2 id="building-dialog-title">{building ? '건물 정보 수정' : '건물 정보 등록'}</h2>
    <form onSubmit={save}>
      <fieldset disabled={busy}>
        <label>건물명<input required maxLength={FIELD_LIMITS.name} value={input.name} onChange={event => change('name', event.target.value)}/></label>
        <label>설명<textarea rows={4} maxLength={FIELD_LIMITS.description} value={input.description} onChange={event => change('description', event.target.value)}/></label>
        <label>용도·분류<select value={input.category} onChange={event => change('category', event.target.value)}>
          {BUILDING_CATEGORIES.map(category => <option key={category}>{category}</option>)}
        </select></label>
        <label>주소<input maxLength={FIELD_LIMITS.address} value={input.address} onChange={event => change('address', event.target.value)}/></label>
        <label>연락처<input maxLength={FIELD_LIMITS.contact} value={input.contact} onChange={event => change('contact', event.target.value)}/></label>
        <label>관련 URL<input type="url" maxLength={FIELD_LIMITS.website} placeholder="https://" value={input.website} onChange={event => change('website', event.target.value)}/></label>
        <div className="building-coordinates">
          <label>위도<input required type="number" step="any" min={-85.05112878} max={85.05112878} value={input.latitude} onChange={event => change('latitude', event.target.value)}/></label>
          <label>경도<input required type="number" step="any" min={-180} max={180} value={input.longitude} onChange={event => change('longitude', event.target.value)}/></label>
        </div>
      </fieldset>
      {building && <p className="building-dates">등록 {date(building.createdAt)} · 수정 {date(building.updatedAt)}</p>}
      {error && <p className="building-error" role="alert">{error}</p>}
      {confirmDelete ? <div className="building-delete-confirm">
        <p>이 건물 정보를 삭제하시겠습니까?</p>
        <button type="button" disabled={busy} onClick={() => void remove()}>삭제 확인</button>
        <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>돌아가기</button>
      </div> : <div className="building-dialog-actions">
        <button type="submit" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        <button type="button" disabled={busy} onClick={onClose}>취소</button>
        {building && <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>삭제</button>}
      </div>}
    </form>
  </dialog>;
}
