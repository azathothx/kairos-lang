# Excel の WORKDAY・EOMONTH で書きにくいスケジュール——祝日表の期限切れを黙らせない

Excel で営業日の計算をしている人向けのページ。経理・総務・情報システム部門で、`WORKDAY`・`EOMONTH`・`NETWORKDAYS` を使って
締め日や支払日の表を作っている人を想定する。言語の仕様は読まなくてよい。

Kairos は Excel を置き換えない。役割を分ける。**日付の一覧を作る係**を Kairos に、集計と見た目を Excel に。Kairos の結果は
タブ区切り（TSV）で書き出せるので、Excel には「表」として入る（[§Excel に渡す](#excel-に渡すtsv)）。

## 一覧

| 要求 | Excel | Kairos |
|---|---|---|
| 月末最終営業日 | `WORKDAY` と `EOMONTH` | `within(month)` と `last` |
| 25 日払い・休みなら前営業日 | `WORKDAY` と `DATE` | `nth(25)` と `roll` |
| 第 10 営業日 | `WORKDAY` と `EOMONTH` | `nth(10)` |
| 四半期末の 3 営業日前 | `WORKDAY` と `EOMONTH` | `within(quarter)` と `shift` |
| 3 営業日ごと | 作業列が要る | `stride(3)` |
| 第 1・第 3 水曜 | `WEEKDAY` の式が 2 本 | `nth(1)` と `nth(3)` の和 |

Kairos 側の式は `@JP` の標準前提（土日と 2026 年の日本の祝日から導いた営業日の列 `bizDay`）で書く。
自分の祝日表を持ち込む形は [§祝日表の期限が切れたとき](#祝日表の期限が切れたとき) にある。
`# eval:` と `#=>` の行はこのサイトの検証用のコメントで、消してよい。

## 月末最終営業日

Excel では「翌月 1 日の 1 営業日前」と読む。A2 は月内の任意の日、`祝日` は祝日表の範囲:

```text
=WORKDAY(EOMONTH(A2,0)+1,-1,祝日)
```

Kairos では「営業日の列を月で区切り、最後の点」。読んだままの順に書く:

```kairos
# eval: 2026-01-01..2027-01-01
@JP
bizDay |> within(month) |> last
#=> 2026-01-30 2026-02-27 2026-03-31 2026-04-30 2026-05-29 2026-06-30
#=> 2026-07-31 2026-08-31 2026-09-30 2026-10-30 2026-11-30 2026-12-31
```

1 月末（1/31 土）と 5 月末（5/30 土・5/31 日）が金曜へ退く。Excel の式は 1 セルに 1 月分で、年の表にするには 12 行に
コピーする。Kairos は範囲を与えれば 12 点が一度に出る。

## 25 日払い・休みなら前営業日

Excel では「26 日の 1 営業日前」。25 日が営業日ならそのまま 25 日、土日祝なら手前の営業日:

```text
=WORKDAY(DATE(YEAR(A2),MONTH(A2),26),-1,祝日)
```

Kairos では「毎月 25 日を作り、営業日でなければ手前へ寄せる」:

```kairos
# eval: 2026-01-01..2027-01-01
@JP
everyDay |> within(month) |> nth(25) |> roll(Preceding, on: bizDay)
#=> 2026-01-23 2026-02-25 2026-03-25 2026-04-24 2026-05-25 2026-06-25
#=> 2026-07-24 2026-08-25 2026-09-25 2026-10-23 2026-11-25 2026-12-25
#~> 範囲外 2026-01-01..2026-01-02（holidays2026 covering 2026-01-01..2026-12-31, asof 2026-01-05）
```

1 月 25 日（日）は 23 日（金）へ、4 月 25 日（土）は 24 日へ、10 月 25 日（日）は 23 日へ。
末尾の 1 行は「1 月 1 日に点が落ちたら、手前の営業日は祝日表の外（2025 年）になる」という言語からの一言
（`2026-01-01..2026-01-02` は右端を含まない区間＝1 月 1 日だけ）。
この式でそこに点が落ちることはないが、式は表の外に依存しうる区間を黙らない（翌営業日へ寄せるなら `roll(Following, on: bizDay)`）。

## 第 10 営業日

Excel では「前月末の 10 営業日後」:

```text
=WORKDAY(EOMONTH(A2,-1),10,祝日)
```

Kairos では「営業日の列を月で区切り、10 番目」:

```kairos
# eval: 2026-01-01..2027-01-01
@JP
bizDay |> within(month) |> nth(10)
#=> 2026-01-16 2026-02-16 2026-03-13 2026-04-14 2026-05-19 2026-06-12
#=> 2026-07-14 2026-08-17 2026-09-14 2026-10-15 2026-11-16 2026-12-14
```

1 月は成人の日（1/12）を、5 月は連休を数えに入れずに、1/16・5/19 になる。

## 四半期末の 3 営業日前

Excel では「翌四半期 1 日の 4 営業日前」。A2 は四半期の初日。`-1` が最終営業日、`-4` がその 3 営業日前:

```text
=WORKDAY(EOMONTH(A2,2)+1,-4,祝日)
```

数え方を 1 つ間違えると 1 日ずれるが、Excel は何も言わない。Kairos では「四半期の最終営業日から、営業日の目盛りで 3 つ戻る」:

```kairos
# eval: 2026-01-01..2027-01-01
@JP
bizDay |> within(quarter) |> last |> shift(-3, unit: bizDay)
#=> 2026-03-26 2026-06-25 2026-09-25 2026-12-28
#~> 範囲外 2026-12-29..2027-01-01（holidays2026 covering 2026-01-01..2026-12-31, asof 2026-01-05）
```

12 月は 12/31 から 3 営業日戻って 12/28。末尾の 1 行は、「2027 年の表が無い」という註釈が、3 営業日戻る算術と一緒に 12 月 29〜31 日へ
移ってきたもの。その区間に落ちるはずの点があれば表の外から来るので分からない、と言っている。12/28 の点そのものは正しい。`roll`（寄せる）と `shift`（数える）の違いは [言語仕様 §4.4](../spec/30-body-layer.md)。

## 3 営業日ごと・第 1・第 3 水曜

Excel で「3 営業日ごと」は、前の行の 3 営業日後を下へコピーする作業列になる（`=WORKDAY(B2,3,祝日)`）。
起点を変えると表全体を作り直す。Kairos は起点を引数に持つ:

```kairos
# eval: 2026-01-01..2026-03-01
@JP
bizDay |> stride(3, from: 2026-01-05)
#=> 2026-01-05 2026-01-08 2026-01-14 2026-01-19 2026-01-22 2026-01-27
#=> 2026-01-30 2026-02-04 2026-02-09 2026-02-13 2026-02-18 2026-02-24 2026-02-27
```

「第 1・第 3 水曜」は Excel では `WEEKDAY` を使った式が 2 本（第 1 水曜と、その 14 日後）。Kairos では水曜の列から
「月ごとに 1 番目」と「3 番目」を取って `|` で束ねる。[「月 2 回」を 1 本の式で書く](https://selog.tech/?p=434) に実測がある。

## 祝日表の期限が切れたとき

本題はここにある。`WORKDAY` の 3 つ目の引数は祝日表の範囲で、**表が 2026 年分で止まっていても、2027 年の日付を計算すれば
祝日ゼロとして黙って答えを返す**。2027 年 1 月 1 日が営業日になる。気づくのは、支払いが 1 日ずれた後である。

Kairos では、表に `covering:`（この表が有効な範囲）を書く。範囲の外を計算すると点は出るが、「表の外で計算した」という註釈が
必ず併走する。自分の祝日表を持ち込む形で、2026 年 10 月から 2027 年 3 月までを計算する:

```kairos
# eval: 2026-10-01..2027-04-01
premise JP {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  wkst: Mon
}

@JP
holidays2026 = [2026-01-01, 2026-01-12, 2026-02-11, 2026-02-23, 2026-03-20,
                2026-04-29, 2026-05-03, 2026-05-04, 2026-05-05, 2026-05-06,
                2026-07-20, 2026-08-11, 2026-09-21, 2026-09-22, 2026-09-23,
                2026-10-12, 2026-11-03, 2026-11-23] covering: 2026..2026
satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
bizDay = everyDay \ (satSun | holidays2026)

bizDay |> within(month) |> last
#=> 2026-10-30 2026-11-30 2026-12-31 2027-01-29 2027-02-26 2027-03-31
#~> 範囲外 2027-01-01..2027-04-01（holidays2026 covering 2026-01-01..2026-12-31）
```

2027 年の 3 点は Excel と同じく「祝日ゼロ」で計算した値だが、**同じ出力の中に「表の外」の区間が書いてある**。
`next`（次の N 点）でも同じ註釈が出る。被覆サマリの「残走路」は表の残り日数で、評価のたびに表示される。
これが「表を延ばす時期だ」の合図になる。

祝日表は年に 1 回延ばす（内閣府の「国民の祝日」の公示は毎年 2 月）。表の行を足して `covering:` を 1 年延ばすだけでよい。
`covering:` の書き方 3 つの違いは [テーブルリテラル](../reference/table-literal.md)、「祝日表は黙って腐る」の経緯は
[ブログの回](https://selog.tech/?p=297) にある。

## Excel に渡す（TSV）

`--tsv`（1.0.10 から）は、結果を 1 点 1 行のタブ区切りで書き出す。註釈や被覆サマリは標準エラーに出るので、ファイルには混ざらない:

```text
kairos list --tsv --from 2026-01-01 --to 2027-01-01 month-end.kairos > month-end.tsv
```

```text
expr	source	uid	date	time	epoch_ms	note	label
1	bizDay |> within(month) |> last	kairos-3d28b4e324d5-series@kairos-lang.org	2026-01-30		1769698800000		
1	bizDay |> within(month) |> last	kairos-3d28b4e324d5-series@kairos-lang.org	2026-02-27		1772118000000		
1	bizDay |> within(month) |> last	kairos-3d28b4e324d5-series@kairos-lang.org	2026-03-31		1774882800000		
```

**Excel** では、ダブルクリックではなく「データ → テキストまたは CSV から」でファイルを選び、文字コードに UTF-8、区切り記号にタブを選ぶ。
`date` は日付型、`epoch_ms` は数値で入る。`time` は時刻付きの定義のときだけ埋まる。`note` はその点が「表の外」の区間に
入るときの註釈文で、空なら表の内側の計算である。`label`（1.0.12 から）は、式がラベル付きの表（`labels:`）を 1 つ参照するときに
その点のラベル（節気名など）が入る列で、この例では空。

- **PowerShell**: ``Import-Csv month-end.tsv -Delimiter "`t" -Encoding utf8 | Format-Table date, note``。
- **VBA**: `Shell` で `kairos` を呼んで TSV を書かせ、行単位で読む。
- 列の意味と `--json` との使い分けは [リファレンス実装の README](../impl/README.md#--tsvexcelpowershell-向けの表)。

Windows での導入と、タスク スケジューラでの毎日の実行は [Windows 管理者のための Kairos](windows-admin.md) にある。

## ブラウザで試す

前提込みの自己完結形（祝日表を式の中に持つ）を [Playground で実行](https://kairos-lang.org/playground/#s=IyBFeGNlbCDjga4gV09SS0RBWeODu0VPTU9OVEgg44Gn5pu444GN44Gr44GP44GE44K544Kx44K444Ol44O844Or4oCU4oCU5pyI5pyr5pyA57WC5Za25qWt5pel77yI5LuW44GuIDMg5pys44Gv44Kz44Oh44Oz44OI44Gr44GC44KL77yJCnByZW1pc2UgSlAgewogIGNhbGVuZGFyLXN5c3RlbTogR3JlZ29yaWFuCiAgdHo6ICJBc2lhL1Rva3lvIgogIHdrc3Q6IE1vbgp9CgpASlAKaG9saWRheXMyMDI2ID0gWzIwMjYtMDEtMDEsIDIwMjYtMDEtMTIsIDIwMjYtMDItMTEsIDIwMjYtMDItMjMsIDIwMjYtMDMtMjAsCiAgICAgICAgICAgICAgICAyMDI2LTA0LTI5LCAyMDI2LTA1LTAzLCAyMDI2LTA1LTA0LCAyMDI2LTA1LTA1LCAyMDI2LTA1LTA2LAogICAgICAgICAgICAgICAgMjAyNi0wNy0yMCwgMjAyNi0wOC0xMSwgMjAyNi0wOS0yMSwgMjAyNi0wOS0yMiwgMjAyNi0wOS0yMywKICAgICAgICAgICAgICAgIDIwMjYtMTAtMTIsIDIwMjYtMTEtMDMsIDIwMjYtMTEtMjNdIGNvdmVyaW5nOiAyMDI2Li4yMDI2CnNhdFN1biA9IGV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gU2F0IG9yIHdlZWtkYXkoZCkgPT0gU3VuKQpiaXpEYXkgPSBldmVyeURheSBcIChzYXRTdW4gfCBob2xpZGF5czIwMjYpCiMg5pyA5b6M44Gu6KGM44KS5YWl44KM5pu_44GI44Gm6Kmm44Gb44KLOgojICAgZXZlcnlEYXkgfD4gd2l0aGluKG1vbnRoKSB8PiBudGgoMjUpIHw-IHJvbGwoUHJlY2VkaW5nLCBvbjogYml6RGF5KSAgIOKApiAyNSDml6XmiZXjgYTjg7vkvJHjgb_jgarjgonliY3llrbmpa3ml6UKIyAgIGJpekRheSB8PiB3aXRoaW4obW9udGgpIHw-IG50aCgxMCkgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICDigKYg56ysIDEwIOWWtualreaXpQojICAgYml6RGF5IHw-IHdpdGhpbihxdWFydGVyKSB8PiBsYXN0IHw-IHNoaWZ0KC0zLCB1bml0OiBiaXpEYXkpICAgICAgICAgIOKApiDlm5vljYrmnJ_mnKvjga4gMyDllrbmpa3ml6XliY0KYml6RGF5IHw-IHdpdGhpbihtb250aCkgfD4gbGFzdAo&f=2026-01-01&t=2027-01-01&z=Asia%2FTokyo)——2026 年の月末最終営業日 12 点が出る。
コメントにある他の 3 本（25 日払い・第 10 営業日・四半期末の 3 営業日前）と入れ替えて試せる。ブラウザ内で完結し、何も送信しない。

## 関連

- 月末だけを深く: [月末・月末最終営業日に実行する](cron-last-day-of-month.md)（cron との比較・米国の祝日に載せ替える例・自動実行の型）
- 似た型の実測: 毎月 31 日の二義・第 N 営業日・N 営業日ごと——[調査研究 11 の実測節](../design/40-examples/11-impossible-schedules.md)

語彙と仕様の所在:

- 語彙: [`within`](../reference/within.md)・[`nth`](../reference/nth.md)・[`last`](../reference/last.md)・
  [`roll`](../reference/roll.md)・[`shift`](../reference/shift.md)・[`stride`](../reference/stride.md)
- 祝日データの持ち込みと鮮度（`covering:`・`asof:`）: [言語仕様 §4.10](../spec/30-body-layer.md)・[`nonWorking` と `bizDay`](../reference/nonWorking.md)
