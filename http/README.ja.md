# kairos-lang-http（日本語）

**決めたら、いつでも。**  
<sub>Write the rule once; list the dates.</sub>

スケジュール定義言語 **Kairos**（https://kairos-lang.org）の、セルフホスト用の HTTP の殻です。
定義と範囲を JSON で受け、参照実装の評価結果をそのまま返します。状態を持ちません。

- 返すのは `kairos list --json` / `kairos next --json` の出力そのもの（`CliReport`。schema は https://kairos-lang.org/schema/cli-report.schema.json ）。
- 本文は CLI の `--json` の stdout と字面まで同じです（2 字下げ・末尾改行）。
- 当て先の関数・上限・エラー面は MCP サーバ [`kairos-lang-mcp`](../mcp/README.ja.md) と同じです。
- `points` は epoch ミリ秒で、点の同一性そのもの。`dates` は点と一対一の市民ラベル。表の外の区間は註釈で返し、黙って点を落としません。

English: [README.md](README.md)

## 起動

Node.js 20 以上。npm と GHCR への公開はまだしていません。リポジトリから組んで動かします。

```sh
git clone https://github.com/azathothx/kairos-lang.git
cd kairos-lang/http
npm ci && npm run build
node dist/bin.js                     # :8080 で待ち受ける
node dist/bin.js --version
PORT=3000 node dist/bin.js
```

Docker（同じ `http/` で。dist を先に作る）:

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

## インターフェース

| メソッドとパス | 入力（JSON 本文） | 出力 |
|---|---|---|
| `POST /v1/list` | `source`, `from`, `to`, `tz`, `supply?`, `explain?` | `[from, to)` の `CliReport`（全発火・区間註釈・被覆サマリ） |
| `POST /v1/next` | `source`, `tz`, `from?`（既定: `tz` の今日）, `n?`（既定 1）, `horizonYears?`（既定 10）, `supply?`, `explain?` | 次の `n` 回の `CliReport` |
| `POST /v1/validate` | `source`, `tz` | `{ok, version, diagnostics: [{kind, message}], expressions}`（MCP の `kairos_validate` と同じ） |
| `GET /v1/version` | なし | `{"kairosLang": "<評価器の版>", "shell": "<殻の版>"}` |
| `GET /healthz` | なし | `{"ok": true}` |

- 入力の意味は CLI と同じ。`from` を含み `to` を含まない。日付は `YYYY-MM-DD`。
- **`tz` は必須**（`Asia/Tokyo` のような IANA 名。前文の `tz:` と同じ値域なので、固定オフセットの正準形 `+09:00` と `UTC` も受けます）。実行機（コンテナ）の tz には依りません。定義の前文に `tz:` があれば評価はそちらを使い、`tz` はラベルに使われます。
- `supply` は CLI の `--supply` と同じ静的束（JSON オブジェクト）。schema は https://kairos-lang.org/schema/supply.schema.json 。**URL は受けません**（殻は外へ出ない。表の取得は呼び手の仕事）。
- 未知の鍵は `usage` のエラーです（黙って捨てない）。
- `next` で `found < requested` のときは、地平線の内に `n` 回が無かったことを意味します（CLI の終了コード 2 と同じ。状態は 200）。
- 応答はすべて `Content-Type: application/json; charset=utf-8`。

## 上限とエラー面

上限（事故を防ぐための上限。値は `kairos-lang-mcp` と同じ）:

| 項目 | 上限 |
|---|---|
| `source` | 64 KiB |
| 評価の窓（`to − from`） | 10 年 |
| `n` | 1000 |
| `horizonYears` | 10 |
| 1 つの `source` の本体式 | 100 |
| 本文 | 256 KiB |
| 応答の本文 | 32 MiB |
| 同時実行（評価の経路） | `KAIROS_HTTP_MAX_CONCURRENCY`（既定 4） |
| 1 要求の評価の時間 | `KAIROS_HTTP_TIMEOUT_MS`（既定 10 秒） |

エラーの本文は CLI `--json` のエラー面と同じ `{command, version, error: {kind, message}}` です。

