---
source_sha: c9a9a778c657
---

# `isOpen` / `bizOpen` / `bizClose` — the business-hours standard derivations

> Translated from the canonical Japanese page [reference/isOpen.md](../../reference/isOpen.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: standard derivations of a calendar entity (ADR-41) / **Signature**:
`isOpen(t) : Bool` (value predicate) · `bizOpen`/`bizClose : Stream` (derived streams) / all names
**settled** (2026-07-09, the F51 batch confirmation; the supply side was renamed from `opens`/`closes`
to **`sessionOpens`/`sessionCloses`** and settled = ADR-41 revised). Normative:
spec §3.9.1, ADR-41.

## Meaning

When the in-scope `calendar:` entity C has **the paired reserved public words `sessionOpens` and
`sessionCloses`** (the opening sequence and the closing sequence = the business-hours supply
convention; declared as facts in the **civil coordinates = wall clock** of the entity's tz;
optional), the language prescribes uniformly:

- `bizOpen` — the points of C.sessionOpens whose **opening day (a civil day in C's tz) is a
  business day of C**.
- `bizClose` — each bizOpen session's closing point.
- `isOpen(t)` — whether t lies in the union of the bizOpen sessions' half-open intervals
  `[open, close)`.

**The derivations are entity-relative** — the decision inputs (which days are off; which tz the
times are read in) resolve in the **entity's culture** and do not depend on the reader's premise
([`bizDay`](nonWorking.md) = the **consumer-relative** day axis plays a different role. Whether
the TSE is open is a fact decided by the TSE's culture alone — readable even by a cross-tz reader
without tripping the tz check). A session's business-day-ness is read from its **opening day** —
an overnight session's (open 22:00, close 03:00 the next day) tail follows its opening day (a
Friday-night session is still open in Saturday's small hours; a Sunday-night session is off in its
entirety).

## Examples

A single session 9:00–15:00, a half-day holiday (1/6 closes at 11:30), a holiday on 1/1. "Every
full hour within business hours" is the single word `isOpen` (the hand-built band-plus-witness
pattern of [`../../design/40-examples/06-business-hours.md`](../../design/40-examples/06-business-hours.md) (Japanese)
§6.3 collapses into this one word):

```kairos
# eval: 2026-01-05..2026-01-08
premise TSE {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "example"
  satSunC = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  holidays = [2026-01-01] covering: 2026..2026
  nonWorking = satSunC | holidays
  nine  = chronos grid 1d anchor: 2026-01-01T09:00
  three = chronos grid 1d anchor: 2026-01-01T15:00
  halfDayCloses = [2026-01-06T11:30] covering: 2026..2026
  sessionOpens  = nine |> first
  sessionCloses = (three |> first |> filter(t => not coincides(halfDayCloses, day, t))) | halfDayCloses
}
premise JP2 {
  calendar-system: Gregorian
  calendar: TSE
  tz: "Asia/Tokyo"
  wkst: Mon
  hourly = everyInstant |> strideBy(1h, from: 2026-01-01)
}
@JP2
hourly |> filter(t => isOpen(t))
#=> 2026-01-05T09:00 2026-01-05T10:00 2026-01-05T11:00 2026-01-05T12:00 2026-01-05T13:00 2026-01-05T14:00
#=> 2026-01-06T09:00 2026-01-06T10:00 2026-01-06T11:00
#=> 2026-01-07T09:00 2026-01-07T10:00 2026-01-07T11:00 2026-01-07T12:00 2026-01-07T13:00 2026-01-07T14:00
```

"Fire at each business day's open" = `bizOpen` itself (the canonical form after the ADR-38
revision — 1/1 (holiday) and 1/3–1/4 (Sat–Sun) drop out):

```kairos
# eval: 2026-01-01..2026-01-08
premise TSE {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "example"
  satSunC = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  holidays = [2026-01-01] covering: 2026..2026
  nonWorking = satSunC | holidays
  nine  = chronos grid 1d anchor: 2026-01-01T09:00
  three = chronos grid 1d anchor: 2026-01-01T15:00
  sessionOpens  = nine |> first
  sessionCloses = three |> first
}
premise JP2 { calendar-system: Gregorian; calendar: TSE; tz: "Asia/Tokyo"; wkst: Mon }
@JP2
bizOpen
#=> 2026-01-02T09:00 2026-01-05T09:00 2026-01-06T09:00 2026-01-07T09:00
```

## Pitfalls

- **Supply comes as a pair** (declaring only one is a static error; under `with` derivation the
  judgment includes inheritance). Using a derived word on an entity that declares no
  sessionOpens/sessionCloses is a static error. Where `calendar:` is in scope, all three words are
  reserved names (a manual binding is a static error).
- **The consistency check is data-relative** (ADR-41 decision 2): over the joint effective
  coverage ∩ materialization range, adjacent markers must alternate in kind (an isolated
  close/open at an edge is legal as a notch). **For a simultaneous open/close both points must
  exist**, and their order is unique from context (close→open = continuous operation / open→close
  = zero width) — the handling of simultaneous firing belongs to the firing layer. **Align the
  heads of the pair** (supply etiquette = F92): make both `grid` (from the epoch), or give both
  `strideBy` the **same day** in `from:`. With one side `strideBy(from: 2026…)` and the other
  `grid`, the unannotated "no markers before from:" interval enters the check's domain and the
  alternation check can error falsely (a norm comes once a real case stands — for now, etiquette).
- **Boundaries are half-open**: at the opening instant the session is open; at the closing instant
  it is not.
- **Coverage**: when the decision depends on annotated intervals of sessionOpens, sessionCloses,
  or nonWorking, it is **out-of-coverage** (filter drops and annotates — past where the
  half-day-close table's covering runs out there is no silent extension. The vessel for F82).
- **24-hour operation is outside this vessel** — express all-day operation at day granularity
  (`bizDay`, `coincides(bizDay, day, t)`) and declare no sessionOpens/sessionCloses.
- **Attribution is fixed to the opening day** — CME-Globex-class "trade-date attribution" (Sunday
  open = Monday trade date) is written by supply-side composition in the entity (an attribution
  knob is F90, awaiting demand).
- Value functions are not first-class values — the point-free `filter(isOpen)` cannot be written;
  write the lambda `filter(t => isOpen(t))` (same as `coincides`).

## Related

[`nonWorking`](nonWorking.md) (the entity; `bizDay` = the consumer-relative day axis) ·
[`coincides`](coincides.md) (the window-membership predicate — isOpen is a derived form of the
same family) · [`grid`](grid.md) (a time-of-day anchor = wall-clock ticks; ADR-31 revision 2) ·
[`strideBy`](strideBy.md) · [`shift`](shift.md) (elapsed-time preserving — the wall clock belongs
not here but to the declaration side) · spec §3.9.1 · ADR-41 / ADR-31 revision 2 · F67/F79/F85/F89.
