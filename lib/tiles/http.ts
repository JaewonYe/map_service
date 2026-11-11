import {TileError} from './tpk';
export function failure(error:unknown){
  if(error instanceof TileError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store',...(error.status===429?{'Retry-After':'1'}:{})}});
  console.error('Local tile service failure:',error);
  return Response.json({error:'Unable to read local package; inspect server logs.'},{status:500,headers:{'Cache-Control':'no-store'}});
}
