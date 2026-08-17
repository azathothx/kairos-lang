---
source_sha: ea86b8c0d853
---

# `split` — variable division of a parent window (dependent windows)

> Translated from the canonical Japanese page [reference/split.md](../../reference/split.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: window-generating word (premise layer) / **Signature**: `split(g) by: u :
Stream(windowed) -> Stream(partitioned)` / name settled (spec §5.4)

## Meaning

Divides a parent window into **consecutive subwindows** by the width list returned by
`g = y => [widths…]` (top-down division). `y` is the parent's **running window-sequence ordinal**
(the F60 coordinate); `by: u` is the unit of the widths (mandatory). Two per-instance checks run
(ADR-48): **boundary alignment** (both ends of each parent window must sit on `u`'s window
boundaries — misaligned pairs like calendar-year × week are rejected here) and the **I5 sum**
(the widths must sum to the number of `u` windows inside the parent; a mismatch is an explicit
error).

Both the parent and `by:` accept, in addition to partition windows, **effective partitions built
from rule markers** (segmentBy-built window sequences without coverage annotations — the standard
`week`, `isoWeek`, `isoYear`). Window sequences from data-borne (covering-carrying) markers,
`empties: drop` sequences, and cycles are not accepted — editing the coverage would silently move
the ordinals that `g` draws on (a guided static error; the segmentBy form is canonical there.
ADR-48 · F109).

Where `span` (bottom-up) builds the basic bundling, `split` builds **dependent windows** — use it
for windows that should follow the parent automatically when it changes. Gregorian's `quarter` is
the representative:

```text
quarter = year split (_ => [3, 3, 3, 3]) by: month
```

Under a fiscal calendar (`year` recomposed via `with`), this inherited definition **follows the
new year automatically** and becomes fiscal quarters (Mechanism A; [`with`](with.md)).

## Examples

Split the year into first and second halves:

```kairos
# eval: 2026-01-01..2027-01-01
premise H = Gregorian with { half = year split (_ => [6, 6]) by: month }
premise JPH { calendar-system: H; tz: "Asia/Tokyo"; wkst: Mon }
@JPH
everyDay |> within(half) |> first
#=> 2026-01-01 2026-07-01
```

First day of each quarter (the standard `quarter`):

```kairos
# eval: 2026-01-01..2027-01-01
@JP
everyDay |> within(quarter) |> first
#=> 2026-01-01 2026-04-01 2026-07-01 2026-10-01
```

Weekday part and weekend part of the week (a segmentBy-built standard `week` as the parent;
ADR-48):

```kairos
# eval: 2026-01-05..2026-01-19
premise W5 = Gregorian with { weekPart = week split (_ => [5, 2]) by: day }
premise JPW { calendar-system: W5; tz: "Asia/Tokyo"; wkst: Mon }
@JPW
everyDay |> within(weekPart) |> first
#=> 2026-01-05 2026-01-10 2026-01-12 2026-01-17
```

## label: (ADR-34)

`split … by: u label: (p => expr)` attaches a label to each subwindow (`p` = the window's first
point; lazily evaluated at projection time. Details in the same section of [`span`](span.md) and
ADR-34).

## Pitfalls

- `by:` cannot be omitted (mistaking the unit of the widths is a silently wrong result; the
  I3/I5 line).
- A width list whose sum ≠ the parent window's unit count is an **explicit error** (per-instance,
  at materialization. A constant list against a variable-length parent — 52/53-week ISO years —
  breaks; **materialization starts at the epoch, so it breaks regardless of the evaluation
  range**. Branch `g` on the parent ordinal, or use the segmentBy canonical form where the
  catch-up falls out of the structure: 40-examples/11 §(m)).
- **With rule markers × `edges: clip`, the pseudo window at the materialization edge ([epoch,
  first marker)) occupies running ordinal 0** — when writing a branching `g(i)`, account for
  i=0 being the pseudo window (the reading side, `epochOrdinal`, reads the same sequence, so the
  coordinates agree).
- **Do not write ordinal-parity `g` against alternating-band parents** — business bands
  (open/closed; 40-examples/06) lose parity as soon as a half-day close lands. Band selection
  belongs to the witness pattern / `isOpen` (ADR-41).
- **Not for the basic bundling** — making `month = year split …` sets up a `month ↔ year` cycle
  under derivation. Stand the month as `day span daysInMonth` (leap as a value) and keep `split`
  to dependent windows (quarter, half) — that is Gregorian's design (spec §3.6 "leap is a value,
  not a window").

## Related

[`span`](span.md) · [`grid`](grid.md) · [`segmentBy`](segmentBy.md) (the source of effective
partitions) · [`with`](with.md) (automatic following in action) · I5 · ADR-48.
