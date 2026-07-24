---
source_sha: dd944f2c4e64
---

# Standard premise: ISOWeek

> Translated from the canonical Japanese page [stdlib/iso-week.md](../../stdlib/iso-week.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

`ISOWeek` is a **transparent standard premise** bundled with Kairos. A **derived definition** on
top of `Gregorian` (`premise → premise`; `../spec/20-premise-layer.md` §3.7 — the same shape as
`Fiscal`), it adds the vocabulary of the ISO 8601 week calendar (week date): **Monday-starting
weeks** and **week numbers under which W01 is the week containing the year's first Thursday**.
"Transparent" means the same as in [`gregorian.md`](gregorian.md): no built-in
language magic — it is written in the same derived-definition syntax any user can write, so its
contents can be read and swapped out. The language specification (`../spec/`) goes no further than
prescribing the derivation syntax and the semantics of the projection family; the exhaustive
account of the ISO week calendar is this page's job. The design focus of this premise is that the
ISO week number — which the design records had classified as the first example of a `label:`
attachment expression (F40) — is written out, via an equivalent transformation, in **settled
vocabulary alone** (§4). The word names (`isoWeek` and the rest) are premise public words and
**placeholders** (the convention of batch confirmation at 1.0; the naming status of the language's
**descriptors** is spec §5.4 — premise public words sit outside that table).

## 1. Complete definition

```text
premise ISOWeek = Gregorian with {
  isoWeekStart = day |> filter(x => weekday(x) == Mon)
  isoWeek      = day |> segmentBy(isoWeekStart, edges: clip, empties: error)

  isoYearStart = isoWeekStart |> filter(x => (monthNo(x) == 12 and dayNo(x) >= 29) or (monthNo(x) == 1 and dayNo(x) <= 4))
  isoYear      = day |> segmentBy(isoYearStart, edges: clip, empties: error)

  isoWeekNo    = d => ordinalIn(isoWeek, isoYear, d)        # 1..52/53
  isoWeekday   = d => ordinalIn(day, isoWeek, d)            # Mon = 1 … Sun = 7
  isoYearNo    = d => monthNo(d) == 1 and isoWeekNo(d) >= 52 ? yearNo(d) - 1 : (monthNo(d) == 12 and isoWeekNo(d) == 1 ? yearNo(d) + 1 : yearNo(d))
}
```

The bundled source `../../impl/stdlib/isoweek.kairos` is character-for-character identical to this
section (in the Japanese original — this page translates the comments). Of the vocabulary used,
the language's **descriptors** (`filter`, `segmentBy`, the two-window `ordinalIn`, the
ternary conditional) have settled names (spec §5.4); the rest are premise public words of
`Gregorian` (the weekday label's `weekday`/`Mon`, the atom `day`, the calendar-coordinate sugar
`yearNo`/`monthNo`/`dayNo`; spec §4.9), placeholders in name but all implemented in the reference
implementation — and no `label:` attachment expression is used (settled by ADR-34 and implemented,
but made unnecessary by the equivalent transformation; §4).

Being a derivation, it inherits all of `Gregorian`'s public words (`day`, `month`, `year`,
`quarter`, `weekday`, `week`, the public boundary words, the calendar-coordinate sugar) and
**overrides not one** existing word. `isoYear` and `year`, `isoWeek` and `week`, are distinct
windows living side by side (the latter contrast is §5).

## 2. Each word

