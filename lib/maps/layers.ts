import {resolve,join} from 'node:path';
import {getCatalog,MapCatalog} from '../tiles/catalog';
import {osmInfo} from '../tiles/osm';
import {getElevation} from './elevation';
import type {LayerId,LayerInfo} from './types';
let street: Promise<MapCatalog> | undefined;
export async function getStreet() {
  if (!street) {
    const directory = resolve(/*turbopackIgnore: true*/ process.env.STREET_TPK_DIR || 'data/street');
    street = MapCatalog.load({legacyPath:join(directory,'map.tpk'),configFile:'maps.json',
      cache:join(process.env.TPK_CACHE_DIR || '.cache/tpk','street'),usageConfirmed:process.env.STREET_USAGE_CONFIRMED === 'true'});
    street.catch(() => { street = undefined; });
  }
  const catalog = await street;
  await catalog.checkUnchanged();
  return catalog;
}
export async function mapLayers() {
  const [satellite,normal,terrain,osm] = await Promise.allSettled([getCatalog(),getStreet(),getElevation(),osmInfo()]);
  const missing = (reason: string): LayerInfo => ({available:false,reason});
  const catalogLayer = (catalog: MapCatalog,url: string,permission: string): LayerInfo => {
    const m = catalog.info();
    return {available:m.usageConfirmed,url,revision:m.revision,bounds:m.bounds,minNativeZoom:m.minZoom,maxNativeZoom:m.maxZoom,
      attribution:m.attribution,reason:m.usageConfirmed?undefined:m.mode==='single'?`.env에서 ${permission}=true를 설정하세요 (허용된 데이터만).`:'maps.json에서 허용된 데이터의 usageConfirmed를 true로 설정하세요.'};
  };
  const layers: Record<LayerId,LayerInfo> = {
    satellite:satellite.status === 'fulfilled'?catalogLayer(satellite.value,'/api/tiles/{z}/{x}/{y}','TPK_USAGE_CONFIRMED'):missing('위성 TPK를 data/tpk/에 등록하세요.'),
    street:normal.status === 'fulfilled'?catalogLayer(normal.value,'/api/street/{z}/{x}/{y}','STREET_USAGE_CONFIRMED'):missing('도로·지명이 포함된 일반 지도 TPK를 data/street/에 등록하세요.'),
    elevation:terrain.status === 'fulfilled'?terrain.value.info():missing('DEM GeoTIFF를 준비하고 고도 데이터 변환을 실행하세요.')
  };
  const osmMetadata = osm.status === 'fulfilled'?osm.value:{mode:'unavailable',url:null,attribution:''};
  if (!layers.street.available && osmMetadata.url) layers.street = {available:true,url:osmMetadata.url,attribution:osmMetadata.attribution,
    online:osmMetadata.mode === 'online',minNativeZoom:0,maxNativeZoom:19};
  return {catalog:satellite.status === 'fulfilled'?satellite.value.info():null,layers,osm:osmMetadata};
}
