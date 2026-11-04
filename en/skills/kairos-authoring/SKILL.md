---
name: kairos-authoring
description: How to write a Kairos (schedule definition language) definition from a requirement in plain language. Requirement patterns and their expression patterns, forms to avoid and their fixes, how to read diagnostics, verification. Target: reference implementation 1.1.0 (with the 1.0.12 forms where they differ).
source_sha: 6922f053ddf6
---

# Writing Kairos — from a requirement to a definition (target: reference implementation 1.1.0)

This guide is the procedure for turning a requirement (plain language) into a Kairos definition. The reader may be a person or an AI assistant.
The language overview is [llms.txt](../../../llms.txt); the exact meaning of each word is in the [descriptor reference](../../reference/README.md);
worked examples indexed by requirement are in the [recipes](../../recipes/README.md). This page says only how to write.
Every code example is executed against the reference implementation (`# eval:` is the evaluation range, `#=>` its result). When the version changes, this guide is revised with it.

Three words were added in 1.1 (`since`, `before`, `labelOrdinal`: §2-16 and §2-17). When evaluating with 1.0.12, use the 1.0 form given in those sections
(a 1.1 word stops with "未知の段: since", unknown stage; check the version with `kairos --version`). **If the evaluator is older than 1.1.0, or its version is unknown, write the 1.0 form** (the 1.0 form keeps working on 1.1).

## 0. Procedure (5 steps)

1. Restate the requirement as a stream of "when". Decide whether it is a stream of points (days, instants) or of windows (months, weeks).
2. Write the premise: calendar system, time zone, week start, holiday table.
3. Write the body. Pick a pattern from §2, chain stages with `|>`, name things with bindings.
4. Verify. `validate` → `list` over a range → a person looks at the points (§5).
5. Choose the output: `list`, `next`, `--json`, `--tsv`, `--ics`.

## 1. Shape

A definition is, in order: a premise, `@Name`, zero or more bindings, and the body expressions.

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

- The **premise** holds the calendar system (`calendar-system`), the time zone (`tz`), the week start (`wkst`) and the holiday table. A table always carries `covering:` (the range over which it is complete).
- A **binding** is `name = expression`. Give readable names and split stages. Do not name a binding after a core word (`roll`, `shift`, `filter`, `first`, `nth`, `cycle`, …) or a word exported by the premise (`weekday`, `day`, `month`, `year`). The words added in 1.1 (`labelOrdinal`, `since`, `before`) are reserved: they cannot be used as binding names or as label names.

