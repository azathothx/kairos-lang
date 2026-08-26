---
source_sha: 1d34f0260e85
---

# `at` — attaching a wall-clock time to a day set

> Translated from the canonical Japanese page [reference/at.md](../../reference/at.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: sugar (stdlib; a Gregorian public word = transform) / **Signature**:
`at(a) : Stream -> Stream` (`a` is a standalone time literal `Thh:mm`) / name settled (ADR-51)

## Meaning

For each day in a day set, returns the instant at **wall-clock time `a` on that day**. The
expansion is a mechanical insertion of the wall-clock canonical form (sugar = spec §4.8):

```
at(a) = s => (everyInstant |> strideBy(1d, from: a)) |> filter(t => coincides(s, day, t))
```

"H o'clock on that day" is a **wall-clock** notion. Window-unit [`shift`](shift.md)
(`unit: hour`) has elapsed-time semantics (F76) and drifts off the wall clock on DST transition
days — `at` steps with a tick (a civil-day-width progression = wall-clock preserving), so the wall
clock holds even across transitions. The standalone time literal is anchored on the epoch anchor
day 1970-01-01 in the resident tz — nothing is lost however far back the evaluation range goes
(ADR-51).

## Examples

The last business day of the month at 17:00 (replacing the elapsed-arithmetic form
`snapTo(day) |> shift(+17, unit: hour)` — extensionally equal in JST, and the warning path
disappears):

```kairos
# eval: 2026-08-01..2026-11-01
@JP
bizDay |> within(month) |> last |> at(T17:00)
#=> 2026-08-31T17:00 2026-09-30T17:00 2026-10-30T17:00
```

October ends on Saturday 10/31, so the last business day is 10/30. In DST zones the difference
from the elapsed form is **wall-clock preservation** (NY spring transition — the elapsed form
lands on 10:00. 06 §6.1):

```kairos
# eval: 2026-03-07..2026-03-10 tz: America/New_York
premise NY { calendar-system: Gregorian; tz: "America/New_York"; wkst: Sun }
@NY
everyDay |> at(T09:00)
#=> 2026-03-07T09:00 2026-03-08T09:00 2026-03-09T09:00
```

Sub-hour works the same way (`T07:30` — wall-clock offset preservation, F81). "23:00 on the
previous day" adjusts the day in the day layer before attaching the time:
`marks |> shift(-1, unit: day) |> at(T23:00)`.

## Pitfalls

- **Pass `at` a standalone time literal** — anything else is a guided static error (ADR-51
  addendum). A datetime literal (`at(2026-01-01T17:00)`) or a bare date literal used to make the
  tick origin **forward-only**, silently emptying days before the anchor; the check now blocks
  that shape (defending the reason ADR-51 rejected variant B). Writing only the time makes the
  gap structurally impossible.
- **Windowed input is not accepted** — a guided static error (ADR-51 addendum). The expansion
  re-reads its input as a predicate and does not carry windows through, so "the first 3 days of
  each month at 7:00" used to silently become a running count. The correct form is to **cut
  windows after `at`**: `everyDay |> at(T07:00) |> within(month) |> first` (extensionally
  equivalent).
- **Points outside coverage that reach `at` are dropped at the `at` stage** (reflux mail 15 (e)).
  The expansion's inner `filter` catches the out-of-coverage signal raised on those days and
  "drops with an annotation" (per the ADR-37 decision 6 convention — sugar inherits the meaning
  of its expansion). The elapsed-arithmetic form preserves the points and only annotates, so
  **over an evaluation window that crosses a coverage edge the point sequences can differ before
  and after migration** (e.g. `bizDay |> at(T07:00)` over a year-end window past the coverage edge
  omits the out-of-coverage days — and the annotations are identical to the old form's, so the
  change in points cannot be read from them). Evaluations that stay inside coverage agree. The
  operational defense is keeping coverage current (runway warnings = ADR-37 decision 8), not the
  shape of the expression.
- **Feeding `at` output into a counting stage or a `segmentBy` marker classifies even finite
  input as "infinite"** (reflux mail 15 (b)). The tick-derived endless flag passes through the
  filter (a convention-conformant conservative approximation) — with `takeLast` the
  implementation-horizon guard fires a false positive warning, and with `segmentBy(labels:)` the
  data-label eligibility check becomes a static error. The correct form for both: **build the
  counting stage / marker in the day layer and attach the time afterwards** (same order as the
  takeLast item below).
- **Migrating off the elapsed form removes only the tail-form warnings.** The horizon clips on the
  marker-preparation side (`snapTo(day)` over external instants — a few points at the edges,
  harmless) remain (known behavior; ADR-37 decision 8).
- **DST gap days** (days where the wall-clock time does not exist) follow the F81 convention —
  carried down to the first instant after the gap; overlap days take the first occurrence
  (09-dst §9.2. "Named instants are strict; derived ones follow conventions" — a different layer
  from the explicit error on input literals 〈ADR-33〉).
- When combining with [`takeLast`](takeLast.md), **count in the day layer and attach the time
  afterwards** (`takeLast(3, until: …) |> at(T07:00)`) — a date-literal `until:` anchors at 00:00,
  so attaching the time first drops the same-day firing from the count.
- A standalone time literal materializes into an instant only in the `strideBy(1d, from:)`
  position — other point positions and other widths are guided static errors (never silently
  pinned to the epoch day. ADR-51).

## Related

[`strideBy`](strideBy.md) (the tick of the expansion) · [`coincides`](coincides.md) (the predicate
of the expansion) · [`takeLast`](takeLast.md) (the standard composition with recent-N) ·
[`isOpen`](isOpen.md) (time **bands** are a different vessel = business hours) · ADR-51 · F76/F81.
