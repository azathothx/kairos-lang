# 08 — バックアップスケジュール（多段世代・上位優先の抑止・開始時刻の漸減）

運用系の定番「世代管理バックアップ」の表現力検証（2026-07-16・設計者の問いから収録。
還流第 3 便〈業務定型 25 種〉と同系の「実務の定型が書けるか」の追試——インフラ運用の側から）。

**自然言語仕様**: 日次増分・週次差分（日曜）・月次フル（毎月 1 日）。より上位のバックアップと
重なる日は、その下位バックアップは実施しない（1 日が日曜なら フルのみ）。開始は午前 1 時基準だが、
バックアップウィンドウの都合で前倒しする——フルは 2 時間前（**前日 23:00**）、差分は**同月内の
週番号に応じて 30 分ずつ漸減**（第 2 日曜=00:30・第 3=00:00・第 4=前日 23:30・第 5=前日 23:00）。

**判定: 書ける**（新語彙ゼロ）。正準形の要点は三つ:

1. **三段の分解**——実施日の集合（day 整列）→ 抑止 → 時刻の付与、の順。抑止は day 整列同士の
   差 `\`（順序を誤って時刻付き列と混ぜると整列検査の静的エラーで止まる＝黙って空振りしない）。
2. **可変オフセット＝有限の場合分け＋結合子**——点ごとに可変な `shift` は無い（n は一様値）が、
   オフセットの値域が有限（週番号は高々 5）なら分岐して `|` で束ねる。週番号は
   `(dayNo(d) - 1) div 7 + 1` の点算術で出る（月またぎ週の際どさを踏まない）。
3. **前日またぎは「日を先にずらしてから時刻を貼る」**——抑止・場合分けの論理は day レベルで
   済ませ、壁時計 tick（`strideBy(1d, from: …T時刻)`）を `coincides` で当てるのは最後。
   sub-hour の時刻は minute 窓を作らずこの帯・証人パターンで書く（F80 の統治と整合）。
   なお値述語（coincides）から参照する日集合は **premise 束縛に置く**——本体層束縛はメモ化されず
   点ごとに再評価される（F80 の実測性質・doctest の運用規約と同じ）。

## 固定オフセット版（フル=前日 23:00・差分=00:30・増分=01:00）

2026 年 2 月は 1 日が日曜＝抑止が全段発火する（2/1 はフルのみ・週次も日次も抑止）:

```kairos
# eval: 2026-01-28..2026-02-11
premise Ops { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  sundays   = everyDay |> filter(d => weekday(d) == Sun)
  fullDays  = month |> first
  monthLast = month |> last
  diffDays  = sundays \ fullDays
  incrDays  = everyDay \ sundays \ fullDays
}
@Ops
full = (everyInstant |> strideBy(1d, from: 2026-01-01T23:00)) |> filter(t => coincides(monthLast, day, t))
diff = (everyInstant |> strideBy(1d, from: 2026-01-01T00:30)) |> filter(t => coincides(diffDays, day, t))
incr = (everyInstant |> strideBy(1d, from: 2026-01-01T01:00)) |> filter(t => coincides(incrDays, day, t))
full | diff | incr
#=> 2026-01-28T01:00 2026-01-29T01:00 2026-01-30T01:00 2026-01-31T01:00
#=> 2026-01-31T23:00 2026-02-02T01:00 2026-02-03T01:00 2026-02-04T01:00
#=> 2026-02-05T01:00 2026-02-06T01:00 2026-02-07T01:00 2026-02-08T00:30
#=> 2026-02-09T01:00 2026-02-10T01:00
```

読み: 2/1 の増分・差分が消え（抑止）、そのフルは前日 1/31 の 23:00 に立つ——「毎月 1 日の
2 時間前」＝**毎月最終日の 23:00** なので `month |> last` で直接取れる（前日への食み出しが窓語の
言い換えで消える）。時間粒度の経過算術 `shift(-1, unit: hour)` でも書けるが、実装の実体化起点
（1970）の端で近似警告が出るため、壁時計 tick＋coincides 形が doctest では素直（JST は DST が
無いので両者同値）。

## 漸減版（差分＝同月内の週番号 × 30 分ずつ前倒し）

「実行のたびに 30 分早くなる」は、**点から計算できる決定的規則**（同月内の週番号）に言い換えられた
時点で言語の射程内に戻る（実行実績に依存する形なら発報層の責務＝spec §7.8 の分業）。2026 年 3 月は
日曜 5 回＝全分岐を踏む:

```kairos
# eval: 2026-02-26..2026-03-31
premise Ops { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  sundays  = everyDay |> filter(d => weekday(d) == Sun)
  fullDays = month |> first
  diffDays = sundays \ fullDays
  nthSun(d) = (dayNo(d) - 1) div 7 + 1
  d1 = diffDays |> filter(d => nthSun(d) == 1)
  d2 = diffDays |> filter(d => nthSun(d) == 2)
  d3 = diffDays |> filter(d => nthSun(d) == 3)
  d4 = diffDays |> filter(d => nthSun(d) == 4) |> shift(-1, unit: day)
  d5 = diffDays |> filter(d => nthSun(d) == 5) |> shift(-1, unit: day)
}
@Ops
((everyInstant |> strideBy(1d, from: 2026-01-01T01:00)) |> filter(t => coincides(d1, day, t)))
  | ((everyInstant |> strideBy(1d, from: 2026-01-01T00:30)) |> filter(t => coincides(d2, day, t)))
  | d3
  | ((everyInstant |> strideBy(1d, from: 2026-01-01T23:30)) |> filter(t => coincides(d4, day, t)))
  | ((everyInstant |> strideBy(1d, from: 2026-01-01T23:00)) |> filter(t => coincides(d5, day, t)))
#=> 2026-03-08T00:30 2026-03-15 2026-03-21T23:30 2026-03-28T23:00
```

読み: 3/1（第 1 日曜）は月次に抑止・3/15 の「00:00 開始」は日の開始点そのもの（`d3` を裸で
union——真夜中ちょうどは日付のみで印字される表示規約）・第 4/5 週は前日へまたぐ。月境界での
漸減リセット（フルで差分の基底が戻る）は「同月内の週番号」に自然に織り込まれる。

## 綻びログ

新しい綻びは無し（F 採番なし）。記録のみ: **点ごとに可変な `shift`**（`shift(d => f(d), unit:)` 級）が
あれば漸減版の 5 分岐は畳めるが、有限の場合分けで十分読めるため糖衣候補として頻度待ち（F1 の器と
同じ基準）。値域が非有界・実行実績依存のオフセットは射程外（発報層の責務）と確認。
