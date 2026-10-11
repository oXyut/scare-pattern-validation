import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateReaderIndex,validateReaderWork,filterReaderWorks,matchingRecords,parseReaderRoute,external} from '../site/v3-reader-core.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../docs/'+name,import.meta.url)));
const index=read('v3/reader-index.json');
test('navigation summaries equal every approved r2 record; underlying data are untouched',()=>{
  validateReaderIndex(index);
  const old=read('v3/r2/index.json');
  assert.equal(index.works.length,131);
  for(const entry of index.works){
    const work=read(`v3/r2/works/${entry.work_id}.json`);validateReaderWork(work,index,entry.work_id);
    for(const [key,value] of Object.entries(old.works.find(w=>w.work_id===entry.work_id)))assert.deepEqual(entry[key],value);
    assert.equal(entry.unextracted_count,work.v1_comparisons.filter(m=>m.relation==='not_reviewed_in_r2').length);
  }
  assert.equal(index.works.reduce((sum,w)=>sum+w.unextracted_count,0),104);
  assert.equal(filterReaderWorks(index,{scope:'pending'}).length,21);assert.equal(filterReaderWorks(index,{scope:'scoped'}).length,18);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../docs/data.json',import.meta.url))).digest('hex'),'a7bf52568a350bed322d4ab9c24bd0add9be0b658ee43f6a0fb32b524bdfb1f4');
});
test('type/result matching stays within a selected record and holds never become unknown judgments',()=>{
  const w={records:[{type_results:[{type_id:'A1',decision:'fit'},{type_id:'A2',decision:'pending'}]},{type_results:[{type_id:'A1',decision:'pending'},{type_id:'A2',decision:'not_fit'}]}]};
  assert.equal(matchingRecords(w,{type:'A1',decision:'not_fit'}).length,0);
  assert.equal(matchingRecords(w,{group:'A',type:'A2',decision:'pending'}).length,1);
  assert.equal(matchingRecords(w,{group:'F',type:'A1',decision:'fit'}).length,0);
  assert.equal(filterReaderWorks(index,{scope:'pending',decision:'pending'}).length,0);
  assert.equal(filterReaderWorks(index,{decision:'fit'}).length,57);
  assert.equal(filterReaderWorks(index,{group:'F',decision:'fit'}).length,0);
});
test('reader search, sorting and routes preserve scopes without importing old type assignments',()=>{
  const before=JSON.stringify(index);
  assert.equal(filterReaderWorks(index,{q:'八尺様'})[0].work_id,'G05-W18');
  assert.ok(filterReaderWorks(index,{q:'追われている'}).length>0);
  assert.equal(filterReaderWorks(index,{q:'絶対存在しないXYZ'}).length,0);
  filterReaderWorks(index,{sort:'title'});assert.equal(JSON.stringify(index),before);
  assert.equal(parseReaderRoute('#work=G05-W18',index).work.title,'八尺様');
  for(const hash of ['#%ZZ','#work=UNKNOWN','#source-UNKNOWN'])assert.equal(parseReaderRoute(hash,index).kind,'error');
  assert.equal(parseReaderRoute('#type-A2',index).kind,'report');
});
test('index/detail disagreement and foreign evidence reject display, and external URLs reject script execution',()=>{
  const altered=structuredClone(index);altered.works.find(w=>w.work_id==='G05-W18').records[0].type_results[0].decision='fit';
  assert.throws(()=>validateReaderIndex(altered));
  const work=read('v3/r2/works/G05-W18.json');
  work.records[0].conditions[0].inspected_evidence_ids=['G05-W25-R2-E-body'];
  assert.throws(()=>validateReaderWork(work,index,'G05-W18'));
  assert.equal(external('javascript:alert(1)','bad'),'bad');assert.ok(!external('https://example.com/"','<img>').includes('<img>'));
});
