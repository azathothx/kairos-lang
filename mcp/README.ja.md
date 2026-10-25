# kairos-lang-mcp（日本語）

**決めたら、いつでも。**  
<sub>Write the rule once; list the dates.</sub>

スケジュール定義言語 **Kairos**（https://kairos-lang.org）の [MCP](https://modelcontextprotocol.io/) サーバです。
AI クライアントから、定義を決定的に評価できます（範囲内の全発火、または次の N 回）。定義の検証と、記述語のリファレンスの参照もできます。

このサーバは参照実装の CLI の薄い包みです。tool が返すのは `kairos list --json` / `kairos next --json` の出力そのもの（`CliReport`。schema は
https://kairos-lang.org/schema/cli-report.schema.json）です。

- `points` は epoch ミリ秒で、点の同一性そのものです。
- `dates` は点と一対一の市民ラベルです。
- 表の外の区間は註釈として返します。黙って点を落とすことはありません。

English: [README.md](README.md)

## 導入

公式 MCP Registry に `io.github.azathothx/kairos-lang-mcp` の名で登録済み（https://registry.modelcontextprotocol.io ・登録簿を読むクライアントはこの名で導入できる）。

Node.js 20 以上。サーバは stdio で MCP を話します。

```sh
npx -y kairos-lang-mcp          # stdio で起動（MCP クライアントが代わりに実行する形）
npx -y kairos-lang-mcp --version
```

**Claude Code**

```sh
claude mcp add kairos-lang -- npx -y kairos-lang-mcp
```

**Claude Desktop**（`claude_desktop_config.json`）とその他の stdio クライアント:

```json
{
  "mcpServers": {
    "kairos-lang": { "command": "npx", "args": ["-y", "kairos-lang-mcp"] }
  }
}
```

## tool 一覧

| tool | 入力 | 出力 |
|---|---|---|
| `kairos_list` | `source`, `from`, `to`, `tz`, `supply?`, `explain?` | `[from, to)` の `CliReport`（全発火・区間註釈・被覆サマリ） |
| `kairos_next` | `source`, `tz`, `from?`（既定: `tz` の今日）, `n?`（既定 1）, `horizonYears?`（既定 10）, `supply?`, `explain?` | 次の `n` 回の `CliReport` |
| `kairos_validate` | `source`, `tz`, `supply?` | `{ok, version, diagnostics: [{kind, message}], expressions}` |
| `kairos_reference` | `word`, `lang?` | 記述語 1 つのリファレンス（`roll`, `within`, `nth`, `segmentBy` …。`README` で一覧） |

補足:

- `kairos_next` で `found < requested` のときは、地平線の内に `n` 回が無かったことを意味します（CLI の終了コード 2 と同じ）。
- `kairos_validate` は字句・構文・静的規則・前文の解決までを検査し、範囲の評価はしません。
- リソース: `kairos://llms.txt`（AI 読者向けの言語概要）と `kairos://reference/{ja|en}/{word}`（`kairos_reference` と同じページ）。

### `tz` は必須

CLI の既定は実行機のタイムゾーンですが、AI の呼び手には「実行機」がありません。評価する tool はすべて `tz`（`Asia/Tokyo` のような IANA 名）を取ります。
`tz` はラベルと `[from, to)` の端をどう読むかを決めます。定義の前文に `tz:` があれば評価はそちらを使い、`tz` は出力のラベルに使われます。

**おすすめの運用: 前文を一度定義して持っておく。** 前文は暦法・tz・週の始まり・祝日の表を名前にします。

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

この文を予定の隣に置いておくと、「うちの営業日」という暗黙知が、呼び出しのたびに使える形式知になります。
`covering:` があるので、表の期限は出力の `runwayDays` に現れ、黙って腐ることがありません。

### 供給（supply）

`supply` は `external(kind: dates | instants)` の束縛を静的な束で解決します。CLI の `--supply` と同じです:
`{ "binding" | "Premise.binding": { "dates": ["YYYY-MM-DD", …] | "instants": [ms, …], "covering": "2026-01-01..2026-12-31", "asof": "2026-10-01" } }`。
schema は https://kairos-lang.org/schema/supply.schema.json です。

### エラー

エラーはプロトコルのエラーではなくデータとして返します。モデルが読んで直せるようにするためです。

- `kairos_list` / `kairos_next`: `{command, version, error: {kind: "usage" | "supply" | "static", message}}`、`isError: true`。
- `kairos_validate`: `{ok: false, version, diagnostics: [{kind, message}]}`。これは所見であってエラーではないので `isError` は付きません。
- `kairos_reference`: 未知の記述語なら `{error: {kind: "usage", message}, words}`、`isError: true`。

`usage` は呼び方の形（不正な tz・10 年を超える窓・64 KB を超える source）、`supply` は供給契約の違反、`static` は定義について言語が報告するもの
（字句・構文・静的規則・評価）です。診断文は**日本語**です（参照実装の正準の出力言語）。報告そのものは言語中立の JSON で、CLI の `--json` と同じです。

### 上限

評価の窓は最長 10 年、`n` は最大 1000、`horizonYears` は最大 10、`source` は最大 64 KB。事故を防ぐための上限で、攻撃への備えではありません。

## 名前について

このパッケージは `kairos-lang-mcp` で、https://kairos-lang.org のスケジュール定義言語の MCP サーバです。
npm には Kairos の名を含む別のパッケージ（`kairos-mcp` や `kairos-mcp-server` など）がありますが、別のプロジェクトのものです。

## 版

サーバの版は `kairos-lang` に揃えます（同じ番号・同じ契約）。評価は `kairos-lang`、プロトコルは `@modelcontextprotocol/sdk` に依ります。

## ライセンス

Apache-2.0。同梱のリファレンスと `llms.txt` は同じリポジトリの写しです。
