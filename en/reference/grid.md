---
source_sha: 6d1204d3ea71
---

# `grid` — uniform division of the continuous axis (the atoms of a calendar)

> Translated from the canonical Japanese page [reference/grid.md](../../reference/grid.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: window-generating word (premise layer) / **Signature**:
`grid(w) : Chronos -> Stream(partitioned)` / name settled (spec §5.4)

## Meaning

Tiles the continuous base Chronos uniformly at width `w`, making the **atoms of a calendar**. The
only word in the language that accepts `chronos` (the base's lexical name. ADR-29). Its main
writers are calendar-system definers (`Gregorian`'s `day` stands on it), but the form in which a
calendar entity lays the wall-clock ticks of business hours
(`nine = chronos grid 1d anchor: …T09:00`; ADR-41) is a legitimate second use.

The width `w` follows the **civil-time width conventions** (ADR-11/12) — `1d` is "1 civil day",
not a fixed `86400s`. The civil day of a DST transition is 23–25 hours long (leap seconds are out
of scope = ADR-33).

The **phase** aligns by default (ADR-31): civil-time widths (`d`) to the **opening instant of each
civil day** in the in-scope `tz:` (midnight on ordinary days. ADR-31 revision); elapsed-time widths
(`h`/`m`/`s`) to the **epoch**. That `day = chronos grid 1d` becomes "calendar days cut at
midnight" with nothing specified is due to this default. Override with `anchor:` only when a
different phase is needed. For a **civil-width grid with a timed anchor**, the window boundaries
are "the first instant in each civil day at which the anchor's **wall-clock time (a label reading)**
is read" (a DST gap → the first instant after the gap; an overlap → the first occurrence; a
nonexistent civil day → no tick; an anchor placed at a civil day's opening point → day alignment.
ADR-31 revision 2) — `anchor: 2026-01-01T09:00` keeps wall-clock 09:00 even on DST transition days.

## Examples

Laying ten-day "dekad" (旬) windows from a 2026-01-01 origin:

```kairos
# eval: 2026-01-01..2026-02-05
premise Dekad = Gregorian with { decade = chronos grid 10d anchor: 2026-01-01 }
premise JPD { calendar-system: Dekad; tz: "Asia/Tokyo"; wkst: Mon }
@JPD
everyDay |> within(decade) |> first
#=> 2026-01-01 2026-01-11 2026-01-21 2026-01-31
```

The standard definition of `day` (stdlib/gregorian.md):

```text
day = chronos grid 1d      # the atom. Phase is the default (each civil day's opening instant = midnight on ordinary days), so no anchor: needed
```

## `label:` (ADR-34)

`grid` also takes a postfixed `label: (p => expr)` (`p` = the window's first point; details in the
same section of [`span`](span.md) and ADR-34).

## Pitfalls

- Only `chronos` can be passed to `grid` — dividing an existing window is [`split`](split.md)
  (with a variable-width list), or [`span`](span.md) up from finer atoms.
- Never build the calendar "month" as `grid(30d)` — months are non-uniform, so bundle them with
  `span daysInMonth` (variable aggregation by a value expression).

## Related

[`span`](span.md) · [`split`](split.md) · [`cycle`](cycle.md) · `chronos` (ADR-29) · phase and the
epoch (ADR-31) · ADR-11/12.
