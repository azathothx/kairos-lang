# `nonWorking` — カレンダー実体の予約公開語と `bizDay` 標準導出

**分類**: カレンダー実体（premise 層） ／ **正体**: 公開語 `nonWorking : Stream`（引数なし・実体 tz の
day 整列） ／ `nonWorking` は**確定名**（2026-07-09・F51 の一括確定）。規範は spec §3.9・ADR-35。

## 意味

`calendar:` メンバーに立てる**カレンダー実体**は、予約公開語 `nonWorking`（非稼働集合）を持つ
premise である——専用構文は無く、普通の premise 定義に「どの束縛が非稼働か」の指名が加わるだけ。
正体判定（ADR-19 の延長）が要求するのは:

- 公開語 `nonWorking`（時間ストリーム型・引数なしの束縛・実体の tz の**市民日グリッドに整列**）
- `tz:` の宣言（**必須**——データの市民日を内側に固定する。ADR-33）

正体判定とは別の統治として、テーブルを含む premise の常で `source:` は宣言必須寄り・版は `asof:` が
担う（再現性重視なら宣言推奨。ADR-26）。

利用側は `calendar:` に実体を立てると、**言語が一律に規定する標準導出**
`bizDay = everyDay \ C.nonWorking`（`everyDay` は利用側で解決・`C.nonWorking` は実体にピン）が使える。
`calendar:` の在圏では `bizDay` は予約された導出名（手動束縛は静的エラー）。

## 例

実体を宣言し、標準導出 `bizDay` で営業日を読む（1/1 は祝日、1/3・1/4 は土日。例示のため休業日データは
簡略化してある——実在の東証は年末年始 12/31〜1/3 も休業）:

```kairos
# eval: 2026-01-01..2026-01-08
premise TSE {
  calendar-system: Gregorian
  tz:     "Asia/Tokyo"
  source: "jpx.co.jp/trading-calendar"
  asof:   2026-01-05
  satSun     = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  holidays   = [2026-01-01] covering: 2026..2026
  nonWorking = satSun | holidays
}
premise Tokyo {
  calendar-system: Gregorian
  calendar:        TSE
  tz:              "Asia/Tokyo"
  wkst:            Mon
}
@Tokyo
everyDay |> filter(on: bizDay)
#=> 2026-01-02 2026-01-05 2026-01-06 2026-01-07
```

軸位置に実体名を**直指**する（`on: TSE` ≡ `calendar: TSE` の文脈での `on: bizDay`。F53・ADR-35）——
給料日 25 日が日曜なら前営業日:

```kairos
# eval: 2026-01-01..2026-02-01
premise TSE {
  calendar-system: Gregorian
  tz:     "Asia/Tokyo"
  source: "jpx.co.jp/trading-calendar"
  satSun     = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  holidays   = [2026-01-01] covering: 2026..2026
  nonWorking = satSun | holidays
}
premise Tokyo {
  calendar-system: Gregorian
  calendar:        TSE
  tz:              "Asia/Tokyo"
  wkst:            Mon
}
@Tokyo
everyDay |> within(month) |> nth(25) |> roll(Preceding, on: TSE)
#=> 2026-01-23
```

組織ローカルの上書きは既存の `with`（`source:` も上書きする——宣言必須寄り）:

```text
premise MyCompany = TSE with {
  source:     "intra.example.com/holidays"
  nonWorking = TSE.nonWorking | companyHolidays    # base 参照は修飾ピン
}
```

## 落とし穴

- `nonWorking` に**時刻付きの点は置けない**（正体判定＝day 整列。ADR-36 の検査と標準導出が噛み合う
  根拠）。半日休・営業時間帯は同じ実体の中の**対の予約公開語 `sessionOpens`/`sessionCloses`** として持ち、標準導出
  [`bizOpen`/`bizClose`/`isOpen`](isOpen.md) で読む（ADR-41——こちらは**実体相対**。bizDay＝利用側
  相対との役割の違いは isOpen.md）。
- 実体の `tz:` と利用側の `tz:` が違うと、標準導出が整列検査（spec §4.5）で止まる（F54 の正しい挙動）。
  明示形 `everyDay \ (TSE.nonWorking |> snapTo(day))` は「chronos 上の重なりを利用側の日界で読む」
  意味で、「同じ日付ラベル」の整合ではない——そちらは [`rebase`](rebase.md)（ADR-40）。
- カスケード（振替・調休）は `nonWorking` の**右辺**で合成する（ADR-01——濾過は標準導出の最終段だけ）。
- `calendar:` の**非在圏**なら `bizDay` は自由な束縛名のまま（既存の手動束縛の書き方は生きる）。

## 関連

[結合子](combinators.md)（カスケード・整列検査）・[`filter`](filter.md)/[`roll`](roll.md)（軸位置の
直指）・[`with`](with.md)（組織上書き）・[テーブルリテラル](table-literal.md)（`source:`/`covering:`）・
spec §3.9・ADR-35/36。
