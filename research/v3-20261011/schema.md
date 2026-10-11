# v3-development-review-1 の契約

v1のデータとは独立した版 `v3-development-review-r1`。入力のmain commitは `input_base_commit`、凍結した入力ファイルは `input_hashes` で示す。新しい調査成果自体のcommitは、このディレクトリを追加するPRのcommitであり、入力commitと同じではない。

`works` は固定の131割当ID。同名やシリーズの候補があっても、独立した131作品だと数え直さない。`inherited_narrative_status` は既存編集データのready92・scoped18・pending21を保持し、`v1_body_status` はさらに別の歴史的v1本文状態を保持する。

- `records` は選定された当事者・時点・証拠層の点検単位。r1では110件に各1記録を置く。将来は複数記録を追加可能だが、同じ観察や別評価者の記録を独立作品として重複集計しない。
- `problem_state_records` はA〜Eの22型。`world_model_records` はFの4型。IDがv1と共通でも、定義は `fear-patterns-v3-codebook-proposed-1` の必須条件を参照する。
- 各型の `required_evidence` は共通・型別条件の全IDを含む。stateはsupported / explicitly_false / unknown、reasonは判断理由。evidence_idsは同じ作品の選定stepを参照し、unknownでは空。既存レビューID・URLは作品のsource_reviewsで解決する。
- 共通条件が不明な場合もunknownとして記録し、読者の怖さ・分析者の危険推定から補完しない。未記入の型別条件はunknownへ展開し、型の条件文と当該記録のresidue・確認範囲を合わせて読む。
- decisionは全条件supportedならfit、明示的falseが一つ以上ならnot_fit、残りpending。partialは許可しない。fitのroleはunrankedで、主副の順位未決を表す。どちらの順位でも必須条件を緩和しない。
- `world_model_evidence` は旧前提・新証拠・証拠範囲・受容と脅威・局所説明では足りない理由・代替仮説を分ける。r1のFは全保留。nullを全般的陰性へ読み替えない。
- `closure_observed` は作中で観察された閉じ方。typesのclosure_designは設計案であり、実現した成果ではない。`confidence` と `confidence_limit` は単一AI、既存レビュー利用、対象箇所のみ再閲覧という限界を示す。
- 本文保留はrecordsを空にし、source_hold_judgmentsの26型すべてをunknown/pendingにする。具体的理由・取得調査は残す。当事者・場面・結末を作らない。
- `targeted_rechecks` は今回実施した再閲覧・検索。旧レビューのUTCを上書きしない。observed_after_at_utcは調査バッチ後の時計であり、取得開始時刻を装わない。
- 再閲覧で要約の修正が必要な場合、v3のevidence.eventを自作の修正要約にし、inherited_eventに以前の要約を保存する。correction_reasonと同じ作品のcorrection_source_recheck_idsを必須にする。v1のあらすじ自体は変更しない。
- `v1_historical_scenes` とcomparisonは旧場面の候補と新しい選定場面の支持型を併記する。旧候補が新しい選定範囲で未支持でも、削除・退化・適合率の差ではない。非対応の範囲を含む比較である。

`review-notes.json` はAIが個別に記した判断入力。生成器は条件集合の展開・整合性・件数確認を行う。v1のtype_ids、恐怖解釈、fitをv3の判定の入力に使わない。v1ラベルは比較欄の作成にだけ読む。

独立した公開用出力は `docs/v3/index.json`（版、基準、旧v1型定義、一覧）と `docs/v3/works.json`（`v3-work-records-1`、同じ版、work_idをキーとする全記録）。一覧と詳細の版・作品所有者を照合する。現行 `docs/data.json` とUIは変更しない。

human coding、independent test、agreement、GM効果、player効果の実施フラグ・nullを保持する。記録の存在やテスト成功から独立評価・実証済み効果を推論しない。
