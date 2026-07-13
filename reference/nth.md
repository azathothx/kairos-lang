# `nth` — 各窓の第 N を選ぶ

**分類**: 選択子（本体層 core） ／ **シグネチャ**: `nth(n) : Stream(windowed) -> Stream` ／ 名は確定（spec §5.4）

## 意味

各窓の中で **第 `n` 要素**（1 起点）を選ぶ。窓相対（I4）で、窓ごとに数え直す。既定の対象は最内窓、
入れ子で曖昧なときは `of: w` で対象窓を明示する（`nth(2, of: quarter)`。§4.3・[`first`](first.md) の例）。
「第 N」は窓の**起点**にも依存する——`within(week)` の第 N は WKST（週の開始）で変わる二段依存
（選択子 → 窓 → WKST。ADR-24）。この依存は窓名の解決に局所化されている。

要素が `n` 個に満たない窓からは何も出ない（空は正当・ADR-15）。

## 例

毎月 25 日（給料日の前段。第 25 の**日**）:

```kairos
# eval: 2026-01-01..2026-02-01
@JP
everyDay |> within(month) |> nth(25)
#=> 2026-01-25
```

毎月の**第 2 営業日**——入力を営業日に間引いてから月窓で数える:

```kairos
# eval: 2026-01-01..2026-02-01
@JP
everyDay |> filter(on: bizDay) |> within(month) |> nth(2)
#=> 2026-01-05
```

（2026-01 の営業日は 1/2, 1/5, …——1/1 は祝日なので第 2 営業日は 1/5。）

## 落とし穴

- `n` は 1 起点。0 や負は不正。
- 「月の第 2 月曜」は `within(week)` ではなく **月窓内で曜日を数える**（`filter(d => weekday(d) == Mon)
  |> within(month) |> nth(2)`）——これは WKST 非依存。「第 2 週の金曜」（WKST 依存）とは別物
  （stdlib/gregorian.md §4.4）。
- 複数序数（`nth([1, 3])`）は未導入——和で列挙する（宿題 F11）。

## 関連

[`first`](first.md)・[`last`](last.md)・[`within`](within.md)・[`ordinalIn`](ordinalIn.md)・I4・ADR-24。
