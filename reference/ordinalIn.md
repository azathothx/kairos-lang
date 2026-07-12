# `ordinalIn` — 枠窓内で単位窓が第何番目か

**分類**: 射影（値式・本体層 core） ／ **シグネチャ**: `ordinalIn(u, w, d) : 点 -> 数値` ／ 名は確定（RC2・spec §5.4）

## 意味

点 `d` が属する枠窓 `w` の中で、`d` が属する**単位窓 `u` が第何番目か**を返す（**1 起点**）。
`ordinalIn(day, month, d)` は「月の第何日」、`ordinalIn(day, week, d)` は「週の第何日」。

選択子（窓 → 点）の**双対**——[`nth`](nth.md) が「窓の第 N を**取り出す**」なら、`ordinalIn` は
「点が第何番目かを**読む**」。数える単位 `u` を明示する二窓引数なので、入力ストリームの粒度
（日か・瞬間か）に依存しない（ADR-30 (1)）。

## 例

固定日——毎月 11 日:

```kairos
# eval: 2026-01-01..2026-04-01
@JP
everyDay |> filter(d => ordinalIn(day, month, d) == 11)
#=> 2026-01-11 2026-02-11 2026-03-11
```

**窓ごとにリセットする「n 個ごと」**（ストライドの窓リセット版はこれに還元される。専用記法なし・
ADR-27）——各月の 1, 8, 15, 22, 29 日:

```kairos
# eval: 2026-01-01..2026-02-01
@JP
everyDay |> filter(d => (ordinalIn(day, month, d) - 1) mod 7 == 0)
#=> 2026-01-01 2026-01-08 2026-01-15 2026-01-22 2026-01-29
```

## 落とし穴

- **1 起点**（「第 N」の慣習）。0 起点の通し序数は [`epochOrdinal`](epochOrdinal.md)。
- `u` は `w` の下位窓であること（`ordinalIn(month, day, d)` は不正）。
- 点の暦座標（`yearNo`/`monthNo`/`dayNo`）は `epochOrdinal`＋`ordinalIn`＋既存値関数の**糖衣**で
  導ける——新規語ではない（ADR-30）。

## 関連

[`epochOrdinal`](epochOrdinal.md)・[`nth`](nth.md)（双対）・[`filter`](filter.md)・[`stride`](stride.md)（リセットしない版）・ADR-27/30。
