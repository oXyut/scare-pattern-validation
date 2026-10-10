export const statusLabels = {verified:'本文確認',partial:'部分確認',unverified:'未確認'};
export const normalise = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ja').replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0)-0x60));
const trackingText = work => [
  ...(work.target_outcomes || []).flatMap(row=>[row.target,row.Q,row.D,row.C,row.M]),
  ...(work.problem_tracking || []).flatMap(row=>[row.target,row.outcome,row.unresolved,row.transition]),
  work.outcome_tracking?.confirmed_or_reported_outcome, work.outcome_tracking?.unresolved_targets,
  ...[...(work.transitions || []),...(work.outcome_tracking?.transitions || [])].flatMap(row=>[row.retained_problem,row.closure_audit])
];
export function searchText(work) {
  const n=work.narrative;
  const narrativeText=n?[n.scope,n.reason,...Object.values(n.summary||{}),...n.threads.flatMap(t=>t.steps.flatMap(s=>[s.title,s.event,...s.fears.flatMap(f=>[f.fear,f.basis])]))]:[];
  return normalise([work.title,work.work_id,work.episode_scope,work.alias_or_derivative,work.overall_fears,work.unexplained_residue,work.counterexamples,...trackingText(work),...narrativeText,...work.scenes.flatMap(s=>[s.evidence_summary,s.Q,s.D,s.C,s.M,s.discriminators,s.residue,s.outcomes,...(s.transitions||[])])].join(' '));
}
export function matchingScenes(work, filters) {
  return work.scenes.filter(s=>(!filters.type || (filters.type==='none'?s.type_ids.length===0:s.type_ids.includes(filters.type))) && (!filters.fit || s.fit===filters.fit));
}
export function filterWorks(works, filters={}) {
  const terms=normalise(filters.q).trim().split(/\s+/u).filter(Boolean);
  return works.filter(w=>(!filters.status||w.body_status===filters.status) && (!filters.group||w.group_id===filters.group) && terms.every(t=>searchText(w).includes(t)) && matchingScenes(w,filters).length>0);
}

// Resolve every detail URL against the data, regardless of the previously rendered work.
export function resolveRoute(data, fragment) {
  let anchor;
  try {anchor=decodeURIComponent(fragment.replace(/^#/,''));}
  catch {return {kind:'invalid'};}
  const match=/^(work=|work-sources-|source-|scene-)(.*)$/su.exec(anchor);
  if (!match) return {kind:'report',anchor};
  const [,prefix,id]=match;
  const resource={ 'work=':'work', 'work-sources-':'work', 'source-':'source', 'scene-':'scene' }[prefix];
  let work;
  if(resource==='work') work=data.works.find(w=>w.work_id===id);
  if(resource==='scene') work=data.works.find(w=>w.scenes.some(s=>s.scene_id===id));
  if(resource==='source') {
    const source=data.sources.find(s=>s.source_id===id);
    if(source) work=data.works.find(w=>w.work_id===source.work_id);
  }
  return work ? {kind:'work',work,anchor:prefix==='work='?'work-title':anchor} : {kind:'missing',resource};
}
