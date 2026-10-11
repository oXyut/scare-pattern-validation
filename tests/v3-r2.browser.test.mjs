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
    const path=resolve(docs,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));
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

async function rendered(p,edition='r2',mode='v3'){
  await p.waitForFunction(({edition,mode})=>document.querySelector('#work-title')&&document.querySelector('#edition').value===edition&&document.querySelector('#version').value===mode&&(!document.querySelector('#detail [role=status]')),{edition,mode});
}
const rec1='G05-W18-V3-R2-R01';
const evidence=`evidence-${rec1}-G05-W18-R2-E-c`;

test('r2 is the default; synopsis, scoped 18 and held 21 are distinct',async t=>{
  const p=await page(t);assert.equal(await p.locator('#edition').inputValue(),'r2');assert.equal(await p.locator('#works li').count(),131);
  assert.equal(await p.locator('#works .synopsis').count(),110);assert.match(await p.locator('#review-note').textContent(),/単一AI.*独立評価・一致度測定は未実施/);
  assert.match(await p.locator('#edition-info').textContent(),/9,204.*独立観測数.*旧104場面.*未抽出/);
  await p.locator('#coverage').selectOption('scoped');assert.equal(await p.locator('#works li').count(),18);
  await p.locator('#coverage').selectOption('pending');assert.equal(await p.locator('#works li').count(),21);assert.equal(await p.locator('#works .synopsis').count(),0);
  await p.locator('#coverage').selectOption('all');await p.locator('#search').fill('八尺様');await p.reload();assert.equal(await p.locator('#search').inputValue(),'八尺様');assert.equal(await p.locator('#works li').count(),1);
});
test('r2 night and vehicle judgments use different actors/time scopes and preserve unextracted scenes',async t=>{
  const p=await page(t,'?version=compare#G05-W18');await ready(p,'八尺様');
  assert.equal(await p.locator('.record').count(),2);assert.equal(await p.locator('.v1-panel').count(),1);
  assert.match(await p.locator('.record').nth(0).locator('[data-type="C1"] summary').textContent(),/必須条件の根拠が揃う/);
  assert.match(await p.locator('.record').nth(1).locator('[data-type="A2"] summary').textContent(),/必須条件の根拠が揃う/);
  assert.match(await p.locator('.record').nth(0).locator('[data-type="E5"] summary').textContent(),/明示的不成立/);
  const missing=p.locator('[data-relation="not_reviewed_in_r2"]');assert.equal(await missing.count(),1);assert.match(await missing.textContent(),/未抽出/);assert.equal(await missing.locator('a').count(),0);
  assert.match(await p.locator('.comparison-scope').textContent(),/削除・不成立ではなく/);
});
test('edition and version switches persist in URL and restore through back/forward',async t=>{
  const p=await page(t,'?q=八尺様&coverage=ready&version=compare#G05-W18');await rendered(p,'r2','compare');
  await p.locator('#edition').selectOption('r1');await rendered(p,'r1','compare');assert.equal(await p.locator('.record').count(),1);assert.match(p.url(),/edition=r1/);
  await p.locator('#version').selectOption('v1');await rendered(p,'r1','v1');assert.equal(await p.locator('.v3-panel').count(),0);
  await p.goBack();await rendered(p,'r1','compare');assert.equal(await p.locator('.record').count(),1);
  await p.goBack();await rendered(p,'r2','compare');assert.equal(await p.locator('.record').count(),2);assert.equal(await p.locator('#search').inputValue(),'八尺様');
  await p.goForward();await rendered(p,'r1','compare');assert.equal(await p.locator('.record').count(),1);
  await p.locator('#edition').selectOption('r2');await rendered(p,'r2','compare');await p.reload();await rendered(p,'r2','compare');assert.equal(await p.locator('.record').count(),2);
});
test('r2 evidence anchors open their record on reload and reject foreign record/edition references',async t=>{
  const p=await page(t,`?edition=r2#G05-W18/${evidence}`);await ready(p,'八尺様');assert.equal(await p.locator('#'+evidence).isVisible(),true);
  assert.equal(await p.evaluate(()=>document.activeElement.id),evidence);await p.reload();await ready(p,'八尺様');assert.equal(await p.locator('#'+evidence).isVisible(),true);
  await p.evaluate(()=>{location.hash='G05-W18/evidence-G05-W25-V3-R2-R01-G05-W25-R2-E-body';});await p.locator('#detail [role=alert]').waitFor();assert.equal(await p.locator('.record').count(),0);
  await p.goto(base+'?edition=r1#G05-W18/'+evidence);await p.locator('#detail [role=alert]').waitFor();assert.equal(await p.locator('.record').count(),0);
});
test('old evidence URLs select saved r1 without an edition parameter',async t=>{
  const p=await page(t,'#G05-W18/evidence-G05-W18-T1-2');await ready(p,'八尺様');assert.equal(await p.locator('#edition').inputValue(),'r1');assert.equal(await p.locator('#evidence-G05-W18-T1-2').isVisible(),true);
});
test('held r2 work has concrete reasons and sources but no invented record or condition',async t=>{
  const p=await page(t,'?version=compare#G05-W26',{width:390,height:844});await ready(p,'ヲヲーンワ');assert.equal(await p.locator('.record,.judgment').count(),0);assert.match(await p.locator('.v3-panel').textContent(),/本文.*確認できない.*判定を作成していません/s);
  if(process.env.SITE_QA_DIR){await mkdir(process.env.SITE_QA_DIR,{recursive:true});await p.locator('.v3-panel').evaluate(el=>el.scrollIntoView({block:'start'}));await p.screenshot({path:resolve(process.env.SITE_QA_DIR,'r2-held-mobile.png')});}
  assert.equal(await p.locator('[data-relation=source_hold]').count(),1);await p.locator('.v3-panel a').click();await ready(p,'ヲヲーンワ');assert.equal(await p.locator('#sources').getAttribute('open'),'');assert.match(p.url(),/#G05-W26\/sources/);
});
test('r2 refuses wrong versions and evidence ownership; saved r1 remains explicitly accessible',async t=>{
  for(const change of [w=>w.version='v3-development-review-r1',w=>w.records[0].conditions[0].inspected_evidence_ids=['G05-W25-R2-E-body']]){
    const p=await page(t,'#G05-W18',undefined,async p=>{
      const fixture=JSON.parse(await readFile(resolve(docs,'v3/r2/works/G05-W18.json'),'utf8'));change(fixture);
      await p.route('**/v3/r2/works/G05-W18.json',route=>route.fulfill({json:fixture}));
    });
    await p.locator('#detail [role=alert]').waitFor();assert.equal(await p.locator('.record,.v1-panel').count(),0);
    await p.locator('#edition').selectOption('r1');await ready(p,'八尺様');assert.equal(await p.locator('.record').count(),1);
  }
});
test('r2 requests only the selected work and changes back to the correct earlier work',async t=>{
  const requests=[];const p=await page(t,'#G05-W18',undefined,p=>{p.on('request',req=>requests.push(new URL(req.url()).pathname));});await ready(p,'八尺様');
  assert.deepEqual(requests.filter(path=>/\/r2\/works\//.test(path)),['/v3/r2/works/G05-W18.json']);assert.equal(requests.includes('/v3/works.json'),false);
  await p.evaluate(()=>{location.hash='G04-W23';});await ready(p,'ヤマノケ');await p.goBack();await ready(p,'八尺様');assert.equal(await p.locator('.record').count(),2);
});
test('320px all 131 r2 works fit, expose owned evidence, and preserve scoped/held labels',async t=>{
  const p=await page(t,'',{width:320,height:780});
  const works=JSON.parse(await readFile(resolve(docs,'v3/r2/index.json'),'utf8')).works;
  for(const w of works){
    await p.evaluate(id=>{location.hash=id;},w.work_id);await ready(p,w.title);
    await p.locator('#detail details').evaluateAll(nodes=>nodes.forEach(d=>d.open=true));
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,w.work_id);
    assert.equal(await p.locator('.record').count(),w.selected_record_count,w.work_id);
    const ids=await p.locator('#detail [id]').evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(new Set(ids).size,ids.length,w.work_id);
  }
});
test('PC/mobile comparison, keyboard and forced colors retain labels and focus',async t=>{
  const p=await page(t,'?version=compare#G05-W18',{width:390,height:844});await ready(p,'八尺様');assert.equal(await p.evaluate(()=>document.activeElement.id),'work-title');
  await p.locator('#version').focus();await p.locator('#version').selectOption('v3');await rendered(p);assert.equal(await p.evaluate(()=>document.activeElement.id),'version');
  await p.locator('#version').selectOption('compare');await rendered(p,'r2','compare');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(process.env.SITE_QA_DIR){await mkdir(process.env.SITE_QA_DIR,{recursive:true});await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:resolve(process.env.SITE_QA_DIR,'r2-controls-mobile.png')});await p.locator('#work-title').scrollIntoViewIfNeeded();await p.screenshot({path:resolve(process.env.SITE_QA_DIR,'r2-work-mobile.png')});await p.locator('.v3-panel').evaluate(el=>el.scrollIntoView({block:'start'}));await p.screenshot({path:resolve(process.env.SITE_QA_DIR,'r2-result-mobile.png')});await p.screenshot({path:resolve(process.env.SITE_QA_DIR,'r2-comparison-mobile.png'),fullPage:true});await p.locator('.comparison-scope').screenshot({path:resolve(process.env.SITE_QA_DIR,'r2-scope-mobile.png')});}
  await p.setViewportSize({width:1280,height:900});if(process.env.SITE_QA_DIR){await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:resolve(process.env.SITE_QA_DIR,'r2-controls-desktop.png')});await p.locator('.v3-panel').evaluate(el=>el.scrollIntoView({block:'start'}));await p.screenshot({path:resolve(process.env.SITE_QA_DIR,'r2-result-desktop.png')});await p.locator('.record').first().locator('[data-type=E5] > summary').click();await p.locator('.record').first().locator('[data-type=E5]').scrollIntoViewIfNeeded();await p.screenshot({path:resolve(process.env.SITE_QA_DIR,'r2-condition-desktop.png')});}
  await p.emulateMedia({forcedColors:'active'});assert.match(await p.locator('[data-type="C1"] summary').first().textContent(),/目の前の人.*根拠が揃う/);
  await p.locator('.skip').focus();await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>document.activeElement.id),'main');assert.equal(await p.locator('.v3-panel').count(),1);
});


test('scoped r2 keeps the older v1 unverified status and original scene without conflating them',async t=>{
  const p=await page(t,'?version=compare#G04-W01',{width:390,height:844});await ready(p,'赤いマフラーの女');
  assert.match(await p.locator('.edition-label').textContent(),/限定範囲/);
  assert.match(await p.locator('.v1-panel').textContent(),/v1の本文確認状態: × 本文未確認/);
  assert.match(await p.locator('.comparison-scope').textContent(),/原投稿同定は保留/);
  await p.locator('#sources summary').click();assert.match(await p.locator('#sources').textContent(),/同定の解消は未確認/);
  if(process.env.SITE_QA_DIR){await mkdir(process.env.SITE_QA_DIR,{recursive:true});await p.locator('.comparison-scope').scrollIntoViewIfNeeded();await p.screenshot({path:resolve(process.env.SITE_QA_DIR,'r2-scoped-mobile.png')});}
});
