---
source_sha: de6a00385558
---

# `coincides` — the window-membership predicate

> Translated from the canonical Japanese page [reference/coincides.md](../../reference/coincides.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: projection (body layer §4.9; value function) / **Signature**:
`coincides(S, w, d) : point -> Bool` / name **settled** (2026-07-09, the F51 batch confirmation;
the compared candidates `hits`/`anyIn`/`sharesWindow` were not adopted)

## Meaning

Whether **at least one** point of stream `S` lies within the `w` window that point `d` belongs to
(a boolean). Where [`ordinalIn`](ordinalIn.md) **counts** within the containing window, `coincides`
asks whether something **is there** in the containing window — point → containing window → the
window's contents, the same skeleton as the projection family, bringing **bounded existential
quantification** into value expressions (ADR-38). The argument order is 〈subject, window, point〉,
isomorphic to `ordinalIn(u, w, d)` — but **the first argument is the family's only stream** (a
binding name, a qualified name, or a parenthesized inline expression. **Placing a window word at S
is a static error** — implicit demotion to the atomic point sequence is a trap that trivializes the
predicate to true. If a point sequence is intended, write `month |> first`). `w` is a window word
resolved in scope (partition-type and segmentBy windows both work; cycle names do not).

This is **the vessel for F68**: applying exception **days** to timed and mixed schedules cannot be
written with the equality combinators ([`snapTo`](snapTo.md) crushes the firing time) — an explicit
means of joining by **membership** is needed. Being a value predicate, it composes freely with
`not`, `and`/`or`, and other projections ("exclude holidays, but keep Fridays" =
`not coincides(holidays, day, d) or weekday(d) == Fri`).

## Example (the canonical form of F68: drop ad-hoc closure "days" from a 9:00 every-business-day notification)

The 9 o'clock tick is **wall clock** (stepping by a civil-time width. ADR-38 revised — the old form
`shift(+9, unit: hour)` has elapsed-time semantics and drifts from the wall clock on DST transition
days, so it was demoted from canonical; it remains the explicit form when "9 elapsed hours later"
is the intent). Exclusion is judged by `coincides` on "day" membership (the firing time 09:00 is
preserved):

```kairos
# eval: 2026-01-05..2026-01-10
premise Cal {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  satSunC = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  nonWorking = satSunC
}
premise Biz {
  calendar-system: Gregorian
  calendar: Cal
  tz: "Asia/Tokyo"
  wkst: Mon
  nineTick = everyInstant |> strideBy(1d, from: 2026-01-01T09:00)
}
@Biz
closures = [2026-01-07] covering: ..
nineTick |> filter(t => coincides(bizDay, day, t) and not coincides(closures, day, t))
#=> 2026-01-05T09:00 2026-01-06T09:00 2026-01-08T09:00 2026-01-09T09:00
```

**Where a day-aligned derived form stands, differencing in a preceding stage is plainer** (same
result. ADR-38 decision 8 — the necessity of coincides narrows to directly written tables, mixed
schedules, and irregular times):

```kairos
# eval: 2026-01-05..2026-01-10
premise Cal {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  satSunC = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  nonWorking = satSunC
}
premise Biz {
  calendar-system: Gregorian
  calendar: Cal
  tz: "Asia/Tokyo"
  wkst: Mon
  nineTick = everyInstant |> strideBy(1d, from: 2026-01-01T09:00)
}
@Biz
closures = [2026-01-07] covering: ..
bizx = bizDay \ closures
nineTick |> filter(t => coincides(bizx, day, t))
#=> 2026-01-05T09:00 2026-01-06T09:00 2026-01-08T09:00 2026-01-09T09:00
```

Note that if the entity declares its opening times, this very form collapses into the single
standard-derivation word [`bizOpen`](isOpen.md) (ADR-41 — ad-hoc closures go to the right-hand side
of `nonWorking`).

The intersection form is the same single word — "keep only the days that have a point of S" =
`filter(d => coincides(S, day, d))`. Difference and intersection are written apart by the presence
or absence of `not`. An example of the net gain in expressive power (execution-verified in
`impl/test/coincides.test.ts`):

```text
# leap-month detection — a lunisolar month containing no chūki (major solar term) is a leap month
# (doubles as the cross-check for the hand-maintained monthNos updates, F62)
lunarMonth |> first |> filter(p => not coincides(chukiDay, lunarMonth, p))
#=> 2025-07-25 (the first day of the leap sixth month)
```

## The witness rule — the three-way branch of determination (ADR-38 decision 4)

The criterion is always the **effective coverage** (the complement of the transported annotated
intervals; [table literals](table-literal.md)' `covering:`, ADR-37), never the raw covering:

- **true**: a point of S from an **unannotated interval** (= a **witness**) is in `d`'s window.
  ∃ is monotone — a witness's existence depends on no unknown data (no annotation needed).
- **out-of-coverage**: no witness, and the window intersects an annotated interval of S. Inside
  `filter`, the point is **dropped and annotated** — the annotation widens to the **whole** window
  that was read (F75, ADR-37 revision 2). In pure-value context, an explicit error classified
  out-of-coverage.
- **false**: the window lies entirely within the effective coverage (determining false depends on
  coverage completeness — the **asymmetry** with true is normative).

Points of the degenerate tail of `everyDay \ holidays` are **not witnesses** — no "confident true"
is built on top of holidays that may not exist (the consumer-side face of the rule "annotations
attach to non-empty results too").

## Pitfalls

- **A tz-name mismatch is a static error** (when S's alignment is a civil-time grid; width and
  phase stay unexamined — this is membership, so refinement is allowed). `coincides` is **chronos
  membership**, not membership by "the same date label" — for cross-tz, first unify the tz with
  [`rebase`](rebase.md), then feed coincides (F69 = settled by ADR-40). S with alignment "none"
  (timed, mixed) is legal, with no check.
- **For exception days between day-aligned streams the combinator remains right**
  (`schedule \ blackoutDays`). Rewriting to coincides grows a legal bypass of the alignment check —
  a **worsening**. The norm: same **point** — combinator (align a mismatch with snapTo); same
  **membership** (day) — coincides.
- A cycle name (`weekday`, etc.) cannot stand at `w` — a cycle is a label, not a window (ADR-21).
- A **window word** cannot stand at S (the implicit-demotion trap — if a point sequence is
  intended, make it explicit with `month |> first`). But a **specific instance's point sequence**
  is fine: a window-instance reference is the explicit demotion —
  `coincides(year(2020), day, d)` is legal (ADR-42; S is a stream-expecting position).
- If `d` belongs to no window of `w`, the error classifier applies (outside the effective coverage
  = out-of-coverage; inside = hard error. ADR-37 decision 6).
- Even if `d` belongs to a window, if that window is **stretched outside the marker coverage** (the
  side of a composite marker of the `openTick | closeTick` class whose one component's covering has
  run out), it is out-of-coverage — the window boundary itself is unknown, so before any question
  of witnesses, drop and annotate (a consequence of ADR-37 decisions 4/6. F82;
  ordinalIn/epochOrdinal/label projection behave the same).

## Related

[`filter`](filter.md) (the composition target) ·
[combinators](combinators.md) (the right road for equality membership) ·
[`snapTo`](snapTo.md) (aligning points) ·
[`ordinalIn`](ordinalIn.md) (the "counting" side of the same skeleton) · ADR-36/37/38 ·
F68/F69/F75.
