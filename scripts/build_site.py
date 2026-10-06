"""Build a dependency-free, allowlisted public edition of the research data."""
import csv
import hashlib
import json
import re
import shutil
import subprocess
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'site'
DEST = ROOT / 'docs'


def text(value):
    if value is None:
        return ''
    if isinstance(value, dict):
        return '\n'.join(text(v) for k, v in value.items() if k not in {'target_id', 'subject_id', 'confirmed_duplicate_of'})
    if isinstance(value, list):
        return '\n'.join(text(v) for v in value)
    return str(value)


def public_fields(row, fields):
    """Copy only named analysis columns; never recursively publish tracking IDs."""
    result = {}
    for key in fields:
        value = row.get(key)
        assert value is None or isinstance(value, str), f'Unexpected tracking column shape: {key}'
        result[key] = value or ''
    return result


def public_transitions(rows):
    result = []
    for row in rows:
        transition = public_fields(row, ['from_scene', 'to_scene', 'retained_problem', 'closure_audit'])
        for key in ['from_type_ids', 'to_type_ids']:
            if key in row:
                assert isinstance(row[key], list) and all(isinstance(value, str) for value in row[key])
                transition[key] = list(row[key])
        result.append(transition)
    return result


def public_work_tracking(original):
    tracking = {}
    if 'target_outcomes' in original:
        tracking['target_outcomes'] = [public_fields(row, ['target', 'Q', 'D', 'C', 'M'])
                                       for row in original['target_outcomes']]
    if 'transitions' in original:
        tracking['transitions'] = public_transitions(original['transitions'])
    if 'problem_tracking' in original:
        tracking['problem_tracking'] = [public_fields(row, ['scene_id', 'target', 'outcome', 'unresolved', 'transition'])
                                        for row in original['problem_tracking']]
    if 'outcome_tracking' in original:
        row = original['outcome_tracking']
        tracking['outcome_tracking'] = public_fields(row, ['confirmed_or_reported_outcome', 'unresolved_targets'])
        tracking['outcome_tracking']['transitions'] = public_transitions(row['transitions'])
    return tracking


def public_followup_observation(original):
    """Project the two source ledgers without publishing arbitrary metadata."""
    state = original.get('retrieval_status')
    state = {'retrieved': 'success', 'retrieval_failed': 'failed'}.get(state, state)
    if 'search_id' in original:
        state = 'search_completed'
    assert state in {'success', 'failed', 'search_completed'}
    row = {
        'source_id': original.get('source_id') or original['search_id'],
        'url': original.get('url'),
        'retrieval_status': state,
        'body_read': original.get('body_read', original.get('body_reviewed', False)),
        'accessed_at_utc': original.get('accessed_at_utc'),
        'attempted_at_utc': original.get('attempted_at_utc') or original.get('failed_at_utc'),
        'searched_at_utc': original.get('searched_at_utc'),
        'scope': original.get('confirmed_scope') or original.get('reviewed_scope') or '',
        'variant': original.get('variant', ''),
        'relation': original.get('identification_relation') or original.get('role') or 'search_only',
        'evidence_summary': original['evidence_summary'],
        'failure_reason': original.get('retrieval_error') or original.get('failure_reason') or '',
        'query': original.get('query', ''),
        'result_urls': list(original.get('result_urls', [])),
    }
    assert isinstance(row['body_read'], bool)
    assert state == 'success' or not row['body_read']
    for key, value in row.items():
        if key not in {'body_read', 'result_urls'}:
            assert value is None or isinstance(value, str), f'Unexpected followup column: {key}'
    for value in [row['url'], *row['result_urls']]:
        if value:
            url = urlparse(value)
            assert url.scheme in {'http', 'https'} and url.hostname and not url.username and not url.password
    return row


def public_followup_document(original):
    return public_fields(original, ['path', 'label'])


