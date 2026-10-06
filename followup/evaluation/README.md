# 独立評価の実施準備

状態は設計段階です。人間評価、参加者募集、未知test資料の取得、GM比較、実プレイは実施していません。結果、成功率、実測の一致度はありません。

[既存のv3評価計画](../../methods/v3-evaluation-plan.md)を実施手順と記録様式へ具体化しました。v3のcodebook自体は別途固定する必要があります。このディレクトリは型の定義、必須条件、補助条件を追加・変更しません。

## 読む順序

| ファイル | 用途 |
|---|---|
| [protocol.md](protocol.md) | 担当、固定、重複照合、選定、盲検符号化、調停と各比較試験の順序 |
| [analysis-plan.md](analysis-plan.md) | 測定単位、指標、必要Nの仮定、計画上の閾値、欠測と判定 |
| [gm-rubric.md](gm-rubric.md) | 型名を使わない外部の設計評価基準 |
| [records.md](records.md) | JSONの記入方法、公開範囲、受入条件 |
| [templates/](templates/) | 未記入の計画、資料、符号化、調停、GM採点、体験、判定記録 |
| [schema.json](schema.json) / [validate.py](validate.py) | 構造と研究手順の一部の検査。Python標準ライブラリのみ |

## 現在の保留事項

codebookの必須・補助条件と場面区切り、人間評価者・GM・プレイヤーの手配、参加条件と同意、未知資料の独立性照合、抽出枠、実行予算、指標と最小効果の合意が未完了です。取得日時、実測値、人物情報は空欄を保っています。実施開始には[protocol.md](protocol.md)のG0〜G3を通過する必要があります。

131項目はdevelopment資料です。正確な独立作品数は未確定です。固定v1の92確認・14部分確認・25未確認、258場面中25本文不足、233判定の75適合・141部分適合・17不適合、新候補8・採用0は歴史的記録として保持します。v3の結果や未知testの件数へ変換しません。

## 構造検査

リポジトリのルートで実行します。

```sh
python3 followup/evaluation/validate.py
python3 -m unittest discover -s followup/evaluation/tests -v
python3 scripts/validate_repository.py --complete
```

既定の検査は未記入テンプレートの整合性を確認します。研究が実施可能になったことや分類・効果の支持を示しません。実施者は既存の無視対象`private/`以下に記録を作り、次のコマンドで検査できます。コマンド例のファイルは本PRでは作成しません。

```sh
python3 followup/evaluation/validate.py --record private/evaluation/annotation.json
python3 followup/evaluation/validate.py --ready private/evaluation/study-plan.json
```

`--record`は一件の記録の構造・条件間整合性を確認します。`--ready`は計画記録の開始前項目を検査します。本文の真偽、独立性、参加同意、盲検の実態、標本設計の妥当性は人間が別途確認します。全記録の照合とハッシュ照合も実施者の責任です。
