# 2026-10-29 機械レビュー（PR #6＝rc-1.1 の候補 dd4b509・1 回目・15 件）

> **出所**: 2026-10-29 昼の機械レビュー（1 回目・手元で実行・GitHub へは未投稿）の結果の逐語収蔵。10 観点の探索→候補 19 本→1 票検証→掃討 4 本・上限 15 件。対象＝PR #6（`rc-1.1` dd4b509 ← `main` 7f677d9・30 コミット・98 ファイル）。
> 処置の記録は末尾に追記する（番号は所見の番号）。PR #6 にも同文をコメントで付けた。

---

注記: この結果は GitHub へ投稿していない（手元の実行）。

対象 = PR #6（`rc-1.1` dd4b509 ← `main` 7f677d9・30 コミット・98 ファイル）。10 観点の探索→候補 19 本を照合（1 票検証・REFUTED 1 本＝premise ブロック内の予約語は spec §4.8 L300-301 が明文化済み）→掃討 4 本（2 本は当方で再走して確認）。検証はすべて scratchpad のワークツリーと複製上で行い、`main`・`rc-1.1` とも未変更（`git status` clean）。スイートは TZ=UTC で 963 緑・typecheck 緑でしたが、下記 1〜7 は既存テストの網の外です。

15 findings, most severe first:

1. `impl/src/eval.ts:463`: ivIndexOf の算術グリッド高速路が ms >= t0+n*step を n-1 に丸める（旧二分探索と main は -1）ので、実体化地平線 to+400 日より先の時点が黙って最後の窓に所属し、1.0 で止まっていた形が無言の誤値・捏造点になる

   Failure scenario: 範囲 2026-01-01..02-01（tz Asia/Tokyo・hour = 経過 1h グリッド）: `everyDay |> filter(d => epochOrdinal(hour, 2030-01-01) >= 0)` → main は『epochOrdinal: 点が窓の外』、rc-1.1 は 31 点を返し `epochOrdinal(hour, 2030-01-01) == epochOrdinal(hour, 2027-03-07T23:00)` が真（差分 0）。`[2030-06-01T10:30] covering: 2026..2030 |> snapTo(hour) |> shift(-10000, unit: hour)` → main は 0 点＋horizon-clip 警告、rc-1.1 は `2026-01-15T07:00` を捏造し警告なし（impl/README.md L211『黙って切らない』・L239 に反する）。cycle の anchor/射影・ordinalIn・coincides・label 射影も同様に無言の値。境界 ms == t0+n*step も n-1。修正は `if (ms < a.t0 || ms >= a.t0 + a.n * a.step || a.n === 0) return -1` の 1 行（複製で全該当ケースが main と一致・153 テスト緑を確認）。relevantWindowIdx L79 の同形の丸めは選択子が w.start/w.end を再検査するので無害

2. `impl/src/eval.ts:81`: relevantWindowIdx の Set には個数の防御がなく（L85 は註釈 1 区間の幅だけ）、V8 の Set 上限がちょうど 2^24 なので、相異なる点窓が 2^24 を超えると統治外の生の `RangeError: Set maximum size exceeded` が CLI/MCP に漏れる

   Failure scenario: `@P\nchronos grid 60s |> first`（2026-01-01..01-02）→ 32〜78 秒・約 1 GB の後 stderr に裸の『Set maximum size exceeded』・--json では kind "static"（cli.ts L534-541 は KairosError 以外を分類しない）。`everyInstant |> strideBy(1s, from: 2026-10-26) |> within(sec1) |> first |> take(3, …)`（3,460 万点・strideBy の 2^27 は通る）も同じ。註釈 2 区間がそれぞれ 2^24 未満でも和で超えると同じ（`[2000-03-01] covering: 2000-01-01..2001-01-01` を grid 60s へ）。最小修正は点ループ・註釈ループとも `set.size >= GRID_WINDOWS_MAX` で tooMany を投げる（pts は昇順なので Set を捨てて直前値と比較する掃引でも可・2 万ケースで一致確認）

