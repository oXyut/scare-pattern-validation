#!/usr/bin/env python3
"""Check the immutable baseline, assignment coverage and submitted research data."""
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TYPE_IDS = {f'{letter}{n}' for letter, size in [('A', 4), ('B', 4), ('C', 4), ('D', 5), ('E', 5), ('F', 4)] for n in range(1, size + 1)}
WORK_FIELDS = {'work_id', 'title', 'body_status', 'source_ids', 'episode_scope', 'alias_or_derivative', 'overall_fears', 'scenes', 'unexplained_residue', 'counterexamples', 'change_proposals', 'confidence'}
SCENE_FIELDS = {'scene_id', 'evidence_summary', 'source_ids', 'Q', 'D', 'C', 'M', 'information_state_change', 'onset_conditions', 'closure_conditions', 'local_or_global', 'type_ids', 'fit', 'competing_types', 'discriminators', 'residue', 'confidence'}
SOURCE_FIELDS = {'source_id', 'work_id', 'title', 'url', 'accessed_at_utc', 'source_kind', 'episode_scope', 'variant', 'body_verified', 'notes'}


def validate(complete=False):
    errors = []
    def check(ok, message):
        if not ok:
            errors.append(message)
    baseline_path = ROOT / 'baseline/v1-26types/report.md'
    baseline = baseline_path.read_bytes()
    provenance = json.loads((ROOT / 'baseline/v1-26types/provenance.json').read_text())
    digest = hashlib.sha256(baseline).hexdigest()
    check(digest == provenance['public_sha256'], 'baseline: public hash mismatch')
    check(len(baseline) == provenance['bytes'], 'baseline: byte count mismatch')
    check(len(baseline.splitlines()) == provenance['lines'], 'baseline: line count mismatch')
    check(set(re.findall(r'\| ([A-F][1-5]) ', baseline.decode())) == TYPE_IDS, 'baseline: 26 type IDs mismatch')
    assignments = json.loads((ROOT / 'assignments/groups.json').read_text())
    groups = assignments['groups']
    check(len(groups) == 5, 'assignments: expected 5 groups')
    check([g['assigned_count'] for g in groups] == [27, 26, 26, 26, 26], 'assignments: group counts mismatch')
    entries = [entry for group in groups for entry in group['entries']]
    check(len(entries) == 131 == assignments['assigned_entries'], 'assignments: expected 131 entries')
    check(len({e['work_id'] for e in entries}) == len(entries), 'assignments: duplicate work ID')
    check(len({e['title'] for e in entries}) == len(entries), 'assignments: duplicate assigned title')
    submitted = []
    for group in groups:
        gid = group['group_id']
        base = ROOT / 'groups' / gid
        paths = [base / 'reports/report.md', base / 'data/mappings.json', base / 'sources/ledger.csv']
        exists = [p.exists() for p in paths]
        if not any(exists):
            check(not complete, f'{gid}: submission pending')
            continue
        check(all(exists), f'{gid}: report/data/sources submission incomplete')
        if not all(exists):
            continue
        submitted.append(gid)
        mapping = json.loads(paths[1].read_text())
        check(mapping.get('group_id') == gid, f'{gid}: group ID mismatch')
        meta = mapping.get('baseline', {})
        check(meta.get('sha256') == digest, f'{gid}: baseline hash mismatch')
        check(meta.get('baseline_id') == provenance['baseline_id'], f'{gid}: baseline ID mismatch')
        expected = {e['work_id']: e['title'] for e in group['entries']}
        works = mapping.get('works', [])
        work_ids = [w.get('work_id') for w in works]
        check(len(work_ids) == len(set(work_ids)) == group['assigned_count'], f'{gid}: duplicate/missing works')
        check({w.get('work_id'): w.get('title') for w in works} == expected, f'{gid}: assigned works mismatch')
        check(mapping.get('assigned_titles') == list(expected.values()), f'{gid}: assigned titles mismatch')
        counts = mapping.get('counts', {})
        statuses = [w.get('body_status') for w in works]
        check(all(s in {'verified', 'partial', 'unverified'} for s in statuses), f'{gid}: invalid body_status')
        check(counts.get('assigned_entries') == group['assigned_count'], f'{gid}: assigned count mismatch')
        for status in ['verified', 'partial', 'unverified']:
            check(counts.get(status) == statuses.count(status), f'{gid}: {status} count mismatch')
        independent = counts.get('independent_works')
        check(independent is None or isinstance(independent, int) and 0 <= independent <= len(works), f'{gid}: invalid independent work count')
        with paths[2].open(newline='') as handle:
            reader = csv.DictReader(handle)
            check(SOURCE_FIELDS <= set(reader.fieldnames or []), f'{gid}: missing source columns')
            sources = list(reader)
        source_ids = [s.get('source_id') for s in sources]
        check(len(source_ids) == len(set(source_ids)), f'{gid}: duplicate source ID')
        known_sources = set(source_ids)
        for source in sources:
            check(source.get('work_id') in expected, f'{gid}: unknown source work ID')
            check(source.get('url', '').startswith(('https://', 'http://')), f'{gid}: invalid source URL')
        scene_ids = []
        for work in works:
            wid = work.get('work_id')
            check(WORK_FIELDS <= set(work), f'{wid}: missing work fields')
            refs = set(work.get('source_ids', []))
            check(refs <= known_sources, f'{wid}: unknown source reference')
            if work.get('body_status') in {'verified', 'partial'}:
                check(bool(refs), f'{wid}: verified/partial work has no source')
            for scene in work.get('scenes', []):
                sid = scene.get('scene_id')
                scene_ids.append(sid)
                check(SCENE_FIELDS <= set(scene), f'{sid}: missing scene fields')
                check(set(scene.get('source_ids', [])) <= known_sources, f'{sid}: unknown scene source')
                check(bool(scene.get('evidence_summary')), f'{sid}: missing evidence summary')
                check(all(t in TYPE_IDS or re.fullmatch(r'G' + gid[-2:] + r'-N\d+', t) for t in scene.get('type_ids', [])), f'{sid}: invalid type ID')
        check(len(scene_ids) == len(set(scene_ids)), f'{gid}: duplicate scene ID')
    # Structural screening supplements human review; it does not establish privacy or copyright compliance.
    forbidden = re.compile(r'/Users/|/workspace/|/home/|/mnt/data/|libfile_|local-chatgpt:|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY')
    for path in ROOT.rglob('*'):
        if path.is_file() and path.suffix in {'.md', '.json', '.csv'} and '.git' not in path.parts:
            check(not forbidden.search(path.read_text()), f'{path.relative_to(ROOT)}: potential private data')
    return errors, submitted


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--complete', action='store_true', help='require all five final submissions')
    args = parser.parse_args()
    try:
        errors, submitted = validate(args.complete)
    except (KeyError, TypeError, ValueError, OSError) as error:
        raise SystemExit(f'Invalid data: {error}')
    if errors:
        print('\n'.join(errors))
        raise SystemExit(1)
    print(f'Validated immutable 26-type baseline, 131 assignments, {len(submitted)}/5 final submissions.')
