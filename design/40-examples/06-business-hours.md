# 表現力検証 6: 営業時間・半日休（細粒度カレンダー軸＝F67 の綻び出し）

表現力検証の第 6 部。F67（`bizHour` 級の細粒度カレンダー軸）の設計論点 (1)——**方法論どおり
既存語彙での書き味が先**——を実行する。「営業時間内の毎時」「半日休」を確定語彙のみで書き、
新しい予約語・新構文が表現力の必然として要るのかを実行検証で確かめる（` ```kairos ` ブロックは
doctest 実行。多 TZ 例は `# eval:` の後置 `tz:` で premise の壁時計のまま照合する）。

前提・記法は `README.md` に同じ。ADR-35 判断 2 の確定——`nonWorking` だけが day 整列の予約語で、
半日休・営業時間帯は**同じ実体の中の別の束縛**——を出発点に、その「別の束縛」を読む側を書いてみる。
本稿は起草後に敵対的検証 4 視点（事実・仕様整合・反例実行・文書整合、指摘 20 件）を通し、
全指摘を反映済み——検証で impl の欠陥 1 件（F82）が見つかり修正した。

---

## 6.1 毎営業日 9 時——「時刻」の二意味論（経過時間 vs 壁時計）

**仕様**: 毎営業日の 9:00（現地の壁時計）に発火する。
**期待値**: 2026 年始（東京・1/1 祝日・1/3-1/4 土日）は 1/2・1/5・1/6・1/7 の各 09:00。
DST のある tz（America/New_York）では、切替日でも壁時計の 09:00。

既存の正準形（ADR-38・`reference/coincides.md`）は hour 窓単位の shift だった:

```text
bizDay |> shift(+9, unit: hour)     # hour = chronos grid 1h の派生一行（経過時間グリッド）
```

これは「**日の開始から 9 経過時間**」であって「壁時計の 09:00」ではない。両者が割れるのは DST の
切替日で、実行で確認する（NY の春進み 2026-03-08 は 02:00→03:00 で 1 時間欠ける市民日。
ADR-11/12 の幅規約）:

```kairos
# eval: 2026-03-06..2026-03-10 tz: America/New_York
premise HourG = Gregorian with { hour = chronos grid 1h }
premise NY { calendar-system: HourG; tz: "America/New_York"; wkst: Mon }
@NY
everyDay |> shift(+9, unit: hour)
#=> 2026-03-06T09:00 2026-03-07T09:00 2026-03-08T10:00 2026-03-09T09:00
```

切替日だけ **10:00 に着地する**（窓単位 shift は添字移動＝経過時間意味論。`ordinalIn(hour, day, t)`
で読む「日の第 n 時間窓」も同じ側）。なお正準形そのもの（`bizDay` 形）では、米国式の
「日曜切替＋土日週末」だと切替日が常に非営業日なのでずれは顕在化しない——顕在化するのは
切替日が営業日に落ちる tz・週末構成（上の実測は `everyDay` 形）。書き方の**意味論**が経過側である
こと自体は変わらないので、営業時間（壁時計概念）の器としては取り違え面になる（F76）。

壁時計の 09:00 は**確定済みの語彙**で書ける——`strideBy` の市民時幅（`1d`＝市民日。DST で伸縮し
「毎日同じ時刻」を刻む。`reference/strideBy.md`）を時刻付きの `from:` から:

```kairos
# eval: 2026-03-06..2026-03-10 tz: America/New_York
premise NY {
  calendar-system: Gregorian
  tz: "America/New_York"
  wkst: Mon
  nineTick = everyInstant |> strideBy(1d, from: 2026-01-01T09:00)
}
@NY
nineTick
#=> 2026-03-06T09:00 2026-03-07T09:00 2026-03-08T09:00 2026-03-09T09:00
```

営業日で絞るのは所属の積（`coincides`・ADR-38）:

```kairos
# eval: 2026-01-01..2026-01-08
premise Cal {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  satSunC  = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  holidays = [2026-01-01] covering: 2026..2026
  nonWorking = satSunC | holidays
}
premise Biz {
  calendar-system: Gregorian
  calendar:        Cal
  tz:              "Asia/Tokyo"
  wkst:            Mon
  nineTick = everyInstant |> strideBy(1d, from: 2026-01-01T09:00)
}
@Biz
nineTick |> filter(t => coincides(bizDay, day, t))
#=> 2026-01-02T09:00 2026-01-05T09:00 2026-01-06T09:00 2026-01-07T09:00
```

