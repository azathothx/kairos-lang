# 2026-10-31 公開面レビュー（1.1.0・公開前・読者の目で）

- 対象: 正本 main の HEAD **f02da7b**（1.1.0 候補・981 テスト・公開予定 2026-11-04）。比較の基準＝1.0.12 の公開 commit **3789915**（印を日付へ替えた commit。このリポジトリにタグは無い）。
- 読者: 初めて来る利用者・1.0.12 から更新する利用者・仕様から別実装を書く人。コードの正しさは対象外（別のレビューで済み）。
- 方法: 7 観点（約束の整合・数字・準備中の印・日英・リンク・露出・初見の導線）。観点 1・7 と観点 4 は独立に読ませ、所見はすべて当方で再走して確かめた。
  公開ツリーは同期スクリプト（非公開層）と同じ条件で作った（`git archive HEAD` → PRIVATE_PATHS を除去 → BANNED と `\bkoyo\b` の grep）。
- 版の実走: 1.1.0＝HEAD の `impl/src/cli.ts`、1.0.12＝3789915 の impl を `git archive` で展開したもの。どちらも `npx tsx src/cli.ts`。
- 本書は公開ツリーに収蔵されるため、禁止語そのものと非公開の文書のパスは書かない。「手順書」＝1.1.0 の公開手順書、「Release 草稿」＝1.1.0 の Release 本文の草稿で、どちらも非公開層にある。

## 0. 総評

- 件数＝**HIGH 4・MEDIUM 19・LOW 9**（計 32）。
- 数字の芯は揃っている。実スイートは 981 で入口 6 箇所と一致。ADR 55・MCP のツール 4・reference 36×2・上限（grid 2^24・strideBy 2^26）・Playground 指紋 `5051c86699fe`（再構築で差分なし）も一致。Playground の例 deadline は日英とも 18 点。
- 「準備中」の印は手順書の一覧と過不足なく一致（9 行・7 ファイル＋windows-admin 日英）。
- **公開を止めるもの 2 点**:
  - 同期スクリプトの BANNED に 2 ファイルが掛かり、publish が exit 1 で止まる（H1）。
  - 1.0.12 の公開後に入ったレビューの記録と CHANGELOG に、製品名・対話の痕跡・非公開文書のパスが入っている（H2）。
- **約束の芯 2 点**:
  - Release 草稿が「1.0 の式の意味は不変（同名の束縛を除く）」と言うが、1.0.12 で通っていた 6 形が 1.1.0 で止まる（H3）。
  - 未公開の HTTP の殻のパッケージ名と振る舞いを、npm に同梱される MCP README が約束している（H4）。

## 1. 所見

