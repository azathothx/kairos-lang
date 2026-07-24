---
source_sha: 9bb309467de8
---

# `cycle` — parallel repeating labels (labels, not windows)

> Translated from the canonical Japanese page [reference/cycle.md](../../reference/cycle.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: window-generating word (premise layer) / **Signature**:
`cycle(labels) anchor: r : Stream -> Stream(labeled)` / name settled (spec §5.4)

## Meaning

Attaches **repeating labels** to a target partition window. It creates no windows — just as
weekdays do not partition the days, labels are a concept **parallel** to windows (ADR-03). The
period length is arbitrary (7, 10, 12, 60, …), and so is the target window (not only weekdays over
`day` — it can be laid over `month` and `year` too; the twelve earthly branches are
`year cycle […]`).

- The **list** gives only the cyclic order; the head carries no meaning of "start" (where the week
  starts is WKST's job. stdlib/gregorian.md §4.1).
- **`anchor:`** is the actual day that pins the phase — "the target window containing the anchor
  carries the head label".
- **The binding name reads as a value-expression "point → label" function** — `weekday(d)`,
  `yearBranch(d)`. Resolution is the two steps point → containing window → label (ADR-27/30).

## Examples

The yearly earthly branches — with 2020 (子, the Rat) as anchor, selecting New Year's Day of a
午 (Horse) year:

```kairos
# eval: 2020-01-01..2028-01-01
premise JPEto = Gregorian with {
  tz: "Asia/Tokyo"                  # needed to anchor the date literal in anchor: (ADR-33)
  yearBranch = year cycle [子, 丑, 寅, 卯, 辰, 巳, 午, 未, 申, 酉, 戌, 亥] anchor: 2020-01-01
}
@JPEto
everyDay |> within(year) |> first |> filter(d => yearBranch(d) == 午)
#=> 2026-01-01
```

Reading the standard weekday (`Gregorian.weekday`) in a predicate:

```kairos
# eval: 2026-01-01..2026-01-20
@JP
everyDay |> filter(d => weekday(d) == Mon)
#=> 2026-01-05 2026-01-12 2026-01-19
```

## Pitfalls

- `cycle` is a **rhythm** (calendar-system-pure, infinite) — a **1-to-1 label over finite data**,
  like the names of the 24 solar terms, is not a cycle but a table's `labels:`
  ([table literal](table-literal.md); the source differs, but the reading side is the same
  binding-name projection). Attaching a **fixed period to a data-derived window sequence** is
  [`segmentBy`](segmentBy.md)'s `labels: cycle` form (ADR-47 — the same "the window containing the
  anchor carries the first label" as this page).
- Rotating the list (rewriting `[Mon, …, Sun]` as `[Sun, Mon, …]`, etc.) gives **the same calendar
  only if the anchor is also re-taken to a corresponding real day** — with the anchor fixed, every
  label rotates at once (the phase is decided by "the window containing the anchor = the first
  label". The old wording "the same anchor gives the same calendar" was wrong — corrected
  2026-07-25). That the list order has nothing to do with the week's **start** (WKST) still holds.
- A composite period like the 60-term sexagenary cycle may be a single 60-element cycle, or the two
  cycles of the ten heavenly stems and the twelve earthly branches composed in a predicate (a zip
  product of cycles is not introduced — open item F16).

## Related

[`filter`](filter.md) (label predicates) · [table literal](table-literal.md) (data-derived labels) ·
the separation from WKST (stdlib/gregorian.md §4) · ADR-03/27/30.
