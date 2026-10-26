# 保守の手引き（Maintenance）

Kairos を「止めずに保つ」ために要る作業は少ない。年 1 回の表の更新と、ドメインの更新、CI が赤になったときの見分けだけ。
仕様は 1.0 で凍結しているので、言語を変える作業は無い（方針は [design/75-stewardship.md](design/75-stewardship.md)）。

## 1. 年 1 回: 例の祝日表を翌年まで延ばす

Playground の例（暮らしの例・業務の例）は前文に祝日表を埋めている。表は年で尽きる。
言語は年で腐るデータを配らないが、**例は資産として毎年延ばす**。表の外は ⚠ の範囲外註釈で黙らない。
ただし「今日から 4 週間」の有視界の例は、表の終端の 28 日前から ⚠ が出る＝式を読まない人の入口としては壊れたのと同じになる。

### 時期

- 毎年 2 月。内閣府が翌年の「国民の祝日」を公示し、米国 OPM の連邦祝日も揃う。
- 期限は 10 月初め。鮮度の検査（下の 2）が赤になる。

### 出所（上流の権威は上流に）

- 日本: 内閣府「国民の祝日について」の CSV https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv（Shift_JIS。`iconv -f SHIFT_JIS -t UTF-8`）。
  振替休日・国民の休日も含める。cascade の例の `statutory` だけは祝日のみ（休日は規則で導くのが見せ場）。
- 米国: OPM Federal Holidays https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/ 。observed の日付で書く。

### 対象

- `playground/core.js` の表 7 箇所: `JP_PREMISE`・`payday`・`monthend3`・`cascade`（statutory）・`US_PREMISE`・英語の `payday`・`monthend3`。
  `holidays2027 = [] covering: 2027..2027` の例（空の表の教材）は触らない。binding 名に年を入れない（`holidays`・`federal`）。
- witness の期待一覧: `impl/test/next-window-and-playground.test.ts` の年ごとの定数。同じ出所から写す。
- `impl/examples/*.kairos`（CLI の例）は対象外。⚠ を見せる教材のまま残す。

### 手順

1. CSV を取得し、翌年の行を抜く。`core.js` の各表に `YYYY-..` の行を足し、`covering: 2026..YYYY` の右端を延ばす。
2. `impl/` で `npx vitest run test/next-window-and-playground.test.ts test/ics.test.ts`。通ったら全スイート（`npx vitest run` と `TZ=UTC npx vitest run`）。
3. `spec/CHANGELOG.md` の次の追補に 1 行「例の祝日表を YYYY 年まで延長」。
4. Playground の指紋は変わらない（`core.js` は指紋の外）。再構築は不要。

### 注意

- `.ics` の UID は式の字面・順番・tz だけから決まる。表を延ばしても UID は変わらない＝取り込み直しは「更新」になる。

## 2. 鮮度の検査（Freshness）

- `.github/workflows/freshness.yml` が毎月 1 日に、表の終端が「今日＋4 週間＋余裕 60 日」より手前になっていないかを検査する。
- 赤＝翌年分を足す時期。公開物（サイト・npm・Release）は壊れていない。1 の手順で延ばせば緑に戻る。
- 同じ検査は push のたびの CI にも入っている。

## 3. CI が赤になったとき

公開物は CI と独立に残る。赤は「見栄え」と「次の公開の支障」の問題で、利用者の手元は壊れない。見分け方:

| 赤の種類 | 原因 | 直し方 |
|---|---|---|
| 鮮度 | 表の終端が近い | 1 の手順 |
| actions の非推奨・Node の版 | GitHub や Node の側の変更 | `.github/workflows/*.yml` の `uses:` の版や `node-version` を上げる |
| Dependabot の PR | 開発依存の更新 | 配布物に影響しない。取り込むなら `impl/`・`mcp/` で `npm install` → 検査 → commit。TypeScript は 6 系に留める（7 は Playground 構築に要る JS API を同梱しない） |
| テスト数の突合 | 入口 6 箇所の記載と実スイート数のずれ | `node impl/scripts/check-test-count.mjs` の指す箇所を実数に |
| 文書の整合（doc-consistency） | リンク切れ・孤立ページ・表記 | 検査のメッセージが指す箇所を直す |

## 4. 公開の仕組み（版を出すとき）

- タグ `v1.0.x` を push すると `.github/workflows/publish-impl.yml`・`publish-mcp.yml` が起動し、environment「npm」の承認で npm に公開する（trusted publishing・来歴つき）。
  impl の公開後に Windows 単体 exe が組まれ、Release の資産に付く。各 workflow の冒頭の註に手順がある。
- 公式 MCP Registry への登録は `mcp/server.json` の版を上げて `mcp-publisher validate` → `publish`。
- 版を出さなくても Kairos は壊れない。出すのは直したいものがあるときだけ。

## 5. 受け付けを止めるとき（保守モード）

- README の先頭に「保守モード」であること・公開物はそのまま使えること・fork は自由（Apache-2.0）であることを書く。
- issue には同じ文面で返す。約束はしない。
- ドメイン（kairos-lang.org）だけは切らさない。切れるとサイトと検定サイトが開かなくなる。

---

## Maintenance (English summary)

Kairos is frozen at 1.0, so maintenance is small:

1. **Once a year (February), extend the example holiday tables** in `playground/core.js` (7 tables; sources: Cabinet Office of Japan CSV and OPM Federal Holidays), update the expected lists in `impl/test/next-window-and-playground.test.ts`, run the suite, and add one line to `spec/CHANGELOG.md`. The CLI examples under `impl/examples/` stay as they are (they show the ⚠ annotation on purpose).

2. **Freshness check**: `.github/workflows/freshness.yml` runs monthly and goes red when a table ends within "today + 4 weeks + 60 days". Red means "extend the tables"; nothing published is broken.

3. **Red CI** from deprecated actions, Node versions or Dependabot does not affect published artifacts. Keep TypeScript at 6.x (7.x ships no JS compiler API, which the Playground build needs).

4. **Releases**: push a tag `v1.0.x`; the publish workflows build and publish to npm with provenance after approval, then attach the Windows standalone to the Release.

5. **Maintenance mode**: state it at the top of the README, answer issues with the same text, and keep the domain renewed.

## 補足（2026-10-26・外部レビュー第 14 回 ⑤-M1）

- Playground の業務の例のうち給料日（payday）と月末 3 営業日前（monthend3）は `window:` 型（選んだ日から 120 日）にした＝年次の更新は不要（表は 2027 年まで）。
  固定の範囲（`from`／`to`）の例は、表の行を足すときに範囲も翌年へ送る（過ぎた範囲は「過去の一覧」に見える）。
