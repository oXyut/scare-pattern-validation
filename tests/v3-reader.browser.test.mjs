import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const docs=resolve(fileURLToPath(new URL('../docs/',import.meta.url)));
const playwright=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
let server,browser,base;
before(async()=>{
  server=createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname.replace(/^\/scare-pattern-validation\//,'/');
    const path=resolve(docs,'.'+(pathname==='/'?'/index.html':pathname));
    if(!path.startsWith(docs+'/')){res.writeHead(404).end();return;}
    try{res.setHeader('Content-Type',{'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.json':'application/json'}[extname(path)]||'text/plain');res.end(await readFile(path));}catch{res.writeHead(404).end();}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));base=`http://127.0.0.1:${server.address().port}/`;
  browser=await playwright.chromium.launch({headless:true,...(process.env.SITE_BROWSER_EXECUTABLE?{executablePath:process.env.SITE_BROWSER_EXECUTABLE}:{channel:'chromium'})});
});
after(async()=>{await browser?.close();if(server)await new Promise(done=>server.close(done));});
async function page(t,suffix='',width=1280,intercept){
  const p=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});const errors=[];
  p.on('pageerror',error=>errors.push(error.message));t.after(async()=>{await p.close();assert.deepEqual(errors,[]);});
  if(intercept)await intercept(p);await p.goto(base+'v3-reader.html'+suffix);
  await p.waitForFunction(()=>!document.getElementById('result-count').textContent.includes('読み込み中'));return p;
}
async function ready(p,title){await p.waitForFunction(title=>document.getElementById('work-title')?.textContent===title,title);}
async function shot(p,name){if(process.env.SITE_QA_DIR){await mkdir(process.env.SITE_QA_DIR,{recursive:true});await p.screenshot({path:resolve(process.env.SITE_QA_DIR,name+'.png')});}}
test('search-first catalogue, Japanese group/type filters and pending scopes survive reload and empty/reset',async t=>{
  const p=await page(t);assert.equal(await p.locator('.reader-row').count(),131);
  assert.equal(await p.locator('a[href*="v3.html"]').count(),0);await shot(p,'reader-catalogue-desktop');
  await p.locator('#results').evaluate(e=>e.scrollIntoView({block:'start'}));await shot(p,'reader-results-desktop');
  await p.locator('#query').fill('八尺様');assert.equal(await p.locator('.reader-row').count(),1);
  await p.locator('#query').fill('');await p.locator('#group').selectOption('A');assert.equal(await p.locator('#decision').inputValue(),'fit');
  await p.locator('#type').selectOption('A2');assert.ok(await p.locator('.reader-row').count()>0);
  await p.locator('#decision').selectOption('pending');await p.locator('#sort').selectOption('title');
  const count=await p.locator('.reader-row').count();await p.reload();await p.waitForSelector('.reader-row');
  assert.equal(await p.locator('.reader-row').count(),count);assert.equal(await p.locator('#type').inputValue(),'A2');assert.equal(await p.locator('#decision').inputValue(),'pending');
  await p.locator('#filters button[type=reset]').click();await p.locator('#scope').selectOption('scoped');assert.equal(await p.locator('.reader-row').count(),18);
  await p.locator('#scope').selectOption('pending');assert.equal(await p.locator('.reader-row').count(),21);assert.equal(await p.locator('.reader-row .type-cluster').count(),0);
  await p.locator('#query').fill('絶対に存在しないxyz');await p.locator('#empty-reset').click();assert.equal(await p.locator('.reader-row').count(),131);assert.equal(await p.evaluate(()=>document.activeElement.id),'query');
  await p.locator('#group').selectOption('F');assert.equal(await p.locator('.reader-row').count(),0);assert.match(await p.locator('.empty').textContent(),/条件に合う項目がありません/);
});
test('v1 and v3 switch the same selected work, including v1 owned scene and source routes',async t=>{
  const p=await page(t,'#work=G05-W18');await ready(p,'八尺様');
  await p.locator('#v1-edition-link').click();await ready(p,'八尺様');assert.match(p.url(),/\/#work=G05-W18$/);
  await p.locator('#v3-edition-link').click();await ready(p,'八尺様');assert.equal(await p.locator('.reader-record').count(),2);
  for(const hash of ['scene-G05-W18-S02','source-G05-S18-01']){
    await p.goto(base+'#'+hash);await ready(p,'八尺様');assert.equal(await p.locator('#v3-edition-link').getAttribute('href'),'v3-reader.html#work=G05-W18');
    await p.locator('#v3-edition-link').click();await ready(p,'八尺様');
  }
});
test('summary, chronology, required condition evidence and world models retain separate layers and owned deep links',async t=>{
  const p=await page(t,'#work=G05-W18');await ready(p,'八尺様');
  assert.equal(await p.locator('.story-summary p').count(),3);assert.equal(await p.locator('.timeline-step').count(),4);
  assert.equal(await p.locator('.timeline-step .tag').count(),0);assert.equal(await p.locator('.reader-record').count(),2);
  assert.equal(await p.locator('.reader-judgment').count(),52);assert.equal(await p.locator('.reader-world').count(),2);
  assert.equal(await p.locator('.reader-missing').count(),1);assert.match(await p.locator('.timeline-step').last().textContent(),/未抽出.*不成立を意味しません/s);
  await shot(p,'reader-story-desktop');await p.locator('.timeline-heading').evaluate(e=>e.scrollIntoView({block:'start'}));await shot(p,'reader-timeline-desktop');
  const row=p.locator('.reader-record').first().locator('.reader-judgment[data-type=C1]');await row.locator('summary').click();
  assert.match(await row.textContent(),/根拠あり/);await row.scrollIntoViewIfNeeded();await shot(p,'reader-conditions-desktop');
  const evidence=row.locator('.evidence-ref a').first();const href=await evidence.getAttribute('href');await evidence.click();
  assert.equal(new URL(p.url()).hash,href);assert.equal(await p.locator('.reader-evidence:visible').count(),5);
  assert.ok((await p.evaluate(()=>document.activeElement.textContent)).includes('本文根拠'));
  await p.reload();await ready(p,'八尺様');assert.ok((await p.evaluate(()=>document.activeElement.textContent)).includes('本文根拠'));
  await p.goto(base+'v3-reader.html#work=G05-W18/evidence-G05-W25-V3-R2-R01-G05-W25-R2-E-body');await p.locator('#work-detail [role=alert]').waitFor();assert.equal(await p.locator('.reader-record').count(),0);
});
test('search and detail back/forward retain filters, title, and keyboard focus',async t=>{
  const p=await page(t,'?q=八尺様#catalogue',390);assert.equal(await p.locator('.reader-row').count(),1);
  const link=p.locator('.work-link');await link.focus();await p.keyboard.press('Enter');await ready(p,'八尺様');
  assert.equal(await p.evaluate(()=>document.activeElement.id),'work-title');
  await p.locator('.back-link').click();await p.waitForFunction(()=>!document.getElementById('report').hidden);
  assert.equal(await p.locator('#query').inputValue(),'八尺様');assert.equal(await p.locator('.reader-row').count(),1);
  await p.goBack();await ready(p,'八尺様');await p.goBack();await p.waitForFunction(()=>!document.getElementById('report').hidden);
  await p.goForward();await ready(p,'八尺様');
  await p.locator('#v1-edition-link').click();await ready(p,'八尺様');assert.equal(new URL(p.url()).searchParams.get('q'),'八尺様');await p.locator('#v3-edition-link').click();await ready(p,'八尺様');assert.equal(await p.locator('#query').inputValue(),'八尺様');await p.goBack();await ready(p,'八尺様');await p.goBack();await ready(p,'八尺様');assert.equal(await p.locator('#query').inputValue(),'八尺様');
  await p.goto(base+'v3-reader.html#type-A2');await p.waitForSelector('#type-A2[open]');
  await p.locator('#type-A2 .type-search').focus();await p.keyboard.press('Enter');await p.waitForFunction(()=>document.getElementById('type').value==='A2');assert.ok(await p.locator('.reader-row').count()>0);
});
test('held and scoped works retain reasons, no invented records, and safe failed/wrong-edition retrieval',async t=>{
  const p=await page(t,'#work=G05-W26',320);await ready(p,'ヲヲーンワ');assert.equal(await p.locator('.story-summary,.timeline-step,.reader-record,.reader-judgment').count(),0);
  assert.match(await p.locator('#classification').textContent(),/本文・同定保留.*証拠不明.*区別/s);await shot(p,'reader-held-mobile');
  await p.goto(base+'v3-reader.html#work=G03-W25');await ready(p,'妖怪退治の仕事してるけど、何か質問ある?');assert.match(await p.locator('.narrative-state').textContent(),/限定範囲/);assert.equal(await p.locator('.timeline-thread').count(),2);
  for(const bad of ['#%ZZ','#work=UNKNOWN']){await p.goto(base+'v3-reader.html'+bad);await p.locator('#work-detail [role=alert]').waitFor();assert.equal(await p.locator('.reader-record').count(),0);}
  const broken=await page(t,'#work=G05-W18',320,async p=>p.route('**/v3/r2/works/G05-W18.json',route=>route.fulfill({status:503,body:'offline'})));
  await broken.locator('#work-detail [role=alert]').waitFor();assert.equal(await broken.locator('.reader-record').count(),0);
  const wrong=await page(t,'#work=G05-W18',320,async p=>{
    const data=JSON.parse(await readFile(resolve(docs,'v3/r2/works/G05-W18.json'),'utf8'));data.version='v3-development-review-r1';
    await p.route('**/v3/r2/works/G05-W18.json',route=>route.fulfill({json:data}));
  });await wrong.locator('#work-detail [role=alert]').waitFor();assert.equal(await wrong.locator('.reader-record').count(),0);
});
test('all 131 works retain narrative and record counts, fit at 320px, and expose unique owned anchors',async t=>{
  const p=await page(t,'',320);const index=JSON.parse(await readFile(resolve(docs,'v3/reader-index.json'),'utf8'));const narratives=JSON.parse(await readFile(resolve(docs,'data.json'),'utf8')).narratives.works;
  for(const w of index.works){
    await p.evaluate(id=>{location.hash='work='+id;},w.work_id);await ready(p,w.title);
    assert.equal(await p.locator('.reader-record').count(),w.selected_record_count,w.work_id);
    const n=narratives.find(n=>n.work_id===w.work_id);assert.equal(await p.locator('.timeline-step').count(),n.threads.reduce((sum,t)=>sum+t.steps.length,0),w.work_id);
    await p.locator('#work-detail details').evaluateAll(nodes=>nodes.forEach(d=>d.open=true));
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,w.work_id);
    const ids=await p.locator('#work-detail [id]').evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(new Set(ids).size,ids.length,w.work_id);
  }
});
test('PC/mobile layouts, disclosures and forced colors keep readable Japanese names and keyboard focus',async t=>{
  const p=await page(t,'',390);await shot(p,'reader-catalogue-mobile');
  await p.locator('#results').evaluate(e=>e.scrollIntoView({block:'start'}));await shot(p,'reader-results-mobile');
  await p.locator('#query').fill('八尺様');await p.locator('.work-link').click();await ready(p,'八尺様');await shot(p,'reader-story-mobile');await p.locator('.timeline-heading').evaluate(e=>e.scrollIntoView({block:'start'}));await shot(p,'reader-timeline-mobile');
  await p.locator('.reader-record').first().evaluate(e=>e.scrollIntoView({block:'start'}));await shot(p,'reader-classification-mobile');
  const row=p.locator('.reader-record').first().locator('.reader-judgment[data-type=C1]');await row.locator('summary').focus();await p.keyboard.press('Enter');assert.equal(await row.getAttribute('open'),'');
  await p.emulateMedia({forcedColors:'active'});assert.notEqual(await row.locator('summary').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
  for(const width of [1280,900,768,601,390,320]){await p.setViewportSize({width,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,String(width));}
});
test('GitHub Pages project paths keep edition navigation and legacy comparison URLs intact',async t=>{
  const p=await page(t);const project=base+'scare-pattern-validation/';
  await p.goto(project+'v3-reader.html#work=G05-W18');await ready(p,'八尺様');assert.equal(await p.locator('.reader-record').count(),2);
  await p.locator('#v1-edition-link').click();await ready(p,'八尺様');assert.equal(new URL(p.url()).pathname,'/scare-pattern-validation/');
  await p.locator('#v3-edition-link').click();await ready(p,'八尺様');assert.equal(new URL(p.url()).pathname,'/scare-pattern-validation/v3-reader.html');
  await p.goto(project+'v3.html?edition=r2&version=compare#G05-W18');await ready(p,'八尺様');assert.equal(await p.locator('.v1-panel').count(),1);assert.equal(await p.locator('.record').count(),2);
  await p.goto(project+'v3.html#G05-W18/evidence-G05-W18-T1-2');await ready(p,'八尺様');assert.equal(await p.locator('#edition').inputValue(),'r1');
});
test('a delayed prior work cannot replace the newly selected actor/time/evidence',async t=>{
  let release;const gate=new Promise(done=>{release=done;});const requests=[];
  const p=await page(t,'#work=G05-W18',390,async p=>{
    p.on('request',request=>requests.push(new URL(request.url()).pathname));
    await p.route('**/v3/r2/works/G05-W18.json',async route=>{await gate;await route.continue();});
  });
  await p.waitForFunction(()=>document.getElementById('work-detail').textContent.includes('読み込み中'));
  await p.evaluate(()=>{location.hash='work=G04-W23';});await ready(p,'ヤマノケ');
  const response=p.waitForResponse('**/v3/r2/works/G05-W18.json');release();await response;
  assert.equal(await p.locator('#work-title').textContent(),'ヤマノケ');
  assert.equal(await p.locator('.reader-record[id*="G05-W18"]').count(),0);
  assert.deepEqual(requests.filter(path=>/\/r2\/works\//.test(path)).sort(),['/v3/r2/works/G04-W23.json','/v3/r2/works/G05-W18.json']);
  await p.goBack();await ready(p,'八尺様');assert.equal(await p.locator('.reader-record').count(),2);
});
