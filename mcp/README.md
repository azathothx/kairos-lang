# kairos-lang-mcp

An [MCP](https://modelcontextprotocol.io/) server for **Kairos**, the schedule definition language
(https://kairos-lang.org). It lets an AI client evaluate a schedule definition deterministically —
every firing in a range, or the next N — validate a definition, and read the descriptor reference.

The server is a thin wrapper over the reference implementation's CLI: the tools return exactly what
`kairos list --json` / `kairos next --json` print (the `CliReport`, schema at
https://kairos-lang.org/schema/cli-report.schema.json). Points are epoch milliseconds and are the
identity; `dates` are one-to-one civil labels. Out-of-coverage intervals come back as annotations,
never as silently dropped points.

## Install

Node.js 20 or later. The server speaks MCP over stdio.

> **Status: not on npm yet.** The first release of `kairos-lang-mcp` follows `kairos-lang` 1.0.7 by a few
> days (same version number). Until then, run it from this repository: `cd mcp && npm install && npm run build
> && npm test`, and point your MCP client at `node <repo>/mcp/dist/bin.js` instead of `npx -y kairos-lang-mcp`.
> (This note goes away when the package is published.)

```sh
npx -y kairos-lang-mcp          # start on stdio (what an MCP client runs for you)
npx -y kairos-lang-mcp --version
```

**Claude Code**

```sh
claude mcp add kairos-lang -- npx -y kairos-lang-mcp
```

**Claude Desktop** (`claude_desktop_config.json`) and other stdio clients:

```json
{
  "mcpServers": {
    "kairos-lang": { "command": "npx", "args": ["-y", "kairos-lang-mcp"] }
  }
}
```

## Tools

| tool | input | output |
|---|---|---|
| `kairos_list` | `source`, `from`, `to`, `tz`, `supply?`, `explain?` | `CliReport` for `[from, to)` — all firings, interval annotations, coverage summary |
| `kairos_next` | `source`, `tz`, `from?` (default: today in `tz`), `n?` (default 1), `horizonYears?` (default 10), `supply?`, `explain?` | `CliReport` for the next `n` firings; `found < requested` means fewer than `n` exist within the horizon (the CLI's exit code 2) |
| `kairos_validate` | `source`, `tz`, `supply?` | `{ok, version, diagnostics: [{kind, message}], expressions}` — lexing, syntax, static rules and premise resolution, without evaluating a range |
| `kairos_reference` | `word`, `lang?` | the reference page for one descriptor (`roll`, `within`, `nth`, `segmentBy`, …; `README` lists them) |

Resources: `kairos://llms.txt` (the language overview for AI readers) and
`kairos://reference/{ja|en}/{word}` (the same pages as `kairos_reference`).

### `tz` is required

The CLI defaults to the machine's time zone; an AI caller has no machine, so every evaluating tool
takes `tz` (an IANA name such as `Asia/Tokyo`). It decides how labels and the `[from, to)` endpoints
are read. If the definition's premise declares `tz:`, evaluation uses that zone — `tz` still labels
the output.

**Recommended practice: define your premise once and keep it.** A premise names the calendar system,
the zone, the week start and the holiday tables:

```text
premise JP {
  calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  national = [2026-01-01, 2026-01-12, 2026-02-11, 2026-02-23, 2026-03-20, 2026-04-29, 2026-05-03..2026-05-06,
              2026-07-20, 2026-08-11, 2026-09-21..2026-09-23, 2026-10-12, 2026-11-03, 2026-11-23] covering: 2026..2026
  satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  bizDay = everyDay \ (satSun | national)
}

@JP
everyDay |> within(month) |> last |> roll(Preceding, on: bizDay)
```

Keeping that text next to your schedules turns tacit knowledge ("our business days") into explicit
knowledge that every call reuses — and the `covering:` clause makes the table's expiry visible in the
output (`runwayDays`) instead of letting it rot silently.

### Supply

`supply` resolves `external(kind: dates | instants)` bindings with a static bundle, exactly like the
CLI's `--supply`: `{ "binding" | "Premise.binding": { "dates": ["YYYY-MM-DD", …] | "instants": [ms, …],
"covering": "2026-01-01..2026-12-31", "asof": "2026-10-01" } }` — schema at
https://kairos-lang.org/schema/supply.schema.json.

### Errors

Errors are returned as data, not as protocol errors, so the model can read and fix them.
`kairos_list` / `kairos_next`: `{command, version, error: {kind: "usage" | "supply" | "static", message}}`
with `isError: true`. `kairos_validate`: `{ok: false, version, diagnostics: [{kind, message}]}` (a finding, not
an error — no `isError`). `kairos_reference`: `{error: {kind: "usage", message}, words}` with `isError: true`
for an unknown descriptor. `usage` is the shape of the call (bad zone, window over 10 years, source over 64 KB),
`supply` a violation of the supply contract, `static` anything the language reports about the definition
(lexing, syntax, static rules, evaluation). Diagnostics are in **Japanese** — the reference implementation's
canonical output language; the report itself is language-neutral JSON (the same as the CLI's `--json`).
The spec in English (https://kairos-lang.org/en/spec/) defines what each diagnostic means.

### Limits

Evaluation window at most 10 years; `n` at most 1000; `horizonYears` at most 10; `source` at most
64 KB. These guard against accidents, not against adversaries.

## Name

This package is `kairos-lang-mcp` — the MCP server for the schedule definition language at https://kairos-lang.org.
It is unrelated to other npm packages that carry the name Kairos (such as `kairos-mcp` or `kairos-mcp-server`), which
serve other projects that happen to share the word.

## Versioning

The server's version tracks `kairos-lang` (same number, same contract); it depends on
`kairos-lang` for evaluation and on `@modelcontextprotocol/sdk` for the protocol.

## License

Apache-2.0. The bundled reference pages and `llms.txt` are copies from the same repository.