| Word | Kind | Description |
|---|---|---|
| `isoWeekStart` | day sequence (markers) | All Mondays. The filter's right-hand side is **fixed** to the weekday label `Mon` — it does not read the preamble's `wkst` (§5). |
| `isoWeek` | window | Monday-starting 7-day windows. `segmentBy`-made, but the weekday cycle lets exhaustiveness and non-overlap be established by the I5 check, so it can be used with `within(isoWeek)` (the same reasoning as `week`; `gregorian.md` §4.5). |
| `isoYearStart` | day sequence (markers) | **The Mondays falling on 12/29 through 1/4** = each ISO year's W01 Monday (§4). Exactly one per 7-day window at the year boundary. |
| `isoYear` | window | The ISO year window (from W01's Monday to the day before the next W01). 52 weeks (364 days) or 53 weeks (371 days). |
| `isoWeekNo` | value function | The ISO week number (1..52/53) = `ordinalIn(isoWeek, isoYear, d)`. Comes out of the bare two-window ordinal (§4). |
| `isoWeekday` | value function | The ISO weekday number (Mon = 1 … Sun = 7) = `ordinalIn(day, isoWeek, d)`. |
| `isoYearNo` | value function | The ISO year number (the calendar year in which that week's W01 stands). On year-straddling weeks it **disagrees** with the calendar year `yearNo(d)` (§6.1). |

The naming is aligned with `Gregorian`'s pairs (window `year` / value function `yearNo`): the
windows are `isoWeek`/`isoYear`, the value functions `isoWeekNo`/`isoWeekday`/`isoYearNo`. The two
marker words are public too, so `isoYearStart`, for instance, can be used directly in body
expressions as "the sequence of each ISO year's first day (W01's Monday)".

## 3. The rules of ISO 8601

The ISO 8601 week calendar consists of three conventions:

- Weeks **start on Monday**. Weekday numbers are Mon = 1 … Sun = 7. There is no room here for
  choice by culture or use — the convention itself fixes Monday (for the cultural variation of
  week starts in general, `gregorian.md` §4.3).
- **W01 = the week containing the year's first Thursday.** The first Thursday is one of 1/1
  through 1/7; the Monday of the week containing it is 12/29 through 1/4 and the Sunday 1/4
  through 1/10 — hence this week always contains 1/4. Conversely, the Thursday of a week
  containing 1/4 falls on 1/1 through 1/7 and is necessarily the year's first Thursday. It can
  thus be restated as "**the week containing 1/4**" (the first step of §4's equivalent
  transformation).
- An ISO year has **52 or 53 weeks**. It has 53 only in "years whose 1/1 is a Thursday" or "leap
  years whose 1/1 is a Wednesday". The nearest instance is **2026** (W53 = 2026-12-28 through
  2027-01-03).

As a consequence of the conventions, a calendar year's 1/1 through 1/3 can belong to the previous
ISO year's W52/W53, and its 12/29 through 31 to the next ISO year's W01 (§6.1).

W01 of 2026. It straddles the year boundary, starting on 2025-12-29:

```kairos
# eval: 2025-12-01..2026-02-01
premise ISO { calendar-system: ISOWeek; tz: "Asia/Tokyo"; wkst: Mon }
@ISO
everyDay |> filter(d => isoYearNo(d) == 2026 and isoWeekNo(d) == 1)
#=> 2025-12-29 2025-12-30 2025-12-31 2026-01-01 2026-01-02 2026-01-03 2026-01-04
```

2026 is a 53-week year (its 1/1 is a Thursday). W53 also straddles the year boundary:

```kairos
# eval: 2026-12-01..2027-02-01
premise ISO { calendar-system: ISOWeek; tz: "Asia/Tokyo"; wkst: Mon }
@ISO
everyDay |> filter(d => isoYearNo(d) == 2026 and isoWeekNo(d) == 53)
#=> 2026-12-28 2026-12-29 2026-12-30 2026-12-31 2027-01-01 2027-01-02 2027-01-03
```

Making the Thursday convention visible — each ISO year's W01 Thursday (W01-4) coincides with that
calendar year's **first Thursday**:

```kairos
# eval: 2024-01-01..2028-06-01
premise ISO { calendar-system: ISOWeek; tz: "Asia/Tokyo"; wkst: Mon }
@ISO
everyDay |> filter(d => isoWeekNo(d) == 1 and isoWeekday(d) == 4)
#=> 2024-01-04 2025-01-02 2026-01-01 2027-01-07 2028-01-06
```

Combined with `isoWeekday`, designations like "the Friday of W53" are written with the same kit.
The only match in the range is the single day 2026-W53-5 — in calendar-year terms, New Year's Day
of 2027:

```kairos
# eval: 2024-01-01..2028-06-01
premise ISO { calendar-system: ISOWeek; tz: "Asia/Tokyo"; wkst: Mon }
@ISO
everyDay |> filter(d => isoWeekNo(d) == 53 and isoWeekday(d) == 5)
#=> 2027-01-01
```

## 4. Why it can be written without `label:` (the reduction of F40)

The design records had classified the ISO week number thus (F40;
`../../design/40-examples/04-projections.md` §4.5): the bare `ordinalIn(year, week)` does not
produce the Thursday convention — counting "which week within the year" with the calendar year as
the frame can express neither that a year's first few days are the previous year's W52/W53 nor
that its last few days are the next year's W01. So this is a problem for a `label:` attachment
expression that **attaches** convention-laden numbers to week windows — and moreover the first
example in which the label expression references "the year window that a **different point** (the
week's Thursday) belongs to". ADR-30 (5) settled that semantics (the attachment expression is a
body-layer expression; referencing a different point's window is allowed; adjacent windows are out
of range).

But transform the characterization of W01 one step further, and the attachment expression itself
becomes unnecessary:

1. W01 = the week containing the first Thursday = **the week containing 1/4** (§3).
2. Weeks start on Monday, so W01's **Monday** is a day at most 6 days back from 1/4 — that is, it
   falls on **12/29 through 1/4**.
