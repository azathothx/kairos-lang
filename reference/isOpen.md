# `isOpen` / `bizOpen` / `bizClose` — 営業時間の標準導出

**分類**: カレンダー実体の標準導出（ADR-41） ／ **シグネチャ**: `isOpen(t) : Bool`（値述語）・
`bizOpen`/`bizClose : Stream`（導出ストリーム） ／ 名はいずれも**確定**（2026-07-09・F51 の一括確定。
供給側は `opens`/`closes` から **`sessionOpens`/`sessionCloses`** に改名して確定＝ADR-41 改訂）。
規範は spec §3.9.1・ADR-41。

## 意味

在圏 `calendar:` の実体 C が**対の予約公開語 `sessionOpens`・`sessionCloses`**（開場列・閉場列＝営業時間の
供給規約。実体 tz の**市民座標＝壁時計**の事実として宣言・任意）を持つとき、言語が一律に規定する:

- `bizOpen` — C.sessionOpens のうち**開場日（C-tz の市民日）が C の営業日**である点。
- `bizClose` — 各 bizOpen セッションの閉場点。
- `isOpen(t)` — t が bizOpen セッションの半開区間 `[open, close)` の和に入っているか。

**導出は実体相対**——判定材料（どの日が休みか・時刻をどの tz で読むか）は**実体の文化**で解決され、
読み手の premise に依存しない（[`bizDay`](nonWorking.md)＝**利用側相対**の日軸とは役割が違う。
東証が開いているかは東証の文化だけで決まる事実——クロス tz の読み手からも tz 検査に掛からず読める）。
セッションの営業日性は**開場日**で読む——深夜セッション（開 22:00・閉 翌 03:00）の尾部は開場日に
従う（金曜夜のセッションは土曜 0 時台も営業中・日曜夜のセッションは丸ごと休み）。

## 例

単一セッション 9:00–15:00・半日休（1/6 は 11:30 引け）・祝日 1/1。「営業時間内の毎正時」は
`isOpen` 一語（40-examples/06 §6.3 の帯＋証人パターンの手組みがこの一語に縮む）:

```kairos
# eval: 2026-01-05..2026-01-08
premise TSE {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "example"
  satSunC = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  holidays = [2026-01-01] covering: 2026..2026
  nonWorking = satSunC | holidays
  nine  = chronos grid 1d anchor: 2026-01-01T09:00
  three = chronos grid 1d anchor: 2026-01-01T15:00
  halfDayCloses = [2026-01-06T11:30] covering: 2026..2026
  sessionOpens  = nine |> first
  sessionCloses = (three |> first |> filter(t => not coincides(halfDayCloses, day, t))) | halfDayCloses
}
premise JP2 {
  calendar-system: Gregorian
  calendar: TSE
  tz: "Asia/Tokyo"
  wkst: Mon
  hourly = everyInstant |> strideBy(1h, from: 2026-01-01)
}
@JP2
hourly |> filter(t => isOpen(t))
#=> 2026-01-05T09:00 2026-01-05T10:00 2026-01-05T11:00 2026-01-05T12:00 2026-01-05T13:00 2026-01-05T14:00
#=> 2026-01-06T09:00 2026-01-06T10:00 2026-01-06T11:00
#=> 2026-01-07T09:00 2026-01-07T10:00 2026-01-07T11:00 2026-01-07T12:00 2026-01-07T13:00 2026-01-07T14:00
```

「毎営業日の開場に発火」＝ `bizOpen` そのもの（ADR-38 改訂後の正準形——1/1 祝・1/3-1/4 土日は落ちる）:

```kairos
# eval: 2026-01-01..2026-01-08
premise TSE {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "example"
  satSunC = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  holidays = [2026-01-01] covering: 2026..2026
  nonWorking = satSunC | holidays
  nine  = chronos grid 1d anchor: 2026-01-01T09:00
  three = chronos grid 1d anchor: 2026-01-01T15:00
  sessionOpens  = nine |> first
  sessionCloses = three |> first
}
premise JP2 { calendar-system: Gregorian; calendar: TSE; tz: "Asia/Tokyo"; wkst: Mon }
@JP2
bizOpen
#=> 2026-01-02T09:00 2026-01-05T09:00 2026-01-06T09:00 2026-01-07T09:00
```

## 落とし穴

- **供給は対**（片方だけの宣言は静的エラー・`with` 派生は継承込みで判定）。sessionOpens/sessionCloses 未宣言の
  実体で導出語を使うと静的エラー。`calendar:` 在圏では 3 語とも予約名（手動束縛は静的エラー）。
- **整合性検査はデータ相対**（ADR-41 判断 2）: 結合実効被覆域∩実体化範囲で隣接マーカーの種別が
  交互（端の孤立 close/open は切り欠きとして合法）。**同時刻の open/close は両点とも存在**し、
  順序は文脈から一意（close→open＝連続営業／open→close＝幅 0）——同時発火の扱いは発報層の領分。
  **対の頭は揃える**（供給の作法＝F92）: 両方 grid（紀元から）にするか、両方 `strideBy` の
  `from:` を**同じ日**にする。片方 `strideBy(from: 2026…)`・片方 grid だと、註釈のない
  「from: 以前のマーカー不在」区間が検査の定義域に入り交互性検査が誤エラーになり得る
  （規定は実例が立ってから——現状は作法）。
- **境界は半開**: 開場の瞬間は営業中・閉場の瞬間は営業外。
- **覆域**: 判定が sessionOpens・sessionCloses・nonWorking の註釈区間に依存すると**範囲外**（filter は落として
  註釈——半日休テーブルの covering が尽きた先は黙って延長しない。F82 の器）。
- **24 時間営業はこの器の外**——終日営業は日粒度（`bizDay`・`coincides(bizDay, day, t)`）で表し、
  sessionOpens/sessionCloses を宣言しない。
- **帰属は開場日固定**——CME Globex 級の「トレード日帰属」（日曜開場＝月曜取引日）は実体側の
  供給合成で書く（帰属ノブは F90・需要待ち）。
- 値関数は第一級値ではない——`filter(isOpen)` のポイントフリーは書けず、`filter(t => isOpen(t))` と
  ラムダで書く（`coincides` と同じ）。

## 関連

[`nonWorking`](nonWorking.md)（実体・`bizDay`＝利用側相対の日軸）・[`coincides`](coincides.md)
（窓所属の述語——isOpen は同族の導出形）・[`grid`](grid.md)（時刻付き anchor＝壁時計 tick・
ADR-31 改訂 2）・[`strideBy`](strideBy.md)・[`shift`](shift.md)（経過保存——壁時計はこちらでなく
宣言側の領分）・spec §3.9.1・ADR-41／ADR-31 改訂 2・F67/F79/F85/F89。
