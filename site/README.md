# GitHub Pagesの公開版

公開先は `https://oxyut.github.io/scare-pattern-validation/`。依存パッケージなしの静的サイトです。Pagesはmainの`/docs`から公開します。独自ドメインは設定しません。

`site/`が画面の原稿と実装、`docs/`が生成済みの公開ファイルです。`scripts/build_site.py`は研究資料から必要な分析欄だけを抽出します。怪談本文は収録せず、場面要約・判定・留保と出典リンクを掲載します。出典台帳のURL未同定行と取得日時の欠測も保持します。

```sh
python3 scripts/validate_repository.py --complete
python3 -m unittest discover -s tests
python3 scripts/build_site.py
node --test tests/site.test.mjs
node --check site/app.mjs
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs
```

研究資料の参照版は`research-snapshot.json`に固定します。研究資料を更新する際は、その版と画面内の数値・説明・出典参照を一緒に更新してください。固定v1の判定をv3へ読み替えません。生成後は`docs/`もコミットします。

検索条件はURLのクエリへ保存し、作品詳細は割当IDのハッシュで開きます。詳細から戻ると検索条件が残ります。型ラベルと場面判定は同一場面で照合し、作品全体の適合率を作りません。型ラベルは非排他的です。
