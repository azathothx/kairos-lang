# kairos-lang-http

**決めたら、いつでも。**  
<sub>Write the rule once; list the dates.</sub>

A self-hosted HTTP shell for **Kairos**, the schedule definition language (https://kairos-lang.org).
It takes a definition and a range as JSON and returns the reference implementation's result as is. It keeps no state.

- The response is exactly what `kairos list --json` / `kairos next --json` print (the `CliReport`, schema at https://kairos-lang.org/schema/cli-report.schema.json).
- The body is byte-identical to the CLI's `--json` stdout (two-space indent, trailing newline).
- The functions, limits and error surface are the same as the MCP server [`kairos-lang-mcp`](../mcp/README.md).
- Points are epoch milliseconds and are the identity; `dates` are one-to-one civil labels. Out-of-coverage intervals come back as annotations, never as silently dropped points.

日本語: [README.ja.md](README.ja.md)

## Run

Node.js 20 or later. The shell is not published to npm or GHCR yet; build it from the repository.

```sh
git clone https://github.com/azathothx/kairos-lang.git
cd kairos-lang/http
npm ci && npm run build
node dist/bin.js                     # listen on :8080
node dist/bin.js --version
PORT=3000 node dist/bin.js
```

Docker (in the same `http/` directory; build dist first):

```sh
npm ci && npm run build && docker build -t kairos-lang-http .
docker run --rm -p 8080:8080 kairos-lang-http
```

```sh
curl -s localhost:8080/v1/list -H 'Content-Type: application/json' -d '{
  "source": "premise P { calendar-system: Gregorian; tz: \"Asia/Tokyo\"; wkst: Mon }\n@P\neveryDay |> within(month) |> last\n",
  "from": "2026-01-01", "to": "2026-04-01", "tz": "Asia/Tokyo"
}'
```

## Interface

| Method and path | Input (JSON body) | Output |
|---|---|---|
| `POST /v1/list` | `source`, `from`, `to`, `tz`, `supply?`, `explain?` | The `CliReport` for `[from, to)` (every firing, interval annotations, coverage summary) |
| `POST /v1/next` | `source`, `tz`, `from?` (default: today in `tz`), `n?` (default 1), `horizonYears?` (default 10), `supply?`, `explain?` | The `CliReport` for the next `n` firings |
| `POST /v1/validate` | `source`, `tz` | `{ok, version, diagnostics: [{kind, message}], expressions}` (same as MCP `kairos_validate`) |
| `GET /v1/version` | none | `{"kairosLang": "<evaluator version>", "shell": "<shell version>"}` |
| `GET /healthz` | none | `{"ok": true}` |

- Inputs mean what they mean in the CLI. `from` is inclusive, `to` exclusive; dates are `YYYY-MM-DD`.
- **`tz` is required** (an IANA name such as `Asia/Tokyo`; the same values as a premise `tz:`, so the canonical fixed offset `+09:00` and `UTC` are accepted too). The host's (container's) time zone is never used. If the definition declares `tz:` in its premise, evaluation uses that zone; `tz` still decides the labels.
- `supply` is the same static bundle (a JSON object) as the CLI's `--supply`; schema at https://kairos-lang.org/schema/supply.schema.json. **URLs are not accepted** (the shell never goes out; fetching tables is the caller's job).
- Unknown keys are a `usage` error (never silently dropped).
- In `next`, `found < requested` means fewer than `n` firings exist within the horizon (the CLI's exit code 2; the status is 200).
- Every response is `Content-Type: application/json; charset=utf-8`.

## Limits and errors

Limits (accident prevention; the values match `kairos-lang-mcp`):

| Item | Limit |
|---|---|
| `source` | 64 KiB |
| Evaluation window (`to − from`) | 10 years |
| `n` | 1000 |
| `horizonYears` | 10 |
| Body expressions per `source` | 100 |
| Body | 256 KiB |
| Response body | 32 MiB |
| Concurrency (evaluation routes) | `KAIROS_HTTP_MAX_CONCURRENCY` (default 4) |
| Evaluation time per request | `KAIROS_HTTP_TIMEOUT_MS` (default 10 s) |

Error bodies are the CLI `--json` error surface `{command, version, error: {kind, message}}`.

| Status | When | Body |
|---|---|---|
| 400 | `usage` (invalid tz, non-existent date, window / `n` / expression count over the limit, missing field, wrong type, unknown key, malformed JSON, response over 32 MiB) / `static` (lexing, syntax, static rules, evaluation) | `error.kind` is `usage` or `static` |
| 422 | `supply` (supply contract violation, missing binding) | `error.kind` is `supply` |
| 413 | Body over 256 KiB (answered at once from the `Content-Length` declaration or mid-stream; the connection is closed) | `error.kind` is `usage` |
| 415 | `Content-Type` is not `application/json` | `error.kind` is `usage` |
| 429 | Concurrency limit reached (`Retry-After: 1`) | `{version, error}` |
| 504 | Evaluation exceeded the time limit (cut off) | `{version, error: {kind: "timeout"}}` |
| 404 / 405 | Unknown path / wrong method (405 carries `Allow`; GET routes also accept HEAD) | `{version, error}` |
| 500 | Internal shell error, or a raw exception from the evaluator (including heap exhaustion) | `{version, error: {kind: "internal"}}` (never includes `source`) |

- Findings from `/v1/validate` (a wrong definition, an invalid tz, …) are not request errors: 200 with `{ok: false, diagnostics}`. A malformed body (missing field, broken JSON, `Content-Type`) is 400 / 415 with the same shape.
- Diagnostics are in **Japanese** — the reference implementation's canonical output language.
- Every response carries `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.
- Difference from the MCP server (`kairos-lang-mcp`): there, a malformed argument is rejected by the input schema as protocol error `-32602` and unknown arguments are ignored; here they are 400 `usage`.

## How evaluation runs

- Evaluation runs in resident worker processes (`KAIROS_HTTP_MAX_CONCURRENCY` of them). The listener never blocks on evaluation, so `/healthz` answers even while evaluations run.
- When one request's evaluation exceeds `KAIROS_HTTP_TIMEOUT_MS`, the worker is terminated, the response is 504, and the worker is replaced. Set any timeout in front (reverse proxy etc.) longer than this.
- If the evaluator exhausts its heap, only that worker dies (500) and is replaced; the shell process stays up (this is why workers are processes, not threads: a V8 heap exhaustion cannot be contained in a thread).
- The concurrency limit counts evaluating workers. Reading a request body does not count, so a slow sender cannot hold an evaluation slot (request reading is cut at 30 s, headers at 15 s).

## Environment variables

| Name | Default | Meaning |
|---|---|---|
| `PORT` | 8080 | Port to listen on |
| `KAIROS_HTTP_MAX_CONCURRENCY` | 4 | Concurrency limit = number of resident workers; when all are busy, 429 at once |
| `KAIROS_HTTP_TIMEOUT_MS` | 10000 | Evaluation time limit per request (ms); over it, 504 |
| `KAIROS_HTTP_WORKER_HEAP_MB` | (Node's default) | Heap limit per worker (MB, `--max-old-space-size`). An evaluation that exceeds it becomes 500 and the worker is replaced; the container's memory divided by the number of workers is a reasonable value |
| `KAIROS_HTTP_LOG` | `access` | `access`: one line per request (method, path, status, ms) to stderr. `off`: nothing. The body (`source`) is never logged |
| `KAIROS_HTTP_EVALUATOR` | (unset) | Where to load the evaluator from (a `kairos-lang` source tree). For testing against the co-located reference implementation; leave unset |

## What it does not have

- State, authentication, billing, stored logs, URL fetching. A layer in front (such as the supplier's API layer) owns these.
- CORS, streaming, batching, gzip.

## Versions

The shell's version follows `kairos-lang` (same number, same contract). The evaluator is npm `kairos-lang`, pinned by the lock; `kairosLang` in `/v1/version` is that version.
The image tag is the evaluator's version. With the same `kairos-lang` version, the CLI, MCP and HTTP agree on points, success and diagnostic text.

## License

Apache-2.0.
