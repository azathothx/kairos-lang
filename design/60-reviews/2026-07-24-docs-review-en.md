# 外部ドキュメントレビュー第 3 回（英訳検証）受領と処置（2026-07-24）

英語フルミラー（en/spec 8・en/reference 29・en/stdlib 4＝41 ファイル・約 5,400 行）への外部レビュー
（第 3 回）を設計者経由で受領した。対象は公開リポジトリ HEAD `7e23ec3`（前回 `9aa01de` から 18
コミット・約 8,200 行追加）。方法は 3 並行の対訳精査（spec / reference / stdlib＋入口）＋機械チェック
（リンク 156 ファイル・不可視文字・en/ja コード同一性の独立検証・source_sha 照合）＋テストスイート
実走。本ページは指摘と処置の記録（原文は設計者の手元。原文ヘッダの「再レビュー日 2026-07-14」は
対象 HEAD の成立日〈2026-07-24〉と矛盾するため誤記と判断して収蔵）。

**総評（レビュー）**: 英訳は「忠実で高品質なミラー」。全 41 ページで意味レベルの誤訳・脱落・規範の
ズレはゼロ（不変条件 I1〜I8・静的エラー条件・宣言必須/寄り/既定可のニュアンス・比較表の全行まで
対訳照合済み）。実行例のコードは全ブロックが日本語版と同一（コメント翻訳を除く・独立スクリプトでも
一致確認）。source_sha の全ページ一致・kyureki 非ミラー明記の全面一貫・言語スイッチャの健全性・
RC 主張の実測一致（当時 439/439 実走）も確認。同期間の仕様追補（ADR-45/46）の織り込み一貫・前回
残指摘の全解消（提案された機械検査の常設含む）も確認された。HIGH は 1 件のみで、過去 2 回と同じ
「主張と実態の乖離」型。

## 指摘と処置（重要度順・レビューの記号を踏襲）

| # | 指摘 | 検証 | 処置 |
|---|---|---|---|
| J（HIGH） | en/reference/README が「` ```kairos ` フェンスは実行検証済み」と主張するが、doctest の走査対象は日本語側のみ——en 側だけの編集・再同期ミスを機械が検出できない（source_sha は日本語側の変更しか捕まえない） | 実在 | 推奨案どおり **「en フェンス ≡ ja フェンス（コメント行以外）」の同一性検査を doc-consistency に常設**（`# eval:`・`#=>`・`#~>` は規範なので一致必須・全行コメントは翻訳可として除外・行末コメントは切除比較。初回実行で全ブロック一致＝レビューの独立検証と符合）。あわせて en/reference/README に「doctest は日本語原文を実行・本ミラーは同一性検査で追従」の機構説明を追記 |
| K-a | I5 の訳が "Coverage verification"（10-types・40-grammar）と "Exhaustiveness verification"（glossary ほか）で分裂——coverage は覆域/`covering:` の固定訳と概念衝突 | 実在 | **Exhaustiveness verification に統一**（2 箇所） |
| K-b | 利用側相対の訳が 3 通り（user-side relative・consumer-relative・the consumer's preamble） | 実在 | 軸の立場（bizDay vs bizOpen の規範対比）は glossary の既訳 **consumer-relative** に統一（4 箇所）。「利用側の前文」は多数派 **user-side preamble** に統一（epochOrdinal の 1 箇所）——連語ごとに 1 訳へ |
| K-c | 記述語リファレンスの名が入口 "descriptor reference" とミラー本体 "Description-Word Reference" で分裂 | 実在 | 推奨どおり **descriptor に統一**（en/reference/README の H1 と本文・00-intro・stdlib 2 篇・図 alt 文） |
| K-d | 仮称の訳が "placeholder" と "provisional name" で分裂——後者は仮称語数の自動検査の網の外 | 実在 | **placeholder に統一**し、語数主張の言い回しも検査の正規表現に入る形へ揃え直し（fiscal・iso-week・00-intro・glossary・shiftBoundary の 5 ファイル） |
| K-他 | glossary だけの別訳（head point・bound-name・Interval-list・Final）と Related/See also の 15/13 分裂 | 実在 | 本文多数派に統一（first point・binding-name・interval-sequence・Settled・`## Related`）。**en 固定訳語の横断検査を doc-consistency に常設**（日本語側の用語規律検査と同型・別訳 8 パターン） |
| L | README.ja「英語版は順次拡充」が陳腐化（フルミラー完成と矛盾・日本語入口に完成告知なし） | 実在 | 「spec/reference/stdlib は英語フルミラーあり〈旧暦のみ日本語〉」へ更新。同型の残存（docs-topbar のコメント・doc-consistency のコメント）も更新 |
| M | llms.txt が「fully mirrored in English」と述べつつ、見出しは「Specification (Japanese)」のままリンクは全て日本語ページの raw URL——英語で消費する AI 読者がミラーに到達できない | 実在 | 見出しを English mirror に変更・spec/reference/stdlib のリンクを en/ の raw URL へ差し替え。日本語正本のパス規則（en/ を外す）を 1 文で明記・kyureki は日本語専用と URL 併記・40-examples の行に Japanese 表示を追加 |

## LOW の処置

- **gregorian.md の壊れた 1 文**（"leap gives only February 29"・原文「閏は 2 月だけ 29」）→
  "in a leap year only February has 29" に修正。
- **segmentBy.md「前提条件と締め」の訳 "closures"** が臨時休業（ad-hoc closures）と衝突 →
  **tightening rules** に変更。
- **30-body-layer の要素点列定義の関係詞落ち**（所有格に誤読される）→ glossary の言い回しに統一。
- **見出し体裁**: stdlib H1 の Premise 大文字（gregorian のみ）→ premise・「The complete
  definition」→「Complete definition」・reference 分類行の区切り（· と / の混在 8 頁）→ / に統一。
- **isOpen.md の日本語専用ターゲットへのリンク**に "(Japanese)" ラベルを追加（segmentBy と同形）。

## 該当なし・見送り（理由つき）

- **en/reference/README:19 のリンクラベル `../impl/` と実ターゲット `../../impl/` の不一致**:
  現物を照合したがラベル・ターゲットとも `../../impl/` で一致——再現せず（該当なし）。
- **スイッチャの「English（未訳）」と kyureki の恒久非ミラー宣言の含意差**: レビュー判定どおり
  見送り（妥当な水準）。
- **ja→en 導線が Pages トップバーのみ**（GitHub の Markdown 表示に ja→en リンクなし・en→ja は
  全ページのヘッダにあり）: レビュー判定どおり意図的・現状維持（情報として認識）。

## 再発防止（doc-consistency 検査 2 本の常設・npm test 439→441）

- **en≡ja kairos フェンス同一性検査**（コメント行は翻訳可・規範行は一致必須）＝指摘 J の型。
  英語側の「実行検証済み」主張が「日本語側の実行＋同一性の機械保証」で恒常的に真になった。
- **en 固定訳語の横断検査**（consumer-relative・placeholder・Exhaustiveness verification・
  descriptor・first point・binding-name・interval-sequence・`## Related` の別訳混入を割る）＝
  指摘 K の型。
- テスト数の入口表記（README 英日・llms.txt・en/spec・1.0 DoD 前提）を実測 441 に更新。
