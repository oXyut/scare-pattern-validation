import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterWorks,matchingScenes,resolveRoute} from '../site/core.mjs';
const data=JSON.parse(readFileSync(new URL('../docs/data.json',import.meta.url)));
test('public edition retains the complete inventory and separates missing evidence',()=>{
  assert.equal(data.works.length,131);
  assert.equal(new Set(data.works.map(w=>w.work_id)).size,131);
  for(const [state,count] of Object.entries({verified:92,partial:14,unverified:25}))assert.equal(filterWorks(data.works,{status:state}).length,count);
  const scenes=data.works.flatMap(w=>w.scenes);
  assert.equal(scenes.length,258);
  for(const [fit,count] of Object.entries({'適合':75,'部分適合':141,'不適合':17,'本文不足':25}))assert.equal(scenes.filter(s=>s.fit===fit).length,count);
  assert.equal(data.sources.length,166);assert.equal(data.sources.filter(s=>s.url).length,157);
  assert.equal(data.counts.independent_works_exact_total,null);
});
test('title, kana, ID and analysis searches work; absent query returns empty',()=>{
  assert.equal(filterWorks(data.works,{q:'ヒョウタンヘビ'})[0].work_id,'G04-W19');
  assert.equal(filterWorks(data.works,{q:'ひょうたんへび'})[0].work_id,'G04-W19');
  assert.equal(filterWorks(data.works,{q:'ｇ０４－ｗ１９'}).length,1);
  assert.ok(filterWorks(data.works,{q:'継続 管理'}).length>0);
  assert.equal(filterWorks(data.works,{q:'絶対に存在しない検索語xyz987'}).length,0);
  assert.equal(filterWorks(data.works,{}).length,131);
});
test('type and fit must match the same scene, rather than two scenes in a work',()=>{
  const fixture=[{work_id:'TEST',title:'',scenes:[{type_ids:['A1'],fit:'適合'},{type_ids:['A2'],fit:'不適合'}]}];
  assert.equal(filterWorks(fixture,{type:'A1',fit:'不適合'}).length,0);
  assert.equal(filterWorks(fixture,{type:'A2',fit:'不適合'}).length,1);
  assert.equal(matchingScenes(fixture[0],{type:'A1'}).length,1);
  const negative=filterWorks(data.works,{type:'none',fit:'不適合'});
  assert.ok(negative.some(w=>w.work_id==='G04-W19'));
  assert.equal(filterWorks(data.works,{status:'unverified',fit:'適合'}).length,0);
});
test('public data keeps source references resolvable and labels in fixed v1',()=>{
  const ids=new Set(data.sources.map(s=>s.source_id));
  const typeIds=new Set(data.types.map(t=>t.id));
  assert.equal(typeIds.size,26);
  for(const w of data.works){
    for(const id of w.source_ids)assert.ok(ids.has(id));
    for(const s of w.scenes){for(const id of s.source_ids)assert.ok(ids.has(id));for(const id of s.type_ids)assert.ok(typeIds.has(id));}
  }
  assert.equal(data.baseline_id,'fear-patterns-v1-26types');
  assert.equal(data.conclusion.new_types_adopted,0);
  assert.equal(data.conclusion.received_candidate_count,8);
});
test('public output excludes execution details and confidential credential forms',()=>{
  const text=JSON.stringify(data);
  assert.doesNotMatch(text,/\/Users\/|\/home\/|sediment:\/\/|file:\/\/|(?:conversation|thread|library)[_-]id|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}/i);
  for(const s of data.sources){if(s.url){const url=new URL(s.url);assert.ok(['https:','http:'].includes(url.protocol));assert.equal(url.username,'');assert.equal(url.password,'');}}
});
test('all source and scene anchors resolve the correct owner independently of earlier navigation',()=>{
  for(const source of data.sources){
    const route=resolveRoute(data,'#source-'+source.source_id);
    assert.equal(route.kind,'work');assert.equal(route.work.work_id,source.work_id);
    assert.equal(route.anchor,'source-'+source.source_id);
  }
  for(const work of data.works){
    assert.equal(resolveRoute(data,'#work='+work.work_id).work,work);
    for(const scene of work.scenes){
      const route=resolveRoute(data,'#scene-'+scene.scene_id);
      assert.equal(route.work,work);assert.equal(route.anchor,'scene-'+scene.scene_id);
    }
  }
  assert.equal(resolveRoute(data,'#work=G01%2DW01').work.work_id,'G01-W01');
});
test('missing and malformed detail links cannot silently resolve to a prior work',()=>{
  for(const hash of ['#work=UNKNOWN','#work=','#source-UNKNOWN','#scene-UNKNOWN'])assert.equal(resolveRoute(data,hash).kind,'missing');
  for(const hash of ['#%ZZ','#%E0%A4%A','#source-%'])assert.equal(resolveRoute(data,hash).kind,'invalid');
  for(const hash of ['','#catalogue','#type-A1'])assert.equal(resolveRoute(data,hash).kind,'report');
});
test('new work tracking text is searchable without changing scene filter semantics',()=>{
  for(const [q,id] of [['事故後の安否は伝聞と推測が残る','G02-W01'],['その場から退避','G03-W01'],['投稿まで再発なし','G05-W01']])assert.ok(filterWorks(data.works,{q}).some(w=>w.work_id===id));
  for(const group of ['group_02','group_03','group_05']){
    const works=data.works.filter(w=>w.group_id===group);
    assert.equal(works.length,26);
    assert.ok(works.every(w=>w.target_outcomes||w.problem_tracking||w.outcome_tracking));
    // These groups track outcomes at work/target level. Do not invent scene-level values.
    assert.ok(works.every(w=>w.scenes.every(s=>s.outcomes==='')));
  }
  assert.doesNotMatch(JSON.stringify(data),/"(?:target_id|subject_id|problem_id)"/);
});
