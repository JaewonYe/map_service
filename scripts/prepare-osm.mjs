import {prepareDevelopmentOsm} from './manage.mjs';
try{await prepareDevelopmentOsm();}
catch(error){console.error('OSM 일반 지도 준비 실패:',error.message);process.exitCode=1;}