def build_followup(works):
    snapshot = json.loads((SOURCE / 'followup-snapshot.json').read_text())
    assert re.fullmatch(r'[0-9a-f]{40}', snapshot['source_revision'])
    for relative in snapshot['inputs']:
        path = Path(relative)
        assert path.parts[0] == 'followup' and not path.is_absolute() and '..' not in path.parts
        committed = subprocess.check_output(['git', 'show', f"{snapshot['source_revision']}:{relative}"], cwd=ROOT)
        assert (ROOT / path).read_bytes() == committed, f'Followup snapshot changed: {relative}'
    index = json.loads((ROOT / 'followup/index.json').read_text())
    for artifact in index['artifacts']:
        assert artifact['path'] in snapshot['inputs']
        assert hashlib.sha256((ROOT / artifact['path']).read_bytes()).hexdigest() == artifact['sha256']
    historical = {work['work_id']: work for work in works}
    public_works = []
    for relative in index['source_inputs']:
        assert relative in snapshot['inputs']
        document = json.loads((ROOT / relative).read_text())
        for original in document['works']:
            work_id = original['work_id']
            assert original['title'] == historical[work_id]['title']
            assert original['old_status'] == historical[work_id]['body_status']
            reasons = original.get('unresolved_reasons') or [original['unresolved_reason']]
            cautions = original.get('alias_or_series_cautions') or [original['alias_series_assessment']['reason']]
            assert all(isinstance(value, str) for value in reasons + cautions)
            observations = original.get('source_observations')
            if observations is None:
                observations = original['sources'] + original['searches']
            row = public_fields(original, ['work_id', 'title', 'old_status', 'followup_status', 'evidence_summary'])
            row.update(scope=original.get('followup_scope') or original['reviewed_scope'],
                       unresolved_reasons=reasons, cautions=cautions,
                       report_path=relative.replace('.json', '.md'),
                       observations=[public_followup_observation(o) for o in observations])
            public_works.append(row)
    selected = {work['work_id'] for work in works if work['body_status'] in {'partial', 'unverified'}}
    assert len(public_works) == len({w['work_id'] for w in public_works}) == 39
    assert {w['work_id'] for w in public_works} == selected
    assert Counter(w['followup_status'] for w in public_works) == {'partial': 15, 'unresolved': 24}
    assert index['source_followup_counts'] == {'entries': 39, 'confirmed': 0, 'partial': 15, 'unresolved': 24}
    expected_items = [{key: w[key] for key in ['work_id', 'title', 'old_status', 'followup_status']} for w in sorted(public_works, key=lambda w: w['work_id'])]
    assert expected_items == [{key: w[key] for key in expected_items[0]} for w in index['items']]
    documents = [public_followup_document(d) for d in index['documents']]
    assert all(d['path'] in snapshot['inputs'] for d in documents)
    return {'source_revision': snapshot['source_revision'], 'edition_date': index['edition_date'],
            'counts': index['source_followup_counts'], 'status_note': index['status_note'],
            'documents': documents, 'works': sorted(public_works, key=lambda w: w['work_id'])}