同じ点列は**時刻付き anchor の市民グリッド**（窓が要るときの形）でも立つ:

```kairos
# eval: 2026-03-06..2026-03-10 tz: America/New_York
premise NineG = Gregorian with {
  nineWin  = chronos grid 1d anchor: 2026-01-01T09:00
  nineTick = nineWin |> first
}
premise NY { calendar-system: NineG; tz: "America/New_York"; wkst: Mon }
@NY
nineTick
#=> 2026-03-06T09:00 2026-03-07T09:00 2026-03-08T09:00 2026-03-09T09:00
```

ただし帰属に注意——`anchor:` の上書き口までが ADR-31 の規定で、時刻付き anchor の市民グリッドの
**窓境界の定義**（「各市民日開始＋壁時計オフセット」＝壁時計保存・DST 隙間は最初の瞬間へ寄る）は
spec 未規定＝現状はリファレンス実装の確定挙動のみ（F81）。「anchor 点からの経過時間タイル」という
別読みは幅規約（`1d`＝市民日・ADR-11/12）が既に排除しているので二読みが開いているわけではないが、
spec §4.5 が `strideBy(w, from: p)` 由来を「anchor 付きグリッド」と**整列同一視**する以上、目盛り
幾何の明文規定（多日幅＋時刻 anchor・隙間着地の細目も同じ穴）は F67 の確定と併せて要る。
また `grid` は暦法定義者の語（`chronos` を受け取れる唯一の語）なので、この形は営業ポリシーの
時刻定数を**暦法定義 premise に埋める**ことを強制する——strideBy 形なら利用側 premise に置ける
（置き場所の作法＝F79 の材料）。

**判定**: 書ける（strideBy 形は規定済み語彙のみ・hour グリッド不要で実行も安い）。ただし「時刻」に
**二つの意味論**（経過時間＝hour 序数・窓単位 shift／壁時計＝市民時幅の歩進・時刻付き anchor）が
あり、既存の正準例は経過側で書かれている——取り違え面の明文化が要る（F76）。

**綻び**: (F76) 経過/壁時計の二意味論の取り違え面。(F81) 時刻付き anchor の市民グリッドの窓境界
定義が spec 未規定——impl の確定挙動のみ。(F83) 姉妹穴＝`shift(unit: 市民窓語)` の「窓内の
オフセット保存」も定義が未規定で、`reference/shift.md` の「オフセット（時刻）は保存される」は
DST 切替日の実挙動（経過オフセット保存＝壁時計は非保存。`[2026-03-07T09:00] |> shift(+1, unit:
day)` → 3/8 **10:00**。さらに 23:30 級のオフセットは 23 時間日で**窓幅を超え**、着地が +1 窓の
外に出る）と食い違う。(F78) 壁時計の時刻値射影（`clockHour(t)` 級）は無い——「9 時から 17 時」を
述語一発で書く直感形は書けず、tick の和か帯（6.3）の構築が要る。市民時アンカーの tick で代替
できるため必須ではない。

## 6.2 営業時間内の毎時——hour 序数形（経過時間側の書き方）

**仕様**: 営業日の 9 時台〜11 時台の毎正時（9:00・10:00・11:00）に発火する。
**期待値**: 2026-01-05〜01-07（いずれも営業日）の各日 3 点。

`hour` 窓の要素点の**原理形**は公開境界語のパターン（`monthStart = month |> first` と同型）で
`hourly = hour |> first`。ただしプロトタイプの有界実体化では hour 窓の全実体化（1970〜・約 49 万窓）が
高価（実測 12〜22 秒。F80）なので、実行例は `everyInstant |> strideBy(1h, from: 2026-01-01)` を使う
（東京・NY では from: が紀元整列の hour グリッド上に乗るので `from:` 以降で同じ点列。**紀元
〈1970・在圏 tz〉以降に非整数時間のオフセット改定がある tz では乗らず別点列**——Asia/Kathmandu
〈1986 年に +05:30→+05:45〉で実測確認）。「日の第 n 時間窓」は `ordinalIn`（1 起点）から:

