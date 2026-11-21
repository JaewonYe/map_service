import {chromium,request} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const stage=process.argv[2]||'after',baseURL='http://127.0.0.1:3120';
if(!['before','after'].includes(stage))throw Error('Use before or after');
const output=fileURLToPath(new URL(`../docs/ui/issue-13/${stage}/`,import.meta.url));
await mkdir(output,{recursive:true});
const api=await request.newContext({baseURL});
const metadata=await (await api.get('/api/map-info')).json();
if(!metadata.sources?.length||!metadata.sources.every(source=>source.name?.startsWith('CC0 ')))throw Error('Only the synthetic catalog fixture server is supported');
const names=new Set(['제1시험장 · 시각 검증용','중앙 주차장 · 시각 검증용','야외 시험구역 · 시각 검증용']);
const boundary={type:'Polygon',coordinates:[[[126.2405,36.598],[126.2415,36.598],[126.2415,36.599],[126.2405,36.599],[126.2405,36.598]]]};
let {buildings}=await (await api.get('/api/buildings')).json();
if(buildings.some(building=>!names.has(building.name)||building.description!=='합성 시설 데이터 · 디자인 검증 전용'))throw Error('Unexpected facility data: refusing to capture');
if(!buildings.length)for(const [name,category,latitude,longitude] of [['제1시험장 · 시각 검증용','시험장',36.5985,126.241],['중앙 주차장 · 시각 검증용','주차장',36.597,126.244],['야외 시험구역 · 시각 검증용','야외 공간',36.596,126.239]]) {
 const r=await api.post('/api/buildings',{data:{name,category,latitude,longitude,description:'합성 시설 데이터 · 디자인 검증 전용',address:'합성 위치',...(category==='시험장'?{boundary}:{})}});
 if(!r.ok())throw Error(await r.text());
}
({buildings}=await (await api.get('/api/buildings')).json());const target=buildings.find(b=>b.category==='시험장');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,headless:true});
const manifest={stage,baseURL,fixture:'Isolated ui-13-data; synthetic catalog tiles and three synthetic facilities',captures:[]};
for(const [device,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]])for(const theme of ['light','dark']) {
 const page=await browser.newPage({viewport,colorScheme:theme});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.fallback():route.abort());
 await page.goto(baseURL);await page.locator('.leaflet-tile-loaded').first().waitFor();
 if(stage==='before')await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
 else await page.getByLabel('화면 테마',{exact:true}).selectOption(theme);
 const toggle=page.getByRole('button',{name:'시설 목록',exact:true});
 if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
 await page.getByRole('list',{name:'시설 검색 결과'}).getByRole('button',{name:new RegExp(target.name)}).waitFor();
 const capture=async state=>{const file=`${device}-${theme}-${state}.png`;await page.waitForFunction(()=>[...document.querySelectorAll('img.leaflet-tile')].every(img=>img.complete&&Number(getComputedStyle(img).opacity)===1));await page.screenshot({animations:'disabled',path:`${output}${file}`});manifest.captures.push({file,viewport,theme,state,search:'',camera:await page.getByTestId('map-center').innerText(),zoom:await page.getByTestId('zoom').innerText(),facility:state==='base'?null:target.name});};
 await capture('base');
 await page.getByRole('list',{name:'시설 검색 결과'}).getByRole('button',{name:new RegExp(target.name)}).click();
 if(stage==='after')await page.getByRole('region',{name:'선택 시설'}).waitFor();else await page.getByRole('dialog').waitFor();
 await capture('selected');
 await page.getByRole('button',{name:'경계 수정',exact:true}).click();
 await page.getByRole('region',{name:'시설 경계 편집'}).waitFor();if(stage==='after')await page.waitForFunction(()=>document.querySelector('.map-workspace')?.getAttribute('data-boundary-editing')==='true');
 await capture('boundary');
 await page.close();
}
await writeFile(`${output}manifest.json`,JSON.stringify(manifest,null,2)+'\n');
await browser.close();await api.dispose();
