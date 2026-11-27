/** Real production HTTP UI; no provider credentials, data downloads or request mocks. */
import {spawn} from 'node:child_process';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const root=resolve('.cache/generic-download-review'),out=resolve('docs/ui/generic-download'),url='http://127.0.0.1:3132';
await rm(root,{recursive:true,force:true});await mkdir(join(root,'downloads'),{recursive:true});await mkdir(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3132'],{stdio:'ignore',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',MAP_MODE:'offline',MAP_DOWNLOADS_DIR:join(root,'downloads'),BUILDINGS_DIR:join(root,'buildings'),OSM_EDITS_DIR:join(root,'edits'),OSM_TILE_DIR:join(root,'osm'),TPK_PATH:join(root,'tpk/map.tpk'),STREET_TPK_DIR:join(root,'street'),ELEVATION_DIR:join(root,'elevation'),TPK_USAGE_CONFIRMED:'false',OSM_USAGE_CONFIRMED:'false'}});
const reference=spawn('python3',['-m','http.server','3133','--bind','127.0.0.1','--directory',resolve('design-system/platform')],{stdio:'ignore'});
const report={source:'Real production Next.js HTTP UI with empty review data; no provider downloads, no worker and no mocks',captures:[],checks:[],externalRequests:0};let browser;
try{
 await expect.poll(async()=>{try{return (await fetch(url+'/api/downloads')).status;}catch{return 0;}},{timeout:30000}).toBe(200);
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium'});
 for(const device of ['desktop','mobile'])for(const theme of ['light','dark']){
  const viewport=device==='desktop'?{width:1440,height:900}:{width:390,height:844},page=await browser.newPage({viewport,colorScheme:theme,reducedMotion:'reduce'});page.setDefaultTimeout(10000);
  await page.goto('http://127.0.0.1:3133/reference.html');await page.locator('#theme').selectOption(theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.fallback();report.externalRequests++;return r.abort();});await page.goto(url+'/downloads');await page.getByLabel('화면 테마',{exact:true}).selectOption(theme);await expect(page).toHaveTitle('지도 다운로드·관리');await expect(page.getByRole('heading',{level:1})).toHaveText('지도 데이터');await expect(page.getByText(/태안|시험장/)).toHaveCount(0);await expect(page.locator('.download-map .leaflet-overlay-pane path')).toHaveCount(0);await expect(page.getByRole('button',{name:'다운로드·준비 시작',exact:true})).toBeDisabled();
  if(device==='desktop'&&theme==='light'){const file='desktop-light-initial.png';await page.screenshot({path:join(out,file),animations:'disabled'});report.captures.push({file,device,theme,viewport,state:'initial-no-area'});}
  await page.getByLabel('표시 상세도',{exact:true}).selectOption('custom');const min=page.getByLabel('위성 최소 level',{exact:true}),max=page.getByLabel('위성 최대 level',{exact:true});await min.fill('0');await max.fill('13');await min.evaluate(el=>el.scrollIntoView({block:'center'}));await expect(min).toHaveValue('0');await expect(max).toHaveValue('13');await min.focus();const inputBox=await min.boundingBox(),footerBox=await page.locator('.download-settings-footer').boundingBox();assert.ok(inputBox&&footerBox&&inputBox.y>=56&&inputBox.y+inputBox.height<=footerBox.y);const file=`${device}-${theme}-custom.png`;await page.screenshot({path:join(out,file),animations:'disabled'});report.captures.push({file,device,theme,viewport,state:'custom-0-13'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await min.fill('18');await max.fill('17');await expect(page.locator('#satellite-level-error')).toContainText('이하여야');await expect(page.getByRole('button',{name:'영역·작업량 확인',exact:true})).toBeDisabled();await min.fill('');await expect(min).toHaveAttribute('aria-invalid','true');await min.fill('0');await max.fill('19');await expect(page.locator('#satellite-level-error')).toHaveCount(0);await expect(min).toHaveValue('0');report.checks.push({device,theme,noFixedPlaceOrRectangle:true,customDraftEditable:true,invalidRangeBlocked:true,blankRemainsInvalid:true,noHorizontalOverflow:true});await page.close();
 }
 assert.equal(report.externalRequests,0);
}finally{
 await browser?.close();for(const child of [server,reference]){child.kill('SIGTERM');await new Promise(ok=>{if(child.exitCode!==null||child.signalCode!==null)ok();else child.once('exit',ok);});}await writeFile(join(out,'manifest.json'),JSON.stringify(report,null,2)+'\n');
}
console.log('Generic initial state, custom levels, invalid states and four theme/device captures passed.');