```kairos
# eval: 2026-01-05..2026-01-08
premise HourG = Gregorian with {
  hour      = chronos grid 1h
  hourOfDay = t => ordinalIn(hour, day, t) - 1
}
premise Cal {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  satSunC  = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  holidays = [2026-01-01] covering: 2026..2026
  nonWorking = satSunC | holidays
}
premise Biz {
  calendar-system: HourG
  calendar:        Cal
  tz:              "Asia/Tokyo"
  wkst:            Mon
  hourly = everyInstant |> strideBy(1h, from: 2026-01-01)
}
@Biz
hourly |> filter(t => coincides(bizDay, day, t) and hourOfDay(t) >= 9 and hourOfDay(t) < 12)
#=> 2026-01-05T09:00 2026-01-05T10:00 2026-01-05T11:00
#=> 2026-01-06T09:00 2026-01-06T10:00 2026-01-06T11:00
#=> 2026-01-07T09:00 2026-01-07T10:00 2026-01-07T11:00
```

day→hour の「所属の広げ」は `coincides(bizDay, day, t)` の一発——ADR-36 が細分の自動整合を
持たない設計は、coincides がちょうど埋める（設計論点 (4) の答え: 導出形は結合子の積ではなく
**所属の積**＝値述語の `and`）。

**判定**: 書ける。ただしこの形を「9 時から 12 時前」（壁時計）と読めるのは、**紀元以降の
オフセット改定がすべて 1 時間の整数倍の tz に限る**（東京は該当。DST 切替日は壁時計とずれ
〈6.1〉、Asia/Kathmandu 級の非整数時間改定では hour 窓自体が :15 整列になり、壁時計とも日開始
経過とも一致しない第三の値になる——実測）。壁時計の正は 6.1 の tick か 6.3 の帯形。

**綻び**: (F76 再掲・条件精密化) hour 序数は正確には「紀元整列 hour 窓の日内序数」であり、
「日の開始からの経過時間」と読めることすら上記条件下に限る。

## 6.3 営業時間帯と半日休——帯（segmentBy）＋証人パターン（本命）

**仕様**: 営業時間 9:00–17:00（壁時計）。祝日（1/1）は休業。半日休の日（1/6）は 11:30 引け。
営業時間内の毎正時に発火する。
**期待値**: 1/5（月）9:00–16:00 の 8 点・1/6（火・半日）9:00–11:00 の 3 点・1/7（水）8 点。

営業「時間帯」は本来**区間**——マーカーで切る区間列型窓（`segmentBy`・ADR-08）に自然に乗る。
開場・引けの壁時計 tick（6.1 の strideBy 形）をマーカーに帯を張り、「開場 tick を含む窓が営業帯」を
`coincides` の**証人パターン**（閏月検出「中気を含まない月」と同型）で判定する:

```kairos
# eval: 2026-01-05..2026-01-08
premise TSEx {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "example"
  satSunC    = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  holidays   = [2026-01-01] covering: 2026..2026
  nonWorking = satSunC | holidays
  halfDayCloses = [2026-01-06T11:30] covering: 2026..2026
}
premise Biz {
  calendar-system: Gregorian
  calendar:        TSEx
  tz:              "Asia/Tokyo"
  wkst:            Mon
  hourly    = everyInstant |> strideBy(1h, from: 2026-01-01)
  openTick  = everyInstant |> strideBy(1d, from: 2026-01-01T09:00)
  close17   = everyInstant |> strideBy(1d, from: 2026-01-01T17:00)
  closeTick = (close17 |> filter(t => not coincides(TSEx.halfDayCloses, day, t))) | TSEx.halfDayCloses
  band      = hourly |> segmentBy(openTick | closeTick, edges: clip, empties: error)
}
@Biz
hourly |> filter(t => coincides(openTick, band, t) and coincides(bizDay, day, t))
#=> 2026-01-05T09:00 2026-01-05T10:00 2026-01-05T11:00 2026-01-05T12:00
#=> 2026-01-05T13:00 2026-01-05T14:00 2026-01-05T15:00 2026-01-05T16:00
#=> 2026-01-06T09:00 2026-01-06T10:00 2026-01-06T11:00
#=> 2026-01-07T09:00 2026-01-07T10:00 2026-01-07T11:00 2026-01-07T12:00
#=> 2026-01-07T13:00 2026-01-07T14:00 2026-01-07T15:00 2026-01-07T16:00
```

読み下しと部品の対応:

