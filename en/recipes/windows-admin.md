---
source_sha: c4fb8f37dd7b
---

# Kairos for Windows administrators — PowerShell and Task Scheduler, nothing else

> Translated from the canonical Japanese page
> [recipes/windows-admin.md](../../recipes/windows-admin.md).

A page for Windows system administrators: people who use PowerShell and Task Scheduler but do not write
software. You do not need to read the language specification. This page alone takes you from "write a
definition" to "ask whether today is a firing day" to "ask every morning, automatically" to "put it in Outlook".

The example is the definition from [Patch Tuesday](patch-tuesday.md) — the second Tuesday at 10:00 Pacific Time.
On the Tokyo calendar that is early Wednesday morning, and in April and July it is the *third* Wednesday.

## Three ways in

- **Playground** (nothing to install): [https://kairos-lang.org/en/playground/](../playground/). "Pin to URL" shares the definition and range as a URL; "Add to calendar (.ics)" gives a calendar file. Nothing leaves the browser.
- **CLI**: Node.js 20 or later, then `npm i -g kairos-lang`; the command is `kairos`. Without installing: `npx -y kairos-lang list …`. Check: `kairos --version`.
- A standalone exe (no Node.js) is in preparation.

## The first run — write a definition, ask with `list`

Save the following as `C:\kairos\patch.kairos` (the `# eval:` and `#=>` lines are verification comments for this site; you may delete them):

```kairos
# Patch Tuesday (second Tuesday, 10:00 Pacific Time)
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

- The comment on line 1 becomes the event name when you later export to .ics.
- `premise PT { … }` is the premise "read this on the Pacific Time calendar". `@PT` applies it to the expression.
- The last two lines are the body: "every day, keep Tuesdays → the second one in each month → attach 10:00".

Ask from PowerShell:

```powershell
kairos list --from 2026-10-01 --to 2026-12-31 --tz Asia/Tokyo C:\kairos\patch.kairos
```

```text
2026-10-14T02:00
2026-11-11T03:00
2026-12-09T03:00
```

Reading the output:

- One line per point, in the wall-clock time of `--tz`. 10:00 Pacific is Wednesday 2 or 3 am in Tokyo.
- **Always write `--tz`.** Without it the machine's time zone (Windows "Date & time") is used; on a UTC server that is Tuesday 17:00.
- `--from` is included, `--to` is not. Dates only (`YYYY-MM-DD`); a time is an error.
- Next three only: `kairos next -n 3 --tz Asia/Tokyo C:\kairos\patch.kairos`.

Definitions that carry a holiday table may add annotation lines starting with `#` (this example has no table, so none appear):

```text
2027-01-25
2027-02-25
# ⚠ 範囲外 2027-01-01..2027-03-01（holidays2026 covering 2026-01-01..2026-12-31）
# 被覆サマリ
#   holidays2026 covering 2026-01-01..2026-12-31 残走路 -59 日
```

- `# ⚠ 範囲外` ("out of range"): the points there came out beyond the holiday table — present, but blind to holidays.
- `# 被覆サマリ` is the coverage summary (`--lang en` prints `# coverage summary`). The **runway** (残走路) is how many days the table lasts from today; negative means it has run out.
- Fix: extend the table, `covering:` included. Tables: [Last day of the month](cron-last-day-of-month.md).

## Receiving it in PowerShell — `--json`

For decisions and further processing, ask with `--json` and turn it into objects with `ConvertFrom-Json`:

```powershell
$r = kairos list --from 2026-10-01 --to 2026-12-31 --tz Asia/Tokyo --json C:\kairos\patch.kairos | ConvertFrom-Json
$r.results[0].dates     # 2026-10-14T02:00 2026-11-11T03:00 2026-12-09T03:00
$r.results[0].points    # the same points in epoch milliseconds (1791910800000 …)
$r.coverage             # holiday-table coverage and runway (empty when there is no table)
```

- `dates` are the wall-clock labels; `points` are the same points in epoch milliseconds. The `#` lines never appear in `--json`.
- Errors come back as JSON too (`error.kind`, `error.message`). The exit code is in `$LASTEXITCODE`: 0 is success, 1 is an error.
- The canonical shape is the [JSON Schema](https://kairos-lang.org/schema/cli-report.schema.json).

**The character-encoding trap.** Do not use `>` to write to a file:

- Windows PowerShell 5.1 writes UTF-16 with `>`; other tools cannot read the `.json` or `.ics`.
- Works in every version: `cmd /c "kairos list … --json C:\kairos\patch.kairos > out.json"`.
- PowerShell 7 writes UTF-8 with `>`. To stay in PowerShell on 5.1: `kairos … | Out-File -Encoding utf8 out.json`.
- Garbled text on screen: run `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` first.

## Asking "is today a firing day?" every morning — Task Scheduler

One pattern. **Keep Task Scheduler as the clock, and move only the decision to Kairos.** Every morning at 08:30, ask
"is there a point today?" and, if so, start the notification script. The same pattern for cron is in the "Running it"
section of [Last day of the month](cron-last-day-of-month.md).

The decision script, `C:\kairos\run-if-today.ps1`:

```powershell
# run-if-today.ps1 — if today is a firing day, run the command given in the remaining arguments (Windows PowerShell 5.1 or later)
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File run-if-today.ps1 <definition.kairos> <command to run> [args...]
# Rehearsal: set the environment variable KAIROS_TODAY to YYYY-MM-DD and that day is treated as "today"
param(
  [Parameter(Mandatory = $true)] [string] $Definition,
  [Parameter(Mandatory = $true)] [string] $Command,
  [Parameter(ValueFromRemainingArguments = $true)] [string[]] $CommandArgs = @()
)
$kairos = 'kairos'                      # when running as SYSTEM, use the absolute path of kairos.cmd under C:\kairos (the administrator's pattern)
$tz = 'Asia/Tokyo'                      # whose calendar "today" is read on; keep it equal to the machine's time-zone setting
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8   # kairos writes UTF-8

$culture = [System.Globalization.CultureInfo]::InvariantCulture
$today = if ($env:KAIROS_TODAY) { $env:KAIROS_TODAY } else { (Get-Date).ToString('yyyy-MM-dd', $culture) }
$tomorrow = [datetime]::ParseExact($today, 'yyyy-MM-dd', $culture).AddDays(1).ToString('yyyy-MM-dd', $culture)

# Ask --json for the window from today up to, but not including, tomorrow
$json = & $kairos list --from $today --to $tomorrow --tz $tz --json $Definition
if ($LASTEXITCODE -ne 0) {
  [Console]::Error.WriteLine("kairos failed (exit code $LASTEXITCODE): $json")
  exit 1
}
$report = ($json -join "`n") | ConvertFrom-Json
if (-not $report) { exit 1 }            # unreadable JSON: do nothing
$dates = @($report.results[0].dates | Where-Object { $_ })
if ($dates.Count -eq 0) { exit 0 }      # not a firing day: exit quietly

& $Command @CommandArgs                 # firing day: run the notification script
exit $LASTEXITCODE
```

- The notification script `C:\kairos\notify.ps1` can be anything: send mail, post to a Teams webhook, append a line to a log.
- On a non-firing day it does nothing and exits 0. If `kairos` fails, it reports on stderr and exits 1.
- `$today` comes from the machine clock. Keep the machine's time-zone setting and `$tz` equal (a Japan setting already matches).

**Rehearse first.** Hand it a date through the environment variable and run it by hand. Nothing happens on 10/13 (Tuesday); the notification runs only on 10/14 (Wednesday):

```powershell
$env:KAIROS_TODAY = '2026-10-13'
powershell -NoProfile -ExecutionPolicy Bypass -File C:\kairos\run-if-today.ps1 C:\kairos\patch.kairos C:\kairos\notify.ps1
$env:KAIROS_TODAY = '2026-10-14'
powershell -NoProfile -ExecutionPolicy Bypass -File C:\kairos\run-if-today.ps1 C:\kairos\patch.kairos C:\kairos\notify.ps1
Remove-Item Env:KAIROS_TODAY
```

**Register the task.** Decide every day at 08:30 (from an administrator PowerShell or Command Prompt):

```powershell
schtasks /Create /SC DAILY /ST 08:30 /TN "Kairos\PatchTuesday" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\kairos\run-if-today.ps1 C:\kairos\patch.kairos C:\kairos\notify.ps1"
```

- [Microsoft Learn: schtasks create](https://learn.microsoft.com/windows-server/administration/windows-commands/schtasks-create) has the syntax. `/SD` is not used: its date format is regional.

Run-as account and power (measured 2026-10-13):

- Without `/RU` it runs as the registering account and no password is asked, but **it runs only while that user is logged on**. Unattended: `/RU <user> /RP <password>`.
- On a laptop the default is "Start the task only if the computer is on AC power". To run on battery too, open the task in Task Scheduler and clear it on the Conditions tab.
- To run whether or not anyone is logged on, register it as SYSTEM with the administrator's pattern below.
- `/RL HIGHEST` only if the notification script needs admin rights.

To try it right away: `schtasks /Run /TN "Kairos\PatchTuesday"`. The result is "Last Result" in
`schtasks /Query /TN "Kairos\PatchTuesday" /V /FO LIST` (0 is success, 1 is an error).

### The administrator's pattern — as SYSTEM, on a machine that stays on

Notifications should go out whether or not anyone is logged on. **Register the task as SYSTEM on a machine that is always running (a server, say)** — measured 2026-10-13.

Prerequisites:

- Install Node.js for all users (the official installer's default), so SYSTEM can find `node` too.
- Install Kairos where SYSTEM can read it. A `kairos` in a user's folder (`%APPDATA%\npm`) is not usable from SYSTEM, and the task fails.

```powershell
npm install --prefix C:\kairos kairos-lang
# change this one line in run-if-today.ps1
$kairos = 'C:\kairos\node_modules\.bin\kairos.cmd'
```

Register it (in an administrator PowerShell, using the ScheduledTasks module instead of `schtasks`):

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

- SYSTEM needs no password and runs whether or not anyone is logged on. The power conditions are cleared here as well.
- Check that the notification script also works as SYSTEM (mail credentials, network reachability).
- To rehearse as SYSTEM, register with `$argument` temporarily set to the form below, run it with `Start-ScheduledTask @task`, and read "Last Result". Then register again with the original `$argument`.

```powershell
$argument = '-NoProfile -ExecutionPolicy Bypass -Command $env:KAIROS_TODAY = ''2026-10-14''; . "C:\kairos\run-if-today.ps1" -Definition "C:\kairos\patch.kairos" -Command "C:\kairos\notify.ps1"'
```

## Putting it in a calendar — Outlook

Export an iCalendar file with `--ics` and import it into Outlook. Write the file through `cmd /c` (the encoding trap above):

```powershell
cmd /c "kairos list --from 2026-10-01 --to 2027-01-01 --tz Asia/Tokyo --ics C:\kairos\patch.kairos > C:\kairos\patch.ics"
```

What is in the file:

- One point becomes one event. The event name is the comment on line 1 of the definition.
- A point with a time becomes a zero-minute event with a reminder at that time; it does not block free/busy time. Here the reminder fires on Wednesday at 2 or 3 am.
- If the range has no points, no file is written and the exit code is 2.

Importing into Outlook (measured 2026-10-13 in the new Outlook and in classic Outlook):

- New Outlook: "Add calendar" → "Upload from file" → "Browse" to pick the `.ics`, choose the target calendar, then "Add to calendar". Double-clicking the `.ics` opens the same screen.
- Classic Outlook: double-clicking the `.ics` asks whether to open it as a new calendar or import it into the calendar in use. To put it into your own calendar, choose "Import".
- Both place the events at the times the CLI printed. Each event body carries the point's date-time and the expression, so you can trace which definition it came from.

**Outlook cannot import `--ics-series`** (measured the same day).

- The new Outlook says it could not import the calendar. Classic Outlook shows no error and imports nothing.
- `--ics-series`, which groups an expression into one recurring event, is for Google Calendar. Use `--ics` for Outlook.
- Details: the `--ics` section of the [reference implementation README](../../impl/README.md) (Japanese).

**To get the reminder in the morning, move the time in the definition.** Keep the release point inside the Pacific Time
premise, refer to it from a Tokyo premise, and attach 9:00 of that day:

```kairos
# Patch Tuesday notification (9:00 in Tokyo)
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

- `snapTo(day)` lands on "the Tokyo day the release instant belongs to", and `at(T09:00)` attaches 9:00. The third Wednesdays of April and July come out by themselves.
- The decision script works unchanged with this definition. Only the definition-file argument changes.

## Pitfalls at a glance

| Pitfall | What happens | What to do |
|---|---|---|
| No `--tz` | Points print in the machine's time zone. On a UTC server that is Tuesday 17:00 | Always `--tz Asia/Tokyo`. The definition's tz and the display tz are two different things |
| `>` in PowerShell 5.1 | The file is UTF-16 and other tools cannot read it | `cmd /c "kairos … > out.json"` — works in every version |
| Garbled non-ASCII text | PowerShell decodes UTF-8 with its default code page | Run `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` first |
| Execution policy | The `.ps1` stops with "running scripts is disabled" | `powershell -ExecutionPolicy Bypass -File …` — affects that process only |
| The task's user | Without `/RU` it is the registering account and runs only while logged on. SYSTEM cannot use a `kairos` in a user's folder | To run always, use the administrator's pattern (SYSTEM, installed under `C:\kairos`, absolute path) |
| `--ics-series` into Outlook | New Outlook shows an error; classic Outlook silently imports nothing | Use `--ics` |
| A time in `--from`/`--to` | The error "日付は YYYY-MM-DD" (dates only) | Write dates only. The `--to` day is not included |
| Holiday table runs out | `# ⚠ 範囲外` appears and the runway is negative. Points come out without holidays | Extend the table, including the end of `covering:` |
| Laptop on battery | By default the task does not start unless on AC power, so that day's notification is silently skipped | Clear "only if the computer is on AC power" on the task's Conditions tab |
| `/SD` in schtasks | Fails depending on the regional date format | Do not use it. `/SC DAILY /ST` alone starts today |
| No task output kept | Task Scheduler does not save standard output | Read the exit code in "Last Result". If you need a record, write it from the notification script |

## Next version

The next version adds a tab-separated table output for Excel.

## Try it in your browser

[Open the definition in the Playground (shown in Tokyo time)](https://kairos-lang.org/en/playground/#s=IyBQYXRjaCBUdWVzZGF5IChzZWNvbmQgVHVlc2RheSwgMTA6MDAgUGFjaWZpYyBUaW1lKQpwcmVtaXNlIFBUIHsKICBjYWxlbmRhci1zeXN0ZW06IEdyZWdvcmlhbgogIHR6OiAiQW1lcmljYS9Mb3NfQW5nZWxlcyIKICB3a3N0OiBTdW4KfQpAUFQKcGF0Y2hEYXkgPSBldmVyeURheSB8PiBmaWx0ZXIoZCA9PiB3ZWVrZGF5KGQpID09IFR1ZSkgfD4gd2l0aGluKG1vbnRoKSB8PiBudGgoMikKcGF0Y2hEYXkgfD4gYXQoVDEwOjAwKQo&f=2026-10-01&t=2026-12-31&z=Asia%2FTokyo)
— the three points above come out. Change the range or `at(T10:00)` and try. Everything runs in the browser; nothing is sent anywhere.

## Related

- The definition's origin, London and Sydney times, the wrong example: [Patch Tuesday](patch-tuesday.md)
- The same pattern from cron: [Last day of the month](cron-last-day-of-month.md), "Running it" · blog: [Migrating from crontab](https://selog.tech/?p=398) · [Month-end automation](https://selog.tech/?p=409) (Japanese)
- CLI options (`--json`, `--ics`, `--lang en`, exit codes): [reference implementation README](../../impl/README.md) (Japanese)