| 状態 | いつ | 本文 |
|---|---|---|
| 400 | `usage`（tz が無効・実在しない日付・窓や `n` や本体式の数の超過・必須の欠け・型・未知の鍵・JSON の不正・応答が 32 MiB を超える）／`static`（定義の字句・構文・静的規則・評価） | `error.kind` が `usage` か `static` |
| 422 | `supply`（供給契約の違反・束縛の欠落） | `error.kind` が `supply` |
| 413 | 本文が 256 KiB を超える（`Content-Length` の宣言か流し込みの途中で直ちに。接続は閉じる） | `error.kind` が `usage` |
| 415 | `Content-Type` が `application/json` でない | `error.kind` が `usage` |
| 429 | 同時実行の上限（`Retry-After: 1`） | `{version, error}` |
| 504 | 評価が時間の上限を超えた（打ち切り） | `{version, error: {kind: "timeout"}}` |
| 404 / 405 | 未知のパス／メソッド違い（405 は `Allow` つき。GET の経路は HEAD も受ける） | `{version, error}` |
| 500 | 殻の内部の誤り・評価器の素の例外（ヒープ枯渇を含む） | `{version, error: {kind: "internal"}}`（`source` は含めない） |

- `/v1/validate` の所見（定義の誤り・tz が無効など）は要求の誤りではないので 200 と `{ok: false, diagnostics}`。本文の形の誤り（必須の欠け・JSON の不正・`Content-Type`）は 400／415 で、本文は同じ形。
- 診断文は**日本語**です（参照実装の正準の出力言語）。
- 応答にはすべて `X-Content-Type-Options: nosniff` と `Cache-Control: no-store` が付きます。
- MCP サーバ（`kairos-lang-mcp`）との違い: 引数の形の誤りは MCP では入力 schema が止めてプロトコルエラー `-32602`・未知の引数は黙って捨てる。HTTP は 400 `usage`。

## 評価の動き

- 評価は常駐の worker プロセス（`KAIROS_HTTP_MAX_CONCURRENCY` の数）で動きます。待ち受けは評価で止まらないので、評価中も `/healthz` は返ります。
- 1 要求の評価が `KAIROS_HTTP_TIMEOUT_MS` を超えると worker を止めて 504 を返し、worker を作り直します。前段（リバースプロキシ等）のタイムアウトはこれより長くしてください。
- 評価器がヒープを使い切ると、その worker だけが落ちて 500 になり、作り直します。殻のプロセスは落ちません（worker がスレッドでなくプロセスなのはこのためです。V8 のヒープ枯渇はスレッドでは隔離できません）。
- 同時実行の上限は「評価中の worker の数」です。本文の読み込み中は数えないので、遅い送信が評価の枠を握ることはありません（要求の読み込みは 30 秒・ヘッダは 15 秒で切ります）。

## 環境変数

| 名前 | 既定 | 意味 |
|---|---|---|
| `PORT` | 8080 | 待ち受けるポート |
| `KAIROS_HTTP_MAX_CONCURRENCY` | 4 | 評価の同時実行の上限＝常駐 worker の数。全部が評価中なら即 429 |
| `KAIROS_HTTP_TIMEOUT_MS` | 10000 | 1 要求の評価の時間の上限（ms）。超えたら 504 |
| `KAIROS_HTTP_WORKER_HEAP_MB` | （Node の既定） | worker 1 つのヒープの上限（MB＝`--max-old-space-size`）。超えた評価は 500 になり worker を作り直す。コンテナのメモリを worker の数で割った値を目安に |
| `KAIROS_HTTP_LOG` | `access` | `access`＝1 要求 1 行（メソッド・パス・状態・ミリ秒）を stderr へ。`off`＝書かない。本文（`source`）はどちらでも書かない |
| `KAIROS_HTTP_EVALUATOR` | （なし） | 評価器の読み込み元（`kairos-lang` のソース木のディレクトリ）。同居する参照実装で検査するためのもので、普段は設定しません |

## 持たないもの

- 状態・認証・課金・ログの保存・URL の取得。これらは前段（供給側の API 層など）が持ちます。
- CORS・ストリーミング・バッチ・gzip。

## 版

殻の版は `kairos-lang` に揃えます（同じ番号・同じ契約）。評価器は lock で固定した npm `kairos-lang` で、`/v1/version` の `kairosLang` がその版です。
イメージのタグは評価器の版です。同じ `kairos-lang` の版なら、CLI・MCP・HTTP で点列・可否・診断の文言が一致します。

## ライセンス

Apache-2.0。
