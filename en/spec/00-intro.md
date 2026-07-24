---
source_sha: 3006ab2c4930
---

# Kairos Language Specification — 1. Introduction

> Translated from the canonical Japanese chapter [spec/00-intro.md](../../spec/00-intro.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

## 1.1 What Kairos is

**Kairos** is a **schedule definition language** for general-purpose schedulers. From a continuous
time axis as its base (**Chronos**), it weaves the set of meaningful instants at which things should
fire (*kairos*) — the name comes from this pairing: in Greek, *chronos* is "flowing, continuous
time" while *kairos* is "the opportune, particular moment."

The language specializes in producing schedules (sequences of instants = time streams) and stops at
emitting that sequence. Interpreting the sequence — actually firing, registering, executing — is the
host runtime's responsibility and out of the language's scope (§1.4).

## 1.2 The problem it solves

Common schedulers cannot concisely express things like "N days before month-end" or "the Nth
business day (holiday-aware)". The only independent, standardized definition language is in effect
iCalendar RRULE (RFC 5545); everything else is a scheduler-specific cron dialect. All of them can
express "N *calendar* days before month-end" at best; none lets you write "the Nth *business* day"
inside an expression. Business-day handling is solved outside the language, with a two-layer bolt-on:
a "business-day calendar" object plus "skip / shift to next business day" flags.

The essential reason existing languages cannot fill this hole is not a missing feature — **their
expressions do not compose**. Neither cron nor RRULE has the closure property of "taking the dates
one rule derives and building the next definition on top of them." Kairos puts this **closure** at
its core (§2).

### Comparison with existing approaches — what works, what doesn't

✓ = expressible in the language/definition · △ = partial (hacks, add-ons, implementation-specific) ·
✗ = not expressible. Compared against POSIX/Vixie cron, Quartz's cron extensions (`L`/`W`/`#` plus
exclusion calendars), iCalendar RRULE (RFC 5545 + RFC 7529), and business schedulers in general that
pair a business-day-calendar object with before/after shift flags ("BDC products").

