# 2026-10-31 機械レビュー（PR #9＝1.1.0 のカレンダー差分・8 件）

- 対象: レビュー専用 PR #9（base 2cc9691＝rc-1.1 を main に merge した直後 → head＝main のカレンダー関連 19 ファイル・+1,114/−28・merge しない）。
- 器: 機械レビュー（非公開の指示書に従う読み手）。所見は PR #9 のコメント 1 件（逐語は下）。
- 重さ: MEDIUM 3（URL の `e` にプロトタイプ名・不正な tz で起動が止まる・`wkstOf` が派生の連鎖と註つきの `@` 行で外れる）・LOW 5（年末年始の式が遅い・⚠ の一言が片側だけ・`withName` の改行・`sanitizeValues` の witness の穴・未使用の定義）。
- 処置: 8 件すべて main で処置（下の表・2026-10-31）。979 テスト据え置き（witness は既存の it の中に追加）。

## 処置の記録（2026-10-31）

| # | 重さ | 処置 | 検査 |
|---|---|---|---|
| 1 | MEDIUM | `hasExample(lang, id)`＝`Object.hasOwn` で例を判定・`defaultValues`／`sanitizeValues`／`packValues`／`unpackValues`／`buildSource` は `exampleOf` を通し無い id は明示エラー・起動の分岐全体を try で包み失敗は最初の例へ | witness: `hasExample('ja','constructor')`＝false・`unpackValues('ja','constructor','')` が throw |
| 2 | MEDIUM | `isValidTz(tz)`（Intl で 1 行検査）。窓の計算（`selectExample`・起動の Playground 由来）は不正なら既定 tz で取り、評価器の「不正な tz」の文言は従来どおり黄枠に | witness: `isValidTz('Asia/Tokyoo')`＝false |
| 3 | MEDIUM | `wkstOf`＝`@` 行は `/^\s*@(\w+)\b/m`（註・字下げを許す）・`premise Name = Base with {…}` の連鎖を基底まで辿る（深さ 10）・「ソース中の最初の `wkst:`」の代用は廃止（wkst の無い premise は Mon） | witness: 所見の再現 3（A Sun・B Mon・P = B with）＝Mon・`@B # 在圏`＝Mon・字下げ `@A`＝Sun・wkst 無しの X＝Mon |
| 4 | LOW | 年末年始の項を `yearEnd = everyDay \|> within(year) \|> last`・`newYear = … \|> nth(1)` と `shift(±1, ±2, unit: day)` の和に（実測 650〜1,650 ms → 20 ms・同じ 6 点）。debounce は入れない（change は離散） | witness: lesson の既定と変種が CLI と同じ点列（既存） |
| 5 | LOW | 表の前後両方にはみ出すときは `starts` と `ends` の 2 文をつなぐ | witness: 2025-12-01..2028-02-01 で「2025 年」と「2028 年」の両方 |
| 6 | LOW | `withName` は改行を空白に | witness: `withName('# a\nx', 'b\neveryDay')`＝`# b everyDay\nx` |
| 7 | LOW | `sanitizeValues` の witness を追加 | `unpackValues('ja','garbage','9,x,Foo')`＝既定値・`('ja','alarm','25:00,7:30')`＝既定値 |
| 8 | LOW | `WD_SHORT_EN` と `renderForm` の `lang` 引数を削除 | typecheck・979 |

## 所見（投稿どおり・逐語）

## 機械レビュー所見（PR #9・1.1.0 のカレンダー差分）

対象: base `2cc9691` → head `6d61138`（19 ファイル・+1114/−28）。検査は head の作業木で `npm run typecheck`（OK）・`npx vitest run`（979/979・102 s）・`TZ=UTC npx vitest run`（979/979・78 s）・`node scripts/check-test-count.mjs`（979＝入口 6 箇所 OK）。所見はすべて最小入力で赤を実測したもの。枝には何も push していない。

