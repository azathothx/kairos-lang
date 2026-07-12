# 標準 premise: ISOWeek

`ISOWeek` は Kairos に同梱される**透明な標準 premise**。`Gregorian` を土台にした**派生的定義**
（`premise → premise`。`../spec/20-premise-layer.md` §3.7、`Fiscal` と同型）で、ISO 8601 の週暦（week date）
——**月曜始まりの週**と、**その年の最初の木曜を含む週を W01 とする週番号**——の語彙を足す。「透明」の意味は
[`gregorian.md`](gregorian.md) と同じで、言語組み込みの魔法ではなく、ユーザーが書けるのと同じ派生的定義の
構文で書かれ、中身を読めて差し替えもできる。言語仕様（`../spec/`）は派生の構文と射影一族の意味論を規定する
にとどめ、ISO 週暦の網羅的な説明は本書が担う。本 premise の設計上の主眼は、設計記録が `label:` 付与式の
初例と整理した ISO 週番号（F40）を、等価変形により**確定語彙だけ**で書き切ったことにある（§4）。語の名
（`isoWeek` など）は premise 公開語であり**仮**（1.0 で一括確定の流儀。言語の**記述語**の命名確定状況は
spec §5.4——premise 公開語はその表の外）。

## 1. 完全定義

```text
premise ISOWeek = Gregorian with {
  isoWeekStart = day |> filter(x => weekday(x) == Mon)
  isoWeek      = day |> segmentBy(isoWeekStart, edges: clip, empties: error)

  isoYearStart = isoWeekStart |> filter(x => (monthNo(x) == 12 and dayNo(x) >= 29) or (monthNo(x) == 1 and dayNo(x) <= 4))
  isoYear      = day |> segmentBy(isoYearStart, edges: clip, empties: error)

  isoWeekNo    = d => ordinalIn(isoWeek, isoYear, d)        # 1..52/53
  isoWeekday   = d => ordinalIn(day, isoWeek, d)            # 月 = 1 … 日 = 7
  isoYearNo    = d => monthNo(d) == 1 and isoWeekNo(d) >= 52 ? yearNo(d) - 1 : (monthNo(d) == 12 and isoWeekNo(d) == 1 ? yearNo(d) + 1 : yearNo(d))
}
```

同梱ソース `../impl/stdlib/isoweek.kairos` は本節と一字一句同じ。使う語彙のうち言語の**記述語**
（`filter`・`segmentBy`・二窓 `ordinalIn`・三項条件）は名が確定済み（spec §5.4）、残りは `Gregorian` の
premise 公開語（曜日ラベルの `weekday`/`Mon`・原子 `day`・暦座標糖衣 `yearNo`/`monthNo`/`dayNo`。
spec §4.9）で名は仮だがすべてリファレンス実装済み——`label:` 付与式を使わない（ADR-34 で確定・実装済みだが、等価変形により不要。§4）。

派生なので `Gregorian` の公開語（`day`・`month`・`year`・`quarter`・`weekday`・`week`・公開境界語・
暦座標糖衣）はすべて継承され、既存語は**一つも上書きしない**。`isoYear` と `year`、`isoWeek` と `week` は
併存する別窓である（後者の対比は §5）。

## 2. 各語

| 語 | 種別 | 説明 |
|---|---|---|
| `isoWeekStart` | 日列（マーカー） | すべての月曜。filter の右辺は曜日ラベル `Mon` に**固定**——前文の `wkst` を読まない（§5）。 |
| `isoWeek` | 窓 | 月曜始まりの 7 日窓。`segmentBy` 製だが weekday の巡回により網羅・無重複が I5 検査で立ち、`within(isoWeek)` に使える（`week` と同じ理屈。`gregorian.md` §4.5）。 |
| `isoYearStart` | 日列（マーカー） | **12/29〜1/4 に落ちる月曜**＝各 ISO 年の W01 の月曜（§4）。年境界の 7 日窓ごとにちょうど 1 つ。 |
| `isoYear` | 窓 | ISO 年窓（W01 の月曜から翌 W01 の前日まで）。52 週（364 日）か 53 週（371 日）。 |
| `isoWeekNo` | 値関数 | ISO 週番号（1..52/53）＝ `ordinalIn(isoWeek, isoYear, d)`。素の二窓序数で出る（§4）。 |
| `isoWeekday` | 値関数 | ISO 曜日番号（月 = 1 … 日 = 7）＝ `ordinalIn(day, isoWeek, d)`。 |
| `isoYearNo` | 値関数 | ISO 年番号（その週の W01 が立つ暦年）。年またぎ週では暦年 `yearNo(d)` と**食い違う**（§6.1）。 |

