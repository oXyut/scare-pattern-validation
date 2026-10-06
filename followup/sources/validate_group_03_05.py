#!/usr/bin/env python3
"""Validate the followup coverage, source chronology and historical preservation."""
import argparse
from collections import Counter
import csv
from datetime import datetime
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATUSES = {'confirmed', 'partial', 'unresolved'}
FIELDS = {'work_id', 'title', 'old_status', 'followup_status', 'original_episode_scope',
          'original_source_ids', 'original_source_records', 'reviewed_scope',
          'evidence_summary', 'unresolved_reason', 'alias_or_series_cautions',
          'assignment_identity_confirmed', 'full_assigned_scope_reviewed',
          'source_observations'}


def validate(check_protected=False):
    data = json.loads((ROOT / 'followup/sources/group_03-05.json').read_text())
    historical = json.loads((ROOT / 'integration/data/summary.json').read_text())
    expected = {w['work_id']: w for w in historical['assignment_inventory']
                if w['work_id'][:3] in {'G03', 'G04', 'G05'}
                and w['body_status'] in {'partial', 'unverified'}}
    old_sources = {}
    for group in ('03', '04', '05'):
        with (ROOT / f'groups/group_{group}/sources/ledger.csv').open() as handle:
            old_sources.update({r['source_id']: r for r in csv.DictReader(handle)})
    errors = []

    def check(ok, message):
        if not ok:
            errors.append(message)

    def valid_utc(value):
        try:
            dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
            return dt.utcoffset() is not None and dt.utcoffset().total_seconds() == 0
        except (ValueError, TypeError, AttributeError):
            return False

    works = data['works']
    ids = [w['work_id'] for w in works]
    check(len(ids) == len(set(ids)) == 24 and set(ids) == set(expected), 'expected exactly the 24 selected assignments')
    old_counts = dict(Counter(w['old_status'] for w in works))
    check(old_counts == {'partial': 10, 'unverified': 14} == data['scope']['old_status_counts'], 'historical selected status counts differ')
    counts = {status: sum(w['followup_status'] == status for w in works) for status in sorted(STATUSES)}
    check(counts == data['scope']['followup_status_counts'], 'followup status counts differ')
    check(data['historical_v1_counts'] == historical['counts'], 'historical aggregate changed')
    check(data['historical_candidate_counts'] == {'proposed': 8, 'accepted': 0}, 'historical candidate counts differ')
    check(data['independent_works_exact_total'] is None, 'independent exact count must remain unknown')
    check(valid_utc(data['created_at_utc']), 'invalid creation UTC')
    observation_ids = []

    def validate_observation(o, label):
        observation_ids.append(o['source_id'])
        check(o['retrieval_status'] in {'success', 'failed', 'search_completed'}, f'{label}: invalid retrieval status')
        start, finish = o['attempt_started_at_utc'], o['attempt_finished_at_utc']
        check(valid_utc(start) and valid_utc(finish), f'{label}: invalid attempt UTC')
        if valid_utc(start) and valid_utc(finish):
            check(datetime.fromisoformat(start.replace('Z', '+00:00')) <= datetime.fromisoformat(finish.replace('Z', '+00:00')), f'{label}: reversed interval')
        check(isinstance(o['body_reviewed'], bool), f'{label}: body_reviewed must be boolean')
        check(bool(o['reviewed_scope'] and o['variant'] and o['evidence_summary']), f'{label}: missing scope/version/evidence')
        if o['retrieval_status'] == 'success':
            check(o['url'] and o['url'].startswith('https://'), f'{label}: successful retrieval needs public HTTPS URL')
            check(o['accessed_at_utc'] == finish and valid_utc(o['accessed_at_utc']), f'{label}: invalid access UTC')
            check(o['searched_at_utc'] is None and o['failed_at_utc'] is None, f'{label}: mixed successful/failed/search timestamps')
        elif o['retrieval_status'] == 'search_completed':
            check(o['record_kind'] == 'search' and bool(o['query']), f'{label}: search query missing')
            check(o['searched_at_utc'] == finish and o['accessed_at_utc'] is None and o['failed_at_utc'] is None, f'{label}: search presented as access')
            check(o['url'] is None and not o['body_reviewed'], f'{label}: search cannot establish body reading')
        else:
            check(bool(o['failure_reason']) and o['record_kind'] == 'failed_fetch', f'{label}: fetch failure undocumented')
            check(o['failed_at_utc'] == finish and o['accessed_at_utc'] is None and o['searched_at_utc'] is None, f'{label}: failure presented as access')
            check(not o['body_reviewed'], f'{label}: failed fetch cannot establish body reading')

    for work in works:
        wid = work['work_id']
        check(FIELDS <= set(work), f'{wid}: missing fields')
        if wid not in expected:
            continue
        old = expected[wid]
        for field, old_field in [('title', 'title'), ('old_status', 'body_status'),
                                 ('original_episode_scope', 'episode_scope'),
                                 ('original_alias_or_derivative', 'alias_or_derivative'),
                                 ('original_source_ids', 'source_ids')]:
            check(work[field] == old[old_field], f'{wid}: original {old_field} modified')
        copied = work['original_source_records']
        check({r['source_id'] for r in copied} == set(old['source_ids']), f'{wid}: historical source coverage differs')
        for record in copied:
            check(record == old_sources.get(record['source_id']), f'{wid}: historical source metadata modified')
        check(work['followup_status'] in STATUSES, f'{wid}: invalid followup status')
        check(bool(work['reviewed_scope'] and work['evidence_summary'] and work['alias_or_series_cautions']), f'{wid}: insufficient rationale')
        check(bool(work['source_observations']), f'{wid}: no followup evidence or search')
        if work['followup_status'] != 'confirmed':
            check(bool(work['unresolved_reason']), f'{wid}: missing unresolved reason')
        relevant_body = any(o['body_reviewed'] and o['retrieval_status'] == 'success'
                            and o['role'] != 'context_only' for o in work['source_observations'])
        if work['followup_status'] in {'partial', 'confirmed'}:
            check(relevant_body, f'{wid}: body status based only on search/failure/context')
        if work['followup_status'] == 'confirmed':
            check(work['assignment_identity_confirmed'] and work['full_assigned_scope_reviewed']
                  and not work['unresolved_reason'], f'{wid}: confirmation lacks identity/full scope')
        for o in work['source_observations']:
            validate_observation(o, wid)
    pairs = data['cross_group_alias_audit']
    check({tuple(p['work_ids']) for p in pairs} == {('G01-W05', 'G04-W08'), ('G02-W08', 'G03-W22'), ('G02-W14', 'G04-W20')}, 'alias candidate coverage differs')
    for pair in pairs:
        check(pair['resolution'] == 'identity_unresolved' and pair['confirmed_duplicate'] is False, 'unsupported duplicate resolution')
        check(bool(pair['evidence'] and pair['caution']), 'alias evidence/caution missing')
        for o in pair['context_observations']:
            validate_observation(o, '/'.join(pair['work_ids']))
    check(len(observation_ids) == len(set(observation_ids)), 'duplicate followup source ID')
    if check_protected:
        for name, digest in data['protected_artifact_sha256'].items():
            check(hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest, f'protected file changed: {name}')
    return errors, counts


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-protected', action='store_true', help='also verify the original groups/integration/site/docs file hashes on this branch')
    args = parser.parse_args()
    try:
        errors, counts = validate(args.check_protected)
    except (KeyError, TypeError, ValueError, OSError) as exc:
        raise SystemExit(f'Invalid followup data: {exc}')
    if errors:
        raise SystemExit('\n'.join(errors))
    print(f'Validated 24 followup entries, UTC separation, preserved source metadata and 3 unresolved alias pairs: {counts}. Content review remains separate.')
