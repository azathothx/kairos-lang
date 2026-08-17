# 11 — 「書けない」と言われてきたスケジュール——世の中の限界事例の収集と実測

**発端**（2026-08-16・設計者指示）: cron・RRULE・業務スケジューラで「書けない」とされてきた
スケジュール要求を世の中から収集・分類し、Kairos での可否を**実測**で検証する。spec §1.2 の
比較表（能力 13 行）は設計側からの整理だった——本ページは逆向きに、**利用者の側で実際に
挫折が報告された要求**から出発して同じ地図を検証する（1.0 の訴求材料・ブログ種の抽出も兼ねる）。

先に断っておく: 以下で cron・RRULE・各製品の「書けない」を列挙するが、これは道具の否定では
ない。cron の 5 フィールドは 50 年間、圧倒的多数の定期実行を支えてきた**意図的に小さい道具**で
あり、RRULE は相互運用のための**交換形式**という別の設計目標を持つ。ここで集めるのは「その
設計目標の外にあり続けた要求」——各コミュニティ自身が回避策・方言拡張・専用機構で埋め続けて
きた領域である。

## 11.1 収集の方法

三系統の Web 調査（2026-08-17 採取・URL はすべて実在確認済み）＋内部実績:

- **cron 系**: Stack Overflow / Server Fault / Unix SE の頻出質問・man ページと POSIX 正文・
  Debian バグトラッカ・HN。16 項目・閲覧数の序列つき。
- **RRULE / iCalendar 系**: RFC 5545/7529 の仕様議論・CalConnect 勧告・主要実装
  （dateutil・rrule.js・ical4j・lib-recur）の issue。14 項目・**仕様の限界と実装の限界を区別**。
- **カレンダー API / 業務系**: Google Calendar / Microsoft Graph の仕様・Kubernetes / Airflow /
  Quartz / ADF の issue・給与/会計 SaaS の専用機能ドキュメント。17 項目。
- **内部実績**: 還流の記述可否実測（B2B 定型 25 種＝21/25 記述可・F100〜F103 で残り 4 種も
  確定／暦×占い 15 式＝書けなかったのは九星日盤とプラネタリーアワーのみ）・40-examples 01〜10・
  射程外 F 番号群（F8・F24）。

## 11.2 カタログ——収集した要求と判定

判定: **○語彙**＝現行語彙で書ける（→実測節）・**○データ**＝external/テーブルリテラルで権威
データを持ち込めば書ける（持ち込み口と統治は ADR-26/37 で確定済み）・**射程外**＝設計上の
スコープ外（受け皿を明文化）。

