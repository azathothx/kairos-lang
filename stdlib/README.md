# 標準 premise ライブラリ

Kairos に同梱される**透明な標準 premise** の解説。透明＝言語組み込みの魔法ではなく、ユーザーが書けるのと同じ
原始的定義／派生的定義の構文（`../spec/20-premise-layer.md`）で書かれ、中身を読めて差し替えもできる。

言語仕様（`../spec/`）は構文・意味論を説明し、標準 premise を「例」として引用するにとどめる。各 premise の
網羅的な中身（定義・各語・スコープ）は本ディレクトリが担う。

実行例（` ```kairos ` フェンス＋`# eval:`／`#=>`）は reference/ と同じ doctest 規約で
リファレンス実装により全例検証される（規約の正文は [`../reference/README.md`](../reference/README.md)）。

## 収録

- [Gregorian](gregorian.md) — グレゴリオ暦（原始的定義の根）。day/weekday/month/year/quarter・公開境界語・
  暦座標糖衣（yearNo/monthNo/dayNo）、依存方向（ボトムアップ・閏は値）、weekday と WKST の分離、スコープ。
- [Fiscal](fiscal.md) — 会計暦（4 月始まり）。`year` 一行の派生・機構 A の自動追従・年度番号と会計月番号・
  変種（US 連邦型・半期）と射程外。**言語同梱**（宣言なしで使える）。
- [ISOWeek](iso-week.md) — ISO 8601 週暦。isoWeek/isoYear 窓と週番号・週内曜日・ISO 年の射影。
  `label:` 付与式なしの確定語彙だけで立つ等価変形（F40 の還元）と wkst 非依存。**言語同梱**。
- [Kyureki](kyureki.md) — 旧暦（太陰太陽暦）。朔データ（NAOJ 暦要項 2025〜2027・閏六月込み）で月を切る
  データ依存暦法・旧暦日と六曜の射影。データ入り premise のため**同梱しない**（出所統治＝ADR-26 の実例）。

## 今後の候補

- 和暦（元号ラベル）などを原始的／派生的定義で。
