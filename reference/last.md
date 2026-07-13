# `last` — 各窓の末尾を選ぶ

**分類**: 選択子（本体層 core） ／ **シグネチャ**: `last : Stream(windowed) -> Stream` ／ 名は確定（spec §5.4）

## 意味

各窓の中で**最後の要素**を選ぶ。窓相対（I4）。既定の対象は最内窓、入れ子で曖昧なときは `of: w` で
対象窓を明示する（§4.3・[`first`](first.md) の例）。「月末」「年度末」「週の最終日」の正体はすべてこれ。

生成子に見える `monthEnd` は、実は原始的定義の公開境界語 `monthEnd = month |> last` ——`last` の
再利用であって別機構ではない（spec §3.6）。

## 例

各月の最終日（暦日ベース。営業日調整は後段の [`roll`](roll.md) が担う——I8 の分離）:

```kairos
# eval: 2026-01-01..2026-04-01
@JP
everyDay |> within(month) |> last
#=> 2026-01-31 2026-02-28 2026-03-31
```

週の最終日（`wkst: Mon` なら日曜）:

```kairos
# eval: 2026-01-05..2026-01-26
@JP
everyDay |> within(week) |> last
#=> 2026-01-11 2026-01-18 2026-01-25
```

## 落とし穴

- 閏年は暦法の値式（`isLeap`）が処理する——2 月の `last` は平年 28 日・閏年 29 日を自動で返す
  （「閏は窓でなく値」。spec §3.6）。
- 「月末の 3 営業日前」は `last` だけでは書けない——`roll(Preceding, on: bizDay)` で営業日に寄せてから
  `shift(-3, unit: bizDay)`（[代表例 §7.1](../spec/90-examples.md)）。

## 関連

[`first`](first.md)・[`nth`](nth.md)・[`roll`](roll.md)・[`shift`](shift.md)・公開境界語（spec §3.6）。
