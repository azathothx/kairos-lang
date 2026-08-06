---
source_sha: 6395277cfa8e
---

# 40-examples — Expressiveness studies (a sample book of known schedules)

> Translated from the canonical Japanese catalog
> [design/40-examples/README.md](../../../design/40-examples/README.md). The `source_sha` above
> records the source revision; a consistency check flags this page when the Japanese side moves.
> **The studies themselves are Japanese-only** — this page is the English index of what was
> verified and where the machine-checked evidence lives.

This is the working layer where we verified that Kairos can express **the known schedules users
actually want to write**, by writing them out one by one. It was part of RC (release-candidate)
preparation; the methodology is "write the explanation until the design tears" — the sample
write-ups themselves are the tear-detection instrument. This directory is a record of
exploration: the settled specification lives in [`spec/`](../../spec/README.md), and each settled
tear went into an ADR.

## Verdict scale

Each sample carries a three-valued verdict.

- **Expressible** — writable with the existing vocabulary.
- **Needs completion** — a structure or mechanism was missing; the gap was logged
  (`90-findings.md`) and fed the design.
- **Needs external data** — cannot be generated from periodic rules; requires authoritative
  data (astronomical ephemerides, official gazette, calendar books). The intake (table
  literals) overlaps with "needs completion".

Early studies were verified by expected-value comparison against publicly known dates
(Japan's 2026 holidays, lunar new year, solar terms…); astronomical expectations were checked
against **the official 2026 ephemeris of the National Astronomical Observatory of Japan**
(`95-reference-data.md` holds the primary data and comparison results). From study 05 onward,
the write-ups are executed directly as doctests by the reference implementation.

### Where the machine-checked evidence lives

| File | In-page verification | Machine checks |
|---|---|---|
| 01 Japanese holidays | Expected-value comparison (written before the implementation existed) | Core forms are executed by implementation tests — the holiday cascade (deriving the 5/6 substitute holiday and the 9/22 citizens' holiday) and payday in `impl/test/examples.test.ts` (spec §7.4/7.5); the business-day derivation is the doctest standard premise itself |
| 02 Sexagenary cycle, rokuyō, … | Expected-value comparison | Year cycle in `examples.test.ts` (§7.6); cycles in general in `cycle-labels.test.ts`; rokuyō/lunisolar in the `stdlib/kyureki` doctests (NAOJ new-moon data) |
| 03 Astronomical calendars | Expected-value comparison + **primary-data comparison** (`95-reference-data.md` = NAOJ ephemeris) | Solar terms, seasonal markers, lunar new year in stdlib guides and later studies' doctests |
| 04 Projection tear-out | Exploration record (settled form = an ADR) | Settled projections in `projections.test.ts` and the doctests of each reference page |
| 05–09 | **Doctests (living tests)** — fenced blocks with `# eval:` are scanned and executed by `impl/test/doctest.test.ts` | The write-ups are themselves tests (tithi, business hours, injected origins, backup generations, DST and width rules) |

## Files

| File | Subject |
|---|---|
| [01-jp-holidays.md](../../../design/40-examples/01-jp-holidays.md) | The complete set of Japanese national holidays (fixed dates, Happy Monday, equinoxes, substitute holidays, citizens' holidays, one-off Olympic moves) plus everyday schedules (payday, garbage collection, China's tiaoxiu) |
| [02-cycles.md](../../../design/40-examples/02-cycles.md) | Sexagenary stems and branches (day/year), the 60-cycle, rokuyō, ichiryū-manbai days |
| [03-astronomical.md](../../../design/40-examples/03-astronomical.md) | 24 solar terms, the lunisolar calendar, seasonal markers, lunar phases, Easter, ISO week numbers |
| [04-projections.md](../../../design/40-examples/04-projections.md) | Tear-out studies for the projection family (ordinalIn/labelOf/snapTo/epochOrdinal/label:) |
| [05-astronomical-calendars.md](../../../design/40-examples/05-astronomical-calendars.md) | Astronomy-derived calendar systems (tithi = executed; Islamic/Bahá'í/sunset-start days = desk study). ```kairos blocks run as doctests |
| [06-business-hours.md](../../../design/40-examples/06-business-hours.md) | Business hours and half-day closes; wall-clock vs elapsed-time dual semantics; band + witness patterns; DST transition days and overnight sessions, executed (multi-TZ examples use `# eval:`'s trailing `tz:`) |
| [07-injected-origin.md](../../../design/40-examples/07-injected-origin.md) | Decomposing "relative to the last run" (next-fire computation from an injected instant = the doctests behind spec §7.7, plus measured alignment errors for the wrong forms) |
| [08-backup-schedules.md](../../../design/40-examples/08-backup-schedules.md) | Multi-generation backups (daily incremental / weekly differential / monthly full, higher-tier suppression, decreasing start times = finite case-splits + combinators; 2 doctests) |
| [09-dst-widths.md](../../../design/40-examples/09-dst-widths.md) | DST and the width rules (`1d` = civil day vs `24h` = elapsed time, operationally verified; gap/overlap resolution of derived points; named times are strict, derived times follow conventions; 4 doctests and an accident-type → rule table) |
| [90-findings.md](../../../design/40-examples/90-findings.md) | The consolidated tear log (F1–F106) and its mapping onto completion mechanisms |
| [95-reference-data.md](../../../design/40-examples/95-reference-data.md) | Primary data from the NAOJ 2026 ephemeris (solar terms, moon phases, equinoxes) and comparison results |

## The verdict matrix (all elements)

| Calendar element | Verdict | Main dependency |
|---|---|---|
| Fixed-date holidays (New Year's Day, National Foundation Day, …) | Expressible | cycle label predicates, month cycles |
| Happy Monday holidays (Coming-of-Age Day, …) | Expressible | cycle label predicates (WKST-independent) |
| Vernal/autumnal equinox (gazette version) | Needs external data | table literals |
| Substitute holidays | Expressible | derived stream as the roll axis |
| Citizens' holidays (sandwiched) | Expressible | — (a practical use of intersection `&`) |
| Year-limited exceptions (Olympic moves) | Expressible | table literals, asof/source |
| Payday (25th, previous business day) | Expressible | — |
| Garbage collection (1st and 3rd Wednesday) | Expressible | — |
| China's tiaoxiu (swapped workdays) | Expressible | table literals, cascade subtraction |
| Sexagenary day cycle | Expressible | anchor = authoritative data |
| Sexagenary year cycle, hinoe-uma | Expressible | year-window cycles |
| The 60-cycle | Expressible but blunt | (cycle products replaceable by predicate composition) |
| Rokuyō | Needs completion + external data | in-window ordinals, window-label projection, lunisolar calendar |
| Ichiryū-manbai days (selected days) | Structure expressible | solar-term data, label projection, `in` |
| 24 solar terms | Needs external data | table literals, snapTo |
| Lunisolar calendar (new moons, month lengths, leap months) | Needs external data + completion | window labels, cross-layer rules |
| Seasonal markers (hachijūhachiya, nihyakutōka, higan) | Expressible given solar terms | range shifts enumerated |
| Lunar age and phases | Needs external data | bring in as events |
| Easter (Computus) | Value expressible; instant-lifting needs completion | point→value projection or value→instant lifting |
| ISO week numbers | Needs completion | window-label projection (same family as fiscal-year labels) |
| Every business day at 9:00 (wall clock) | Expressible | strideBy civil widths, coincides (06) |
| "One day later" vs "24 hours later" (across DST transitions) | Expressible | the two width literals `1d`/`24h` — the confusion is unwritable (09) |
| Business-hour bands + half-day close (11:30) | Expressible (verbose = sugar candidate) | segmentBy bands + witness pattern, timed tables (06) |
| Overnight bands (crossing midnight) | Expressible (attribution = repaired form) | two-stage witness pattern (06) |
| Multi-generation backups (suppression, receding start times) | Expressible | day-set subtraction, case-splits + combinators (08) |

**Summary**: no inexpressible *structure* was found. What was missing consolidated into three
groups: (1) **data intake** (table literals), (2) **the window→value projection family**
(in-window ordinals, window labels, snap), and (3) small value vocabulary. All of it fed the
design and is settled in the spec; the tear-by-tear record is `90-findings.md`.