命名は `Gregorian` の対（窓 `year` ／値関数 `yearNo`）に揃えた——窓が `isoWeek`/`isoYear`、値関数が
`isoWeekNo`/`isoWeekday`/`isoYearNo`。マーカー 2 語も公開語なので、たとえば `isoYearStart` は
「各 ISO 年の第 1 日（W01 の月曜）の列」としてそのまま本体式に使える。

## 3. ISO 8601 の規則

ISO 8601 の週暦は次の 3 つの規約からなる:

- 週は**月曜始まり**。曜日番号は月 = 1 … 日 = 7。ここに文化・用途による選択の余地はなく、規約そのものが
  月曜固定である（週開始一般の文化差は `gregorian.md` §4.3）。
- **W01 ＝その年の最初の木曜を含む週**。最初の木曜は 1/1〜1/7 のどれかで、それを含む週の月曜は 12/29〜1/4、
  日曜は 1/4〜1/10——ゆえにこの週は必ず 1/4 を含む。逆に 1/4 を含む週の木曜は 1/1〜1/7 に落ち、必ずその年
  最初の木曜である。つまり「**1/4 を含む週**」と言い換えられる（§4 の等価変形の第一歩）。
- ISO 年は **52 週か 53 週**。53 週になるのは「1/1 が木曜の年」または「閏年で 1/1 が水曜の年」だけ。
  直近の該当は **2026 年**（W53 = 2026-12-28〜2027-01-03）。

規約の帰結として、暦年の 1/1〜1/3 は前 ISO 年の W52/W53 に、12/29〜31 は翌 ISO 年の W01 に属しうる（§6.1）。

2026 年の W01。年をまたいで 2025-12-29 から始まる:

```kairos
# eval: 2025-12-01..2026-02-01
premise ISO { calendar-system: ISOWeek; tz: "Asia/Tokyo"; wkst: Mon }
@ISO
everyDay |> filter(d => isoYearNo(d) == 2026 and isoWeekNo(d) == 1)
#=> 2025-12-29 2025-12-30 2025-12-31 2026-01-01 2026-01-02 2026-01-03 2026-01-04
```

2026 年は 53 週年（1/1 が木曜）。W53 も年をまたぐ:

```kairos
# eval: 2026-12-01..2027-02-01
premise ISO { calendar-system: ISOWeek; tz: "Asia/Tokyo"; wkst: Mon }
@ISO
everyDay |> filter(d => isoYearNo(d) == 2026 and isoWeekNo(d) == 53)
#=> 2026-12-28 2026-12-29 2026-12-30 2026-12-31 2027-01-01 2027-01-02 2027-01-03
```

木曜規約の見える化——各 ISO 年の W01 の木曜（W01-4）は、その暦年**最初の木曜**に一致する:

```kairos
# eval: 2024-01-01..2028-06-01
premise ISO { calendar-system: ISOWeek; tz: "Asia/Tokyo"; wkst: Mon }
@ISO
everyDay |> filter(d => isoWeekNo(d) == 1 and isoWeekday(d) == 4)
#=> 2024-01-04 2025-01-02 2026-01-01 2027-01-07 2028-01-06
```

`isoWeekday` と組めば「W53 の金曜」のような指定も一式で書ける。範囲内の該当は 2026-W53-5 の一日だけで、
暦年でいえば 2027 年の元日である:

```kairos
# eval: 2024-01-01..2028-06-01
premise ISO { calendar-system: ISOWeek; tz: "Asia/Tokyo"; wkst: Mon }
@ISO
everyDay |> filter(d => isoWeekNo(d) == 53 and isoWeekday(d) == 5)
#=> 2027-01-01
```

## 4. なぜ `label:` なしで書けるか（F40 の還元）

設計記録は ISO 週番号をこう整理していた（F40。`../design/40-examples/04-projections.md` §4.5）: 素の
`ordinalIn(year, week)` では木曜規約が出ない——枠を暦年にして「年内で第何週」を数えると、年初の数日が
前年の W52/W53 であることも、年末の数日が翌年 W01 であることも表現できない。だからこれは週窓に規約つき
番号を**貼る** `label:` 付与式の問題であり、しかもラベル式が「**別の点**（週の木曜）の属する年窓」を参照する
初例だ、と。ADR-30 (5) はこの意味論（付与式は本体層の式・別点の窓参照は可・隣接窓は射程外）を確定した。

しかし W01 の特徴づけをもう一段変形すると、付与式そのものが不要になる:

1. W01 ＝最初の木曜を含む週 ＝ **1/4 を含む週**（§3）。
2. 週は月曜始まりだから、W01 の**月曜**は 1/4 から高々 6 日遡った日、すなわち **12/29〜1/4** に落ちる。
3. 逆に、12/29〜1/4 は連続 7 日だから**月曜をちょうど 1 つ含み**、その月曜が張る週は必ず 1/4 を含む＝W01。

