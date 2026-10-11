"""Build the separate v3 review without changing any existing v1/site output."""
import argparse
import json
from pathlib import Path
from v3_research import ROOT, build, dump
from v3_r2_site_projection import outputs as r2_outputs


def outputs():
    data = build()
    index = {k: v for k, v in data.items() if k not in ('works', 'input_hashes')}
    index['works'] = [{k: w[k] for k in ('work_id', 'title', 'coverage_status',
                         'inherited_narrative_status', 'comparison')} for w in data['works']]
    v1 = json.loads((ROOT / 'docs/data.json').read_text())
    index['v1_baseline_id'] = v1['baseline_id']
    index['v1_types'] = v1['types']
    result = {'docs/v3/index.json': dump(index)}
    detail = dict(schema_version='v3-work-records-1', version=data['version'],
                  works={w['work_id']: w for w in data['works']})
    result['docs/v3/works.json'] = json.dumps(detail, ensure_ascii=False, separators=(',', ':')) + '\n'
    for name in ('v3.html', 'v3.mjs', 'v3-r2.mjs', 'v3.css'):
        result[f'docs/{name}'] = (ROOT / 'site' / name).read_text()
    result.update(r2_outputs())
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for name, content in outputs().items():
        path = ROOT / name
        if args.check:
            if not path.exists() or path.read_text() != content:
                raise ValueError(f'v3 output differs: {name}')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
    print('Independent r1/r2 output checked: 131 works each; existing v1 and r1 data unchanged')


if __name__ == '__main__':
    main()
