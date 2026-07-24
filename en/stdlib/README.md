---
source_sha: 1316fece6ccb
---

# The Standard Premise Library

> Translated from the canonical Japanese page [stdlib/README.md](../../stdlib/README.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

Commentary on the **transparent standard premises** bundled with Kairos. Transparent = not
language built-in magic: they are written in the same primitive-definition / derived-definition
syntax a user can write (`../spec/20-premise-layer.md`), so their contents can be read and swapped
out.

The language specification (`../spec/`) explains syntax and semantics and cites the standard
premises only as "examples"; the exhaustive contents of each premise (definition, each word,
scope) are this directory's charge.

Runnable examples (` ```kairos ` fences plus `# eval:` / `#=>`) are verified in full by the
reference implementation under the same doctest conventions as reference/ (the canonical text of
the conventions is [`../reference/README.md`](../reference/README.md)).

## Contents

- [Gregorian](gregorian.md) — the Gregorian calendar (a primitive-definition root).
  day/weekday/month/year/quarter, the public boundary words, the calendar-coordinate sugar
  (yearNo/monthNo/dayNo), the dependency direction (bottom-up; leap is a value), the separation of
  weekday and WKST, and scope.
- [Fiscal](fiscal.md) — the fiscal calendar (April start). The one-line `year` derivation,
  automatic tracking via mechanism A, fiscal-year numbering and fiscal month numbers, the variants
  (the US federal type, half-years) and what is out of reach. **Bundled with the language** (usable
  with no declaration).
- [ISOWeek](iso-week.md) — the ISO 8601 week calendar. The isoWeek/isoYear windows and the
  projections of week number, day-of-week, and ISO year. The equivalent transformation that stands
  on settled vocabulary alone, with no `label:` attachment expression (the F40 reduction), and its
  wkst independence. **Bundled with the language**.
- [Kyureki](../../stdlib/kyureki.md) (Japanese — data-heavy, not mirrored) — the Kyureki, the old
  Japanese lunisolar calendar. A data-dependent calendar system that cuts months at new-moon data
  (the NAOJ calendar bulletins 2025–2027, leap sixth month included), with the projections of
  Kyureki dates and rokuyō. Being a premise carrying data, it is **not bundled** (a worked
  instance of provenance governance = ADR-26).

## Future candidates

- The Japanese era calendar (era-name labels) and the like, as primitive / derived definitions.
