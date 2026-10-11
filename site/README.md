# GitHub Pagesの公開版

表示改善の最新レビューは[UIレビュー](review/ui/README.md)です。分類IDと四つの分析欄の内部キーを保持し、画面では分類名・型名・日本語の説明を使います。定義は`baseline/v1-26types/report.md`の「発生と解決を分解する」に従います。人物のイニシャルCやD子は概念の略号と区別します。

一覧の短いあらすじは、`site/core.mjs`の`shortSynopsis`が既存の発端・展開・結末から完全な文を抜粋します。独立候補や一部の複数篇には、同じ確認済み要約を基にした表示用の短文を用います。原資料・`site/narratives.json`・公開JSONは変更しません。検索には型名・分類名も加えますが、既存の型IDフィルタと判定の意味は保持します。

最新のオフラインプレビューを更新する場合：

```sh
python3 scripts/build_site.py
python3 scripts/build_site_preview.py site/review/ui/scare-pattern-ui-review.zip --instructions site/review/ui/preview-instructions.txt
```

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

`#source-出典ID`と`#scene-場面ID`の直リンク・履歴移動では、公開データから所有作品を解決します。未存在IDと不正なpercent encodingは一覧へ戻れるリンクエラーとして表示します。同一作品内では補足欄の開閉状態を保持します。

公開JSONのschemaは`public-research-site-4`です。群02の`target_outcomes`と`transitions`、群03の`problem_tracking`、群05の`outcome_tracking`を作品レベルの独立した欄に収録します。追跡対象の内部IDは除外し、公開済みの場面IDを参照リンクに使います。場面内の成果・閉鎖条件・v1判定を作品全体の記録へ置き換えません。これら3群の149場面行では成果欄の欠測を保持します。本文不足の行や資料同定の工程記録も含むため、149行全てに物語内の成果があるとは扱いません。

`research-snapshot.json`は歴史的v1資料の参照を保持し、`followup-snapshot.json`は追補の別commitと入力一覧を固定します。`followup/index.json`の入力ハッシュ・全39項目と照合してから、公開データの`followup`欄へ許可した要約・留保・出典・UTCだけを抽出します。旧本文状態・場面判定・出典欠測は置換しません。追補文書の更新は先にcommitし、そのcommitへ追補snapshotを更新してから再生成します。人間評価・未知test・GM/プレイ研究は未実施です。

追補の検査も公開更新時に実行します。

```sh
python3 followup/sources/validate_group_01_02.py
python3 followup/sources/validate_group_03_05.py --check-protected
python3 followup/classification/validate_codebook.py
python3 followup/evaluation/validate.py
python3 -m unittest discover -s followup/evaluation/tests
```

ブラウザ回帰テストはPlaywrightとChromiumがある環境で実行します。専用の一時ブラウザプロファイルとlocalhostの空きポートを使い、履歴、直リンク、リンクエラー、検索条件、空結果、mobile、keyboardを確認します。

```sh
node --test tests/site.browser.test.mjs
```

Playwrightが通常のmodule検索パスにない環境では`PLAYWRIGHT_MODULE_PATH`にその`index.mjs`を指定できます。既存Chromeをテストに使う場合は`SITE_BROWSER_CHANNEL=chrome`、スクリーンショットを保存する場合は`SITE_QA_DIR`に出力先を指定します。画像は公開treeへ自動コピーしません。


今回のあらすじ・時系列は[全件レビュー版](review/full/README.md)です。承認済みの4作品PoCから全131件を個別調査し、110件を作成（指定本文92件、範囲限定18件）、21件を作成保留としています。代表4作品のリンクは閲覧開始用のショートカットです。検索から全作品を開けます。

`story-narratives-2`の`release_stage: full_review`は歴史的v1と別の編集データです。発端・展開・結末、本文確認の範囲とUTC、出来事と語られる位置、伝聞・夢・映像・推測を保持します。恐怖の解釈は既存場面IDとその場面のv1候補型を参照します。今回の候補本文に対応する旧場面がない場合は`unclassified_new_evidence`として、場面ID・型なしで表示します。背景に型を強制せず、v1の分類やv3の検証状態も変更しません。

`ready`は指定した掲載本文の範囲、`scoped`はシリーズ等の限定範囲、`pending`は本文不足・同定／範囲の留保・取得失敗による作成保留です。保留作品にも個別の`investigation`（URLまたは検索語・UTC・結果・理由）を必須とし、あらすじや時系列を作りません。本文が今回見つかっても歴史的v1の未確認状態はそのままです。旧台帳と一致する参照は`v1_ledger`、新しいURLは`new_source`として同定根拠を付け、旧出典IDを流用しません。

`scripts/story_narratives.py`は全131項目の網羅、全件の個別調査、UTC、参照本文の照合記録、出典・場面所有者、旧候補型と新規本文の未分類を検査します。許可した編集フィールドだけを公開します。`tests/test_story_narratives.py`はあらすじ以外の全公開データが承認済みPoCの投影と一致するSHA-256も検査します。

手元で確認できる1ファイルのプレビューは、ビルド後に生成できます。

```sh
python3 scripts/build_site_preview.py /tmp/scare-review/preview.html
python3 -m http.server 8765 --bind 127.0.0.1 --directory /tmp/scare-review
```

ブラウザで `http://127.0.0.1:8765/preview.html#work=G02-W11` を開きます。HTML内にCSS・JS・公開データを含み、追加のリソース取得を行いません。原文・リポジトリへの外部リンクはクリック時だけ開きます。Cloudブラウザでは`file://`が管理設定で拒否されたため、localhost経由で確認しました。

既存Chromiumを実行ファイルで指定する場合は`SITE_BROWSER_EXECUTABLE=/usr/bin/chromium`を使えます。今回、新しい実行環境・依存パッケージ・ブラウザをインストールしていません。