| Capability | cron | Quartz | RRULE | BDC products | Kairos |
|---|---|---|---|---|---|
| Fixed-time recurrence (daily at 9:00) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Nth weekday (2nd Monday) | △ (day/weekday OR trap) | ✓ (`#`) | ✓ (BYDAY + BYSETPOS) | ✓ | ✓ (`nth`, §4.3) |
| Month-end / N calendar days before it | ✗ (28–31 hack) | ✓ (`L`) | ✓ (BYMONTHDAY=-1) | ✓ | ✓ (`month \|> last \|> shift`) |
| Business days (holiday-aware) | ✗ | △ (exclusion = skip only) | ✗ (static EXDATE) | ✓ | ✓ (calendar entity + derived `bizDay`, §3.9) |
| Business-day **arithmetic** (Nth business day, 3 business days before month-end) | ✗ | ✗ | ✗ | △ (shift flags only) | ✓ (`roll` / `shift(unit: bizDay)`, §7.1) |
| **Deriving** holidays by rule (substitute holidays, citizens' holidays) | ✗ | ✗ | ✗ | ✗ (enumeration only) | ✓ (cascade, §7.5) |
| User-defined calendars (fiscal year, ISO week, lunisolar, solar terms) | ✗ | ✗ | △ (RFC 7529 RSCALE, rarely implemented) | ✗ | ✓ (premise layer = user-defined calendar systems, §3) |
| Composition / closure (derived dates feed the next rule) | ✗ | ✗ | △ (RDATE/EXDATE union/difference only) | ✗ | ✓ (every expression is stream → stream, §2.3) |
| Cross-timezone composition (Tokyo × NY joint business days) | ✗ | ✗ | ✗ | ✗ | ✓ (`rebase` + alignment checks, §4.4) |
| DST semantics | △ (implementation-defined — skips, double fires) | △ | ✓ (wall clock) | △ | ✓ (wall-clock declarations; gaps/overlaps are explicit errors, §3.6) |
| **Detecting** stale calendar data (freshness observability) | ✗ | ✗ | ✗ | ✗ | ✓ (`covering`, out-of-coverage annotations, runway, §4.10) |
| Determinism / audit (definition = set of instants) | ✗ (depends on current time) | ✗ | ✓ | △ | ✓ (extensional; missed fires enumerable) |
| Static checks against silent mistakes | ✗ | ✗ | ✗ | ✗ | ✓ (alignment, granularity, tz, mandatory declarations, §4.5) |

What Kairos deliberately does **not** do, and where each concern goes instead:

| Not covered | Where it goes |
|---|---|
| Firing, retries, execution management | The host runtime (firing layer) — the language stops at defining the set of instants (§1.4; the general division of labor with a diagram is §7.8) |
| **Feedback** on execution state ("every 5 hours since the last completion" as one infinite stream) | Decompose into a **pure next-fire computation from an injected instant** — expressible with current vocabulary (§7.7; only the feedback loop itself is out of scope) |
| Count-based termination (RRULE's COUNT=10) | Bound by evaluation range / `covering` (there is no "first N of a stream" selector — awaiting demand) |
| Guaranteeing the **authenticity** of calendar data | Provenance governance (`source:` / `asof:`) carries the evidence; the judgment is external (ADR-15) |
| Branching on runtime conditions (execution history, load) | Out of scope (push it to the firing layer, which injects it as an instant or as data) |

## 1.3 The design spine

- **The base Chronos is fixed** — a single absolute axis, independent of time zones. A TZ is a
  **mapping** from chronos to civil coordinates (a premise-relative projection anchor, ADR-33);
  every calendar system and granularity is a projection onto this axis. It is never relativized.
- **Calendar systems are free** — a calendar system is a user-definable window partition on top of
  the base; the Gregorian calendar is just one instance.
- **Closure** — every expression is time stream → time stream; derived results feed further
  expressions.
- **Two layers** — the premise layer (builds calendar systems and calendars; DDL-like) and the body
  layer (weaves schedules; DML-like).
- **Core family plus sugar** — the body layer is a minimal core family plus sugar that names
  compositions of it; sugar erases into core by expansion.
- **Premise-relative semantics** — the meaning of an expression is relative to its premises; names,
  too, resolve premise-relative.
- **Each symbol has exactly one role** — `|>` (stage connection), `.` (premise qualification),
  `|` (stream union).

## 1.4 Scope

**Included**: expressing schedule definitions (the language itself); generating time streams from
definitions; expressing business days, calendars, windows, and roll conventions.

**Not included**:

- **Firing and task execution/management** (interpreting the sequence to launch jobs, retries, state
  tracking). The language stops at defining the set of instants (the extension); interpreting that
  sequence and actually firing on Chronos is the host runtime's responsibility.
- Guaranteeing the authenticity of calendar data (judging the correctness of holiday /
  organization-holiday data; the language provides the socket to plug evidence into).
- Windows relative to an execution origin ("5 hours since the last completion" — anything depending
  on past execution results). Only the **feedback** loop is out of scope: computing the next fire
  from an injected instant is in scope (§7.7).
- Relativistic arbitration across multiple physical time axes (to preserve the uniqueness of the
  base).

## 1.5 Structure of this specification, and conventions

1. Introduction (this chapter)
2. Types and layers — the three types, the two-layer structure, closure, symbols
3. The premise layer — preamble, calendar-system definitions (primitive/derived), value expressions
4. The body layer — generators, windows, selectors, point transforms, combinators, filters, strides, sugar
5. Grammar and symbols — symbol table, operator signatures, naming status, lexis, EBNF
6. Glossary — an index for lookup (concept terms, descriptors, symbols, invariants; placeholder-marked)
7. Representative examples

**Conventions**: placeholder names are marked "（仮称）" — the only remaining placeholder is `shiftBoundary` (batch naming confirmation F51; §5.4).
The rationale for each design decision lives in the design records `20-adr/` (ADR-01 through 47) and
`10-domain-model.md`; this specification presents only the folded conclusions.
