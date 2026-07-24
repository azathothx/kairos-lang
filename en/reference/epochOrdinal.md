---
source_sha: be0c3350030f
---

# `epochOrdinal` — the running ordinal from the epoch

> Translated from the canonical Japanese page [reference/epochOrdinal.md](../../reference/epochOrdinal.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: projection (value expression, body-layer core) / **Signature**:
`epochOrdinal(u, d) : point -> number` / name settled (RC2, spec §5.4)

## Meaning

Returns the **running ordinal from the epoch** (**0-based**) of the `u` window containing point
`d`. It is [`ordinalIn`](ordinalIn.md) with the frame widened to the epoch — a single coordinate
that never resets per window. It is **the same coordinate** as "the ordinal `n` of the window under
generation" that the premise-layer window-generating word `span` receives (`monthOf(m) = m mod 12`
holds with m=0 = the epoch month).

The **epoch** is the language default 1970-01-01T00:00 (in the in-scope tz). A calendar system on a
different basis can override it via the primitive definition's member `epoch:` (it cannot be placed
in the consumer's preamble; ADR-31).

## Examples

Every other month — the first day of even-ordinal months (the origin is 1970-01, so January,
March, … are even):

```kairos
# eval: 2026-01-01..2026-04-01
@JP
everyDay |> filter(d => epochOrdinal(month, d) mod 2 == 0) |> within(month) |> first
#=> 2026-01-01 2026-03-01
```

"Modulo 12" gives the position of the calendar month — selecting January only:

```kairos
# eval: 2026-01-01..2027-01-01
@JP
everyDay |> filter(d => epochOrdinal(month, d) mod 12 == 0) |> within(month) |> first
#=> 2026-01-01
```

## Pitfalls

- **0-based** (an ordinal coordinate). [`ordinalIn`](ordinalIn.md), which answers "the Nth", is
  1-based — a different role.
- The absolute value of the ordinal depends on the epoch. Use it in expressions through remainders
  and differences; it is safest never to embed the raw value directly into a schedule's meaning
  (the expression then survives a change of epoch).
- Suited to expressing **periodicity** ("every other week", "every other month"). For a one-off
  coordinate, use the **window instance reference** `year(2020)` (spec §4.9, ADR-42).
- **Data-derived windows (windows from `segmentBy`)** — when the window sequence does not reach the
  epoch, "**the first existing window is 0**" (ADR-31 revision, settled by F60). Raw index lookup
  `list[epochOrdinal(w, d)]` remains legal as a value expression but is **non-canonical** — the
  canonical form for tying a parallel list to a window sequence is [`segmentBy`](segmentBy.md)'s
  `labels:` (ADR-39; with the same-length check; the stdlib Kyureki has been migrated). Note that
  the **window-sequence ordinal** of `labels:` is always 0-based and, for historical data crossing
  the epoch, is **a different coordinate** from epochOrdinal (the two do not ride together).

## See also

[`ordinalIn`](ordinalIn.md) · [`span`](span.md) (the supplier of the same ordinal coordinate) ·
the epoch `epoch:` (ADR-31) · ADR-27/30.
