import {resolve} from 'node:path';
import {Tpk} from '../lib/tiles/tpk';
try{process.loadEnvFile();}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const path=resolve(process.argv[2]||process.env.TPK_PATH||'data/tpk/map.tpk');
const reader=await Tpk.load(path);
try{console.log(JSON.stringify(reader.info(),null,2));}
finally{reader.close();}
