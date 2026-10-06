export const statusLabels = {verified:'本文確認',partial:'部分確認',unverified:'未確認'};
export const normalise = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ja').replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0)-0x60));
export function searchText(work) {
  return normalise([work.title,work.work_id,work.episode_scope,work.alias_or_derivative,work.overall_fears,work.unexplained_residue,work.counterexamples,...work.scenes.flatMap(s=>[s.evidence_summary,s.Q,s.D,s.C,s.M,s.discriminators,s.residue])].join(' '));
}
export function matchingScenes(work, filters) {
  return work.scenes.filter(s=>(!filters.type || (filters.type==='none'?s.type_ids.length===0:s.type_ids.includes(filters.type))) && (!filters.fit || s.fit===filters.fit));
}
export function filterWorks(works, filters={}) {
  const terms=normalise(filters.q).trim().split(/\s+/u).filter(Boolean);
  return works.filter(w=>(!filters.status||w.body_status===filters.status) && (!filters.group||w.group_id===filters.group) && terms.every(t=>searchText(w).includes(t)) && matchingScenes(w,filters).length>0);
}