| # | 重さ | 場所（ファイル:行） | 何が（期待と実測） | 再現 | 直し方の案 |
|---|---|---|---|---|---|
| H1 | HIGH | `impl/test/at-time-of-day.test.ts:147`・`design/60-reviews/2026-10-31-cloud-review-pr8-tck.md:49` | 期待＝公開ツリーで BANNED 0 件。実測＝2 件。前者はテストの説明文に供給側の製品名（BANNED の 4 番目の語）。後者は非公開の作業日誌のファイル名（BANNED の 7 番目の語）。同期スクリプトは exit 1 で止まる。前者は ebbb141（10-26）、後者は ced1f78（10-31）で入った。 | 公開ツリーを作り `grep -rnE "$BANNED" . \| grep -v koyomi` → 上の 2 行 | テストの説明文から製品名を外す（「供給側の現行の前文の形」など）。60-reviews の 49 行目は「非公開の層」とだけ書く。手順書の merge 節の BANNED grep の対象に `impl/test` と `design/60-reviews` を足す（今は README・spec・reference・en・llms.txt・impl/README だけ）。 |
| H2 | HIGH | `design/60-reviews/2026-10-29-*.md:1・3・4・9・107`、`2026-10-30-*.md:1・3・4`、`2026-10-31-cloud-review-pr8-tck.md:1・3・4・49`、`2026-10-31-cloud-review-pr9-calendar.md:1・4`、`2026-10-26-docs-review-14-v1012.md:4`、`design/60-reviews/README.md:13-16`、`spec/CHANGELOG.md:906`（および 891・946 の「クラウド機械レビュー」） | 期待＝公開ツリーに製品名・対話の痕跡・非公開文書のパスが無い。実測は次の 3 種。<br>・製品名とコマンド名：レビュー道具の名、端末で打ったコマンド列、枝名の接頭辞。<br>・運用の痕跡：道具の利用枠と課金の話、誰の端末で走らせたか、判断者の呼称。<br>・非公開の指示書のパス：非公開層の cloud-sessions 配下 3 本。<br>どれも 3789915 の後に入った（3789915 の 60-reviews には該当 0）。CHANGELOG 906 行は非公開リポジトリの PR 番号とコマンド名を含み、公開側の「#6」は別物を指す。 | 道具名・コマンド名・運用語・非公開の指示書の配下名を `git grep -nE` で HEAD の `design/60-reviews` と `spec/CHANGELOG.md` に掛ける（MCP の設定例を除く。語の一覧は本書に書かない＝本書も公開ツリーに入るため）→ 上の行。同じ grep を 3789915 に掛ける → 0 件 | 収蔵の冒頭（出所の行）を「機械レビュー（2026-10-29・候補 dd4b509）」の形に正規化する。ファイル名の道具名も中立名にする。非公開パスは「非公開の指示書」とだけ書く。CHANGELOG 906 は「機械レビュー（2026-10-29）」に。 |
| H3 | HIGH | Release 草稿:1・16（英 24・35） | 期待＝上位互換を破る形が告知される。実測＝「1.0 で合法だった式の意味は変わりません（新語 3 つと同名の top-level 束縛を除く）」とあり、ラベル名の禁止が抜けている。予約語の項は「premise ブロック内…は従来どおり」と 3 語まとめて言うが、`labelOrdinal` は premise 内でも静的エラー。1.0.12 で exit 0 だった次の形が 1.1.0 で exit 1 になることは 1 行も無い。<br>(a) `chronos grid 60s` を 1 日の範囲で全列挙（1.0.12 は 1440 点）→ 上限 2^24 の文言<br>(b) `everyInstant \|> strideBy(1s, from: 2024-12-01) \|> take(2, …)` → 上限 2^26<br>(c) `--from 2026-02-30`（1.0.12 は 03-02 と読む）→「日付が実在しない」<br>(d) `--from 0099-01-01`（1.0.12 は 1999 年として出力）→ 評価範囲の下限<br>(e) `Gregorian with {…}` の下の `at(2026-01-01T09:00)` → `at:` の誘導<br>(f) ラベル名 `before`<br>MCP の `tz` の値域・本体式の上限 100・`-32602` も無い。「変わらないもの」の 18 行目だけが目に入る。 | `ph = day cycle [before, after] anchor: 2026-01-01` → 1.0.12 は 2 点で exit 0、1.1.0 は「before は 1.1 で追加した語（予約語）——ラベル名（cycle のラベル列・labels:）にも使えない（§4.8）…」で exit 1。premise ブロック内の `labelOrdinal = everyDay` → 1.1.0 は「core 語 labelOrdinal の再定義は静的エラー（§4.8）」で exit 1。`grep -n "実在しない\|2\^2[46]\|100" <Release 草稿>` → 0 件 | 冒頭の除外条件を「同名の束縛とラベル名を除く」に直す。予約語の項は「`since`／`before` は premise 内で従来どおり・`labelOrdinal` は静的エラー」と分ける。「参照実装と MCP の堅牢化（言語不変・1.0.12 から止まる形）」の 1 項を日英に足し、(a)〜(e) と MCP の 3 点を並べる。 |
| H4 | HIGH | `mcp/README.md:104`・`mcp/README.ja.md:100`（npm の kairos-lang-mcp に同梱）・`spec/CHANGELOG.md:922` | 期待＝公開面が実在するものだけを約束する。実測＝MCP README は「HTTP の殻 `kairos-lang-http` は未知の鍵を `usage` で止めます」と、パッケージ名と振る舞いを書いている。CHANGELOG は「`kairos-lang-http`・1.1.0 の後に公開」。パッケージは npm に無く、main にも無い。 | `curl -s -o /dev/null -w '%{http_code}' https://registry.npmjs.org/kairos-lang-http` → 404。`git grep -l kairos-lang-http HEAD` → 公開面は上の 3 ファイルだけ（残りは非公開層） | MCP README 日英の括弧書きを削る。CHANGELOG 922 は「セルフホスト用の HTTP の殻（未公開）」に留め、名前と予定は出さない。 |
| M1 | MEDIUM | `spec/CHANGELOG.md:842`（1.1 節の要約）・`:904`・`:924` | 要約は「既存の式の意味は不変…新語と同名の top-level 束縛と、新語をラベル名に使った定義だけが静的エラー」と書く。H3 の (a)〜(e) は本文の小節（895〜926）にはあるが、要約と食い違う。(f') premise 内の `labelOrdinal` は CHANGELOG に記載が無い。924 の「上限を 2^27 から 2^26 に」の 2^27 は公開前の途中の値で、1.0.12 に 2^27 の上限は無い。 | `git show 3789915:impl/src/eval.ts \| grep -n "配列の上限"` → 上限は配列長だけ。H3 の再走 | 要約に「1.0.12 から止まる形」の箇条を立てる。924 は「1.0.12（配列長だけ）→ 2^26」と書く。 |
| M2 | MEDIUM | `spec/30-body-layer.md:295-301`（§4.8） | §4.8 は「同名の利用側 top-level 束縛は誘導つき静的エラー」「『既存の式の意味は不変（新語と同名の束縛を除く）』と正確に述べられる」とだけ書き、ラベル名の禁止を書いていない。ところが実装のラベル名のエラー文は根拠を「（§4.8）」としている。ラベル名の禁止は §5.4（40-grammar:148・156）にだけある。 | `grep -n ラベル名 spec/30-body-layer.md` → 0 件。エラー文は H3 の再現 | §4.8 にラベル名の 1 文を足し、除外条件を「同名の束縛とラベル」に直す（日英）。 |
| M3 | MEDIUM | `llms.txt:19-22` | 「the three new words are reserved (a top-level binding of the same name is a static error)」とあり、ラベル名と premise 内の `labelOrdinal` が抜けている。H3 の (a)〜(e) にも触れていない。 | H3 と同じ | 「…or a label of that name」と、1.1 の CHANGELOG の参照実装の上限への 1 句を足す。 |
| M4 | MEDIUM | `skills/kairos-authoring/SKILL.md:305`・`en/skills/kairos-authoring/SKILL.md:306` | 「束縛やラベルを since・before・labelOrdinal と名付ける｜…1.0.12 では黙って別の意味になる」とあるが、1.0.12 では利用者の定義どおりに動く。 | 1.0.12 で `since(p) = s => s \|> filter(t => epochOrdinal(day, t) >= epochOrdinal(day, p))` に続けて `everyDay \|> since(2026-01-03)` → 01-03・01-04。H3 の cycle は 1.0.12 で 2 点 | 「1.0.12 では通るが、1.1 に上げると静的エラー（改名が要る）」に直す。 |
| M5 | MEDIUM | `spec/CHANGELOG.md:842・844・931・933`・`impl/README.md:262`・Release 草稿:1・24 | 「1.0 の既存スイート」が CHANGELOG と手順書:4 では 858、Release 草稿では 880（1.0.12 公開時の README は 862）。CHANGELOG の要約は witness 49（labelOrdinal 24・since／before 25）・doctest 8、細目 931 は「22 本」。実数は 24＋32＝56（Release 草稿の 56 が正しい）。impl/README は since-before を 25 本とする（実数 32）。 | `grep -cE "^\s*(it\|test)(\.each)?\(" impl/test/label-ordinal.test.ts impl/test/since-before.test.ts` → 24・32。vitest の JSON でも同じ。`git show 3789915:README.md \| grep -oE "\([0-9]+ tests\)"` → 862 | 「既存」がどの時点のスイートかを決めて 1 つの数にし、3 面（CHANGELOG・Release 草稿・手順書）を揃える。CHANGELOG と impl/README の本数を実数に直す。 |
| M6 | MEDIUM | 手順書:41・65・66・88 | 公開のタグ文（公開リポジトリに残る）とコミット文の例が「973 tests」「973 テスト」のまま。「Release 本文のテスト数 916」「README 916 tests」もある。実数は 981（入口 6 箇所・Release 草稿も 981）。 | `grep -nE "916\|973" <手順書>` | 981 に揃える。数は check-test-count の値を写す、と 1 行足す。 |
| M7 | MEDIUM | `spec/30-body-layer.md:78-79`（§4.3）・§4.9（`month(2020)` を `lunarMonth(13)` に差し替え）・`spec/50-glossary.md`（W(v) の行） | 凍結した 1.0 の規範文が書き換わっているのに CHANGELOG に記録が無い。<br>・§4.3：「曖昧なまま `of:` を省くのは静的エラー」→「名指した窓が連鎖に無いときは静的エラー」<br>・§4.9：「`month(2020)` 級のタイポを封じる」→「`month(13)` は静的エラーにならず空」<br>実装は 1.0.12 と同じ（`month(13)` はどちらの版も 0 点・exit 0）なので、文書を実装に合わせた訂正にあたる。 | `git log --oneline 3789915..HEAD -- spec/30-body-layer.md` → d79db20。`grep -n "of:\|month(13)\|lunarMonth(13)" spec/CHANGELOG.md` → 1.1 節にも追補 29 にも無い | 1.1 節の「文書」に「1.0 の文の訂正（意味は不変・実装の挙動に合わせた）」を 1 行足す。 |
| M8 | MEDIUM | `spec/30-body-layer.md:95`・`reference/roll.md:20`・`reference/epochOrdinal.md:12`・`stdlib/gregorian.md:61`（en の対応：`en/spec/30-body-layer.md:129`・`en/reference/roll.md:32`・`en/reference/epochOrdinal.md:24`・`en/stdlib/gregorian.md:76`）、`README.md:58`・`README.ja.md:125`・`llms.txt:109・123` | 「参照実装 1.0.12 では未実装」「1.0.12 は既定紀元のみ」「checked on 1.0.12」が 1.1.0 の公開面に残る。手順書の印の一覧に無い。1.1.0 でも `Modified` は未実装なので、版つきの書き方だと「1.1.0 で実装済み」と読める。 | `grep -rn "1\.0\.12 では未実装\|1\.0\.12 は既定紀元" spec reference stdlib`。1.1.0 で `monthEnd \|> roll(Modified(month), on: bizDay)` → 「適用できない値: string」 | 「参照実装では未実装（impl/README）」と版を外す。診断の例は「checked on 1.1.0」に（文言は impl/src/eval.ts に現存）。手順書の一覧にも加える。 |
| M9 | MEDIUM | `en/spec/40-grammar.md:176`（正本 `spec/40-grammar.md:156`） | 日本語は「ラベル名にも使えない。`since(p)`／`before(p)` の `p` は呼び出し時に検査する（時点でなければ止まる——列が空でも）」。英語は「…is also a guided static error.」で終わり、2 文が無い。source_sha は同じ commit で更新されたので、整合検査に掛からない。 | `git show 4b93dd6 -- spec/40-grammar.md en/spec/40-grammar.md` → 日本語は 2 箇条に追記、英語は 1 箇条だけ | 英語に 2 文を足す。 |
| M10 | MEDIUM | `en/spec/30-body-layer.md:298`・`en/reference/since.md:58`（正本 `spec/30-body-layer.md:233`・`reference/since.md:47`） | 「時刻での切り出し」（日時での切り出し）を "cutting at a time of day" と訳している。同じページの落とし穴（`en/reference/since.md:66-68`）は「単独時刻は渡せない」と言うので、訳と食い違う。 | `grep -n "time of day" en/spec/30-body-layer.md en/reference/since.md` | "cutting at an instant (a dated date-time)" に直す。 |
| M11 | MEDIUM | `README.md:180` | 「pass `--tz America/New_York` for the example at the top」とあるが、冒頭の例 `impl/examples/payday.kairos` の前文は `tz: "Asia/Tokyo"`。日本語（`README.ja.md:92`）は「例の前文に合わせて `--tz Asia/Tokyo`」で整合している。 | `npx tsx src/cli.ts list examples/payday.kairos --from 2026-01-01 --to 2026-03-01 --tz America/New_York` → `2026-01-22T10:00`…（日付が 1 日ずれ、時刻が付く） | 「match the premise's `tz:` (`--tz Asia/Tokyo` for payday.kairos)」に直す。 |
| M12 | MEDIUM | `README.ja.md:30-34`（対応 `README.md:144-147`） | 英語の README には 1.1 で付録 B（供給側プロファイル）への案内が加わったが、日本語の README には付録 B が無い。spec/README は日英とも付録 B を挙げている。 | `grep -n "付録 B\|61-supply" README.ja.md` → 0 件。`grep -n "appendix B" README.md` → 147 | 付録 A の文の後に付録 B の 1 文とリンクを足す。 |
| M13 | MEDIUM | `spec/60-firing-layer-profile.md:51`・`en/spec/60-firing-layer-profile.md:60` | 付録 A は今も「時刻起点の切り出しは式（`epochOrdinal` の序数比較）か発報層で」と書く。1.1 では `since`／`before` が正準（reference/since.md・40-examples/11）。 | `grep -n "序数比較" spec/*.md` → 付録 A だけが残る | 「式（`since`／`before`。1.0.12 以前の評価器なら `epochOrdinal` の序数比較）」に（日英）。 |
| M14 | MEDIUM | Release 草稿:3・20 と 24・35・39 | 日英の項目がずれている。<br>・npm の 2 リンクは日本語だけ。<br>・`MCP: npx -y kairos-lang-mcp@1.1.0` は英語だけ。<br>・予約語の項は、日本語が 3 語を列挙し、英語は列挙しない。<br>1.0.12 の本文は両方に npm と MCP の行がある。 | `grep -n "npm:\|MCP:" <Release 草稿>` | 日本語に MCP の行、英語に npm の行を足し、英語の予約語に 3 語を明記する。 |
| M15 | MEDIUM | `en/README.md:13`・`:7-11` | 「日本語版（正本）はこちら」のリンク先が `../README.md`（英語の README）。正しくは `../README.ja.md`（2026-07-26 から続く）。英語の目次は spec・reference・stdlib だけで、1.1 で増えた en/calendar・en/skills と既存の en/recipes が無い。 | `sed -n 13p en/README.md` → `[日本語版（正本）はこちら](../README.md)` | リンクを `../README.ja.md` に直し、目次に 3 行足す。 |
| M16 | MEDIUM | `spec/CHANGELOG.md:1-5`・入口のリンク `README.ja.md:40`・`README.md:232`・`spec/README.md:8` | 1.0.12 の利用者が「何を見るべきか」を冒頭から辿れない。題は「RC 履歴」・古い順で、1.1 節は 960 行中の 835 行目。入口のリンクはどれもアンカーなしで、着くのは「RC1 → RC2」。英語の読者には「(Japanese)」の注しかない。 | `grep -n "^## " spec/CHANGELOG.md` → 7 行目が RC1、835 行目が 1.1 | 冒頭に「最新: 1.1（→ 節へ）・1.0.12 からの更新で見る点（H3 の一覧へ）」の数行を置く。見出しは公開日に変わるので、固定の HTML アンカーにする。題を「版と RC の履歴」に。 |
| M17 | MEDIUM | `README.md:1-40` | 英語の README の最初の画面に「どう試す」と 1.1 が無い。Playground は 160 行目（1.0.12 では 148 行目）、ステータス（1.1）は 231 行目、カレンダーは 240 行目。日本語はステータスが 39 行目、カレンダーが 49 行目で、ほぼ成り立つ（Playground は 72 行目）。 | `grep -n -iE "playground\|Version 1\|calendar/" README.md` → 160・231・240。`git show 3789915:README.md \| grep -n -i playground` → 148 | 日英とも例のコードの直後に「Try: Playground · Calendar · What's new in 1.1」の 1 行を置く。 |
| M18 | MEDIUM | `spec/30-body-layer.md`・`spec/40-grammar.md` の予約語の段と H3 の (f') | 予約語の範囲（束縛・ラベル・premise 内の `labelOrdinal`）を 1 箇所で読める節が無い。§4.8・§5.4・CHANGELOG・Release 草稿・llms.txt・SKILL で、言っている範囲が少しずつ違う（M2・M3・M4・H3 の根）。 | M2〜M4・H3 の再現 | §4.8 を予約語の正本にし、他の面は「§4.8」を指すだけにする。 |
| M19 | MEDIUM | `spec/CHANGELOG.md:885・898・940` | 公開の履歴に、内部の便の呼称と日付（「還流 2026-10-26 緊急便」「§2」）が新しく 4 箇所入った。読者は便の中身を引けない。「還流」自体は 1.0 から使われている語だが、便の節番号まで出すのは 1.1 節が初めて。 | `grep -n 緊急便 spec/CHANGELOG.md` → 885・898・940 | 「供給側からの欠陥報告（2026-10-26）」の形にし、節番号は出さない。 |
| L1 | LOW | `llms.txt:219-220` | カレンダーページ（/calendar/・/en/calendar/）への案内が無い（README 日英・recipes/README 日英・Release 草稿にはある）。 | `grep -c "calendar/" llms.txt` → 0 | 「## Optional」の Playground の行の隣に 1 行足す。 |
| L2 | LOW | `llms.txt:18`・Release 草稿:26 | labelOrdinal の説明が "declared range" / "the range that binding B declares"。用語集（`en/spec/50-glossary.md:107`）と reference は "declared value domain"。"range" は評価範囲 [from, to) と紛れる。 | `grep -n "declared range\|range that binding" llms.txt` | "declared value domain" に揃える。 |
| L3 | LOW | `README.md:177`・`en/playground/index.html:60` | `範囲外` を "(out of range)"・"out-of-range provenance" と訳している。用語集（`en/spec/50-glossary.md:35`）と他の面は "out-of-coverage"。 | `grep -n "out of range\|out-of-range" README.md en/playground/index.html` | "out-of-coverage" に揃える。 |
| L4 | LOW | `en/spec/30-body-layer.md:552`（mermaid 図） | "claim of completeness"（用語集・付録 B は "completeness claim"）。 | `grep -n "claim of completeness" en/spec/30-body-layer.md` | "completeness claim" に揃える。 |
| L5 | LOW | `spec/README.md:6-11`・`skills/kairos-authoring/SKILL.md:43-48` | 1.1 で新しく 400 字を超えた段落が 2 つ（473 字・539 字）。 | 段落長の道具（非公開層）を両ファイルに掛ける | 状態行は 1 文目で段落を切る。 |
| L6 | LOW | `README.md:153`・`README.ja.md:66`・`llms.txt`（Language vs implementation の項） | 適合の要約が「同じ可否・同じ点列・doctest」だけで、付録 A A.1（`spec/60-firing-layer-profile.md:68`）と spec/00-intro が MUST にしている「診断の文言」が無い。 | 該当行を読む | 3 面に「診断の文言」を足す。 |
| L7 | LOW | `README.md:240`・`README.ja.md:49`・`recipes/README.md:18・33` | カレンダーへのリンクが相対パス（`calendar/`）。GitHub で読むとソースのディレクトリ（app.js・core.js…）が開く。同じ表の Playground は絶対 URL。サイト上では動く。 | `ls calendar` → `app.js calendar.css core.js index.html` | `https://kairos-lang.org/calendar/`・`/en/calendar/` の絶対 URL にする。 |
| L8 | LOW | Release 草稿:20・39 | テストの内訳（新語 56・doctest 9・機械レビュー 10・カレンダー 6・殻 2＝83）が増分 101（880→981）の 8 割強だけを挙げている。残り 18 本（at の名指し検査の witness 9〈CHANGELOG:940〉・記述スキルの doctest 4・F147・doc-consistency・static-errors）が見えない。「を含む」なので誤りではない。 | vitest の JSON をファイル別に数える：label-ordinal 24・since-before 32・calendar 6・at-time-of-day 25（基準 16）・boundary-checklist 48（基準 34） | 「ほか 18 本（1.0.12 の公開後の修正の witness）」を足すか、内訳を CHANGELOG のテストの節に任せる。 |
| L9 | LOW | `design/60-reviews/2026-09-29-boundary-checklist.md:21` | 見出しに裁定者の呼称（「設計」で始まる裁定の語）。1.0.x から公開済みで 1.1 の差分ではないが、H2 の正規化と同じ扱いになる。 | `git grep -n "裁定「全部」" HEAD -- design/60-reviews` | H2 と同時に「裁定＝全部」のように中立化する。 |

## 2. 確認したが所見にしなかったもの（根拠つき）

- **テスト数 981**：`npx vitest run --reporter=json` → 981。`node scripts/check-test-count.mjs` → 「実スイート 981＝入口 6 箇所」OK。Release 草稿も 981。
- **ADR の数**：`design/20-adr` に `adr-*` が 55 本。README.md:246・en/spec/README.md:47 の「55 ADRs」、README.ja.md:55・spec/README.md:38 の「ADR-01〜55」と一致。
- **上限の値**：grid 2^24＝16,777,216・strideBy 2^26＝67,108,864 は `impl/src/eval.ts:46-47` の定数・impl/README:214・CHANGELOG:904・924 で一致。出力 2^22 は未 merge の PR の値で、main の公開面には出ていない（`grep -rn "2\^22\|4,194,304"` → 0 件）。
- **MCP**：ツールは 4 本（`mcp/src/server.ts` の registerTool 4・README 日英の表・llms.txt:53「four tools」）。`LIMITS`（64 KB・10 年・n 1000・本体式 100）は README の Limits と一致。`npm test` → 13 本緑。`mcp/server.json` の 2 箇所は 1.1.0。
- **Playground**：再構築スクリプト（非公開層）で再構築した結果、差分 0（`IMPL_SOURCE_SHA 5051c86699fe`・`IMPL_VERSION 1.1.0`）。deadline の例は日本語（2026-11-02〜06）が 18 点（11/3 が抜ける）、英語（2026-11-09〜13・America/New_York）が 18 点（11/11 が抜ける）で、手順書の期待どおり。
- **新語の実走**：`labelOrdinal(weekday, d) == 7` → TZ=Asia/Tokyo で 01-04・01-11・01-18。UTC のホストで `--tz` 無しに走らせると `2026-01-03T15:00` などと出るが、README.md:180 と impl/README:37 が「既定は機械の tz」と明記しているので所見にしない。予約語 `since(p) = …` → 「since は 1.1 で追加した語（予約語・stdlib の標準糖衣）…」で exit 1。
- **エラー文言の面間一致**：予約語（束縛・ラベル）・`since(T14:00)`・`since(3)`・`d < 3`・`d < T09:00`・`weekday(d) < Sat`・値域外・重複値域・引数不足を実走し、spec・reference（labelOrdinal・since・before）・SKILL の診断の列の文言と一致した。1.0.12 の「未知の段: since」も再現した。
- **型違いの順序比較**：1.0.12 も「数値ではない: point」で exit 1 だった。Release 草稿の「文言だけが変わる・終了コードは不変」は正しい。
- **「準備中」の印**：公開ツリーで `grep -rn "準備中\|in preparation"` → spec/README:6・CHANGELOG:835・837・en/spec/README:7・README.md:231・README.ja:39・llms.txt:13・playground/index.html:13・en/playground/index.html:13。手順書の一覧と過不足なく一致。windows-admin 日英の `v1.0.12`・`kairos-1.0.12-win-x64.zip`・`kairos-lang@1.0.12` も一覧どおり。mcp/docs/llms.txt は prepack で llms.txt から写すので、追従する。
- **「予定」「1.1.0 で」の取り残し**：`grep -E "予定\|1\.1\.0 ?(で\|に\|から)\|upcoming\|planned for"` の当たりは、ドメインの語（発火予定・予定 0 件）と 1.1 節の版の記述だけ。H4 の HTTP の殻は所見にした。
- **source_sha**：en の .md 63 本はすべて、日本語正本の sha256 の先頭 12 桁と一致した。見出しの節番号列は spec・stdlib・skills・40-examples/11 の全ペアで一致した。M9 は sha が先に更新された訳漏れ。
- **相対リンク**：3789915 以降に変わった公開の md・html 121 本の相対リンクを機械で辿った。存在しないのは `hn/README.md` の 6 本（`/hn/payday/` など）だけで、各ページの `permalink:` で解決する。playground の `../spec/30-body-layer.html` は Jekyll が生成する。
- **公開 URL**：registry.npmjs.org の `kairos-lang/1.0.12`・`kairos-lang-mcp/1.0.12` → 200（`dist-tags.latest` は 1.0.12・`mcpName` は `io.github.azathothx/kairos-lang-mcp`）。`…/1.1.0` → 404（公開前なので当然）。MCP Registry の search → 200（`io.github.azathothx/kairos-lang-mcp` 1.0.12 active・isLatest）。
- **確かめられなかった URL**：kairos-lang.org・exam.kairos-lang.org・www.npmjs.com・github.com（Release）は、この実行環境の外向きの通信方針でプロキシが 403 を返した（`curl` → `CONNECT tunnel failed, response 403`）。実在は確かめていない。公開日の実測（手順書 §5）で見ること。
- **Playground リンクの式と範囲**：1.1 の差分に、新しく符号化した Playground リンクは無い（`#s=<source>&f=<from>&t=<to>&z=<tz>` の形の説明だけ）。例の式は core.js から復元して実走した（上）。
- **MCP README の設定例の製品名**：クライアントの設定手順（MCP クライアントの名とその設定ファイル名）で、利用者向けの正当な記述として所見にしなかった。
- **「1.0 は凍結」に反する書き方**：spec §3.5・§4.9・20-premise-layer の影の規則・llms.txt はどれも「1.0 で評価エラーだった形の合法化」「1.0 の挙動を据え置き」と書いていて、1.0 の意味が変わると読める文は無かった（M7 の訂正は除く）。
- **その他の 1.1 の要素**：`labelOrdinal(weekday, Sun) == 7` は `wkst: Sun` でも成り立つ（llms.txt の記述どおり）。`.ics` の SUMMARY は 1.0.12 と同じ。`since`／`before` の `p` を引数で注入する形も動く。

## 3. 読んだ順と掛けた時間

1. 手順書 → Release 草稿 → `git diff 3789915..HEAD --stat`（約 10 分）。指定の作業規約のファイルはこのリポジトリに無く、タグ `v1.0.12` も無いので、基準を 3789915 に置いた。
2. 数字：check-test-count（vitest 全走）・ADR・上限・MCP・Playground の再構築（約 15 分）。
3. 公開ツリーの作成 → BANNED・準備中・露出の走査 → 60-reviews と CHANGELOG の差分の grep（約 15 分）。
4. 公開 URL と相対リンク（約 10 分）。
5. 観点 1・7（spec／reference／stdlib／README／CHANGELOG／Playground／skills／llms.txt を 1.0.12 と 1.1.0 で両方実走）と観点 4（en の全ペア・source_sha・訳語）を並行して読み、主要な所見を再走で確かめた（約 30 分）。
6. 統合と本書（約 15 分）。計 約 1 時間 35 分。

## 4. 処置の記録（2026-10-31・main・32 件すべて）

当方の裏取り＝所見の行はすべて HEAD で再現した。処置は同日に main へ積んだ（文書と Release 草稿・手順書）。公開ツリーの再現（同期スクリプトと同じ手順）で禁止語 0 を実測。

| # | 処置 |
|---|---|
| H1 | テストの説明文から製品名を外した（`impl/test/at-time-of-day.test.ts`）。60-reviews の 1 行を「非公開の層」に。手順書の事前 grep の対象に `impl/test` と `design/60-reviews` を足し、最終の門は同期スクリプトの禁止語（公開ツリー全体）と明記。 |
| H2 | 10-29／10-30 の記録を改名（`2026-10-29-machine-review-pr6-rc11.md`・`2026-10-30-machine-review-2-pr6-rc11.md`）し、出所の行を「機械レビュー（日付・回・候補）」の形に。pr8／pr9 の器の行から道具名・枝名・非公開の指示書のパス・運用の話を外した。索引を追従。CHANGELOG 906／891／946 は「機械レビュー（日付）」に。 |
| H3 | Release 草稿（日英）: 除外条件を「同名の束縛とラベル名」に。予約語の項を `since`／`before`（premise 内は従来どおり）と `labelOrdinal`（premise 内でも静的エラー）に分けた。「参照実装と MCP の堅牢化（1.0.12 で通っていた形は 1.1.0 で止まる）」の 1 項を足し、(a)〜(e) と MCP の 3 点を (f) として並べた。 |
| H4 | MCP README 日英の括弧書き（HTTP の殻の名と振る舞い）を削った。CHANGELOG 922 は「セルフホスト用の HTTP の殻（未公開）」に。 |
| M1 | CHANGELOG 1.1 節の要約に「1.0.12 で通っていた形のうち 1.1.0 で止まるもの」の箇条 (a)〜(f) を立て、premise 内の `labelOrdinal` を書いた。924 は「1.0.12 の事前判定は配列の上限だけ・2^27 は公開前の候補の値」に。 |
| M2 | §4.8（日英）にラベル名の 1 文を足し、除外条件を「同名の束縛とラベル名」に。この節が予約語の範囲の正本であると明記（M18）。 |
| M3 | llms.txt にラベル名・premise 内の `labelOrdinal`・1.0.12 から止まる形への 1 句。 |
| M4 | SKILL 日英: 「1.0.12 では通るが、1.1 に上げると止まる（改名が要る）」。 |
| M5 | 「既存スイート」の基準を **1.0.12 系の最終スイート 880（公開後の文書同期を含む）** に統一（CHANGELOG 要約・テスト節・手順書・Release 草稿）。witness は 56（`labelOrdinal` 24・`since`／`before` 32）。impl/README の since-before は 32 本。CHANGELOG 細目は 24 本。 |
| M6 | 手順書のタグ文・コミット文の例・公開後の確認を 981 に。「数は check-test-count の値を写す」を添えた。 |
| M7 | CHANGELOG 1.1 節「文書」に「1.0 の規範文の字面の訂正（§4.3・§4.9・用語集 W(v)）」の 1 行。 |
| M8 | 「参照実装 1.0.12 では未実装」「1.0.12 は既定紀元のみ」から版を外した（spec §4.4・reference/roll・reference/epochOrdinal・stdlib/gregorian の日英 8 ファイル）。診断の例は「checked on 1.1.0」「1.1.0 で確認」（3 本を 1.1.0 で実走し同文を確認）。手順書の一覧に行を足した。 |
| M9 | en/spec/40-grammar に 2 文（ラベル名・`p` の呼び出し時検査）。 |
| M10 | 訳を "cutting at an instant (a dated date-time)" に（en/spec/30-body-layer・en/reference/since）。 |
| M11 | README.md: 「premise の `tz:` に合わせる（`payday.kairos` は Asia/Tokyo）」。 |
| M12 | README.ja に付録 B の 1 文とリンク。 |
| M13 | 付録 A 日英: 「式（`since`／`before`。1.0.12 以前の評価器なら `epochOrdinal` の序数比較）」。 |
| M14 | Release 草稿: 日英とも npm の 2 リンクと MCP の行を持ち、英語の予約語に 3 語を明記。 |
| M15 | en/README: リンク先を `../README.ja.md` に。目次に Recipes・Calendar・Authoring skill。 |
| M16 | CHANGELOG の冒頭に「最新は 1.1」の段と固定アンカー `v1-1`（見出しの前に `<a id>`）。題を「版と RC の履歴」に。入口 4 箇所（README 日英・spec/README・en/spec/README）のリンクをアンカーつきに。 |
| M17 | README 日英の例の直後に「試す: Playground · カレンダー · 1.1 の変更点」の 1 行。 |
| M18 | M2 と同じ処置（§4.8 を正本に・他の面は §4.8 を指す）。 |
| M19 | CHANGELOG 885・898・940 を「供給側からの欠陥報告（2026-10-26）」の形に（節番号は出さない）。 |
| L1 | llms.txt の Optional にカレンダーページの行。 |
| L2 | "declared value domain" に揃えた（llms.txt・Release 草稿）。 |
| L3 | "out of coverage"／"out-of-coverage provenance" に揃えた（README.md・en/playground）。 |
| L4 | "completeness claim" に揃えた。 |
| L5 | spec/README の状態行の後と SKILL 日英の箇条書きの間で段落を切った（400 字超 0）。 |
| L6 | README 日英と llms.txt の適合の要約に「同じ診断の文言」。 |
| L7 | カレンダーへのリンク 6 箇所（README 日英・recipes/README 日英）を絶対 URL に。 |
| L8 | Release 草稿のテストの内訳に「ほか 15 本」を足し、880→981（＋101）の算術を明記。 |
| L9 | 見出しを「裁定＝全部」に中立化。 |

確かめられなかった URL（kairos-lang.org・exam・www.npmjs.com・github.com）は公開日の実測（手順書 §5）で見る。
