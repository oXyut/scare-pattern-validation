"""Validate and publish the separate, source-reviewed narrative edition."""
import re
from collections import Counter
from datetime import datetime
from urllib.parse import urlparse


REASONS = {'body_unavailable', 'identity_or_scope_pending', 'retrieval_failed'}
FACT_KINDS = {'narrated', 'dream', 'reported', 'inference', 'vision', 'embedded_story'}
OUTCOMES = {'body_confirmed', 'fetch_failed', 'no_identified_body', 'search_unresolved',
            'no_matching_body', 'access_failed', 'retrieval_failed', 'identity_unresolved',
            'variant_out_of_scope', 'no_confirmed_body', 'identity_mismatch',
            'candidate_found', 'body_unavailable', 'metadata_only'}


def utc(value):
    assert re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ', value), 'UTC timestamp required'
    datetime.fromisoformat(value.replace('Z', '+00:00'))
    return value


def external_url(value):
    parsed = urlparse(value)
    assert parsed.scheme in {'https', 'http'} and parsed.netloc, 'External HTTP URL required'
    return value


def fields(row, names, limit=700):
    result = {}
    for name in names:
        value = row[name]
        assert isinstance(value, str) and value.strip() and len(value) <= limit, f'Invalid narrative field: {name}'
        result[name] = value
    return result


