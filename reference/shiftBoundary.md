# `shiftBoundary` — 窓の切れ目を単位でずらす糖衣（仮称）

**分類**: 派生の糖衣（premise 層） ／ **シグネチャ**: `|> shiftBoundary(δ, on: W, unit: U) : premise -> premise` ／ **仮称**（言語で唯一。1.0 で確定・spec §5.4）

## 意味

窓 `W` の切れ目を、単位 `U` で `δ` ずらした派生 premise を作る糖衣。[`with`](with.md) 上書きへの
機械的展開で消せる:

```text
shiftBoundary(δ, on: W, unit: U)  ≡  W = U span (_ => k) phase: ((φ₀ + δ) mod k)   # 負の δ も法で正規化（F65）・base の label: は保存（F96）
#   k  = W が含む U の個数（year ⊃ month なら 12）
#   φ₀ = base での W の位相（Gregorian の year は 0）
```

`W` を「`U` を `k` 個ずつ束ねる span」と見て、その位相を δ 進めるだけ——日付は動かない（I1）。

## 例

会計暦の日常形。core 展開（`with` 直書き）と同じ結果になる:

```kairos
# eval: 2025-01-01..2028-01-01
premise Fiscal2 = Gregorian |> shiftBoundary(+3, on: year, unit: month)
premise FY2 { calendar-system: Fiscal2; tz: "Asia/Tokyo"; wkst: Mon }
@FY2
everyDay |> within(year) |> first
#=> 2025-04-01 2026-04-01 2027-04-01
```

## 落とし穴

- **射程は `k` 定数の組**（`year ⊃ month`）のみ。`k` が可変な組（`month ⊃ day` を `day` 単位でずらす等）
  は会計暦型の操作ではなく射程外——必要になれば別演算子（宿題）。この射程問題と連動するため、
  名は仮称のまま 1.0 送り。
- ずらすのは**切れ目**だけ。「年度ラベルを 2025 にするか 2026 にするか」は別ノブ（`label:` 付与式。
  spec §4.9）。

## 関連

[`with`](with.md)（展開先）・[`span`](span.md)（`phase:` の意味）・spec §3.7・糖衣の展開規則（§4.8）。
