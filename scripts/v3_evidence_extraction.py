"""Validate authored r2 body-condition extraction; never fill omitted conditions."""
import argparse
from collections import Counter
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'research/v3-20261011-r2'
STATES = {'supported', 'explicitly_false', 'unknown'}


def read(path):
    return json.loads((ROOT / path).read_text())


def validate(data, reviews, narratives, codebook):
    if data['schema_version'] != 'v3-r2-authored-condition-extractions-1' or data['version'] != 'v3-development-review-r2':
        raise ValueError('Wrong extraction schema or research version')
    if data['codebook_id'] != codebook['codebook_id'] or data['partial_allowed'] is not False:
        raise ValueError('Do not change the frozen proposed criteria or allow partial')
    if any(data[k] is not False for k in ('independent_human_coding_performed', 'independent_test_performed')) or data['agreement'] is not None:
        raise ValueError('A reread is not independent coding or measured agreement')
    condition_ids = {c['id'] for c in codebook['common_required']}
    condition_ids.update(c['id'] for t in codebook['types'] for c in t['required_conditions'])
    if len(condition_ids) != 78:
        raise ValueError('The frozen codebook no longer contains 78 distinct conditions')
    works = {w['work_id']: w for w in narratives['works']}
    source_reviews = {r['review_id']: r for r in reviews['reviews']}
    if len(works) != 131 or len(source_reviews) != len(reviews['reviews']):
        raise ValueError('Changed assignment count or duplicate source review ID')
    seen = set()
    records_by_work = Counter()
    judgments = Counter()
    complete_source_works = {r['work_id'] for r in reviews['reviews']
                             if r['status'] == 'full_published_body_reread'}
    if len(complete_source_works) != reviews['fully_rechecked_published_bodies']:
        raise ValueError('Source reading progress disagrees with distinct work count')
    if set(source_reviews[r]['work_id'] for r in source_reviews) - works.keys():
        raise ValueError('Unknown work in source review')
    for rec in data['records']:
        wid = rec['work_id']
        if wid not in works or works[wid]['status'] == 'pending':
            raise ValueError('Cannot invent scenes for unknown or held works')
        rid = rec['record_id']
        if rid in seen or not rid.startswith(wid + '-'):
            raise ValueError('Duplicate or foreign record ID')
        seen.add(rid)
        if not all(rec.get(k) for k in ('actor', 'time_scope', 'selection_reason', 'world_layer', 'limitation')):
            raise ValueError('Actor, time, layer and selected scope are required')
        ev = {e['evidence_id']: e for e in rec['evidence']}
        if len(ev) != len(rec['evidence']) or not ev:
            raise ValueError('Duplicate or missing body evidence')
        for eid, e in ev.items():
            review = source_reviews.get(e['source_review_id'])
            if not eid.startswith(wid + '-') or not review or review['work_id'] != wid:
                raise ValueError('Evidence cannot borrow another work or review')
            allowed_urls = {review['url'], *review.get('additional_urls', [])}
            if e['url'] not in allowed_urls or not all(e.get(k) for k in ('range', 'layer', 'summary')):
                raise ValueError('Evidence URL/range/layer must belong to the inspected source')
        cs = rec['conditions']
        if {c['condition_id'] for c in cs} != condition_ids or len(cs) != len(condition_ids):
            raise ValueError('Every one of the 78 conditions must be authored exactly once')
        for c in cs:
            if c['state'] not in STATES or not c['reason'].strip():
                raise ValueError('Invalid condition state or missing reason')
            if c['inspection'] != 'explicit_body_condition_review':
                raise ValueError('Automatic expansion is not completed extraction')
            if not c['inspected_evidence_ids'] or set(c['inspected_evidence_ids']) - ev.keys():
                raise ValueError('Every authored judgment needs owned inspected evidence')
            if set(c['evidence_ids']) - ev.keys():
                raise ValueError('Foreign evidence ID')
            if c['state'] == 'unknown' and c['evidence_ids']:
                raise ValueError('Unknown does not have established supporting evidence')
            if c['state'] != 'unknown' and not c['evidence_ids']:
                raise ValueError('Supported or false requires explicit evidence')
            judgments[c['state']] += 1
        model = rec['world_model_evidence']
        for key in ('old_premise', 'new_evidence', 'evidence_scope', 'acceptance_and_threat',
                    'why_local_explanation_insufficient', 'alternative_hypotheses', 'limitation'):
            if key not in model or not model[key]:
                raise ValueError('F needs actual extracted fields and explicit limitations')
        by_id = {c['condition_id']: c for c in cs}
        for t in codebook['types']:
            ids = t['common_required_ids'] + [c['id'] for c in t['required_conditions']]
            states = [by_id[k]['state'] for k in ids]
            result = 'not_fit' if 'explicitly_false' in states else 'fit' if set(states) == {'supported'} else 'pending'
            judgments['type_' + result] += 1
        records_by_work[wid] += 1
    if set(works) != set(data['work_progress']):
        raise ValueError('Progress must cover the same 131 assignment IDs')
    completed = set()
    for wid, p in data['work_progress'].items():
        if p['inherited_narrative_status'] != works[wid]['status']:
            raise ValueError('Inherited narrative coverage changed')
        actual = records_by_work[wid]
        if p['completed_records'] != actual:
            raise ValueError('Record completion count differs from authored input')
        if p['condition_extraction_status'] == 'selected_records_complete':
            if not actual or wid not in complete_source_works:
                raise ValueError('Completed extraction requires authored records and full specified source reread')
            completed.add(wid)
        elif p['condition_extraction_status'] not in ('unextracted', 'source_hold') or actual:
            raise ValueError('Unextracted work cannot be counted as reviewed')
        if works[wid]['status'] == 'pending' and p['condition_extraction_status'] != 'source_hold':
            raise ValueError('Source hold must be kept distinct')
    return dict(assigned_entries=len(works), fully_rechecked_published_bodies=len(complete_source_works),
                condition_extraction_complete_works=len(completed), selected_records=sum(records_by_work.values()),
                distinct_conditions_per_record=len(condition_ids), explicitly_inspected_condition_judgments=sum(judgments[s] for s in STATES),
                condition_states={s: judgments[s] for s in sorted(STATES)},
                type_record_states={s: judgments['type_' + s] for s in ('fit', 'not_fit', 'pending')},
                inherited_narrative_counts=dict(Counter(w['status'] for w in works.values())))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = validate(read('research/v3-20261011-r2/condition-extractions.json'),
                      read('research/v3-20261011-r2/source-checks.json'),
                      read('site/narratives.json'), read('followup/classification/v3-codebook.json'))
    path = DIR / 'extraction-counts.json'
    content = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.check:
        if path.read_text() != content:
            raise ValueError('Extraction counts are stale')
    else:
        path.write_text(content)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
