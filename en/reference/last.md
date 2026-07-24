---
source_sha: 3c8b06899159
---

# `last` — select the last in each window

> Translated from the canonical Japanese page [reference/last.md](../../reference/last.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: selector (body-layer core) · **Signature**: `last : Stream(windowed) -> Stream` ·
name settled (spec §5.4)

## Meaning

Selects the **last element** within each window. Window-relative (I4). The default target is the
innermost window; when nesting makes it ambiguous, name the target window explicitly with `of: w`
(§4.3; the example in [`first`](first.md)). "Month-end", "fiscal-year-end", "the last day of the
week" — all of them are really this.

`monthEnd`, which looks like a generator, is in fact a public boundary word of a primitive
definition, `monthEnd = month |> last` — a reuse of `last`, not a separate mechanism (spec §3.6).

## Examples

The last day of each month (calendar-day based; business-day adjustment is the job of a downstream
[`roll`](roll.md) — the I8 separation):

```kairos
# eval: 2026-01-01..2026-04-01
@JP
everyDay |> within(month) |> last
#=> 2026-01-31 2026-02-28 2026-03-31
```

The last day of the week (Sunday under `wkst: Mon`):

```kairos
# eval: 2026-01-05..2026-01-26
@JP
everyDay |> within(week) |> last
#=> 2026-01-11 2026-01-18 2026-01-25
```

## Pitfalls

- Leap years are handled by the calendar system's value expression (`isLeap`) — February's `last`
  automatically returns the 28th in a common year and the 29th in a leap year ("leap is a value,
  not a window"; spec §3.6).
- "3 business days before month-end" cannot be written with `last` alone — nudge onto a business
  day with `roll(Preceding, on: bizDay)`, then `shift(-3, unit: bizDay)`
  ([representative example §7.1](../spec/90-examples.md)).

## Related

[`first`](first.md) · [`nth`](nth.md) · [`roll`](roll.md) · [`shift`](shift.md) · public boundary
words (spec §3.6).
