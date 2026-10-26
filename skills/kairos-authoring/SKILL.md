---
name: kairos-authoring
description: 自然文の要件から Kairos（スケジュール定義言語）の定義を書く手順。要件の型と式の型の対応、書いてはいけない形と直し方、診断の読み方、検算。対象は参照実装 1.0.12。
---

# Kairos を書く——要件から定義へ（対象: 参照実装 1.0.12）

この手引きは、要件（自然文）を Kairos の定義に写すときの手順です。読み手は人でも AI でもかまいません。
言語の紹介は [llms.txt](../../llms.txt)、語ごとの正確な意味は [記述語リファレンス](../../reference/README.md)、要件から引く実例は
[レシピ集](../../recipes/README.md) にあります。ここには「どう書くか」だけを書きます。
コード例はすべて参照実装で実行検証されています（`# eval:` が評価範囲、`#=>` がその結果）。版が変われば本書も改訂されます。

## 0. 手順（5 歩）

1. 要件を「いつ」の列として言い直す。点の列（日・瞬間）か、窓（月・週）かを決める。
2. 前文（premise）を書く。暦法・時間帯・週の始まり・祝日の表。
3. 本体を書く。§2 の型から選び、`|>` で段を繋ぎ、束縛で名前を付ける。
4. 検算する。`validate` → `list` で範囲を切る → 出た点を人が見る（§5）。
5. 出口を決める。`list`・`next`・`--json`・`--tsv`・`--ics`。

## 1. 形

定義は、前文、`@名前`、束縛 0 個以上、本体式の順です。

```text
premise JP {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  wkst: Mon
  holidays = [2026-01-01, 2026-01-12, 2026-02-11] covering: 2026..2026
  satSun   = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  bizDay   = everyDay \ (satSun | holidays)
}

@JP
payday = everyDay |> filter(d => dayNo(d) == 25)
payday |> roll(Preceding, on: bizDay)
```

