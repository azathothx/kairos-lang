# レシピ——「書けない」と言われてきたスケジュールの実用形

cron・Quartz・iCalendar RRULE で「書けない」と長く言われてきたスケジュール要求を、
**1 要求 1 ページ**の実用形で示す。各ページは「何が起きるか（出典つき）→ Kairos の式
（実行検証済み）→ ブラウザで試す」の順——答えを最初に、経緯は後に。

| ページ | 要求 |
|---|---|
| [月末・月末最終営業日](cron-last-day-of-month.md) | cron 最頻出の挫折点。営業日版まで |
| [イースターの日付](easter-schedule.md) | RRULE が書けない移動祝日の代表。データゼロの純算術 |
| [4-4-5 会計暦](4-4-5-calendar.md) | 「月」が無い暦。第 53 週の繰上げが定義の形から出る |
| [15 日に最も近い平日](quartz-15w-nearest-weekday.md) | Quartz `15W` の一般形。祝日対応まで |

- コード例はすべてリファレンス実装の doctest（`impl/test/doctest.test.ts`）が実行検証する。
  `# eval:` が評価範囲・`#=>` が期待値（規約は [reference](../reference/README.md#実行例の規約doctest)）。
  `@JP` を使う例には標準前提（Gregorian・Asia/Tokyo・wkst: Mon・2026 年の確定祝日つき
  カレンダー実体）が自動で前置される。
- 各ページの Playground リンクは**前提込みの自己完結形**——ブラウザでそのまま実行・編集できる
  （[Playground](../playground/) はリファレンス実装をそのまま動かす。サーバー送信なし）。
- 収集した「書けない」実例の全カタログ（32 項目・出典つき）と三分類は
  [調査研究 11](../design/40-examples/11-impossible-schedules.md)。本レシピ集はその実測節の
  実用形への再構成。
- 言語自体の説明は[言語仕様](../spec/)・語彙は[記述語リファレンス](../reference/)。
