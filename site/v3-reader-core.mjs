import {validateR2Index,validateR2Work} from './v3-r2.mjs';
export const scopeNames={ready:'○ 指定本文のあらすじ',scoped:'△ 限定範囲・候補のあらすじ',pending:'× 本文・同定保留'};
export const decisionNames={fit:'必須条件の根拠が揃う',pending:'条件の証拠が不足・保留',not_fit:'明示的不成立の条件あり'};
export const stateNames={supported:'根拠あり',unknown:'証拠不明',explicitly_false:'明示的不成立'};
export const factNames={narrated:'作中の出来事',dream:'夢の中の出来事',reported:'作中の伝聞',inference:'語り手の推測',vision:'作中で見た映像',embedded_story:'作中で語られる別の話'};
export const keys=['q','scope','group','type','decision','sort'];
export const fieldIds=['query','scope','group','type','decision','sort'];
// Only the shared text query crosses editions; their classification filters have different meanings.
export function editionHref(path,id,query=''){
  return path+(query?'?'+new URLSearchParams({q:query}):'')+(id?'#work='+id:'');
}
export const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
export function validateReaderIndex(index){
  validateR2Index(index);
  if(index.reader_schema_version!=='v3-reader-index-1')throw new Error('閲覧データの版が一致しません');
  for(const w of index.works){
    if(w.records.length!==w.selected_record_count||new Set(w.records.map(r=>r.record_id)).size!==w.records.length)throw new Error('選定記録数が一致しません');
    const counts={fit:0,pending:0,not_fit:0};
    for(const r of w.records){
      if(!r.record_id.startsWith(w.work_id+'-V3-R2-')||r.type_results.length!==26||new Set(r.type_results.map(t=>t.type_id)).size!==26)throw new Error('選定記録の参照が一致しません');
      for(const t of r.type_results){if(!index.types.some(type=>type.id===t.type_id)||!Object.hasOwn(counts,t.decision))throw new Error('型別結果が一致しません');counts[t.decision]++;}
    }
    if(Object.keys(counts).some(k=>counts[k]!==w.type_record_counts[k]))throw new Error('型別結果の集計が一致しません');
  }
}
export function matchingRecords(work,filters){
  if(!filters.group&&!filters.type&&!filters.decision)return work.records;
  return work.records.filter(r=>r.type_results.some(t=>(!filters.group||t.type_id[0]===filters.group)&&(!filters.type||t.type_id===filters.type)&&(!filters.decision||t.decision===filters.decision)));
}
export function validateReaderWork(work,index,id){
  validateR2Work(work,index,id);
  const expected=index.works.find(w=>w.work_id===id).records;
  const actual=work.records.map(r=>({record_id:r.record_id,actor:r.actor,time_scope:r.time_scope,anticipated_loss:r.anticipated_loss,type_results:r.type_records.map(t=>({type_id:t.type_id,decision:t.decision}))}));
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('一覧と作品の条件結果が一致しません');
}
export function filterReaderWorks(index,filters={}){
  const words=normalize(filters.q).trim().split(/\s+/).filter(Boolean);
  const found=index.works.filter(w=>{
    if(filters.scope&&w.inherited_narrative_status!==filters.scope)return false;
    if((filters.group||filters.type||filters.decision)&&!matchingRecords(w,filters).length)return false;
    const ids=new Set(w.records.flatMap(r=>r.type_results.filter(t=>t.decision==='fit').map(t=>t.type_id)));
    const text=normalize([w.title,w.synopsis,w.reason,w.scope,...w.records.flatMap(r=>[r.actor,r.time_scope,r.anticipated_loss]),...index.types.filter(t=>ids.has(t.id)).map(t=>t.name),...index.type_groups.filter(g=>[...ids].some(id=>id[0]===g.id)).map(g=>g.name)].join(' '));
    return words.every(word=>text.includes(word));
  });
  if(filters.sort==='original')return found;
  const ranks={ready:0,scoped:1,pending:2};
  return found.sort((a,b)=>(filters.sort==='title'?0:ranks[a.inherited_narrative_status]-ranks[b.inherited_narrative_status])||a.title.localeCompare(b.title,'ja'));
}
export function parseReaderRoute(hash,index){
  let decoded;try{decoded=decodeURIComponent(hash.replace(/^#/,''));}catch{return {kind:'error'};}
  if(!decoded||['catalogue','types'].includes(decoded)||index.types.some(t=>decoded==='type-'+t.id))return {kind:'report',anchor:decoded};
  const match=/^work=([^/]+)(?:\/(.+))?$/.exec(decoded);
  const work=match&&index.works.find(w=>w.work_id===match[1]);
  return work?{kind:'work',work,anchor:match[2]||'work-title'}:{kind:'error'};
}
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function external(url,label){try{const u=new URL(url);if(/^https?:$/.test(u.protocol))return `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;}catch{}return esc(label);}
