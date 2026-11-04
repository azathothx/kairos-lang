---
source_sha: a964344e0141
---

# `labelOrdinal` — the ordinal of a label within its declared value domain

> Translated from the canonical Japanese page [reference/labelOrdinal.md](../../reference/labelOrdinal.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: projection (value expression, body-layer core) / **Signature**:
`labelOrdinal(B, x) : label value -> number` (point form `labelOrdinal(B, d) : point -> number`) /
name settled (ADR-54, 2026-10-19, spec §5.4) / **the additive extension of 1.1**

## Meaning

Returns **the position** of label value `x` within the **value domain** (the enumeration of labels)
that binding `B` declared (**1-based**, in declaration order). `labelOrdinal(weekday, Sun)` is 7;
`labelOrdinal(saku, m3)` is 3. A label is a string value, and its identifier form and string form
are the same value (`m3` and `"m3"`; spec §5.5).

Only the **three declared-list forms** serve as a domain:

| Source of the domain | How it is written | Reading it |
|---|---|---|
| `labels:` of `external` | `saku = external(kind: dates, labels: [m1, …, m12])` | `labelOrdinal(saku, m3)` → 3 |
| the window binding `cycle` | `weekday = day cycle [Mon, …, Sun] anchor: …` | `labelOrdinal(weekday, Sun)` → 7 |
| `labels: cycle` of `segmentBy` | `sekkiMonth = … labels: cycle [寅, 卯, …] anchor: …` | `labelOrdinal(sekkiMonth, 卯)` → 2 |

The semantics is a single definitional equation — `labelOrdinal(B, v) ≡ v == E₁ ? 1 : … : v == Eₙ ? n : ⊥`.
The right-hand side folds the nested conditional that 1.0 value expressions alone could write (the former
canonical form); the one difference is that **the default branch is ⊥ = the explicit error "outside the
value domain"**.

A domain that is a list of numbers or booleans (`labels: cycle [10, 20, 30]`) returns positions in the same
way — a domain is a list, and no type is treated specially (ADR-54 decision 5).

The **point form** `labelOrdinal(B, d)` abbreviates `labelOrdinal(B, B(d))` — point `d` is first turned
into a label by the binding-name projection `B(d)`, and the ordinal of that label is returned. The
out-of-coverage annotations (spec §4.10) and the tz-name check (ADR-40) are those of `B(d)`, applied
as they are; the word itself produces no annotation.

## Examples

**Weekday numbers** — the list order of the `weekday` cycle (Mon=1 … Sun=7). Independent of `wkst`
(Sunday is 7 even under `wkst: Sun`. "Which day of the week" is [`ordinalIn`](ordinalIn.md)`(day, week, d)`,
where under `wkst: Sun` Saturday is 7):

```kairos
# eval: 2026-01-01..2026-01-20
premise US { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Sun }
@US
everyDay |> filter(d => labelOrdinal(weekday, d) == 7)
#=> 2026-01-04 2026-01-11 2026-01-18
```

**A `labels: cycle` domain** — solar-term months (the window of Risshun is the Tiger month). The Hare
month 卯 = the second in declaration order:

```kairos
# eval: 2026-02-03..2026-03-07
@JP
setsu = [2026-01-05, 2026-02-04, 2026-03-05, 2026-04-05] covering: 2026-01-05..2026-04-05
sekkiMonth = everyDay |> segmentBy(setsu, edges: drop, empties: error,
                                   labels: cycle [寅, 卯, 辰, 巳, 午, 未, 申, 酉, 戌, 亥, 子, 丑]
                                   anchor: 2026-02-04)
everyDay |> filter(d => labelOrdinal(sekkiMonth, d) == 2)
#=> 2026-03-05 2026-03-06
```

**An `external` domain — rokuyō (大安)**. The new-moon data arrives together with lunisolar month-name
labels (`m1`–`m12`) ([`external`](external.md); the `# resolve:` line is the doctest's resolver fixture).
The month number is read from the domain with `labelOrdinal(saku, …)`, and the rokuyō is
`(month number + lunar day) mod 6` (0 is 大安; stdlib/kyureki.md §5):

```kairos
# eval: 2026-02-17..2026-03-19
# resolve: saku = dates 2026-01-19 2026-02-17 2026-03-19 2026-04-17 2026-05-17 covering: 2026-01-01..2026-05-31 asof: 2026-09-03 labels: m12 m1 m2 m3 m4
premise L { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "moon/saku"
  saku  = external(kind: dates, labels: [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12])
  lunar = day |> segmentBy(saku, edges: drop, empties: keep, label: (p => saku(p)))
  rokuyoNo = d => (labelOrdinal(saku, lunar(d)) + ordinalIn(day, lunar, d)) mod 6
}
@L
everyDay |> filter(d => rokuyoNo(d) == 0)
#=> 2026-02-21 2026-02-27 2026-03-05 2026-03-11 2026-03-17
```

`lunar(d)` is a computed label from a `label:` lambda (it has no domain), so the ordinal is read from
the side that has one, `saku` — `labelOrdinal(saku, lunar(d))`. For the difference from the 1.0 way
of writing it (the 12-step conditional `monthLabelNo`), see "Using labels as numbers" on
[`segmentBy`](segmentBy.md).

## Pitfalls

- **Three ordinals, three uses**: [`ordinalIn`](ordinalIn.md) is the Nth within a frame window
  (**1-based**), [`epochOrdinal`](epochOrdinal.md) is the coordinate from the epoch (**0-based**), and
  `labelOrdinal` is the Nth within a value domain (**1-based**). List indexing `l[i]` stays 0-based —
  the round trip is `l[labelOrdinal(B, v) - 1] == v`.

- **A parallel label list is not a domain** — the static `labels: [12, 1, 2, 3]` of `segmentBy` and
  the `labels:` of a table literal are **assignment lists** in window or point order; declaration
  order is no ordinal there (`m1` can sit at position 2). Passing one is a guided static error. If you
  need numbers, write them into `labels:` directly (the stdlib/kyureki form) or subtract `epochOrdinal`s.

- **A `label:` lambda cannot be enumerated** — `labelOrdinal(lunar, d)` is a static error. Pass the
  side that has a domain (`labelOrdinal(saku, lunar(d))`).

- **A duplicate in the domain is a static error at the call** — the four-on-four-off
  `cycle [On, On, On, On, Off, Off, Off, Off]` stays legal as a label projection (no check is added
  on the declaration side), but its ordinals are not unique, so it cannot be read. The check runs when the call is evaluated
  (a call inside a `filter` predicate runs when a point flows — not at all on an empty stream; the out-of-domain check is the same). "Which day of the
  cycle" is a quantity of phase; write it as a difference of `epochOrdinal`.

- **Outside the domain is an explicit error** — a value the declaration does not have (the string form
  `"m13"`, a label of another domain) stops with "outside the value domain". The diagnostic shows the
  first 12 members of the domain (13 or more are cut off with ", …").

- **Two cases stop earlier** — an undeclared identifier form `m13` stops in name resolution as in 1.0,
  and a supply that delivers an out-of-domain label is stopped first by the `external` contract check.

- **A declaration that gained `m13`** is not "outside the domain" — the conditional silently turns it
  into the default branch's 12 (no warning), while `labelOrdinal` reads 13 correctly (the points
  change; it is not an error).

- **`labelOrdinal` is a reserved word** (words added in 1.1 or later, core and stdlib alike, make a
  same-named consumer-side top-level binding a guided static error; spec §4.8). It cannot be a label name either. The behavior of the
  1.0 words is unchanged.

## Related

[`ordinalIn`](ordinalIn.md) · [`epochOrdinal`](epochOrdinal.md) (the family of ordinals) ·
[`cycle`](cycle.md) · [`segmentBy`](segmentBy.md) (`labels: cycle`; the 1.0-compatible conditional form) ·
[`external`](external.md) (the `labels:` domain) · spec §4.9 · ADR-54.
