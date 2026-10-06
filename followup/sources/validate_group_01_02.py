#!/usr/bin/env python3
"""Check the 15-entry supplement and its immutable source inputs."""

import csv
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'followup/sources/group_01-02.json'
MARKDOWN = ROOT / 'followup/sources/group_01-02.md'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def timestamp(value):
    require(isinstance(value, str) and re.fullmatch(
        r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', value),
        f'Expected a recorded UTC timestamp: {value!r}')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parsed <= datetime.now(timezone.utc), 'Timestamp is in the future')


def source_url(value):
    require(isinstance(value, str), 'Source URL must be a string')
    parsed = urlparse(value)
    require(parsed.scheme in ('http', 'https') and parsed.hostname
            and not parsed.username and not parsed.password,
            f'Invalid public source URL: {value!r}')


def validate(data=None, markdown=None):
    data = json.loads(DATA.read_text()) if data is None else data
    markdown = MARKDOWN.read_text() if markdown is None else markdown
    inventory = json.loads((ROOT / 'integration/data/summary.json').read_text())[
        'assignment_inventory']
    expected = {w['work_id']: w for w in inventory
                if w['work_id'].startswith(('G01-', 'G02-'))
                and w['body_status'] in ('partial', 'unverified')}
    require(len(expected) == 15, 'Expected exactly 15 original assignments')
    require(data['schema_version'] == 'source-followup-1', 'Unexpected schema')
    require(data['scope'] == {
        'groups': ['group_01', 'group_02'], 'assigned_entries': 15,
        'original_unverified': 11, 'original_partial': 4,
        'excluded_groups': ['group_03', 'group_04', 'group_05']}, 'Scope changed')
    works = data['works']
    require(len(works) == 15 and {w['work_id'] for w in works} == set(expected),
            'Missing, duplicate, or out-of-scope assignment')
    old_counts = Counter(w['old_status'] for w in works)
    require(old_counts == {'unverified': 11, 'partial': 4}, 'Old counts changed')
    states = Counter(w['followup_status'] for w in works)
    require(data['counts'] == {
        'entries': 15, 'confirmed': states['confirmed'],
        'partial': states['partial'], 'unresolved': states['unresolved']},
        'Followup counts do not match works')
    require(states == {'partial': 4, 'unresolved': 11},
            'Any new confirmation requires a new content review')

    historical = data['historical_v1']
    require(historical == {
        'assigned_entries': 131, 'verified': 92, 'partial': 14, 'unverified': 25,
        'scenes': 258, 'body_insufficient_scenes': 25, 'coded_scenes': 233,
        'fit': 75, 'partial_fit': 141, 'nonfit': 17, 'new_candidates': 8,
        'adopted_candidates': 0, 'independent_works': None,
        'corpus_role': 'development', 'v3_status': 'separate_unvalidated_proposal'},
        'Historical v1 counts or qualifications changed')
    require(all(data['method'][field] is False for field in
                ('independent_human_evaluation', 'v3_validation', 'recode_performed')),
            'Source followup is not independent evaluation or recoding')
    required_inputs = {
        'baseline/v1-26types/report.md', 'baseline/v1-26types/provenance.json',
        'assignments/groups.json', 'groups/group_01/data/mappings.json',
        'groups/group_01/sources/ledger.csv', 'groups/group_02/data/mappings.json',
        'groups/group_02/sources/ledger.csv', 'integration/data/summary.json',
        'site/research-snapshot.json', 'docs/data.json'}
    require(set(data['original_inputs_sha256']) == required_inputs,
            'Protected input list changed')
    for relative, digest in data['original_inputs_sha256'].items():
        require(hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() == digest,
                f'Protected input changed: {relative}')
    legacy = {}
    for group in ('01', '02'):
        with (ROOT / f'groups/group_{group}/sources/ledger.csv').open() as handle:
            for row in csv.DictReader(handle):
                legacy.setdefault(row['work_id'], []).append(row)

    ids = set()
    total_sources = total_searches = 0
    for work in works:
        work_id = work['work_id']
        old = expected[work_id]
        require(work['title'] == old['title']
                and work['old_status'] == old['body_status']
                and work['old_episode_scope'] == old['episode_scope']
                and work['old_alias_or_derivative'] == old['alias_or_derivative'],
                f'Original assignment changed: {work_id}')
        require(work['legacy_source_metadata'] == legacy.get(work_id, []),
                f'Legacy source metadata changed: {work_id}')
        require(all(work[field] for field in
                    ('followup_scope', 'evidence_summary', 'unresolved_reasons',
                     'next_evidence_needed')), f'Missing reservations: {work_id}')
        require(f'### {work_id} {work["title"]}' in markdown,
                f'Markdown missing work: {work_id}')
        own_sources = set()
        for source in work['sources']:
            sid = source['source_id']
            require(sid not in ids and re.fullmatch(work_id + r'-F\d{2}', sid),
                    f'Duplicate or mismatched source ID: {sid}')
            ids.add(sid)
            own_sources.add(sid)
            total_sources += 1
            source_url(source['url'])
            require(source['original_post_match_verified'] is False,
                    f'Unreviewed original-post confirmation: {sid}')
            require(all(source[field] for field in
                        ('source_kind', 'confirmed_scope', 'variant',
                         'evidence_summary', 'locator', 'identification_relation')),
                    f'Missing source scope: {sid}')
            if source['retrieval_status'] == 'retrieved':
                timestamp(source['accessed_at_utc'])
                require(source['attempted_at_utc'] is None
                        and source['retrieval_error'] is None,
                        f'Success and failure times mixed: {sid}')
            else:
                require(source['retrieval_status'] == 'retrieval_failed',
                        f'Invalid retrieval status: {sid}')
                timestamp(source['attempted_at_utc'])
                require(source['accessed_at_utc'] is None
                        and source['body_read'] is False and source['retrieval_error'],
                        f'Failed retrieval counted as read: {sid}')
            require(isinstance(source['body_read'], bool), f'Invalid body flag: {sid}')
            if source['identification_relation'] in ('name_only', 'bibliography_only'):
                require(source['body_read'] is False,
                        f'Index or bibliography counted as body read: {sid}')
            require(sid in markdown and source['url'] in markdown,
                    f'Markdown missing source: {sid}')
        if work['followup_status'] == 'partial':
            require(any(s['body_read'] and s['identification_relation'] == 'scope_support'
                        for s in work['sources']), f'Partial without scoped body: {work_id}')
        require(work['searches'], f'No followup search record: {work_id}')
        for search in work['searches']:
            qid = search['search_id']
            require(qid not in ids and re.fullmatch(work_id + r'-Q\d{2}', qid),
                    f'Duplicate or mismatched search ID: {qid}')
            ids.add(qid)
            total_searches += 1
            timestamp(search['searched_at_utc'])
            require(search['accessed_at_utc'] is None and search['body_read'] is False,
                    f'Search counted as body read: {qid}')
            require(search['query'] and search['evidence_summary']
                    and search['outcome'] in ('candidate_found', 'no_matching_body',
                                               'no_results', 'tool_error'),
                    f'Invalid search record: {qid}')
            for url in search['result_urls']:
                source_url(url)
            require(qid in markdown, f'Markdown missing search: {qid}')
        alias = work['alias_series_assessment']
        require(alias['confirmed_duplicate_of'] is None
                and alias['independent_work_count'] is None and alias['reason'],
                f'Unreviewed duplicate or independence claim: {work_id}')
        require(set(alias['evidence_source_ids']) <= own_sources,
                f'Unknown alias evidence source: {work_id}')
    alias = next(w for w in works if w['work_id'] == 'G01-W05')['alias_series_assessment']
    require(alias['candidate_work_ids'] == ['G04-W08'] and len(alias['evidence_source_ids']) == 2,
            'Cross-group alias reservation missing')
    return total_sources, total_searches


if __name__ == '__main__':
    sources, searches = validate()
    print(f'Structurally validated 15 followup assignments: 0 confirmed, '
          f'4 partial, 11 unresolved; {sources} sources, {searches} searches. '
          'Historical inputs preserved. Content confirmation remains separate.')
