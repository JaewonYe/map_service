'use client';

import {useCallback, useEffect, useMemo, useRef, useState, type FormEvent} from 'react';
import L from 'leaflet';
import {createPortal} from 'react-dom';
import {BUILDING_CATEGORIES, FIELD_LIMITS, type Building, type BuildingCategory, type BuildingInput} from '../lib/buildings/model';
import {filterBuildings, matchesBuilding, mergeBuildingSnapshot} from '../lib/buildings/search';
import ThemeControl from './ThemeControl';
import FacilityBoundaryEditor from './FacilityBoundaryEditor';
import {boundaryMetrics, boundaryPoints} from '../lib/buildings/boundary';
import {formatArea, formatDistance} from '../lib/map-measure';
import type {Coordinate} from '../lib/map-measure';

async function responseData(response: Response) {
  const body = await response.json();
  if (!response.ok) throw Error(body.error || '시설·건물 정보 요청을 처리하지 못했습니다.');
  return body;
}
type Editor = {building: Building | null; point: Coordinate};
type Props = {mapAction: number; sidebarHost: HTMLElement; expanded: boolean; setExpanded: (value: boolean | ((previous: boolean)=>boolean))=>void; map: L.Map; requestedPoint: Coordinate | null; onRequestClosed: () => void; onBoundaryEditingChange: (editing: boolean) => void};

