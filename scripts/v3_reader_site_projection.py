"""A navigation index derived from approved r2 records; no new classification."""
import json
from pathlib import Path
from v3_r2_site_projection import outputs as r2_outputs, compact

ROOT = Path(__file__).resolve().parents[1]


def outputs(projection=None):
    projection = r2_outputs() if projection is None else projection
    index = json.loads(projection['docs/v3/r2/index.json'])
    index['reader_schema_version'] = 'v3-reader-index-1'
    for entry in index['works']:
        work = json.loads(projection[f"docs/v3/r2/works/{entry['work_id']}.json"])
        entry['scope'] = work['scope']
        entry['reason'] = work['inherited_reason']
        entry['unextracted_count'] = sum(m['relation'] == 'not_reviewed_in_r2' for m in work['v1_comparisons'])
        entry['records'] = [dict(record_id=r['record_id'], actor=r['actor'], time_scope=r['time_scope'],
                                 anticipated_loss=r['anticipated_loss'],
                                 type_results=[dict(type_id=t['type_id'], decision=t['decision']) for t in r['type_records']])
                            for r in work['records']]
    result = {'docs/v3/reader-index.json': compact(index)}
    for name in ('v3-reader.html', 'v3-reader.css', 'v3-reader-core.mjs', 'v3-reader-views.mjs', 'v3-reader.mjs'):
        result[f'docs/{name}'] = (ROOT / 'site' / name).read_text()
    return result
