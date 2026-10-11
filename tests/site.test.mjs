import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {axisLabels,readerText,shortSynopsis,filterWorks,matchingScenes,resolveRoute} from '../site/core.mjs';
const data=JSON.parse(readFileSync(new URL('../docs/data.json',import.meta.url)));
test('UI changes preserve every published research and narrative fact byte for byte',()=>{
  const digest=createHash('sha256').update(readFileSync(new URL('../docs/data.json',import.meta.url))).digest('hex');
  assert.equal(digest,'a7bf52568a350bed322d4ab9c24bd0add9be0b658ee43f6a0fb32b524bdfb1f4');
});
test('analytical prose uses the original axis and type meanings without changing person initials',()=>{
  assert.deepEqual(Object.keys(axisLabels),['Q','D','C','M']);
  assert.match(axisLabels.C,/選べる行動と条件/);
  assert.match(axisLabels.M,/安全・自己・因果/);
  assert.equal(readerText('原因Qを知ってもD継続。Cの決着とMの変化を分ける。',data),'原因問いを知っても危険継続。選択の決着と世界モデルの変化を分ける。');
  assert.equal(readerText('A2からB2へ。F群との区別。',data),'「追われている」から「閉じ込められている」へ。「人間と世界」の分類との区別。');
  assert.equal(readerText('D2「自分の身体が別のものになる」',data),'「自分の身体が別のものになる」');
  assert.equal(readerText('Q:音源は何で、Cは何を認識したか。',data),'問い:音源は何で、Cは何を認識したか。');
  assert.equal(readerText('死亡はCの損失による終結、他者には危険Dが残る。',data),'死亡はCの損失による終結、他者には危険が残る。');
  assert.equal(readerText('当事者D子の意図は不明。Dの回避を区別する。',data),'当事者D子の意図は不明。危険の回避を区別する。');
});
test('catalogue synopses excerpt all three existing parts and leave every pending story blank',()=>{
  for(const n of data.narratives.works){
    const text=shortSynopsis(n);
    if(n.status==='pending'){assert.equal(text,'');continue;}
    assert.ok(text.length>=40&&text.length<=200,n.work_id+' '+text.length);
    if(['G01-W09','G03-W25','G04-W09','G04-W12','G05-W23'].includes(n.work_id)){
      assert.equal(n.status,'scoped');
      if(n.work_id!=='G05-W23'){assert.match(text,/二つ|第15話|二篇/);continue;}
      assert.match(text,/独立した二つの候補/);assert.match(text,/光の誓い/);assert.match(text,/幽霊が出る部屋/);continue;
    }
    for(const part of ['opening','development','ending']){
      const sentence=n.summary[part].split('。')[0];assert.ok(text.includes(sentence),n.work_id+' '+part);
    }
  }
});
test('search by a displayed type or classification name retains every matching work',()=>{
  const works=data.works.map(w=>{
    const ids=new Set(w.scenes.flatMap(s=>s.type_ids));
    return {...w,type_names:data.types.filter(t=>ids.has(t.id)).map(t=>t.name),type_group_names:data.type_groups.filter(g=>Array.from(ids).some(id=>id[0]===g.id)).map(g=>g.name)};
  });
  for(const t of data.types){
    const found=new Set(filterWorks(works,{q:t.name}).map(w=>w.work_id));
    for(const w of filterWorks(works,{type:t.id}))assert.ok(found.has(w.work_id),t.name+' '+w.work_id);
  }
  for(const g of data.type_groups)assert.ok(filterWorks(works,{q:g.name}).length>0,g.name);
});
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
    assert.equal(resolveRoute(data,'#work-sources-'+work.work_id).work,work);
    assert.equal(resolveRoute(data,'#work-sources-'+work.work_id).anchor,'work-sources-'+work.work_id);
    for(const scene of work.scenes){
      const route=resolveRoute(data,'#scene-'+scene.scene_id);
      assert.equal(route.work,work);assert.equal(route.anchor,'scene-'+scene.scene_id);
    }
  }
  assert.equal(resolveRoute(data,'#work=G01%2DW01').work.work_id,'G01-W01');
});
test('synopsis prose participates in search without changing the historical filters',()=>{
  const works=data.works.map(w=>({...w,narrative:data.narratives.works.find(n=>n.work_id===w.work_id)}));
  assert.ok(filterWorks(works,{q:'神職は否定して焼却を終え'}).some(w=>w.work_id==='G03-W20'));
  assert.equal(filterWorks(works,{status:'unverified'}).length,25);
  assert.equal(filterWorks(works,{q:'神職は否定して焼却を終え',status:'unverified'}).length,0);
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