- **置き場所は二層で足りた**——営業時間の「規則」（開閉の壁時計 tick・帯）は**利用側 premise**
  （`Biz`）、「例外データ」（halfDayCloses）は**実体**（`TSEx`）。strideBy 形の tick は premise
  層の普通の束縛なので、暦法定義（`with` 派生）は不要（時刻付き anchor grid で書くと営業定数が
  暦法層に混入する——6.1 の注意）。この分担の**規約**は未確定（F79＝裁定事項）。
- **半日休のデータは時刻付きテーブル 1 本**（`halfDayCloses = [2026-01-06T11:30]`）。
  同じ 1 本が (a) `coincides(…, day, t)` の日所属で「その日は半日」の証人になり（17:00 tick を
  除く）、(b) そのまま差し替えの引け tick になる。「どの日が半日か」の日付テーブルと引け時刻
  テーブルの**二本持ち＋同期**は要らなかった。11:30 という**非 1h 整列の点**もテーブル字句
  （ADR-28/32）にそのまま乗る——区間ペアの新字句は不要（設計論点 (2) の答えの半分:
  区間はマーカー 2 列で表し、器は既存の segmentBy）。
- **営業帯の判定はパリティでなく証人**——`coincides(openTick, band, t)`（t の属する帯窓に開場
  tick が在るか）。帯窓列の偶奇（`epochOrdinal mod 2`）で数える案は評価端・マーカーの片欠けで
  ずれるが、証人はどの窓が営業側かをデータ自身が言う。
- **祝日・週末は従来どおり** `coincides(bizDay, day, t)`（6.2 と同じ所属の積）。標準導出
  `bizDay`（ADR-35）は値述語の S 位置にもそのまま立てる。
- 実行の都合（F80）: ストリーム束縛は**premise 側**に置く——プロトタイプは本体層の束縛を
  defCache しないため、値述語から参照される束縛（`band` 等）を本体層に置くと点ごとに再評価される
  （実測 1 秒 → 50 秒）。

**落とし穴**（敵対的検証の実行で確認）:

- **マーカーの順序前提**——この器は「開 < 閉が同一市民日で交互に並ぶ」ことを検査しない。
  半日休の引けが開場以前（8:30）・開場と同時刻（9:00）・翌日の深夜（翌 2:00 のつもり）だと、
  当該帯が**黙って開→翌開の 24 時間帯**に化け、翌日 0:00–8:00 まで営業時間として流出する
  （エラー・註釈ゼロ。ADR-16 の「黙って違う結果」に該当——F84）。証人パターンの頑健さは
  「どの窓が営業側か」の判定までで、**窓割りそのものの妥当性は守らない**。糖衣・標準導出を
  立てるなら（F77/F79）マーカー交互性の検査を器に含めるべき材料。
- **covering の前提**——`halfDayCloses` の covering が尽きた先では closeTick が「落ちて註釈」
  になり、生き残った openTick だけから帯が張られる。発見時の impl はこれを**黙って 24 時間帯**と
  して読んでいた（F82・critical）——窓リーダーの覆域検査を追加して修正済み: 覆域外に張られた
  窓の読みは証人の有無以前に**範囲外**（filter は落として註釈・`RunResult.annotations` に随伴）。
  利用期間が covering に収まっているかは被覆サマリ（残走路）で監視できる。

**判定**: 書ける（新しい予約語・新構文はゼロ・規定済み語彙のみ）。ただし部品が多い——tick 3 本・
帯・二重 coincides で、意図（営業時間 9:00–17:00・1/6 は 11:30 引け）に対して器の組み立てが長い。
表現力の欠落ではなく**冗長さ**の問題（F77＝糖衣の器 F1 の候補）。

**綻び**: (F77) 帯構築の定型は糖衣候補。(F79) 規則と例外データの置き場所の作法（上記）。
(F82) 窓リーダーの覆域検査の欠落（impl 欠陥・修正済み）。(F84) マーカー順序前提の黙った破れ。

## 6.4 DST 切替日の帯と、日を跨ぐ帯——壁時計の保存と営業日の帰属

**仕様**: 6.3 の帯（9:00–17:00）が DST 切替日にも壁時計で保たれること。
**期待値**: 春進み 2026-03-08（23 時間日）でも 9:00–16:00 の 8 点。

