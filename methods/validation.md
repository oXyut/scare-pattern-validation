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


## 受領時の正規化と検査の範囲

受領・正規化・PR作成は統合担当が行い、分析担当は各群として明記します。これはAI研究セッション間の分担であり、実在人物による独立評価を意味しません。元の判断、確信度、残余、未確認理由を保持し、追加フィールドや元の状態ラベルも削除しません。形式変換の理由を群の報告またはPRに記録します。

出典台帳のtitleは固定割当名とし、出典ページの表題や異名はvariantまたは追加列に保持します。同じURLが複数作品を扱う場合は、work_idごとに異なるsource_idの行を作成します。場面のsource_idsは、その作品のsource_idsに含めます。取得日時はタイムゾーンを明示したUTCのISO 8601形式（例：2026-10-04T11:00:00Z）へ変換します。実際の取得日時が不明なら、推測せず、追加確認が必要な状態としてレビューに残します。

台帳のbody_verifiedはtrue（当該範囲の本文を確認）、partial（本文の一部を確認）、false（本文未確認）、unknown（受領情報から判定できない）を使います。作品単位のbody_statusとは範囲が違うため自動的に同一視しません。シリーズの一編を全編確認した場合でも、一覧項目全体の未網羅範囲をepisode_scopeへ記します。

不適合や非ホラーの場面はtype_idsを空配列にできます。本文不足の作品はscenesやoverall_fearsを空配列にでき、仮説を保持する場合は仮説であることと根拠の限界を明記します。確認済み作品にも型の付与や最低場面数を強制しません。Q/D/C/Mは不存在を明記でき、閉鎖条件が本文中で達成されないことも許容します。検査を通すために物語、取得日時、型、閉鎖条件を補完しません。

スクリプトは固定基準のハッシュ、割当の保持、件数収支、必須フィールド、出典の参照関係と形式を確認します。検査出力の提出数は必要な3ファイルが存在する群数であり、分析完了、レビュー完了、merge済みを意味しません。--completeも全群の構造検査であり、本文の真偽、分類の妥当性、独立作品数の判断、著作権や個人情報の確認、恐怖効果の実証を代替しません。

## 欠測を保持する出典メタデータ

取得時刻の不明を検査合格のために埋めません。台帳にaccess_time_status=not_recordedとaccess_time_missing_reasonを記し、accessed_at_utcは空欄のままにします。UTCの日付だけが記録されている場合は元の日付を保持し、access_time_status=date_only_utcと精度不足の理由を記します。台帳登録時刻や統合担当の再閲覧時刻は初回取得時刻に代用しません。追加列のledger_registered_at_utc等は別情報として保持します。

本文URLを同定できなかった探索はrecord_kind=search_record、url_status=not_identified、url_missing_reason、body_verified=falseとして残せます。空URLの探索は本文出典として認めず、verified/partialの作品・場面にはURLのある参照を別途要求します。これらの例外は明示された欠測の記録を受け入れるもので、本文確認を補強しません。統合結果には欠測の行数と精度を集計します。

independent_worksは全割当の独立作品総数が確定しない場合nullとします。確認済みの物語数、支持された下限、一覧項目の同定数、シリーズ内エピソード数はそれぞれ定義を添えて別フィールドに保持します。単位の異なる群別数値を単純合算して独立作品総数と表示しません。
