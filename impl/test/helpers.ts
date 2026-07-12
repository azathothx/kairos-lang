// テスト共通: JP premise（2026 年の祝日・営業日）と JS Date による独立オラクル

/** 2026 年の実際の休日（振替 5/6・国民の休日 9/22 を含む観測値）——bizDay 用 */
export const HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-12', '2026-02-11', '2026-02-23', '2026-03-20',
  '2026-04-29', '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06',
  '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22', '2026-09-23',
  '2026-10-12', '2026-11-03', '2026-11-23',
];

/** 法定祝日のみ（振替・国民の休日を含まない）——§7.5 カスケードの入力 */
export const STATUTORY_2026 = HOLIDAYS_2026.filter(d => d !== '2026-05-06' && d !== '2026-09-22');

// bizDay は calendar: TSE からの標準導出（ADR-35）——doctest 全体が実体経由の導出の実行検証を兼ねる
export const PRELUDE = `
premise TSE {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "jpx.co.jp/trading-calendar"
  asof: 2026-01-05
  nonWorking = satSun | holidays2026
}
premise JP {
  calendar-system: Gregorian
  calendar: TSE
  tz: "Asia/Tokyo"
  wkst: Mon
}
@JP
holidays2026 = [${HOLIDAYS_2026.join(', ')}] covering: 2026..2026
satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
`;

// ---- オラクル（暦計算は UTC の Date で行う。市民日の算術なので TZ 非依存） ----

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
export const isHoliday = (d: Date) => HOLIDAYS_2026.includes(iso(d));
export const isBiz = (d: Date) =>
  d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !isHoliday(d);

/** 月末の 3 営業日前（§7.1 オラクル） */
export function oracleMonthEndMinus3Biz(y: number, m1to12: number): string {
  let d = new Date(Date.UTC(y, m1to12, 0));           // 月末日
  while (!isBiz(d)) d = addDays(d, -1);               // roll(Preceding)
  let k = 3;
  while (k > 0) { d = addDays(d, -1); if (isBiz(d)) k--; }
  return iso(d);
}

/** 第 2 営業日の次の金曜（§7.2 オラクル。金曜ならその日のまま） */
export function oracleSecondBizNextFriday(y: number, m1to12: number): string {
  let d = new Date(Date.UTC(y, m1to12 - 1, 1));
  let c = 0;
  for (;;) {
    if (isBiz(d)) { c++; if (c === 2) break; }
    d = addDays(d, 1);
  }
  return iso(addDays(d, (5 - d.getUTCDay() + 7) % 7));
}

/** 給料日: 25 日・休日なら前営業日（§7.4 オラクル） */
export function oraclePayday(y: number, m1to12: number): string {
  let d = new Date(Date.UTC(y, m1to12 - 1, 25));
  while (!isBiz(d)) d = addDays(d, -1);
  return iso(d);
}

export const MONTHS_2026 = Array.from({ length: 12 }, (_, i) => i + 1);