3. Conversely, 12/29 through 1/4 is 7 consecutive days, so it **contains exactly one Monday**, and
   the week that Monday spans necessarily contains 1/4 = W01.

In other words, "W01's Monday" can be identified by a **predicate in calendar coordinates alone**
(a Monday on or after December 29 or on or before January 4). That is `isoYearStart`, and cutting
with `segmentBy` erects the **ISO year window** `isoYear`. `isoWeek` and `isoYear` are both
Monday-cut, so the former nests exactly inside the latter — and the bare two-window ordinal that
F40 said "does not produce it" **becomes the ISO week number as-is**, just by swapping the frame
from the calendar year `year` to `isoYear`:
`isoWeekNo = d => ordinalIn(isoWeek, isoYear, d)`. The "reference to a different point's window"
vanished once the windows' cut points were laid correctly.

### 4.1 Why isoYearNo's correction conditions are sound

`isoYearNo` produces "the number of the ISO year that d belongs to" without attaching labels to
windows, as a **point-wise correction** of the calendar year `yearNo(d)`. The ternary's two
branches are sound because correction is needed only on **at most 3 days at each end** of
year-straddling weeks:

- **January with `isoWeekNo(d) >= 52`** — if d belongs to the current year's ISO year, then from
  the ISO year's start (12/29 through 1/4) to 1/31 is at most 34 days = a week number of **at most
  5**. Hence 52 or more happens only when d belongs to the previous ISO year's final week
  (W52/W53), which can occur only on 1/1 through 1/3 (1/4 always enters W01) → calendar year − 1.
- **December with `isoWeekNo(d) == 1`** — if d belongs to the current year's ISO year, then even
  12/1 is at or past the 332nd day from the start = a week number of **48 or more**. Hence 1
  happens only when d belongs to the next ISO year's W01, which can occur only on 12/29 through 31
  → calendar year + 1.

The correction conditions (52 or more; 1) do not overlap the reachable ranges under current-year
membership (at most 5; 48 or more), so they never misfire.

### 4.2 The trade-off — the value-function form and the label: form

This value-function form carries a design trade-off. **That "all 7 days of the same week have the
same `isoYearNo`" depends on the correctness of an expression, not on the structure of windows** —
the computation is per point, so a mis-written correction condition could split the value mid-week
(this premise secures it with the exhaustive cross-check of §7). With a `label:` attachment
expression, one label attaches per window, and this consistency is guaranteed **structurally**.

The binding rule of `label:` was later **settled by ADR-34** — the lambda receives the **window's
first point**, with the defining equation "`name(d)` ≡ attachment expression(first point of the
window containing d)" as its semantics. Point-±-width arithmetic in value expressions was not
introduced, so there is still no means of naming "this window's Thursday" — the value-function
form of this premise (re-laying the frame window as `isoYear`) remains the official way to write
the ISO week number. This reduction changed F40's positioning of "the ISO week number as the first
example of `label:`'s different-point window reference" (F57), and the living motivations for
`label:` moved to fiscal-year labels (`fiscal.md` §5) and lunisolar month names
([`kyureki.md`](../../stdlib/kyureki.md) (Japanese) §7).

## 5. wkst independence — the contrast with Gregorian's `week`

`isoWeekStart`'s filter is `weekday(x) == Mon` — a fixing to the weekday **label**. It is a
one-token difference from `Gregorian`'s `weekStart` (`weekday(d) == wkst`), which **lazily
resolves** the user side's preamble `wkst:` (`gregorian.md` §4.5) — and the governance is
reversed:

| Window | Week start | Ground |
|---|---|---|
| `week` (inherited from `Gregorian`) | the user side's `wkst:` declaration (culture- and use-dependent) | week starts have no single right answer (`gregorian.md` §4.3) |
| `isoWeek` (this premise) | **fixed to Monday** (does not read `wkst`) | the ISO 8601 convention itself fixes Monday |

Consequently, whatever `wkst:` the user side declares, `isoWeek`, `isoWeekNo`, `isoWeekday`, and
`isoYearNo` are invariant; only the inherited `week` (`within(week)`) moves. The combination
common in practice — "the calendar display starts on Sunday, the week numbers are ISO" — can be
had together **in one premise**:

```kairos
# eval: 2026-01-01..2026-02-01
premise US { calendar-system: ISOWeek; tz: "Asia/Tokyo"; wkst: Sun }
@US
everyDay |> filter(d => isoWeekday(d) == 1)
#=> 2026-01-05 2026-01-12 2026-01-19 2026-01-26
```

