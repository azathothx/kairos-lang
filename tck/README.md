# 適合試験一式（TCK）

Kairos の評価器が「同じ言語を実装している」ことを、言語に依存しない JSON の束と走行器で確かめる。
読み手は自前の評価器を持つ実装者。根拠は言語仕様の[付録 A](../spec/60-firing-layer-profile.md) A.1「自前の評価器を持つ場合」の 3 つの MUST。

- 判定の同一性: 同じ入力に対し、参照実装と同じ可否（受理・拒否）と同じ点列を返す。
- 診断の文言も仕様の一部: 拒否の文言は参照実装の文言を写す。
- 意味論の照合: [`reference/`](../reference/README.md) の doctest（`# eval:`・`#=>`・`#~>`）の期待値一致で行う。

TCK はこの 3 つを、評価器の実装言語を問わずに機械検査する器。参照実装（[`impl/`](../impl/README.md)・npm `kairos-lang`）の CLI が返す CliReport の意味論だけを対象にする。
出力形式（`--tsv`・`.ics`・人間表示）と `--explain` は対象外。

## 何が束ねてあるか

束は 1 つの JSON [`kairos-tck.json`](kairos-tck.json)。頭に参照実装の版（`kairosLang`）と `impl/src`＋`impl/stdlib` の指紋（`implSha`）を 1 回だけ持ち、事例を `id` の順に並べる。
事例は 2 層。

**層 1＝doctest**。`reference/`・`stdlib/`・`design/40-examples/`・`recipes/`・`skills/kairos-authoring/` の ```` ```kairos ```` ブロックのうち `# eval:` を持つもの全部。
読み方は参照実装の doctest と同じ（`# eval: FROM..TO [tz: Zone]`・`@JP` なら標準前提を前置・`# resolve:` は供給）。

**層 2＝目録（manifest）**。手書きの事例 [`cases/`](cases/) と [`manifest.json`](manifest.json)。参照実装の witness から言語中立で意味のあるものを移した。
各事例の `origin` が出自の witness を指す。移したのは次の面。

- `error.kind` の 3 種（`usage`・`static`・`supply`）と文言。供給契約の違反 14 種と解決子なしを含む。
- 出口のラベル（`results[].labels`）。被覆サマリと残走路。
- `next` の確定再評価と地平線の警告。範囲外の註釈の輸送。

期待値は文書の `#=>` を写したものではない。参照実装で評価した CliReport から焼く。文書の期待値との一致は参照実装の doctest が担保する。

### 事例の形

語彙は [`schema/cli-report.schema.json`](../schema/cli-report.schema.json) と同じ。形の正本は [`schema/tck.schema.json`](../schema/tck.schema.json)（束全体と事例 1 件の両方を検証できる）。

| 項目 | 意味 |
|---|---|
| `id`・`layer`・`origin` | 識別子・層（`doctest`／`manifest`）・出自 |
| `command` | `list` か `next` |
| `source` | 定義の全文（評価器に渡す字面そのもの） |
| `from`・`to`・`tz` | 評価範囲と tz。tz は必ず明示＝実行環境の TZ に依存しない |
| `supply` | `--supply` に渡す束（external の解決値）。無ければ省略 |
| `n`・`horizonYears` | `next` の件数と地平線 |
| `expect` | 成功なら `results[]`（`points`・`dates`・`annotations`・`labels`・`uid`）・`coverage[]`・`warnings[]`。失敗なら `error`（`kind`・`message`） |

CliReport の `version`・`command`・`from`／`to` の写しは入れない。

## どう走らせるか

既定の評価器 `node impl/src/cli.ts` は TypeScript の型剥がしが要る＝Node 22.18 以上か 24 以降（`npx -y kairos-lang@<版>` なら不要）。

走行器 `tck/run.mjs` は Node 標準だけで動く（依存ゼロ）。評価器は外部コマンドとして呼ぶ。

