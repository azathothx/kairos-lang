---
source_sha: 6e6ef38010f2
---

# `split` — variable division of a parent window (dependent windows)

> Translated from the canonical Japanese page [reference/split.md](../../reference/split.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: window-generating word (premise layer) · **Signature**: `split(g) by: u :
Stream(windowed) -> Stream(partitioned)` · name settled (spec §5.4)

## Meaning

Divides a parent window into **consecutive subwindows** by the width list returned by
`g = y => [widths…]` (top-down division). `y` is the parent window's ordinal; `by: u` is the unit
of the widths (mandatory). That the widths sum to the parent window is checkable under I5.

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

## label: (ADR-34)

`split … by: u label: (p => expr)` attaches a label to each subwindow (`p` = the window's first
point; lazily evaluated at projection time. Details in the same section of [`span`](span.md) and
ADR-34).

## Pitfalls

- `by:` cannot be omitted (mistaking the unit of the widths is a silently wrong result; the
  I3/I5 line).
- A width list whose sum ≠ the parent window's unit count is an I5 violation (caught by the check).
- **Not for the basic bundling** — making `month = year split …` sets up a `month ↔ year` cycle
  under derivation. Stand the month as `day span daysInMonth` (leap as a value) and keep `split`
  to dependent windows (quarter, half) — that is Gregorian's design (spec §3.6 "leap is a value,
  not a window").

## Related

[`span`](span.md) · [`grid`](grid.md) · [`with`](with.md) (automatic following in action) · I5.