- A **body expression** is one line per expression. Stages are chained with `|>`. Combinators are `|` (union), `&` (intersection), `\` (difference). Stage chaining binds tighter than combinators, so show the intent with parentheses.
- **The evaluation range stays outside the definition.** "From April this year", "until next week" are not written into the definition; ask with `list --from --to`. A definition is a rule that holds at any time.
- **Times of day** are `at(Thh:mm)`. All-day: no `at`.
- **Never embed "now"** in an expression. The caller passes today's date as `--from`.

## 2. Requirement patterns and expression patterns

The examples below run under the standard premise (`@JP` = Tokyo, weeks start on Monday, the 2026 holiday table `holidays2026`, `bizDay` = days that are not Saturday, Sunday or a holiday).
When `roll` at the head of the evaluation range looks before the start of the table, an "out of coverage" annotation appears, so the example ranges start a little inside the table.

### 2-1. A weekday every week

```kairos
# eval: 2026-01-01..2026-02-01
@JP
everyDay |> filter(d => weekday(d) == Tue)
#=> 2026-01-06 2026-01-13 2026-01-20 2026-01-27
```

### 2-2. A fixed day of the month; the preceding business day if it is not one (`Following` for the next)

```kairos
# eval: 2026-01-05..2026-05-01
@JP
everyDay |> filter(d => dayNo(d) == 25) |> roll(Preceding, on: bizDay)
#=> 2026-01-23 2026-02-25 2026-03-25 2026-04-24
```

`roll` means "if the point is not on the axis (`on:`), move it to the preceding (`Preceding`) or following (`Following`) point of the axis". The convention cannot be omitted.

### 2-3. N business days before month-end (`roll` first, then `shift`)

```kairos
# eval: 2026-01-05..2026-03-01
@JP
monthEnd |> roll(Preceding, on: bizDay) |> shift(-3, unit: bizDay)
#=> 2026-01-27 2026-02-24
```

`shift` is a translation counted on the axis's ticks. It cannot be applied to a point that is not on the axis, so a point that may be a holiday (such as month-end) is first put on the axis with `roll`.

### 2-4. The N-th weekday, the N-th business day (`within(month) |> nth(N)`)

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

A month without one (no fifth Wednesday; fewer than N business days) is legitimately empty, not an error.

### 2-5. Twice a month (bundle with a union)

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

Bundle first, then roll: one `roll` is enough.

### 2-6. Every other week (`stride`; the phase is held by the real date in `from:`)

```kairos
# eval: 2026-01-01..2026-03-01
@JP
everyDay |> filter(d => weekday(d) == Mon) |> stride(2, from: 2026-01-05)
#=> 2026-01-05 2026-01-19 2026-02-02 2026-02-16
```

### 2-7. Weekly, four times a month, the fifth week off

```kairos
# eval: 2026-03-01..2026-04-01
@JP
tue = everyDay |> filter(d => weekday(d) == Tue)
tue \ (tue |> within(month) |> nth(5))
#=> 2026-03-03 2026-03-10 2026-03-17 2026-03-24
```

The fifth occurrence always falls on the 29th or later, so `tue |> filter(d => dayNo(d) <= 28)` gives the same stream.

### 2-8. Excluding (periods and holidays go into a table and are subtracted with `\`)

```kairos
# eval: 2026-07-20..2026-09-10
@JP
tue = everyDay |> filter(d => weekday(d) == Tue)
closed = [2026-08-01..2026-08-31, 2026-12-29..2026-12-31] covering: 2026..2026
tue \ (closed | holidays2026)
#=> 2026-07-21 2026-07-28 2026-09-01 2026-09-08
```

A closed period is a fact, not a rule, so it goes into a table. The table carries `covering:`.

### 2-9. Ten-day periods of the month (the 1st, 11th and 21st). A division that follows the month is written with the day number

```kairos
# eval: 2026-01-01..2026-03-01
@JP
everyDay |> filter(d => dayNo(d) == 1 or dayNo(d) == 11 or dayNo(d) == 21)
#=> 2026-01-01 2026-01-11 2026-01-21 2026-02-01 2026-02-11 2026-02-21
```

Do not restate it as "every 10 days" and write an equal-width window: months are not equal in length.

### 2-10. Quarters and fiscal years

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

### 2-11. Times of day (`at`). Several times: a union

```kairos
# eval: 2026-01-01..2026-01-20
@JP
mon = everyDay |> filter(d => weekday(d) == Mon)
(mon |> at(T09:00)) | (mon |> at(T15:00))
#=> 2026-01-05T09:00 2026-01-05T15:00 2026-01-12T09:00 2026-01-12T15:00 2026-01-19T09:00 2026-01-19T15:00
```

### 2-12. N occurrences in total (`take`; exclusion comes before counting, so cancelled sessions are made up)

```kairos
# eval: 2026-04-01..2026-08-01
@JP
lessons   = everyDay |> filter(d => weekday(d) == Tue)
cancelled = [2026-04-14, 2026-05-05] covering: 2026-04-01..2026-07-01
(lessons \ cancelled) |> take(5, from: 2026-04-01)
#=> 2026-04-07 2026-04-21 2026-04-28 2026-05-12 2026-05-19
```

### 2-13. Shift rosters (`cycle`: attach labels, read them with a predicate)

```kairos
# eval: 2026-01-05..2026-01-21
@JP
roster = day cycle [On, On, On, On, Off, Off, Off, Off] anchor: 2026-01-05
everyDay |> filter(d => roster(d) == On)
#=> 2026-01-05 2026-01-06 2026-01-07 2026-01-08 2026-01-13 2026-01-14 2026-01-15 2026-01-16
```

`anchor:` is the phase (that day carries the first label). To add a team, do not rotate the list; set `anchor:` to the team's real first day.

### 2-14. Counting (remaining business days, …): cut the stream with a range and count the points

```kairos
# eval: 2026-10-26..2026-11-04
@JP
bizDay
#=> 2026-10-26 2026-10-27 2026-10-28 2026-10-29 2026-10-30 2026-11-02
```

Kairos has no word that "returns the remainder". The range `[from, to)` excludes its right end, so whether the last day counts is decided by moving `--to` by one day.

### 2-15. The last N occurrences, and the next N (`takeLast`, `take`)

```kairos
# eval: 2026-01-05..2027-01-01
@JP
payday = everyDay |> filter(d => dayNo(d) == 25) |> roll(Preceding, on: bizDay)
payday |> takeLast(3, until: 2026-10-22)
#=> 2026-07-24 2026-08-25 2026-09-25
```

"The most recent", "the last N" is `takeLast(N, until: reference date)`. "The next N", "the coming N" is `take(N, from: reference date)`: on the same stream, `take(3, from: 2026-10-22)` gives 2026-10-23, 2026-11-25 and 2026-12-25.
Write the reference date (the "as of" in the requirement) as a real date, and let the evaluation range include both sides of it.

### 2-16. On or after a date; before a date (`since`, `before`; 1.1)

```kairos
# eval: 2026-10-01..2026-10-20
@JP
bizDay |> since(2026-10-13)
#=> 2026-10-13 2026-10-14 2026-10-15 2026-10-16 2026-10-19
```

"From … on" is `since(date)` (that day included); "before …" is `before(date)` (that day excluded). Same half-open convention as the evaluation range `[from, to)`: `since(start) |> before(end)` cuts a period.

Write only dates that belong to the definition itself (the start of a contract, the day a rule takes effect). "From today" is `--from` (§1), not `since`. On a stream of days, a date-time literal drops that day (a day's point is 00:00), so write a date.

Difference from 2-15: `takeLast`/`take` cut by **count**; `since`/`before` cut by **instant**.

The 1.0.12 evaluator has no `since`/`before`. The same stream is written as an ordinal comparison:

```kairos
# eval: 2026-10-01..2026-10-20
@JP
bizDay |> filter(d => epochOrdinal(day, d) >= epochOrdinal(day, 2026-10-13))
#=> 2026-10-13 2026-10-14 2026-10-15 2026-10-16 2026-10-19
```

### 2-17. Comparing by label position (`labelOrdinal`; 1.1)

```kairos
# eval: 2026-01-05..2026-01-19
@JP
everyDay |> filter(d => labelOrdinal(weekday, d) >= 6)
#=> 2026-01-10 2026-01-11 2026-01-17 2026-01-18
```

`labelOrdinal(B, d)` is the position (1-based, declaration order) of the day's label within the enumeration declared by the binding `B`. For weekdays it is the order of the `weekday` enumeration, Mon=1 … Sun=7 (independent of `wkst`).

A requirement that can be enumerated ("Saturday and Sunday") is fine as `weekday(d) == Sat or weekday(d) == Sun`; `labelOrdinal` earns its place when you **compare by order** (a range of weekdays, the number of a zodiac sign or lunar month, the order of `cycle` labels).

Only declared lists are domains (the label list of a `cycle`, the `labels:` of an `external`, the `labels: cycle` of `segmentBy`). In 1.0.12, write an `or` of the enumerated values or nested conditionals.

"Which day of the cycle" (day 3 of a 4-on-4-off roster) is a phase, not a position in the domain, so `labelOrdinal` does not apply (it stops on the duplicated domain). Count days from `anchor:`:

```kairos
# eval: 2026-01-05..2026-01-21
@JP
everyDay |> filter(d => (epochOrdinal(day, d) - epochOrdinal(day, 2026-01-05)) mod 8 + 1 == 3)
#=> 2026-01-07 2026-01-15
```

## 3. Forms to avoid, and the fix

| Tempting form | What happens | Fix |
|---|---|---|
| <code>… &#124;&gt; within(month) &#124;&gt; take(4, …)</code> | static error (`take` counts through the whole stream) | the union of `nth(1)`…`nth(4)`, or `dayNo(d) <= 28` |
| <code>monthEnd &#124;&gt; shift(-3, unit: bizDay)</code> | error (the point is not on the axis) | `roll(Preceding, on: bizDay)` first |
| <code>… &#124;&gt; roll(on: bizDay)</code> | error (a convention is required) | `roll(Preceding, …)` or `roll(Following, …)` |
| <code>everyDay &#124;&gt; filter(d =&gt; dayNo(d) == 31)</code> | absent in 30-day months | `monthEnd` |
| building months from `chronos grid 30d` | drifts from month boundaries | `month` (the standard window) |
| "every 10 days" as `stride(10, …)` | does not match the 1st/11th/21st | `dayNo(d) == 1 or dayNo(d) == 11 or dayNo(d) == 21` |
| `shift(+19.5, unit: hour)` | error (not an integer) | `at(T19:30)` |
| naming a binding `shift` or `weekday` | redefining a core word is a static error; an exported word silently changes meaning | another name |
| holidays written into the expression (`dayNo(d) == 3 and monthNo(d) == 11`) | rots with the year; no substitute holidays | a table with `covering:` |
| "from April this year" written into the definition | starts in April next year too | cut with the evaluation range |
| "the last N" as `take(N, from: …)` | gives the next N | `takeLast(N, until: reference date)` |
| naming a binding or a label `since`, `before` or `labelOrdinal` | static error in 1.1 (reserved words); accepted on 1.0.12, stops once you upgrade to 1.1 (rename) | another name |
| "from … on" as `take(N, from: date)` or `stride(1, from: date)` | cuts by count; annotations swell to the end of the range | `since(date)` (an `epochOrdinal` comparison on 1.0.12) |
| `since(T14:00)` (a standalone time) | static error (a dated date-time is required) | "every day from 14:00" is an `ordinalIn(hour, day, t)` predicate |
| `since(2026-10-26T14:00)` on a stream of days | 10/26 is dropped (a day's point is 00:00) | `since(2026-10-26)` |
| "which day of the cycle" as `labelOrdinal(roster, d)` | static error (duplicated domain) | the `epochOrdinal` difference modulo the period, plus 1 (§2-17) |
| `at(2026-01-03T07:00)` (dated) | static error (a dated anchor is forward-only and silently drops points) | move the day in the day layer, then `at(T07:00)` |
| <code>… &#124;&gt; within(month) &#124;&gt; at(T19:30)</code> | static error (the window is not carried through) | `within(month)` after `at(T19:30)` |

## 4. Reading diagnostics

A diagnostic has the shape "word: what is wrong (how to fix it. where the rule lives)" — **the fix is in the parentheses**. The reference implementation prints the message and stops with exit code 1; no result is emitted.
A silently wrong date is never the failure mode, by design.

```text
shift: 点が軸上にない（先に roll で有効点へ寄せる）
roll は規約が必要（I3）——位置引数で Following/Preceding を書くか前文で roll: を宣言
roll: 軸がない（on:/unit: を書くか前文で axis: を宣言。§3.3 は宣言必須）
take: 窓付き入力は取らない——「窓ごとの先頭 N」は within の後の nth（第 N）か ordinalIn の述語で（take は通し数え。ADR-49）
shift: n は整数（19.5 は不可。方向は符号で表す。§5.2）
未解決の名前: wekday（premise 相対解決 §3.4）
core 語 shift の再定義は静的エラー（§4.8）
at: 引数は単独時刻リテラル（Thh:mm）のみ——日付つきの錨は前方専用で anchor より前の点が黙って空になる（anchor 引数形は不採＝ADR-51 判断 8）。日の調整は日の層で: shift(±k, unit: day) |> at(Thh:mm)
at: 窓付き入力は取らない——展開形は入力の窓を引き継がない（通し数えや選択子の型エラーに化ける）。窓は at の後で切る: … |> at(Thh:mm) |> within(…)（外延同値。ADR-51 追記）
since は 1.1 で追加した語（予約語・stdlib の標準糖衣）——同名の利用側 top-level 束縛は静的エラー（§4.8）。利用側の束縛は別の名に改名する（ADR-55 判断 8）
since(p) の p に単独時刻リテラルは渡せない——単独時刻リテラルは strideBy(1d, from:)（壁時計 tick）の位置でのみ使える。日付つきの日時リテラルで錨を明示する（ADR-51・ADR-55）
labelOrdinal: roster の値域に On が重複——序数が一意でない（宣言は合法のまま。位相の量〈サイクルの何日目〉は epochOrdinal の差で書く。ADR-54 判断 5）
未知の段: since
```

Glosses, in order: "shift: the point is not on the axis (roll it onto a valid point first)"; "roll needs a convention (I3) — write Following/Preceding as the positional argument, or declare roll: in the premise"; "roll: no axis (write on:/unit: here, or declare axis: in the premise; §3.3 makes the declaration mandatory)"; "take does not accept windowed input — for 'the first N per window' use nth after within, or an ordinalIn predicate (take counts through; ADR-49)"; "shift: n is an integer (19.5 is not allowed; direction is the sign. §5.2)"; "unresolved name: wekday (premise-relative resolution §3.4)"; "redefining the core word shift is a static error (§4.8)".

Then: "at: the argument is a standalone time literal (Thh:mm) only — a dated anchor is forward-only and the points before it silently vanish; adjust the day in the day layer: shift(±k, unit: day) |> at(Thh:mm)".

Then: "at: windowed input is not accepted — the expansion does not carry the input's window (it turns into a running count or a selector type error); cut the window after at: … |> at(Thh:mm) |> within(…)".

Then: "since is a word added in 1.1 (reserved; a standard stdlib sugar) — a user-side top-level binding of the same name is a static error (§4.8); rename the binding"; "since(p): p cannot be a standalone time literal — a standalone time is allowed only in the strideBy(1d, from:) position (wall-clock tick); make the anchor explicit with a dated date-time literal".

Then: "labelOrdinal: On is duplicated in the domain of roster — the ordinal is not unique (the declaration stays legal; the phase quantity 'which day of the cycle' is written with an epochOrdinal difference)"; "unknown stage: since".

A misspelt name stops with "unresolved name". Do not invent words; use only the words in the table of §6.
The last line, "未知の段: since" (unknown stage), is what a 1.0.12 evaluator says when given a 1.1 word: check the version and switch to the 1.0 forms of §2-16 and §2-17.

Warnings come with the result. `window-clip` means "a point that moved outside the evaluation range is not in the output": widen the range and evaluate again.

## 5. Verification

After writing, always run it and look at the points.

```text
$ kairos validate payday.kairos
$ kairos list --from 2026-01-01 --to 2026-07-01 payday.kairos
2026-01-23
…
# 被覆サマリ
#   JP.holidays covering 2026-01-01..2026-12-31 残走路 183 日
```

- The **coverage summary** (`被覆サマリ`) is the expiry of the tables. If the runway (`残走路`) is short, extend the table.
- A **`⚠ 範囲外`** ("out of coverage") line is an interval computed outside a table. Do not trust the points in it.
- Compare the dates with the requirement. Look especially at days that fall on holidays, at month-ends and at the turn of the year.
- Only the next occurrence: `kairos next -n 1`. For a program: `--json` (points, annotations, coverage); for a spreadsheet: `--tsv`; for a calendar: `--ics`.
- The evaluation time zone is `--tz`. If the premise has `tz:`, evaluation uses that.

## 6. Vocabulary (short table)

| Family | Words |
|---|---|
| Generators | `everyDay`, `everyInstant` |
| Windows (standard premise) | `day`, `week`, `month`, `quarter`, `year`, `monthStart`, `monthEnd`, `yearStart`, `weekStart` |
| Windowing | `within(window)`, `segmentBy` |
| Selectors | `first`, `last`, `nth(N)` |
| Point transforms | `roll(convention, on: axis)`, `shift(±N, unit: axis)`, `at(Ttime)`, `snapTo`, `rebase`, `rephase` |
| Filters | `filter(d => predicate)`, `filter(on: stream)` |
| Combinators | <code>&#124;</code>, `&`, <code>\</code> |
| Strides | `stride(N, from:)`, `strideBy(width, from:)`, `take(N, from:)`, `takeLast(N, until:)` |
| Cutting (1.1) | `since(date)`, `before(date)` |
| Value functions | `weekday(d)`, `dayNo(d)`, `monthNo(d)`, `yearNo(d)`, `daysInMonthOf(d)`, `ordinalIn(u, w, d)`, `epochOrdinal(u, d)`, `labelOrdinal(B, x)` (1.1), `isOpen(t)` |
| Premise | `premise`, `calendar-system`, `tz`, `wkst`, `calendar`, `nonWorking`, `covering:`, `labels:`, `external(kind:)`, `cycle`, `with` |

The meaning and pitfalls of each word are in the [descriptor reference](../../reference/README.md).

## 7. What not to write

- Anything stateful (execution records, retries, notifications). The language stops at producing the stream of "when".
- Data that rots with the year written inline. Holidays and closures go into a table, with `covering:` and a source.
- "Now" and the evaluation range. A definition is tenseless; the caller decides the range.
- Silent completion of an ambiguous requirement. Write the interpretation in one line and show the points to confirm.
