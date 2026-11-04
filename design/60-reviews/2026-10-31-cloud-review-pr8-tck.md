# 2026-10-31 機械レビュー（PR #8＝TCK 適合試験一式・9 件）

- 対象: PR #8（head dd6b41f＝当方の手直し後・base dfc191d・下書き・merge は 1.1.0 の公開後）。
- 器: 機械レビュー（非公開の指示書に従う読み手・約 25 分）。所見は PR #8 のコメント 1 件（逐語は下）。
- 重さ: MEDIUM 2（`next` の探索の結果〈found・requested・to〉を束に焼かず走行器も比べない＝偽の評価器が全件一致・tck/README 日英が doc-consistency の網の外）・LOW 7（照合の witness が points と warnings と uid だけ・object でない出力と束や --cmd の不備が stack trace・`--cmd` の引用規約・Node の版の条件・契約違反の数の文言・origin の指し先 7 件・文書の小さな不整合）。
- 処置: 9 件すべて枝に処置（下の表・2026-10-31・枝 aff0c7a）。985→987 テスト（(f-5)(f-6)）・束 264 件（manifest 60）。

## 処置の記録（2026-10-31）

| # | 重さ | 処置 | 検査 |
|---|---|---|---|
| 1 | MEDIUM | `toExpect` は `command === 'next'` のとき `requested`・`found`・`to` を期待に焼き、`compareCase` の strict で比べる。schema の success に任意鍵 3 つ | witness (f-5)＝found／requested／to を書き換える偽の評価器で `--only manifest/next-` が exit 1・`[strict] found`・`[strict] to` |
| 2 | MEDIUM | doc-consistency の CURRENT_DOCS に `tck/README.md` と `en/tck/`、source_sha と fence 同一性の列挙に `en/tck/` | doc-consistency 24 緑（en の source_sha は再焼き） |
| 3 | LOW | (b) の照合の変異を strict の全項目に（results.length・points・dates・annotations・labels・coverage） | item の列が 6 項目で一致 |
| 4 | LOW | `compareCase` は object でない出力を strict の不一致「CliReport の形でない」に。`main` は束の読み込みと評価器の生成を try で包み exit 2（1 行の文言＋使い方） | witness (f-6)＝`null` の評価器が exit 1・`--cmd ""` と無い束が exit 2 |
| 5 | LOW | witness の `--cmd` を `"…"` で引用。README 日英の `--cmd` の行に引用の規約 | (f-2)(f-3) は引用つきで緑 |
| 6 | LOW | README 日英「どう走らせるか」に Node の版の条件（22.18 以上か 24 以降・`npx -y kairos-lang@<版>` なら不要） | 文書 |
| 7 | LOW | 事例 `supply-date-format-invalid`（`2026/01/05`→「日付の形式が不正」）を層 2 に足し、文を「契約違反 14 種と解決子なし」に（日英） | 束 264 件・走行器 全件一致 |
| 8 | LOW | origin 7 件を実在の投げ口か it に（labels 欠落＝eval.ts の投げ口・covering 逆順＝F141 の枝・usage 2 件＝witness なしと明記・static 2 件＝「it の題は使い方エラーだが kind は static」） | witness (e)（origin 非空） |
| 9 | LOW | implSha の文言を `impl/src`＋`impl/stdlib` に・終了コード 2 を README 日英に・en の割れた箇条書きを詰める・llms.txt と impl/README に `tck.schema.json` | doc-consistency 緑 |

## 所見（投稿どおり・逐語）

機械レビュー（2026-10-30・head dd6b41f・base dfc191d）

検査の実測: `npm run typecheck` 緑・`npx vitest run` 985/985（42 ファイル）・`TZ=UTC npx vitest run` 985/985・`node scripts/check-test-count.mjs` 「実スイート 985＝入口 6 箇所」・`node tck/run.mjs`（サブプロセス経路・手元の参照実装）strict／text／uid とも 263 一致・exit 0（2 分 17 秒）。所見は候補を最小の入力で赤を実測してから載せた。推測は載せていない。

## 所見

