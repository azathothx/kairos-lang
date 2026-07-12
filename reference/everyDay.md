# `everyDay` — 在圏暦法の全 day を流す

**分類**: 生成子（本体層 core） ／ **シグネチャ**: `everyDay : () -> Stream` ／ 名は確定（spec §5.4）

## 意味

在圏 premise の暦法（`calendar-system:`）が定義する `day` 窓の全要素を、時間ストリームとして流す。
ほとんどの本体式の出発点になる。

生成子は**暦法純粋**（I8・ADR-20）——`everyDay` は暦法だけに依存し、カレンダー（営業日・祝日）には
依存しない。「営業日だけ」にするのは後段の [`filter`](filter.md) の仕事で、この分離により同じ式を
別のカレンダーで再利用できる。

派生暦法（会計暦など）の下でも `day` は不動なので、`everyDay` の出力は変わらない——派生が動かすのは
窓の切れ目だけ（日付不動・I1）。

## 例

```kairos
# eval: 2026-01-01..2026-01-05
@JP
everyDay
#=> 2026-01-01 2026-01-02 2026-01-03 2026-01-04
```

窓と組んで「各月の初日」:

```kairos
# eval: 2026-01-01..2026-04-01
@JP
everyDay |> within(month) |> first
#=> 2026-01-01 2026-02-01 2026-03-01
```

## 落とし穴

- `everyDay |> first` は型エラー（窓がない。I4）。選択子の前に [`within`](within.md) /
  [`segmentBy`](segmentBy.md) で窓を立てる。
- 「営業日を流す**生成子**」は ADR-20 で却下されている。営業日は `everyDay |> filter(on: bizDay)` と
  書く（糖衣 `businessDays` も変換であって生成子ではない。F45）。なお**軸位置**に実体名を直指する
  `filter(on: TSE)` は合法（標準導出への読み替え・ADR-35）——却下されたのは生成子であって直指ではない。

## 関連

[`everyInstant`](everyInstant.md)（連続基底の全点）・[`filter`](filter.md)・公開境界語
（`monthEnd = month |> last` など。spec §3.6）・I8／ADR-20。
