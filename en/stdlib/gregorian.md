---
source_sha: bac4c65e8ab0
---

# Standard premise: Gregorian

> Translated from the canonical Japanese page [stdlib/gregorian.md](../../stdlib/gregorian.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

`Gregorian` is a **transparent standard premise** bundled with Kairos (a primitive-definition
root: it has no derivation source). "Transparent" means it is not language built-in magic: it is
written in the same primitive-definition syntax a user can write
(`../spec/20-premise-layer.md` §3.6), so its contents can be read and swapped out. This page
explains its complete definition and each of its words. The language specification (`../spec/`)
cites this `Gregorian` only as "an example of a primitive definition"; the exhaustive account is
this page's charge.

## 1. Complete definition

```text
premise Gregorian {
  day     = chronos grid 1d                                 # atom (carve the continuous base Chronos into civil days)
  weekday = day cycle [Mon, Tue, Wed, Thu, Fri, Sat, Sun] anchor: 2000-01-03

  epochYear    = 1970                                       # auxiliary value functions (the epoch year; the language default of ADR-31)
  monthOf      = m => m mod 12
  yearOf       = m => epochYear + m div 12
  monthLengths = leap => [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

  isLeap      = y => y mod 4 == 0 and not(y mod 100 == 0 and y mod 400 != 0)
  daysInMonth = m => monthLengths(isLeap(yearOf(m)))[monthOf(m)]
  daysInMonthOf = d => daysInMonth(epochOrdinal(month, d))       # point → its month's day count (§4.9 calendar-coordinate sugar family; ADR-46 era, the third feedback batch F101)
  month   = day   span daysInMonth label: (p => monthNo(p))        # basic grouping: bundles day (year-independent)
  year    = month span (_ => 12) phase: 0 label: (p => yearNo(p))  # bundles month twelve at a time
  quarter = year  split (_ => [3, 3, 3, 3]) by: month       # year's dependent window

  weekStart = day |> filter(d => weekday(d) == wkst)        # wkst lazily resolves the user-side preamble declaration (§4.5)
  week      = day |> segmentBy(weekStart, edges: clip, empties: error)

  monthStart = month |> first                               # public boundary words (selector reuse)
  monthEnd   = month |> last
  yearStart  = year  |> first
  # yearEnd is undefined (kept asymmetric because no demand has arisen; if needed, it is the one
  # line year |> last, and the fiscal year end is reached via Fiscal's within(year) |> last — fiscal.md)

  yearNo  = d => yearOf(epochOrdinal(month, d))             # calendar-coordinate sugar (spec §4.9): the calendar year (2026 etc.)
  monthNo = d => monthOf(epochOrdinal(month, d)) + 1        # the calendar month (1..12)
  dayNo   = d => ordinalIn(day, month, d)                   # the calendar day (1..31)
}
```

The auxiliary value functions (top-level bindings inside the complete-definition block = **public
bindings**; derivations, too, reference them by bare name — `Fiscal`'s `fiscalYearNo` using
`yearOf` is this inheritance. All of them compute from the month's serial number `m` alone and do
not reference the `year` window):

- `monthOf(m)` = `m mod 12` — the month position (0 = January … 11 = December).
- `yearOf(m)` = `epochYear + m div 12` — the calendar year the month belongs to
  (`epochYear` = 1970).
- `monthLengths(leap)` — the day-count list of the 12 months (in a leap year only February has 29).

The **epoch** at which the window ordinals `m` and `n` originate is the language default
1970-01-01T00:00 (in-scope tz), and ordinals are 0-based (`m = 0` is January 1970. ADR-31).
`epochYear = 1970` is a value drawn from this default. A calendar system with a different basis
can re-anchor the reference with the primitive-definition member `epoch:` (in which case write the
auxiliary value functions to match that epoch).

### Note: `day`'s width is a civil day (not 86400 seconds)

The `1d` in `day = chronos grid 1d` is the width convention "**one civil day** (one day of the
calendar)", not `86400s` (a fixed number of seconds). A civil day is not constant in elapsed-time
length — it runs 23 or 25 hours on DST transition days (ADR-11; leap seconds are **out of
scope** — chronos is a uniform idealized axis without leap seconds (each UTC day = 86,400
seconds), and `23:59:60` is a lexical error. ADR-33). If `day` were ticked at the fixed amount
`86400s`, that would be an "**elapsed-time**" width, drifting away from the civil day at every DST
transition (ADR-12 verified, on a UK DST day, that "one day later" turns into different datetimes
under elapsed time 24h versus civil time). `Gregorian`'s `day` is the calendar's day = the civil
day, so its width is given by the civil-time convention `1d`, not physical seconds. Elapsed-time
widths (`24h`, `86400s`, and so on) are a concept for other uses, such as `shift`'s `unit:`; they
are not used to partition the calendar.

