---
source_sha: e3f55532071d
---

# `ordinalIn` — the ordinal of the unit window within a frame window

> Translated from the canonical Japanese page [reference/ordinalIn.md](../../reference/ordinalIn.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: projection (value expression, body-layer core) / **Signature**:
`ordinalIn(u, w, d) : point -> number` / name settled (RC2, spec §5.4)

## Meaning

Within the frame window `w` containing point `d`, returns **the ordinal of the unit window `u`**
containing `d` (**1-based**). `ordinalIn(day, month, d)` = which day of the month;
`ordinalIn(day, week, d)` = which day of the week.

The **dual** of selectors (window → point) — where [`nth`](nth.md) **picks out** "the Nth of a
window", `ordinalIn` **reads** "which ordinal the point stands at". Because the two-window argument
form makes the counting unit `u` explicit, it does not depend on the input stream's granularity
(days or instants) (ADR-30 (1)).

## Examples

A fixed day — the 11th of every month:

```kairos
# eval: 2026-01-01..2026-04-01
@JP
everyDay |> filter(d => ordinalIn(day, month, d) == 11)
#=> 2026-01-11 2026-02-11 2026-03-11
```

**"Every n, reset per window"** (the per-window-reset variant of the stride reduces to this; no
dedicated notation — ADR-27) — the 1st, 8th, 15th, 22nd, and 29th of each month:

```kairos
# eval: 2026-01-01..2026-02-01
@JP
everyDay |> filter(d => (ordinalIn(day, month, d) - 1) mod 7 == 0)
#=> 2026-01-01 2026-01-08 2026-01-15 2026-01-22 2026-01-29
```

## Pitfalls

- **1-based** (the convention of "the Nth"). The 0-based running ordinal is
  [`epochOrdinal`](epochOrdinal.md).
- `u` must be a subordinate window of `w` (`ordinalIn(month, day, d)` is invalid).
- A point's calendar coordinates (`yearNo`/`monthNo`/`dayNo`) are derivable as **sugar** over
  `epochOrdinal` + `ordinalIn` + existing value functions — no new words (ADR-30).

## See also

[`epochOrdinal`](epochOrdinal.md) · [`nth`](nth.md) (the dual) · [`filter`](filter.md) ·
[`stride`](stride.md) (the non-resetting variant) · ADR-27/30.
