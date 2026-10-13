# Windows 管理者のための Kairos——PowerShell とタスク スケジューラだけで動かす

Windows のシステム管理者向けのページ。PowerShell とタスク スケジューラは使うが、開発はしない人を想定する。
言語の仕様は読まなくてよい。このページだけで「定義を書く→今日が発火日か聞く→毎日自動で聞く→Outlook に入れる」
まで通る。

例は [Windows Update の日（Patch Tuesday）](patch-tuesday.md) の定義——太平洋時間の第 2 火曜 10 時。東京の暦では
水曜の未明で、4 月と 7 月は第 3 水曜になる。

## 入口は 3 つ

- **Playground**（インストール不要）: [https://kairos-lang.org/playground/](../playground/) に定義を貼って実行する。「URL に固定」で定義と期間を含んだ URL を同僚に渡せる。「カレンダーに入れる（.ics）」で結果をカレンダー用のファイルにできる。ブラウザ内で完結し、何も送信しない。
- **CLI**: Node.js 20 以上を入れて `npm i -g kairos-lang`。コマンド名は `kairos`。入れずに試すなら `npx -y kairos-lang list …`（初回はダウンロードが走る）。動作確認は `kairos --version`。
- Node.js を入れずに動く単体の exe は準備中。

## 最初の 1 本——定義を書いて `list` で聞く

次を `C:\kairos\patch.kairos` に保存する（`# eval:` と `#=>` の行はこのサイトの検証用のコメント。消してよい）:

```kairos
# Windows Update の日（第 2 火曜 10:00 太平洋時間）
# eval: 2026-10-01..2026-12-31 tz: Asia/Tokyo
premise PT {
  calendar-system: Gregorian
  tz: "America/Los_Angeles"
  wkst: Sun
}
@PT
patchDay = everyDay |> filter(d => weekday(d) == Tue) |> within(month) |> nth(2)
patchDay |> at(T10:00)
#=> 2026-10-14T02:00 2026-11-11T03:00 2026-12-09T03:00
```

- 1 行目のコメントは、あとで .ics に入れるときの予定の名前になる。
- `premise PT { … }` は「太平洋時間の暦で読む」という前提。`@PT` でその前提を式に掛ける。
- 最後の 2 行が本体。「毎日のうち火曜だけ→月ごとに 2 つめ→10:00 を貼る」。

PowerShell で聞く:

```powershell
kairos list --from 2026-10-01 --to 2026-12-31 --tz Asia/Tokyo C:\kairos\patch.kairos
```

```text
2026-10-14T02:00
2026-11-11T03:00
2026-12-09T03:00
```

出力の読み方:

- 1 行が 1 つの点。`--tz` の壁時計で印字される。太平洋時間の火曜 10 時は、東京では水曜の 2 時か 3 時。
- **`--tz` は必ず書く**。書かないと機械の tz（Windows の「日付と時刻」の設定）で印字される。UTC のサーバーでは火曜 17 時になる。
- `--from` の日は含み、`--to` の日は含まない。どちらも日付だけ（`YYYY-MM-DD`）。時刻を付けるとエラーになる。
- 次の 3 回だけ知りたいなら `kairos next -n 3 --tz Asia/Tokyo C:\kairos\patch.kairos`。

祝日表を持つ定義では、`#` で始まる註釈の行が混ざることがある（この例の定義には表が無いので出ない）:

```text
2027-01-25
2027-02-25
# ⚠ 範囲外 2027-01-01..2027-03-01（holidays2026 covering 2026-01-01..2026-12-31）
# 被覆サマリ
#   holidays2026 covering 2026-01-01..2026-12-31 残走路 -59 日
```

- `# ⚠ 範囲外` は「この期間の点は、祝日表の外で出している」という警告。点は出るが、祝日を知らずに出ている。
- `# 被覆サマリ` は表ごとの覆域。**残走路**は、表が今日から何日もつか。マイナスなら尽きている。
- 対処は表を延ばすこと（`covering:` の終端も）。表の作り方は [月末・月末最終営業日](cron-last-day-of-month.md)。

## PowerShell で受ける——`--json`

判定や加工をするなら `--json` で聞き、`ConvertFrom-Json` でオブジェクトにする:

```powershell
$r = kairos list --from 2026-10-01 --to 2026-12-31 --tz Asia/Tokyo --json C:\kairos\patch.kairos | ConvertFrom-Json
$r.results[0].dates     # 2026-10-14T02:00 2026-11-11T03:00 2026-12-09T03:00
$r.results[0].points    # 同じ点の epoch ミリ秒（1791910800000 …）
$r.coverage             # 祝日表の覆域と残走路（表が無ければ空）
```

- `dates` が壁時計のラベル、`points` が同じ点の epoch ミリ秒。`#` の註釈行は `--json` では混ざらない。
- エラーも JSON で返る（`error.kind`・`error.message`）。終了コードは `$LASTEXITCODE`——0 が成功、1 がエラー。
- 形の正本は [JSON Schema](https://kairos-lang.org/schema/cli-report.schema.json)。

**文字コードの落とし穴**。ファイルに落とすときは `>` を使わない:

- Windows PowerShell 5.1 の `>` は UTF-16 で書く。`.json` も `.ics` も、他のツールが読めないファイルになる。
- 版を問わず確実なのは `cmd /c` のリダイレクト: `cmd /c "kairos list … --json C:\kairos\patch.kairos > C:\kairos\out.json"`。
- PowerShell 7 なら `>` は UTF-8。5.1 で PowerShell 側に残したいなら `kairos … | Out-File -Encoding utf8 out.json`。
- 画面の日本語が化けるときは、先に `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`。`kairos` は UTF-8 で書く。

## 毎日「今日は発火日か」を聞く——タスク スケジューラ

型は 1 つ。**タスク スケジューラは時計として残し、判定だけ Kairos に移す**。毎朝 8:30 に「今日は点があるか」を聞き、
あれば通知スクリプトを起動する。cron の同じ型は [月末・月末最終営業日](cron-last-day-of-month.md) の「動かす」節。

判定するスクリプト `C:\kairos\run-if-today.ps1`:

```powershell
# run-if-today.ps1 —— 今日が発火日なら、続く引数のコマンドを実行する（Windows PowerShell 5.1 以上）
# 使い方: powershell -NoProfile -ExecutionPolicy Bypass -File run-if-today.ps1 <定義.kairos> <実行するコマンド> [引数...]
# リハーサル: 環境変数 KAIROS_TODAY に YYYY-MM-DD を置くと、その日を「今日」として判定する
param(
  [Parameter(Mandatory = $true)] [string] $Definition,
  [Parameter(Mandatory = $true)] [string] $Command,
  [Parameter(ValueFromRemainingArguments = $true)] [string[]] $CommandArgs = @()
)
$kairos = 'kairos'                      # SYSTEM で動かすなら C:\kairos に入れた kairos.cmd の絶対パスに（管理者の型）
$tz = 'Asia/Tokyo'                      # 「今日」をどこの暦で読むか。機械の tz 設定と揃える
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8   # kairos の出力は UTF-8

$culture = [System.Globalization.CultureInfo]::InvariantCulture
$today = if ($env:KAIROS_TODAY) { $env:KAIROS_TODAY } else { (Get-Date).ToString('yyyy-MM-dd', $culture) }
$tomorrow = [datetime]::ParseExact($today, 'yyyy-MM-dd', $culture).AddDays(1).ToString('yyyy-MM-dd', $culture)

# 今日から明日の手前までの窓を --json で聞く（--to の日は含まない）
$json = & $kairos list --from $today --to $tomorrow --tz $tz --json $Definition
if ($LASTEXITCODE -ne 0) {
  [Console]::Error.WriteLine("kairos が失敗した（終了コード $LASTEXITCODE）: $json")
  exit 1
}
$report = ($json -join "`n") | ConvertFrom-Json
if (-not $report) { exit 1 }            # JSON が読めなければ何もしない
$dates = @($report.results[0].dates | Where-Object { $_ })
if ($dates.Count -eq 0) { exit 0 }      # 今日は発火日ではない。黙って終わる

& $Command @CommandArgs                 # 発火日。通知スクリプトを実行する
exit $LASTEXITCODE
```

- 通知スクリプト `C:\kairos\notify.ps1` は何でもよい。メール送信・Teams の Webhook・ログへの 1 行。
- 発火日でなければ何もせず終了コード 0。`kairos` が失敗したら stderr に出して終了コード 1。
- `$today` は機械の時計から取る。機械の tz 設定と `$tz` を揃えておく（日本の設定なら揃っている）。

**先にリハーサル**。日付を環境変数で与えて手で叩く。10/13（火）は何も起きず、10/14（水）だけ通知が走る:

```powershell
$env:KAIROS_TODAY = '2026-10-13'
powershell -NoProfile -ExecutionPolicy Bypass -File C:\kairos\run-if-today.ps1 C:\kairos\patch.kairos C:\kairos\notify.ps1
$env:KAIROS_TODAY = '2026-10-14'
powershell -NoProfile -ExecutionPolicy Bypass -File C:\kairos\run-if-today.ps1 C:\kairos\patch.kairos C:\kairos\notify.ps1
Remove-Item Env:KAIROS_TODAY
```

**タスクを登録する**。毎日 8:30 に判定する（管理者の PowerShell かコマンド プロンプトで）:

```powershell
schtasks /Create /SC DAILY /ST 08:30 /TN "Kairos\PatchTuesday" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\kairos\run-if-today.ps1 C:\kairos\patch.kairos C:\kairos\notify.ps1"
```

- 書式は [Microsoft Learn: schtasks create](https://learn.microsoft.com/windows-server/administration/windows-commands/schtasks-create) のとおり。`/SD`（開始日）は地域設定の日付形式に依存するので使わない。

実行ユーザーと電源（2026-10-13 実測）:

- `/RU` を省くと、登録した人のアカウントで動き、パスワードは聞かれない。ただし**ログオン中だけ動く**。ログオンしていなくても動かすなら `/RU <ユーザー> /RP <パスワード>` を付ける。
- ノート PC では、既定で「コンピューターを AC 電源で使用している場合のみタスクを開始する」になる。バッテリーでも動かすなら、タスク スケジューラでタスクを開き「条件」タブでこの項目を外す。
- ログオンの有無に関わらず動かすなら、下の「管理者の型」で SYSTEM として登録する。
- `/RL HIGHEST` は、通知スクリプトが管理者権限を要るときだけ。

すぐ試すなら `schtasks /Run /TN "Kairos\PatchTuesday"`。結果は `schtasks /Query /TN "Kairos\PatchTuesday" /V /FO LIST` の
「前回の結果」で見る（0 が成功、1 がエラー）。

### 管理者の型——SYSTEM で、止まらないコンピューターで

通知はログオンの有無に関わらず出てほしい。**常時動いているコンピューター（サーバーなど）で、SYSTEM アカウントのタスクとして登録する**のが確実（2026-10-13 実測）。

前提:

- Node.js は全ユーザー向けに入れる（公式インストーラーの既定）。SYSTEM からも `node` が見える。
- Kairos は SYSTEM が読める場所に入れる。利用者のフォルダ（`%APPDATA%\npm`）の `kairos` は SYSTEM から使えず、タスクが失敗する。

```powershell
npm install --prefix C:\kairos kairos-lang
# run-if-today.ps1 の 1 行をこう書き換える
$kairos = 'C:\kairos\node_modules\.bin\kairos.cmd'
```

登録（管理者の PowerShell で。`schtasks` の代わりに ScheduledTasks モジュールを使う）:

```powershell
$task = @{ TaskName = 'PatchTuesday'; TaskPath = '\Kairos\' }
$argument = '-NoProfile -ExecutionPolicy Bypass -File "C:\kairos\run-if-today.ps1" -Definition "C:\kairos\patch.kairos" -Command "C:\kairos\notify.ps1"'

Get-ScheduledTask @task -ErrorAction Ignore | Unregister-ScheduledTask -Confirm:$false
Register-ScheduledTask @task `
  -Action    (New-ScheduledTaskAction -Execute '%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe' -Argument $argument) `
  -Trigger   (New-ScheduledTaskTrigger -Daily -At '08:30') `
  -Principal (New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount) `
  -Settings  (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -DontStopOnIdleEnd)
```

- SYSTEM はパスワード不要で、ログオンしていなくても動く。電源の条件もここで外している。
- 通知スクリプトも SYSTEM で動くこと（メールの資格情報・ネットワークの到達性）を確かめる。
- SYSTEM での予行は、`$argument` を次の形に一時的に差し替えて登録し、`Start-ScheduledTask @task` で走らせて「前回の結果」を見る。終わったら元の `$argument` で登録し直す。

```powershell
$argument = '-NoProfile -ExecutionPolicy Bypass -Command $env:KAIROS_TODAY = ''2026-10-14''; . "C:\kairos\run-if-today.ps1" -Definition "C:\kairos\patch.kairos" -Command "C:\kairos\notify.ps1"'
```

## カレンダーに入れる——Outlook

`--ics` で iCalendar のファイルにして Outlook に取り込む。ファイルに落とすのは `cmd /c` で（上の文字コードの落とし穴）:

```powershell
cmd /c "kairos list --from 2026-10-01 --to 2027-01-01 --tz Asia/Tokyo --ics C:\kairos\patch.kairos > C:\kairos\patch.ics"
```

ファイルの中身:

- 1 つの点が 1 つの予定になる。予定の名前は定義の 1 行目のコメント。
- 時刻付きの点は、その時刻に通知が出る 0 分の予定。空き時間は塞がない。この定義では水曜の 2 時か 3 時に通知が出る。
- 期間に点が 1 つも無いと、ファイルは書かれず終了コード 2。

Outlook への取り込み（2026-10-13 に新しい Outlook と従来の Outlook で実測）:

- 新しい Outlook: 「予定表を追加」→「ファイルからアップロード」→「参照」で `.ics` を選び、入れる先の予定表を選んで「予定表に追加」。`.ics` をダブルクリックしても同じ画面が開く。
- 従来の Outlook（クラシック）: `.ics` をダブルクリックすると「新しい予定表として開くか、使用している予定表にインポートするか」を聞かれる。自分の予定表に入れるなら「インポート」。
- どちらも CLI の出力どおりの日時に入る。本文には点の日時と式が入り、どの定義から来た予定かを後から辿れる。

**`--ics-series` は Outlook では取り込めない**（同日実測）。

- 新しい Outlook は「予定表をインポートできませんでした」と出る。従来の Outlook はエラーも出さずに何も入らない。
- 1 式を 1 つの繰り返し予定にまとめる `--ics-series` は Google カレンダー向け。Outlook には `--ics` を使う。
- 詳細は [リファレンス実装の README](../impl/README.md) の `--ics` 節。

**通知を朝にしたいなら、定義の側で時刻を貼り替える**。公開の点は太平洋時間の前提の中に置き、東京の前提から参照して
その日の 9 時を貼る:

```kairos
# Windows Update の日の通知（東京の朝 9 時）
# eval: 2026-10-01..2027-01-01 tz: Asia/Tokyo
premise PT {
  calendar-system: Gregorian
  tz: "America/Los_Angeles"
  wkst: Sun
  release = everyDay |> filter(d => weekday(d) == Tue) |> within(month) |> nth(2) |> at(T10:00)
}
premise JP {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  wkst: Mon
}
@JP
PT.release |> snapTo(day) |> at(T09:00)
#=> 2026-10-14T09:00 2026-11-11T09:00 2026-12-09T09:00
```

- `snapTo(day)` が「公開の瞬間が属する東京の日」に落とし、`at(T09:00)` が 9 時を貼る。4 月と 7 月の第 3 水曜も自動で出る。
- 判定スクリプトはこの定義でもそのまま使える。引数の定義ファイルを差し替えるだけ。

## 落とし穴の一覧

| 落とし穴 | 何が起きるか | 対処 |
|---|---|---|
| `--tz` を書かない | 機械の tz で印字される。UTC のサーバーでは火曜 17 時 | 必ず `--tz Asia/Tokyo`。定義の tz と表示の tz は別のもの |
| PowerShell 5.1 の `>` | UTF-16 のファイルになり、他のツールが読めない | `cmd /c "kairos … > out.json"`。版を問わず確実 |
| 日本語が化ける | PowerShell の既定の文字コードで UTF-8 を読んでいる | 先に `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` |
| 実行ポリシー | `.ps1` が「スクリプトの実行が無効」で止まる | `powershell -ExecutionPolicy Bypass -File …`。そのプロセスだけに効く |
| タスクの実行ユーザー | `/RU` 省略は登録した人のアカウントで、ログオン中だけ動く。SYSTEM は利用者のフォルダの `kairos` を使えない | 常時動かすなら「管理者の型」（SYSTEM・`C:\kairos` に入れて絶対パス） |
| Outlook に `--ics-series` | 新しい Outlook はエラー、従来の Outlook は黙って 0 件 | `--ics` を使う |
| `--from`／`--to` に時刻 | 「日付は YYYY-MM-DD」のエラー | 日付だけを書く。`--to` の日は含まない |
| 祝日表の覆域切れ | `# ⚠ 範囲外` が出て残走路がマイナス。点は祝日を知らずに出る | 表を延ばす。`covering:` の終端も |
| ノート PC のバッテリー | 既定では AC 電源でないと開始しない。その日の通知が出ないまま過ぎる | タスクの「条件」タブで「AC 電源で使用している場合のみ」を外す |
| schtasks の `/SD` | 地域設定の日付形式に依存して失敗する | 使わない。`/SC DAILY /ST` だけで今日から始まる |
| タスクの出力が残らない | タスク スケジューラは標準出力を保存しない | 「前回の結果」の終了コードを見る。記録が要るなら通知スクリプト側で書く |

## 次の版

次の版で、Excel 向けの表形式（タブ区切り）の出力が入る。

## ブラウザで試す

[定義を Playground で開く（日本時間で表示）](https://kairos-lang.org/playground/#s=IyBXaW5kb3dzIFVwZGF0ZSDjga7ml6XvvIjnrKwgMiDngavmm5wgMTA6MDAg5aSq5bmz5rSL5pmC6ZaT77yJCnByZW1pc2UgUFQgewogIGNhbGVuZGFyLXN5c3RlbTogR3JlZ29yaWFuCiAgdHo6ICJBbWVyaWNhL0xvc19BbmdlbGVzIgogIHdrc3Q6IFN1bgp9CkBQVApwYXRjaERheSA9IGV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gVHVlKSB8PiB3aXRoaW4obW9udGgpIHw-IG50aCgyKQpwYXRjaERheSB8PiBhdChUMTA6MDApCg&f=2026-10-01&t=2026-12-31&z=Asia%2FTokyo)
——上の 3 点が出る。期間や `at(T10:00)` を変えて試せる。ブラウザ内で完結し、何も送信しない。

## 関連

- 定義の由来と、ロンドン・シドニーの時刻・誤り例: [Windows Update の日（Patch Tuesday）](patch-tuesday.md)
- cron から来た人向けの同じ型（Linux の `run-if-today.sh`）: [月末・月末最終営業日](cron-last-day-of-month.md)の「動かす」節・
  ブログ[crontab からの引っ越しガイド](https://selog.tech/?p=398)・[月末最終営業日の自動実行まで通す](https://selog.tech/?p=409)
- CLI の全オプション（`--json`・`--ics`・`--lang en`・終了コード）: [リファレンス実装の README](../impl/README.md)
