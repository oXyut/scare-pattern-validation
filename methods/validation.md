# 検証方法と受入条件

## 調査単位

一覧項目数と独立作品数を分けます。各群はassignments/groups.jsonの全割当を保持し、未確認の作品も削除しません。同一話の異名、派生、パロディ、非ホラーを識別し、シリーズは確認したエピソード範囲と未網羅範囲を記します。

作品の原典または信頼できる本文転載を読み、URL、取得日時UTC、版、続編の範囲を出典台帳へ記録します。タイトルや短い解説だけから物語を補完しません。本文を取得できなければ未検証を記録します。

## 独立な抽出と対応

1. 本文から恐怖を狙う問題状態を独立に抽出し、短い自作要約と出典を記す。
2. 作品全体と部分場面を分け、Q（問い）、D（危険）、C（選択）、M（世界モデル）を分解する。
3. 情報内容、提示方法、世界の出来事を分け、発生条件と閉鎖条件を記す。問いが解明されても危険が残る場合は区別する。
4. 固定26型の主型候補・副型を対応させ、適合、部分適合、不適合、本文不足を記す。
5. 競合型、判別根拠、既存型で説明できない残余、反例、確信度を残す。

F群は怪異、未知、専門家の動揺だけで判定しません。D5とD1・D2、E5とE3・E4の境界を点検します。既存型の複合や修飾条件で足りるかを先に検討し、必要な新型候補は群別仮ID G01-N01等で記します。追加・修正不要という結論も許容します。既存のIDは改名しません。

## 各群の成果

- reports/report.md：全対象の作品別分析、反例・残余・型境界、群としての改訂案、限界。
- data/mappings.json：baseline、group_id、assigned_titles、counts、works。baselineにはbaseline_idとsha256を記す。公開時にLibrary ID、会話ID、絶対パスを除く。
- sources/ledger.csv：source_id,work_id,title,url,accessed_at_utc,source_kind,episode_scope,variant,body_verified,notes。

worksにはwork_id、title、body_status、source_ids、episode_scope、alias_or_derivative、overall_fears、scenes、unexplained_residue、counterexamples、change_proposals、confidenceを記します。body_statusはverified、partial、unverifiedへ正規化し、元の判定内容は保持します。

scenesにはscene_id、evidence_summary、source_ids、Q、D、C、M、information_state_change、onset_conditions、closure_conditions、local_or_global、type_ids、fit、competing_types、discriminators、residue、confidenceを記します。引用ではない自作分析を中心にし、根拠のない場面を作りません。

countsにはassigned_entries、verified、partial、unverified、independent_worksを記します。状態別合計は割当件数と一致させ、独立作品数は異名・重複に基づき別途判断します。

## PRとmerge

群別branchはresearch/group-01〜05とします。群別draft PRは各群のdirectoryだけを変更します。共同の基準や割当の修正は別PRで提案します。異なるcloneまたはworktreeで作業し、mainへ直接研究成果をpushしません。

統合担当は件数収支、本文根拠と版、26型との整合、未確認の明示、異名・重複、引用量・個人情報を確認します。各成果には分析を担当した群と、受領内容からPRを作成した担当を区別して記録します。代行作成者を分析者として表示しません。

全群を受領してから、integration/reports/robustness.mdとintegration/data/summary.jsonへ横断的評価を別PRで提出します。未検証の項目を成功扱いせず、反例を残します。改訂候補はbaseline/v2-proposed等へ追加し、v1-26typesを保持します。統合担当の自身の改訂案も根拠と限界を明記してレビューします。

## 公開レビュー

怪談の原文丸ごと、長い転載、個人情報、会話本文、ローカル絶対パス、認証情報を追加しません。資料内の呪い・自己責任の文言は研究対象のフィクションとして扱います。出典URLは保持しますが、取得できなかった本文の存在確認や原典との完全一致を主張しません。