つまり「W01 の月曜」は**暦座標だけの述語**（月曜、かつ 12 月 29 日以降または 1 月 4 日以前）で特定できる。
これが `isoYearStart` であり、`segmentBy` で切れば **ISO 年窓** `isoYear` が立つ。`isoWeek` と `isoYear` は
どちらも月曜切りなので、前者は後者に正確に入れ子——F40 で「出ない」とされた素の二窓序数が、枠を暦年
`year` から `isoYear` に替えるだけで**そのまま ISO 週番号になる**: `isoWeekNo = d => ordinalIn(isoWeek, isoYear, d)`。
「別の点の窓参照」は、窓の切れ目を正しく張り直したことで消えた。

### 4.1 isoYearNo の補正条件の正当性

`isoYearNo` は「d の属する ISO 年の番号」を、窓にラベルを貼らずに暦年 `yearNo(d)` の**点ごと補正**で出す。
三項条件の 2 分岐が正当なのは、補正が要るのが年またぎ週の**両端の高々 3 日ずつ**に限られるからである:

- **1 月で `isoWeekNo(d) >= 52`** — d が当年の ISO 年に属するなら、ISO 年の開始（12/29〜1/4）から 1/31 まで
  は高々 34 日＝週番号は**高々 5**。ゆえに 52 以上になるのは前 ISO 年の最終週（W52/W53）に属する場合だけで、
  それは 1/1〜1/3 にしか起きない（1/4 は常に W01 に入る）→ 暦年 − 1。
- **12 月で `isoWeekNo(d) == 1`** — d が当年の ISO 年に属するなら、12/1 でも開始から 332 日目以降＝週番号は
  **48 以上**。ゆえに 1 になるのは翌 ISO 年の W01 に属する場合だけで、それは 12/29〜31 にしか起きない
  → 暦年 + 1。

補正条件（52 以上・1）は当年所属時の到達域（高々 5・48 以上）と重ならないので、誤爆しない。

### 4.2 トレードオフ——値関数形と label: 形

この値関数形には設計上のトレードオフがある。**「同じ週の 7 日が同じ `isoYearNo` を持つ」ことが、窓の構造では
なく式の正しさに依存する**——点ごとに計算するので、補正条件を書き損ねれば週の途中で値が割れうる（本 premise
は §7 の全数照合で担保している）。`label:` 付与式なら窓ごとに 1 つのラベルが付き、この一貫性は**構造的に**
保証される。

`label:` の束縛規則はその後 **ADR-34 で確定した**——ラムダは**窓の先頭点**を受け、意味論は定義的等式
「`名前(d)` ≡ 付与式(d の属する窓の先頭点)」。点±幅の値式算術は導入されなかったため、「この窓の木曜」を
名指す手段は今もない——本 premise の値関数形（枠窓 `isoYear` の張り直し）が ISO 週番号の正式な書き方で
あり続ける。この還元により「`label:` の別点窓参照の初例＝ISO 週番号」という F40 の位置づけは変わり
（F57）、`label:` の生きた動機は年度ラベル（`fiscal.md` §5）・旧暦月名（`kyureki.md` §7）に移った。

## 5. wkst 非依存——Gregorian の `week` との対比

`isoWeekStart` の filter は `weekday(x) == Mon`——曜日**ラベル**への固定である。`Gregorian` の `weekStart`
（`weekday(d) == wkst`）が利用側前文の `wkst:` を**遅延解決**する（`gregorian.md` §4.5）のと一字違いで、
統治が逆になる:

| 窓 | 週の開始 | 根拠 |
|---|---|---|
| `week`（`Gregorian` から継承） | 利用側の `wkst:` 宣言（文化・用途依存） | 週開始に唯一の正解がない（`gregorian.md` §4.3） |
| `isoWeek`（本 premise） | **月曜固定**（`wkst` を読まない） | ISO 8601 の規約自体が月曜固定 |

帰結として、利用側がどんな `wkst:` を宣言しても `isoWeek`・`isoWeekNo`・`isoWeekday`・`isoYearNo` は不変で、
動くのは継承語 `week`（`within(week)`）だけ。「カレンダー表示は日曜始まり、週番号は ISO」という実務でよく
ある組合せを**一つの premise で**併用できる:

```kairos
# eval: 2026-01-01..2026-02-01
premise US { calendar-system: ISOWeek; tz: "Asia/Tokyo"; wkst: Sun }
@US
everyDay |> filter(d => isoWeekday(d) == 1)
#=> 2026-01-05 2026-01-12 2026-01-19 2026-01-26
```