```kairos
# eval: 2026-03-07..2026-03-09 tz: America/New_York
premise NY {
  calendar-system: Gregorian
  tz: "America/New_York"
  wkst: Mon
  hourly    = everyInstant |> strideBy(1h, from: 2026-01-01)
  openTick  = everyInstant |> strideBy(1d, from: 2026-01-01T09:00)
  closeTick = everyInstant |> strideBy(1d, from: 2026-01-01T17:00)
  band      = hourly |> segmentBy(openTick | closeTick, edges: clip, empties: error)
}
@NY
hourly |> filter(t => coincides(openTick, band, t))
#=> 2026-03-07T09:00 2026-03-07T10:00 2026-03-07T11:00 2026-03-07T12:00
#=> 2026-03-07T13:00 2026-03-07T14:00 2026-03-07T15:00 2026-03-07T16:00
#=> 2026-03-08T09:00 2026-03-08T10:00 2026-03-08T11:00 2026-03-08T12:00
#=> 2026-03-08T13:00 2026-03-08T14:00 2026-03-08T15:00 2026-03-08T16:00
```

帯の両端が壁時計 tick なので、帯が 02:00 の切替をまたがない限り壁時計そのもの。秋戻し
2026-11-01（25 時間日）も同様に 9:00–16:00 を確認済み（実行ログ）。境界事例は二相ある:

- **整数時間 DST で帯が切替時刻をまたぐ**場合、帯の中身の毎正時の**個数**が経過時間ぶんに
  伸縮する（帯の両端の壁時計は保たれる）。
- **非整数時間 DST**（Australia/Lord_Howe の ±30 分）では、切替をまたがなくても切替以後の
  半年間、hourly（経過 1h グリッド）の点が**壁時計の :30 へ恒常ドリフト**する——「毎正時」の
  読みが崩れる（帯の両端は壁時計を保つ。敵対的検証で実測）。毎正時が要るなら hourly 自体を
  壁時計 tick（6.1 の strideBy 形）の和で組む側に寄せる。

**日を跨ぐ帯（深夜営業）は営業日の帰属が別問題**——開 22:00・閉 03:00 の帯で 6.3 のとおり
`coincides(bizDay, day, t)` を使うと「**t の属する暦日**」の営業日性で判定され、両側で誤る
（金曜夜のセッション尾部＝土曜 0:00–2:00 が落ち、日曜夜のセッション尾部＝月曜 0:00–2:00 が
混入。DST と無関係に東京でも起きる——F85）。意図は「**セッションの開始日**の営業日性」なので、
修理形は**開場 tick を営業日で濾してから証人にする**（証人パターンの二段掛け）:

```kairos
# eval: 2026-01-09..2026-01-13
premise Cal {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  satSunC = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  nonWorking = satSunC
}
premise Biz {
  calendar-system: Gregorian
  calendar:        Cal
  tz:              "Asia/Tokyo"
  wkst:            Mon
  hourly      = everyInstant |> strideBy(1h, from: 2026-01-01)
  openTick    = everyInstant |> strideBy(1d, from: 2026-01-01T22:00)
  closeTick   = everyInstant |> strideBy(1d, from: 2026-01-01T03:00)
  band        = hourly |> segmentBy(openTick | closeTick, edges: clip, empties: error)
  bizOpenTick = openTick |> filter(t => coincides(bizDay, day, t))
}
@Biz
hourly |> filter(t => coincides(bizOpenTick, band, t))
#=> 2026-01-09 2026-01-09T01:00 2026-01-09T02:00 2026-01-09T22:00 2026-01-09T23:00
#=> 2026-01-10 2026-01-10T01:00 2026-01-10T02:00
#=> 2026-01-12T22:00 2026-01-12T23:00
```

木曜夜の尾部（金 0:00–2:00）と**金曜夜の尾部（土 0:00–2:00）が入り**、土日夜のセッションが
丸ごと消える——帯窓は「開場 tick を含む窓」なので、営業日judgment を tick 側へ寄せれば帯全体が
従う（真夜中ちょうどの点は日付のみで印字される＝doctest の表記規約）。

**判定**: 書ける（壁時計の保存・営業日の帰属とも実行検証）。

## 6.5 誤形の検査——`hourly & bizDay` は整列エラー

素朴には「hour 点列 ∩ 営業日」を結合子の積で書きたくなるが、これは ADR-36 の整列検査が止める
（実測のエラー文言）:

