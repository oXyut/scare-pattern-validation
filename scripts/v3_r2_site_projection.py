"""Project approved r2 evidence for the existing viewer, leaving research inputs intact."""
import json
from collections import Counter
from v3_evidence_extraction import ROOT, read, results, validate_identity


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n'


def outputs():
    folder = 'research/v3-20261011-r2/'
    authored = read(folder + 'condition-extractions.json')
    reviews = read(folder + 'source-checks.json')
    narratives = read('site/narratives.json')
    codebook = read('followup/classification/v3-codebook.json')
    identity = read(folder + 'identity-rechecks.json')
    validate_identity(identity, narratives, reviews)
    result = results(authored, reviews, narratives, codebook, read(folder + 'scene-correspondences.json'))
    if result != read(folder + 'selected-record-results.json'):
        raise ValueError('R2 reviewed result must be regenerated in its research branch first')
    v1 = read('docs/data.json')
    old = {w['work_id']: w for w in v1['works']}
    narrative = {w['work_id']: w for w in narratives['works']}
    identities = {w['work_id']: w for w in identity['works']}
    records = {r['record_id']: r for r in authored['records']}
    index_works = []
    output = {}
    for w in result['works']:
        wid = w['work_id']
        n = narrative[wid]
        recs = [dict(r, evidence=records[r['record_id']]['evidence'],
                     conditions=records[r['record_id']]['conditions']) for r in w['selected_records']]
        summary = n['summary']
        synopsis = ' '.join(summary[k] for k in ('opening', 'development', 'ending')) if summary else None
        counts = Counter(t['decision'] for r in recs for t in r['type_records'])
        index_works.append(dict(work_id=wid, title=w['title'], inherited_narrative_status=w['inherited_narrative_status'],
                                synopsis=synopsis, selected_record_count=len(recs),
                                type_record_counts={k: counts[k] for k in ('fit', 'not_fit', 'pending')}))
        detail = dict(w, schema_version='v3-r2-work-1', version=result['version'], codebook_id=result['codebook_id'],
                      v1_baseline_id=v1['baseline_id'], records=recs, scope=w['inherited_scope'],
                      limitations=w['inherited_limitations'], summary=summary,
                      v1_body_status=old[wid]['body_status'], v1_episode_scope=old[wid]['episode_scope'],
                      v1_historical_scenes=old[wid]['scenes'],
                      source_reviews=n['source_reviews'], investigation=n['investigation'],
                      identity_recheck=identities.get(wid))
        del detail['selected_records']
        output[f'docs/v3/r2/works/{wid}.json'] = compact(detail)
    index = dict(schema_version='v3-r2-view-index-1', version=result['version'], codebook_id=result['codebook_id'],
                 v1_baseline_id=v1['baseline_id'], types=codebook['types'], common_required=codebook['common_required'],
                 v1_types=v1['types'], type_groups=v1['type_groups'], counts=result['counts'],
                 independent_human_coding_performed=False, independent_test_performed=False, agreement=None,
                 comparison_counts=dict(Counter(m['relation'] for w in result['works'] for m in w['v1_comparisons'])),
                 comparison_caution=result['comparison_caution'], works=index_works)
    output['docs/v3/r2/index.json'] = compact(index)
    return output
