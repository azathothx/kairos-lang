---
source_sha: 28efa31bd407
---

# `rebase` — date-label-preserving re-anchoring

> Translated from the canonical Japanese page [reference/rebase.md](../../reference/rebase.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: point transform (body-layer core — the fourth member alongside roll/shift/snapTo) /
**Signature**: `rebase(to: "tz") : Stream -> Stream` / name **settled** (2026-07-09, the F51 batch
confirmation; the compared candidates `relabel`/`sameDate` were not adopted)

## Meaning

Takes the **date label** (Y-M-D) of each input point (the **first point of a civil day** in the
source tz) and maps it to **the first instant of the civil day with the same date in the to tz**
(ADR-33 decision 4 — the rule is defined even for days whose midnight falls into a DST gap). Date
order is the same order regardless of tz, so the map is **injective and order-preserving**. The
source tz is taken **from the input's alignment** — the input is required to carry the
**default-alignment day grid** (width 1d, in-day offset 0, with a tz name); anything else (no
alignment, anchored, or with a time-of-day offset) is a static error. `source == to` is identity.
The output alignment is **the day grid of the to tz** (constructive; the alignment table of
ADR-36).

This is **the vessel for F69**: cross-tz composition of "the **same date**" cannot in principle be
written with chronos equality ([`snapTo`](snapTo.md) is **chronos membership** — Tokyo's day heads
floor to the **previous day** in NY, a systematic one-day slip). The choice among means of
conformance is threefold:

- **the same instant** (chronos membership) → `snapTo`
- **the same date** (label correspondence) → `rebase`
- **timed membership** (is it inside the window?) → [`coincides`](coincides.md) — for cross-tz,
  first unify the tz with `rebase`

## Example (canonical form: the joint business days of TSE × NYSE)

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

`rebase` declares the "label correspondence" realignment, while `&` stays the existing chronos
equality — both sides pass the alignment check (ADR-36) on NY's day grid. The output is **NY's date
sequence** (display uses the execution tz — here the default Asia/Tokyo — so NY's day heads appear
as `T14:00`; 1/12 is Tokyo's Coming-of-Age Day and drops out of the intersection).

## Pitfalls

- **`w` is fixed to day** (not taken as an argument). Generalizing to month/year is many-to-one and
  breaks injectivity — redesign if a real case appears (ADR-40 decision 2).
- **A nonexistent date is an explicit error** (the data-relative layer): re-anchoring onto a day
  erased outright by a date-line move (Pacific/Apia's 2011-12-30 and the like) cannot be written
  (ADR-40 decision 3).
- **Time-preserving re-anchoring is a future extension** — timed sequences are stopped statically
  by the input alignment check (the day-grid requirement). Timed cross-tz narrowing can be written
  as the composition of `rebase` plus `coincides` after tz unification (there is no expressiveness
  gap).
- **`shift`/`roll` go before rebase** — window words such as `unit: day` after a rebase resolve in
  the in-scope premise and therefore disagree with the to tz's grid (the norm of ADR-40
  decision 7).
- `to:` is a **string literal** naming a tz (a premise name is not allowed — using a premise to
  name nothing but a tz is a mix-up face of "what was it aligned to". ADR-40 decision 5). Versions
  and gap rules follow the in-scope evaluation context.
- rebase makes cross-tz alignment routine — the receiving exempt family (`within`, `ordinalIn`,
  selectors, cycle/value projections) carries the **tz-name check** (ADR-36 revision 2), so flowing
  on **without** rebase becomes a static error in the form of "bundling with a one-day label slip,
  weekday reading" (the error guides toward rebase).

## Related

[`snapTo`](snapTo.md) (chronos membership), [`coincides`](coincides.md) (the window-membership
predicate), [combinators](combinators.md) (composition by equality),
[`shift`](shift.md)/[`roll`](roll.md) (the norm of going first), ADR-33/36/40, F69.