| # | 重さ | 場所（ファイル:行） | 何が（期待と実測） | 再現（コマンドか入力） | 直し方の案 |
|---|---|---|---|---|---|
| 1 | MEDIUM | `calendar/core.js:673`（起動の `EX[h.e]`）・`:202` | URL の `e` に `constructor`・`__proto__`・`toString` など Object.prototype の名前が来ると `EX[h.e]` が真になり、`unpackValues` が `EXAMPLES[lang][id].fields` で TypeError。期待: 知らない `e` は無視して最初の例に戻る。実測: 起動が途中で止まり、穴も格子も出ない（月 0・穴 0・`cal-src` 空） | `/calendar/#e=constructor&f=2026-10-01&t=2026-11-01`（`#e=__proto__` も同じ）。純関数なら `node -e` で `unpackValues('ja','constructor','')` → `TypeError: Cannot read properties of undefined (reading 'map')` | `Object.hasOwn(EX, h.e)` で判定（`defaultValues`／`unpackValues` の入口にも同じ番を置く）。起動の分岐全体を try で包み、失敗したら `selectExample(Object.keys(EX)[0])` に落とす |
| 2 | MEDIUM | `calendar/core.js:670`・`:471`（`monthsWindow`／`rollingWindow` の Intl） | URL の `z` が不正な IANA 名で `f`・`t` が無いと、`selectExample` の窓計算で `Intl.DateTimeFormat` が RangeError。期待: 不正な tz は `run` の KairosError と同じく黄枠に出て描画は続く（`f`・`t` 付きの URL ではそうなる）。実測: 起動が止まり何も描かれない。tz 欄に不正な名前を入れてから例を切り替えても同じ例外（select は `pay` に変わるが穴と式は `garbage` のまま） | `/calendar/#z=Asia/Tokyoo` → `Invalid time zone specified: Asia/Tokyoo`。操作: tz 欄に `Asia/Tokyoo` → 例を切替。純関数なら `monthsWindow('Asia/Tokyoo', 12)` | tz を使う前に 1 行で検査する（`try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }) } catch { tz = defaultTz(lang) }`）を `readRange` と起動に置く。または `selectExample` の窓計算を try で包み、失敗時は既定 tz で窓を取り黄枠に `run` と同じ文言を出す |
| 3 | MEDIUM | `calendar/core.js:255-265`（`wkstOf`） | (a) `@P` が派生 premise（`premise P = B with { … }`）で `wkst` を基底から継承していると P のブロックに `wkst:` が無く、「ソース中の最初の `wkst:`」に落ちて別の premise の値を拾う。(b) `@B # 註` や字下げした `@B` は `/^@(\w+)\s*$/m` に掛からず同じ代用に落ちる。期待: 評価器と同じ週の始まり。実測: A が `wkst: Sun`・B が `wkst: Mon`・`premise P = B with { tz: "Asia/Tokyo" }`・`@P` で `wkstOf` → `Sun`、評価器の `everyDay \|> within(week) \|> nth(1)` は `2026-10-05 Mon`・`2026-10-12 Mon`。ブラウザの見出しの先頭も「日」。`@B # 在圏` でも同じ | 下の「再現 3」のソースを `s=` に載せて開く。純関数なら `wkstOf(src)` と `run(src, …)` を並べる | `@` 行は `/^\s*@(\w+)\b/m` で読み、`premise Name = Base with {…}` の連鎖を基底まで辿って最初に見つかる `wkst:` を取る。見つからなければ Mon。「ソース中の最初の `wkst:`」の代用は外す（当たるのは偶然）。評価器に聞ける口（`run` が返す runtime から在圏 premise の `wkst` を出す）があれば正規表現を持たない方が確か |
| 4 | LOW | `calendar/core.js:161`（`lessonBody`）・`:153`（`alarmBody`）・`update`→`render` | 穴を 1 つ変えるたびに本体式と祝日式を評価して 12 か月の DOM を組み直す。実測（Node・12 か月・温まった後の 3 回）: garbage 114–127 ms・burnable 151–166・pay 180–183・alarm（28 日窓）620–964・lesson 967–1317 ms。ヘッドレスのブラウザ内で穴を 1 回変える所要: lesson 688–854 ms・garbage 702 ms。lesson の年末年始の項 `everyDay \|> filter(d => (month(d) == 12 and dayNo(d) >= 29) or (month(d) == 1 and dayNo(d) <= 3))` が単独で 562 ms（6 点） | 下の「再現 4」 | 年末年始を `ye = everyDay \|> within(year) \|> last`・`ny = everyDay \|> within(year) \|> nth(1)` と `shift(±1, unit: day)`・`shift(±2, unit: day)` の和で書くと同じ 6 点で 32 ms（実測）。8 月の `month(d) == 8` は 256–270 ms で残るので、必要なら穴の change を 150 ms 程度 debounce する |
| 5 | LOW | `calendar/core.js:319-320`（`plainWarning`） | 範囲が表の前後両方にはみ出すと after 側しか言わない。期待: 両方の年を知らせる。実測: `from 2025-12-01 to 2028-02-01`（表は 2026..2027）で註釈は `2025-12-01..2026-01-02` と `2028-01-01..2028-02-01` の 2 本だが、一言は「この表は 2027 年分までです。2028 年の予定は祝日を知らずに出ています。」で 2025 年が出ない | `plainWarning('ja', run(buildSource('ja','pay',…), { from: '2025-12-01', to: '2028-02-01', tz: 'Asia/Tokyo' }).results[0].annotations, …coverage)` | `after` と `before` の両方があれば `ends` と `starts` の 2 文をつなぐ |
| 6 | LOW | `calendar/core.js:330`（`withName`） | `name` に改行が含まれると式の行が増える（「コメント行だけを差し替える」の外）。実測: `withName('# a\nx', 'b\neveryDay')` → `# b\neveryDay\nx`（`nameOf` は `b` を返し、`everyDay` が本体式に加わる）。UI の `input type=text` から改行は来ないので影響は無いが、export された純関数で検査もあるので契約として閉じておきたい | `node -e` で上の呼び出し | `const n = String(name ?? '').replace(/[\r\n]+/g, ' ').trim()` |
| 7 | LOW | `impl/test/calendar.test.ts:65`（往復の検査のみ） | `sanitizeValues` の「選択肢にない値・時刻でない値は既定値に戻す（URL から来た値を信じない）」に witness が無い。変異（select と time をそのまま通す）で `calendar.test.ts` 6 本とも緑のまま | `core.js:187-189` の 2 行を `out[f.key] = v ?? f.def` に変えて `npx vitest run test/calendar.test.ts` → 6 passed | `unpackValues('ja','garbage','9,x,Foo')` → 既定値、`unpackValues('ja','alarm','25:00,7:30')` → `06:30`／`08:00` の期待を 1 本足す |
| 8 | LOW | `calendar/core.js:16`・`:402` | `WD_SHORT_EN` は未使用。`renderForm` の第 1 引数 `lang` も未使用 | `grep -n WD_SHORT_EN calendar/core.js` → 定義 1 件のみ | 削る |

