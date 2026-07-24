---
source_sha: e8762b805a25
---

# `nonWorking` — the calendar entity's reserved public word and the `bizDay` standard derivation

> Translated from the canonical Japanese page [reference/nonWorking.md](../../reference/nonWorking.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: calendar entity (premise layer) / **Identity**: the public word
`nonWorking : Stream` (argument-less; day-aligned in the entity's tz) / `nonWorking` is a
**settled name** (2026-07-09, the F51 batch confirmation). Normative: spec §3.9, ADR-35.

## Meaning

A **calendar entity** — what stands at the `calendar:` member — is a premise that has the reserved
public word `nonWorking` (the non-working set). There is no dedicated syntax: an ordinary premise
definition, plus the designation of "which binding is the non-working set", is all. The identity
check (an extension of ADR-19) requires:

- the public word `nonWorking` (time-stream type; an argument-less binding; **aligned to the
  civil-day grid** of the entity's tz)
- a `tz:` declaration (**required** — fixes the data's civil days on the inside. ADR-33)

As governance separate from the identity check — the usual rule for premises containing tables —
`source:` is declaration-required leaning and the edition is carried by `asof:` (declaration
recommended where reproducibility matters. ADR-26).

Once the user side stands an entity at `calendar:`, **the standard derivation prescribed uniformly
by the language** becomes available: `bizDay = everyDay \ C.nonWorking` (`everyDay` resolves on the
user side; `C.nonWorking` is pinned to the entity). Where `calendar:` is in scope, `bizDay` is a
reserved derived name (a manual binding is a static error).

## Examples

Declare an entity and read business days through the standard derivation `bizDay` (1/1 is a
holiday; 1/3 and 1/4 are Sat–Sun. The closed-day data is simplified for the example — the real TSE
is also closed over the year-end/New Year period 12/31–1/3):

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

**Naming the entity directly** at an axis position (`on: TSE` ≡ `on: bizDay` in the context of
`calendar: TSE`. F53, ADR-35) — if payday the 25th falls on a Sunday, the preceding business day:

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
#~> 範囲外 2026-01-01..2026-01-02（TSE.holidays covering 2026-01-01..2026-12-31）
```

Organization-local overriding uses the existing `with` (overriding `source:` as well —
declaration-required leaning):

```text
premise MyCompany = TSE with {
  source:     "intra.example.com/holidays"
  nonWorking = TSE.nonWorking | companyHolidays    # base references use the qualified pin
}
```

The entity's members are readable from body expressions by **qualified reference** (ADR-17
"qualify when ambiguous"; the answer to F100 of the third feedback batch — the
day-before-a-holiday-reminder class is writable with no new reserved names. Bare names resolve
premise-relative, so an entity's contents are not exposed automatically = as designed):

```kairos
# eval: 2026-01-02..2026-03-01
premise Cal { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "hr-db"
  holidays = [2026-01-01, 2026-01-12, 2026-02-11] covering: 2026..2026
  satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  nonWorking = satSun | holidays
}
premise Use { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; calendar: Cal }
@Use
Cal.holidays |> shift(-1, unit: day)
#=> 2026-01-11 2026-02-10
```

## Pitfalls

- **Timed points cannot be placed in `nonWorking`** (identity check = day alignment; the ground on
  which the ADR-36 checks and the standard derivation mesh). Half-day holidays and business-hour
  bands live in the same entity as **the paired reserved public words
  `sessionOpens`/`sessionCloses`**, read through the standard derivations
  [`bizOpen`/`bizClose`/`isOpen`](isOpen.md) (ADR-41 — those are **entity-relative**; the role
  difference from user-side-relative bizDay is in isOpen.md).
- If the entity's `tz:` and the user side's `tz:` disagree, the standard derivation is stopped by
  the alignment check (spec §4.5) (the correct behavior of F54). The explicit form
  `everyDay \ (TSE.nonWorking |> snapTo(day))` means "read the overlap on chronos through the user
  side's day boundaries" — not reconciliation of "the same date label"; for that, use
  [`rebase`](rebase.md) (ADR-40).
- Cascades (substitute holidays, tiaoxiu) are composed on the **right-hand side** of `nonWorking`
  (ADR-01 — filtering appears only at the final stage of the standard derivation).
- Out of `calendar:` scope, `bizDay` remains a free binding name (existing manual-binding styles
  keep working).

## Related

[Combinators](combinators.md) (cascades, alignment checks) ·
[`filter`](filter.md)/[`roll`](roll.md) (naming an entity directly at an axis position) ·
[`with`](with.md) (organizational overriding) ·
[table literals](table-literal.md) (`source:`/`covering:`) · spec §3.9 · ADR-35/36.
