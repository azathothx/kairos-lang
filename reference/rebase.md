# `rebase` — 日付ラベル保存の再錨

**分類**: 点変換（本体層 core・roll/shift/snapTo に並ぶ第 4 メンバー） ／ **シグネチャ**: `rebase(to: "tz") : Stream -> Stream` ／ 名は**確定**（2026-07-09・F51 の一括確定。比較候補 `relabel`/`sameDate` は不採用）

## 意味

入力の各点（source tz の**市民日の先頭点**）の**日付ラベル**（Y-M-D）を取り、**to tz の同じ日付の
市民日の最初の瞬間**（ADR-33 判断 4——真夜中が DST の隙間に落ちる日も定義済みの規則）へ写す。
日付順は tz に依らず同順なので**単射・順序保存**。source tz は**入力の整列から**取る——入力は
**既定整列の day グリッド**（幅 1d・日内オフセット 0・tz 名つき）を要求し、それ以外（整列なし・
anchor つき・時刻オフセットつき）は静的エラー。`source == to` は恒等。出力整列は **to tz の
day グリッド**（構成的・ADR-36 の整列表）。

これが **F69 の受け皿**: クロス tz の「**同じ日付**」の合成は chronos 等値では原理的に書けない
（[`snapTo`](snapTo.md) は **chronos 所属**——東京の日先頭は NY の**前日**に floor される系統的
1 日ずれ）。整合手段の使い分けは三本:

- **同じ瞬間**（chronos 所属）→ `snapTo`
- **同じ日付**（ラベル対応）→ `rebase`
- **時刻つきの所属**（窓の中に在るか）→ [`coincides`](coincides.md)——クロス tz は先に `rebase` で
  同 tz 化してから

## 例（正準形: TSE×NYSE の共通営業日）

```kairos
# eval: 2026-01-01..2026-01-13
premise Tok = Gregorian with {
  source: "test-tokyo"; asof: 2026-01-01
  tz: "Asia/Tokyo"
  hol = [2026-01-01, 2026-01-12] covering: 2026..2026
  ss  = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  biz = everyDay \ (ss | hol)
}
premise NYk = Gregorian with {
  source: "test-ny"; asof: 2026-01-01
  tz: "America/New_York"
  hol = [2026-01-01, 2026-01-19] covering: 2026..2026
  ss  = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  biz = everyDay \ (ss | hol)
}
premise UNY { calendar-system: Gregorian; tz: "America/New_York"; wkst: Mon }
@UNY
(Tok.biz |> rebase(to: "America/New_York")) & NYk.biz
#=> 2026-01-02T14:00 2026-01-05T14:00 2026-01-06T14:00 2026-01-07T14:00
#=> 2026-01-08T14:00 2026-01-09T14:00
#~> 範囲外 2026-01-01..2026-01-01T14:00（Tok.hol covering 2026-01-01..2026-12-31, asof 2026-01-01）
#~> 範囲外 2026-01-01..2026-01-01T14:00（NYk.hol covering 2026-01-01..2026-12-31, asof 2026-01-01）
```

`rebase` が「ラベル対応」の再整列を宣言し、`&` は既存の chronos 等値のまま——両辺とも NY の
day グリッドで整列検査（ADR-36）に通る。出力は **NY の日付列**（表示は実行 tz＝ここでは既定の
Asia/Tokyo なので、NY の日先頭が `T14:00` と写る。1/12 は東京の成人の日で共通から欠ける）。

## 落とし穴

- **`w` は day 固定**（引数に取らない）。month/year への一般化は多対一で単射性が破れる——実例が
  出たら再設計（ADR-40 判断 2）。
- **存在しない日付は明示エラー**（データ相対の層）: 日付変更線の移動で丸ごと消えた日
  （Pacific/Apia の 2011-12-30 等）への再錨は書けない（ADR-40 判断 3）。
- **時刻保存の再錨は将来拡張**——時刻つき列は入力整列検査（day グリッド要求）が静的に止める。
  時刻つきクロス tz の絞りは `rebase`＋同 tz 化後の `coincides` の合成で書ける（表現力の穴は無い）。
- **`shift`/`roll` は rebase の前段で**——rebase 後の `unit: day` 等の窓語は在圏 premise で解決される
  ため、to tz のグリッドと食い違う（ADR-40 判断 7 の規範）。
- `to:` は tz 名の**文字列リテラル**（premise 名は不可——tz だけの名指しに premise を使うと「何に
  合わせたか」の取り違え面。ADR-40 判断 5）。版・隙間規則は在圏の評価文脈に従う。
- rebase はクロス tz 整列を常態化させる——受け側の免除系（`within`・`ordinalIn`・選択子・
  cycle/値射影）には **tz 名検査**（ADR-36 改訂 2）が敷かれており、re­base **せずに**流すと
  「ラベル 1 日ずれの束ね・曜日読み」の形で静的エラーになる（エラーが rebase へ誘導する）。

## 関連

[`snapTo`](snapTo.md)（chronos 所属）・[`coincides`](coincides.md)（窓所属の述語）・
[結合子](combinators.md)（等値の合成）・[`shift`](shift.md)/[`roll`](roll.md)（前段の規範）・
ADR-33/36/40・F69。