3. `impl/src/eval.ts:2810`: split … by: <経過グリッド> が親窓ごとに u.iv の findIndex／filter／for-of を Proxy 越しに全走査するため、main で完走していたプログラムが約 10 倍の CPU になり実用上完走しなくなる（出力は同一）

   Failure scenario: `hr1 = chronos grid 3600s; splw = week split (_ => [84, 84]) by: hr1` + `everyDay |> within(splw) |> first`（2026-10-26..12-10）: main 42.2 s CPU で 13 行、rc-1.1 は timeout 200 で未完（138.6 s CPU 消費）・完走まで 401.8 s CPU。`grid 43200s` で [7,7]: 4.17 s → 46.83 s。`w168 split (i => [2,5]) by: d24 |> last`: 1.77 s → 16.37 s。プロファイルは 68% が L2801 の親窓コールバック・14% が Proxy get。arithOf(u.iv) のとき `ui = max(0, ceil((p.start-t0)/step))`・親窓内の単位数は『含まれる窓』の算術（countIvIn は『交差』なので端の親窓で 5,853/20,000 不一致＝流用不可）・uBounds は `x>=t0 && x<=end && (x-t0)%step===0`（-0 と n=0 に注意）で O(1) に

4. `impl/src/eval.ts:86`: relevantWindowIdx が註釈区間に交差する全窓の添字を列挙し選択子が窓ごとに widened Ann を積む（normAnn が 1 区間に併合し直す）ため、暗黙の先頭註釈を持つテーブル（covering: を書かなくても）× 細かい経過グリッドが、註釈幅を『紀元から to+400 日まで約 N 個・from: を近づける』と誤って言う診断で止まるか、上限未満なら数分・数 GB になる

   Failure scenario: `marks = [2026-01-05, 2026-01-06]` （covering 有無とも）`|> within(chronos grid 60s) |> first`（2026-01-01..01-10）→ 『選択子 first: 点が多すぎて実体化できない（紀元または from: から計算範囲の端 to+400 日まで約 29,453,760 個…from: と評価範囲を近づける）』——29,453,760 は [-∞, 2026-01-01) の先頭註釈の窓数でグリッド総数 30,042,720 でも from: でもない（grid に from: は無い）。同じ入力を `grid 120s`（上限未満）にすると完走まで 390 秒・RSS 2.79 GB＝F147 が防ぐはずの挙動。`everyDay |> within(chronos grid 1s) |> first` は 0.17 秒なので、崖は利用者が書いていない註釈に依存する。経過グリッドは openEnd を持たず readsEnd は常に偽なので、註釈 1 本につき `[t0+lo*step, t0+(hi+1)*step)` の 1 区間を O(1) で積めば現行と同一の註釈になる（grid 3600s で main と一致を確認）

5. `impl/src/eval.ts:3678`: splitWindowsOf の連続性検査が top.iv を添字で全走査し（checkPartition L3700 にある arithOf の早期 return がない）、添字読みは ENUM_KEYS の上限に掛からないので、grid 1s の窓付きストリームを split の親にすると診断なしに約 37 分スピンする

   Failure scenario: `sec = chronos grid 1s; w = everyDay |> within(sec); q = w split (_ => [2]) by: sec; everyDay |> within(q) |> first`（2026-01-01..01-04）→ rc-1.1 は timeout 60 で出力なし・RSS 151 MB 一定（CPU スピン）。`grid 60s` は 37.3 秒走査した後にようやく次行 L2799 の for-of で『grid: 点が多すぎて…』。実測 0.8M 窓/秒 → 1s の 18 億窓は約 37 分。算術グリッドは構成上 elem(i).end === elem(i+1).start なので `if (!arithOf(top.iv)) for (…)` で即時診断（複製で 1s が 2.29 秒で診断・split-parent 7/7 緑を確認）

