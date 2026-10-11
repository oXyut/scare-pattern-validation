export const statusLabels = {verified:'本文確認',partial:'部分確認',unverified:'未確認'};
// The source IDs and four analytical axes remain unchanged. Only prose is expanded.
export const axisLabels = {Q:'問い（分かっていないこと）',D:'危険（予期される損失）',C:'選択（選べる行動と条件）',M:'世界モデル（安全・自己・因果などへの前提）'};
const axisNames = {Q:'問い',D:'危険',C:'選択',M:'世界モデル'};
export function readerText(value, vocabulary) {
  let text=String(value??'');
  for(const type of vocabulary.types){
    text=text.replaceAll(type.id+'「'+type.name+'」','「'+type.name+'」');
  }
  text=text.replace(/(?<![A-Za-z0-9_-])([A-F][1-5])(?![A-Za-z0-9_-])/g,(id)=>{
    const type=vocabulary.types.find(t=>t.id===id);return type?'「'+type.name+'」':id;
  }).replace(/(?<![A-Za-z0-9_-])([A-F])群/g,(whole,id)=>{
    const group=vocabulary.type_groups.find(g=>g.id===id);return group?'「'+group.name+'」の分類':whole;
  });
  // C is also a person's initial in two stories. Those literal references are not axes.
  const personC=/Cだけ|Cの(?:反応|再訪|死亡|死|損失|別の再接触)|(?:音源は何で、|トンネルでも雨音が続き、|救助する)C|Cにも接触/.test(text);
  for(const [id,name] of Object.entries(axisNames))text=text.replaceAll(name+id,name);
  return text.replace(/(?<![A-Za-z0-9_-])[QDCM](?![A-Za-z0-9_-]|子)/g,id=>id==='C'&&personC?id:axisNames[id]);
}
export function shortSynopsis(narrative) {
  if(!narrative||narrative.status==='pending')return '';
  // Independent candidates must not read as consecutive events in a single story.
  const independentSummaries={
    'G01-W09':'独立した二つの話。第2話では白いものを見た兄の様子が変わり、弟は再び見た後の経過が書かれない。第3話では遠くの白いものを見た子が搬送され、後年、休学したと伝え聞く。',
    'G03-W25':'第1話では家の異変に儀式で対処する。別の第15話では語り手と弟子が禁山で妖怪との取り決めを更新し、下山後に弟子が語り手を追う影を見た気がしたと話す。二話の間の経過やシリーズ全体は未確認。',
    'G04-W09':'独立した二つの候補。学校を徘徊する少女は教師には見えず、親に迎えられて下校した児童は十八年後も正体を知らない。別の話では一部の生徒だけが呼び出しを聞くが、呼び出し先へ行かず、母親も無事だった。',
    'G04-W12':'「降霊実験」「壷」の二篇のみ。前者では語り手が想像した家から抜けられなくなり、第三者の介入で戻る。後者では壷の周囲で異常を感じて逃げ、師匠は連れ戻される。シリーズ全体の結末は未確認。',
    'G05-W23':'教師Uが登場する独立した二つの候補。「光の誓い」では儀式の後に子供の不調が続き、教師は消える。「幽霊が出る部屋」では見えない児童がいる一方、教師と多くの子供が逃げる。'
  };
  if(independentSummaries[narrative.work_id])return independentSummaries[narrative.work_id];
  // Extract complete sentences from each part; never cut a negation or invent an ending.
  return ['opening','development','ending'].map(key=>{
    const text=narrative.summary[key];const end=text.indexOf('。');return end<0?text:text.slice(0,end+1);
  }).join('');
}
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
  return normalise([work.title,work.work_id,...(work.type_names||[]),...(work.type_group_names||[]),work.episode_scope,work.alias_or_derivative,work.overall_fears,work.unexplained_residue,work.counterexamples,...trackingText(work),...narrativeText,...work.scenes.flatMap(s=>[s.evidence_summary,s.Q,s.D,s.C,s.M,s.discriminators,s.residue,s.outcomes,...(s.transitions||[])])].join(' '));
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