### 再現の詳細

再現 3（`wkstOf` と評価器の不一致。`s=` に base64url で載せても、純関数を直接呼んでも同じ）:

```
premise A { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Sun }
premise B { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
premise P = B with { tz: "Asia/Tokyo" }
@P
everyDay |> within(week) |> nth(1)
```

`wkstOf` → `Sun`。`run(src, { from: '2026-10-05', to: '2026-10-19', tz: 'Asia/Tokyo' })` → `2026-10-05`・`2026-10-12`（月曜）。3 行目を外し 4 行目を `@B # 在圏` にしても `wkstOf` → `Sun`・評価器は月曜。

再現 4（年末年始の項の 2 形・JP_PREMISE＋`@JP`・2026-10-01..2027-10-01・Asia/Tokyo・温まった後）:

```
# 562 ms・6 点
everyDay |> filter(d => (month(d) == 12 and dayNo(d) >= 29) or (month(d) == 1 and dayNo(d) <= 3))
# 32 ms・同じ 6 点（2026-12-29 … 2027-01-03）
ye = everyDay |> within(year) |> last
ny = everyDay |> within(year) |> nth(1)
ye | (ye |> shift(-1, unit: day)) | (ye |> shift(-2, unit: day)) | ny | (ny |> shift(1, unit: day)) | (ny |> shift(2, unit: day))
```

`takeLast(3)`／`take(3)` の形は「窓付き入力は取らない」（ADR-52）で止まるので使えない。

### 確認したが所見にしなかったもの（根拠つき）

