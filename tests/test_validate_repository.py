"""Synthetic fixtures test structural checks, never story interpretations."""
import csv
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('validator', REPO / 'scripts/validate_repository.py')
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        for directory in ('baseline', 'assignments'):
            shutil.copytree(REPO / directory, self.root / directory)
        self.previous_root = validator.ROOT
        validator.ROOT = self.root
        self.group = json.loads((self.root / 'assignments/groups.json').read_text())['groups'][0]
        self.mapping = {
            'group_id': self.group['group_id'],
            'baseline': {'baseline_id': validator.BASELINE_ID, 'sha256': validator.BASELINE_SHA256},
            'assigned_titles': [e['title'] for e in self.group['entries']],
            'counts': {'assigned_entries': 27, 'verified': 0, 'partial': 0, 'unverified': 27, 'independent_works': None},
            'works': [dict(e, body_status='unverified', source_ids=[], episode_scope='synthetic fixture: no body',
                           alias_or_derivative=None, overall_fears=[], scenes=[], unexplained_residue=[],
                           counterexamples=[], change_proposals=[], confidence=None)
                      for e in self.group['entries']],
        }
        self.sources = []

    def tearDown(self):
        validator.ROOT = self.previous_root
        self.temp.cleanup()

    def write_submission(self):
        base = self.root / 'groups/group_01'
        for directory in ('reports', 'data', 'sources'):
            (base / directory).mkdir(parents=True, exist_ok=True)
        (base / 'reports/report.md').write_text('Synthetic fixture. No research claim.\n')
        (base / 'data/mappings.json').write_text(json.dumps(self.mapping, ensure_ascii=False))
        with (base / 'sources/ledger.csv').open('w', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=sorted(validator.SOURCE_FIELDS))
            writer.writeheader()
            writer.writerows(self.sources)

    def add_verified_scene(self):
        work = self.mapping['works'][0]
        work.update(body_status='verified', source_ids=['TEST-S1'])
        self.mapping['counts'].update(verified=1, unverified=26)
        scene = dict.fromkeys(validator.SCENE_FIELDS, None)
        scene.update(scene_id='TEST-SC1', evidence_summary='Synthetic non-horror observation.',
                     source_ids=['TEST-S1'], type_ids=[], competing_types=[], fit='not_applicable')
        work['scenes'] = [scene]
        self.sources = [dict(source_id='TEST-S1', work_id=work['work_id'], title=work['title'],
                             url='https://example.org/synthetic', accessed_at_utc='2026-10-04T11:00:00Z',
                             source_kind='synthetic', episode_scope='synthetic', variant='synthetic',
                             body_verified='true', notes='No actual story body.')]
        return work, scene

    def test_pending_is_not_complete(self):
        errors, submitted = validator.validate()
        self.assertEqual((errors, submitted), ([], []))
        errors, _ = validator.validate(complete=True)
        self.assertEqual(len(errors), 5)

    def test_unverified_entries_need_no_invented_analysis(self):
        self.write_submission()
        self.assertEqual(validator.validate()[0], [])

    def test_non_horror_scene_needs_no_type_assignment(self):
        self.add_verified_scene()
        self.write_submission()
        self.assertEqual(validator.validate()[0], [])

    def test_known_source_of_another_work_is_rejected(self):
        self.add_verified_scene()
        second = self.mapping['works'][1]
        self.sources[0].update(work_id=second['work_id'], title=second['title'])
        self.write_submission()
        self.assertTrue(any('belongs to another work' in e for e in validator.validate()[0]))

    def test_verified_scene_needs_its_own_evidence_reference(self):
        _, scene = self.add_verified_scene()
        scene['source_ids'] = []
        self.write_submission()
        self.assertTrue(any('scene has no source' in e for e in validator.validate()[0]))

    def test_unknown_time_is_not_silently_accepted(self):
        self.add_verified_scene()
        self.sources[0]['accessed_at_utc'] = '2026-10-04T11:00:00'
        self.write_submission()
        self.assertTrue(any('UTC timestamp' in e for e in validator.validate()[0]))

    def test_provenance_cannot_redefine_immutable_baseline(self):
        import hashlib
        path = self.root / 'baseline/v1-26types/report.md'
        path.write_bytes(path.read_bytes() + b'\nChanged baseline\n')
        p = self.root / 'baseline/v1-26types/provenance.json'
        metadata = json.loads(p.read_text())
        metadata.update(public_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                        bytes=len(path.read_bytes()), lines=len(path.read_bytes().splitlines()))
        p.write_text(json.dumps(metadata))
        self.assertIn('baseline: immutable v1 hash mismatch', validator.validate()[0])


if __name__ == '__main__':
    unittest.main()