grid's **phase** aligns by default — civil-time widths (`d`) to the start instant of each civil
day in the in-scope `tz:` (midnight on ordinary days. ADR-31 revised), elapsed-time widths
(`h`/`m`/`s`) to the epoch. That `day = chronos grid 1d`, with nothing specified, becomes
"calendar days cut at midnight" is due to this default. Only when a different phase is needed is
it overridden with `anchor:` (ADR-31).

## 2. Each word

| Word | Kind | Description |
|---|---|---|
| `day` | Window (atom) | The calendar's atom: the continuous base Chronos uniformly partitioned (`grid`) at width one day. |
| `weekday` | Parallel labels | Attaches weekday labels to each `day` cyclically (`cycle`). A label, not a window. Details in §4. |
| `isLeap` | Value expression | The leap-year test (the Gregorian rule). The argument is a calendar year (a value). |
| `daysInMonth` | Value expression | Returns the day count from a month ordinal. Views leap as a **value** (§3). |
| `daysInMonthOf` | Value expression | Sugar returning, from a **point**, its month's day count (`daysInMonth(epochOrdinal(month, d))`). Lets "the latter half of the month only" and "from N days before month-end" be written with no approximation (the third feedback batch, F101) |
| `month` | Window | The basic grouping. Bundles a variable number (28–31) of `day`s (`span`). Independent of `year`. Standard label = the calendar month number (ADR-42) — `month(5)` = the days of every May (window-instance reference). |
| `year` | Window | Bundles `month` twelve at a time (`span`). `phase: 0` = January start. Standard label = the calendar year (ADR-42) — `year(2026)` = the days of 2026. |
| `quarter` | Window | The dependent window splitting `year` into three-month pieces (`split by: month`). Auto-tracks changes to `year`. |
| `week` | Window | The 7-day window at WKST phase, parallel to (not nested in) month and year. Segments the day sequence at `weekStart` (the wkst-labeled days). `wkst` lazily resolves the user-side preamble declaration (§4.5). |
| `monthStart`/`monthEnd`/`yearStart` | Public boundary words | The first and last points of each window, derived by reusing the selectors (`first`/`last`). The generator `monthEnd` (the calendar-day month end) is in reality this. |
| `yearNo`/`monthNo`/`dayNo` | Value functions (calendar coordinates) | Projection sugar reading a point's calendar coordinates (the composition of `epochOrdinal` + `ordinalIn` + auxiliary value functions that spec §4.9 announces). Fixed days via `dayNo(d) == 11`, and so on. |

Under the standard labels, `year(d)` and `yearNo(d)` become two equivalent spellings of the same
value (likewise `month(d)`/`monthNo(d)`). **The calendar-coordinate sugar (the `yearNo` family) is
canonical** — `label:` chiefly grants the qualification for window-instance reference (the
value-argument side) (spec §4.9, ADR-42). The canonical form for narrowing to a specific period:

```kairos
# eval: 2026-04-28..2026-05-03
@JP
month(5) & year(2026)
#=> 2026-05-01 2026-05-02
```

With `daysInMonthOf` (point → month length), "the latter half of the month only" and "from N days
before month-end" can be written without `dayNo(d) > 15`-class approximations (the third feedback batch
F101 = the symmetric completion of the §4.9 sugar family):

