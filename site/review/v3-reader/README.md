# 独立した v3 作品閲覧ページ

[Issue #29](https://github.com/oXyut/scare-pattern-validation/issues/29) の実装レビュー。
着手時の main は `8ed34c2fbcf5d7c5f54aa5c9ba3207081e1731c5`。

## 画面と閲覧の流れ

入口は `v3-reader.html`。作品検索を中心に、全131項目の一覧、あらすじ、時系列、
当事者と時点を限定した v3 分類、必須条件、本文根拠、出典へ進む。
上位分類と型は日本語名と共通の色で示し、作業群や内部IDを主表示にしない。
世界モデルの前提変更を、当事者の問題状態とは別の区画に配置。

- [PCの入口・検索](reader-catalogue-desktop.png) / [モバイルの入口](reader-catalogue-mobile.png)
- [PCの作品一覧](reader-results-desktop.png) / [モバイルの作品一覧](reader-results-mobile.png)
- [PCのあらすじ](reader-story-desktop.png) / [モバイルのあらすじ](reader-story-mobile.png)
- [PCの時系列](reader-timeline-desktop.png) / [モバイルの時系列](reader-timeline-mobile.png)
- [PCの条件と根拠](reader-conditions-desktop.png) / [モバイルの分類](reader-classification-mobile.png)
- [世界モデルの旧前提・新証拠と限界](reader-world-desktop.png)
- [本文・同定保留](reader-held-mobile.png)

Chromium のローカル `docs/` 表示を撮影。PC は1280px、モバイルは390px（本文保留は320px）。
これらは公開画面のキャプチャではない。

## 版・範囲の分離

v1トップの入口を「v3版で読む」に変更。各版で選択作品と検索語を引き継ぐ。
型・上位分類・判定のフィルタは意味が異なるため版をまたいで移さない。
各ページ内では検索条件・詳細・本文根拠をURLに保持し、再読込と履歴で復元する。
`v3.html` は従来の比較・条件点検ページとして保存。旧クエリ／ハッシュURLを維持する。

新しい検索用インデックスは承認済み r2 の型別結果を転記した表示用投影。
あらすじ110件、限定範囲18件、本文保留21件、選定118記録、未抽出の既存104場面を保持。
本文保留に26型の証拠不明を作らず、未抽出を不成立に置き換えない。
時系列の編集上の恐怖解釈から、旧v1の型をv3の成立した型へ移さない。
対応関係がある場合だけ、当事者・時点・範囲を確認できる選定記録にリンクする。
必須条件の成立、条件ごとの証拠不明／明示的不成立、観察された閉じ方を別々に表示する。

研究データ、`docs/data.json`、保存したr1/r2データと従来の比較実装は変更なし。
v1の表示変更は版切替リンクと、そのURLの更新に限定する。

## 検証

- Python 57件、Node 22件、統合ブラウザ49件が成功。
- 全131作品の時系列段階数と選定記録数を原データと照合。320pxで全詳細を展開して横はみ出しなし、重複IDなし。
- PC1280px、モバイル390px／320px、追加の900px／768px／601pxを確認。
- 検索、本文範囲、上位分類、型、条件結果、並び順、空結果、リセット、詳細、出典、URL再読込／戻る／進むを確認。
- v1の作品・場面・出典から同じ作品のv3へ移動。v1との往復で選択作品と検索語を確認。
- キーボード、開閉、見出しへのフォーカス、forced-colorsを確認。
- 取得失敗、版不一致、別作品の根拠、不正URLを明示エラーにする。遅れて到着した前の作品が選択中の資料を上書きしないことを確認。
- GitHub Pagesのサブパスと、従来のr1/r2比較URLを確認。
- `validate_repository.py --complete`、`build_v3_site.py --check`、研究・保存データ差分なし、`git diff --check` を確認。

```sh
python scripts/build_site.py
python scripts/build_v3_site.py
python scripts/build_v3_site.py --check
python scripts/validate_repository.py --complete
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/site.test.mjs tests/v3-r2.test.mjs tests/v3-reader.test.mjs
PLAYWRIGHT_MODULE_PATH=/opt/codex/runtimes/cua/lib/node_modules/playwright/index.mjs \
SITE_BROWSER_EXECUTABLE=/usr/bin/chromium SITE_QA_DIR=/tmp/scare-v3-reader-review \
node --test tests/site.browser.test.mjs tests/v3.browser.test.mjs tests/v3-r2.browser.test.mjs tests/v3-reader.browser.test.mjs
```

ソフトウェアの表示・整合性検査であり、研究上の独立評価や一致度測定を実施したものではない。
mainマージは自動Pages公開を起こすため、今回PRの公開について追加確認を受けるまで実施しない。
