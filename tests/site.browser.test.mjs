// Run with Playwright installed; SITE_QA_DIR optionally saves local QA images.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
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
  browser = await playwright.chromium.launch({headless:true,
    ...(process.env.SITE_BROWSER_EXECUTABLE ? {executablePath:process.env.SITE_BROWSER_EXECUTABLE}
      : {channel:process.env.SITE_BROWSER_CHANNEL || 'chromium'})});
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
    assert.doesNotMatch(await page.locator('.scene-more').first().textContent(),/作品全体・対象ごとの成果と残る問題/);
  }
  await hash(page,'#work=G02-W01');
  await checkWork(page,'G02-W01','アクロバティックサラサラ');
  assert.equal(await page.locator('.work-tracking').count(),1);
  assert.match(await page.locator('.scene-more').first().textContent(),/上の「作品全体・対象ごとの成果と残る問題」/);
});

test('source history resolves its owner after visiting another work',async t=>{
  const page=await open(t,'#catalogue');
  await page.locator('#results .work-link[href="#work=G01-W01"]').click();
  await checkWork(page,'G01-W01','赤い仏像');
  await page.locator('.scene-source-list a[href="#source-G01-S001"]').first().click();
  await checkWork(page,'G01-W01','赤い仏像','source-G01-S001');
  await page.locator('.back-link').first().click();
  await page.locator('#results .work-link[href="#work=G01-W02"]').click();
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
  await page.locator('#results .work-link[href="#work=G01-W01"]').click();
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
  assert.equal(await page.locator('#results .work-link[href="#work=G04-W19"]').count(),1);
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
  await page.waitForFunction(()=>document.getElementById('work-detail').textContent.includes('成果と残る問題は未確認'));
  assert.doesNotMatch(await page.locator('.work-tracking').textContent(),/探索を実施/);
  assert.match(await page.locator('.work-tracking').textContent(),/本文が不足.*物語の中で得られた成果としては扱いません/);
  assert.equal(await page.locator('.fit').first().textContent(),'本文不足');
});

test('mobile keyboard navigation, disclosure state and layout remain usable',async t=>{
  const page=await open(t,'?q=赤い仏像#catalogue',{width:390,height:844});
  for(const group of ['A','B','C','D','E','F']){
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('href')),'#type-group-'+group);
  }
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#query').evaluate(el=>el===document.activeElement),true);
  const link=page.locator('#results .work-link[href="#work=G01-W01"]');
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
  await supplement.locator(':scope > summary').click();
  assert.match(await supplement.textContent(),/後続.*取得|原スレ/);
  const failed=supplement.locator('details').filter({hasText:'取得不能'}).first();
  await failed.locator('summary').click();
  assert.match(await failed.textContent(),/対象本文の読了なし/);
  assert.match(await failed.textContent(),/取得を試みた日時（UTC）/);
  assert.doesNotMatch(await failed.textContent(),/取得した日時（UTC）/);
  await failed.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await screenshot(page,'mobile-followup-failure');
  await page.goto(base+'#followup');
  await page.locator('#followup > details > summary').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});