```text
node tck/run.mjs --cmd "kairos"                          # 自前の評価器（PATH 上のコマンド）
node tck/run.mjs --cmd "npx -y kairos-lang@1.0.11"       # 公開版との版差を見る
node tck/run.mjs                                         # 手元の参照実装（node impl/src/cli.ts）
```

走行器は事例ごとに定義を一時ファイルへ書き、参照実装の CLI と同じ引数規約で評価器を呼ぶ。評価器はこの形を受け、stdout に CliReport の JSON を返せばよい。

```text
<cmd> list --json --from F --to T --tz Z [--supply s.json] file.kairos
<cmd> next --json --from F -n N --horizon H --tz Z [--supply s.json] file.kairos
```

| オプション | 働き |
|---|---|
| `--cmd "<評価器>"` | 評価器のコマンド。空白で語に割るので、空白を含むパスは `"…"` で囲む。省略時は手元の参照実装 |
| `--bundle <束>` | 束の JSON。省略時は `tck/kairos-tck.json` |
| `--only <接頭辞>` | `id` がこの接頭辞で始まる事例だけ（例: `doctest/reference/`・`manifest/supply-`） |
| `--list` | 事例の一覧だけを出す |
| `--json` | 結果を機械可読で出す |
| `--lenient-text` | text 段階の不一致を終了コードに数えない（件数は別に出す） |
| `--check-uid` | uid 段階も終了コードに数える |

終了コードは、数えた段階に不一致があれば 1、なければ 0。使い方の誤り（未知のオプション・合う事例が無い・束や評価器が読めない）は 2。不一致は事例 `id`・項目・期待・実測を並べて印字する。

## 何が MUST か（A.1 との対応）

照合は 3 段階。strict と text は A.1 の MUST、uid は参考。

| 段階 | 項目 | A.1 の根拠 | 既定 |
|---|---|---|---|
| strict | `points`・`dates`・`annotations` の区間（`fromMs`・`toMs`）と `source`・`covering`・`error.kind`・`labels`（有無と値）・`coverage` の `covering`／`concluded`／`runwayDays` | 判定の同一性（同じ可否・同じ点列）・doctest の期待値一致 | MUST |
| text | `error.message`・`warnings[]`・`asof` の字面 | 診断の文言も仕様の一部 | MUST（`--lenient-text` で別集計） |
| uid | `results[].uid` | 式の指紋（永続 ID ではない） | `--check-uid` のときだけ |

`coverage` は順序を問わず集合として比べる。`warnings` は出現順に比べる。`labels` は鍵の有無も比べる（添えない式に添えれば不一致）。

## 不一致をどう報告するか

- 走行器の出力をそのまま添える。`--json` の出力なら機械可読。
- 評価器の版、束の `kairosLang` と `implSha`、事例 `id`、段階、期待と実測が揃う。
- 文書の期待値と参照実装の挙動が食い違う疑いがあれば、直さず報告する（A.1 の SHOULD: 受理境界を上流と割らない）。
- 報告先は公開リポジトリ（GitHub `azathothx/kairos-lang`）の Issue。

## 束の版と再生成

- 束の頭の `kairosLang` が焼いた参照実装の版、`implSha` が `impl/src`＋`impl/stdlib` の指紋（Playground の `build-info.js` と同じ式）。
- 正本の保守者は、`impl/src` か doctest の文書を変えたら `node tck/build.mjs` で束を作り直す。生成は決定的（事例は `id` で整列・JSON は 2 空白・末尾改行）。

参照実装の witness `impl/test/tck.test.ts` が束を検査する。スキーマに通ること・全事例の自己適合・決定性・委ねた束が最新であること・層 1 の件数が doctest と等しいこと・走行器が赤を出せること。

自前の評価器の側は、追随する参照実装の版の束を使う。版を上げるときは同じ束で前後を比べ、差を数えてから反映する（A.1「版」）。
