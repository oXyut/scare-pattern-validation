import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterWorks,matchingScenes,normalise} from '../site/core.mjs';
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
