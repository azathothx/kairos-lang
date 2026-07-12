# `everyInstant` — 連続基底の全点を流す

**分類**: 生成子（本体層 core） ／ **シグネチャ**: `everyInstant : () -> Stream` ／ 名は確定（spec §5.4）

## 意味

基底 Chronos の**全点**（連続体）を流す。`everyDay` が暦法の原子（日）を単位とするのに対し、
`everyInstant` は暦を経由しない——暦のリズムに乗らない周期（火星の 1 sol、90 分ごとの軌道周回など）を
[`strideBy`](strideBy.md) で刻むための入口である。

連続体は列挙できないので、`everyInstant` は単独では評価できず、直後に `strideBy(w, from:)` を要する。
起点 `from:` は必須——前段に窓が無いため（§4.7 の起点規則。ADR-31）。

## 例

火星の 1 sol（24 時間 39 分 35.244 秒）ごと:

```kairos
# eval: 2026-01-01..2026-01-03
@JP
everyInstant |> strideBy(24h39m35.244s, from: 2026-01-01)
#=> 2026-01-01 2026-01-02T00:39:35
```

sol は市民時（`d`）でなく**経過時間**の複合幅で与える。市民時と経過時間は混合できない
（`1d12h` は静的エラー。ADR-28・§5.5）。

## 落とし穴

- `everyInstant |> filter(…)` や `everyInstant |> within(…)` のような列挙を要する合成は書けない。
  先に `strideBy` で離散化する。
- 発報時刻の精度・丸めは実装系の責務（言語は点の集合を定義するまで。spec §1.4）。

## 関連

[`strideBy`](strideBy.md)・[`everyDay`](everyDay.md)・幅リテラルの規約（ADR-11/12・spec §5.5）。