`wkst: Sun` でも ISO 週の第 1 日は月曜のまま（日曜になるのは `within(week)` の第 1 日だけ）。逆に ISO 語彙
しか使わないなら `wkst:` の宣言自体が不要である——「宣言必須寄り」の統治（ADR-16/24）は `week` 系の**使用時**
に効くのであって、`ISOWeek` を在圏にすること自体は `wkst:` を要求しない。宣言なしでもそのまま動く:

```kairos
# eval: 2026-01-01..2026-02-01
premise ISOPlain { calendar-system: ISOWeek; tz: "Asia/Tokyo" }
@ISOPlain
everyDay |> filter(d => isoWeekday(d) == 1)
#=> 2026-01-05 2026-01-12 2026-01-19 2026-01-26
```

## 6. 落とし穴

### 6.1 ISO 年番号は暦年とずれうる

年またぎ週では `isoYearNo(d) != yearNo(d)`。「2026 年の週」を ISO 年で選ぶのと暦年で選ぶのは**別物**である。
ずれる日はまさに §4.1 の補正対象——1 月の 1〜3 日と 12 月の 29〜31 日の一部——に限られる:

```kairos
# eval: 2024-01-01..2028-06-01
premise ISO { calendar-system: ISOWeek; tz: "Asia/Tokyo"; wkst: Mon }
@ISO
everyDay |> filter(d => isoYearNo(d) != yearNo(d))
#=> 2024-12-30 2024-12-31 2025-12-29 2025-12-30 2025-12-31
#=> 2027-01-01 2027-01-02 2027-01-03 2028-01-01 2028-01-02
```

4 年半で計 10 日。前半 5 日は「12 月末が翌 ISO 年の W01 に属す」（＋1）、後半 5 日は「1 月頭が前 ISO 年の
W52/W53 に属す」（−1）の実例になっている。

### 6.2 W53 は毎年あるわけではない

53 週年の条件は §3 のとおり狭く、`isoWeekNo(d) == 53` は多くの年で**空**を返す。53 週を前提に書いた式を
52 週年に当てても静的にも実行時にも咎められない（空は正当な結果）ので、W53 を使う式は対象年を明示するか、
空が事故でないことを確かめて使う。

### 6.3 紀元 1970 端（プロトタイプの制約）

言語既定の紀元 1970-01-01（ADR-31）は**木曜**で、ISO-1970 年の W01 の月曜は 1969-12-29。リファレンス実装の
実体化は 1970-01-01 から（1970 以前は評価できない。`../impl/README.md`）なので、ISO-1970 年窓は先頭の
1969-12-29〜31 を欠く（`edges: clip` の部分窓）。この端では語ごとに帰結が違う——`isoWeekNo`（= 1）と
`isoYearNo`（= 1970）は正しい値になるが、**`isoWeekday` は 1970-01-01〜04 で 1..4 を返す**（真値は木〜日＝
4..7。部分窓内の序数のため 3 ずれる）。黙って違う値になる（ADR-16 が最も嫌う形）ので、1970 年 1 月頭で
`isoWeekday` を使わないこと。

## 7. 検証

本書の ` ```kairos ` 例はすべて doctest（`../impl/test/doctest.test.ts`。規約は `../reference/README.md`）で
実行検証されている。加えて回帰テスト `../impl/test/stdlib-premises.test.ts` が、独立オラクル（isocalendar
相当の JS 実装）との**全数照合**を持つ——「`isoYearNo` ≠ 暦年」の日の全集合（2024-01-01〜2028-06-01 の全日）
と、週番号ごとの日集合（W01・W02・W09・W26・W52・W53。2025-01-01〜2027-06-01）の一致。試作時には
Python `datetime.isocalendar()` とも 2024-01-01〜2029-01-09 の全 1,836 日で全数一致を確認した
（リポジトリに残る再現可能な照合は上記の回帰テスト）。

## 8. スコープ（ISOWeek が負わないもの）

- **ISO 8601 の週暦以外の部分**——序数日（year day）・暦日/時刻の表記・期間（duration）表記などは負わない。
  本 premise が持つのは week date の窓と座標だけである。
- **他流儀の週番号**——「1/1 を含む週を第 1 週とする」米国式などの規約は別物（週開始と同じく文化・用途依存。
  `gregorian.md` §4.3）。必要なら別 premise ないし利用側の値式で扱う。
- **他流儀の曜日番号**——`isoWeekday` は 月 = 1 … 日 = 7 に固定。「日曜 0」の系譜（C・cron・JavaScript）が
  要るなら値式で変換する。
- **歴史的事実**——継承元 `Gregorian` と同じく、改暦・うるう秒の歴史などは負わない（`gregorian.md` §5・I8）。
  ISO 8601 自体がグレゴリオ暦の先行適用（proleptic）を認める規格であり、この理想化と整合する。
