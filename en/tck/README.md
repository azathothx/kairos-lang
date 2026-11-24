---
source_sha: 6e09c9d2f930
---

# Technology Compatibility Kit (TCK)

> Translated from the canonical Japanese page [tck/README.md](../../tck/README.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

The TCK checks that a Kairos evaluator "implements the same language", with a language-neutral JSON bundle and a runner.
It is written for implementers who have an evaluator of their own. The basis is the three MUSTs of
[appendix A](../spec/60-firing-layer-profile.md) A.1 "If you have an evaluator of your own" in the language specification.

- Identity of verdicts: for the same input, return the same acceptance or rejection and the same instants as the reference implementation.
- Diagnostics are part of the specification: the wording of a rejection is copied from the reference implementation.
- Semantic conformance is checked against the doctests of [`reference/`](../reference/README.md) (`# eval:`, `#=>`, `#~>`).

The TCK checks these three mechanically, whatever language the evaluator is written in. Its subject is only the semantics of the CliReport returned by the
CLI of the reference implementation ([`impl/`](../../impl/README.md), npm `kairos-lang`). Output formats (`--tsv`, `.ics`, human-readable output) and `--explain` are out of scope.

## What the bundle contains

The bundle is one JSON file, [`kairos-tck.json`](../../tck/kairos-tck.json). Its head carries the version of the reference implementation (`kairosLang`) and the fingerprint of `impl/src` plus `impl/stdlib` (`implSha`) once; the cases follow in `id` order.
There are two layers of cases.

**Layer 1 = doctest.** Every ```` ```kairos ```` block with a `# eval:` line in `reference/`, `stdlib/`, `design/40-examples/`, `recipes/` and `skills/kairos-authoring/`.
They are read the way the reference implementation's doctest reads them (`# eval: FROM..TO [tz: Zone]`; the standard prelude is prepended for `@JP`; `# resolve:` becomes the supply).

**Layer 2 = manifest.** Hand-written cases in [`cases/`](../../tck/cases/) and [`manifest.json`](../../tck/manifest.json), moved from the witnesses of the reference implementation where they are language-neutral and meaningful.
Each case's `origin` names the witness it came from. The following aspects were moved.

- The three `error.kind`s (`usage`, `static`, `supply`) and their wording, including 14 kinds of supply-contract violation and the missing-resolver case.
- Labels at the exit (`results[].labels`). The coverage summary and runway.
- The final re-evaluation of `next` and horizon warnings. The transport of out-of-coverage annotations.

The expectations are not copied from the `#=>` lines of the documents. They are baked from the CliReport the reference implementation produced. Agreement with the documented expectations is guaranteed by the reference implementation's own doctest.

### The shape of a case

The vocabulary is that of [`schema/cli-report.schema.json`](../../schema/cli-report.schema.json). The shape is defined by [`schema/tck.schema.json`](../../schema/tck.schema.json), which validates both the whole bundle and a single case.

| Field | Meaning |
|---|---|
| `id`, `layer`, `origin` | identifier, layer (`doctest` / `manifest`), provenance |
| `command` | `list` or `next` |
| `source` | the complete definition (the exact text handed to the evaluator) |
| `from`, `to`, `tz` | evaluation range and tz. tz is always explicit, so no case depends on the machine's TZ |
| `supply` | the bundle passed as `--supply` (resolved values of external); omitted when absent |
| `n`, `horizonYears` | count and horizon of `next` |
| `expect` | on success `results[]` (`points`, `dates`, `annotations`, `labels`, `uid`), `coverage[]`, `warnings[]`; on failure `error` (`kind`, `message`) |

The CliReport's `version`, `command` and the echoes of `from` / `to` are not repeated.

## How to run it

The default evaluator, `node impl/src/cli.ts`, needs a Node that strips TypeScript types: 22.18 or later, or 24 and later (`npx -y kairos-lang@<version>` needs nothing).

The runner `tck/run.mjs` needs nothing but Node (zero dependencies). The evaluator is invoked as an external command.

```text
node tck/run.mjs --cmd "kairos"                          # your own evaluator (a command on PATH)
node tck/run.mjs --cmd "npx -y kairos-lang@1.0.11"       # compare against a published version
node tck/run.mjs                                         # the local reference implementation (node impl/src/cli.ts)
```

For each case the runner writes the definition to a temporary file and invokes the evaluator with the same argument convention as the reference CLI. An evaluator has to accept this form and print the CliReport JSON to stdout.

```text
<cmd> list --json --from F --to T --tz Z [--supply s.json] file.kairos
<cmd> next --json --from F -n N --horizon H --tz Z [--supply s.json] file.kairos
```

| Option | Effect |
|---|---|
| `--cmd "<evaluator>"` | the evaluator command; split on whitespace, so quote a path that contains spaces (`"…"`); defaults to the local reference implementation |
| `--bundle <file>` | the bundle JSON; defaults to `tck/kairos-tck.json` |
| `--only <prefix>` | only the cases whose `id` starts with the prefix (e.g. `doctest/reference/`, `manifest/supply-`) |
| `--list` | list the cases and stop |
| `--json` | machine-readable results |
| `--lenient-text` | do not count text-stage mismatches toward the exit code (they are still counted separately) |
| `--check-uid` | count the uid stage toward the exit code as well |

The exit code is 1 when a counted stage has a mismatch, 0 otherwise, and 2 for a usage error (unknown option, no matching case, unreadable bundle or evaluator). Each mismatch is printed with the case `id`, the item, the expected value and the observed value.

## What is a MUST (correspondence with A.1)

Comparison has three stages. strict and text are the MUSTs of A.1; uid is informative.

| Stage | Items | Basis in A.1 | Default |
|---|---|---|---|
| strict | `points`, `dates`, the intervals of `annotations` (`fromMs`, `toMs`) with `source` and `covering`, `error.kind`, `labels` (presence and values), `covering` / `concluded` / `runwayDays` of `coverage` | identity of verdicts (same acceptance, same instants); doctest agreement | MUST |
| text | `error.message`, `warnings[]`, the wording of `asof` | diagnostics are part of the specification | MUST (`--lenient-text` counts them separately) |
| uid | `results[].uid` | fingerprint of the expression (not a durable identity) | only with `--check-uid` |

`coverage` is compared as a set, ignoring order. `warnings` are compared in order. For `labels` the presence of the key is compared too (adding labels to an expression that has none is a mismatch).

## How to report a mismatch

- Attach the runner's output as it is. With `--json` it is machine-readable.
- It carries the evaluator's version, the bundle's `kairosLang` and `implSha`, the case `id`, the stage, and the expected and observed values.
- If a documented expectation seems to disagree with the reference implementation, report it rather than fixing it locally (A.1 SHOULD: do not split the acceptance boundary from upstream).
- Reports go to the issues of the public repository (GitHub `azathothx/kairos-lang`).

## Bundle version and regeneration

- `kairosLang` in the bundle head is the version of the reference implementation the expectations were baked with; `implSha` is the fingerprint of `impl/src` plus `impl/stdlib` (the same formula as the Playground's `build-info.js`).
- Maintainers of the canonical repository rebuild the bundle with `node tck/build.mjs` whenever `impl/src` or a doctest document changes. Generation is deterministic (cases sorted by `id`, two-space JSON, trailing newline).

The reference implementation's witness `impl/test/tck.test.ts` checks the bundle: it validates against the schema, every case self-conforms, generation is deterministic, the committed bundle is fresh, the layer-1 count equals the doctest count, and the runner can go red.

An evaluator of its own uses the bundle of the reference version it follows. When moving to a new version, run the same bundle before and after and count the differences before adopting it (A.1 "Version").