test('spoiler summary leads the detail; chronology, interpretation and v1 backlinks stay distinct',async t=>{
  const page=await open(t,'#work=G01-W01');
  await checkWork(page,'G01-W01','赤い仏像');
  assert.match(await page.locator('.narrative-heading').textContent(),/ネタバレあり/);
  assert.equal(await page.locator('.story-summary > p').count(),3);
  assert.equal(await page.locator('.timeline-thread').count(),2);
  assert.equal(await page.locator('.timeline-thread').last().locator('.fact-kind').textContent(),'作中で見た映像');
  assert.equal(await page.evaluate(()=>Boolean(document.querySelector('.work-narrative').compareDocumentPosition(document.querySelector('.work-original-analysis'))&Node.DOCUMENT_POSITION_FOLLOWING)),true);
  assert.equal(await page.locator('.work-original-analysis').getAttribute('open'),null);
  assert.equal(await page.locator('.timeline-arrow').count(),0);
  assert.equal(await page.locator('.timeline-node').count(),5);
  assert.match(await page.locator('.timeline-heading').textContent(),/未検証の改訂案を支持する結果でもありません/);
  await page.locator('.narrative-notes > summary').click();
  assert.match(await page.locator('.narrative-notes').textContent(),/本文を確認した日時（UTC）/);
  const analysis=page.locator('.timeline-analysis').first();
  await analysis.locator('summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await analysis.getAttribute('open'),'');
  const scene=page.locator('.timeline-scene a').first();
  const sceneId=(await scene.getAttribute('href')).slice(7);
  await scene.click();
  await checkWork(page,'G01-W01','赤い仏像','scene-'+sceneId);
  assert.equal(await page.locator('.narrative-notes').getAttribute('open'),'');
  assert.equal(await page.locator('.timeline-analysis').first().getAttribute('open'),'');
  await page.locator('.timeline-type[href="#type-A2"]').first().click();
  await page.waitForFunction(()=>!document.getElementById('report').hidden && document.getElementById('type-A2').open);
  await page.goBack();
  await checkWork(page,'G01-W01','赤い仏像','scene-'+sceneId);
});

test('all works are individually investigated; unconfirmed works keep reasons and source jumps',async t=>{
  const page=await open(t,'#catalogue');
  assert.equal(await page.locator('#poc-links a').count(),4);
  await page.locator('#poc-links a[href="#work=G02-W11"]').click();
  await checkWork(page,'G02-W11','猿夢');
  assert.equal(await page.locator('.work-narrative').getAttribute('data-narrative-status'),'ready');
  const fixture=JSON.parse(await readFile(resolve(docs,'data.json'),'utf8'));
  assert.match(await page.locator('#narrative-coverage').textContent(),/131.*110.*92.*18.*21/);
  for(const reason of ['identity_or_scope_pending','body_unavailable','retrieval_failed']){
    const n=fixture.narratives.works.find(w=>w.reason_codes.includes(reason));
    const w=fixture.works.find(w=>w.work_id===n.work_id);
    await hash(page,'#work='+w.work_id);
    await checkWork(page,w.work_id,w.title);
    assert.equal(await page.locator('.story-summary').count(),0);
    assert.equal(await page.locator('.story-timeline').count(),0);
    assert.match(await page.locator('.narrative-pending').textContent(),/未確認/);
    await page.locator('.narrative-notes > summary').click();
    await page.locator('.narrative-investigation > summary').click();
    assert.equal(await page.locator('.narrative-investigation li').count(),n.investigation.length);
    await page.locator('.narrative-jump').click();
    await checkWork(page,w.work_id,w.title,'work-sources-'+w.work_id);
  }
});

test('vertical flow remains legible without horizontal overflow at narrow mobile widths',async t=>{
  const page=await open(t,'#work=G05-W18',{width:390,height:844});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const positions=await page.locator('.timeline-card').evaluateAll(cards=>cards.map(c=>({top:c.getBoundingClientRect().top,width:c.getBoundingClientRect().width})));
    assert.ok(positions.every((p,i)=>p.width>=210 && (!i||p.top>positions[i-1].top)));
    await page.locator('.story-summary').evaluate(el=>el.scrollIntoView({block:'start'}));
    await screenshot(page,'narrative-mobile-'+width);
    await page.locator('.timeline-card').first().evaluate(el=>el.scrollIntoView({block:'start'}));
    await screenshot(page,'timeline-mobile-'+width);
  }
});

test('one-file review allows switching stories without any extra resource or data request',async t=>{
  const folder=await mkdtemp(resolve(tmpdir(),'scare-preview-'));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const file=resolve(folder,'preview.html');
  execFileSync('python3',[resolve(docs,'../scripts/build_site_preview.py'),file]);
  const page=await browser.newPage({viewport:{width:390,height:844}});
  t.after(()=>page.close());
  const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>requests.push(r.url()));
  const previewBody=await readFile(file,'utf8');
  await page.route(base+'offline-preview.html',route=>route.fulfill({contentType:'text/html',body:previewBody}));
  await page.goto(base+'offline-preview.html');
  await page.waitForFunction(()=>document.querySelectorAll('#poc-links a').length===4);
  await page.locator('#poc-links a[href="#work=G02-W11"]').click();
  await page.waitForFunction(()=>document.querySelector('.story-summary'));
  await checkWork(page,'G02-W11','猿夢');
  await page.locator('.poc-switch > summary').click();
  await page.locator('.poc-switch a[href="#work=G05-W18"]').click();
  await checkWork(page,'G05-W18','八尺様');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  assert.equal(requests.length,1);
});

