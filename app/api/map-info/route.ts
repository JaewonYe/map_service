import {mapLayers} from '../../../lib/maps/layers';
import {mapConfig} from '../../../lib/map-config';
import {failure} from '../../../lib/tiles/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
  try {
    const {catalog,layers,osm}=await mapLayers();
    const first=layers.street.available?layers.street:layers.elevation.available?layers.elevation:null;
    const bounds=first?.bounds||{south:33,west:124,north:39,east:132};
    const desired=mapConfig.center;
    const center=desired[0]>=bounds.south&&desired[0]<=bounds.north&&desired[1]>=bounds.west&&desired[1]<=bounds.east
      ?desired:[(bounds.south+bounds.north)/2,(bounds.west+bounds.east)/2];
    const base=catalog||{mode:'layers',sources:[],warnings:[],revision:'no-satellite',usageConfirmed:false,
      center,bounds,minZoom:0,maxZoom:19,zoom:Math.min(first?.maxNativeZoom??mapConfig.zoom,mapConfig.zoom),
      tileSize:256,projection:'EPSG:3857',attribution:''};
    const extended=layers.street.available||layers.elevation.available;
    return Response.json({...base,...(extended?{minZoom:0,maxZoom:19}:{}),layers,osm},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
