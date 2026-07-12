# 記述語リファレンス

Kairos の記述語（演算子・窓生成語・リテラル）を 1 語 1 ファイルで解説する。規範は言語仕様
[`../spec/`](../spec/)（本書は解説層——`stdlib/` が Gregorian を担うのと同じ役割分担）。
用語の索引は [`../spec/50-glossary.md`](../spec/50-glossary.md)。

## 実行例の規約（doctest）

本書のコード例のうち **` ```kairos ` フェンス**のものは、リファレンス実装（[`../impl/`](../impl/)）で
**実行検証**されている（`impl/test/doctest.test.ts`）。同じ規約が [`../stdlib/`](../stdlib/) の
解説ページにも及ぶ。

- ブロック内の `# eval: FROM..TO` 行が評価範囲（`[FROM, TO)`）。任意後置 `tz: Zone`（例
  `# eval: 2026-03-06..2026-03-10 tz: America/New_York`）で実行・表示の tz を上書きできる
  （省略時 Asia/Tokyo）——多 TZ 例の期待値を premise の壁時計で書くため。`tz:` は例の premise の
  tz に一致させる（`@JP`＝Asia/Tokyo のブロックには付けない。不一致でも検査はされず、評価範囲の
  端点と表示だけが実行 tz 側になる）。
- `#=>` 行が期待値（最後の本体式の結果。空白区切り・複数行可）。どちらも Kairos の行コメントなので
  ソースとしてそのまま妥当。真夜中ちょうどの点は日付のみで印字される（day 粒度の点と同表記）。
- `@JP` を使うブロックには標準前提が自動で前置される: カレンダー実体
  `premise TSE { …; nonWorking = satSun | holidays2026 }`（2026 年の実際の休日＝振替 5/6・国民の休日
  9/22 を含む 18 日）と `premise JP { calendar-system: Gregorian; calendar: TSE; tz: "Asia/Tokyo";
  wkst: Mon }`、および束縛 `holidays2026`・`satSun`。`bizDay` は `calendar: TSE` からの**標準導出**
  （ADR-35——doctest 全体が実体経由の導出の実行検証を兼ねる）。
- ` ```text ` フェンスは説明用（実行しない）。

## 索引

| 分類 | 語 | 一行 |
|---|---|---|
| 生成子 | [`everyDay`](everyDay.md) | 在圏暦法の全 day を流す |
| 生成子 | [`everyInstant`](everyInstant.md) | 連続基底の全点（strideBy と併用） |
| 窓 | [`within`](within.md) | パーティション型窓（窓名で束ねる） |
| 窓 | [`segmentBy`](segmentBy.md) | 区間列型窓（マーカーで切る） |
| 選択子 | [`first`](first.md) / [`nth`](nth.md) / [`last`](last.md) | 窓内の第 N・先頭・末尾 |
| 点変換 | [`roll`](roll.md) | 無効点を有効点へ寄せる |
| 点変換 | [`shift`](shift.md) | 単位 n 個ぶん動かす |
| 点変換 | [`snapTo`](snapTo.md) | 属する窓の先頭点へ写す（floor） |
| 点変換 | [`rebase`](rebase.md) | 日付ラベル保存の再錨（クロス tz の同日付） |
| フィルタ | [`filter`](filter.md) | 述語で間引く（premise 述語／値式述語） |
| ストライド | [`stride`](stride.md) | 入力の点を「n ごと」（境界無視・連続） |
| ストライド | [`strideBy`](strideBy.md) | 幅で刻む「w ごと」 |
| 結合子 | [`\|` `&` `\`](combinators.md) | 和・積・差とカスケード |
| 射影 | [`ordinalIn`](ordinalIn.md) | 枠窓内で単位窓が第何番目か（1 起点） |
| 射影 | [`epochOrdinal`](epochOrdinal.md) | 紀元からの通し序数（0 起点） |
| 射影 | [`coincides`](coincides.md) | 窓所属の述語（d の窓に S の点が在るか） |
| 窓生成語 | [`grid`](grid.md) | 連続軸の一様分割（暦の原子） |
| 窓生成語 | [`span`](span.md) | 単位列の可変集約（ボトムアップ） |
| 窓生成語 | [`split`](split.md) | 親窓の可変分割（従属窓） |
| 窓生成語 | [`cycle`](cycle.md) | 並列反復ラベル（窓でなくラベル） |
| 派生 | [`with`](with.md) | 既存 premise の公開語を上書き |
| 派生 | [`shiftBoundary`](shiftBoundary.md)（仮称） | 窓の切れ目を単位でずらす糖衣 |
| リテラル | [テーブルリテラル](table-literal.md) | 時点列のストリーム定数（covering:/labels:） |
| カレンダー実体 | [`nonWorking`](nonWorking.md) | 実体の予約公開語と `bizDay` 標準導出（ADR-35） |
| カレンダー実体 | [`isOpen`](isOpen.md) | 営業時間の供給規約 `sessionOpens`/`sessionCloses` と標準導出 `bizOpen`/`bizClose`/`isOpen`（ADR-41） |
