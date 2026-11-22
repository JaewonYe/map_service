import {boundaryPoint, MAX_BOUNDARY_VERTICES} from './boundary';
import type {Coordinate} from '../map-measure';

export type BoundaryDraft = {points: Coordinate[]; selected: number | null; past: {points: Coordinate[]; selected: number | null}[]};
export type DraftAction =
  | {type: 'select'; index: number}
  | {type: 'replace'; points: Coordinate[]; selected?: number | null}
  | {type: 'move'; index: number; point: Coordinate}
  | {type: 'insert'; after: number; point: Coordinate}
  | {type: 'delete'} | {type: 'undo'};
export const newBoundaryDraft = (points: Coordinate[]): BoundaryDraft => ({points, selected: points.length ? 0 : null, past: []});
/** UI-only history; invalid geometry remains editable and is checked by boundaryFromPoints before save. */
export function editBoundaryDraft(state: BoundaryDraft, action: DraftAction): BoundaryDraft {
  if (action.type === 'select') return action.index >= 0 && action.index < state.points.length ? {...state, selected: action.index} : state;
  if (action.type === 'undo') {
    const last = state.past.at(-1); return last ? {...last, past: state.past.slice(0, -1)} : state;
  }
  let points = state.points, selected = state.selected;
  if (action.type === 'replace') {points = action.points; selected = action.selected ?? (points.length ? points.length - 1 : null);}
  if (action.type === 'move') {
    if (!points[action.index]) return state;
    const point = boundaryPoint(action.point); points = points.map((p, i) => i === action.index ? point : p); selected = action.index;
  }
  if (action.type === 'insert') {
    if (points.length >= MAX_BOUNDARY_VERTICES || action.after < -1 || action.after >= points.length) return state;
    points = [...points.slice(0, action.after + 1), boundaryPoint(action.point), ...points.slice(action.after + 1)]; selected = action.after + 1;
  }
  if (action.type === 'delete') {
    if (selected === null || points.length <= 3) return state;
    points = points.filter((_, i) => i !== selected); selected = Math.min(selected, points.length - 1);
  }
  if (JSON.stringify(points) === JSON.stringify(state.points)) return {...state, selected};
  return {points, selected, past: [...state.past.slice(-99), {points: state.points, selected: state.selected}]};
}