async function checkRail(page){
  const rails=await page.locator('.story-timeline').evaluateAll(lists=>lists.map(list=>Array.from(list.children).map(li=>{
    const r=li.getBoundingClientRect(),node=li.querySelector('.timeline-node').getBoundingClientRect(),card=li.querySelector('.timeline-card').getBoundingClientRect(),line=getComputedStyle(li,'::before');
    return {nodeX:node.x+node.width/2,nodeY:node.y+node.height/2,cardLeft:card.left,cardRight:card.right,cardTop:card.top,lineX:r.x+parseFloat(line.left)+parseFloat(line.width)/2,lineEnd:r.y+parseFloat(line.top)+parseFloat(line.height),content:line.content};
  })));
  for(const steps of rails){
    for(let i=0;i<steps.length;i++){
      const s=steps[i];
      assert.ok(Math.abs(s.nodeX-steps[0].nodeX)<1,'nodes align on one axis');
      assert.ok(Math.abs(s.cardLeft-steps[0].cardLeft)<1,'cards share one edge');
      assert.ok(s.nodeX<s.cardLeft && s.cardRight<=await page.evaluate(()=>innerWidth),'axis stays beside the card');
      if(i<steps.length-1){
        assert.ok(Math.abs(s.lineX-s.nodeX)<1,'rail crosses node centers');
        assert.ok(Math.abs(s.lineEnd-steps[i+1].nodeY)<1,'rail connects the following node');
        assert.ok(s.cardTop<steps[i+1].cardTop,'reading order remains top to bottom');
      }else assert.equal(s.content,'none','rail stops at the final node');
    }
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
}

test('representative stories keep chronological DOM order and continuous aligned rails on PC and mobile',async t=>{
  const fixture=JSON.parse(await readFile(resolve(docs,'data.json'),'utf8'));
  const page=await open(t,'#work=G01-W01');
  for(const id of fixture.narratives.review_work_ids){
    const work=fixture.works.find(w=>w.work_id===id),n=fixture.narratives.works.find(w=>w.work_id===id);
    await hash(page,'#work='+id);await checkWork(page,id,work.title);
    assert.deepEqual(await page.locator('.timeline-card h4').allTextContents(),n.threads.flatMap(f=>f.steps.map(s=>s.title)));
    assert.deepEqual(await page.locator('.timeline-time').allTextContents(),n.threads.flatMap(f=>f.steps.map(s=>s.time)));
    for(const width of [1280,390,320]){
      await page.setViewportSize({width,height:900});
      await checkRail(page);
      await page.locator('.timeline-analysis').first().locator('summary').click();
      await page.locator('.timeline-evidence').first().locator('summary').click();
      await checkRail(page);
    }
  }
});

test('all 131 works render their complete narrative state and every new reference safely',async t=>{
  const fixture=JSON.parse(await readFile(resolve(docs,'data.json'),'utf8'));
  const page=await open(t,'#catalogue',{width:320,height:900});
  for(const n of fixture.narratives.works){
    const work=fixture.works.find(w=>w.work_id===n.work_id);
    await hash(page,'#work='+n.work_id);await checkWork(page,n.work_id,work.title);
    assert.equal(await page.locator('.work-narrative').getAttribute('data-narrative-status'),n.status);
    assert.equal(await page.locator('.timeline-card').count(),n.threads.reduce((sum,f)=>sum+f.steps.length,0));
    assert.equal(await page.locator('.story-summary').count(),n.status==='pending'?0:1);
    // Group order is the dictionary order; the story's steps remain chronological.
    const expectedTypes=n.threads.flatMap(thread=>thread.steps.flatMap(step=>step.fears.flatMap(fear=>
      fixture.type_groups.flatMap(group=>fear.type_ids.filter(id=>id[0]===group.id).map(id=>fixture.types.find(type=>type.id===id).name))
    )));
    assert.deepEqual(await page.locator('.timeline-type').allTextContents(),expectedTypes);
    assert.doesNotMatch(await page.locator('.scene .notation').allTextContents().then(x=>x.join(' ')),/[QDM](?:問い|危険|選択|世界モデル)|[A-F][1-5]/);
    await page.locator('.narrative-notes > summary').click();
    assert.equal(await page.locator('.narrative-source').count(),n.source_reviews.length);
    assert.equal(await page.locator('a[href="#source-"]').count(),0);
    assert.equal(await page.locator('a[href="#scene-"]').count(),0);
    if(n.historical_note)assert.match(await page.locator('.narrative-notes').textContent(),/分類の本文確認.*あらすじの参照範囲とは別/);
    if(n.source_reviews.some(r=>r.provenance==='new_source'))assert.match(await page.locator('.narrative-notes').textContent(),/分類資料の出典台帳とは別の参照本文/);
    if(n.threads.some(f=>f.steps.some(s=>s.fears.some(a=>a.classification_basis==='unclassified_new_evidence')))){
      assert.match(await page.locator('.timeline-fears').first().textContent(),/未分類（参照本文からの解釈）/);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,n.work_id);
  }
});

test('six Japanese group names and every catalogue type agree with the original dictionary',async t=>{
  const fixture=JSON.parse(await readFile(resolve(docs,'data.json'),'utf8'));
  const page=await open(t,'#catalogue');
  const legends=await page.locator('#classification-legend li').evaluateAll(nodes=>nodes.map(e=>({id:e.dataset.typeGroup,name:e.querySelector('a > span:not(.group-swatch)').textContent,count:Number(e.querySelector('small').textContent.replace('型',''))})));
  assert.deepEqual(legends,fixture.type_groups.map(g=>({id:g.id,name:g.name,count:fixture.types.filter(type=>type.id[0]===g.id).length})));
  const rows=await page.locator('#results tbody tr').evaluateAll(nodes=>nodes.map(row=>({id:row.querySelector('.work-link').getAttribute('href').slice(6),groups:[...row.querySelectorAll('.type-cluster')].map(group=>({id:group.dataset.typeGroup,name:group.querySelector('.type-group-label').textContent,types:[...group.querySelectorAll('.tag')].map(a=>({id:a.getAttribute('href').slice(6),name:a.textContent,title:a.title}))}))})));
  for(const row of rows){
    const work=fixture.works.find(w=>w.work_id===row.id);
    const ids=[...new Set(work.scenes.flatMap(s=>s.type_ids))].sort();
    assert.deepEqual(row.groups.flatMap(g=>g.types.map(type=>type.id)).sort(),ids,row.id);
    for(const group of row.groups){
      assert.equal(group.name,fixture.type_groups.find(g=>g.id===group.id).name);
      for(const type of group.types){assert.equal(type.id[0],group.id);assert.equal(type.name,fixture.types.find(t=>t.id===type.id).name);assert.ok(type.title.includes(group.name));}
    }
  }
  assert.deepEqual(await page.locator('#type optgroup').evaluateAll(nodes=>nodes.map(e=>e.label)),fixture.type_groups.map(g=>g.name));
  await page.locator('#classification-legend a[href="#type-group-D"]').click();
  await page.waitForFunction(()=>document.activeElement.id==='type-group-D');
  assert.equal(await page.locator('#type-group-D > h3').textContent(),'身体と自己5型');
  await page.locator('#type-D3 summary').click();await page.locator('#type-D3 .type-search').click();
  await page.waitForFunction(()=>document.getElementById('type').value==='D3');
  assert.match(await page.locator('#type-context').textContent(),/上位分類：身体と自己/);
  assert.equal(new URL(page.url()).searchParams.get('type'),'D3');
  await page.locator('#filters button[type=reset]').click();
  assert.equal(await page.locator('#results tbody tr').count(),131);
  assert.doesNotMatch(await page.locator('#type-context').textContent(),/上位分類：身体と自己/);
  await page.goto(base+'?type=none#catalogue');await page.waitForSelector('#empty-reset, #results tbody tr');
  assert.match(await page.locator('#type-context').textContent(),/型が付いていない場面/);
});

test('group accents stay consistent and readable across the legend, types, scenes and timeline',async t=>{
  const page=await open(t,'#catalogue');
  const fixture=JSON.parse(await readFile(resolve(docs,'data.json'),'utf8'));
  const colorMap=await page.locator('#classification-legend li').evaluateAll(nodes=>Object.fromEntries(nodes.map(e=>[e.dataset.typeGroup,getComputedStyle(e).getPropertyValue('--group-ink').trim()])));
  assert.equal(new Set(Object.values(colorMap)).size,6);
  let minimumContrast=Infinity;
  function luminance(rgb){return rgb.slice(0,3).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);}
  function contrast(fg,bg){const a=luminance(fg),b=luminance(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
  async function verify(){
    const groups=await page.locator('[data-type-group]').evaluateAll(nodes=>nodes.map(e=>{
      const cs=getComputedStyle(e),label=e.querySelector('.type-group-label')||e.querySelector('h3')||e.querySelector('a')||e;
      let parent=label,bg;
      while(parent){bg=getComputedStyle(parent).backgroundColor;if(!bg.startsWith('rgba')||!bg.endsWith(', 0)'))break;parent=parent.parentElement;}
      return {id:e.dataset.typeGroup,accent:cs.getPropertyValue('--group-ink').trim(),text:getComputedStyle(label).color.match(/[\d.]+/g).map(Number),bg:bg.match(/[\d.]+/g).map(Number)};
    }));
    for(const g of groups){const ratio=contrast(g.text,g.bg);minimumContrast=Math.min(minimumContrast,ratio);assert.equal(g.accent,colorMap[g.id]);assert.ok(ratio>=4.5,JSON.stringify(g));}
  }
  await verify();
  for(const g of fixture.type_groups){
    assert.equal(await page.locator('#type-group-'+g.id).getAttribute('data-type-group'),g.id);
    assert.equal(await page.locator('#type-group-'+g.id+' .type-entry').count(),fixture.types.filter(t=>t.id[0]===g.id).length);
  }
  await hash(page,'#work=G01-W01');await checkWork(page,'G01-W01','赤い仏像');await verify();
  await page.locator('.work-group-legend > summary').click();
  assert.equal(await page.locator('.work-group-legend .classification-legend-list li').count(),6);
  for(const width of [768,390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await checkRail(page);}
  t.diagnostic('Minimum group-label/link contrast: '+minimumContrast.toFixed(2)+':1');
  await page.emulateMedia({forcedColors:'active'});
  assert.match(await page.locator('.timeline-types').allTextContents().then(texts=>texts.join(' ')),/捕捉と侵入|因果と選択/);
  assert.equal(await page.locator('.timeline-type[href="#type-A2"]').first().isVisible(),true);
  await page.locator('.timeline-type[href="#type-A2"]').first().focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.getElementById('type-A2').open);
  assert.equal(await page.locator('#type-A2 > summary').textContent(),'追われている');
});

test('catalogue exposes spoiler excerpts and limited or pending states at desktop and mobile widths',async t=>{
  const page=await open(t,'#catalogue');
  assert.equal(await page.locator('.catalogue-synopsis:not(.synopsis-pending)').count(),110);
  assert.equal(await page.locator('.synopsis-pending').count(),21);
  assert.equal(await page.locator('.narrative-catalogue-state.scoped').count(),18);
  assert.equal(await page.locator('.synopsis-link').count(),131);
  assert.match(await page.locator('.results-table thead').textContent(),/ネタバレあり/);
  assert.match(await page.locator('#results tr').filter({has:page.locator('.work-link[href="#work=G04-W09"]')}).locator('.catalogue-synopsis').textContent(),/独立した二つの候補.*別の話/);
  assert.match(await page.locator('#results tr').filter({has:page.locator('.work-link[href="#work=G04-W12"]')}).locator('.catalogue-synopsis').textContent(),/降霊実験.*壷.*シリーズ全体の結末は未確認/);
  const fixture=JSON.parse(await readFile(resolve(docs,'data.json'),'utf8'));
  assert.deepEqual(await page.locator('#type optgroup').evaluateAll(groups=>groups.map(g=>g.label)),fixture.type_groups.map(g=>g.name));
  for(const type of fixture.types)assert.equal(await page.locator(`#type option[value="${type.id}"]`).textContent(),type.name);
  for(const width of [1280,768,390,320]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,String(width));
    const readable=await page.locator('.catalogue-synopsis').evaluateAll(rows=>rows.every(r=>r.getBoundingClientRect().width>=200));
    assert.equal(readable,true,String(width));
  }
  await page.locator('#results .synopsis-link[href="#work=G05-W23"]').click();
  await checkWork(page,'G05-W23','U先生');
  assert.equal(await page.locator('.work-narrative').getAttribute('data-narrative-status'),'scoped');
  await page.locator('.back-link').first().click();
  await page.locator('#results .synopsis-link[href="#work=G01-W05"]').click();
  assert.equal(await page.locator('.narrative-pending').count(),1);
  assert.equal(await page.locator('.story-summary').count(),0);
});

test('natural names are consistent in the dictionary, filters, scene tags and timeline links',async t=>{
  const page=await open(t,'?type=A2#catalogue');
  assert.equal(await page.locator('#type').inputValue(),'A2');
  assert.equal(await page.locator('#type option:checked').textContent(),'追われている');
  await page.locator('#query').fill('捕捉と侵入');
  assert.ok(await page.locator('#results tbody tr').count()>0);
  await page.locator('#results .work-link[href="#work=G01-W01"]').first().click();
  await checkWork(page,'G01-W01','赤い仏像');
  const typeLink=page.locator('.timeline-type[href="#type-A2"]').first();
  assert.equal(await typeLink.textContent(),'追われている');
  assert.equal(await page.locator('.scene .tag[href="#type-A2"]').first().textContent(),'追われている');
  await typeLink.click();
  assert.equal(await page.locator('#type-A2').getAttribute('open'),'');
  assert.equal(await page.locator('#type-A2 > summary').textContent(),'追われている');
  assert.doesNotMatch(await page.locator('#type-A2').textContent(),/A2|A1|Q：|D：|C：|M：/);
  assert.match(await page.locator('#type-A2').textContent(),/問い|危険|見つかりそう/);
  await page.locator('#type-A2 .type-search').click();
  await page.waitForSelector('#results tbody tr');
  assert.equal(new URL(page.url()).searchParams.get('type'),'A2');
  assert.ok(await page.locator('#results tbody tr').count()>0);
});

test('reader pages contain results and evidence instead of expansion history',async t=>{
  const page=await open(t,'#catalogue');
  assert.doesNotMatch(await page.locator('#report').textContent(),/追加調査|今回追加|全作品の個別調査|整備状況|次の評価は計画段階|実施率は0%|D5・E5/);
  await hash(page,'#work=G02-W08');
  await checkWork(page,'G02-W08','ギュウギュウ詰めの軽自動車');
  await page.locator('.narrative-notes > summary').click();
  assert.match(await page.locator('.narrative-notes').textContent(),/分類の本文確認.*未確認/);
  assert.doesNotMatch(await page.locator('#work-detail').textContent(),/今回追加|旧v1|今回の本文照合|追加調査/);
  assert.match(await page.locator('.narrative-notes').textContent(),/確認した本文|照合の根拠|本文を確認した日時/);
  await hash(page,'#work=G02-W19');
  await checkWork(page,'G02-W19','禁后');
  assert.match(await page.locator('.scene-analysis').allTextContents().then(x=>x.join(' ')),/D子/);
  assert.doesNotMatch(await page.locator('#work-detail').textContent(),/危険子/);
});

test('long synthetic event, date and label wrap without shifting the rail or obscuring keyboard links',async t=>{
  const fixture=JSON.parse(await readFile(resolve(docs,'data.json'),'utf8'));
  const step=fixture.narratives.works.find(w=>w.work_id==='G02-W11').threads[0].steps[1];
  step.event='長文折返し検証用。'.repeat(70)+'UnbrokenLongText'.repeat(30);
  step.time='時刻ラベルの折返しを確認する合成入力'.repeat(3);
  fixture.types.find(t=>t.id==='E1').name='分類ラベルの長文折返し検証用'.repeat(6);
  const page=await open(t,'#work=G02-W11',{width:320,height:844},fixture);
  await checkRail(page);
  assert.ok(await page.locator('.timeline-step').nth(1).evaluate(e=>e.getBoundingClientRect().height)>700);
  const analysis=page.locator('.timeline-analysis').first();
  await analysis.locator('summary').focus();await page.keyboard.press('Enter');
  assert.equal(await analysis.getAttribute('open'),'');
  await checkRail(page);
  await analysis.locator('.timeline-scene a').focus();await page.keyboard.press('Enter');
  await checkWork(page,'G02-W11','猿夢','scene-'+step.fears[0].scene_id);
  assert.equal(await analysis.getAttribute('open'),'');
});