export default function MapBuildings({map, requestedPoint, onRequestClosed, onBoundaryEditingChange, sidebarHost, expanded, setExpanded, mapAction}: Props) {
  const [boundaryTarget, setBoundaryTarget] = useState<Building | null>(null);
  const boundaryBusy = useRef(false);
  useEffect(() => {onBoundaryEditingChange(!!boundaryTarget); return () => onBoundaryEditingChange(false);}, [boundaryTarget, onBoundaryEditingChange]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [listStatus, setListStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [listError, setListError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [retryId, setRetryId] = useState<string | null>(null);
  const collapseForMap = useCallback(()=>{if(matchMedia('(max-width:800px)').matches)setExpanded(false);},[setExpanded]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<BuildingCategory | ''>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(()=>{if(mapAction && !boundaryTarget)setEditor(null);},[mapAction]);
  const selectionRequest = useRef(0);
  const listRequest = useRef(0);
  const revision = useRef(0);
  const changes = useRef(new Map<string, {revision: number; building: Building | null}>());
  const toggle = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement>(map.getContainer());
  useEffect(()=>{
    if(!expanded || editor || boundaryTarget || !matchMedia('(max-width:800px)').matches)return;
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setExpanded(false);toggle.current?.focus();}};
    document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);
  },[expanded,editor,boundaryTarget,setExpanded]);
  const visible = useMemo(() => filterBuildings(buildings, search, category), [buildings, search, category]);

  async function load(signal?: AbortSignal) {
    const sequence = ++listRequest.current, startedAt = revision.current;
    setListStatus('loading'); setListError(''); setDetailError(''); setRetryId(null);
    try {
      const body = await responseData(await fetch('/api/buildings', {signal, cache: 'no-store'}));
      if (!signal?.aborted && sequence === listRequest.current) {
        const updates = [...changes.current].filter(([, change]) => change.revision > startedAt)
          .map(([id, change]) => ({id, building: change.building}));
        setBuildings(mergeBuildingSnapshot(body.buildings, updates)); setListStatus('ready');
        for (const [id, change] of changes.current) if (change.revision <= startedAt) changes.current.delete(id);
      }
    } catch (error) {
      if (!signal?.aborted && sequence === listRequest.current) {
        setListStatus('error'); setListError(error instanceof Error ? error.message : '시설 목록을 불러오지 못했습니다.');
      }
    }
  }
  useEffect(() => {
    const abort = new AbortController(); void load(abort.signal);
    return () => {abort.abort(); selectionRequest.current++;};
  }, []);
  useEffect(() => {
    if (requestedPoint && !boundaryBusy.current) {
      setBoundaryTarget(null);
      selectionRequest.current++; setDetailLoading(false); setDetailError(''); setRetryId(null);
      setSelectedId(null); collapseForMap(); returnFocus.current = map.getContainer();
      setEditor({building: null, point: requestedPoint});
    }
  }, [requestedPoint, map]);
  // A refreshed record may have been deleted or moved outside the current filters.
  useEffect(() => {
    if (selectedId && !visible.some(building => building.id === selectedId)) {
      selectionRequest.current++; setSelectedId(null); setDetailLoading(false);
      if (editor?.building?.id === selectedId) {setEditor(null); onRequestClosed();}
    }
  }, [visible, selectedId, editor, onRequestClosed]);

  const openBuilding = useCallback(async (id: string, fromList = false) => {
    if (boundaryBusy.current || boundaryTarget?.id === id) return;
    setBoundaryTarget(null); setEditor(null);
    const sequence = ++selectionRequest.current;
    returnFocus.current = fromList && toggle.current ? toggle.current : map.getContainer();
    collapseForMap(); setDetailLoading(true); setDetailError(''); setRetryId(null);
    try {
      const response = await fetch(`/api/buildings/${id}`, {cache: 'no-store'});
      if (sequence !== selectionRequest.current) return;
      if (response.status === 404) {
        changes.current.set(id, {revision: ++revision.current, building: null});
        setBuildings(previous => previous.filter(item => item.id !== id));
        setSelectedId(null); setEditor(null); setDetailError('시설이 삭제되었습니다. 목록을 다시 불러와 확인하세요.');
        return;
      }
      const {building}: {building: Building} = await responseData(response);
      if (sequence !== selectionRequest.current) return;
      changes.current.set(id, {revision: ++revision.current, building});
      setBuildings(previous => previous.map(item => item.id === id ? building : item));
      if (!matchesBuilding(building, search, category)) {
        setSelectedId(null); setEditor(null); setDetailError('변경된 시설이 현재 검색 조건에서 제외되었습니다.'); return;
      }
      setSelectedId(id);
      if (building.boundary) {
        const bounds = L.latLngBounds(boundaryPoints(building.boundary).map(([lat, lon]) => L.latLng(lat, lon)));
        bounds.extend([building.latitude, building.longitude]);
        map.fitBounds(bounds, {animate: false, maxZoom: map.getZoom(), padding: [40, 40]});
      } else map.panTo([building.latitude, building.longitude], {animate: false});
      setEditor({building, point: [building.latitude, building.longitude]});
    } catch (error) {
      if (sequence === selectionRequest.current) {
        setDetailError(error instanceof Error ? error.message : '시설 정보를 불러오지 못했습니다.'); setRetryId(id);
      }
    } finally {if (sequence === selectionRequest.current) setDetailLoading(false);}
  }, [map, search, category, boundaryTarget, collapseForMap]);

  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    const icon = L.divIcon({className: 'building-marker', iconSize: [28, 28], iconAnchor: [14, 14],
      html: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="var(--color-accent)" stroke="var(--color-surface)" stroke-width="2"/><path d="M8 21V8h12v13M11 11h2m2 0h2m-6 4h2m2 0h2m-4 6v-3h2v3" fill="none" stroke="var(--color-surface)" stroke-width="1.6"/></svg>'});
    for (const building of visible) {
      if (building.boundary) {
        const polygon = L.polygon(boundaryPoints(building.boundary).map(([lat, lon]) => L.latLng(lat, lon)), {
          color: 'var(--map-selection-stroke)', weight: 3, fillOpacity: 0.18, interactive: !boundaryTarget, bubblingMouseEvents: false, className: 'facility-boundary-saved'
        }).addTo(group).on('click', () => void openBuilding(building.id));
        const element = polygon.getElement();
        element?.setAttribute('tabindex', boundaryTarget ? '-1' : '0'); element?.setAttribute('role', 'button');
        if (boundaryTarget) element?.setAttribute('aria-disabled', 'true');
        element?.setAttribute('aria-label', `${building.name} 시설 경계 정보 보기`);
        element?.addEventListener('keydown', event => {
          const key = (event as KeyboardEvent).key;
          if (key === 'Enter' || key === ' ') {event.preventDefault(); void openBuilding(building.id);}
        });
      }
      const text = document.createElement('span'); text.textContent = building.name;
      const marker = L.marker([building.latitude, building.longitude], {icon, keyboard: true, bubblingMouseEvents: false})
        .bindTooltip(text, {direction: 'top', className: 'building-tooltip'})
        .on('click', () => void openBuilding(building.id)).addTo(group);
      marker.getElement()?.setAttribute('aria-label', `${building.name} 시설·건물 정보 보기`);
    }
    return () => {group.remove();};
  }, [map, visible, openBuilding, boundaryTarget]);

  function changeFilters(nextSearch: string, nextCategory: BuildingCategory | '') {
    selectionRequest.current++; setDetailLoading(false); setDetailError(''); setRetryId(null);
    setSelectedId(null); setSearch(nextSearch); setCategory(nextCategory);
  }
  function close() {selectionRequest.current++; setDetailLoading(false); setEditor(null); onRequestClosed();}
  function saved(building: Building) {
    changes.current.set(building.id, {revision: ++revision.current, building});
    setBuildings(previous => [building, ...previous.filter(item => item.id !== building.id)]);
    setSelectedId(matchesBuilding(building, search, category) ? building.id : null);
    setDetailError(''); close();
  }
  function deleted(id: string) {
    changes.current.set(id, {revision: ++revision.current, building: null});
    setBuildings(previous => previous.filter(building => building.id !== id));
    setSelectedId(previous => previous === id ? null : previous);
    setDetailError(''); close();
  }

  function retryDetail() {
    if (retryId) void openBuilding(retryId, true);
    else {setExpanded(true); void load();}
  }

  return <>
    {!boundaryTarget && createPortal(<aside className="facility-panel" data-expanded={expanded} aria-label="시설 목록">
      <div className="facility-panel-heading"><h2>시설 찾기</h2><button ref={toggle} type="button" className="facility-list-toggle" aria-label="시설 목록" aria-expanded={expanded} aria-controls="facility-list-content"
        onClick={() => setExpanded(value => !value)}><span aria-hidden="true">{expanded ? '접기' : '펼치기'}{(search.trim() || category) && ' · 조건 적용 중'}</span></button></div>
      {expanded && <div id="facility-list-content" className="facility-list-content">
        <label>시설명 검색<input type="search" value={search} onChange={event => changeFilters(event.target.value, category)} name="facility-search" autoComplete="off" placeholder="시설명을 입력하세요…"/></label>
        <label>시설 분류<select name="facility-category" value={category} onChange={event => changeFilters(search, event.target.value as BuildingCategory | '')}>
          <option value="">전체</option>{BUILDING_CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <div className="facility-list-actions">
          <button type="button" onClick={() => changeFilters('', '')}>검색·분류 초기화</button>
          <button type="button" disabled={listStatus === 'loading'} onClick={() => void load()}>시설 목록 다시 불러오기</button>
        </div>
        {listStatus === 'loading' && <p role="status">시설 목록을 불러오는 중…</p>}
        {listStatus === 'error' && <p role="alert">시설 목록 조회 실패: {listError}{buildings.length > 0 && ' 이전 조회 결과를 표시합니다.'}</p>}
        {(listStatus === 'ready' || buildings.length > 0) && <>
          <p role="status" data-testid="facility-result-count">검색 결과 {visible.length}개 / 전체 {buildings.length}개</p>
          {buildings.length === 0 ? <p>등록된 시설이 없습니다. 지도에서 시설·건물을 추가하세요.</p>
            : visible.length === 0 ? <p>조건에 맞는 시설이 없습니다. 검색어나 분류를 바꾸세요.</p>
            : <ul className="facility-results" aria-label="시설 검색 결과">{visible.map(building => <li key={building.id}>
              <button type="button" aria-current={selectedId === building.id ? 'location' : undefined}
                onClick={() => void openBuilding(building.id, true)}>
                <span>{building.name}</span><small>{building.category}{building.address && ` · ${building.address}`}</small>
              </button>
            </li>)}</ul>}
        </>}
      </div>}
    </aside>, sidebarHost)}
    {(detailLoading || detailError) && <div className="building-load-error" role="status">
      <span>{detailLoading ? '시설 정보를 불러오는 중…' : detailError}</span>
      {detailError && <button type="button" onClick={retryDetail}>
        {retryId ? '시설 정보 다시 불러오기' : '목록 다시 불러오기'}</button>}
    </div>}
    {editor && <BuildingDialog key={editor.building?.id || 'new'} editor={editor} returnFocus={returnFocus.current}
      onClose={close} onSaved={saved} onDeleted={deleted} onBoundary={() => {
        if (!editor.building) return;
        selectionRequest.current++; setBoundaryTarget(editor.building); setEditor(null); collapseForMap();
      }}/>}
    {boundaryTarget && createPortal(<FacilityBoundaryEditor key={`${boundaryTarget.id}:${boundaryTarget.version}`} map={map} building={boundaryTarget}
      onBusy={value => {boundaryBusy.current = value;}} onSaved={building => {setBoundaryTarget(null); saved(building);}}
      onCancel={() => {if (boundaryBusy.current) return; setBoundaryTarget(null); setEditor(null); map.getContainer().focus();}}/>, sidebarHost)}
  </>;
}

function BuildingDialog({editor, returnFocus, onClose, onSaved, onDeleted, onBoundary}: {
  editor: Editor; returnFocus: HTMLElement; onClose: () => void;
  onSaved: (building: Building) => void; onDeleted: (id: string) => void; onBoundary: () => void;
}) {
  const {building, point} = editor;
  const alive = useRef(false), abort = useRef<AbortController | null>(null);
  const [confirmBoundary, setConfirmBoundary] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), errorSummary = useRef<HTMLParagraphElement>(null);
  const [input, setInput] = useState({name: building?.name || '', description: building?.description || '',
    category: building?.category || BUILDING_CATEGORIES[0], address: building?.address || '', contact: building?.contact || '', website: building?.website || '',
    latitude: String(Number(point[0].toFixed(7))), longitude: String(Number(point[1].toFixed(7)))});
  const [editing, setEditing] = useState(!building);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    alive.current = true;
    const element = dialog.current!; if (editing) element.showModal(); else {element.show();element.focus({preventScroll:true});element.scrollTop=0;}
    return () => {alive.current = false; abort.current?.abort(); element.close(); returnFocus.focus({preventScroll: true});};
  }, [returnFocus, editing]);
  useEffect(()=>{
    if(editing)return;
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy){event.preventDefault();onClose();}};
    document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);
  },[editing,busy,onClose]);
  useEffect(()=>{if(error)errorSummary.current?.focus();},[error]);
  const change = (key: keyof typeof input, value: string) => setInput(previous => ({...previous, [key]: value}));

  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    abort.current = new AbortController();
    const value: BuildingInput = {...input, latitude: Number(input.latitude), longitude: Number(input.longitude)};
    try {
      const response = await fetch(building ? `/api/buildings/${building.id}` : '/api/buildings', {
        method: building ? 'PUT' : 'POST', signal: abort.current?.signal, headers: {'Content-Type': 'application/json', ...(building ? {'If-Match': `"${building.version}"`} : {})},
        body: JSON.stringify(value)
      });
      const body = await responseData(response); if (alive.current) onSaved(body.building);
    } catch (error) {if (alive.current) setError(error instanceof Error ? error.message : '저장하지 못했습니다.');}
    finally {if (alive.current) setBusy(false);}
  }
  async function remove() {
    if (!building || busy) return; setBusy(true); setError('');
    abort.current = new AbortController();
    try {
      const response = await fetch(`/api/buildings/${building.id}`, {method: 'DELETE', signal: abort.current?.signal, headers: {'If-Match': `"${building.version}"`}});
      if (!response.ok) await responseData(response);
      if (alive.current) onDeleted(building.id);
    } catch (error) {if (alive.current) setError(error instanceof Error ? error.message : '삭제하지 못했습니다.');}
    finally {if (alive.current) setBusy(false);}
  }
  async function removeBoundary() {
    if (!building || busy) return;
    setBusy(true); setError(''); abort.current = new AbortController();
    try {
      const response = await fetch(`/api/buildings/${building.id}`, {method: 'PUT', signal: abort.current.signal,
        headers: {'Content-Type': 'application/json', 'If-Match': `"${building.version}"`}, body: JSON.stringify({...building, boundary: null})});
      const body = await responseData(response); if (alive.current) onSaved(body.building);
    } catch (error) {if (alive.current) setError(`${error instanceof Error ? error.message : '경계 제거 실패'} 저장된 경계는 유지됩니다. 재시도하거나 창을 닫고 시설을 다시 열어 최신 정보를 확인하세요.`);}
    finally {if (alive.current) setBusy(false);}
  }
  const date = (value: string) => new Intl.DateTimeFormat('ko-KR', {dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Seoul'}).format(new Date(value));

  return <div role={!editing && building ? 'region' : undefined} aria-label={!editing && building ? '선택 시설' : undefined} className={!editing && building ? 'facility-selection' : undefined}>
    <dialog ref={dialog} tabIndex={-1} className={`building-dialog ${!editing && building ? 'facility-details-card' : ''}`} aria-labelledby="building-dialog-title"
    onCancel={event => {event.preventDefault(); if (!busy) onClose();}}>
    <h2 id="building-dialog-title" className={!editing && building ? 'sr-only' : undefined}>{building ? (editing ? '시설·건물 정보 수정' : '시설·건물 정보') : '시설·건물 정보 등록'}</h2>
    {editing && <ThemeControl label="편집창 화면 테마"/>}
    {!editing && building ? <>
      <h3>{building.name}</h3>
      <span className="facility-category-badge">{building.category}</span>
      <p className="facility-description">{building.description || '등록된 설명이 없습니다.'}</p>
      <details className="facility-more"><summary>시설 상세 정보</summary><dl className="facility-details">
        <dt>주소</dt><dd>{building.address || '—'}</dd>
        <dt>연락처</dt><dd>{building.contact || '—'}</dd>
        <dt>관련 URL</dt><dd>{/^https?:\/\//i.test(building.website) ? <a href={building.website} target="_blank" rel="noopener noreferrer">{building.website}</a> : '—'}</dd>
        <dt>위치</dt><dd>{building.latitude.toFixed(7)}, {building.longitude.toFixed(7)}</dd>
      </dl></details>
      <p>{building.boundary ? `저장된 경계 · 면적 ${formatArea(boundaryMetrics(building.boundary).area)} · 둘레 ${formatDistance(boundaryMetrics(building.boundary).perimeter)}` : '저장된 경계 없음'}</p>
      {error && <p ref={errorSummary} tabIndex={-1} className="building-error" role="alert">{error}</p>}
      <div className="building-dialog-actions">
        <button className="boundary-start" type="button" disabled={busy} onClick={onBoundary}>{building.boundary ? '경계 수정' : '경계 추가'}</button>
        {building.boundary && <button className="boundary-remove" type="button" disabled={busy} onClick={() => setConfirmBoundary(true)}>경계 제거</button>}
      </div>
      {confirmBoundary && <div className="building-delete-confirm"><p>시설 정보는 유지하고 경계만 제거하시겠습니까?</p>
        <button className="boundary-remove" type="button" disabled={busy} onClick={() => void removeBoundary()}>경계 제거 확인</button>
        <button type="button" disabled={busy} onClick={() => setConfirmBoundary(false)}>경계 제거 취소</button></div>}
      <p className="building-dates">등록 {date(building.createdAt)} · 수정 {date(building.updatedAt)}</p>
      <div className="building-dialog-actions">
        <button type="button" disabled={busy} onClick={() => setEditing(true)}>수정</button>
        <button type="button" disabled={busy} onClick={onClose}>닫기</button>
      </div>
    </> : <form onSubmit={save} autoComplete="off">
      <fieldset disabled={busy}>
        <label>시설명<input required maxLength={FIELD_LIMITS.name} name="name" value={input.name} onChange={event => change('name', event.target.value)}/></label>
        <label>설명<textarea rows={4} maxLength={FIELD_LIMITS.description} name="description" value={input.description} onChange={event => change('description', event.target.value)}/></label>
        <label>용도·분류<select name="category" value={input.category} onChange={event => change('category', event.target.value)}>
          {BUILDING_CATEGORIES.map(category => <option key={category}>{category}</option>)}
        </select></label>
        <label>주소<input maxLength={FIELD_LIMITS.address} name="address" value={input.address} onChange={event => change('address', event.target.value)}/></label>
        <label>연락처<input type="tel" maxLength={FIELD_LIMITS.contact} name="contact" value={input.contact} onChange={event => change('contact', event.target.value)}/></label>
        <label>관련 URL<input type="url" maxLength={FIELD_LIMITS.website} placeholder="https://" name="website" value={input.website} onChange={event => change('website', event.target.value)}/></label>
        <div className="building-coordinates">
          <label>위도<input required type="number" step="any" min={-85.05112878} max={85.05112878} name="latitude" value={input.latitude} onChange={event => change('latitude', event.target.value)}/></label>
          <label>경도<input required type="number" step="any" min={-180} max={180} name="longitude" value={input.longitude} onChange={event => change('longitude', event.target.value)}/></label>
        </div>
      </fieldset>
      {building && <p className="building-dates">등록 {date(building.createdAt)} · 수정 {date(building.updatedAt)}</p>}
      {error && <p ref={errorSummary} tabIndex={-1} className="building-error" role="alert">{error}</p>}
      {confirmDelete ? <div className="building-delete-confirm">
        <p>이 시설·건물 정보를 삭제하시겠습니까?</p>
        <button className="danger" type="button" disabled={busy} onClick={() => void remove()}>삭제 확인</button>
        <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>돌아가기</button>
      </div> : <div className="building-dialog-actions">
        <button type="submit" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        <button type="button" disabled={busy} onClick={onClose}>취소</button>
        {building && <button className="danger" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>삭제</button>}
      </div>}
    </form>}
  </dialog></div>;
}