6. `impl/src/eval.ts:2230`: ordinalIn の後退走査 `while (first > 0 && u[first-1].start >= w[wi].start) first--` が枠窓幅/単位幅に比例し、遅延グリッドでは 1 歩ごとに Proxy get＋Iv 生成なので、ordinalIn(chronos grid 60s|1s, month, d) が点ごとに無言で数分〜時間規模のハングになる（main は OOM で落ちていた形）

   Failure scenario: `everyDay |> filter(d => ordinalIn(min1, month, d) > 0)`（min1 = grid 60s・2026-01-01..01-10）→ rc-1.1 は timeout 60 で CPU 57.6 s・診断なし；`sec`（grid 1s）も同様（推定 265 億歩≒1.5 時間）。計測器で hr1 の 1 評価は 20,863 回の呼び出しで 737 万歩。算術のときは `first = min(ui, max(0, ceil((w[wi].start - a.t0)/a.step)))` で O(1)（15 万ケースでループと一致；非整列の枠始点は L2221-2228 の ADR-50 検査が先に止める）

7. `impl/src/eval.ts:3611`: units の遅延配列の上限が STRIDE_POINTS_MAX（2^27）なのに toStream は `v.units.filter(p => p < computeEnd)`（述語は常に真）で全要素を複製し、下流の選択子は 2^24 で崩れるため、幅 13.4〜107 秒の経過グリッドを点列として読む形が診断されずに 30〜75 秒・1 GB 超で死ぬ

   Failure scenario: `chronos grid 20s |> first`（2026-01-01..01-02）→ n = 9,009 万 < 2^27 で素通り→ 50.8 秒・RSS 1.70 GB の後に裸の RangeError（所見 2 の経路）。`chronos grid 60s |> first` 単独でも 32 秒・981 MB で同じ。`chronos grid 120s |> first`（n = 1,501 万 < 2^24）は完走するが 38 秒・962 MB。`grid 10s`（> 2^27）だけが 1.35 秒で正しく『点が多すぎて』になる。最小修正は L2761 の units の上限を GRID_WINDOWS_MAX（2^24）に揃える（boundary-checklist F147 L202 の正規表現『134,217,728（2^27）』と L51/L2756 の註記・CHANGELOG の『点 2^27』を 2^24 に；strideBy の 2^27 と cli.test の 86,400 点は別経路で不変）＋所見 2 の防御

8. `impl/src/eval.ts:3744`: isStdlibDecl が『stdlib』を呼び出し時の `rt.premises.get('Gregorian')` で名指し解決するため、spec/20 L17 が受理すると明記する利用側の `premise Gregorian { … }` 再定義で、at／since／before の名指し検査が利用者自身の定義に掛かり（註記 L3521・CHANGELOG L889・reference/at.md L58 に反する）、@Fiscal／@ISOWeek 配下では本物の stdlib 定義に掛からなくなる

   Failure scenario: `premise Gregorian { day = chronos grid 1d; month = chronos grid 1d; at(a) = s => s }` + `@Gregorian` + `x = [2026-01-15]; x |> within(day) |> at(T09:00)` → main は 2026-01-15、rc-1.1 は『at: 窓付き入力は取らない…ADR-51 追記』で停止。同じ再定義の後に `@Fiscal\neveryDay |> at(2026-01-03T07:00)` → rc-1.1 は exit 0 で 01-03 以降だけ出す（Fiscal.base は登録時の元 stdlib 実体なので decl 同一性が外れ、ADR-51 の検査が黙って消える＝1.0.12 の欠陥そのもの）。再定義なしでは正しく停止。修正は index.ts の stdlib 登録時に実体（または decl 集合）を捕捉して比較する

9. `impl/src/eval.ts:2367`: evalCall 経路では since／before の名指し検査を足したのに at は足していないため、`at(…)(s)` の呼び出し形が ADR-51 の検査を素通りして点を黙って落とす（main からの持ち越しだが、本 PR は『前文の形によらず掛かる』と公開文書で約束し、同じ場所に since/before の検査を置いた）

   Failure scenario: `f = s => at(2026-01-02T09:00)(s)` + `everyDay |> f`（2026-01-01..01-04）→ rc-1.1・main とも `2026-01-02T09:00, 2026-01-03T09:00` exit 0（01-01 が無言で欠落）；パイプ形 `everyDay |> at(2026-01-02T09:00)` は『at: 引数は単独時刻リテラル』で止まる。`g = s => at(T09:00)(s)` + `… |> within(month) |> g |> first` は一般の『選択子 first は窓なしでは型エラー（I4）』。reference/at.md L47-59 は検査の例外を『利用側の再定義』だけと書く。時刻リテラル側の検査は L2367 の隣に 6 行で足せる（窓付き入力側は返る LambdaV に出自がないので文書の既知の差とするか origin を付ける）。併せて L2367-2369 と L3538-3540 は条件・呼び出しとも同一の複製で、at も含めた `checkStdlibSugarArgs(name, decl, locals, stream?)` 1 か所に畳める