| # | 重さ | 場所（ファイル:行） | 何が（期待と実測） | 再現（コマンドか入力） | 直し方の案 |
|---|---|---|---|---|---|
| 1 | MEDIUM | `tck/build.mjs:123-136`（toExpect）・`tck/run.mjs:56-73`（compareCase）・`schema/tck.schema.json:212-243` | `next` の事例で CliReport の `found`・`requested`・`to`（探索窓の終端＝最終発火日の翌日）を束に焼かず、走行器も比べない。目録の `next-*` 5 件のうち 4 件は出自の witness がまさにこれを主張している（`impl/test/cli.test.ts:90` `{requested:3, found:3, to:'2026-10-24'}`・`:118` found＜requested・`impl/test/window-clip.test.ts:108` `to:'2026-11-04'`・`:135` `{found:0, to:'2027-08-06'}`）。期待: これらを変えた評価器は strict で赤。実測: `found=99`・`requested=1`・`to='1999-01-01'`・`tz='UTC'` に書き換える偽の評価器で `--only manifest/next-` が **5/5 全件一致・exit 0** | 偽の評価器（参照実装を呼んで `next` の found／requested／to／tz を書き換えて stdout へ）を作り `node tck/run.mjs --cmd "node fake-next.mjs" --only manifest/next- --check-uid` | toExpect で `command === 'next'` のとき `found`・`requested`・`to` を期待に入れ、compareCase の strict に加える（スキーマの success に任意鍵で追加。A.1 の器では `to` は必須項目）。witness (f) に `next` の変異を 1 本足す |
| 2 | MEDIUM | `impl/test/doc-consistency.test.ts:15-31`（CURRENT_DOCS）・`:343-345`（source_sha）・`:367-369`（fence 同一性） | 新設の `tck/README.md`・`en/tck/README.md` が文書整合検査の列挙に無い（リンク切れ・表セルの `\|`・source_sha の失効・kairos fence の同一性が網の外。孤立ページ検査だけは全走査なので届く）。期待: 日本語側を変えると en の source_sha 失効が赤。実測: `tck/README.md` に 1 行足して `npx vitest run test/doc-consistency.test.ts` → **24/24 緑のまま**。対照で `recipes/README.md` に同じ 1 行を足すと赤（`en/recipes/README.md: source_sha c624b659e76d だが recipes/README.md は eef8c3375f7c`） | 上記（変異後は `git checkout` で戻した） | CURRENT_DOCS に `'tck/README.md'` と `...mdFiles('en/tck/')` を、source_sha と fence 同一性の列挙にも `...mdFiles('en/tck/')` を足す |
| 3 | LOW | `impl/test/tck.test.ts:113-124`（(b) の照合の検査）・`:157-186`（(f-1)(f-2)） | witness が「照合が働いている」と検査するのは points・warnings・uid・error.message だけ。走行器の strict の残りの項目は照合を外しても緑のまま。実測（`tck/run.mjs` の 1 行ずつを変異して `npx vitest run test/tck.test.ts -t 自己適合`、変異後は戻した）: `results[].labels` の照合を外す→緑・`coverage` の照合を `if (false)`→緑・`annotations` の照合を `if (false)`→緑・`results.length` の照合を外す→緑・`results[].dates` の照合を外す→緑（5 本とも 3 passed） | 上記 | (b) の末尾の変異に labels（鍵を消す）・coverage（runwayDays を変える）・annotations（toMs を 1 ずらす）・dates（1 つ消す）・results.length を加え、item の列が `['results[0].labels', 'coverage', …]` になることを見る |
| 4 | LOW | `tck/run.mjs:48-55`（compareCase）・`:99`・`:163`・`:171` | 評価器の出力が JSON として読めるが object でない（`null`・数値・配列）と走行器が TypeError で落ちる（不一致の行も集計も出ず stack trace・exit 1）。`--cmd ""`・`--bundle` の不在・壊れた束も stack trace で exit 1（使い方の exit 2 でない）。実測: `console.log("null")` の評価器 → `TypeError: Cannot read properties of null (reading 'error')`・exit 1。`--cmd ""` → `throw new Error('--cmd が空')` の stack・exit 1。`--bundle /nonexistent.json` → ENOENT の stack・exit 1 | `echo 'console.log("null")' > null.mjs; node tck/run.mjs --cmd "node null.mjs" --only manifest/coverage-example-payday-list`／`node tck/run.mjs --cmd ""`／`node tck/run.mjs --bundle /nonexistent.json` | compareCase の冒頭で `actual === null \|\| typeof actual !== 'object' \|\| Array.isArray(actual)` を parseError と同じ strict の不一致（「出力が CliReport の形でない」）にする。main で束の読み込み・`JSON.parse`・`spawnEvaluator` を try で包み、使い方と同じ exit 2 と 1 行の文言に |
| 5 | LOW | `tck/run.mjs:78`（splitCmd）・`impl/test/tck.test.ts:181`・`:190`・`tck/README.md:65` | `--cmd` は空白で割るので、空白を含むパスは `"…"` で囲まないと起動できないが、README に引用の規約が無い。witness (f-2)(f-3) は `${process.execPath} ${fake}` を引用なしで渡すため、Node が `C:\Program Files\nodejs\node.exe` にある Windows の手元（既定のインストール先）では赤になる（CI の hostedtoolcache は空白なし）。実測: 空白入りディレクトリに置いた node で `--cmd "<dir with space>/node impl/src/cli.ts"` → `起動に失敗: spawnSync …/dir ENOENT`・strict 不一致 1。`"…"` で囲めば全件一致。さらに実体の node をその空白入りディレクトリに置いて `vitest run test/tck.test.ts -t 走行器` → **(f-2)(f-3) が赤**（`起動に失敗: spawnSync …/dir ENOENT`）。他の 5 本は緑 | `mkdir "dir with space" && cp $(command -v node) "dir with space/node"; node tck/run.mjs --cmd "$PWD/dir with space/node impl/src/cli.ts" --only manifest/coverage-example-payday-list` | witness で `"${process.execPath}" "${fake}"` と引用する。README の `--cmd` の行に「空白を含む語は `"…"` で囲む」を足す |
| 6 | LOW | `tck/run.mjs:81`（defaultCmd）・`tck/README.md:53`・`:65` | 既定の評価器 `node impl/src/cli.ts` は型剥がしのできる Node（22.6 以上・既定で有効なのは 22.18／24 以降）が要るが、README に版の条件が無く、impl の engines は `>=20`。実測: 型剥がしを切った Node（`NODE_OPTIONS=--no-experimental-strip-types`＝22.6 未満と同じ振る舞い）で `node tck/run.mjs --only manifest/coverage-example-payday-list` → `stdout が JSON でない … ERR_UNKNOWN_FILE_EXTENSION ".ts"`・strict 不一致 1 | `NODE_OPTIONS=--no-experimental-strip-types node tck/run.mjs --only manifest/coverage-example-payday-list` | README「どう走らせるか」に Node の版の条件を書く。あるいは `impl/dist/cli.js` があればそちらを既定にする |
| 7 | LOW | `tck/README.md:24`・`en/tck/README.md:33`・`tck/manifest.json`（supply-*） | 「供給契約の違反 12 種を含む」だが、束の `契約違反` は 13 種＋解決子なし（supply 14 件）。一方で `impl/src/eval.ts` の契約違反の投げ口のうち CLI から届き文言にパスを含まないものが束に無い: `日付の形式が不正`（`eval.ts:1476`）・`kind: instants に dates が来た`（`:1488`）など。実測: `--supply` に `{"h":{"dates":["2026/01/05"],"covering":"2026..2026","asof":"x"}}` → `{"kind":"supply","message":"契約違反: 日付の形式が不正——external H.h: 2026/01/05（\"YYYY-MM-DD\"）"}` | `tck/cases/supply-nonexistent-date.kairos` を定義に、上の束で `node impl/src/cli.ts list --json --from 2026-01-01 --to 2026-02-01 --tz Asia/Tokyo --supply s.json …` | 文を実数（13 種）に合わせるか、形式不正と instants 側の kind 不一致を目録に足して数と文を揃える |
| 8 | LOW | `tck/manifest.json` の `origin`（`supply-labels-missing`・`supply-covering-reversed`・`supply-covering-year-5-digits`・`usage-next-n-zero`・`usage-next-horizon-zero`・`static-range-reversed`・`static-no-body-expression`） | `origin` が実在しない it 名を指す（3 件: 「labels 宣言つきの external にラベルが来ない」は impl/test に無い・F141 の it は `boundary-checklist.test.ts:242` の「covering の年は 4 桁…」1 本で「区間の端が逆順」「（external の解決値）」の it は無い）。usage の 2 件は `cli.ts` の posInt を指すだけで、`-n 0`・`--horizon 0` の witness は impl/test に無い。2 件は origin が「使い方エラー」と言うが焼いた kind は `static`（実装どおり static が正・`cli.ts:537`）。witness (e) は origin が非空かしか見ない | `grep -rn "ラベルが来ない" impl/test` → 0 件・`grep -n F141 impl/test/boundary-checklist.test.ts` → 1 本・`grep -rn "正の整数" impl/test` → 0 件 | origin を実在の it 名に（F141 は :242・labels 欠落は `eval.ts:1511` の投げ口を指す）。usage の 2 件は `cli.test.ts` に witness を 1 本足すか origin に「witness なし」と書く。使い方エラーの 2 件は origin の文言を静的エラーに |
| 9 | LOW | `tck/README.md:15` と `:96`・`:73`・`en/tck/README.md:98-102`・`:106-108`・`llms.txt:46-47`・`impl/README.md:56`・`:145` | 文書の不整合: implSha を L15 は「`impl/src` の指紋」、L96 は「`impl/src`＋`impl/stdlib` の指紋」（後者が正・`build.mjs:20-27`）。終了コードは「1 か 0」とあるが走行器は使い方で 2 も返す（`run.mjs:161`・`:170`）。en の箇条書き 2 箇所が空行で 2 つの list に割れる（日本語は 1 つ）。schema の一覧（llms.txt・impl/README）に `tck.schema.json` が無い（`spec/60` は不変の制約なので対象外） | 目視・`node tck/run.mjs --only nothing/; echo $?` → 2 | 文言を揃える・空行を詰める・一覧に 1 行足す |

