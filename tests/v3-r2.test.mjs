import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateR2Index, validateR2Work} from '../site/v3-r2.mjs';
const load=async name=>JSON.parse(await readFile(new URL('../docs/'+name,import.meta.url),'utf8'));
const index=await load('v3/r2/index.json');

test('all 131 r2 works keep reviewed conditions, holds and historical comparison scopes',async()=>{
  validateR2Index(index);let records=0,judgments=0,unextracted=0,holds=0;
  for(const entry of index.works){
    const w=await load(`v3/r2/works/${entry.work_id}.json`);validateR2Work(w,index,entry.work_id);
    records+=w.records.length;judgments+=w.records.reduce((n,r)=>n+r.conditions.length,0);
    unextracted+=w.v1_comparisons.filter(m=>m.relation==='not_reviewed_in_r2').length;
    if(w.inherited_narrative_status==='pending'){holds++;assert.equal(w.records.length,0);assert.ok(w.inherited_reason);assert.ok(w.v1_comparisons.every(m=>m.relation==='source_hold'));}
    for(const m of w.v1_comparisons)if(m.relation==='not_reviewed_in_r2'){assert.deepEqual(m.record_ids,[]);assert.deepEqual(m.selected_scope_differences,[]);}
  }
  assert.deepEqual([records,judgments,unextracted,holds],[118,9204,104,21]);
});
test('saved r1 index and detail data remain byte-identical',async()=>{
  const hashes={'v3/index.json':'377662f459e1c74eeab2532c5959b2248f4c49717e15e924c4852fe948e2dd3c','v3/works.json':'7941a3f8adb2124f87679ee25bf41a5e9d858b63a881d1e2ab9e396714974a4b'};
  for(const [name,expected] of Object.entries(hashes))assert.equal(createHash('sha256').update(await readFile(new URL('../docs/'+name,import.meta.url))).digest('hex'),expected);
});
test('foreign edition, work, evidence and altered condition result cannot render',async()=>{
  const original=await load('v3/r2/works/G05-W18.json');
  for(const mutate of [w=>w.version='v3-development-review-r1',w=>w.work_id='G05-W25',w=>w.records[0].conditions[0].inspected_evidence_ids=['G05-W25-R2-E-body'],w=>w.records[0].type_records[0].decision='fit']){
    const w=structuredClone(original);mutate(w);assert.throws(()=>validateR2Work(w,index,'G05-W18'),/mismatch/);
  }
  const bad=structuredClone(index);bad.independent_test_performed=true;assert.throws(()=>validateR2Index(bad),/mismatch/);
});