10. `impl/src/eval.ts:2235`: 新設の epochOrdinal／ordinalIn の引数個数検査は名前付き引数も位置引数として数え、そのまま位置で束縛するので、同じ PR の labelOrdinal（名前付きを拒否）や bindParams と規則が食い違う

    Failure scenario: `everyDay |> filter(d => epochOrdinal(month, x: d) == 672)` → 2026-01-01〜03 を返す（`x:` を黙って点として採用）；`ordinalIn(day, month, x: d) == 1` も通る。`epochOrdinal(month, d, phase: 1)` → 『渡されたのは 3 個』（位置引数は 2 個）。`epochOrdinal(x: d, month)` → 『時点ではない: windows』。L2252 の labelOrdinal は『名前付き引数は受け取らない』で止める。同じ行は ordinalIn の L2202。`e.args.some(a => a.name)` の拒否を 2 語にも置くか、共通の arity ヘルパに

11. `impl/test/boundary-checklist.test.ts:205`: F147 の `everyInstant |> strideBy(1s, from: 2026-10-26) |> take(3, …)` は to+400 日まで 3,460 万点（約 1 GB）を実体化し、ページフォールト支配で負荷時に 5〜10 倍に膨らむため、手元の testTimeout 30 s を超える（CI の 90 s も余裕は薄い）

    Failure scenario: 単独実行の最良 3.68 s だが、load avg 4.5 で開始した 1 本目から『Test timed out in 30000ms』（8 回中 6 回タイムアウト・最長 77 s・maxrss 943 MB・sys 時間が支配）。vitest は既定で 7 ワーカー並列なので cli.test の子プロセスや doctest と競合する。strideBy(10s)（346 万点・約 100 MB）か computeEnd 近くの from: で 2^27 未満の証人にするか、この it に `{ timeout: 120_000 }` を

