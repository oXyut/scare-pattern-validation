# 公開トップから v1／v3 比較へ移動する入口

上部ナビの「作品別資料」に続けて「v1／v3を比較する」を追加。
リンク先は `v3.html?edition=r2&version=compare`。
作品検索の主ボタンと既存の情報配置は保持。

ローカルの公開用 `docs/` を Chromium で表示して確認。

- [PC・1280px](desktop.png)
- [スマートフォン・320px](mobile.png)

ブラウザテストでは 1280px・390px・320px で、リンクの可視性、横はみ出しなし、
r2 比較への遷移、八尺様の v1 と r2 の両パネル表示、v1 への復帰、作品検索への移動を確認。
PC ではキーボードの Enter による移動も確認。

`site/index.html` を編集後、`python scripts/build_site.py` で `docs/index.html` を生成。
研究・分類データ、v1 と r1 の保存データには変更なし。