- **`gridCells` の境界**: wkst 7 通り＋未知の値（`'XXX'`→Mon）× 2026–2027 の 24 か月で、各行 7 列・先頭列の曜日＝wkst・当月の日が 1 日から月末まで全部・日付が連続・行数 4〜6 を機械で確認、違反 0。2027 年 2 月（月曜始まり・28 日）も 4 行で正しい。
- **`monthsIn`／`monthsWindow` の年跨ぎと空**: `2026-12-01..2027-02-01` → 12 月・1 月。`from = to`・`to < from` は 1 か月を返し、`run` が「評価範囲が逆順」の KairosError を投げて黄枠に出る（起動は止まらない）。`monthsWindow('Asia/Tokyo', 12, 2026-12-31T20:00Z)` → `2027-01-01..2028-01-01`、`America/New_York` で `2027-01-01T03:00Z` → `2026-12-01..2027-12-01`＝tz の市民日で「今日」を読めている。
- **URL のハッシュの往復**: `parseCalendarHash('#s=%%%')` → null（`b64d` の失敗は握りつぶしではなく null に落ち、起動は最初の例へ）。`s=` 空 → `undefined` → 最初の例。`f`／`t` に `garbage`・`2026-1-1`・`2026-10-01T00:00` が来ても `run` の KairosError「日付は YYYY-MM-DD」が黄枠に出る。`2026-02-30` は評価器が 3 月 2 日に正規化して受け、格子は 2 月（空）から始まるが、評価器側の既存挙動で `type=date` の欄からは来ないため所見にしない。
- **表示 tz ≠ 前文 tz のラベル**: 目覚ましを `America/New_York` で → `2026-10-01T17:30`。`pointsByDay` の `slice(0,10)`／`slice(11,16)` は揃う。
- **`nameOf`／`withName` と .ics の予定名**: `buildIcs` の `titleFromSource` と同じ規則（先頭の非空行が `#`・`#` の連続と空白を落とす・BOM は `trim` が落とす）。`#` だけの行は `nameOf` が `''`、`titleFromSource` が `undefined` → どちらも「Kairos」に落ちる。印刷の題・.ics の SUMMARY・URL の `s` は同じ 1 行に従う。
- **.ics・印刷・Playground の経路**: `.ics` は `buildIcs` をそのまま呼ぶ（引数も Playground と同じ `series: !split`）。格子と .ics は同じ `run`。Playground の「カレンダーで見る」は起動時の例の `change` → `evaluate()` → `updateCalendarLink()` で href が入るので、評価前にリンクが空のまま残ることはない。
- **祝日の赤の出所**: Playground 由来の式でも言語の表（ja＝JP・en＝US）から引き、式の premise とは独立。ページに「Playground の例と同じ表」と明記してあり、意図どおりと読んだ。
- **export の変更で壊れる呼び手**: `b64e`／`b64d`／`shareHash`／`JP_PREMISE`／`US_PREMISE` を module 直下に出した件。`tools/` 配下に参照なし（`pg-link.mjs` は Buffer で独立）。F146 は正規表現での切り出しから import に書き換わり、`b64d(b64e(big)) === big` も見る。
- **文書の整合**: テスト数 979 は 6 入口と実スイートが一致（check-test-count OK・doc-consistency も緑）。`impl/README` の「42 ファイル・979 本」は実数と一致。`calendar.test.ts` は 6 本（例 5＋まとめ 1）で CHANGELOG の記述と一致。JP／US の `covering: 2026..2027` は日英ページの「2026・2027 年分」と一致。`recipes/README` のアンカー（`#共有-url-の形`・`#the-shape-of-a-shared-url`）はレイアウトの見出し id 生成規則（空白→`-`・小文字化・非 ASCII は保持）と一致。日英の HTML は同じ id・同じ導線・同じ注意書き（`[from, to)`・1 点ずつ・webcal なし）。
- **witness の実効性**: `monthsIn` の `to` 排他・`wkstOf` の `@` 優先・`plainWarning` の文言・`parseCalendarHash` の null は、いずれも対応する行を変えると赤になる形で書かれている（所見 7 の `sanitizeValues` だけ穴）。`calendar.test.ts` の所要は 18 s（alarm 6.9 s・lesson 6.4 s）で、例ごとに `it` を分けた判断は所見 4 の実測と整合する。

### 読んだ順と掛けた時間

1. 指示書・`MAINTENANCE.md`・PR 本文
2. 差分全文: `calendar/core.js` → `calendar/index.html`・`en/calendar/index.html` → `playground/core.js`・`playground/index.html`（日英）→ `impl/test/calendar.test.ts`・`boundary-checklist.test.ts` → README 日英・`en/spec`・`llms.txt`・`impl/README`・`recipes/README` 日英・CHANGELOG
3. 検査 3 本（typecheck・vitest JST／UTC・check-test-count）を head の作業木で
4. 純関数の再現（`node` で `calendar/core.js`・`playground/core.js`・`playground/js/index.js` を直接 import）: 境界の総当たり・URL の値・wkst・tz・性能
5. ヘッドレスのブラウザで `/calendar/`・`/en/calendar/` を静的配信して起動時の例外と描画を実測
6. 変異 1 本（`sanitizeValues`）

掛けた時間: 約 40 分（検査の待ち時間を含む）。