12. `impl/stdlib/gregorian.kairos:2`: 出荷される stdlib ソース（npm tarball と Playground の stdlib-data.js に同梱）に『プロトタイプは 1970-01-01 に固定する』が残り、新設の doc-consistency 検査『ソース…に「プロトタイプ」が残っていない』の網（impl/src/*.ts・CURRENT_DOCS・llms.txt・mcp README）が *.kairos を含まないので緑のまま

    Failure scenario: `grep -rn プロトタイプ impl/stdlib playground/js` → gregorian.kairos:2 と playground/js/stdlib-data.js:2（STDLIB_SOURCE として index.js:11 が読み込む）。2026-10-22 決定『参照実装の定数を言語の限界として引かれる自称を外す』の対象で、Playground の stdlib 表示と npm の同梱物に残る。検査の targets に `impl/stdlib/*.kairos` を足し、文言を『参照実装は』に

13. `tools/release/v1.1.0-runbook.md:21`: runbook が mcp の依存を『`^1.0.11`・lock 1.0.11 のまま』と記すが、rc-1.1 の mcp/package.json は `^1.0.12`・lock は 1.0.12（L70-71・L87 の『評価器が 1.0.11』も同じ古い値）

    Failure scenario: 公開当日の操作者が §4 の前提状態を 1.0.11 として確認・記録する（`mcp/package.json:56 "kairos-lang": "^1.0.12"`・package-lock.json:1214 `"version": "1.0.12"`）。上げる手順自体は動くが、記録と『タグから出すと評価は 1.0.11』の説明が事実と食い違う。3 箇所を ^1.0.12／1.0.12 に

14. `impl/src/eval.ts:54`: 遅延配列の実体化上限を Array.prototype のメソッド名 34 個の手書き拒否リスト（ENUM_KEYS）で守る設計は、所見 5・6 のような添字走査と ES2023 の toSorted/toReversed/toSpliced/with・JSON.stringify・concat 引数を素通りさせる＝根本（『実体化する量』の統治）に届いていない

    Failure scenario: Proxy 探針（n=1e8・上限 2^24）: `map` は 0.2 ms で診断するが `p.toSorted(cmp)` は 240 秒超走って殺した；n=1e6 で JSON.stringify／`[].concat(p)`／`slice.call(p)`／添字 for は全要素を読む。実コード: `ordinalIn(chronos grid 1s, year, 2026-12-31T23:59:59)` は n≈18 億（両上限超）なのに 54 秒走って診断なし。簡潔で一般的な形は get トラップで『関数値のキーは at を除いて上限検査』（現行の消費者 .filter/.findIndex/.forEach/for-of/添字/length/ARITH を全て調べ誤爆なし）＋所見 5・6 の 2 か所を算術に。寿命単位の読み取り予算（GRID_WINDOWS_MAX）は不可＝`filter(d => ordinalIn(hour, year, d) >= 1)` が累積 9.3e7 読みで誤診断する（複製で実測）

15. `impl/src/eval.ts:3499`: strideBy の try/catch(RangeError) は新設の 2^27 事前判定の後では到達不能（V8 の push の RangeError はちょうど 2^27+1 要素で発生）で、ARRAY_MAX（L38）と tooManyPoints の既定 `limit = ARRAY_MAX`／『配列の上限』分岐（L3586-3587）もこの死んだ catch だけが使い、L3494-3496・L3585 の註記は 1.0.x の挙動を書いている

    Failure scenario: 実測（Node 24・Chromium 同）: double の push は長さ 134,217,728 で RangeError『Invalid array length』＝STRIDE_POINTS_MAX と同値なので事前判定が通した個数では投げない；ヒープ枯渇は致命エラーで catch できない。grep: ARRAY_MAX の使用は L39 の註記と L3586 の既定値のみ・『配列の上限』を固定するテスト／文書なし。PR は grid 側の同じ try/catch は削除した（pr6-code.diff L459-466）。削除して limit/pow を必須にし註記を 2^27（V8 の packed-double の上限と一致する旨）に書き換える。注意: STRIDE_POINTS_MAX を 2^27 より上げると push の RangeError が復活する

上限 15 で落とした検証済みの下位所見（参考）: ①L2367/L3538 の since/before 検査の複製と checkSinceBeforeArg の `p === undefined` 死枝（所見 9 に含めた）②L79/L463/L94-97 の算術添字式 3 写し（所見 1 の修正を 1 か所に置く器＝`arithIndexOf`/`arithEnd`・countIvIn の last は `hi >= end ? n-1 : idx(hi-1)`）③影の誘導が『適用できない値』経路だけで `weekday = day cycle […]` は無言の 0 点のまま（90-open 3-17＝未規定で据え置きは PR の宣言どおり）④labelOrdinal の x が単独時刻のとき ADR-51 の誘導が無い。

---

## 処置の記録（rc-1.1・2026-10-29〜）

（番号は所見の番号。）

**2026-10-30・rc-1.1 fbda65f（dd4b509 の上に 1 commit・20 ファイル・963→972 テスト）＝15 件すべて処置（言語不変）。** 各所見は上の再現コマンドで dd4b509 の赤
（①誤値・②⑦生の `RangeError`・③⑤⑥ 40 秒超の打ち切り・④誤診断・⑧⑨⑩素通り）を実測してから直し、修正後に同じ入力で期待の形を実測した。
コーパス 209 入力（doctest 204・eval 指示のないフェンス 2・examples 3）の出力は dd4b509 と一致（差 0・タイムアウト 0）。③ の出力は main（実体化版・29 秒）と byte 一致（修正後 0.4 秒）。

| # | 処置 | 証人 |
|---|---|---|
| 1 | 算術の添字式を `arithIndexOf`（末端以後は −1）に一本化＝実体化地平線より先の時点は 1.0 と同じ「窓の外」・`snapTo` は 0 点＋horizon-clip | F148 |
| 2 | 選択子の `relevantWindowIdx`＝Set を昇順の掃引に（点の属する窓だけ・2^24 で専用の診断 `tooManyWindows`＝紀元からの個数ではなく点の属する窓の数を言う） | F149 |
| 3 | `split` の by: が算術グリッドなら境界検査・親窓内の単位数・最初の単位の添字を算術に（`arithLowerBound`・`isBound`） | F150 |
| 4 | 註釈区間に交差する窓の列挙をやめ、区間ごとに `arithIntersect` で 1 区間に拡幅（註釈の像は実体化版〈grid 3600s・main〉と JSON 一致） | F151 |
| 5 | `splitWindowsOf` の連続性検査は算術グリッドで省く（添字走査の 37 分スピン→2 秒で診断） | F152 |
| 6 | `ordinalIn` の後退走査を `arithLowerBound` に（O(1)） | F153 |
| 7 | `grid` の units の上限を窓と同じ 2^24 に（F147 の正規表現・impl/README「実装定義のパラメータ」・CHANGELOG・90-open 3-19 の文言） | F149・F147 |
| 8 | `Runtime.stdlibDecls`（`registerPremise(st, true)`＝index.ts の stdlib 登録で捕捉）への所属で判定 | F154 |
| 9 | `checkStdlibSugarArgs`（at／since／before・段の形と呼び出し形の 1 か所）＋`at(Thh:mm)` が返す LambdaV に `stdAt` を付け `applyValue` で窓付き入力を止める。reference/at.md 日英に 1 項（source_sha） | F155 |
| 10 | `positionalArity`（名前付き引数は「受け取らない」で止める＝labelOrdinal・bindParams と同じ規則） | F156 |
| 11 | F147 の証人を `strideBy(10s)`（346 万点）に。1 秒刻みの数字は文書の記述のまま | F147 |
| 12 | gregorian.kairos の文言を「参照実装は」に・doc-consistency の網に `impl/stdlib/*.kairos`（文言を直す前に赤を実測→緑）・Playground 再構築（stdlib-data.js） | doc-consistency |
| 13 | runbook v1.1.0 の 3 箇所を `^1.0.12`／1.0.12 に | — |
| 14 | 遅延配列の get トラップで「`at` 以外の関数値のキー」を上限検査（手書きの ENUM_KEYS は廃止）。添字の全走査は検査に掛からないので消費側を算術に（5・6）＝設計の論点は 90-open 3-19 に追記 | （既存の網） |
| 15 | strideBy の try/catch と ARRAY_MAX を削除・`tooManyPoints` の limit／pow を必須に | F137（不変） |

下位所見＝① since/before の検査の複製は 9 で畳んだ・② 算術添字式 3 写しは `arithIndexOf`／`arithEnd`／`arithIntersect` に・③④は据え置き（3-17 は PR の宣言どおり・labelOrdinal の単独時刻の誘導は需要待ち）。
検査＝typecheck・972（JST／UTC）・check-test-count・doc-consistency・mcp 12・Playground 指紋 `30a9a63b1ddf`（runbook）。push＝rc-1.1 は fast-forward（force 不要）・PR #6 にコメント。
2 回目の機械レビューは fbda65f に当てた（2026-10-30・次の記録）。

**差分掃引（2026-10-30・処置の後の確認＝推論でなく実測の網）**: 実体化版（1.0.12）を正解器に、算術版（fbda65f）を同じ 2,604 本（tz 4 × 範囲 3 × 幅 6 × 消費側 29 形・anchor 付き 576）に掛けた。
2,602 本が一致（正常 2,098・エラー 504 は文面まで同一）。差 2 本は実体化版が 180 秒で打ち切り（`day split … by: grid 900s` × strideBy）＝算術版は 66／192 ms で、同じ境界の 3600s 版（実体化版と一致）と点列が一致。
所要時間は逐次の再計測で同等（窓列を点列に直読みする形だけ約 2 倍・1 秒未満＝3-19 の算術化で消える）。道具は `tools/boundary/diff-sweep/`・結果は `tools/boundary/results/2026-10-30-diff-sweep.md`。
