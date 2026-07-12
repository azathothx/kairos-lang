# `span` — 単位列の可変集約（ボトムアップ）

**分類**: 窓生成語（premise 層） ／ **シグネチャ**: `span(f) : Stream -> Stream(partitioned)`・位相は `phase:` ／ 名は確定（spec §5.4）

## 意味

細かい単位の列を、`f = n => 個数` に従って連続窓へ**束ねる**（ボトムアップ集約）。`n` は生成中の窓の
**紀元起点の序数**（0 起点。[`epochOrdinal`](epochOrdinal.md) と同じ座標）で、個数は可変
（`month` の 28〜31 日）でも定数（`year` の 12 か月）でもよい。`phase:` は束ね始めの位相
（会計暦の 4 月始まりは `phase: 3`）。

Gregorian の背骨はこの語で立っている——**依存はボトムアップが主**（`day → month → year`）:

```text
month = day   span daysInMonth        # 日数は値式（閏は「窓でなく値」）
year  = month span (_ => 12) phase: 0 # 標準ラベル label: は省略（完全形は stdlib/gregorian.md §1）
```

「2 月が 28 日か 29 日か」を `year` **窓**への依存にせず、月序数 `m` からの**値**計算
（`daysInMonth`）にするのが要——これで `month` が `year` に依存せず、派生（会計暦）で `year` を
組み替えても循環しない（spec §3.6）。

## 例

5 日ごとの窓（定数 span。紀元からの 5 日刻みなので 2026 年では 1/2 起点になる）:

```kairos
# eval: 2026-01-01..2026-01-20
premise P5 = Gregorian with { pentad = day span (_ => 5) }
premise JP5 { calendar-system: P5; tz: "Asia/Tokyo"; wkst: Mon }
@JP5
everyDay |> within(pentad) |> first
#=> 2026-01-02 2026-01-07 2026-01-12 2026-01-17
```

会計年度（4 月始まり）は `phase:` の代表例——[`with`](with.md) を参照。

## label:（ADR-34）

`span … label: (p => 式)` で各窓にラベルを貼れる。`p` は窓の**先頭点**、意味論は
`名前(d)` ≡ 付与式(d の属する窓の先頭点)（射影時・遅延評価）。年度ラベルの正準形
`year = month span (_ => 12) phase: 3 label: (p => yearNo(p))` は [`../stdlib/fiscal.md`](../stdlib/fiscal.md) §1（完全定義に昇格済み）。

## 落とし穴

- `f` が受け取る序数は**紀元起点**——特定の日付起点に位相を合わせたいなら `phase:` を使うか、
  一様幅なら [`grid`](grid.md)`+ anchor:` のほうが素直（上の pentad が 1/1 起点でないのはこのため）。
- 束ねる相手は**単位窓の列**（`day`・`month`）——連続軸そのものは受け取らない（それは `grid`）。

## 関連

[`grid`](grid.md)・[`split`](split.md)・[`with`](with.md)（`phase:` ずらしの実例）・
[`shiftBoundary`](shiftBoundary.md)（span 位相ずらしへの糖衣）・紀元（ADR-31）。