```kairos
# eval: 2026-02-01..2026-03-05
@JP
everyDay |> filter(d => dayNo(d) > daysInMonthOf(d) - 3)
#=> 2026-02-26 2026-02-27 2026-02-28
```

## 3. The dependency direction, and "leap is a value, not a window"

Dependencies are primarily **bottom-up aggregation**: `day → month → year`. `month` is the basic
grouping, and `year` is its 12-fold aggregation. Only `quarter` is a dependent window dividing
`year` (top-down).

The pivot of this direction is "**leap is a value, not a window**". "Does February have 28 or 29
days?" looks like a dependency on the **window** `year`, but it is in fact a **value** dependency
computable from the month ordinal `m` (`m` → calendar year → `isLeap`). Hence `month` need not
depend on the `year` window, and `month` can stand as the parent (the basic grouping). If `month`
were made a child of `year`, then when a derivation (the fiscal calendar, §6) re-bundles `year`
from `month`, `month ↔ year` would become circular. Viewing leap as a value and placing `month` as
the parent keeps the cycle from ever arising — this is the ground on which the fiscal calendar can
be written in one line, with no workaround.

## 4. weekday (cycle) and WKST are different things

This is where misunderstanding is most likely. **The rhythm of weekday labels (`weekday`) and the
start of the week (WKST) are independent, separate concepts**: `Gregorian` carries only the
former, never the latter.

| Concept | What it decides | Where it lives | Universal or culture-dependent |
|---|---|---|---|
| `weekday` (cycle) | Which day is Mon/Tue/… (the weekday label) | `Gregorian` (calendar-system-pure) | **Universal** (Monday is Monday the world over) |
| WKST | Where the week **starts** (the week windows' cut points; the origin of "the Nth week") | A premise member (declared in the preamble) | **Culture- and use-dependent** |

### 4.1 The list order is not "week start"

The definition's `cycle [Mon, Tue, Wed, Thu, Fri, Sat, Sun]` is written Monday-first, but it is a
**cyclic sequence** (after Mon comes Tue … after Sun comes Mon). Being circular, its head carries
no "week start" meaning. It decides only two things:

- **The cyclic order** — the sequence of the weekdays (after Mon comes Tue). Universal.
- **The phase** — `anchor: 2000-01-03`: the universal fact that January 3, 2000 is a Mon. It fixes
  which actual day carries which label.

Writing `[Sun, Mon, …, Sat]` with the same `anchor` yields **the identical calendar** (the same
days carry the same weekday labels). It does not express a week start.

### 4.2 The start of the week is decided by WKST

"Where the week is cut" is carried by WKST (a premise member of the preamble; a dangerous member =
declaration-required leaning, with no language default). The cut points of the week window
`within(week)`, and the origin of "the Nth" against that window, depend on WKST (the two-step
dependency. ADR-24).

```text
# the same Gregorian (weekday labels unchanged), yet WKST moves the week windows' cut points
@JP wkst: Mon    …|> within(week)…   # weeks run Mon–Sun
@US wkst: Sun    …|> within(week)…   # weeks run Sun–Sat
```

The `weekday` labels (which day is Monday) are invariant regardless of WKST. Only the week
window's **first day** moves.

### 4.3 The reality of "week start" (why it is not baked into Gregorian)

Week starts split by culture and use; there is no single right answer:

- General calendar displays are predominantly **Sunday-start**, in Japan and America alike.
- ISO 8601 (the international standard; business; week numbers) is **Monday-start**.
- Unicode CLDR is **per-locale** (US and JP Sunday, much of Europe Monday, the Middle East
  Saturday).
- Programming languages' weekday **numbers** mostly follow the "Sunday = 0" lineage (C, Unix cron,
  JavaScript), while newer ISO-conforming APIs (`java.time`, parts of Python) are Monday-start.
  "The origin of the numbering" and "the week-start display" are separate questions.