| # | 要求 | 既存側の挫折（代表出典） | Kairos 判定 |
|---|---|---|---|
| 1 | 月末日・月末 N 日前 | cron 最頻出（[SO 閲覧 32.5 万](https://stackoverflow.com/questions/6139189/cron-job-to-run-on-the-last-day-of-the-month)）・K8s CronJob は [issue 再提起ループ](https://github.com/kubernetes/kubernetes/issues/121088)・`L` は方言で処理系間移植不能 | ○語彙（<code>month &#124;> last</code>・spec §1.2 済） |
| 2 | 月末最終営業日 | Google Calendar は[編集不可警告つき ICS 輸入でしか置けない](https://www.garethjmsaunders.co.uk/2022/03/26/how-to-set-up-recurring-events-on-the-last-working-day-of-the-month-in-google-calendar/)・Quartz `LW` は祝日不可 | ○語彙＋データ（→ (a)） |
| 3 | 日付∧曜日の AND（13 日の金曜） | POSIX が DOM/DOW を **OR** と規定・[Debian Bug#460070 は 15 年 wontfix](https://groups.google.com/g/linux.debian.bugs.dist/c/LM4Rqrf9oQM)・Vixie cron ソース自身が「bizarre…it's the standard」 | ○語彙（`filter` の and。ブログ第 3 弾） |
| 4 | 第 n 曜日（Patch Tuesday・第 3 火曜に再起動） | `15-21 * * 2` が OR 罠で**第 3 水曜に全システム再起動**した[実害報告](https://superuser.com/questions/348348/crontab-day-of-week-vs-day-of-month) | ○語彙（→ (h)） |
| 5 | 最終○曜日（最終金曜リリース） | 月長変動×OR 罠の複合・[croniter が結局カレンダー逆引きを自前実装](https://github.com/taichino/croniter/issues/159) | ○語彙（<code>filter(Fri) &#124;> within(month) &#124;> last</code>・reference/roll.md に別解） |
| 6 | 第 N 営業日・第 10 営業日 | [ADF「通常のトリガーでは不可」](https://stackoverflow.com/questions/76503521/how-to-schedule-an-azure-datafactory-pipeline-to-run-on-every-nth-business-day)・Quartz 回答「CRON は祝日を恐らく永遠に知らない」 | ○語彙＋データ（→ (i)・F102 確定済み） |
| 7 | 営業日振替（25 日払い・休日なら前営業日） | RRULE は[「不可能と思う」が回答](https://stackoverflow.com/questions/38170676/recurring-calendar-event-on-first-of-the-month)・EXDATE は消せるが**代替日を生成できない**・この不可能性を動機に [DSL が新造される](https://dev.to/chatii/schedules-are-rules-not-lists-of-timestamps-introducing-yarunoka-98i)ほど | ○語彙＋データ（`roll`・spec §7.4 doctest 済） |
| 8 | 祝日を除く平日（3 連休の月曜スキップ） | cron に外部カレンダー参照が無く[100 台を手動コメントアウト運用](https://superuser.com/questions/239591/cron-tips-for-not-running-cron-jobs-on-holidays-the-monday-of-a-three-day-weeke)・Airflow は cron を諦め [Timetable 機構を新設](https://airflow.apache.org/docs/apache-airflow/stable/howto/timetable.html) | ○語彙＋データ（`bizDay` カスケード・01） |
| 9 | 隔週（14 日周期の給与・年 26 回） | cron は月でリセット・[Quartz 公式クックブックが「CronTrigger では無理」と明言](https://www.quartz-scheduler.org/documentation/quartz-2.2.2/cookbook/BiWeeklyTrigger.html)・ISO 週偶奇ハックは第 53 週で連続発火 | ○語彙（`stride(2, from:)`・F103 確定済み・→ (c)） |
| 10 | N 日ごと（月境界を跨いで等間隔） | `*/10` は月内リセット・[Debian man ページ自身が epoch 秒剰余ハックを公式例示](https://manpages.debian.org/bookworm/cron/crontab.5.en.html) | ○語彙（→ (c)） |
| 11 | 90 分ごと・60/24 を割り切らない間隔 | [SO 閲覧 6.8 万](https://stackoverflow.com/questions/247626/how-can-i-set-cron-to-run-certain-commands-every-one-and-a-half-hours)「単一式では不可能」・2 行分割が定番 | ○語彙（`strideBy(1h30m)`・→ (l)） |
| 12 | 1 分未満（30 秒ごと） | cron の粒度床（[SF 閲覧 8.1 万](https://serverfault.com/questions/49082/can-i-run-a-cron-job-more-frequently-than-every-minute)・`sleep 30` 二連発が定番） | ○語彙（`strideBy(30s)`。粒度は連続基底の射影で床が無い） |
| 13 | 期間限定の定期実行（6/29〜12/30 の毎日 7 時） | cron に年も期間も無く[「翌年が来る前に手でコメントアウトせよ」が回答](https://stackoverflow.com/questions/704927/does-cron-expression-in-unix-linux-allow-specifying-exact-start-and-end-dates) | ○語彙（評価範囲の分離が第一級・在圏比較も可→ (n)） |
| 14 | 除外・否定条件（特定 1 日だけ・第 2/4 日曜の 1〜3 時だけ止める） | cron に NOT が無い（[閲覧 2.0 万](https://unix.stackexchange.com/questions/236120/excluding-specific-date-and-time-in-cronjob)）・RFC 5545 は EXRULE を**廃止** | ○語彙（`\` と `filter(not …)`・→ (o)） |
| 15 | 月 2 回を単一系列で（1 日と 15 日・第 2 火曜と第 4 木曜） | Graph API は[閉じた 6 パターン](https://learn.microsoft.com/en-us/graph/api/resources/recurrencepattern?view=graph-rest-1.0)・`BYDAY=2TU,4TH` は合法なのに Outlook が拒否し [W3C が提供自体を断念](https://github.com/w3c/calendar/issues/25) | ○語彙（結合子 <code>&#124;</code>・→ (h)） |
| 16 | 規則の和・積（毎日 8:00 と 9:30・3 日毎∩月曜） | BY 句は直積のみ・RFC 5545 が複数 RRULE を**未定義化**・RRuleSet は[規格外で .ics に運べない](https://www.vitavonni.de/blog/200702/2007021501-icalendar-is-broken.html) | ○語彙（全式が閉包・結合子が中核。ADR-04/22） |
| 17 | 曜日ごとに違う時刻（火水 15 時・金 17 時） | [Google Calendar API は系列内単一時刻](https://stackoverflow.com/questions/62979226/how-do-i-repeat-the-event-at-different-times-weekly)——「例外で個別上書き」が回答 | ○語彙（→ (k)） |
| 18 | 3 営業日ごと（週末を数えない N 日周期） | [「Google Calendar にネイティブな方法は無い」](https://webapps.stackexchange.com/questions/88418/google-calendar-recurring-event-every-x-weekdays)——3 週×3 系列に手で分解 | ○語彙＋データ（→ (i)） |
| 19 | 15 日に最も近い平日（Quartz `15W`） | RRULE に存在しない・Quartz 方言でも祝日不可 | ○語彙（有限場合分けの合成・→ (e)） |
| 20 | イースターと関連移動祝日 | RFC 5545/7529 とも表現不可・[dateutil `byeaster` は「RFC 外の拡張」と自認](https://dateutil.readthedocs.io/en/stable/rrule.html)・[1900〜2099 年限定の近似 RRULE 集](https://github.com/sappjw/calendars)まで存在 | ○語彙（**データゼロの純算術**・→ (g)） |
| 21 | 計算基準日からの相対（感謝祭の次の日曜・米選挙日） | RRULE に「別規則の日 + n 日」が無い・[BYYEARDAY 負値ハックは月跨ぎで破綻](https://stackoverflow.com/questions/72777808/rrule-and-ical-complex-recurrence) | ○語彙（選択子＋点変換の閉包・→ (f)） |
| 22 | 毎月 31 日——無い月の二義（スキップ／月末丸め） | RFC 5545 は黙ってスキップ・救済の SKIP（RFC 7529）は[主要実装が 11 年未対応](https://github.com/jkbrzt/rrule/issues/133) | ○語彙（**二義を別の式として書き分ける**・→ (b)） |
| 23 | 非グレゴリオ暦の繰り返し（旧暦・ヒジュラ・ヘブライ） | [CalConnect「基本 iCalendar では不可能」](https://www.calconnect.org/news/2014-06-19-rrules-and-rscale-examples-for-non-gregorian-recurring-events-in-icalendar/)・RSCALE は実装ほぼ皆無・Android は例外で拒否 | ○語彙（規則暦は premise 定義＝10 で実証）／○データ（観測暦） |
| 24 | ヒンドゥー太陰太陽暦（ディーワーリー） | RSCALE の値域（CLDR レジストリ）に**存在しない**——RFC 7529 完全実装でも書けない | ○データ（外部データ＋covering/asof。暦窓の規則部は premise で） |
| 25 | 天文・官報で決まる日（春分の日・目視観測のイスラム祭日） | **原理的に**規則で将来が確定しない——全カレンダー製品が毎年手動更新 | ○データ（これが `external`/`covering`/`asof` の存在理由。01/03・ブログ第 14 弾） |
| 26 | シフトローテーション（4 勤 4 休・DuPont 28 日） | 週にも月にも整列せず RRULE 構造不可・シフト SaaS は[独自パターン文字列＋**展開済み .ics** 輸出](https://www.rotaplanner.app/shift-patterns/)で回避 | ○語彙（`cycle` の 8 日周期・→ (j)） |
| 27 | 4-4-5 会計暦（第 53 週の繰上げ込み） | 「月」が無い暦なので月ベース語彙が全滅・[会計 SaaS が専用機能として個別実装](https://help.anaplan.com/set-the-weeks-4-4-5-4-5-4-or-5-4-4-calendar-150f3b73-8be1-4d95-92fd-24daa46ae869) | ○語彙（派生 premise・**53 週繰上げは構造から出る**・→ (m)） |
| 28 | ゴミ収集の祝日カスケード（祝日の週は以降 1 日ずれ） | 祝日データ×条件分岐×連鎖シフトの三重で RRULE 外・[業者別コードで展開 ICS 生成](https://github.com/fromtheboonies/TrashCal)が通例 | ○語彙＋データ（一段は `roll`/場合分け・**連鎖の一般再帰は射程外＝F8**・固定回数展開が受け皿） |
| 29 | 「除外が出ても合計 n 回」（講座 5 回・キャンセル補充） | COUNT は除外**前**に数える・[rrule.js でも不可](https://github.com/jkbrzt/rrule/issues/456) | **射程外**（「先頭 N 個」の選択語は持たない＝需要待ち。今回、実需要の証拠を確認→ §11.5） |
| 30 | 実行状態へのフィードバック（前回完了から 5 時間後） | cron/RRULE とも外（そもそも定義でなく実行の話） | **射程外→分解**（注入された時点からの次回計算＝spec §7.7・07 で doctest 済み） |
| 31 | DST 地域差の下での「全員に正しい単一定刻」 | [「答えは存在しない、が答え」](https://zachholman.com/talk/utc-is-enough-for-everyone-right)——製品は作成者 TZ が勝つと**黙って**割り切る | 要求自体が多義。Kairos の受け皿＝**premise 明示**（どの壁時計かを言語が言わせる。ブログ第 15 弾・spec §3.6） |
| 32 | 定義が境界を越えて**規則のまま**運べること | Outlook 内部規則は RRULE/Graph 境界で展開済み点列に退化・[Exchange は RRULE と別形式](https://www.nylas.com/blog/calendar-events-rrules/) | ○（定義＝テキスト・実測 CLI/doctest がそのまま交換形式。10 §10.1 の構造対比） |

還流実績との突き合わせ: B2B 定型 25 種（第 3 便）は本表の 2・6・7・8・9 の変奏が主で全て
記述可に到達済み。暦×占い 15 式（第 5 便）で書けなかった 2 式（九星日盤・プラネタリーアワー）は
本表 25 の系（天文データ依存）＝データで書ける側に落ちる。

## 11.3 実測——代表例を現行語彙で書く

以下の ```kairos ブロックは doctest（`impl/test/doctest.test.ts`）が実行検証する。前提は
断りなければ `@JP`（Gregorian・Asia/Tokyo・wkst: Mon——doctest の標準前提。2026 年の確定
祝日をデータに持つカレンダー実体つきで、`bizDay`・`holidays2026` はそこから来る。ADR-35）。

### (a) 月末最終営業日——cron 最頻出の挫折点（カタログ 1・2）

```kairos
# eval: 2026-01-01..2026-07-01
@JP
bizDay |> within(month) |> last
#=> 2026-01-30 2026-02-27 2026-03-31 2026-04-30 2026-05-29 2026-06-30
```

1 月末（1/31 土）と 5 月末（5/30 土・5/31 日）が正しく金曜へ退く。

### (b) 毎月 31 日——「無い月」の二義を書き分ける（カタログ 22）

RRULE の `BYMONTHDAY=31` は短い月を黙ってスキップし、RFC 7529 の `SKIP=BACKWARD` は月末へ
丸める——**どちらを意図したかは書き手にしか分からない**のに、既定の挙動へ黙って倒れるのが
事故の型。Kairos は二義が別の式になる。スキップ形:

```kairos
# eval: 2026-01-01..2026-07-01
@JP
everyDay |> within(month) |> nth(31)
#=> 2026-01-31 2026-03-31 2026-05-31
```

無い月は**正当な空**（式が「31 日が存在する月だけ」と読み下せる）。丸め形は月長の射影
（`daysInMonthOf`・F101 糖衣）で:

```kairos
# eval: 2026-01-01..2026-07-01
@JP
day30 = everyDay |> within(month) |> nth(30)
short = (everyDay |> within(month) |> last) |> filter(d => daysInMonthOf(d) < 30)
day30 | short
#=> 2026-01-30 2026-02-28 2026-03-30 2026-04-30 2026-05-30 2026-06-30
```

### (c) N 日ごと・隔週——月境界を跨いで安定（カタログ 9・10）

cron の `*/10` は月内リセットで「10 日ごと」にならない（man ページ公認）。Kairos の
ストライドは入力カウント（ADR-38）で境界の影響を受けない:

```kairos
# eval: 2026-01-01..2026-03-01
@JP
everyDay |> stride(10, from: 2026-01-05)
#=> 2026-01-05 2026-01-15 2026-01-25 2026-02-04 2026-02-14 2026-02-24
```

隔週金曜（給与 26 回/年の型・F103 で確定済み）:

```kairos
# eval: 2026-01-01..2026-03-15
@JP
everyDay |> filter(d => weekday(d) == Fri) |> stride(2, from: 2026-01-09)
#=> 2026-01-09 2026-01-23 2026-02-06 2026-02-20 2026-03-06
```

### (d) 四半期末の 3 営業日前——営業日算術＋鮮度の併走（カタログ 6 の系）

営業日**算術**は cron・RRULE とも不可能、営業日付き製品でも前後シフトのフラグ止まり
（spec §1.2）。Kairos は一般算術で、かつデータの尽きる端では**註釈が併走**する:

```kairos
# eval: 2026-01-01..2027-01-01
@JP
bizDay |> within(quarter) |> last |> shift(-3, unit: bizDay)
#=> 2026-03-26 2026-06-25 2026-09-25 2026-12-28
#~> 範囲外 2026-12-29..2027-01-01（holidays2026 covering 2026-01-01..2026-12-31, asof 2026-01-05）
```

### (e) 15 日に最も近い平日——Quartz `15W` を合成で（カタログ 19）

`Nearest` の roll 規約は持たないが、**有限場合分けの合成**でそのまま書ける:

```kairos
# eval: 2026-01-01..2026-12-31
@JP
weekdays = everyDay |> filter(d => weekday(d) != Sat and weekday(d) != Sun)
d15 = everyDay |> within(month) |> nth(15)
(d15 |> filter(d => weekday(d) != Sat and weekday(d) != Sun))
  | (d15 |> filter(d => weekday(d) == Sat) |> roll(Preceding, on: weekdays))
  | (d15 |> filter(d => weekday(d) == Sun) |> roll(Following, on: weekdays))
#=> 2026-01-15 2026-02-16 2026-03-16 2026-04-15 2026-05-15 2026-06-15
#=> 2026-07-15 2026-08-14 2026-09-15 2026-10-15 2026-11-16 2026-12-15
```

2 月・3 月・11 月（15 日が日曜）は翌月曜へ、8 月（15 日が土曜）は前金曜 8/14 へ。

### (f) 計算基準日からの相対——米選挙日と感謝祭の次の日曜（カタログ 21）

「11 月の第 1 月曜の翌日の火曜」（米選挙日）は、RRULE では
`BYDAY=TU;BYMONTHDAY=2,3,4,5,6,7,8` という**意図の消えた符号化**でしか書けない代表例。
Kairos は仕様の言葉の順に書ける:

```kairos
# eval: 2024-01-01..2029-01-01 tz: America/New_York
premise US {
  calendar-system: Gregorian
  tz: "America/New_York"
  wkst: Sun
}
@US
firstMonNov = everyDay |> filter(d => weekday(d) == Mon and month(d) == 11) |> within(year) |> first
firstMonNov |> shift(+1, unit: day)
#=> 2024-11-05 2025-11-04 2026-11-03 2027-11-02 2028-11-07
```

「感謝祭（11 月第 4 木曜）の次の日曜」は**月を跨ぐ年がある**ため BYYEARDAY 負値ハックが
破綻する型——閉包（導いた列を次の入力に）なら跨ぎは問題にならない:

```kairos
# eval: 2024-01-01..2028-01-01 tz: America/New_York
premise US {
  calendar-system: Gregorian
  tz: "America/New_York"
  wkst: Sun
}
@US
thanksgiving = everyDay |> filter(d => weekday(d) == Thu and month(d) == 11) |> within(month) |> nth(4)
thanksgiving |> roll(Following, on: (everyDay |> filter(d => weekday(d) == Sun)))
#=> 2024-12-01 2025-11-30 2026-11-29 2027-11-28
```

2024 年は 12/1——**月跨ぎが正しく出る**。

### (g) イースター——RRULE が書けない移動祝日の代表（カタログ 20・03 §3.5 の後日談）

03 §3.5 の探索時は「値計算は書ける・時点化で要補完」（F28）だったが、射影一族の確定
（ADR-27/30）で**現行語彙だけで完結**するようになった——Computus（Anonymous Gregorian
algorithm）をデータゼロの純算術で:

```kairos
# eval: 2024-01-01..2029-01-01 tz: UTC
premise W {
  calendar-system: Gregorian
  tz: "UTC"
  wkst: Mon
}
@W
a = y => y mod 19
b = y => y div 100
h = y => (19*a(y) + b(y) - b(y) div 4 - (b(y) - (b(y)+8) div 25 + 1) div 3 + 15) mod 30
l = y => (32 + 2*(b(y) mod 4) + 2*((y mod 100) div 4) - h(y) - (y mod 100) mod 4) mod 7
m = y => (a(y) + 11*h(y) + 22*l(y)) div 451
eMonth = y => (h(y) + l(y) - 7*m(y) + 114) div 31
eDay   = y => ((h(y) + l(y) - 7*m(y) + 114) mod 31) + 1
everyDay |> filter(d => month(d) == eMonth(year(d)) and ordinalIn(day, month, d) == eDay(year(d)))
#=> 2024-03-31 2025-04-20 2026-04-05 2027-03-28 2028-04-16
```

5 年分すべて公知の復活祭と一致。**03 §3.5 の判定はこの実測をもって「書ける」に更新**
（F28 解消の実証。聖金曜日・復活祭月曜は `shift(±n, unit: day)` を足すだけ）。

### (h) 月 2 回を単一系列で——W3C が諦めた形（カタログ 4・15）

第 2 火曜（Patch Tuesday）と第 4 木曜の定例を**一つの定義**で:

```kairos
# eval: 2026-01-01..2026-06-01
@JP
tue2 = everyDay |> filter(d => weekday(d) == Tue) |> within(month) |> nth(2)
thu4 = everyDay |> filter(d => weekday(d) == Thu) |> within(month) |> nth(4)
tue2 | thu4
#=> 2026-01-13 2026-01-22 2026-02-10 2026-02-26 2026-03-10 2026-03-26
#=> 2026-04-14 2026-04-23 2026-05-12 2026-05-28
```

「系列を 2 つ作れ」（Graph API・W3C の裁定）は、結合子の不在が人間側へ波及した姿——
`|` が言語にあれば定義側で閉じる。

### (i) 第 10 営業日・3 営業日ごと（カタログ 6・18）

ADF が「通常のトリガーでは不可」とした第 10 営業日と、Google Calendar に「ネイティブな
方法は無い」とされた 3 営業日ごと。営業日列を作ってしまえばどちらも既出語彙:

```kairos
# eval: 2026-01-01..2026-06-01
@JP
bizDay |> within(month) |> nth(10)
#=> 2026-01-16 2026-02-16 2026-03-13 2026-04-14 2026-05-19
```

```kairos
# eval: 2026-01-01..2026-03-01
@JP
bizDay |> stride(3, from: 2026-01-05)
#=> 2026-01-05 2026-01-08 2026-01-14 2026-01-19 2026-01-22 2026-01-27
#=> 2026-01-30 2026-02-04 2026-02-09 2026-02-13 2026-02-18 2026-02-24 2026-02-27
```

成人の日（1/12）・建国記念の日（2/11）を正しく数えから外している（1/8 の 3 営業日後が
1/14・2/9 の 3 営業日後が 2/13）。

### (j) 4 勤 4 休——週にも月にも整列しない 8 日周期（カタログ 26）

シフト SaaS が独自パターン文字列（`DDDD----`）＋展開済み .ics で回避している形。
`cycle`（並列ラベル）の 8 日周期そのもの:

```kairos
# eval: 2026-01-05..2026-01-25
premise Rota = Gregorian with {
  duty = day cycle [On, On, On, On, Off, Off, Off, Off] anchor: 2026-01-05
}
premise JPR { calendar-system: Rota; tz: "Asia/Tokyo"; wkst: Mon }
@JPR
everyDay |> filter(d => duty(d) == On)
#=> 2026-01-05 2026-01-06 2026-01-07 2026-01-08
#=> 2026-01-13 2026-01-14 2026-01-15 2026-01-16
#=> 2026-01-21 2026-01-22 2026-01-23 2026-01-24
```

DuPont（28 日周期・昼夜で時刻が違う）も同型——28 ラベルの cycle と、(k) の時刻付与を
`|` で束ねる合成。

### (k) 曜日ごとに違う時刻を単一系列で（カタログ 17）

火・水は 15:00、金は 17:00 の同一クラス。系列内単一時刻の制約（Google Calendar API）は
時刻をストリームの属性でなく**別ストリームの合流**にすれば消える:

```kairos
# eval: 2026-01-05..2026-01-12
@JP
at15 = everyInstant |> strideBy(1d, from: 2026-01-05T15:00) |> filter(d => weekday(d) == Tue or weekday(d) == Wed)
at17 = everyInstant |> strideBy(1d, from: 2026-01-05T17:00) |> filter(d => weekday(d) == Fri)
at15 | at17
#=> 2026-01-06T15:00 2026-01-07T15:00 2026-01-09T17:00
```

### (l) 営業時間内 90 分ごと・毎朝 9:00 リセット（カタログ 11）

`hour` 窓は Gregorian 標準に無いが、**暦の原子は 1 行で張れる**（grid・ADR-41 の第二用途）:

```kairos
# eval: 2026-01-05..2026-01-07
premise Hourly = Gregorian with { hourW = chronos grid 1h }
premise JPH { calendar-system: Hourly; tz: "Asia/Tokyo"; wkst: Mon }
@JPH
everyInstant |> strideBy(1h30m, from: 2026-01-05T09:00)
  |> filter(d => ordinalIn(hourW, day, d) >= 10 and ordinalIn(hourW, day, d) <= 17)
#=> 2026-01-05T09:00 2026-01-05T10:30 2026-01-05T12:00 2026-01-05T13:30 2026-01-05T15:00 2026-01-05T16:30
#=> 2026-01-06T09:00 2026-01-06T10:30 2026-01-06T12:00 2026-01-06T13:30 2026-01-06T15:00 2026-01-06T16:30
```

（90 分は 24h を割り切るので毎朝の位相が保たれる。割り切らない間隔で「毎朝リセット」を
厳密に要求するなら窓内ストライド＝`ordinalIn` の剰余形〈reference/ordinalIn.md〉に倒す。）

### (m) 4-4-5 会計暦——第 53 週の繰上げが構造から出る（カタログ 27）

会計 SaaS が専用機能として実装している 4-4-5。期の頭＝「ISO 週番号 1, 5, 9, 14, …, 48 の
月曜」をマーカーに、`segmentBy` で期を張る:

```kairos
# eval: 2025-12-01..2027-03-01
premise R445 = ISOWeek with {
  periodStart = isoWeekStart |> filter(d =>
    ((isoWeekNo(d) - 1) mod 13 == 0 or (isoWeekNo(d) - 1) mod 13 == 4 or (isoWeekNo(d) - 1) mod 13 == 8)
    and isoWeekNo(d) <= 48)
  period = day |> segmentBy(periodStart, edges: clip, empties: error)
}
premise JPR { calendar-system: R445; tz: "Asia/Tokyo"; wkst: Mon }
@JPR
everyDay |> within(period) |> first
#=> 2025-12-29 2026-01-26 2026-02-23 2026-03-30 2026-04-27 2026-05-25
#=> 2026-06-29 2026-07-27 2026-08-24 2026-09-28 2026-10-26 2026-11-23
#=> 2027-01-04 2027-02-01
```

ISO 2026 年は 53 週年——最終期 P12 が 11/23〜2027-01-03 の **6 週に自動で伸び**（W49〜W53 を
吸収）、翌年は W01（2027-01-04）から正常に再開する。**第 53 週の繰上げ規則（NRF 流の
「最終期に足す」）を一行も書いていない**のに、「期の頭は W48 まで」という定義の形から
帰結として出る。なお正攻法に見える `isoYear split (…) by: isoWeek` は親の窓種別で弾かれた
（→ §11.5 の F109）。

### (n) 期間限定の定期実行（カタログ 13）

第一の受け皿は**定義と評価範囲の分離**そのもの（定義は無時制・評価は常に有界範囲 [from, to)。
cron の「翌年が来る前に手でコメントアウト」は定義に期間を埋め込めない帰結）。期間を定義側に
固定したいときは在圏の序数比較で:

```kairos
# eval: 2026-06-25..2026-07-03
@JP
everyInstant |> strideBy(1d, from: 2026-01-01T07:00)
  |> filter(d => epochOrdinal(day, d) >= epochOrdinal(day, 2026-06-29) and epochOrdinal(day, d) <= epochOrdinal(day, 2026-12-30))
#=> 2026-06-29T07:00 2026-06-30T07:00 2026-07-01T07:00 2026-07-02T07:00
```

（点と日付リテラルの直接比較 `d >= 2026-06-29` は値層に無い——`epochOrdinal` 経由が現行の
正準。→ §11.5）

### (o) 除外・否定条件（カタログ 14）

土日 18 時の定例から特定 1 日（2026-05-10）だけ除く:

```kairos
# eval: 2026-05-01..2026-05-18
@JP
weekend18 = everyInstant |> strideBy(1d, from: 2026-01-01T18:00)
  |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
weekend18 |> filter(d => not (ordinalIn(day, month, d) == 10 and month(d) == 5))
#=> 2026-05-02T18:00 2026-05-03T18:00 2026-05-09T18:00 2026-05-16T18:00 2026-05-17T18:00
```

5/10（日）だけ消え、前後の週末は残る。「第 2・第 4 日曜の 1〜3 時だけ止める」級も同じ
`filter(not …)`＋`ordinalIn` の合成（メンテナンス窓）。

## 11.4 三分類——「書けない」の正体

収集した「書けない」は三つに割れる。

**(A) 語彙で書ける**——カタログ 32 項目中 22 項目。挫折の根は既存方式の**構造**（フィールドの
直積・月リセット・単一系列・閉じたパターン集合）にあり、語彙の設計（閉包・結合子・窓/選択子・
premise 層）で消える型。今回の実測 17 本は全てここで、**言語変更ゼロ・新語彙ゼロ**だった。
RRULE 側の調査が挙げた「無い 4 演算」（外部データ参照・条件付き振替・基準日からの相対・規則の
和積）は、Kairos の背骨 4 点（実体宣言＋external・roll・閉包＋点変換・結合子）と一対一に対応
する——設計時に比較表（spec §1.2）から導いた骨格が、利用者側の挫折の分布とちょうど重なった。

**(B) データで書ける**——祝日・官報・天文・観測。ここは「語彙の敗北」ではなく**知識の出所**の
問題で、どの道具も原理的に規則だけでは書けない（春分の日は前年 2 月の官報告示まで正式決定
しない）。既存方式との差は「書けるか」でなく**「データであることを言語が言うか」**——
covering/asof/残走路が答えに併走する（ADR-26/37・ブログ第 5 弾「祝日テーブルは黙って腐る」・
第 14 弾）。

**(C) 設計上の射程外**——受け皿を明文化して断る型。今回の収集で射程外に落ちたのは 3 つだけ:

| 射程外 | 受け皿 | 今回の収集が足した根拠 |
|---|---|---|
| 実行フィードバック（前回完了から） | 注入された時点からの次回計算に分解（spec §7.7・07） | cron/RRULE too——そもそも「定義」の外という線引きの傍証 |
| 振替・シフトの**一般再帰**（ずれた先がまた祝日なら更にずれる、を無限段） | 固定回数展開（F8・01 §1.4） | ゴミ収集カスケードの実例（二段ずれの実報告あり）——実務は 1〜2 段で足りている |
| 「先頭 N 個」の選択（COUNT 型・除外後の補充） | 評価範囲・covering での有界化（spec §1.2） | **実需要の初の証拠**（rrule.js #456・講座ビジネスの定番）→ §11.5 |

この 3 つに共通するのは、**受け皿が「黙って近似する」でなく「分解の仕方を明文化する」**である
こと。既存方式の挫折の多くが「黙って OR になる」「黙ってスキップする」「黙って作成者 TZ が
勝つ」という**黙りの既定**に由来する（カタログ 3・22・31）以上、射程外の側も黙らない——が
本ページの結論に据わる対比である。

## 11.5 収穫——綻び・需要・判定更新の記録

実測から出た記録 4 件:

- **F109**（新規・90-findings に採番）: **`split` が区間列型（segmentBy 製）の親窓を受けない**。
  4-4-5 の意図の素直な表明 `isoYear split (y => …) by: isoWeek` が「窓（パーティション）では
  ない」で弾かれる（isoYear は I5 検査で `within` には使える実効パーティション）。segmentBy
  正準形で書けるため表現力の穴ではないが、可変長年（52/53 週）への分割は split のラムダ
  （親窓序数→幅リスト）が最も意図に近い。受理拡張は ADR-08（窓の二種）との整合裁定が要る——
  **裁定待ち・1.0 非ブロック**。
- **点と日付リテラルの比較が値層に無い**（`d >= 2026-06-29` は「数値ではない」）。現行の
  受け皿＝評価範囲の分離（第一）と `epochOrdinal` 序数比較（(n)）。ADR-34 が点±幅算術を
  導入しなかったのと同じ「点を裸の数にしない」統治の帰結と読めるが、比較（順序）は算術と
  別問題ではある——需要が続くようなら糖衣候補（記録のみ・F 採番なし）。
- **`hour` 窓が Gregorian 標準に無い**。派生 premise 1 行（`chronos grid 1h`）で張れることを
  (l) で実証——標準糖衣の整備（F1 系・90-open-questions 既載）の材料に「時分秒の窓」を追加。
- **「先頭 N 個」の選択語への実需要を初確認**（カタログ 29）。spec §1.2 は「需要待ち」として
  きたが、rrule.js #456（除外後も合計 n 回に補充・講座/レッスン業の定番）が実例。なお仮に
  導入しても「除外**後**に数える」は列の合成順で自然に出る（`(講座 \ 休講) |> 先頭(5)`）——
  COUNT が除外前に数えてしまう RRULE の轍を踏まない形が取れる、という設計メモまで残す。
  **裁定待ち（導入の是非自体が設計者判断）**。

判定の更新 1 件: **03 §3.5 イースター「値は書ける・時点化で要補完」→「書ける」**（(g) の
実測・F28 解消の実証）。

**（後日談・同日 2026-08-17）**: 本節の記録 4 件のうち 3 件が**同日中に裁定→候補設計→4 視点
検証→ADR 化→実装まで完走**した——F109→**ADR-48**（split の受理拡張・規則マーカー限定。4-4-5 の
split 形が g(i) の 53 週分岐込みで §(m) の正準形と外延一致を実測）・先頭 N→**ADR-49
`take(n, from:)`**（カタログ 29 は「射程外」から**「○語彙」へ移動**——受け皿明文化が需要証拠→
導入へ一日で回った初例。C 分類は 2 項に）・hour 窓→**ADR-50**（標準化＋ordinalIn 整合検査の
新設——検証が初版較正の誤りを実測で棄却した経緯込み）。点と日付リテラルの比較のみ様子見のまま。
555 テスト。

## 11.6 まとめ——1.0 訴求材料として

- **「書けないと言われてきたもの」の実測 17 本・全て現行語彙・言語変更ゼロ**。収集 32 項目の
  判定は A 22・B 7・C 3——射程外はすべて受け皿明文化済み。
- 訴求の柱に使える実測: 月末最終営業日（32.5 万閲覧の挫折が 1 行）・イースター（RFC が
  書けない代表をデータゼロ 8 行）・4-4-5（SaaS の専用機能が premise 5 行＋53 週自動繰上げ）・
  月 2 回単一系列（W3C が諦めた形が `|` 一つ）・毎月 31 日（黙る既定 vs 二義の書き分け）。
- ブログ種の候補: 「cron が書けないもの一覧」総覧回（カタログの表がそのまま骨子）・
  イースター回（Computus の物語）・4-4-5 回（会計暦と第 53 週）・「黙りの既定」論
  （OR 罠・SKIP・作成者 TZ——三つの黙りと、黙らない設計）。
