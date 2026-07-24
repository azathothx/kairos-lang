---
source_sha: 5f81801d46f6
---

# Standard premise: Fiscal

> Translated from the canonical Japanese page [stdlib/fiscal.md](../../stdlib/fiscal.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

`Fiscal` is the **transparent standard premise** bundled with Kairos (a fiscal calendar,
April-start). It is a **derived definition** on top of [Gregorian](gregorian.md)
(`premise → premise`; `../spec/20-premise-layer.md` §3.7), not a primitive-definition root.
"Transparent" means it is no built-in language magic: it is written in the same derivation syntax
any user can write ([`with`](../reference/with.md)), so its contents can be read and swapped out.
The language specification (`../spec/`) goes no further than citing the fiscal calendar as "an
example of a derived definition" (spec §3.7; `../spec/90-examples.md` §7.3); the exhaustive
account is this page's job. The standard's choice of the April start is the convention of the
Japanese fiscal year (the national fiscal year runs April 1 through March 31 of the following
year; Public Finance Act, Article 11); for any other starting month, each user writes a one-line
derivation of the same shape (§6). The names of the public words (`fiscalYearNo` and the rest) are
premise public words, so their governance is light: they follow the convention of staying
provisional and being batch-confirmed at 1.0 (the naming status of the language's **description
words** is spec §5.4 — premise public words sit outside that table).

## 1. Complete definition

```text
premise Fiscal = Gregorian with {
  year = month span (_ => 12) phase: 3 label: (p => yearNo(p))   # re-bundle calendar months 12 at a time, April-start
                                                            # (label = starting calendar year = fiscal-year
                                                            #  number. an override does not inherit the label —
                                                            #  attaching it alongside is the governance. ADR-42/F96)

  fiscalYearNo  = d => yearOf(epochOrdinal(month, d) - 3)   # fiscal-year number (starting-calendar-year convention: "fiscal 2026" = 2026)
  fiscalMonthNo = d => ordinalIn(month, year, d)            # fiscal month number (April = 1 … March = 12)
}
```

The override is the **single line** for `year`. `span`'s window ordinals count from the **epoch**
— the language default 1970-01-01T00:00 (in-scope tz), 0-based (ADR-31) — so `phase: 3` means
"place the start of bundling at month ordinal 3 (= April 1970)". Every cut point from there on
falls on April 1 of each year. The remaining two words are **value functions** for reading (added
words). On the right-hand sides, `yearOf` refers by bare name to a public binding of Gregorian (an
auxiliary value function included in the complete definition of gregorian.md §1), while
[`epochOrdinal`](../reference/epochOrdinal.md) and [`ordinalIn`](../reference/ordinalIn.md) are
description words of the language's projection family (ADR-27).

This definition is the bundled source
[`impl/stdlib/fiscal.kairos`](../../impl/stdlib/fiscal.kairos) itself (this page translates the
comments); writing `calendar-system: Fiscal` in a preamble makes it usable with no definition of
your own. If only the `year` override is wanted, the sugar
[`shiftBoundary`](../reference/shiftBoundary.md) (a **provisional name** — the only one left in
the language) writes it too:

```text
premise Fiscal = Gregorian |> shiftBoundary(+3, on: year, unit: month)   # the same expansion as the single year line (provisional name)

# expansion rule: shiftBoundary(δ, on: W, unit: U)  ≡  W = U span (_ => k) phase: ((φ₀ + δ) mod k)
#   (negative δ is also normalized by the modulus = F65. the base's label: is preserved = F96 —
#    the ground on which the equivalence with §1's attach-alongside label: stands)
#   here k = 12 (the number of month in year ⊃ month), φ₀ = 0 (the phase of Gregorian's year), δ = +3
```

## 2. Each word (what changes and what stays fixed)

| Word | Kind | Description |
|---|---|---|
| `year` | window (**override**) | Re-bundles calendar months 12 at a time, April-start (`phase: 3`). Cut points are 4/1 every year. Standard label = the starting calendar year (`year(2026)` = the days of fiscal 2026; ADR-42). |
| `fiscalYearNo` | value function (added) | The point's **fiscal-year number**. The starting-calendar-year convention ("fiscal 2026" = 2026; §5). |
| `fiscalMonthNo` | value function (added) | The **fiscal month number** 1..12 (April = 1 … March = 12). A reuse of `ordinalIn`. |
| `quarter` | window (inherited, **auto-tracking**) | The inherited definition `year split (_ => [3, 3, 3, 3]) by: month` tracks the new `year` and becomes the fiscal quarters (Apr–Jun/Jul–Sep/Oct–Dec/Jan–Mar) (§3). |
| `yearStart` | public boundary word (inherited, **auto-tracking**) | The inherited definition `year \|> first` tracks the new `year` → the April 1 days. |
| `day` / `month` / `week` / `weekday` | windows and labels (inherited, fixed) | Calendar days, calendar months, weeks, and weekdays stay Gregorian's (§4). |
| `monthStart` / `monthEnd` | public boundary words (inherited, fixed) | Calendar-month starts and ends. Unaffected by the fiscal-year cut (§4). |
| `yearNo` / `monthNo` / `dayNo` | value functions (inherited, fixed) | Sugar for **calendar** coordinates (gregorian.md §2). They do not track, because their definitions reference the `month` ordinal, not the `year` window — `yearNo` is the calendar year, not the fiscal year (the fiscal year is `fiscalYearNo`). |

The first day of each fiscal year comes out as the April 1 days:

```kairos
# eval: 2025-01-01..2028-01-01
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> within(year) |> first
#=> 2025-04-01 2026-04-01 2027-04-01
```

The last day is the March 31 days (the day before 4/1):

```kairos
# eval: 2025-01-01..2028-01-01
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> within(year) |> last
#=> 2025-03-31 2026-03-31 2027-03-31
```

`fiscalMonthNo` can pick out "the 12th fiscal month" = March of the following calendar year (the
first day of FY2026's 12th fiscal month is 2027-03-01):

```kairos
# eval: 2026-04-01..2027-04-01
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> filter(d => fiscalMonthNo(d) == 12) |> within(month) |> first
#=> 2027-03-01
```

Pitfall (implementation): `ordinalIn(month, year, d)` requires the point to belong to a frame
window (`year`). **In the language semantics**, windows partition the whole axis (I5), with
complete windows laid before and after the epoch — 1970-02-01 belongs to the complete FY1969
window (1969-04-01 through 1970-03-31). **The reference implementation** cannot evaluate before
1970 (bounded materialization), so it lays **stub windows** at the head of a `span` and the tail
of a `split`, **approximating** I5 within the materialization range (before they were laid,
`fiscalMonthNo` could not be written at all — a "point outside the frame window" error). Because
of this approximation, `fiscalMonthNo` just after the epoch (1970-01 through 03) diverges from the
semantics — it returns the ordinal within the stub window (2 for 1970-02), whereas by the
semantics it is the 11th fiscal month of FY1969 (a known implementation constraint. F59). Note
that over the same interval `fiscalYearNo` correctly returns 1969 — but only because `yearOf`'s
`div` is implemented as flooring negative dividends (with trunc it would turn into 1970 — which is
exactly why `div` was prescribed as floor division. ADR-31 revised, F63).

## 3. Why it can be written in one line (mechanism A and "leap is a value, not a window")

Name resolution in a derivation is **mechanism A** (ADR-17; spec §3.7):

- **Bare names re-resolve in the derived scope** — the overridden `year` shadows, and the
  inherited words depending on `year` (`quarter`, `yearStart`) **auto-track** the new definition
  with no re-enumeration.
- **`Base.word` pins to the base's value** — the explicit means for deliberately fixing to the
  original. The fiscal calendar **needs none**.

No pin is needed because Gregorian is designed not to make `month` depend on `year` — "does
February have 28 or 29 days?" is not a dependency on the `year` **window** but a **value**
computation from the month ordinal ("leap is a value, not a window"; gregorian.md §3). If `month`
were a child of `year`, then in a fiscal calendar that re-bundles `year` from `month`,
`month ↔ year` would become circular. Because leap was viewed as a value and `month` placed as the
parent, neither a keep-in-place pin like `month = Gregorian.month` nor any cycle avoidance is
needed — the single `year` line suffices. Leap attribution also comes out right — FY2027
(2027-04-01 through 2028-03-31) contains 2028-02-29, but that is just `month` computing 29 days as
a value, independently of `year`'s phase.

Watch `quarter`'s auto-tracking over calendar year 2026. Since `phase: 3` is a multiple of 3,
however, **the set of cut points is identical to Gregorian's quarters** (1/1, 4/1, 7/1, 10/1) — at
the level of cut points the tracking **cannot** be observed. What changes is **membership**: the
window starting at 1/1 is not the calendar Q1 but **Q4 of FY2025** (Jan–Mar):

```kairos
# eval: 2026-01-01..2027-01-01
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> within(quarter) |> first
#=> 2026-01-01 2026-04-01 2026-07-01 2026-10-01
```

The change of membership is observable through ordinals — the quarter head of the days belonging
to "the 4th fiscal quarter (January–March)" is 1/1:

```kairos
# eval: 2026-01-01..2027-01-01
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> filter(d => ordinalIn(quarter, year, d) == 4) |> within(quarter) |> first
#=> 2026-01-01
```

## 4. Dates do not move (I1)

A derivation moves only the windows' **cut points**; calendar days are fixed (base-fixedness I1;
ADR-19). 2026-03-01 remains "March 1" under the fiscal calendar too; only the **year window** it
belongs to changes, to fiscal 2025 (Apr2025–Mar2026). Since `month` is untouched, month ends
(`monthEnd`) also coincide exactly with Gregorian — across the fiscal-year cut (3/31→4/1) and at
February's end (2/28 in 2026, a non-leap year) alike:

```kairos
# eval: 2026-01-01..2026-07-01
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
monthEnd
#=> 2026-01-31 2026-02-28 2026-03-31 2026-04-30 2026-05-31 2026-06-30
```

The interpretation that translates the axis itself by 3 months (the kind where April turns into
"January") is already rejected (interpretation Q of ADR-19; the adopted one is interpretation P =
dates fixed) — April stays April, merely becoming "the 1st fiscal month" as an **ordinal**
(`fiscalMonthNo` = 1).

## 5. Fiscal-year labels (starting year or ending year)

The **numbering** of fiscal years is a convention independent of window cutting (spec §3.7's
"orthogonal, separate knob"):

- **Starting calendar year** (the Japanese fiscal year): "fiscal 2026" = 2026-04-01 through
  2027-03-31.
- **Ending calendar year** (the US federal FY): "FY2026" = 2025-10-01 through 2026-09-30 (§6).

The official bearer of window naming is the **`label:` attachment expression** at
window-generation time. Its binding rule was settled by ADR-34 — the lambda receives the
**window's first point**, and the semantics is the defining equation "`name(d)` ≡ attachment
expression(first point of the window containing d)" (evaluation at projection time, deferred):

```text
# starting-calendar-year label: attach the calendar year of the first point (4/1).
# On the reading side, year(d) returns the fiscal-year number
year = month span (_ => 12) phase: 3 label: (p => yearNo(p))
```

The reading side can be written, today as ever, as a **value function** — that is the
`fiscalYearNo` that `Fiscal` bundles. `epochOrdinal(month, d)` is the running ordinal of the
calendar month that point `d` belongs to (0-based; ADR-31). Subtract the phase's 3 from it to get
"the month ordinal re-phased to an April start", then cut every 12 months with `yearOf`
(= 1970 + m div 12; gregorian.md §1) and the starting calendar year comes out. The first day of
FY2026:

```kairos
# eval: 2025-01-01..2028-01-01
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> filter(d => fiscalYearNo(d) == 2026) |> within(year) |> first
#=> 2026-04-01
```

The last day is March 31 of the following calendar year — 2027-03-31 also has `fiscalYearNo` =
2026 (January through March belong to the previous fiscal year; for 2026-01-15 it is 2025), and
here it disagrees with the inherited word `yearNo` (= 2027), which returns the calendar year:

```kairos
# eval: 2025-01-01..2028-01-01
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> filter(d => fiscalYearNo(d) == 2026) |> within(year) |> last
#=> 2027-03-31
```

**Window-instance reference is premise-relative** (ADR-42; a pitfall) — under `Fiscal`,
`year(2026)` is the days of the 2026 **fiscal year** (2026-04-01 through 2027-03-31), not the
calendar year. Writing `newYearHoliday \ year(2026)` under the fiscal calendar removes the New
Year holiday of January 2027 (if January 2026 was intended, that is a different fiscal year). If
the calendar year is wanted, use the **qualification pin** `Gregorian.year(2026)` (mechanism A —
it acts identically on both faces, projection and instance reference):

```kairos
# eval: 2026-03-30..2026-04-03
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
year(2025) & Gregorian.year(2026)
#=> 2026-03-30 2026-03-31
```

(Fiscal 2025 ∩ calendar year 2026 = January through March 2026. Within the evaluation window only
the fiscal year's final two days appear — the disagreement between fiscal year and calendar year
is directly observable.)

## 6. Variants

**The US federal type (October start, ending-year label)** is a derivation you write yourself with
`phase: 9` and a `+3` correction (31 U.S.C. §1102; US FY2026 = 2025-10-01 through 2026-09-30). In
general the label correction is `- phase` for the starting-year convention and
`+ ((12 - phase) mod 12)` for the ending-year convention (`- 3` for the Japanese type, `+ 3` for
the US type; at `phase: 0` the two conventions coincide, so the correction is 0):

```kairos
# eval: 2025-01-01..2028-01-01
premise USFiscal = Gregorian with {
  year = month span (_ => 12) phase: 9
  usFiscalYearNo = d => yearOf(epochOrdinal(month, d) + 3)
}
premise USFY { calendar-system: USFiscal; tz: "Asia/Tokyo"; wkst: Mon }
@USFY
everyDay |> within(year) |> first
#=> 2025-10-01 2026-10-01 2027-10-01
```

Verifying the ending-year label — the last day of US FY2026 is 2026-09-30:

```kairos
# eval: 2025-01-01..2028-01-01
premise USFiscal = Gregorian with {
  year = month span (_ => 12) phase: 9
  usFiscalYearNo = d => yearOf(epochOrdinal(month, d) + 3)
}
premise USFY { calendar-system: USFiscal; tz: "Asia/Tokyo"; wkst: Mon }
@USFY
everyDay |> filter(d => usFiscalYearNo(d) == 2026) |> within(year) |> last
#=> 2026-09-30
```

**Half-years** take just one more word: derive `Fiscal` further (a derivation of a derivation) and
add a dependent window — first half April–September, second half October–March:

```kairos
# eval: 2025-04-01..2026-04-01
premise FiscalHalf = Fiscal with { half = year split (_ => [6, 6]) by: month }
premise FYH { calendar-system: FiscalHalf; tz: "Asia/Tokyo"; wkst: Mon }
@FYH
everyDay |> within(half) |> first
#=> 2025-04-01 2025-10-01
```

**Some "fiscal years" lie out of reach.** The UK personal tax year (April 6 start) is a day-unit
shift — a `month ⊃ day` pair whose `k` (the number of units a window contains) is variable —
outside `shiftBoundary`'s reach (constant-`k` pairs), and not writable as a single phase shift of
`span` (spec §3.7; a separate operator if it ever becomes needed = homework). 4-4-5 week
accounting (the 52/53-week system) is likewise a separate, `week`-based lineage — a problem to be
designed as a distinct premise, not a variant of `Fiscal`.

## 7. Scope (what Fiscal does not carry)

- **Year-ends other than April** (December closing, February closing, the US federal type, and so
  on) — the standard carries only the Japanese fiscal-year convention. For the rest, each
  organization writes a one-line derivation with a different `phase` (§6).
- **Rendering fiscal-year labels** (stringifying to "令和 8 年度" (Reiwa 8), "FY26", and the like,
  or Japanese-era conversion) — `fiscalYearNo` only returns a number (the starting calendar year);
  rendering is the job of the display side and the data side.
- **Day-unit-shifted tax years and 4-4-5 week accounting** — variable `k`, out of reach (§6).
- **Business-day and closing-date practice** (last business day of the month, holiday avoidance,
  and so on) — Fiscal carries only the cutting of the calendar; combine it with a calendar
  (`calendar:`) and the body layer's transforms (`roll` and the rest).
