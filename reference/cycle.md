# `cycle` — 並列反復ラベル（窓でなくラベル）

**分類**: 窓生成語（premise 層） ／ **シグネチャ**: `cycle(labels) anchor: r : Stream -> Stream(labeled)` ／ 名は確定（spec §5.4）

## 意味

対象のパーティション窓に**反復ラベル**を付す。窓を作らない——曜日が日を分割しないように、ラベルは
窓と**並列**の概念（ADR-03）。周期長は任意（7・10・12・60…）、適用先も任意の窓（`day` の曜日に限らず
`month`・`year` にも張れる——十二支は `year cycle […]`）。

- **リスト**は巡回順を与えるだけで、先頭に「開始」の意味はない（週の開始は WKST の仕事。
  stdlib/gregorian.md §4.1）。
- **`anchor:`** は位相を留める実日——「anchor の属する対象窓が先頭ラベル」。
- **束縛名は値式の「点 → ラベル」関数**として読める——`weekday(d)`・`yearBranch(d)`。解決は
  点 → 属する窓 → ラベルの二段（ADR-27/30）。

## 例

年の十二支——2020 年（子）を anchor に、午年の元日を選ぶ:

```kairos
# eval: 2020-01-01..2028-01-01
premise JPEto = Gregorian with {
  tz: "Asia/Tokyo"                  # anchor（日付リテラル）の錨打ちに要る（ADR-33）
  yearBranch = year cycle [子, 丑, 寅, 卯, 辰, 巳, 午, 未, 申, 酉, 戌, 亥] anchor: 2020-01-01
}
@JPEto
everyDay |> within(year) |> first |> filter(d => yearBranch(d) == 午)
#=> 2026-01-01
```

標準の曜日（`Gregorian.weekday`）を述語で読む:

```kairos
# eval: 2026-01-01..2026-01-20
@JP
everyDay |> filter(d => weekday(d) == Mon)
#=> 2026-01-05 2026-01-12 2026-01-19
```

## 落とし穴

- `cycle` は**律動**（暦法純粋・無限）——二十四節気の名前のような**有限データへの 1 対 1 ラベル**は
  cycle ではなくテーブルの `labels:`（[テーブルリテラル](table-literal.md)。源が違うだけで読む側は
  同じ束縛名射影）。
- `[Sun, Mon, …]` と書き換えても anchor が同じなら**同一の暦**（巡回列に開始の意味はない）。
- 60 干支のような合成周期は 60 要素の cycle 一本でも、十干と十二支の二本を述語で合成してもよい
  （cycle の積 zip は未導入・宿題 F16）。

## 関連

[`filter`](filter.md)（ラベル述語）・[テーブルリテラル](table-literal.md)（データ由来のラベル）・
WKST との分離（stdlib/gregorian.md §4）・ADR-03/27/30。