def build_data():
    summary = json.loads((ROOT / 'integration/data/summary.json').read_text())
    snapshot = json.loads((SOURCE / 'research-snapshot.json').read_text())
    # A new research snapshot requires an explicit source revision update.
    inputs = list((ROOT / 'groups').glob('*/data/mappings.json')) + list((ROOT / 'groups').glob('*/sources/ledger.csv')) + [ROOT / 'integration/data/summary.json', ROOT / 'integration/reports/robustness.md', ROOT / 'baseline/v1-26types/report.md']
    for path in inputs:
        committed = subprocess.check_output(['git', 'show', f"{snapshot['source_revision']}:{path.relative_to(ROOT)}"], cwd=ROOT)
        assert path.read_bytes() == committed, f'Research snapshot changed: {path.relative_to(ROOT)}'
    baseline = (ROOT / 'baseline/v1-26types/report.md').read_bytes()
    assert hashlib.sha256(baseline).hexdigest() == summary['baseline_sha256']
    types = []
    for line in baseline.decode().splitlines():
        if re.match(r'^\| [A-F][1-5] .+\|', line):
            parts = [s.strip() for s in line.strip('|').split('|')]
            if len(parts) == 5:
                type_id, name = parts[0].split(' ', 1)
                if not any(t['id'] == type_id for t in types):
                    types.append(dict(id=type_id, name=name, onset=parts[1], choices=parts[2], closure=parts[3], connection=parts[4]))
    for line in (ROOT / 'integration/reports/robustness.md').read_text().splitlines():
        if re.match(r'^\| [A-F][1-5] .+\|', line):
            parts = [s.strip() for s in line.strip('|').split('|')]
            next(t for t in types if t['id'] == parts[0].split()[0])['review'] = parts[1]
    groups, works, sources = [], [], []
    for path in sorted((ROOT / 'groups').glob('*/data/mappings.json')):
        group = json.loads(path.read_text())
        groups.append({'group_id': group['group_id'], 'assigned_entries': len(group['works'])})
        for original in group['works']:
            fields = ['work_id', 'title', 'body_status', 'episode_scope', 'alias_or_derivative', 'overall_fears', 'unexplained_residue', 'counterexamples', 'change_proposals']
            work = {k: text(original.get(k)) for k in fields}
            work.update(public_work_tracking(original))
            work['group_id'] = group['group_id']
            work['source_ids'] = original['source_ids']
            work['scenes'] = []
            for original_scene in original['scenes']:
                fields = ['scene_id', 'evidence_summary', 'Q', 'D', 'C', 'M', 'information_state_change', 'onset_conditions', 'closure_conditions', 'local_or_global', 'fit', 'discriminators', 'residue']
                scene = {k: text(original_scene.get(k)) for k in fields}
                scene.update({k: original_scene[k] for k in ['source_ids', 'type_ids', 'competing_types']})
                scene['confidence'] = original_scene.get('confidence')
                scene['outcomes'] = text(original_scene.get('actual_outcome') or original_scene.get('outcomes_and_unresolved_targets'))
                scene['transitions'] = list(original_scene.get('transitions', []))
                assert all(isinstance(value, str) for value in scene['transitions'])
                work['scenes'].append(scene)
            works.append(work)
        with (path.parent.parent / 'sources/ledger.csv').open(newline='') as handle:
            for row in csv.DictReader(handle):
                fields = ['source_id', 'work_id', 'url', 'accessed_at_utc', 'source_kind', 'episode_scope', 'variant', 'body_verified', 'notes', 'url_missing_reason', 'access_time_missing_reason', 'access_time_status']
                source = {k: row.get(k, '') for k in fields}
                if not source['access_time_status']:
                    source['access_time_status'] = 'timestamp_utc' if source['accessed_at_utc'] else 'not_recorded'
                if source['url']:
                    url = urlparse(source['url'])
                    assert url.scheme in {'http', 'https'} and url.hostname and not url.username and not url.password
                sources.append(source)
    assert len(types) == 26 and all(t.get('review') for t in types)
    assert len(works) == summary['counts']['assigned_entries'] == 131
    assert Counter(w['body_status'] for w in works) == summary['counts']['body_status_counts']
    scenes = [s for w in works for s in w['scenes']]
    assert len(scenes) == 258 and Counter(s['fit'] for s in scenes) == summary['counts']['scene_level_fit_counts']
    assert len(sources) == summary['counts']['source_rows'] == 166
    source_ids = {s['source_id'] for s in sources}
    assert len(source_ids) == len(sources)
    assert all(set(w['source_ids']) <= source_ids for w in works)
    assert all(set(s['source_ids']) <= source_ids for s in scenes)
    for work in works:
        own_scenes = {s['scene_id'] for s in work['scenes']}
        transitions = work.get('transitions', []) + work.get('outcome_tracking', {}).get('transitions', [])
        assert all(row['from_scene'] in own_scenes and row['to_scene'] in own_scenes for row in transitions)
        type_ids = {t['id'] for t in types}
        assert all(set(row.get(key, [])) <= type_ids for row in transitions for key in ['from_type_ids', 'to_type_ids'])
        assert all(row['scene_id'] in own_scenes for row in work.get('problem_tracking', []))
    result = {'schema_version': 'public-research-site-2', 'source_revision': snapshot['source_revision'], 'baseline_id': summary['baseline_id'], 'baseline_sha256': summary['baseline_sha256'], 'counts': summary['counts'], 'conclusion': summary['conclusion'], 'groups': groups, 'type_groups': [{'id': key, 'name': name} for key, name in zip('ABCDEF', ['捕捉と侵入', '空間と認識', '他者と関係', '身体と自己', '因果と選択', '人間と世界'])], 'types': types, 'works': works, 'sources': sources}
    result['schema_version'] = 'public-research-site-3'
    result['followup'] = build_followup(works)
    serialized = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    # Reject private execution identifiers and paths before writing the public tree.
    assert not re.search(r'/Users/|/home/|/mnt/|sediment://|file://|(?:conversation|thread|library|file)[_-]id|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN .*PRIVATE KEY', serialized, re.I)
    return serialized


def build():
    serialized = build_data()
    DEST.mkdir(exist_ok=True)
    for name in ['index.html', 'styles.css', 'core.mjs', 'app.mjs', 'favicon.svg']:
        shutil.copyfile(SOURCE / name, DEST / name)
    # Source links also work when JavaScript is unavailable.
    markup = (DEST / 'index.html').read_text()
    revision = json.loads((SOURCE / 'research-snapshot.json').read_text())['source_revision']
    markup = re.sub(r'<a data-repo="([^"]+)"', lambda m: f'<a data-repo="{m[1]}" href="https://github.com/oXyut/scare-pattern-validation/blob/{revision}/{m[1]}"', markup)
    followup_revision = json.loads((SOURCE / 'followup-snapshot.json').read_text())['source_revision']
    markup = re.sub(r'<a data-followup="([^"]+)"', lambda m: f'<a data-followup="{m[1]}" href="https://github.com/oXyut/scare-pattern-validation/blob/{followup_revision}/{m[1]}"', markup)
    (DEST / 'index.html').write_text(markup)
    (DEST / 'data.json').write_text(serialized)
    (DEST / '.nojekyll').write_text('')
    print('Built docs/: historical 131 entries, 258 scene rows (25 placeholders), 166 source rows; separate 39-entry followup.')


if __name__ == '__main__':
    build()
