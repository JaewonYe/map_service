export const BUILDING_CATEGORIES = ['미분류', '주거', '상업', '공공시설', '공장·창고', '교육', '의료', '문화·관광', '기타'] as const;
export type BuildingCategory = typeof BUILDING_CATEGORIES[number];
export type BuildingInput = {
  name: string;
  description: string;
  category: BuildingCategory;
  address: string;
  contact: string;
  website: string;
  latitude: number;
  longitude: number;
};
export type Building = BuildingInput & {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export class BuildingError extends Error {
  constructor(message: string, public status = 400, cause?: unknown) {super(message, {cause});}
}
export const FIELD_LIMITS = {name: 120, description: 5000, address: 300, contact: 160, website: 2048};
export function buildingId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BuildingError('올바르지 않은 건물 ID입니다.');
  }
  return value.toLowerCase();
}
export function parseBuilding(value: unknown): BuildingInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BuildingError('건물 정보를 JSON 객체로 입력하세요.');
  const input = value as Record<string, unknown>;
  const text = (key: keyof typeof FIELD_LIMITS) => {
    if (input[key] === undefined) return '';
    if (typeof input[key] !== 'string') throw new BuildingError(`${key}: 문자열을 입력하세요.`);
    const result = input[key].trim();
    if (result.length > FIELD_LIMITS[key]) throw new BuildingError(`${key}: 최대 ${FIELD_LIMITS[key]}자까지 입력할 수 있습니다.`);
    return result;
  };
  const name = text('name'); if (!name) throw new BuildingError('건물명을 입력하세요.');
  const category = input.category ?? BUILDING_CATEGORIES[0];
  if (!BUILDING_CATEGORIES.includes(category as BuildingCategory)) throw new BuildingError('올바른 건물 분류를 선택하세요.');
  const latitude = input.latitude, longitude = input.longitude;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 85.05112878 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new BuildingError('위도는 -85.05112878~85.05112878, 경도는 -180~180 범위의 숫자여야 합니다.');
  }
  let website = text('website');
  if (website) {
    try {const url = new URL(website); if (!['http:', 'https:'].includes(url.protocol)) throw Error(); website = url.href;}
    catch {throw new BuildingError('관련 URL은 http:// 또는 https://로 시작해야 합니다.');}
    if (website.length > FIELD_LIMITS.website) throw new BuildingError('관련 URL은 URL 인코딩 후 최대 2,048자까지 지원합니다.');
  }
  return {name, description: text('description'), category: category as BuildingCategory,
    address: text('address'), contact: text('contact'), website, latitude, longitude};
}