Even under `wkst: Sun`, the first day of an ISO week stays Monday (only the first day of
`within(week)` becomes Sunday). Conversely, if only the ISO vocabulary is used, the `wkst:`
declaration itself is unnecessary — the "declaration-required leaning" governance (ADR-16/24)
fires **at use** of the `week` family; merely having `ISOWeek` in scope demands no `wkst:`. It
runs as-is without the declaration:

```kairos
# eval: 2026-01-01..2026-02-01
premise ISOPlain { calendar-system: ISOWeek; tz: "Asia/Tokyo" }
@ISOPlain
everyDay |> filter(d => isoWeekday(d) == 1)
#=> 2026-01-05 2026-01-12 2026-01-19 2026-01-26
```

## 6. Pitfalls

### 6.1 The ISO year number can diverge from the calendar year

On year-straddling weeks, `isoYearNo(d) != yearNo(d)`. Selecting "the weeks of 2026" by ISO year
and selecting them by calendar year are **different things**. The diverging days are limited to
exactly §4.1's correction targets — part of January 1 through 3 and of December 29 through 31:

```kairos
# eval: 2024-01-01..2028-06-01
premise ISO { calendar-system: ISOWeek; tz: "Asia/Tokyo"; wkst: Mon }
@ISO
everyDay |> filter(d => isoYearNo(d) != yearNo(d))
#=> 2024-12-30 2024-12-31 2025-12-29 2025-12-30 2025-12-31
#=> 2027-01-01 2027-01-02 2027-01-03 2028-01-01 2028-01-02
```

Ten days in four and a half years. The first five instantiate "late December belonging to the next
ISO year's W01" (+1); the latter five, "early January belonging to the previous ISO year's
W52/W53" (−1).

### 6.2 W53 does not exist every year

The 53-week-year condition is narrow, per §3, so `isoWeekNo(d) == 53` returns **empty** in most
years. An expression written on the assumption of 53 weeks, applied to a 52-week year, is
reproached neither statically nor at run time (empty is a legitimate result) — so expressions
using W53 should either make their target years explicit, or be used after confirming the empty is
no accident.

### 6.3 The epoch-1970 edge (a prototype constraint)

The language-default epoch 1970-01-01 (ADR-31) is a **Thursday**, and the W01 Monday of ISO year
1970 is 1969-12-29. The reference implementation materializes from 1970-01-01 (nothing before 1970
can be evaluated; `../../impl/README.md`), so the ISO-1970 year window lacks its leading
1969-12-29 through 31 (a partial window under `edges: clip`). At this edge the consequences differ
per word — `isoWeekNo` (= 1) and `isoYearNo` (= 1970) come out correct, but **`isoWeekday`
returns 1..4 over 1970-01-01 through 04** (the true values are Thu through Sun = 4..7; being
ordinals inside the partial window, they are off by 3). It silently becomes a different value (the
form ADR-16 hates most), so do not use `isoWeekday` in early January 1970.

## 7. Verification

Every ` ```kairos ` example in this page is execution-verified as a doctest
(`../../impl/test/doctest.test.ts`; the conventions are `../reference/README.md`). In addition,
the regression test `../../impl/test/stdlib-premises.test.ts` holds an **exhaustive cross-check**
against an independent oracle (a JS implementation equivalent to isocalendar): agreement on the
full set of days where `isoYearNo` ≠ calendar year (every day of 2024-01-01 through 2028-06-01),
and on the day sets per week number (W01, W02, W09, W26, W52, W53; 2025-01-01 through 2027-06-01).
At prototyping time, full agreement with Python's `datetime.isocalendar()` was also confirmed over
all 1,836 days of 2024-01-01 through 2029-01-09 (the reproducible cross-check that remains in the
repository is the regression test above).

## 8. Scope (what ISOWeek does not carry)

- **The parts of ISO 8601 other than the week calendar** — ordinal dates (year day),
  calendar-date/time-of-day notation, duration notation, and the rest are not carried. What this
  premise holds is the week-date windows and coordinates alone.
- **Week numbers of other styles** — conventions like the US style "the week containing 1/1 is
  week 1" are a different thing (culture- and use-dependent, like week starts; `gregorian.md`
  §4.3). Handle them, when needed, with a separate premise or with user-side value expressions.
- **Weekday numbers of other styles** — `isoWeekday` is fixed to Mon = 1 … Sun = 7. If the
  "Sunday = 0" lineage (C, cron, JavaScript) is wanted, convert in a value expression.
- **Historical facts** — like its base `Gregorian`, it carries no calendar reforms and no
  leap-second history (`gregorian.md` §5; I8). ISO 8601 itself is a standard that admits the
  proleptic application of the Gregorian calendar, consistent with this idealization.
