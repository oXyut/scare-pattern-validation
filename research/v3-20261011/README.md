# 独立したv3初回点検

[調査結果・全131件一覧](report.md)、[手順](protocol.md)、[データ契約](schema.md)、[機械可読の全記録](assessments.json)。110件の選定場面と21件の本文保留を保存しています。限定範囲18件も保持し、全場面を網羅した確定分類としては扱いません。

今回の直接再閲覧は8作品の指定箇所です。既存レビューの継承と新しい再閲覧の記録を区別し、人間独立評価・一致度・未知test・GM／プレイ効果は未実施です。

対象は専用ブランチ `research/v3-condition-audit-20261011`。現行v1サイトにリンクや表示変更を入れていません。比較ページは独立した `v3.html` から閲覧できます。

```sh
python3 scripts/v3_research.py --check
python3 scripts/build_v3_site.py --check
python3 -m unittest discover -s tests
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs
```

ローカルで `http://127.0.0.1:8765/v3.html?version=compare#G05-W18` を開きます。表示版・検索・本文範囲はURLへ保存されます。根拠のリンクも作品IDを含み、再読込で同じ作品へ戻ります。データを変更する場合は判断入力を編集して次を実行します。

```sh
python3 scripts/v3_research.py
python3 scripts/build_v3_site.py
```

このビルドは既存 `build_site.py` の出力を触りません。将来現行サイトへ入口を追加する際は別セッションのUI成果と調整してください。mainへのマージ・本番公開は今回の作業に含めません。

[検証結果](validation.md) に実際の実行手続き・結果を残します。
