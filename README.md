# scare-pattern-validation

探索型ホラーの既存26型を、洒落怖の一覧131項目に適用して点検する研究記録です。本文を確認してから、作品全体と場面の問題状態、発生条件、閉鎖条件を分析します。

## 現在の状態

5群をレビュー後にPR経由でmergeしました。固定131項目は本文確認92・部分確認14・未確認25。独立作品の正確な総数は未確定です。提出完了・構造検査成功を26型の頑健性や怖さ効果の実証とみなしません。全割当、本文不足、異名・重複候補、範囲限定、反例を保持しています。

| 群 | 一覧項目数 | 提出先 |
|---|---:|---|
| group_01 | 27 | groups/group_01 |
| group_02 | 26 | groups/group_02 |
| group_03 | 26 | groups/group_03 |
| group_04 | 26 | groups/group_04 |
| group_05 | 26 | groups/group_05 |
| 合計 | 131 | 各群の独立作品数は別途集計 |

元の一覧の主対象132項目から、基準で適用済みのコトリバコを除きました。別カテゴリの作品は加えていません。

## 資料

- [固定基準26型](baseline/v1-26types/report.md)：2026年10月4日のD5・E5追加版。
- [基準の由来とハッシュ](baseline/v1-26types/provenance.json)
- [検証方法とPRの受入条件](methods/validation.md)
- [全131項目の固定割当](assignments/groups.json)
- [横断レビューと限界](integration/reports/robustness.md)
- [件数・全割当・merge証跡](integration/data/summary.json)
- [26型 v2 設計レポート（未検証）](baseline/v2-proposed/report.md)
- [境界運用の改訂案（未採用）](baseline/v2-proposed/operational-boundaries.md)

各群のAI研究担当が分析・PR提出し、統合担当AIが群2〜5の欠測メタデータと件数精度を説明付きで追補、全5群を内容レビューしました。独立した人間の分析・承認ではありません。本文根拠、版と範囲、26型の境界、本文不足、異名・重複、公開範囲をPRのCOMMENTレビューへ記録し、ユーザーのmerge承認に従って処理しました。横断評価は別統合PRで管理します。

## 公開範囲

作品名、原典・本文転載へのリンク、分析者が書いた短い場面要約と分析を収録します。怪談本文の丸ごと転載、長い引用、個人情報、会話履歴、認証情報、実行環境の絶対パスは収録しません。分析に使った出典と版の制約を残します。

この分類は暫定的な設計目録です。構造の記述適合性を調べる研究であり、読者の怖さやTRPGでの効果を測定する研究ではありません。

検査は `python3 scripts/validate_repository.py`。全5群の最終成果が揃った場合は `python3 scripts/validate_repository.py --complete` を使います。