def public_narratives(document, works, sources, research_revision):
    assert document['schema_version'] == 'story-narratives-2'
    assert document['research_revision'] == research_revision, 'Narratives refer to a different v1 snapshot'
    historical = {w['work_id']: w for w in works}
    source_map = {s['source_id']: s for s in sources}
    rows = document['works']
    assert len(rows) == len(historical) == len({r['work_id'] for r in rows})
    assert {r['work_id'] for r in rows} == set(historical), 'Every assigned entry needs an explicit narrative status'
    assert document['release_stage'] == 'full_review'
    selected = document['review_work_ids']
    assert isinstance(selected, list) and 3 <= len(selected) <= 4 and len(selected) == len(set(selected))
    assert set(selected) <= set(historical)
    output = []
    for original in rows:
        work = historical[original['work_id']]
        row = fields(original, ['work_id', 'scope', 'chronology_note', 'narrative_note'])
        state = original['status']
        assert state in {'ready', 'scoped', 'pending'}
        row['status'] = state
        codes = original['reason_codes']
        assert isinstance(codes, list) and set(codes) <= REASONS and len(codes) == len(set(codes))
        row['reason_codes'] = list(codes)
        limitations = original['limitations']
        assert isinstance(limitations, list) and all(isinstance(v, str) and v.strip() and len(v) <= 700 for v in limitations)
        row['limitations'] = list(limitations)
        row['reason'] = original['reason']
        assert isinstance(row['reason'], str) and len(row['reason']) <= 700
        row['reviewed_at_utc'] = utc(original['reviewed_at_utc'])
        investigations = original['investigation']
        assert isinstance(investigations, list) and investigations, 'Every work needs an individual investigation'
        row['investigation'] = []
        for attempt in investigations:
            public = fields(attempt, ['checked_at_utc', 'method', 'outcome', 'note'])
            utc(public['checked_at_utc'])
            assert public['method'] in {'web_reader', 'web_search', 'direct_http', 'browser'}
            assert public['outcome'] in OUTCOMES
            for key in ['url', 'query']:
                assert isinstance(attempt[key], str) and len(attempt[key]) <= 700
                public[key] = attempt[key]
            assert public['url'] or public['query'], 'Attempt must identify a URL or search'
            if public['url']:
                external_url(public['url'])
            row['investigation'].append(public)
        row['historical_note'] = original.get('historical_note', '')
        assert isinstance(row['historical_note'], str) and len(row['historical_note']) <= 700
        row['source_reviews'], row['threads'] = [], []
        if state == 'pending':
            assert codes and row['reason'].strip()
            assert original['summary'] is None and not original['threads'] and not original['source_reviews'], 'Pending entries cannot invent a story'
            row['summary'] = None
            output.append(row)
            continue
        assert not codes and not row['reason']
        if work['body_status'] != 'verified':
            assert row['historical_note'].strip(), 'Explain the unchanged historical status'
        if work['body_status'] == 'unverified':
            assert state == 'scoped', 'Newly identified candidates must retain their limited scope'
        row['summary'] = fields(original['summary'], ['opening', 'development', 'ending'], limit=300)
        reviews = original['source_reviews']
        assert reviews and len({r['review_id'] for r in reviews}) == len(reviews)
        for review in reviews:
            public = fields(review, ['review_id', 'url', 'accessed_at_utc', 'method', 'scope', 'provenance', 'identity_basis'])
            external_url(public['url'])
            assert public['provenance'] in {'v1_ledger', 'new_source'}
            public['source_id'] = review['source_id']
            if public['provenance'] == 'v1_ledger':
                assert public['source_id'] in source_map
                source = source_map[public['source_id']]
                assert source['work_id'] == work['work_id'] and source['url'] == public['url'] and source['url']
            else:
                assert public['source_id'] == '', 'A new URL must not borrow a historical source ID'
                assert not any(s['work_id'] == work['work_id'] and s['url'] == public['url'] for s in sources), 'Existing ledger URLs must retain their original ID'
            assert public['method'] in {'web_reader', 'direct_http', 'browser'}
            utc(public['accessed_at_utc'])
            assert any(a['outcome'] == 'body_confirmed' and a['url'] == public['url'] for a in row['investigation']), 'An authored story needs an actual body confirmation'
            row['source_reviews'].append(public)
        review_ids = {r['review_id'] for r in reviews}
        scenes = {s['scene_id']: s for s in work['scenes']}
        assert original['threads']
        flow_ids, step_ids, used_reviews = set(), set(), set()
        for thread in original['threads']:
            public_thread = fields(thread, ['flow_id', 'label', 'note'])
            assert thread['flow_id'] not in flow_ids
            flow_ids.add(thread['flow_id'])
            assert thread['steps']
            public_thread['steps'] = []
            for step in thread['steps']:
                public_step = fields(step, ['step_id', 'time', 'title', 'event', 'narrative_position'])
                assert step['step_id'] not in step_ids
                step_ids.add(step['step_id'])
                assert step['fact_kind'] in FACT_KINDS
                public_step['fact_kind'] = step['fact_kind']
                refs = step['source_review_ids']
                assert isinstance(refs, list) and refs and set(refs) <= review_ids and len(refs) == len(set(refs))
                used_reviews.update(refs)
                public_step['source_review_ids'] = list(refs)
                assert isinstance(step['fears'], list)
                public_step['fears'] = []
                for fear in step['fears']:
                    public_fear = fields(fear, ['fear', 'basis', 'classification_basis'])
                    public_fear['scene_id'] = fear['scene_id']
                    type_ids = fear['type_ids']
                    assert isinstance(type_ids, list) and len(type_ids) == len(set(type_ids))
                    if fear['classification_basis'] == 'v1_scene':
                        assert fear['scene_id'] in scenes, 'Narrative labels must reference their own v1 scene'
                        scene = scenes[fear['scene_id']]
                        assert set(type_ids) <= set(scene['type_ids']), 'Narrative labels must reference their own v1 scene'
                    else:
                        assert fear['classification_basis'] == 'unclassified_new_evidence'
                        assert fear['scene_id'] == '' and not type_ids, 'New evidence cannot invent v1 scenes or labels'
                    public_fear['type_ids'] = list(type_ids)
                    public_step['fears'].append(public_fear)
                public_thread['steps'].append(public_step)
            row['threads'].append(public_thread)
        assert used_reviews == review_ids
        output.append(row)
    assert all(row['status'] != 'pending' for row in output if row['work_id'] in selected)
    return {**fields(document, ['schema_version', 'research_revision', 'edition_date', 'editorial_note', 'release_stage']),
            'review_work_ids': list(selected), 'investigated_count': len(output),
            'counts': dict(Counter(row['status'] for row in output)),
            'pending_reasons': dict(Counter(code for row in output for code in row['reason_codes'])),
            'works': output}