```text
hourly & bizDay
# 結合子 &: 両辺の整列が同一でない——点の等値所属が黙って空振りする形（ADR-36）。
# 入力=経過 3600000ms 位相 0・軸/右辺=市民日 1d 位相 0 tz "Asia/Tokyo"。
# 同じ点が意図なら snapTo で明示的に整合する（同じ所属〈日〉が意図なら coincides。ADR-38）
```

エラー文言が正しい形（`coincides`）へ誘導するところまで含めて、ADR-36/38 の設計どおり動く。
「導出形は積が自然」（F67 の当初の見立て）は、結合子の積ではなく**所属の積**（`coincides` の
`and`）に着地した。

**判定**: 誤形は静的に止まり、修理形が文言に出る（設計どおり）。

---

## 小括

| 例 | 判定 | 依存する語彙（すべて確定済み） |
|---|---|---|
| 毎営業日 9 時（壁時計） | 書ける | strideBy の市民時幅・coincides（時刻付き anchor grid は F81） |
| 営業時間内の毎時（経過形） | 書ける（整数時間オフセット tz で壁時計と一致） | hour グリッド・ordinalIn・coincides |
| 営業時間帯＋半日休（帯形） | 書ける（冗長＝F77 糖衣候補） | segmentBy（ADR-08）・証人パターン・時刻付きテーブル |
| DST 切替日の帯 | 書ける | 同上（壁時計保存を実行検証） |
| 深夜営業の帯（日跨ぎ） | 書ける（帰属は修理形＝F85） | 証人パターンの二段掛け |
| 誤形 `hourly & bizDay` | 静的エラー（誘導つき） | ADR-36/38 |

**総括**: F67 の設計論点 (1) の答えは「**全部書ける**」——「書けない構造」は今回も無く、新しい
予約語・新構文・新射影は表現力の必然としては**不要**。`nonWorking` が正体判定と標準導出のために
予約語で**なければならなかった**のと違い、細粒度側は自由束縛の組み立てで足りる。残ったのは:

1. **二意味論の取り違え面**（F76）——経過時間（hour 序数・窓単位 shift）と壁時計（市民時幅の
   歩進・時刻付き anchor）。既存の正準例（ADR-38 の毎営業日 9 時）は経過側で、切替日が営業日に
   落ちる tz・週末構成では意図とずれる（everyDay 形では NY で実測）。
2. **未規定の器**（F81・F83）——時刻付き anchor の市民グリッドの窓境界定義（F81）と、
   `shift(unit: 市民窓語)` の窓内オフセット保存の定義（F83）が spec 未規定。壁時計 tick 自体は
   strideBy（規定済み）で書けるので「要石」ではないが、整列同一視（spec §4.5）の成立にも
   F67 の確定と併せた規定が要る。
3. **冗長さ**（F77）——帯構築の定型は長い。畳むなら糖衣の器（F1）で、意味論は変わらない。
   器にはマーカー交互性の検査（F84）を含める材料あり。
4. **置き場所の作法**（F79）——営業時間の「規則」（利用側 premise の tick 束縛で書けた）と
   「例外データ」（実体）の分担規約。標準導出（`bizHour` 級の言語規定）を立てるなら供給規約の
   指名が要る——立てないなら作法（解説層）で足りる。ここが F67 の裁定の本体。

検証の副産物として impl の欠陥 1 件を修正した（F82＝窓リーダーの覆域検査。coincides・ordinalIn・
epochOrdinal・ラベル射影が、マーカー覆域の尽きた側に張られた窓を黙って読んでいた——範囲外へ
分類するよう修正・回帰テスト追加）。綻びの正本は `90-findings.md`（F76〜F85）。

**追記（2026-07-09・ADR-41 で確定）**: 本稿の綻び出しを経て F67 は **ADR-41**（供給規約
`opens`/`closes`＋標準導出 `bizOpen`/`bizClose`/`isOpen`・実体相対）と **ADR-31 改訂 2**
（F81 の壁時計ラベル読み・F83 の経過保存明文化）で確定した。§6.3 の帯＋証人パターンの手組みは
`hourly |> filter(t => isOpen(t))` の一語に、§6.1 の壁時計形は `bizOpen` に縮む
（`reference/isOpen.md` に確定後の正準 doctest）。本稿は探索の記録としてそのまま残す。
