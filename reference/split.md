# `split` — 親窓の可変分割（従属窓）

**分類**: 窓生成語（premise 層） ／ **シグネチャ**: `split(g) by: u : Stream(windowed) -> Stream(partitioned)` ／ 名は確定（spec §5.4）

## 意味

親窓を、`g = y => [幅…]` が返す幅リストで**連続部分窓へ割る**（トップダウン分割）。`y` は親窓の序数、
`by: u` は幅の単位（必須）。幅の総和が親窓に一致することは I5 で検査できる。

`span`（ボトムアップ）が基本の括りを作るのに対し、`split` は**従属窓**を作る——親の変化に自動追従
させたい窓に使う。Gregorian の `quarter` が代表:

```text
quarter = year split (_ => [3, 3, 3, 3]) by: month
```

会計暦（`with` で `year` を組み替え）の下では、この継承定義が**新しい year に自動追従**して
会計四半期になる（機構 A。[`with`](with.md)）。

## 例

年を前期・後期に割る:

```kairos
# eval: 2026-01-01..2027-01-01
premise H = Gregorian with { half = year split (_ => [6, 6]) by: month }
premise JPH { calendar-system: H; tz: "Asia/Tokyo"; wkst: Mon }
@JPH
everyDay |> within(half) |> first
#=> 2026-01-01 2026-07-01
```

四半期の初日（標準の `quarter`）:

```kairos
# eval: 2026-01-01..2027-01-01
@JP
everyDay |> within(quarter) |> first
#=> 2026-01-01 2026-04-01 2026-07-01 2026-10-01
```

## label:（ADR-34）

`split … by: u label: (p => 式)` で各部分窓にラベルを貼れる（`p`＝窓の先頭点・射影時の遅延評価。
詳細は [`span`](span.md) の同節と ADR-34）。

## 落とし穴

- `by:` は省略できない（幅の単位の取り違えはサイレント誤結果。I3/I5 の線）。
- 幅リストの総和 ≠ 親窓の単位数は I5 違反（検査で検出）。
- **基本の括りには使わない**——`month = year split …` にすると派生で `month ↔ year` が循環する。
  月は `day span daysInMonth`（閏は値）で立て、`split` は従属窓（quarter・half）に限るのが Gregorian の
  設計（spec §3.6「閏は窓でなく値」）。

## 関連

[`span`](span.md)・[`grid`](grid.md)・[`with`](with.md)（自動追従の実例）・I5。
