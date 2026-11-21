import type {Building, BuildingCategory} from './model';

export function matchesBuilding(building: Pick<Building, 'name' | 'category'>, search: string, category: BuildingCategory | '') {
  return (!category || building.category === category) && building.name.toLowerCase().includes(search.trim().toLowerCase());
}

export function filterBuildings(buildings: readonly Building[], search: string, category: BuildingCategory | '') {
  return buildings.filter(building => matchesBuilding(building, search, category));
}
