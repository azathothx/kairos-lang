---
source_sha: 1443f6647d2c
---

# `first` — select the first in each window

> Translated from the canonical Japanese page [reference/first.md](../../reference/first.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: selector (body-layer core) · **Signature**: `first : Stream(windowed) -> Stream` ·
name settled (spec §5.4)

## Meaning

Selects the **first element** within each window. Selectors are always relative to the containing
window (window-relative; I4) — they consume the window and return "each window → at most one
point". The default target is the innermost window; when nesting makes it ambiguous, name it
explicitly with `of: w` (§4.3).

A window with no elements yields nothing — **empty is a legitimate value** (ADR-15), not an error.

## Examples

The first day of each quarter:

```kairos
# eval: 2026-01-01..2027-01-01
@JP
everyDay |> within(quarter) |> first
#=> 2026-01-01 2026-04-01 2026-07-01 2026-10-01
```

Naming the outer window with `of:`:

```kairos
# eval: 2026-01-01..2027-01-01
@JP
everyDay |> within(quarter) |> within(month) |> first(of: quarter)
#=> 2026-01-01 2026-04-01 2026-07-01 2026-10-01
```

## Pitfalls

- `first` without a window is a type error (I4).
- Thinning the input **first** and then bundling it into windows (`filter |> within |> first`), as
  in "the first among business days", gives a different result from bundling first and then
  selecting. The Nth business day is the former.
- The public boundary words of primitive definitions are written as reuses of this selector
  (`monthStart = month |> first`; zero new mechanism; spec §3.6).
- In the final window of a data-derived window sequence (closed at the coverage edge), an empty known part is not a "legitimate
  empty": the whole window gets an out-of-coverage annotation (the first element may lie beyond the coverage. ADR-37 revision 6).
  With an element in the known part, the start side is settled (no annotation).

## Related

[`nth`](nth.md) · [`last`](last.md) · [`within`](within.md) · [`ordinalIn`](ordinalIn.md) (the
reverse direction — reading an ordinal from a point) · I4 · ADR-15/24.
