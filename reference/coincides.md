# `coincides` — 窓所属の述語

**分類**: 射影（本体層 §4.9・値関数） ／ **シグネチャ**: `coincides(S, w, d) : Bool` ／ 名は**確定**（2026-07-09・F51 の一括確定。比較候補 `hits`/`anyIn`/`sharesWindow` は不採用）

## 意味

点 `d` の属する `w` 窓の中に、ストリーム `S` の点が**少なくとも一つ在るか**（論理値）。
[`ordinalIn`](ordinalIn.md) が「属する窓の中で**数える**」なら、`coincides` は「属する窓の中に
**在るか**」——点→属する窓→窓の中身、という射影一族の同じ骨格で、値式に**有界存在量化**が入る
（ADR-38）。引数順は `ordinalIn(u, w, d)` と同型の〈対象, 窓, 点〉——ただし**第 1 引数だけ一族で
唯一のストリーム**（束縛名・修飾名・括弧のインライン式。**窓語を S に置くのは静的エラー**——原子点列
への暗黙降格は恒真化の罠。点列を意図するなら `month |> first` を書く）。`w` は在圏で解決される窓語
（パーティション型・segmentBy 窓とも可。cycle 名は不可）。

これが **F68 の受け皿**: 時刻付き・混合スケジュールに「例外**日**」を適用する形は等値の結合子では
書けず（[`snapTo`](snapTo.md) は発火時刻を潰す）、**所属**で結合する明示手段が要る。値述語なので
`not`・`and`/`or`・他の射影と自由に組める（「祝日の日は除く、ただし金曜なら残す」＝
`not coincides(holidays, day, d) or weekday(d) == Fri`）。

## 例（F68 の正準形: 毎営業日 9 時の通知から臨時休業「日」を除く）

9 時の tick は**壁時計**（市民時幅の歩進。ADR-38 改訂——旧形 `shift(+9, unit: hour)` は経過時間
意味論で DST 切替日に壁時計とずれるため正準から降格・「9 経過時間後」が意図のときの明示形）。
除外は `coincides` が「日」の所属で判定する（発火時刻 09:00 は保存される）:

```kairos
# eval: 2026-01-05..2026-01-10
premise Cal {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  satSunC = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  nonWorking = satSunC
}
premise Biz {
  calendar-system: Gregorian
  calendar: Cal
  tz: "Asia/Tokyo"
  wkst: Mon
  nineTick = everyInstant |> strideBy(1d, from: 2026-01-01T09:00)
}
@Biz
closures = [2026-01-07] covering: ..
nineTick |> filter(t => coincides(bizDay, day, t) and not coincides(closures, day, t))
#=> 2026-01-05T09:00 2026-01-06T09:00 2026-01-08T09:00 2026-01-09T09:00
```

**day 整列が立つ導出型では前段差が簡明**（同じ結果。ADR-38 判断 8——coincides の必然はテーブル直書き・
混合・不規則時刻に絞られる）:

```kairos
# eval: 2026-01-05..2026-01-10
premise Cal {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  satSunC = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  nonWorking = satSunC
}
premise Biz {
  calendar-system: Gregorian
  calendar: Cal
  tz: "Asia/Tokyo"
  wkst: Mon
  nineTick = everyInstant |> strideBy(1d, from: 2026-01-01T09:00)
}
@Biz
closures = [2026-01-07] covering: ..
bizx = bizDay \ closures
nineTick |> filter(t => coincides(bizx, day, t))
#=> 2026-01-05T09:00 2026-01-06T09:00 2026-01-08T09:00 2026-01-09T09:00
```

なお実体が開場時刻を宣言していれば、この形自体が標準導出 [`bizOpen`](isOpen.md) 一語に縮む
（ADR-41——臨時休業は `nonWorking` の右辺へ）。

積の形も同じ一語——「S の点がある日だけ残す」＝ `filter(d => coincides(S, day, d))`。差と積が
`not` の有無で書き分けられる。純増の表現力の例（実行検証は `impl/test/coincides.test.ts`）:

```text
# 閏月の検出——中気を含まない旧暦月が閏月（monthNos 手作業更新〈F62〉の照合検査を兼ねる）
lunarMonth |> first |> filter(p => not coincides(chukiDay, lunarMonth, p))
#=> 2025-07-25（閏六月の朔日）
```

## 証人規則——確定の三分岐（ADR-38 判断 4）

基準は常に**実効被覆域**（輸送済み註釈区間の補集合。[テーブルリテラル](table-literal.md) の
`covering:`・ADR-37）であり生 covering ではない:

- **真**: `d` の窓内に**非註釈区間の** S の点（＝**証人**）が在る。∃ は単調——証人の存在は未知データに
  依存しない（註釈不要）。
- **範囲外**: 証人なし かつ 窓が S の註釈区間に交差。`filter` の中では点を**落として註釈**——註釈は
  読んだ窓の**全域**へ拡幅される（F75・ADR-37 改訂 2）。純値文脈は範囲外分類の明示エラー。
- **偽**: 窓が完全に実効被覆域内（偽の確定は覆域の完全性に依存する——真との**非対称**が規範）。

`everyDay \ holidays` の退化尾部の点は**証人にならない**——存在しないかもしれない祝日の上に
「確信付きの真」を築かない（「註釈は空でない結果にも付く」の消費側の規則）。

## 落とし穴

- **tz 名の不一致は静的エラー**（S の整列が市民時グリッドのとき。幅・位相は不問＝所属だから細分は
  許す）。`coincides` は **chronos 所属**であり「同じ日付ラベル」の所属では**ない**——クロス tz は
  [`rebase`](rebase.md) で**同 tz 化してから** coincides に流す（F69＝ADR-40 で確定）。
  S の整列「なし」（時刻付き・混合）は検査なしで合法。
- **day 整列同士の例外日は従来どおり結合子が正**（`schedule \ blackoutDays`）。coincides への
  書き換えは整列検査の合法な迂回路を育てる**悪化**。規範は「同じ**点**なら結合子〈不整列は snapTo で
  整合〉・同じ**所属**（日）なら coincides」。
- `w` に cycle 名（`weekday` 等）は立てられない——cycle は窓でなくラベル（ADR-21）。
- S に**窓語**は立てられない（暗黙降格の罠——点列を意図するなら `month |> first` で明示）。ただし
  **特定インスタンスの点列**なら窓インスタンス参照が明示の降格になる——
  `coincides(year(2020), day, d)` は合法（ADR-42。S はストリーム期待位置）。
- `d` が `w` のどの窓にも属さない場合は分類器（実効被覆域の外＝範囲外・内＝硬エラー。ADR-37 判断 6）。
- `d` が窓に属していても、その窓が**マーカー覆域の外に張られた窓**（合成マーカー
  `openTick | closeTick` 級で片成分の covering が尽きた側）なら範囲外——窓境界そのものが未知なので
  証人の有無以前に落として註釈（ADR-37 判断 4/6 の帰結。F82・ordinalIn/epochOrdinal/ラベル射影も同じ）。

## 関連

[`filter`](filter.md)（合成先）・[結合子](combinators.md)（等値所属の正道）・[`snapTo`](snapTo.md)
（点の整合）・[`ordinalIn`](ordinalIn.md)（同じ骨格の「数える」側）・ADR-36/37/38・F68/F69/F75。
