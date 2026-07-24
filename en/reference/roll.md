---
source_sha: 1741c115764a
---

# `roll` — nudge invalid points to valid ones

> Translated from the canonical Japanese page [reference/roll.md](../../reference/roll.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: point transform (body-layer core) / **Signature**:
`roll(conv, on: P) : Stream -> Stream` / name settled (spec §5.4)

## Meaning

If a point is not a **valid point** on axis `P`, it is nudged to a valid point according to the
convention `conv`. **Valid points do not move.** The operator at the core of "if a holiday, the
preceding business day" and "a holiday falling on Sunday substitutes to the next weekday".

Roll conventions are **axis-independent** (ADR-13) — the same system rides on business days and on
DST alike. The convention and the axis are mandatory arguments (I3: an operator that can land on an
invalid or absent point takes its resolution as a mandatory argument and never chooses silently by
default).

| Convention | Meaning |
|---|---|
| `Following` | to the next valid point |
| `Preceding` | to the previous valid point |
| `Modified` | takes an enclosing window as an argument and nudges while staying within that window (if it would cross the month, go to the opposite side. ADR-14) |

`on:` accepts, besides axis names, a **derived stream** passed as-is (ADR-26) — this becomes the
key to substitute holidays.

## Examples

Payday: the 25th of every month, or if a holiday the **preceding** business day (2026-01-25 is a
Sunday → Friday 1/23):

```kairos
# eval: 2026-01-01..2026-02-01
@JP
everyDay |> within(month) |> nth(25) |> roll(Preceding, on: bizDay)
#=> 2026-01-23
#~> 範囲外 2026-01-01..2026-01-02（holidays2026 covering 2026-01-01..2026-12-31, asof 2026-01-05）
```

Substitute holidays: nudge Sunday holidays forward on the **derived axis** "days that are not
holidays". It automatically leaps over the holiday run (5/4 and 5/5 are also holidays) and lands on
5/6:

```kairos
# eval: 2026-05-01..2026-06-01
@JP
statutory   = [2026-05-03, 2026-05-04, 2026-05-05] covering: 2026..2026
nonHoliday  = everyDay \ statutory
statutory |> filter(d => weekday(d) == Sun) |> roll(Following, on: nonHoliday)
#=> 2026-05-06
```

**Anonymous axes** (inline stream expressions) are accepted as well — a named-arg takes a
stream-expr (spec §5.6), and a derived stream has the same type as an axis (F7, ADR-26). "The last
Friday of the month" can be written without naming anything (a "good discovery" from the
implementation feedback's third batch, spelled out here as a guarantee):

```kairos
# eval: 2026-01-01..2026-03-01
@JP
month |> last |> roll(Preceding, on: (everyDay |> filter(d => weekday(d) == Fri)))
#=> 2026-01-30 2026-02-27
```

## Pitfalls

- `roll` never **thins** points (each point → one point). Thinning is [`filter`](filter.md)'s job.
- When several points nudge onto the same valid point, the duplicates fold (a stream is a set of
  points).
- If the axis is folded into the preamble, `on:` may be omitted (`roll(Preceding)` under
  `@JP axis: bizDay`. spec §3.3). The roll convention itself, however, is always written
  explicitly.
- Input and axis must **agree in alignment** (ADR-36, spec §4.5) — nudging a timed point sequence
  onto a daily axis is a static error (first conform explicitly with `snapTo(day)`). A calendar
  entity name may also stand directly at `on:` (`on: TSE`) (reinterpreted as the standard
  derivation. ADR-35).
- **Beware short axes** — passing `on:` a window-instance reference (`on: year(2020)`-class,
  ADR-42) or a table with a short covering makes the axis bounded, and **points with no landing
  point vanish without an annotation** (the rule-derived = coverage-complete side does not become
  "drop and annotate" — the roll row of ADR-37 decision 4). To narrow to a specific period, `&`
  **after** the roll is the safe form.

## Related

[`shift`](shift.md) (the same point-transform family — nudge or move), [`filter`](filter.md), I3,
ADR-13/14/21/26.