- **前文**には、暦法（`calendar-system`）、時間帯（`tz`）、週の始まり（`wkst`）、祝日の表を書く。表には `covering:`（この表が完全である範囲）を必ず添える。
- **束縛**は `名前 = 式`。読める名前を付け、段を分ける。名前に core 語（`roll`・`shift`・`filter`・`first`・`nth`・`cycle` など）と前文の公開語（`weekday`・`day`・`month`・`year`）を使わない。
- **本体式**は 1 行 1 式。`|>` で段を繋ぐ。結合は `|`（和）・`&`（積）・`\`（差）。段の連結は結合子より先に結ぶので、意図は括弧で示す。
- **評価範囲は定義の外**。「今年の 4 月から」「来週まで」は定義に書かず、`list --from --to` で聞く。定義は「いつでも成り立つ規則」。
- **時刻**は `at(Thh:mm)`。終日なら付けない。
- **「今」を式に埋めない**。今日の日付は呼ぶ側が `--from` に入れる。

## 2. 要件の型と式の型

以下の例は、標準の前文（`@JP`＝東京・月曜始まり・2026 年の祝日表 `holidays2026`・`bizDay`＝土日祝を除く日）で動きます。
評価範囲の先頭で `roll` が表の始まりより前を見ると「範囲外」の註釈が立つので、例の範囲は表の少し内側から始めています。

### 2-1. 毎週の曜日

```kairos
# eval: 2026-01-01..2026-02-01
@JP
everyDay |> filter(d => weekday(d) == Tue)
#=> 2026-01-06 2026-01-13 2026-01-20 2026-01-27
```

### 2-2. 固定日。休日なら前営業日（翌営業日なら `Following`）

```kairos
# eval: 2026-01-05..2026-05-01
@JP
everyDay |> filter(d => dayNo(d) == 25) |> roll(Preceding, on: bizDay)
#=> 2026-01-23 2026-02-25 2026-03-25 2026-04-24
```

`roll` は「軸（`on:`）に無ければ手前（`Preceding`）か先（`Following`）の点へ寄せる」。規約は省略できない。

### 2-3. 月末の N 営業日前（先に `roll`、次に `shift`）

```kairos
# eval: 2026-01-05..2026-03-01
@JP
monthEnd |> roll(Preceding, on: bizDay) |> shift(-3, unit: bizDay)
#=> 2026-01-27 2026-02-24
```

`shift` は軸の目盛りで数える平行移動。軸上に無い点には使えないので、月末のような「休日かもしれない点」は先に `roll` で軸に乗せる。

### 2-4. 第 N 曜日・第 N 営業日（`within(month) |> nth(N)`）

```kairos
# eval: 2026-01-01..2026-04-01
@JP
everyDay |> filter(d => weekday(d) == Wed) |> within(month) |> nth(2)
#=> 2026-01-14 2026-02-11 2026-03-11
```

```kairos
# eval: 2026-01-01..2026-04-01
@JP
bizDay |> within(month) |> nth(3)
#=> 2026-01-06 2026-02-04 2026-03-04
```

無い月（第 5 水曜が無い月、営業日が N 日未満の月）は正当な空で、エラーにならない。

### 2-5. 月 2 回（和で束ねる）

```kairos
# eval: 2026-01-01..2026-03-01
@JP
wed = everyDay |> filter(d => weekday(d) == Wed)
(wed |> within(month) |> nth(1)) | (wed |> within(month) |> nth(3))
#=> 2026-01-07 2026-01-21 2026-02-04 2026-02-18
```

```kairos
# eval: 2026-01-05..2026-03-01
@JP
d15 = everyDay |> filter(d => dayNo(d) == 15)
(d15 | monthEnd) |> roll(Preceding, on: bizDay)
#=> 2026-01-15 2026-01-30 2026-02-13 2026-02-27
```

束ねてから丸めるので、`roll` は 1 回でよい。

### 2-6. 隔週（`stride`。位相は `from:` の実日が持つ）

```kairos
# eval: 2026-01-01..2026-03-01
@JP
everyDay |> filter(d => weekday(d) == Mon) |> stride(2, from: 2026-01-05)
#=> 2026-01-05 2026-01-19 2026-02-02 2026-02-16
```

### 2-7. 毎週・月 4 回・第 5 週は休み

```kairos
# eval: 2026-03-01..2026-04-01
@JP
tue = everyDay |> filter(d => weekday(d) == Tue)
tue \ (tue |> within(month) |> nth(5))
#=> 2026-03-03 2026-03-10 2026-03-17 2026-03-24
```

第 5 回目は必ず 29 日以降なので、`tue |> filter(d => dayNo(d) <= 28)` でも同じ列になる。

### 2-8. 除く（期間・祝日は表に書き、`\` で引く）

```kairos
# eval: 2026-07-20..2026-09-10
@JP
tue = everyDay |> filter(d => weekday(d) == Tue)
closed = [2026-08-01..2026-08-31, 2026-12-29..2026-12-31] covering: 2026..2026
tue \ (closed | holidays2026)
#=> 2026-07-21 2026-07-28 2026-09-01 2026-09-08
```

休みの期間は規則ではなく事実なので、表に書く。表には `covering:` を添える。

### 2-9. 旬（1 日・11 日・21 日）。月に従う区切りは日番号で書く

```kairos
# eval: 2026-01-01..2026-03-01
@JP
everyDay |> filter(d => dayNo(d) == 1 or dayNo(d) == 11 or dayNo(d) == 21)
#=> 2026-01-01 2026-01-11 2026-01-21 2026-02-01 2026-02-11 2026-02-21
```

「10 日ごと」と言い換えて等幅の窓で書いてはいけない（月は等幅ではない）。

### 2-10. 四半期・年度

```kairos
# eval: 2026-01-01..2026-07-01
@JP
bizDay |> within(quarter) |> last
#=> 2026-03-31 2026-06-30
```

```kairos
# eval: 2026-01-05..2027-01-01
@JP
monthEnd |> filter(d => monthNo(d) == 3) |> roll(Preceding, on: bizDay)
#=> 2026-03-31
```

### 2-11. 時刻（`at`）。複数の時刻は和で

```kairos
# eval: 2026-01-01..2026-01-20
@JP
mon = everyDay |> filter(d => weekday(d) == Mon)
(mon |> at(T09:00)) | (mon |> at(T15:00))
#=> 2026-01-05T09:00 2026-01-05T15:00 2026-01-12T09:00 2026-01-12T15:00 2026-01-19T09:00 2026-01-19T15:00
```

### 2-12. 全 N 回（`take`。除外してから数えるので、休講が出ても N 回になる）

```kairos
# eval: 2026-04-01..2026-08-01
@JP
lessons   = everyDay |> filter(d => weekday(d) == Tue)
cancelled = [2026-04-14, 2026-05-05] covering: 2026-04-01..2026-07-01
(lessons \ cancelled) |> take(5, from: 2026-04-01)
#=> 2026-04-07 2026-04-21 2026-04-28 2026-05-12 2026-05-19
```

### 2-13. 周期勤務（`cycle`。ラベルを貼り、述語で読む）

```kairos
# eval: 2026-01-05..2026-01-21
@JP
roster = day cycle [On, On, On, On, Off, Off, Off, Off] anchor: 2026-01-05
everyDay |> filter(d => roster(d) == On)
#=> 2026-01-05 2026-01-06 2026-01-07 2026-01-08 2026-01-13 2026-01-14 2026-01-15 2026-01-16
```

`anchor:` は位相（その日が先頭ラベル）。班を増やすときはリストを回さず `anchor:` を実際の初日にする。

### 2-14. 数える（残り営業日など）。列を範囲で切って、出た点を数える

```kairos
# eval: 2026-10-26..2026-11-04
@JP
bizDay
#=> 2026-10-26 2026-10-27 2026-10-28 2026-10-29 2026-10-30 2026-11-02
```

Kairos に「残りを返す」語は無い。範囲 `[from, to)` は右端を含まないので、当日を含めるかは `--to` を 1 日ずらして決める。

### 2-15. 直近 N 回と、次の N 回（`takeLast`・`take`）

```kairos
# eval: 2026-01-05..2027-01-01
@JP
payday = everyDay |> filter(d => dayNo(d) == 25) |> roll(Preceding, on: bizDay)
payday |> takeLast(3, until: 2026-10-22)
#=> 2026-07-24 2026-08-25 2026-09-25
```

「直近」「過去 N 回」は `takeLast(N, until: 基準日)`。「次の N 回」「これから N 回」は `take(N, from: 基準日)` で、同じ列なら `take(3, from: 2026-10-22)` が 2026-10-23・2026-11-25・2026-12-25 になる。
基準日は要件の「時点」を実日で書き、評価範囲は基準日の前後を含める。

## 3. 書いてはいけない形と直し方

| 書きがちな形 | 何が起きるか | 直し方 |
|---|---|---|
| <code>… &#124;&gt; within(month) &#124;&gt; take(4, …)</code> | 静的エラー（`take` は通し数え） | `nth(1)`〜`nth(4)` の和、または `dayNo(d) <= 28` |
| <code>monthEnd &#124;&gt; shift(-3, unit: bizDay)</code> | エラー（点が軸上にない） | 先に `roll(Preceding, on: bizDay)` |
| <code>… &#124;&gt; roll(on: bizDay)</code> | エラー（規約が要る） | `roll(Preceding, …)` か `roll(Following, …)` |
| <code>everyDay &#124;&gt; filter(d =&gt; dayNo(d) == 31)</code> | 30 日の月に出ない | `monthEnd` |
| `chronos grid 30d` で月を作る | 月の境とずれる | `month`（標準の窓） |
| 「10 日ごと」を `stride(10, …)` | 旬の初日と一致しない | `dayNo(d) == 1 or dayNo(d) == 11 or dayNo(d) == 21` |
| `shift(+19.5, unit: hour)` | エラー（整数でない） | `at(T19:30)` |
| 束縛を `shift` や `weekday` と名付ける | core 語の再定義は静的エラー。公開語は意味が変わる | 別の名前 |
| 祝日を式に直書き（`dayNo(d) == 3 and monthNo(d) == 11`） | 年で腐る。振替休日が出ない | 表に書き `covering:` を添える |
| 「今年の 4 月から」を定義に書く | 来年も 4 月から始まる | 評価範囲で切る |
| 「直近 N 回」を `take(N, from: …)` | 次の N 回になる | `takeLast(N, until: 基準日)` |

## 4. 診断の読み方

診断は「語: 何が悪いか（直し方。根拠）」の形で、**括弧の中が直し方**です。参照実装はメッセージを出して終了コード 1 で止まり、結果を出しません。
誤った日付が黙って出ることは、言語の設計上ありません。

```text
shift: 点が軸上にない（先に roll で有効点へ寄せる）
roll は規約が必要（I3）——位置引数で Following/Preceding を書くか前文で roll: を宣言
roll: 軸がない（on:/unit: を書くか前文で axis: を宣言。§3.3 は宣言必須）
take: 窓付き入力は取らない——「窓ごとの先頭 N」は within の後の nth（第 N）か ordinalIn の述語で（take は通し数え。ADR-49）
shift: n は整数（19.5 は不可。方向は符号で表す。§5.2）
未解決の名前: wekday（premise 相対解決 §3.4）
core 語 shift の再定義は静的エラー（§4.8）
```

名前の綴りを間違えると「未解決の名前」で止まる。語を発明せず、§6 の表にある語だけを使う。

警告は結果と一緒に出ます。`window-clip` は「評価範囲の外へ動いた点は出力に含まれない」。範囲を広げて評価し直します。

## 5. 検算

書いたら必ず動かして、点を人が見ます。

```text
$ kairos validate payday.kairos
$ kairos list --from 2026-01-01 --to 2026-07-01 payday.kairos
2026-01-23
…
# 被覆サマリ
#   JP.holidays covering 2026-01-01..2026-12-31 残走路 183 日
```

- **被覆サマリ**は表の期限。「残走路」が短ければ表を延ばす。
- **`⚠ 範囲外`** の行は、表の外で計算した区間。その区間の点は信用しない。
- 日付の列を要件と照らす。休日に当たる日、月末、年の境を特に見る。
- 次の 1 回だけ要るなら `kairos next -n 1`。機械に渡すなら `--json`（点と註釈と被覆）、表計算なら `--tsv`、カレンダーなら `--ics`。
- 評価の時間帯は `--tz`。前文に `tz:` があれば評価はそちらを使う。

## 6. 語彙（短い表）

| 族 | 語 |
|---|---|
| 生成子 | `everyDay`・`everyInstant` |
| 窓（標準の前文） | `day`・`week`・`month`・`quarter`・`year`・`monthStart`・`monthEnd`・`yearStart`・`weekStart` |
| 窓の区切り | `within(窓)`・`segmentBy` |
| 選択子 | `first`・`last`・`nth(N)` |
| 点変換 | `roll(規約, on: 軸)`・`shift(±N, unit: 軸)`・`at(T時刻)`・`snapTo`・`rebase`・`rephase` |
| フィルタ | `filter(d => 述語)`・`filter(on: 列)` |
| 結合子 | <code>&#124;</code>・`&`・<code>\</code> |
| ストライド | `stride(N, from:)`・`strideBy(幅, from:)`・`take(N, from:)`・`takeLast(N, until:)` |
| 値関数 | `weekday(d)`・`dayNo(d)`・`monthNo(d)`・`yearNo(d)`・`daysInMonthOf(d)`・`ordinalIn(u, w, d)`・`epochOrdinal(u, d)`・`isOpen(t)` |
| 前文 | `premise`・`calendar-system`・`tz`・`wkst`・`calendar`・`nonWorking`・`covering:`・`labels:`・`external(kind:)`・`cycle`・`with` |

語ごとの意味と落とし穴は [記述語リファレンス](../../reference/README.md)。

## 7. 書かないこと

- 状態を持つもの（実行の記録・再試行・通知）。言語は「いつ」の列を出すところまで。
- 年で腐るデータの直書き。祝日・休業日は表に書き、`covering:` と出所を添える。
- 「今」や評価範囲。定義は無時制で、範囲は呼ぶ側が決める。
- 要件が曖昧なときの黙った補完。解釈を 1 行書き、点を見せて確かめる。
