# あらすじ・時系列の4作品PoC

[プレビューZIPをダウンロード](scare-pattern-poc.zip)し、展開したフォルダで次を実行します。GitHub上ではZIPを開いて「Download raw file」を選びます。

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

ブラウザで `http://127.0.0.1:8765/preview.html` を開き、冒頭の4作品リンクを選びます。詳細上部でも4作品を切り替えられます。CSS・JS・画像・データを1つのHTMLに内包しています。ホストされたプレビューURLはありません。Cloudの`file://`は管理設定で禁止されたため、localhostで動作を確認しました。

| 作品 | 確認する構成 | 直リンクの末尾 | PCの冒頭 | PCの流れ | モバイルの恐怖の対応 |
|---|---|---|---|---|---|
| 赤い仏像 | 現代と年代不明の過去映像を別の流れにする | `#work=G01-W01` | [画像](red-statue-desktop.png) | [画像](red-statue-timeline-desktop.png) | [画像](red-statue-mobile.png) |
| 猿夢 | 夢の中と覚醒後の証言を区別する | `#work=G02-W11` | [画像](monkey-dream-desktop.png) | [画像](monkey-dream-timeline-desktop.png) | [画像](monkey-dream-mobile.png) |
| 八尺様 | 防御、逃走、十年後の予期を区別する | `#work=G05-W18` | [画像](eight-feet-desktop.png) | [画像](eight-feet-timeline-desktop.png) | [画像](eight-feet-mobile.png) |
| 人型焼き | 終盤に明かされる由来を物語内の時間へ並べ直す | `#work=G03-W20` | [画像](doll-burning-desktop.png) | [画像](doll-burning-timeline-desktop.png) | [画像](doll-burning-mobile.png) |

時系列は、細い連続した縦軸、丸いノード、左端を揃えたカードで表示します。PCでは日時・ノード・カードをそれぞれ同じ列に揃え、モバイルでは左に軸を置いて日時とカードを1列で読みます。出来事と恐怖・候補型は常時表示し、分類の根拠・留保と語られる位置・本文出典は個別に開けます。左右交互の配置は使わず、画面と読み上げの順序を上から下へ揃えています。

| 八尺様の同じ位置の比較 | 変更前 | 変更後 |
|---|---|---|
| PC 1280px | [画像](comparison-before-desktop.png) | [画像](comparison-after-desktop.png) |
| モバイル390px | [画像](comparison-before-mobile.png) | [画像](comparison-after-mobile.png) |

[猿夢・根拠と出典を開いたモバイル画面](monkey-dream-expanded-mobile.png)では、カードが伸びても次のノードまで軸がつながることを確認できます。あらすじの長さ、縦の流れの追いやすさ、各場面の恐怖と型・根拠の対応、モバイルでの情報量をご確認ください。本文範囲と限界はあらすじ直下の開閉欄から読めます。

今回表示するのは4作品・17段階です。各作品の発端・展開・結末を既存台帳の掲載本文で確認し、独自の言葉で要約しました。4作品の5ページの確認範囲・再確認日時は`site/narratives.json`に記録しています。

- [赤い仏像 Part1](https://llike.net/2ch/fear/akaibutuzo/)・[Part2](https://llike.net/2ch/fear/akaibutuzo/2.htm): 訪問・逃走・介抱と由来説明。映像の年代・由来や口封じという結論を確定事実にしない。
- [猿夢](https://nazolog.com/blog-entry-1164.html): 2000/08/02の投稿9・12・13。別体験、猿夢＋、投稿後の死を含めない。
- [八尺様](https://nazolog.com/blog-entry-1020.html): 春休みの事件と十年後の電話。身代わりの犠牲の実行や十年後の再襲撃を補わない。
- [人型焼き](https://the-mystery.org/scary_story/hitogata_yaki/): 参拝から焼却、神主による由来説明まで。伝聞と参拝者の出来事を区別し、焼却の不可避性を断定しない。

既存の131項目、258場面行（本文不足25行）、166出典、26型、v1判定、39項目の追補は変更前の公開JSONと完全一致しています（schema番号と新しい`narratives`欄を除く比較）。新しい時系列はv1の場面IDと候補型へ参照し、v3の再分類・検証とは扱いません。

今回の表示対象外は127件です。作成済み下書き32件はUIレビュー待ちとして表示を止めました。残る95件の内訳は、v1本文未確認25件、同定・範囲に留保があり今回の照合未完了12件、v1では本文確認だが今回の発端・結末・順序の照合未完了58件です。後者を「原文が取得不能」とは扱いません。すべてに明示的状態と理由を持たせ、既存資料を閲覧できます。

同じCloud環境で作業を継続し、`tex-workspace`は変更していません。Python 3.12.14、Node 24.19.0、既存PlaywrightとChromium 151を使用し、新規インストールはありません。Git取得と接続済みGitHubの読み書きは成功。環境内の直接HTTPSはプロキシのCONNECT 403で停止しましたが、利用可能なWeb閲覧機能で掲載本文を確認できました。Web閲覧でも当初取得できなかった一部ページは再取得で成功しており、サイト側拒否とは断定していません。

検証結果:

- リポジトリ全件検査、追補2群・コードブック・評価記録の構造検査: 成功。
- Python回帰25件、追補評価20件、Node回帰9件: 成功。
- Chromiumブラウザ回帰15件: 成功。4作品×1280px・390px・320pxの軸・ノード・カードの整列と読み順、根拠と出典を開いた際の軸の連続性、320pxで長い日時・本文・型名が折り返す場合を含む。
- PC 1280px、モバイル390px・320px: 横方向のはみ出しなし。4作品のPC・モバイル画面を実際に撮影し確認。
- 検索・絞り込み・空結果・戻る／進む・場面／出典／分類へのリンク・キーボード・開閉状態を確認。
- 1ファイルプレビューは一覧と作品切り替え時に追加リソース通信なし。
- `node --check site/app.mjs`と`git diff --check`: 成功。

2026-10-11のUI更新では`site/narratives.json`と`docs/data.json`が更新前とバイト単位で一致しています。承認された「細い縦軸・丸いノード・整列したカード・余白と文字階層」を基準として実装し、生成画面を実際に撮影・確認しました。参照画像そのもののピクセルを取得できていないため、画像への忠実な再現とは評価していません。比較画像4枚、4作品の画面12枚、開閉例1枚はこの更新後に撮り直しています。

原文との完全な校訂、独立した人間による分類評価、恐怖効果の実験は行っていません。UIレビュー前の他作品への展開は停止中です。mainへのマージ・公開サイトへの本番反映は行いません。

プレビューを再生成する場合:

```sh
python3 scripts/build_site.py
python3 scripts/build_site_preview.py site/review/poc/scare-pattern-poc.zip
```
