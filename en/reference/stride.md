---
source_sha: d890f41a117c
---

# `stride` — thin the input points to every nth

> Translated from the canonical Japanese page [reference/stride.md](../../reference/stride.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: stride (body-layer core; a family apart from selectors) · **Signature**:
`stride(n, from:) : Stream -> Stream` · name settled (spec §5.4)

## Meaning

Scans **the points of the input stream** and keeps one point out of every **`n`**, counting from
the origin `from:` (input-relative = ADR-38 decision 10; it has no axis argument — what gets
counted is decided by the preceding stage). Where a selector ([`nth`](nth.md)) consumes windows
and picks "the Nth" **resetting per window**, a stride consumes no window and counts
**continuously, ignoring boundaries** — "every 3 business days, ignoring month boundaries" cannot
be written with selectors, and that is the stride's reason to exist (ADR-11). Not "the Nth" but
"every N".

The origin (phase anchor) `from:` is **mandatory** (absence is a static error). The former
"supplied from the upstream window's origin" was abolished — with multiple windows it is ambiguous
and evaluation-range-dependent (ADR-31 · F49). **The `from:` rule**: the **first input point** at
or after `from:` is the counting origin (step 0 = it survives) — `from:` is not required to be a
point of the input (phase mix-ups are the danger zone stepped on in F32; ADR-38 decision 11).
**`n` is an integer ≥ 1** — otherwise a static error (the "silently empty" of `stride(0)` is a
target of eradication; ADR-38 decision 12).

## Examples

Every 3 business days (1/12 is a holiday; no reset across the month boundary):

```kairos
# eval: 2026-01-01..2026-01-23
@JP
everyDay |> filter(on: bizDay) |> stride(3, from: 2026-01-05)
#=> 2026-01-05 2026-01-08 2026-01-14 2026-01-19 2026-01-22
```

"**Biweekly from a specific day**" is exactly the phase of `from:` (the answer to F103 of the
third feedback batch) — no year-anchor-parity workaround is needed, and no 52/53-week phase flip
across year boundaries occurs (the phase is held by `from:` = ADR-31/38):

```kairos
# eval: 2026-01-01..2026-03-01
@JP
everyDay |> filter(d => weekday(d) == Mon) |> stride(2, from: 2026-01-05)
#=> 2026-01-05 2026-01-19 2026-02-02 2026-02-16
```

## When you want a per-window reset

An every-n that **recounts per window**, like "the 1st, 8th, 15th, … of each month", is written
not with a stride but by reduction to [`ordinalIn`](ordinalIn.md) (it gets no dedicated notation;
ADR-27):

```kairos
# eval: 2026-01-01..2026-02-01
@JP
everyDay |> filter(d => (ordinalIn(day, month, d) - 1) mod 7 == 0)
#=> 2026-01-01 2026-01-08 2026-01-15 2026-01-22 2026-01-29
```

## Pitfalls

- `stride(n)` counts **the points of the input stream** (input count; settled in ADR-38 — the
  axis-relative reading was retired). What gets counted is decided by the preceding filter — for
  every N business days, put `filter(on: bizDay)` first. If "count along an axis, apply to
  another stream" is needed, compose it as `(stride sequence of the axis) & input` 〈day-aligned〉
  or `filter(d => coincides(strideSequence, day, d))` 〈timed; [`coincides`](coincides.md)〉.
- Points before `from:` are not output (the phase is fixed by `from:`).
- To step by an absolute magnitude (a width that does not ride the calendar), use
  [`strideBy`](strideBy.md).

## Related

[`strideBy`](strideBy.md) (count by points / step by width — the pair) ·
[`nth`](nth.md) (window-relative "the Nth") ·
[`ordinalIn`](ordinalIn.md) (the reduction target of the window-reset variant) · ADR-11/31/38.
