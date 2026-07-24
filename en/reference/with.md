---
source_sha: f70a69297aef
---

# `with` — derived definition (overriding public words)

> Translated from the canonical Japanese page [reference/with.md](../../reference/with.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: derivation (premise-layer core) / **Signature**:
`Base with { w = … } : premise -> premise` / name settled (spec §5.4)

## Meaning

Builds a new premise on top of an existing one, **replacing or adding** only the public words you
name (the `premise → premise` closure). Fiscal calendars, organization-specific calendars, added
labels — all of these are this.

Name resolution is **Mechanism A** (ADR-17):

- **Bare names re-resolve in the derived scope** — inherited words that depend on an overridden
  word (`quarter`, `yearStart` on `year`) follow the new definition automatically.
- **`Base.word` pins to the base's value** — the explicit means when you deliberately want to fix
  on the original definition.

A derivation moves **only the window cuts**; calendar dates stay fixed (I1). 2026-03-01 remains
"March 1" under the fiscal calendar; only the **year window** it belongs to changes, to fiscal 2025
(Apr 2025–Mar 2026).

## Examples

A fiscal calendar (April start) is one line — it never touches `month`, so calendar dates and
month-ends stay fixed:

```kairos
# eval: 2025-01-01..2028-01-01
premise Fiscal = Gregorian with { year = month span (_ => 12) phase: 3 label: (p => yearNo(p)) }
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> within(year) |> first
#=> 2025-04-01 2026-04-01 2027-04-01
```

`quarter`'s inherited definition (`year split … by: month`) **automatically follows** the new
`year` and becomes the fiscal quarter:

```kairos
# eval: 2026-01-01..2027-01-01
premise Fiscal = Gregorian with { year = month span (_ => 12) phase: 3 label: (p => yearNo(p)) }
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> within(quarter) |> first
#=> 2026-01-01 2026-04-01 2026-07-01 2026-10-01
```

## Pitfalls

- A derivation **cannot be expanded** into the primitive (it is a new rule) — an asymmetry distinct
  from the sugar → core expansion (one-way) (spec §2.4).
- In a fiscal calendar, pins like `month = Gregorian.month` and cycle avoidance are **unnecessary**
  — thanks to the design in which `month` does not depend on `year` ("leap is a value, not a
  window") (spec §3.6/§3.7).
- The **numbering** of fiscal years (is fiscal 2025 the starting or the ending calendar year?) is a
  labeling question independent of where the windows are cut (the `label:` attachment expression;
  spec §4.9).

## See also

[`shiftBoundary`](shiftBoundary.md) (sugar over with) · [`span`](span.md) · [`split`](split.md) ·
Mechanism A (ADR-17) · I1.
