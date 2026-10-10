"""Export the built PoC as one offline HTML file for UI review."""
import argparse
import base64
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def preview_html():
    docs = ROOT / 'docs'
    data = json.loads((docs / 'data.json').read_text())
    assert data['narratives']['release_stage'] == 'poc'
    html = (docs / 'index.html').read_text()
    css = (docs / 'styles.css').read_text()
    cover = base64.b64encode((docs / 'corridor-cover.webp').read_bytes()).decode('ascii')
    css = css.replace("url('corridor-cover.webp')", "url('data:image/webp;base64," + cover + "')")
    core = (docs / 'core.mjs').read_text().replace('export ', '')
    app = (docs / 'app.mjs').read_text()
    app = app.replace("import {statusLabels,filterWorks,matchingScenes,resolveRoute} from './core.mjs';\n", '')
    # Inline the already-validated public projection. No file:// fetch or imports.
    loader = "const response=await fetch('data.json');if(!response.ok)throw new Error('data unavailable');data=await response.json();"
    assert loader in app
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    app = app.replace(loader, 'data=' + payload + ';')
    html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + css + '</style>')
    html = html.replace('<link rel="icon" href="favicon.svg" type="image/svg+xml">', '')
    html = html.replace('<script type="module" src="app.mjs"></script>', '<script type="module">' + core + '\n' + app + '</script>')
    # The wordmark returns to this file instead of its parent directory.
    html = html.replace('class="wordmark" href="./"', 'class="wordmark" href="#"')
    return html


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    markup = preview_html()
    if args.output.suffix == '.zip':
        with zipfile.ZipFile(args.output, 'w') as bundle:
            for name, body in [('preview.html', markup), ('README.txt', (ROOT / 'site/review/poc/preview-instructions.txt').read_text())]:
                info = zipfile.ZipInfo(name, (2026, 10, 10, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                bundle.writestr(info, body)
    else:
        args.output.write_text(markup)
    print(f'Wrote offline PoC: {args.output}')
