# `split` — 親窓の可変分割（従属窓）

**分類**: 窓生成語（premise 層） ／ **シグネチャ**: `split(g) by: u : Stream(windowed) -> Stream(partitioned)` ／ 名は確定（spec §5.4）

## 意味

親窓を、`g = y => [幅…]` が返す幅リストで**連続部分窓へ割る**（トップダウン分割）。`y` は親窓の
**窓列通し序数**（F60 座標）、`by: u` は幅の単位（必須）。検査は per-instance で二本（ADR-48）:
**境界整合**（親窓の両端が u の窓境界に一致——暦年×週のような非整列はここで弾かれる）と
**I5 総和**（幅リストの総和＝親窓内の u 個数・不一致は明示エラー）。

親・`by:` とも、パーティション窓に加えて**規則マーカー由来の実効パーティション**（覆域註釈のない
segmentBy 製窓列——標準 `week`・`isoWeek`・`isoYear` がそれ）を受ける（ADR-48・F109）。データ由来
（covering 付き）マーカーの窓列・`empties: drop` の窓列・cycle は受理しない——覆域の編集で g の
引く序数が黙って動くため（誘導文言つきの静的エラー・正準は segmentBy 形）。

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

週の平日部と週末部（segmentBy 製の標準 `week` を親にする例・ADR-48）:

```kairos
# eval: 2026-01-05..2026-01-19
premise W5 = Gregorian with { weekPart = week split (_ => [5, 2]) by: day }
premise JPW { calendar-system: W5; tz: "Asia/Tokyo"; wkst: Mon }
@JPW
everyDay |> within(weekPart) |> first
#=> 2026-01-05 2026-01-10 2026-01-12 2026-01-17
```

## 落とし穴

- `by:` は省略できない（幅の単位の取り違えはサイレント誤結果。I3/I5 の線）。
- 幅リストの総和 ≠ 親窓の単位数は**明示エラー**（per-instance・実体化時。可変長の親〈52/53 週の
  ISO 年など〉に定数リストを当てると割れる——**実体化は紀元からなので評価範囲に関係なく割れる**。
  g を親序数で分岐させるか、繰上げが構造から出る segmentBy 正準形〈40-examples/11 §(m)〉へ）。
- **規則マーカー×edges: clip の親では実体化端の擬似窓（[紀元, 最初のマーカー)）が通し序数 0 を
  占める**——g(i) 分岐形を書くときは i=0 が擬似窓であることを織り込む（読み側 epochOrdinal も
  同じ窓列を読むため座標は一致する）。
- **交互帯の親に序数パリティの g を書かない**——営業帯（開帯/閉帯・40-examples/06）は半日休の
  投入でパリティが崩れる。帯の選別は証人パターン・`isOpen`（ADR-41）が正道。
- **基本の括りには使わない**——`month = year split …` にすると派生で `month ↔ year` が循環する。
  月は `day span daysInMonth`（閏は値）で立て、`split` は従属窓（quarter・half）に限るのが Gregorian の
  設計（spec §3.6「閏は窓でなく値」）。

## 関連

[`span`](span.md)・[`grid`](grid.md)・[`segmentBy`](segmentBy.md)（実効パーティションの供給源）・[`with`](with.md)（自動追従の実例）・I5・ADR-48。
