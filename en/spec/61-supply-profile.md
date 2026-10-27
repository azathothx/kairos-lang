---
source_sha: 9b873f63eeb4
---

# Kairos Language Specification — Appendix B. Supply-Side Profile (the contract for those who publish tables)

> Translated from the canonical Japanese appendix [spec/61-supply-profile.md](../../spec/61-supply-profile.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

This document is an appendix placed in the specification tree; it is not part of the normative text (§1–7). Where Appendix A
(the [firing layer profile](60-firing-layer-profile.md)) is the contract for "the side that executes the sequence of instants",
this document is **the contract for "the side that publishes tables"**. It fixes the resolved value that `external`
([§3.8](20-premise-layer.md#38-the-intake-for-data-table-literals) · [ADR-46](../../design/20-adr/adr-46-external-supply.md)) receives at run time,
so that whoever builds it, it arrives in the same shape and passes the same checks.

## B.0 What this document is

The language owns the **shape** of a table and the **checks** on it. It does not ship tables. Data that rots by the year (holidays, solar terms,
new moons) is shipped by a supply side whose upstream is the institution that gazettes it.
This document tells the supply side: satisfy this, and the language's checks pass as they are.

The grades of conformance are the same three as in Appendix A.

- **MUST** = without it, a check fails or a signal on the consumer side breaks.
- **SHOULD** = recommended. Record the reason when you deviate.
- **MAY** = optional.

The stance of this document.

- The supply side builds one thing: the static bundle (the supply JSON). Nothing changes on the language side.
- What can be checked, the evaluator checks (shape, ordering, containment, date existence, the label range). What cannot be checked (the truth of covering, the correctness of asof, the correctness of the source) is written here as the supply side's responsibility.
- The means of delivery (HTTP, files, a database) is outside the language (ADR-15). This document does not prescribe the means; it uses delivery by URL as the example.
- No product or organization names. The contract is the same whoever publishes.

Read in this order: [§3.8](20-premise-layer.md#38-the-intake-for-data-table-literals) → [`reference/external.md`](../reference/external.md) → this document → A.5 of Appendix A.

- The canonical shape: [`schema/supply.schema.json`](../../schema/supply.schema.json).
- The CLI sections: [`impl/README.md`](../../impl/README.md) (`--supply`, `--tsv`, `--json`; Japanese).
- The grounds for the decisions: [ADR-37](../../design/20-adr/adr-37-out-of-coverage-provenance.md) · [ADR-45](../../design/20-adr/adr-45-empty-table-literal.md) · [ADR-46](../../design/20-adr/adr-46-external-supply.md) (Japanese).
- Where the line is drawn: [stewardship](../../design/75-stewardship.md) ("the language does not ship data that rots by the year"; Japanese).

## B.1 The shape of the deliverable (the static bundle)

One file is one bundle. Keyed by binding-name, it holds one table per key.

- MUST: The shape is `{ "<binding-name>": { … } }`. A key is the binding-name or `premise.binding-name` (the qualified key wins).
- MUST: Each table requires `covering`, `asof`, and exactly one of `dates` or `instants`.
- MUST: `dates` is a list of `"YYYY-MM-DD"`: civil days in the premise's `tz:`, ascending, no duplicates, and every date exists.
- MUST: `instants` is a list of integer epoch milliseconds: ascending, within ±8.64e15.

- MUST: `labels` is a parallel list of the same length as the points, and every element is a string, with values only from the range declared by `labels: [...]` on the declaring side (the declaration's `labels:` are identifiers, so numbers and booleans are not accepted). Never send labels to a binding that declares none.
- SHOULD: One table per file, with a file name that reveals the binding-name (`holidays` in `jp-holidays.json`).
- MAY: Several tables in one file (only when they share a source and an update cycle).
- MAY: For a table that carries times (solar terms, new moons), publish both a `dates` table and an `instants` table under different binding-names and file names (`sekki` and `sekkiAt`, say). The consumer can drop `instants` to days with `|> snapTo(day)`, so `instants` is the general form and `dates` the convenient one.

A holiday table.

```json
{ "holidays": {
    "dates": ["2026-01-01", "2026-01-12", "…", "2027-11-23"],
    "covering": "2026-01-01..2027-12-31",
    "asof": "2026-10-22" } }
```

A labelled table (solar terms). The declaring side writes `sekki = external(kind: dates, labels: [小寒, 大寒, 立春, …], source: "…")`.

```json
{ "sekki": {
    "dates":  ["2026-01-05", "2026-01-20", "2026-02-04"],
    "labels": ["小寒", "大寒", "立春"],
    "covering": "2026-01-01..2026-02-28",
    "asof": "2026-10-22" } }
```

- Note: Anchoring the text of `dates` to a date is the language's job. The supply side does not compute time zones (the consumer can re-anchor with a derived `tz:` override).
- Note: `instants` never use wall-clock text, because a DST overlap makes such text ambiguous (ADR-46, decision 8).

## B.2 covering = the completeness claim

`covering` is the claim "this range is complete". A day absent inside the range is read as "absent". Outside the range is read as "unknown", and the consumer sees an annotation.

- MUST: Every point lies inside `covering`. A point outside is a contract violation.
- MUST: Put only gazetted ranges into `covering`. Never include a year that has not been gazetted.
- MUST: Never widen `covering` to make "unknown" look like "absent". An over-wide covering silences the consumer's out-of-coverage annotation and runway.

- SHOULD: Cut at year boundaries (`2026-01-01..2027-12-31`). The year-only form `2026..2027` means the same.
- SHOULD: Do not use open ends (`..`, `2026-01-01..`) for holiday or solar-term tables. Carry only intervals that can be closed.
- SHOULD: Use several ranges (separated by `, `) only for a table with a missing year.
- SHOULD: A table that closes by the month (new moons with month numbers) is not cut at year boundaries: its covering runs **from the last new moon of the preceding year to the last day of the last closed month**. Do not include the month (at the year's end) whose next new moon and whose month-deciding major solar term are not yet gazetted. Never publish an estimated month number (the MUST "gazetted ranges only" outranks the year boundary).

- Note: "Nothing yet" is expressed as `dates: []` plus `covering`. It is a legitimate value: evaluation succeeds with zero points (ADR-45). A resolution failure is a different type.
- Note: The runway is the number of days from the evaluation's `to` to the end of covering (counted from the day after the last covered day, 00:00 = the exclusive end; A.4 of Appendix A). The consumer wires it to threshold monitoring (A.4 of Appendix A). When the supply's extension is late, this is where it turns negative.

## B.3 asof = the version identifier

`asof` is the name of a version. Only identity is compared. Neither order nor a date meaning is read from it.

- MUST: A non-empty string. Without an identifier that cuts versions, use the observation date `YYYY-MM-DD`.
- MUST: When the content changes, change `asof` too. Never produce two bundles with the same `asof` and different content.
- MUST: When the content does not change, do not change `asof` either. If only `asof` changes after delivery, the consumer may treat it as a separate delivery (A.3 and A.5 of Appendix A).

- Note: When the premise's static `asof:` (the version pin) differs from the resolved value's `asof`, the coverage summary shows "declared asof … differs" permanently. Nothing is overwritten silently.
- Note: Never serve different content under the same table name to different readers. If the content differs between free and paid, or inside and outside a key, use different names. This prevents two bundles with the same `asof` and different content.

## B.4 URLs and versions

Fix the place of delivery, and never delete a version once delivered.

- MUST: One fixed URL for the latest version of each table (for example `https://<publisher>/supply/jp-holidays.json`).
- MUST: Keep a URL per version (for example `https://<publisher>/supply/jp-holidays/2026-10-22.json`). An update never removes the old version's URL. This is for reproduction and audit.
- SHOULD: Make the latest URL an alias of a version URL. Do not hold the content in two places.

- SHOULD: Changes are additions only. Never alter a row of a year already delivered. The one exception is a correction of the gazette: make the correction date the new `asof` and leave it in the record. Dropping past years to keep a "current year only" table breaks this promise and the zero-deletion check of B.6 (4); keep them.
- SHOULD: `Content-Type: application/json`, CORS allowed, a short cache (about one day).
- SHOULD: In the same place, an `index.json` (the list of tables, source URLs, last update, next scheduled update) and one page for humans (sources, the extension promise, the rule for version URLs).

## B.5 How to extend

A table grows once a year. Publish the promise to extend, and cut a version when you do.

- MUST: Publish how many days after the source's gazette you extend (the supply side chooses the number).
- MUST: When extending, extend `covering` and set `asof` to the update date. Adding points and extending `covering` happen in the same version.
- SHOULD: Notify subscribers after extending (e-mail, RSS, the update date in `index.json`).
- SHOULD: Run the acceptance tests of B.6 before extending, and keep the record.
- SHOULD: On the page for humans, give the attribution the source asks for (such as "(C) 国立天文台" for the National Astronomical Observatory of Japan) and say where its terms of use are.

Sources, for Japan. The authority over a table belongs to the institution that gazettes it. Neither the language nor the supply side replaces it.

| Table | Source | When gazetted |
|---|---|---|
| National holidays | Cabinet Office, "National holidays" (国民の祝日について) | early February of the preceding year |
| Solar terms and new moons | National Astronomical Observatory of Japan, the almanac (暦要項) | February 1 of the preceding year (official gazette) |

## B.6 Acceptance tests

Four tests that pass with the language's deliverables alone (`npx kairos-lang` and `schema/supply.schema.json`). Run them before delivery and at every extension.
Below, the new version is `s.json` (covering 2026–2027, asof 2026-10-22), the old version is `old.json` (covering 2026 only), and the declaration is `check.kairos`.

**(1) Shape**: The bundle validates against `schema/supply.schema.json`. The CLI checks the shape at evaluation time, so a prior check can use any JSON Schema validator.

**(2) Contract**: The bundle passes the evaluator's checks. Pair the declaration with the table and evaluate the whole coverage.

```kairos
premise JP { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  holidays = external(kind: dates, source: "https://example.com/supply/jp-holidays.json") }
@JP
holidays
```

```text
npx -y kairos-lang list --supply s.json --from 2026-01-01 --to 2028-01-01 --tz Asia/Tokyo check.kairos
```

Expected: exit code 0. The points match the gazette. No `⚠ 範囲外` (out of coverage) appears. The coverage summary at the end reads
`JP.holidays covering 2026-01-01..2027-12-31 asof 2026-10-22 残走路 0 日` (runway 0 days).

**(3) The outside of the table is not silent**: Asking outside covering yields an annotation. If none appears, covering is too wide.

```text
npx -y kairos-lang list --supply s.json --from 2028-01-01 --to 2028-02-01 --tz Asia/Tokyo check.kairos
```

Expected: exit code 0. `# 0 点` (0 points), `# ⚠ 範囲外 2028-01-01..2028-02-01（JP.holidays covering 2026-01-01..2027-12-31, asof 2026-10-22）`, and a runway of `-31 日` (−31 days).

**(4) An extension is additions only**: The TSV diff between the old and the new version contains additions only, with zero deletions.

```text
npx -y kairos-lang list --supply old.json --from 2026-01-01 --to 2028-01-01 --tz Asia/Tokyo --tsv check.kairos > old.tsv
npx -y kairos-lang list --supply s.json   --from 2026-01-01 --to 2028-01-01 --tz Asia/Tokyo --tsv check.kairos > new.tsv
diff old.tsv new.tsv | grep -c '^<'      # expected: 0
```

- Note: Evaluating the old version yields `⚠ 範囲外 2027-01-01..2028-01-01` and a negative runway (`-365 日`). That is the normal picture "before extending".
- Note: (4) is meaningful only across an extension. Two versions of the same range just give 0 additions and 0 deletions, which checks nothing about the promise.
- Note: Check a labelled table through the `label` column of `--tsv` (1.0.12).
- Note: A contract violation exits with code 1. With `--json`, `error.kind` is `supply`.

Examples of contract violations (each exits with code 1). The diagnostics are the reference implementation's canonical output, which is Japanese.

| Violation | Diagnostic (beginning) |
|---|---|
| Out of order or duplicated | `契約違反: 解決値は昇順・重複なし` (ascending, no duplicates) |
| A point outside covering | `契約違反: 解決値の点が covering の外` |
| A date that does not exist | `契約違反: 実在しない日付` |
| kind mismatch | `契約違反: kind: dates の解決値は dates（"YYYY-MM-DD" の列）を運ぶ` |
| A label outside the declared range | `契約違反: 宣言値域の外のラベル` |
| Label count differs from the points | `契約違反: labels は時点列と同長` |
| Labels sent to a binding that declares none | `契約違反: labels 無宣言の external にラベルが来た` |
| `covering` or `asof` missing | `--supply s.json の "holidays": covering（文字列）が必須` (covering, a string, is required) |

## B.7 What the language ships and what it does not

| The language ships | The language does not ship |
|---|---|
| The canonical shape (the schema) and the evaluator's checks | The tables themselves (data that rots by the year) |
| This document and the acceptance-test procedure | Delivery infrastructure, URLs, caches |
| The bundled examples (`impl/examples/`) as sequences to compare against | Extension promises, notifications, billing, subscriber management |

What cannot be checked is the supply side's responsibility.

- The truth of `covering`: whether that range was really fetched in full.
- The correctness of `asof`: whether it changes only when the content changes.
- The correctness of the source: whether the values of the gazetting institution were copied faithfully.

## B.8 Self-declaration of conformance (checklist)

The list a supply side attaches when it says "conforms to the Kairos supply contract". Tick every MUST; for each SHOULD you skip, write which and why.

**MUST (shape)**

1. The bundle has the shape `{binding-name: {dates|instants, covering, asof [, labels]}}` and validates against the schema (B.1)
2. `dates` are civil days in the premise's tz, ascending, no duplicates, every date exists; `instants` are epoch ms, ascending (B.1)
3. `labels` are strings, as many as the points, within the declared range; none are sent to a binding that declares none (B.1)
4. Every point lies inside `covering` (B.2)

**MUST (operation)**

5. `covering` holds only gazetted ranges; no year that has not been gazetted (B.2)
6. `asof` is a non-empty string and changes only when the content changes (B.3)
7. A fixed URL for the latest version, and version URLs that never disappear (B.4)
8. The extension promise (how many days after the gazette) is published, and an extension updates covering and asof in the same version (B.5)
9. Acceptance tests (1)–(4) run before delivery and at every extension, with the record kept (B.6)

**SHOULD**

- One table per file. Cut at year boundaries. No open ends.
- Additions only. Corrections get a new asof.
- An `index.json` and one page for humans. Notification of subscribers.

## B.9 Terms

| Term | Definition | See |
|---|---|---|
| supply side | The side that builds and publishes the resolved value (the table) of `external`. It copies the values of the gazetting institution | B.0 |
| static bundle | The JSON that carries dates/instants, covering, asof, and labels per binding-name. Resolved once per evaluation | B.1 · A.5 |
| covering | The completeness claim. A point absent inside the range is "absent"; outside the range is "unknown" | B.2 · §3.8 |
| asof | The version identifier. Compared by identity only | B.3 · §3.8 |
| runway | The number of days from the evaluation's `to` to the end of covering (counted from the exclusive end = the day after the last covered day, 00:00). Negative means the coverage has run out | B.2 · §4.10 |
| out-of-coverage annotation | The annotation that runs alongside the result when the evaluation reaches outside covering | B.2 · §4.10 |
| contract violation | The state in which a resolved value fails the checks on shape, ordering, containment, existence, or labels. Exit code 1; `error.kind` is `supply` | B.6 · ADR-46 |
| supply error | A failure of resolution itself (no resolver, nothing fetched). The same `error.kind` as a contract violation, `supply` | A.4 · ADR-46 |
| legitimate empty | `dates: []` plus covering. Evaluation succeeds with zero points | B.2 · ADR-45 |
