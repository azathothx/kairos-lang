---
source_sha: 22d9cbe5befe
---

# Kairos Language Specification — Appendix A. Firing Layer Profile (the contract for conformant implementations)

> Translated from the canonical Japanese appendix [spec/60-firing-layer-profile.md](../../spec/60-firing-layer-profile.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

This document is an appendix placed in the specification tree; it is not part of the normative text (§1–7). **It is a contract, in prose only, that defines what a Kairos-conformant firing layer satisfies.**

The language has only definition and evaluation (§1.4); execution and state are the firing layer's responsibility (§7.8). This document makes that boundary
concrete with what was learned from the feedback reports (2026-07 to 2026-10) of a supply-side runtime that put the reference implementation into production.

## A.0 What this document is

The language returns a sequence of instants. The firing layer executes that sequence and holds state. This document lets neither side cross that boundary.
Conformance has three levels.

- **MUST** — without it, do not call the implementation conformant.
- **SHOULD** — recommended. Record the reason when you deviate.
- **MAY** — optional.

The stance of this document.

- All the language asks of a firing layer is to read the observable surface — instants, interval annotations, the coverage summary, warnings, the version, and the fingerprint.
- The language has no vocabulary for the firing layer's mechanisms (timers, watermarks, idempotency, re-evaluation). The words added in response to feedback (the empty table, `external`, `at` — ADR-45, 46, 51) are expressions on the definition side; they bring no mechanism into the language.
- The shape of the firing layer is not prescribed. A converter that feeds instants into an existing launcher (cron, systemd, a task scheduler), a timer of its own, or an implementation with its own evaluator — each conforms if it meets the conditions.
- The principle is "do not replace; make concrete". Launchers are mature; what breaks is the expression of the rule (a resident daemon that replaces cron is not the recommended shape).
- What this document protects is the floor of quality. Whoever builds it, it runs under the same conditions and emits the same signals.

Reading order: [§1.4 Scope](00-intro.md) → [§7.7–7.8 the general form of the division of labor](90-examples.md) → [§4.10 evaluation annotations and the coverage summary](30-body-layer.md) → this document.

- The canonical vessels: [`schema/cli-report.schema.json`](../../schema/cli-report.schema.json) and [`schema/supply.schema.json`](../../schema/supply.schema.json).
- The CLI sections: [`impl/README.md`](../../impl/README.md) (`--json`, `--supply`, `--explain`).
- The grounds for the decisions: [ADR-37](../../design/20-adr/adr-37-out-of-coverage-provenance.md), [ADR-45](../../design/20-adr/adr-45-empty-table-literal.md),
  [ADR-46](../../design/20-adr/adr-46-external-supply.md), [ADR-51](../../design/20-adr/adr-51-at-time-of-day.md),
  [ADR-53](../../design/20-adr/adr-53-binding-scope-memoization.md) (Japanese).

## A.1 The evaluation contract

The boundary with the language is the shape of `CliReport`. The evaluator may be called through the CLI or embedded, but the vessel handed across is this shape.

**The vessel**

- MUST: Receive evaluation results in the `CliReport` shape (`--json` of `list` / `next`). Required are `command` and `version`; on success also `tz`, `from`, `to`, `results[]`, `coverage[]`, `warnings[]` (each item of `results[]` has `source`, `line`, `uid`, `dates`, `points`, `annotations`).
- MUST: The identity of an instant is `points` (epoch ms), and intersections are computed in epoch ms as well. `dates` are their civil labels (read in `tz`; one-to-one with `points`), used for display and for matching (A.3).
- MUST: Receive errors as JSON too (`error.kind` is one of `usage`, `supply`, `static`). The firing layer uses this kind to decide what happens at boot (A.4).
- Note: The schema is revised only by backward-compatible additions (a promise on the language side).
- SHOULD: A strict validator with `additionalProperties: false` needs its local schema updated at every addition.
- SHOULD: Operational extensions (reconciliation results and the like) ride as CliReport plus extensions, without changing the meaning of existing fields.
- MAY: Attach `--explain` (`results[].stages`) to the materialization record.

**tz and the evaluation range**

- MUST: The tz for calendar computation is declared on the definition side (the premise's `tz:`) and never depends on the runtime's default tz. The sequence must not change when the runtime's TZ is unset.
- MUST: The evaluation range `[from, to)` is in whole dates and excludes `to`.
- Note: When tiling consecutive windows without gaps, use the next `from` = the previous `to` (because `to` is exclusive). In the overlapping re-evaluation shape (A.2), agreement on the overlapping interval is the check.
- MUST: Cutting at a time-of-day origin is not done with the evaluation range; do it in the expression (ordinal comparison via `epochOrdinal`) or in the firing layer (cut `points` at now). The evaluation range is "where to look", not "where to count from" (§7.8).

**Version**

- MUST: Record `version`. An implementation with its own evaluator declares which reference-implementation version it follows (the published version number or sha).
- MUST: When raising the version, compare the sequences before and after with the same definition, the same supply, and the same window, and count the differences before putting it into production.
- SHOULD: Language-neutral addenda (output-format additions and the like) do not affect an embedded evaluator. Read "the language is unchanged" in the [CHANGELOG](../../spec/CHANGELOG.md) (Japanese) to decide whether to follow.

**The identity key (1.0.9)**

- Note: `results[].uid` is the expression's fingerprint. It is computed with FNV-1a 64 from the position within results, the expression text, and the report's tz, and equals the UID of the recurring event in `.ics`.
- MUST: Do not use `uid` as a persistent ID (changing any of the expression text, the position, or the tz yields a different value). The firing layer treats its own record id as canonical and uses `uid` to judge "is this the same definition?".
- MAY: Use `uid` as the update key for events that do not go through `.ics`. If it becomes a component of the idempotency key (A.3), keep it attached to the firing layer's own record id (making `uid` alone canonical forks the key on a mere reordering of expressions, and already delivered events may be resent).

**When the firing layer has its own evaluator**

- MUST: Verdict identity. For the same input, return the same verdict (acceptance or rejection) and the same sequence as the reference implementation, adding no acceptance conditions or guards of your own.
- MUST: Copy the diagnostic wording as part of the specification too (down to the last sentence of the guidance). The wording check of the witnesses targets this wording.
- MUST: Check semantics against the doctests in [`reference/`](../reference/README.md) (`# eval:`, `#=>`, `#~>`) by matching expected values (an example without a `#~>` line asserts "zero annotations, zero warnings").
- SHOULD: Do not split the acceptance boundary from upstream. On finding an upstream defect, do not fix it ahead; place a witness that expects failure, report it, and follow the published version (when a difference is unavoidable, record it in code, tests, and the ledger, and resolve it with the upstream fix).
- SHOULD: Check transcription identity on the output (the same definition text can yield different output through evaluator differences). On a version update, compare every instant on identical input and confirm zero mismatches and zero `warnings`.
- SHOULD: If you keep a cache of your own, look it up by the language side's context key (the premise name in scope plus the eight preamble members — ADR-53 decision 4) with the evaluation range added, and never reuse a value for a reference whose key differs.
- Note: The evaluation range is a component this document adds for the firing layer's cache; it is not part of the language side's key (a resident evaluator also adds the resolved value's asof — ADR-46).

## A.2 Re-evaluation (rolling horizon)

Evaluate a bounded near-future window and re-evaluate it periodically, replacing the result. The language's determinism is what supports this operation.

**The bounded window and determinism**

- MUST: Forward materialization uses a bounded window `[today, today+H)`, and the same definition is re-evaluated periodically (daily or on data update) to replace the result. H is on the order of tens of days (for example, 45); never materialize a second- or minute-level grid in full.
- MUST (determinism): The same definition, the same evaluation range, and the same supply (the same asof) yield the same sequence. Verify by test that re-evaluation with a shifted window yields identical instants on the overlapping interval (§7.8).
- Note: For words that carry a phase (`stride`, `strideBy`, `take`), `from:` is always required on the language side ([glossary](50-glossary.md), [`reference/strideBy`](../reference/strideBy.md)). Because the phase never depends on the evaluation window, replacement with a shifted window is safe.
- SHOULD: If re-materialization leaves the firing plan unchanged, replace it silently; if it changed, record that as information.
- SHOULD: Settled re-evaluation of `next`. After a consumed instant, re-materialization advances to the next instant, and the same input returns the same next however many times it runs (how many times supply is resolved within one evaluation is outside the contract).
- SHOULD: With an embedded evaluator, moving the materialization origin toward the evaluation window is a conformant optimization. The conditions: the boundaries of a civil-width grid are derived from the window origin by tz projection, and when a backward-looking word (`Preceding`, `first`, and so on) demands ticks before the window, go back as far as demanded.

**The watermark and missed-fires**

- MUST (watermark): Keep "how far firing has progressed", and at boot and restart enumerate the unfired instants (missed-fires) from the watermark to now. The implementation may be the previous execution position or a lookback window (for example, 24 hours).
- Note: The enumeration uses an evaluation range distinct from the forward window. Take the downtime `[down, up)` of §7.8, pass it to the CLI as a date window (from the watermark's date to the day after today), and cut the returned `points` at the watermark and at now (the evaluation range is in whole dates — A.1).
- MUST: Never silently drop firings that fell in the downtime. Execute or record the enumerated missed-fires according to policy (execution is at-least-once — A.3).

**Timers and wake-ups**

- SHOULD: When the timer limit (about 24.8 days for JavaScript's `setTimeout`) is shorter than H, chain timers at the wake-up period (CAP). One chain per job removes contention, and the wake-up drives the daily re-materialization, the runway watch, and recovery from degraded operation.
- Note: Real-time re-evaluation (displaying remaining time, a countdown) is the responsibility of the firing layer or the application; the language has no trigger for re-evaluation. Count what remains by cutting `points` at now (the same cut as in A.1).

## A.3 Firing and idempotency

Firing is at-least-once; duplicates are absorbed by idempotency on the job side. No persistence of the plan is needed.

**At-least-once and claim**

- MUST: Firing (execution from a timer, re-execution of a missed-fire) is at-least-once. The firing layer need not have a layer that suppresses re-execution.
- MUST: Before a side effect that carries meaning (sending, registering), take a claim with the idempotency key, and do not send if already claimed. The ledger has one row per key (event × destination), and duplicates to the same destination are zero.
- MUST: A missed-fire goes through the same delivery path and the same idempotency key as a normal firing.
- SHOULD: Record the time the claim was taken separately from the mark of completed sending, so that on re-execution "claimed but not sent" can be told apart.
- SHOULD: Confirm the same job is not already running before calling the delivery path.
- SHOULD: Distinguish re-execution from resending. Re-execution = passing the instant and executing (idempotency prevents the double send); only resending is a special operation (re-execution after an audited deletion of the idempotency key).

**The idempotency key**

- MUST: The components are "the identity of the definition, the instant, the supply's asof". With multiple destinations, the destination is a component too.
- MUST: The identity of the definition is the firing layer's own record id (with `uid` as canonical, a mere reordering of expressions forks the key, and already delivered events may be resent — A.1).
- MUST: The instant component depends on the granularity. For a day-granular event (one instant per day) it is the civil day in the premise's tz; for an instant with a time of day (every full hour and the like) it is the instant itself (the epoch ms or the label in `dates[]`).
- Note: Folding instants with a time of day into a civil day collapses a day's firings onto the same key, and the second and later ones are dropped.
- MUST: asof is the version identifier (A.5). Why it is a component — when a supply update moves the date of the same event, the two are distinguished as separate deliveries (with the same asof no renotification happens, and the key does not interfere with other events' keys).
- SHOULD: Make the key explainable by its structure, and never write actual values (destination identifiers and the like) in documents or public logs.

**Matching instants**

- SHOULD: The key for matching a fired instant to a row of day-granular supply data (`dates`) is the civil day it belongs to in the premise's tz. Drop the now at firing time to a civil day in that tz, look up the row, and do not rely on ms equality (the evaluator's instants and the data rows come through different paths).
- SHOULD: Pin the definition side and the matching side to the same tz value, and never mix in the host's tz.
- SHOULD: When matching fails (no row for the day), do not swallow it; make it visible in words and end with zero deliveries.

**No persistence of the plan is required**

- Note: Plan-vs-actual reconciliation needs only "deterministic re-evaluation from definition + supply × the idempotency ledger" (demonstrated in the 2026-08 operational report; adopted as a condition here).
- SHOULD: Create no table on the plan side; the only thing persisted is the ledger (idempotency rows). Firing continues through re-evaluation of definition and supply, and extending the supply alone keeps firing going further ahead.
- Note: Attaching values to a fired instant (the correspondence of instant to payload, the calendar coordinates to display) is the responsibility of the firing layer and the supply side. The language stops at the sequence.

## A.4 Wiring the operational signals

The language returns danger as annotations, the coverage summary, and warnings. The firing layer wires them to monitoring and does not silence them.

**Runway → monitoring**

- MUST: Compare `coverage[].runwayDays` with a threshold, and when it falls below, raise a warning or start a data-fetch job (example threshold: H+30 days).
- Note: The runway is the number of days from the evaluation's `to` to the end of covering (not relative to today; may be negative; null when `concluded`). The origin is midnight of the day after the last covered day (the exclusive end; 2027-01-01 for the display `..2026-12-31`) — deriving it from the displayed end (the closed end) is off by one day. Keep it separate per source.
- SHOULD: The runway can be derived from covering and the evaluation's `to`. Make it possible to check the implementation's value against the derived one.
- SHOULD: The runway warning fires again at every materialization. Deduplicate in the ledger and in monitoring by (job, source, day).
- Note: Warnings go to monitoring; the remedy closes with a supply-side update. The permanent defense lies in updating the coverage, not in the shape of the expression.

**Interval annotations → warnings**

- MUST: Read `results[].annotations`, and treat a fired instant that falls in an annotation interval as "an event on unknown data". The default this document sets is "execute with a warning"; whether to hold it is an operational setting (the verdict lies outside the language — ADR-15, §4.10).
- SHOULD: Split the signal in two — "the now at evaluation falls in an annotation interval" (self-report) and "a planned instant falls in an annotation interval" (intersection warning). A missed-fire inside the coverage does not sound the intersection warning.
- Note: Absence of annotations is no proof of correctness (§4.10). Zero instants with the whole window annotated out-of-coverage is a signal of "out of range", not of "cannot evaluate".

**Supply failure → degraded operation**

- MUST: The only `error.kind` on which the boot check does not stop is `supply`. `static` (a defect of the definition — a lexical, syntactic, static, or evaluation error) and `usage` (a defect on the caller's side — arguments, files, or the `--supply` JSON itself) stop it.
- MUST: On `supply` (a supply resolution failure), do not stop: boot with an empty plan and retry at every wake-up (degraded operation).
- Note: In the reference implementation 1.0.10, `supply` covered only resolution failures (no supply arrives, no resolver) and a malformed `--supply` bundle (missing covering/asof and the like); the violations caught by the evaluator's contract checks (unordered values, points outside the coverage, length mismatch, non-existent dates, undeclared labels; ADR-46 decision 7) fell under `static`. **From 1.0.11 (addendum 28) these contract violations are `supply` too**, so everything that is the supplier's responsibility reports as `supply`.
- Note: `usage` is a failure before the evaluation runs, and nothing of the supply is missing. It is not a case for degraded operation (booting with an empty plan and retrying).
- MUST: Distinguish by type "nothing yet" (empty table + covering = a legitimate empty, zero instants, runway warning) from "resolution failed" (supply error), and make them readable apart in logs (ADR-45, ADR-46).
- SHOULD: During degraded operation keep the old snapshot, and record recovery (a successful materialization) as information.
- SHOULD (CAP > TTL): When the supply cache has a TTL and the implementation advances the expiry even on a failed refresh, make the wake-up period (CAP) longer than the TTL. Recovery happens at "the next wake-up" and "after the TTL expires", so breaking the inequality leaves the system stuck in degraded operation (measured in a forced verification in the 2026-07 operational report).

**Warnings**

- SHOULD: Collect `warnings[]`. `horizon-clip` is known behavior that does not affect the firing plan (ADR-37 decision 8), and its count depends on how the window is taken, so do not make it a monitoring threshold.
- SHOULD: The fix for `window-clip` is to widen the evaluation range (§7.8).
- Note: `next` does not report `window-clip` from its final re-evaluation (right end = the day after the last firing) — that end is derived from the answer, and an instant moved outside it cannot be among the N answers (`list` reports as before; reference implementation 1.0.12).
- SHOULD: Count and record operational signals (missed-fires, supply resolutions, horizon-clips, false alarms and misses).

**The signal ledger**

- SHOULD: One record per firing — the signal kind, the wall-clock time, the source (binding-name), the evaluation context (job), the runway value and threshold, the full warning text, and the action taken. Include the evaluation window (from/to) so that one record is self-contained.
- SHOULD: Forced verification (temporarily moving a threshold, a short covering, a deliberate supply failure) confirms "the mechanism works"; natural firing in production confirms "the operation runs". Treat them as different things, and send verification through the same log path as production.

## A.5 Supply

Expressions are static; data is resolved at run time. Supply is fixed once per evaluation.

**The static bundle and one resolution per evaluation**

- MUST: Pass the resolved values of `external` as a static bundle (per binding-name: `dates` or `instants`, `covering`, `asof`, optional `labels` = [`schema/supply.schema.json`](../../schema/supply.schema.json)). Leave the contract checks (containment in the coverage, ascending order, date existence, the label range) to the evaluator.
- MUST: One resolution per evaluation. Fix asof and source within one evaluation and never change them mid-evaluation (the resolved value's asof appears in the coverage summary).
- Note: The determinism of evaluation is stated under "the same asof".

**asof and covering**

- MUST: `asof` is a version identifier, used only for identity comparison, never ordered or read as a date ([§3.8](20-premise-layer.md#38-the-intake-for-data-table-literals)). Without an identifier that cuts versions, use the observation date `YYYY-MM-DD` (the `asof` of the supply schema).
- MUST: A premise that carries data declares `covering:` and `tz:`. Declare the outside of the coverage as "unknown", and never manufacture false comfort (an over-wide covering, abuse of open ends).
- SHOULD: Supply carries only intervals that can be closed. Close the yearly extension of the coverage on the supply side without changing the text of the user's expression (the `label:` projection of `segmentBy` and the like).
- Note: If a re-fetch before delivery changes asof, only the asof component of the idempotency key changes and no renotification occurs (the 2026-08 operational report). If asof changes after delivery, the claim passes under a new key and it is treated as a separate delivery (a consequence of the key's structure — A.3).

**The supply path**

- SHOULD: Put the continuity checks on supply (gaps, order) in the supply path. There are shapes where a single missing point in a label sequence silently changes the meaning.
- SHOULD: The value range of the supply contract follows the supply schema (`instants` are epoch ms, ascending, within ±8.64e15). The resolver returns a synchronous value (the reference implementation's `RunOptions.resolve`).

## A.6 Reconciliation (plan vs. actual)

Reconciliation is needed only for side effects that carry meaning. No table on the plan side.

- MUST: Reconcile plan against actual by matching deterministic re-evaluation against the idempotency ledger.
- MUST: Record three times apart — firing (when the timer woke), reservation (when the claim was taken), and completion of sending. When reporting an observed value, say which time it is.
- Note: The difference between the reservation time and the plan is an upper bound on the firing delay, on the premise that the timer never wakes before the plan.
- SHOULD: The scope is side effects that carry meaning (sending, registering) only. Log-only jobs are out of scope; a simple rotating log suffices.
- SHOULD: Carry a per-instant verdict (for example delivered, failed, partial, missing, future) and a summary as a CliReport extension.
- SHOULD: Choose one measurement basis and state it. The ledger's record time and the log line's time differ even for the same delivery.
- SHOULD: Observe production read-only, and record the collector's version. Write "confirmation of the mechanism (deduction)" and "statistical support (sample size)" separately.

## A.7 Observed examples

The language side's prototype measurements, and values recorded in the feedback reports from the supply side's runtime (its own evaluator, `external` supply, delivery of notifications). The supply side's proper names are withheld, and its values are cited in the frame "according to the supply side's records".

**The language side's prototype measurements (2026-07-09)**

- Re-evaluation with the window shifted by 3 days matched 30/30 instants on the overlapping interval. Every full hour within business hours 9–18 gave 50 instants a week.
- In the same prototype, a stop at 10:30 and a restart at 14:10 enumerated 4 unfired instants (11:00–14:00), and the firing instant on February 1 of the following year carried an out-of-coverage annotation and a runway.

**The supply side's production values** (the conditions: the production environment, one firing per event, not a benchmark)

- Determinism in production (2026-07-23): the firing plan announced by the materialization at boot 10 days earlier (the same boot recovered 9 missed fires) stayed unchanged through the following 10 days, including one restart and the recovery of 10 missed fires. Delivery was as announced and the delivery record is one row (claimed 1 / delivered 1).
- Idempotent claim (2026-08-07): on the first worker boot after the runtime migration, the firings inside the 24-hour lookback window were re-executed as missed fires (missed 1, execute true). The claim hit the idempotent row that had already been migrated: claimed 0 / delivered 0, no resend (the delivery record stays at one row).
- Continuity of determinism (2026-08-07 to 2026-08-23): for the 16 days after the migration, next stayed unchanged across 10 generations of container rebuilds on the same host. The evidence across hosts is one pair (one machine → one machine) at the migration itself.
- Two destinations (2026-09-07): one firing delivered to 2 destinations (claimed 2 / delivered 2). The delivery job ran 3 times that day; the remaining 2 re-executions were claimed 0 / delivered 0, and the delivery record stayed at 2 rows, one per destination.
- Deviation from plan (all are differences of "the time delivery was reserved"; firing is earlier, completion of sending later): +0.728 s (about 0.7 s, 2026-07-23), +15.958 s (2026-08-07), +0.032 s (2026-08-23), +0.037 s (2026-09-07, the first of the two destinations).
- Three timestamps (2026-10-23, the solar-term delivery, 1 destination): against the plan 07:00, firing +0.001 s, reservation of delivery +0.048 s, completion of sending +3.568 s (completion of sending includes the destination's response). The first sample in which the order firing ≤ reservation ≤ completion of sending was recorded in production. Runway 381 days, evaluation warnings 0, delivery record 1 row.
- Limits: for the values before 2026-10-23, each value is the record of one firing per event (the time delivery was reserved) and does not include the destination's response time. For the deviations before 2026-10-23, the value is the time delivery was reserved, and the time of firing was not recorded. For 2026-07-23, the materialization and delivery-completion logs remain only in the supply side's feedback report (the delivery-record row remains in the supply side's database).

## A.8 Self-declaration of conformance (checklist)

The list to attach when a firing layer calls itself "Kairos-conformant". Tick every MUST, and for each SHOULD you skip, write which and why.

**MUST**

1. Evaluation results are received in the CliReport shape, with `points` as the identity of instants (A.1)
2. Errors are received as JSON too, and `error.kind` decides what happens at boot (A.1)
3. tz is declared on the definition side and does not depend on the runtime's default tz (A.1)
4. The evaluation range is a half-open interval in whole dates (`to` excluded) (A.1)
5. Cutting at a time-of-day origin is not done with the evaluation range (A.1)
6. `version` is recorded, and sequences are compared before and after a version update (A.1)
7. `uid` is not used as a persistent ID (A.1)
8. An embedded evaluator satisfies verdict identity (including diagnostic wording) and the doctest check (A.1, where applicable)
9. A bounded window is re-evaluated periodically and replaced, and agreement on the overlapping interval is tested (A.2)
10. A watermark is kept, unfired instants are enumerated, and none is dropped silently (A.2)
11. Firing is at-least-once, a claim precedes the side effect, and the ledger has one row per key (event × destination) (A.3)
12. A missed-fire goes through the same delivery path and the same idempotency key as a normal firing (A.3)
13. The idempotency key's components include the identity of the definition (the firing layer's own record id), the instant (the civil day or the instant itself, by granularity), and asof (and the destination with multiple destinations) (A.3)
14. The runway is wired to threshold monitoring (A.4)
15. Intersections of fired instants with annotation intervals are handled (A.4)
16. The only `error.kind` that does not stop boot is `supply` (degraded operation); `static` and `usage` stop it (A.4)
17. "Nothing yet" and "resolution failed" are distinguished by type (A.4)
18. Supply is a static bundle, one resolution per evaluation, and asof is used for identity comparison only (A.5)
19. A premise that carries data declares covering and tz (A.5)
20. Plan-vs-actual reconciliation is deterministic re-evaluation × the idempotency ledger (A.6)
21. The three times — firing, reservation, completion of sending — are recorded apart (A.6)

**The minimal set of conformance tests (SHOULD)**

- Evaluating twice with a shifted window yields identical instants on the overlapping interval.
- Stop → restart enumerates the unfired instants, and idempotency prevents a resend.
- When the covering runs out, the runway signal is raised and reaches monitoring.
- An embedded evaluator matches the doctests' expected values. Witnesses are counted only after mutation (reverting to the regressed version, dropping the fix) has been seen to turn them red.

**The report template (SHOULD)**

- The environment: OS, runtime, the runtime's version, the runtime's default tz, and the reference-implementation version followed.
- Separate "evaluator measurements" from "production observations", and state what was not verified. Give the reproduction material in full, in a form that runs as-is on the reference CLI.
- Never revise a report after it has been sent; leave corrections as appended notes.

## A.9 Terms

| Term | Definition | See |
|---|---|---|
| firing layer | The implementation that interprets the language's sequence of instants and actually launches, executes, and manages. Outside the language's scope | §1.4, §7.8 |
| rolling horizon | The execution model that evaluates a bounded near-future window [today, today+H) and periodically re-materializes and replaces it | A.2 |
| materialization | Evaluating the definition over the evaluation window and settling the firing plan (missed and next). Runs at boot, daily, and on recovery | A.2 |
| watermark | The record of how far firing has progressed. Implemented as the previous execution position or a lookback window | A.2 |
| missed-fire | A firing instant that passed during downtime. Obtained by enumerating from the watermark to now. Goes through the same delivery path as a normal firing | A.2, A.3 |
| determinism | The same definition, the same range, and the same supply yield the same sequence. next does not change across environments | §7.8 |
| at-least-once | The guarantee that nothing is dropped. Duplicates are absorbed by idempotency on the job side | A.3 |
| idempotent claim | Taking a ledger row with the idempotency key before a side effect. Expressed as counts of claimed / delivered. One row per key (event × destination) | A.3 |
| idempotency key | The key built from the identity of the definition (the firing layer's own record id), the instant (the civil day or the instant itself, by granularity), and asof (and the destination with multiple destinations) | A.3 |
| uid | The expression's fingerprint, computed from position, text, and tz. Not a persistent ID | A.1 |
| runway | For each source in the coverage summary, the number of days from the evaluation's to to the end of covering. The origin is midnight of the day after the last covered day (the exclusive end) = deriving it from the displayed end (the closed end) is off by one day | §4.10 |
| interval annotation | An annotation interval of out-of-coverage origin. Runs alongside the result and attaches to non-empty results too | §4.10 |
| coverage summary | For each source referenced: covering, asof, the completion claim, the runway. Not clipped to the evaluation range | §4.10 |
| degraded operation | The state of booting with an empty plan on a supply resolution failure and retrying at every wake-up | A.4 |
| supply error | A resolution failure of external; with the CLI `--supply`, a malformed bundle counts too. A machine-readable subclass (error.kind is supply) | ADR-46 |
| legitimate empty | An empty table + covering. Materialization succeeds, zero instants, and the runway warning is raised | ADR-45 |
| CAP / TTL / H | The wake-up period / the supply cache's expiry / the evaluation horizon. Where a failed refresh still advances the TTL, CAP > TTL is the condition for recovery | A.2, A.4 |
| horizon-clip / window-clip | The warning for crossing the implementation horizon / the warning for an instant inside the evaluation range moved outside by a stage | §7.8, ADR-37 |
| one resolution per evaluation | Resolving supply exactly once per evaluation and fixing asof | A.5 |
| static bundle | The bundle that passes external's resolved values in the shape dates/instants, covering, asof, labels | A.5 |
| reconciliation | Matching deterministic re-evaluation against the idempotency ledger. Needed only for side effects that carry meaning | A.6 |
| the three times | Firing, reservation (claim), and completion of sending. Say which one an observed value is | A.6 |
| transcription / following | Moving the reference implementation into an evaluator of your own, and tracking the published versions | A.1 |
| verdict identity | Returning the same verdict (acceptance or rejection), sequence, and diagnostic wording as the reference implementation. No guards of your own | A.1 |
| signal ledger | The record that keeps operational signals, one record per firing | A.4 |
