import {resolve} from 'node:path';
import {Tpk} from '../lib/tiles/tpk';
import {MapCatalog} from '../lib/tiles/catalog';
try{process.loadEnvFile();}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const argument=process.argv[2];
const reader=argument&&!argument.toLowerCase().endsWith('.json')
  ?await Tpk.load(resolve(argument))
  :await MapCatalog.load(argument?{configPath:resolve(argument)}:{});
try{console.log(JSON.stringify(reader.info(),null,2));}
finally{reader.close();}
