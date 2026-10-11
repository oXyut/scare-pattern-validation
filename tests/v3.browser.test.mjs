import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

const docs=resolve(fileURLToPath(new URL('../docs/',import.meta.url)));
const playwright=await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
let server,browser,base;
before(async()=>{
  server=createServer(async(req,res)=>{
    const path=resolve(docs,'.'+new URL(req.url,'http://localhost').pathname);
    if(!path.startsWith(docs+'/')){res.writeHead(404).end();return;}
    try{res.setHeader('Content-Type',{'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.json':'application/json'}[extname(path)]||'text/plain');res.end(await readFile(path));}
    catch{res.writeHead(404).end();}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  base=`http://127.0.0.1:${server.address().port}/v3.html`;
  browser=await playwright.chromium.launch({headless:true,...(process.env.SITE_BROWSER_EXECUTABLE?{executablePath:process.env.SITE_BROWSER_EXECUTABLE}:{channel:process.env.SITE_BROWSER_CHANNEL||'chromium'})});
});
after(async()=>{await browser?.close();if(server)await new Promise(done=>server.close(done));});
async function page(t,suffix='',viewport={width:1280,height:900},intercept){
  const p=await browser.newPage({viewport});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  t.after(async()=>{await p.close();assert.deepEqual(errors,[]);});
  if(intercept)await intercept(p);
  await p.goto(base+suffix);await p.waitForFunction(()=>!document.getElementById('result-count').textContent.includes('読み込み中'));
  return p;
}
async function ready(p,title){await p.waitForFunction(title=>document.getElementById('work-title')?.textContent===title,title);}

test('all 131 assignments, scoped 18 and held 21 remain searchable',async t=>{
  const p=await page(t);assert.equal(await p.locator('#works li').count(),131);
  await p.locator('#coverage').selectOption('scoped');assert.equal(await p.locator('#works li').count(),18);
  await p.locator('#coverage').selectOption('pending');assert.equal(await p.locator('#works li').count(),21);
  await p.locator('#coverage').selectOption('all');await p.locator('#search').fill('八尺様');
  assert.equal(await p.locator('#works li').count(),1);await p.reload();assert.equal(await p.locator('#search').inputValue(),'八尺様');
  await p.locator('#search').fill('存在しない作品XXXX');assert.match(await p.locator('#works').textContent(),/該当する作品はありません/);
});
test('version switch keeps old scene labels and new condition judgments separate',async t=>{
  const p=await page(t,'?version=compare#G05-W18');await ready(p,'八尺様');
  assert.equal(await p.locator('.v1-panel').count(),1);assert.equal(await p.locator('.v3-panel').count(),1);
  assert.match(await p.locator('.v3-panel [data-type="C1"] summary').textContent(),/成立条件の根拠あり/);
  assert.match(await p.locator('.v3-panel [data-type="A3"] summary').textContent(),/選定場面で不成立/);
  assert.match(await p.locator('#detail').textContent(),/作品全体の削除・適合率の差を示しません/);
  await p.locator('#version').selectOption('v1');assert.equal(await p.locator('.v3-panel').count(),0);
  await p.reload();await ready(p,'八尺様');assert.equal(await p.locator('#version').inputValue(),'v1');
  await p.locator('#version').selectOption('v3');assert.equal(await p.locator('.v1-panel').count(),0);assert.equal(await p.locator('.v3-panel').count(),1);
  await p.evaluate(()=>{location.hash='G04-W03';});await ready(p,'渦人形');
  await p.locator('.record > details').first().locator('summary').click();
  assert.match(await p.locator('.record').textContent(),/偶発.*以前の要約/s);
});
test('evidence links resolve their owner on reload and reject another work evidence',async t=>{
  const p=await page(t,'#G05-W18/evidence-G05-W18-T1-2');await ready(p,'八尺様');
  assert.equal(await p.locator('#evidence-G05-W18-T1-2').isVisible(),true);
  await p.reload();await ready(p,'八尺様');assert.equal(await p.locator('#evidence-G05-W18-T1-2').isVisible(),true);
  await p.evaluate(()=>{location.hash='G05-W18/evidence-G02-W11-T1-2';});
  await p.waitForFunction(()=>document.querySelector('#detail [role=alert]'));
  assert.match(await p.locator('#detail').textContent(),/この作品の根拠が見つかりません/);
  assert.equal(await p.locator('#work-title').count(),0);
  await p.locator('#detail a').click();assert.equal(await p.locator('#works li').count(),131);
});
test('source-held assignment has no invented scene and returns from malformed link',async t=>{
  const p=await page(t,'#G05-W26');await ready(p,'ヲヲーンワ');
  assert.equal(await p.locator('.record').count(),0);assert.equal(await p.locator('.judgment').count(),26);
  assert.match(await p.locator('.v3-panel').textContent(),/本文保留/);
  await p.evaluate(()=>{location.hash='%ZZ';});await p.waitForFunction(()=>document.querySelector('#detail [role=alert]'));
  assert.equal(await p.locator('.judgment').count(),0);
  await p.locator('#detail a').click();assert.equal(await p.locator('#works li').count(),131);
});
test('mismatched v3 detail version stops display instead of borrowing v1 data',async t=>{
  const p=await page(t,'#G05-W18',undefined,async p=>{
    const fixture=JSON.parse(await readFile(resolve(docs,'v3/works.json'),'utf8'));fixture.version='other-version';
    await p.route('**/v3/works.json',route=>route.fulfill({json:fixture}));
  });
  await p.waitForFunction(()=>document.querySelector('#detail [role=alert]'));
  assert.equal(await p.locator('.record').count(),0);assert.equal(await p.locator('.v1-panel').count(),0);
  assert.match(await p.locator('#detail').textContent(),/作品データを読み込めません/);
});
test('mobile comparison fits viewport and keyboard focuses the selected work',async t=>{
  const p=await page(t,'?version=compare#G05-W25',{width:390,height:844});await ready(p,'リゾートバイト');
  assert.equal(await p.evaluate(()=>document.activeElement.id),'work-title');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.match(await p.locator('.v3-panel [data-type="A4"] summary').textContent(),/成立条件の根拠あり/);
  if(process.env.SITE_QA_DIR){await mkdir(process.env.SITE_QA_DIR,{recursive:true});await p.screenshot({path:resolve(process.env.SITE_QA_DIR,'v3-comparison-mobile.png'),fullPage:true});}
  await p.setViewportSize({width:1280,height:900});
  if(process.env.SITE_QA_DIR)await p.screenshot({path:resolve(process.env.SITE_QA_DIR,'v3-comparison-desktop.png'),fullPage:true});
});
