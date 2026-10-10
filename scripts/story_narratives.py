"""Validate and publish the separate, source-reviewed narrative edition."""
import re
from collections import Counter
from datetime import datetime


REASONS = {'body_unavailable', 'identity_or_scope_pending', 'not_rechecked', 'retrieval_failed', 'poc_review_pending'}
FACT_KINDS = {'narrated', 'dream', 'reported', 'inference', 'vision', 'embedded_story'}


def fields(row, names, limit=700):
    result = {}
    for name in names:
        value = row[name]
        assert isinstance(value, str) and value.strip() and len(value) <= limit, f'Invalid narrative field: {name}'
        result[name] = value
    return result


def public_narratives(document, works, sources, research_revision):
    assert document['schema_version'] == 'story-narratives-1'
    assert document['research_revision'] == research_revision, 'Narratives refer to a different v1 snapshot'
    historical = {w['work_id']: w for w in works}
    source_map = {s['source_id']: s for s in sources}
    rows = document['works']
    assert len(rows) == len(historical) == len({r['work_id'] for r in rows})
    assert {r['work_id'] for r in rows} == set(historical), 'Every assigned entry needs an explicit narrative status'
    assert document['release_stage'] == 'poc', 'Expand the release only after UI review'
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
        row['source_reviews'], row['threads'] = [], []
        if state == 'pending':
            assert codes and row['reason'].strip()
            assert original['summary'] is None and not original['threads'] and not original['source_reviews'], 'Pending entries cannot invent a story'
            row['summary'] = None
            output.append(row)
            continue
        assert not codes and not row['reason']
        assert work['body_status'] != 'unverified', 'Unidentified v1 entries must remain pending'
        assert state != 'ready' or work['body_status'] == 'verified'
        row['summary'] = fields(original['summary'], ['opening', 'development', 'ending'], limit=300)
        reviews = original['source_reviews']
        assert reviews and len({r['review_id'] for r in reviews}) == len(reviews)
        for review in reviews:
            public = fields(review, ['review_id', 'source_id', 'url', 'accessed_at_utc', 'method', 'scope'])
            source = source_map[public['source_id']]
            assert source['work_id'] == work['work_id'] and source['url'] == public['url'] and source['url']
            assert public['method'] in {'web_reader', 'direct_http', 'browser'}
            assert re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ', public['accessed_at_utc'])
            datetime.fromisoformat(public['accessed_at_utc'].replace('Z', '+00:00'))
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
                    public_fear = fields(fear, ['scene_id', 'fear', 'basis'])
                    scene = scenes[fear['scene_id']]
                    type_ids = fear['type_ids']
                    assert isinstance(type_ids, list) and set(type_ids) <= set(scene['type_ids']) and len(type_ids) == len(set(type_ids)), 'Narrative labels must reference their own v1 scene'
                    public_fear['type_ids'] = list(type_ids)
                    public_step['fears'].append(public_fear)
                public_thread['steps'].append(public_step)
            row['threads'].append(public_thread)
        assert used_reviews == review_ids
        output.append(row)
    assert all(row['status'] != 'pending' for row in output if row['work_id'] in selected)
    withheld = 0
    for row in output:
        if row['work_id'] not in selected and row['status'] != 'pending':
            withheld += 1
            row.update(status='pending', reason_codes=['poc_review_pending'],
                       reason='UIレビュー前のため、この作品のあらすじ・時系列の表示を保留しています。作成済みの下書きは保存し、PoCの4作品を確認してから展開します。',
                       summary=None, source_reviews=[], threads=[])
    return {**fields(document, ['schema_version', 'research_revision', 'edition_date', 'editorial_note', 'release_stage']),
            'review_work_ids': list(selected), 'withheld_draft_count': withheld,
            'counts': dict(Counter(row['status'] for row in output)),
            'pending_reasons': dict(Counter(code for row in output for code in row['reason_codes'])),
            'works': output}