These differences are "**conventions for counting weeks on top of the Gregorian calendar**", not
the calendar system itself. Hence `Gregorian` bakes in no week start; it is declared per use as
WKST. This is consistent with "WKST is not a two-way choice"
(`../../design/90-open-questions.md`; Saturday-start organizations really exist).

### 4.4 Examples where WKST does and does not bite

- **It bites**: "the Friday of the 2nd week" = the 2nd window of `within(week)` → the week cut
  points move with WKST, so the result can change.
- **It does not**: "the 2nd Monday of the month" (Coming-of-Age Day and the like) = counting
  `weekday == Mon` within the month window → decided by the weekday labels alone,
  WKST-independent.

"The Nth week" depends on WKST; "the Nth Monday" (the Nth of that weekday within the month) does
not. They are easy to confuse, so the design keeps them separate. For the same reason the sugar
`nextWeekday(d)` (advance to the next d-weekday) is also WKST-independent — its expansion is not a
week window but a forward roll (`roll(Following, on: the sequence of d-labeled days)`. spec §4.8).

### 4.5 The week window — standing on lazy resolution of wkst

`week` is a public word of `Gregorian`, yet `Gregorian` itself knows no week start (§4.3). The
definition's right-hand side references the preamble member `wkst:` and is **lazily resolved in
the user side's in-scope premise** (the same rule as sugar definitions):

```text
weekStart = day |> filter(d => weekday(d) == wkst)
week      = day |> segmentBy(weekStart, edges: clip, empties: error)
```

Using `within(week)` under a premise with no `wkst:` declared is a static error — the
"declaration-required leaning" governance (ADR-16) applies as-is. Generation uses `segmentBy`
(interval-sequence type), but because the weekday cycle lets exhaustiveness and non-overlap be
proven by the I5 check, it can be used with `within(week)` (partition-hood is established by the
check, not by the generating word).

## 5. Scope (what Gregorian does not bear)

`Gregorian` is a **mathematical model** on an idealized continuous time axis (Chronos); it bears
no historical facts:

- The date deletion/duplication of the 1582 Gregorian calendar reform, and the regional
  differences in when the reform was adopted.
- Leap seconds (positive and negative; chronos is a uniform idealized axis without leap seconds =
  ADR-33), and the historical variation of the Earth's rotation and revolution.
- The calendar's period of validity (from when to when it holds).

These are not a layer for calendar-system-pure (I8) generation rules to carry. When needed, handle
them with a separate premise (a historically attested edition) or with `asof`/`source`
annotations. The standard `Gregorian` stays a clean generation rule.

## 6. A derivation example: Fiscal (the fiscal calendar)

Rearranging only `year`'s grouping on top of `Gregorian` yields the fiscal calendar (a
`premise → premise` derivation; details in `../spec/20-premise-layer.md` §3.7).

```text
premise Fiscal = Gregorian with {
  year = month span (_ => 12) phase: 3 label: (p => yearNo(p))   # April start; starting-calendar-year label
}
```

`month` is untouched, so calendar days and month ends are fixed. `quarter`'s inherited definition
(`year split by month`) auto-tracks the new `year` and becomes the fiscal quarters (Apr-Jun/…).
Because §3 placed `month` as the parent (leap is a value), no holding pin such as
`month = Gregorian.month` and no cycle avoidance is needed — the single `year` line suffices.
`label:` is **not inherited on override** (it is part of the definition; ADR-42/F96), so if
window-instance reference for fiscal years is wanted (`year(2026)` = the days of fiscal 2026),
reattach it explicitly — the `shiftBoundary` expansion preserves the base's `label:` (F65), so
without the reattachment the equivalence of the two forms breaks.

Fiscal has been promoted to a standalone commentary as a standard premise — the exhaustive
account, through fiscal-year numbering, fiscal month numbers, the variants (the US type,
half-years), and what is out of reach, is [fiscal.md](fiscal.md). Likewise derived from
`Gregorian` there is [iso-week.md](iso-week.md) (the ISO week calendar); among calendar systems
that cut months with data there is [kyureki.md](../../stdlib/kyureki.md) (the Kyureki — Japanese —
data-heavy, not mirrored).
