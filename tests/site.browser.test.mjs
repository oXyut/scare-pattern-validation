// Run with Playwright installed; SITE_QA_DIR optionally saves local QA images.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

const docs = fileURLToPath(new URL('../docs/', import.meta.url));
const playwright = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
let server, browser, base;
before(async () => {
  server = createServer(async (request, response) => {
    const path = resolve(docs, '.' + new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
    if (!path.startsWith(docs)) {response.writeHead(404).end(); return;}
    try {
      const body = await readFile(path);
      response.setHeader('Content-Type', {'.html':'text/html', '.mjs':'text/javascript', '.json':'application/json', '.css':'text/css', '.svg':'image/svg+xml'}[extname(path)] || 'text/plain');
      response.end(body);
    } catch {response.writeHead(404).end();}
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await playwright.chromium.launch({headless:true, channel:process.env.SITE_BROWSER_CHANNEL || 'chromium'});
});
after(async () => {await browser?.close(); if(server) await new Promise(done=>server.close(done));});

async function open(t, suffix='', viewport={width:1280,height:900}, fixture) {
  const page = await browser.newPage({viewport, reducedMotion:'reduce'});
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  t.after(async()=>{await page.close(); assert.deepEqual(errors,[]);});
  if(fixture) await page.route('**/data.json',route=>route.fulfill({json:fixture}));
  await page.goto(base+suffix);
  await page.waitForFunction(()=>!document.getElementById('result-count').textContent.includes('読み込み中'));
  return page;
}
async function checkWork(page, id, title, anchor) {
  await page.waitForFunction(({id,title,anchor})=>{
    const detail=document.getElementById('work-detail');
    return !detail.hidden && document.getElementById('work-title')?.textContent===title && detail.querySelector('.work-meta')?.textContent.includes(id) && document.activeElement.id===(anchor||'work-title');
  },{id,title,anchor},{timeout:5000}).catch(async error=>{
    error.message+=' '+JSON.stringify(await page.evaluate(()=>({hash:location.hash,active:document.activeElement?.outerHTML.slice(0,250)})));
    throw error;
  });
  assert.equal(await page.title(),`${title} | 洒落怖の問題状態を読む`);
  assert.equal(await page.locator('#report').isVisible(),false);
}
async function hash(page, value) {
  await page.evaluate(value=>{location.hash=value;},value);
  await page.waitForFunction(value=>location.hash===value,value);
}
async function screenshot(page, name) {
  if (!process.env.SITE_QA_DIR) return;
  await mkdir(process.env.SITE_QA_DIR,{recursive:true});
  await page.screenshot({path:resolve(process.env.SITE_QA_DIR,name+'.png')});
}

test('missing scene outcomes only point to a work tracking section when it exists',async t=>{
  // Synthetic missing columns exercise the fallback without changing the research snapshot.
  const fixture=JSON.parse(await readFile(resolve(docs,'data.json'),'utf8'));
  const withoutTracking=fixture.works.filter(w=>['G01-W01','G04-W01'].includes(w.work_id));
  for(const work of withoutTracking)work.scenes[0].outcomes='';
  const page=await open(t,'#work=G01-W01',undefined,fixture);
  for(const work of withoutTracking){
    await hash(page,'#work='+work.work_id);
    await checkWork(page,work.work_id,work.title);
    assert.equal(await page.locator('.work-tracking').count(),0);
    assert.match(await page.locator('.scene-more').first().textContent(),/場面単位の成果欄は未記録です。/);
    assert.doesNotMatch(await page.locator('.scene-more').first().textContent(),/対象別の成果・問題追跡/);
  }
  await hash(page,'#work=G02-W01');
  await checkWork(page,'G02-W01','アクロバティックサラサラ');
  assert.equal(await page.locator('.work-tracking').count(),1);
  assert.match(await page.locator('.scene-more').first().textContent(),/上の「対象別の成果・問題追跡」/);
});

test('source history resolves its owner after visiting another work',async t=>{
  const page=await open(t,'#catalogue');
  await page.locator('#results a[href="#work=G01-W01"]').click();
  await checkWork(page,'G01-W01','赤い仏像');
  await page.locator('.scene-source-list a[href="#source-G01-S001"]').first().click();
  await checkWork(page,'G01-W01','赤い仏像','source-G01-S001');
  await page.locator('.back-link').first().click();
  await page.locator('#results a[href="#work=G01-W02"]').click();
  await checkWork(page,'G01-W02','悪霊食い');
  await page.goBack();
  await page.waitForFunction(()=>!document.getElementById('report').hidden);
  await page.goBack();
  await checkWork(page,'G01-W01','赤い仏像','source-G01-S001');
  assert.equal(new URL(page.url()).hash,'#source-G01-S001');
  await screenshot(page,'desktop-source-history');
  await page.goForward();
  await page.waitForFunction(()=>!document.getElementById('report').hidden);
  await page.goForward();
  await checkWork(page,'G01-W02','悪霊食い');
});

test('direct source and scene links switch owners and survive back/forward',async t=>{
  const page=await open(t,'#source-G01-S001');
  await checkWork(page,'G01-W01','赤い仏像','source-G01-S001');
  await hash(page,'#scene-G02-W01-S01');
  await checkWork(page,'G02-W01','アクロバティックサラサラ','scene-G02-W01-S01');
  await hash(page,'#source-G01-S001');
  await checkWork(page,'G01-W01','赤い仏像','source-G01-S001');
  await page.goBack();
  await checkWork(page,'G02-W01','アクロバティックサラサラ','scene-G02-W01-S01');
  await page.goForward();
  await checkWork(page,'G01-W01','赤い仏像','source-G01-S001');
  await page.goto(base+'#scene-G03-W01-SC02');
  await checkWork(page,'G03-W01','赤福アキちゃん','scene-G03-W01-SC02');
});

test('unknown work/source/scene and malformed hash show recoverable link errors',async t=>{
  const page=await open(t,'#work=G01-W01');
  for(const value of ['#work=UNKNOWN','#source-UNKNOWN','#scene-UNKNOWN','#%ZZ','#%E0%A4%A']) {
    await hash(page,value);
    await page.waitForFunction(()=>!document.getElementById('work-detail').hidden && document.getElementById('route-error'));
    assert.match(await page.locator('#route-error').textContent(),/見つかりません|正しくありません/);
    assert.match(await page.title(),/見つかりません|正しくありません/);
    assert.doesNotMatch(await page.locator('#work-detail').textContent(),/悪霊食い|赤い仏像/);
    assert.doesNotMatch(await page.locator('#result-count').textContent(),/読み込めません/);
    await page.locator('.back-link').click();
    await page.waitForFunction(()=>!document.getElementById('report').hidden);
    assert.equal(await page.locator('#results tbody tr').count(),131);
  }
  for(const value of ['#source-UNKNOWN','#%ZZ']) {
    await page.goto(base+value);
    await page.waitForFunction(()=>document.getElementById('route-error'));
    assert.equal(await page.locator('#route-error').isVisible(),true);
    assert.doesNotMatch(await page.locator('#result-count').textContent(),/読み込めません/);
  }
});

test('query, all filters, empty results and URL history keep their selected values',async t=>{
  const page=await open(t,'?q=赤い仏像&status=verified&type=A2&fit=部分適合&group=group_01#catalogue');
  assert.equal(await page.locator('#results tbody tr').count(),1);
  await page.locator('#results a[href="#work=G01-W01"]').click();
  await checkWork(page,'G01-W01','赤い仏像');
  await page.locator('.back-link').first().click();
  await page.waitForFunction(()=>!document.getElementById('report').hidden);
  for(const [id,value] of Object.entries({query:'赤い仏像',status:'verified',type:'A2',fit:'部分適合',group:'group_01'})) assert.equal(await page.locator('#'+id).inputValue(),value);
  await page.goBack();
  await checkWork(page,'G01-W01','赤い仏像');
  await page.goForward();
  await page.waitForFunction(()=>!document.getElementById('report').hidden);
  assert.equal(await page.locator('#type').inputValue(),'A2');
  assert.equal(await page.locator('#query').inputValue(),'赤い仏像');
  await page.locator('#query').fill('絶対に存在しない検索語xyz987');
  assert.equal(await page.locator('#empty-reset').count(),1);
  await page.locator('#empty-reset').click();
  assert.equal(await page.locator('#results tbody tr').count(),131);
  assert.equal(new URL(page.url()).search,'');
  await page.goto(base+'?type=none&fit=不適合#catalogue');
  assert.equal(await page.locator('#results a[href="#work=G04-W19"]').count(),1);
  await screenshot(page,'desktop-negative-filter');
});

test('work tracking keeps outcomes, uncertainty, scene links and closure audits distinct',async t=>{
  const page=await open(t,'#work=G02-W01');
  await checkWork(page,'G02-W01','アクロバティックサラサラ');
  assert.match(await page.locator('.work-tracking').textContent(),/最初の投稿者/);
  assert.match(await page.locator('.work-tracking').textContent(),/由来・規則未解明/);
  await page.locator('.work-tracking a[href="#scene-G02-W01-S02"]').click();
  await checkWork(page,'G02-W01','アクロバティックサラサラ','scene-G02-W01-S02');
  await hash(page,'#work=G03-W01');
  await checkWork(page,'G03-W01','赤福アキちゃん');
  assert.match(await page.locator('.work-tracking').textContent(),/その場から退避/);
  assert.match(await page.locator('.work-tracking').textContent(),/正体・再接触/);
  await hash(page,'#work=G05-W01');
  await checkWork(page,'G05-W01','アケミちゃん');
  assert.match(await page.locator('.work-tracking').textContent(),/今回の追跡・監禁から離脱/);
  assert.match(await page.locator('.work-tracking').textContent(),/恒久安全は未確定/);
  assert.equal(await page.locator('.transition-record').count(),2);
  await page.locator('.work-tracking').evaluate(el=>el.scrollIntoView({block:'start'}));
  await screenshot(page,'desktop-work-outcomes');
  await hash(page,'#work=G03-W03');
  await page.waitForFunction(()=>document.getElementById('work-detail').textContent.includes('探索を実施'));
  assert.match(await page.locator('.work-tracking').textContent(),/探索を実施/);
  assert.match(await page.locator('.work-tracking').textContent(),/本文不足|資料同定/);
  assert.equal(await page.locator('.fit').first().textContent(),'本文不足');
});

test('mobile keyboard navigation, disclosure state and layout remain usable',async t=>{
  const page=await open(t,'?q=赤い仏像#catalogue',{width:390,height:844});
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#query').evaluate(el=>el===document.activeElement),true);
  const link=page.locator('#results a[href="#work=G01-W01"]');
  await link.focus(); await page.keyboard.press('Enter');
  await checkWork(page,'G01-W01','赤い仏像');
  await page.waitForFunction(()=>document.activeElement.id==='work-title');
  assert.equal(await page.locator('#work-title').evaluate(el=>el===document.activeElement),true);
  const summary=page.locator('.scene-more summary').first();
  await summary.focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('.scene-more').first().getAttribute('open'),'');
  await page.locator('.scene-source-list a[href="#source-G01-S001"]').first().focus();
  await page.keyboard.press('Enter');
  await checkWork(page,'G01-W01','赤い仏像','source-G01-S001');
  assert.equal(await page.locator('.scene-more').first().getAttribute('open'),'');
  assert.equal(await page.locator('#source-G01-S001').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#source-G01-S001 a').evaluate(el=>el===document.activeElement),true);
  assert.equal(await page.locator('#source-G01-S001 a').evaluate(el=>getComputedStyle(el).outlineWidth),'3px');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await screenshot(page,'mobile-source');
  await hash(page,'#work=G05-W01');
  await checkWork(page,'G05-W01','アケミちゃん');
  await page.locator('.work-tracking').evaluate(el=>el.scrollIntoView({block:'start'}));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await screenshot(page,'mobile-work-outcomes');
});

test('supplement displays all selected entries and never upgrades historical scene evidence',async t=>{
  const page=await open(t,'#followup');
  assert.match(await page.locator('#followup-counts').textContent(),/39.*全範囲確認0.*限定確認15.*未解決24/);
  await page.locator('#followup > details > summary').click();
  assert.equal(await page.locator('#followup-results tbody tr').count(),39);
  await screenshot(page,'desktop-followup-index');
  await page.locator('#followup-results a[href="#work=G03-W03"]').click();
  await checkWork(page,'G03-W03','井戸の足臭女');
  assert.equal(await page.locator('.work-meta .status').textContent(),'未確認');
  assert.equal(await page.locator('.fit').first().textContent(),'本文不足');
  assert.match(await page.locator('.work-followup').textContent(),/関連本文を限定確認/);
  assert.match(await page.locator('.work-followup').textContent(),/原割当|対象版|未同定|未確定/);
  const href=await page.locator('.work-followup .reference a').first().getAttribute('href');
  assert.match(href,/\/blob\/[0-9a-f]{40}\/followup\/sources\/group_03-05.md$/);
});

test('mobile supplement keeps failed, searched and read evidence distinct',async t=>{
  const page=await open(t,'#work=G01-W18',{width:390,height:844});
  await checkWork(page,'G01-W18','猫の忍者(ネットロア)');
  const supplement=page.locator('.work-followup');
  assert.match(await supplement.textContent(),/後続.*取得|原スレ/);
  const failed=supplement.locator('details').filter({hasText:'取得不能'}).first();
  await failed.locator('summary').click();
  assert.match(await failed.textContent(),/対象本文の読了なし/);
  assert.match(await failed.textContent(),/今回の失敗UTC/);
  assert.doesNotMatch(await failed.textContent(),/今回の取得UTC/);
  await failed.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await screenshot(page,'mobile-followup-failure');
  await page.goto(base+'#followup');
  await page.locator('#followup > details > summary').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});
