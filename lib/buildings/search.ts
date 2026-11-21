import type {Building, BuildingCategory} from './model';

export function matchesBuilding(building: Pick<Building, 'name' | 'category'>, search: string, category: BuildingCategory | '') {
  return (!category || building.category === category) && building.name.toLowerCase().includes(search.trim().toLowerCase());
}

export function filterBuildings(buildings: readonly Building[], search: string, category: BuildingCategory | '') {
  return buildings.filter(building => matchesBuilding(building, search, category));
}

// Keep rows from a list snapshot while applying changes learned after that request began.
export function mergeBuildingSnapshot(snapshot: readonly Building[], changes: readonly {id: string; building: Building | null}[]) {
  const merged = new Map(snapshot.map(building => [building.id, building]));
  for (const change of changes) {
    if (change.building) merged.set(change.id, change.building);
    else merged.delete(change.id);
  }
  return [...merged.values()];
}