## 確認したが所見にしなかったもの（根拠つき）

- **束が機械の tz に依存しない**: `TZ=America/Los_Angeles`・`TZ=Pacific/Kiritimati` で `node tck/build.mjs --out …` を作り `cmp` → 委ねた束と同一。
- **層 1 の期待が doctest と同じ**: 204 件すべてを `doctest.test.ts` と同じ呼び方（`run(source, {from, to, tz?, resolve})`）で評価し直し、`dates`・`points`・`annotations`（fromMs／toMs／source／covering／asof）・`labels`・`warnings` を束の `expect` と比較 → 不一致 0。tz 省略時の既定 `Asia/Tokyo` も `run` の既定と同じ（`index.ts:22`）。
- **main との衝突**: 入口 6 箇所のテスト数（main 979・PR 985）だけ。main 側で `impl/src`・`impl/stdlib`・doctest の 5 箇所は不変（`recipes/README.md` の追加に `# eval:` は無い）→ merge 後も束の作り直しは不要で、数の合算だけ。
- **implSha の式**: `build.mjs` と `tools/build-playground.mjs`・`doc-consistency.test.ts:128-133` で同一（7 ソース＋3 stdlib・順も同じ）。計算値 `d9b1839737b2`＝`playground/js/build-info.js`＝束の頭。
- **source_sha**: `node tools/refresh-source-sha.mjs --check en/tck/README.md` → 一致。両 README の相対リンク 17 本は全部実在。
- **公開面の禁止語**: `tck/`・`schema/tck.schema.json`・`en/tck/`・`impl/test/tck.test.ts` に公開前の禁止語検査の該当 0。`tools/tck` への参照が残るのは非公開の層（作業記録と指示書）だけ。
- **走行器の照合の主張**: coverage は source・covering で整列して集合比較（`run.mjs:69-71`）・warnings は出現順（`:73`）・labels は鍵の有無も（`:66`）＝README の記述どおり。
- **評価器の終了コードを走行器が見ない**: TCK の対象が「CliReport の意味論」と明記されているので所見にしない。
- **`_config.yml` は `tck/` を丸ごと公開**（束 431 KB・cases・run.mjs・build.mjs も静的ファイルとして配信）: 意図（公開面に置く）と整合するので所見にしない。
- **witness の負荷**: `tck.test.ts` は (c) が 49 秒・beforeAll の生成も同程度（自前の 600 秒）・サブプロセスの it は 0.1〜1.9 秒で 30 秒の testTimeout に余裕。全スイートは JST 130 秒・UTC 105 秒。
- **`static-range-reversed`・`static-no-body-expression` の kind**: CLI の実測も `static`（`phase === 'eval'` 以降の KairosError）で束は実装に忠実。文言のずれだけを所見 8 に。

## 読んだ順と掛けた時間

1. 指示書・MAINTENANCE.md・PR 本文と既存コメント・差分の stat と文書の差分（README 英日・llms.txt・CHANGELOG）
2. `tck/run.mjs` → `tck/build.mjs` → `impl/test/tck.test.ts` → `tck/README.md`・`en/tck/README.md` → `schema/tck.schema.json`
3. 比較対象: `impl/test/doctest.test.ts`・`impl/src/cli.ts` の main・`tools/publish.sh`・`.github/workflows/ci.yml`・`impl/test/doc-consistency.test.ts`・`spec/60` A.1
4. 目録 59 件の出自と期待の突合・cases の中身
5. 再現: 走行器の境界入力・偽の評価器（next・null・点落とし）・tz 違いの再生成・doctest 204 件の再評価・doc-consistency と走行器の照合の変異・空白入りパスの node

掛けた時間: 約 25 分（検査の走行を含む。typecheck＋vitest 2 回＋走行器の全件＋束の再生成 2 回＋変異 7 本）。
