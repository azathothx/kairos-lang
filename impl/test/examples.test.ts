// spec §7 代表例の実行検証（糖衣と core 展開の両方・JS Date オラクル照合）
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';
import {
  PRELUDE, STATUTORY_2026, HOLIDAYS_2026, MONTHS_2026,
  oracleMonthEndMinus3Biz, oracleSecondBizNextFriday, oraclePayday,
} from './helpers.ts';

const Y2026 = { from: '2026-01-01', to: '2027-01-01' };

describe('§7.1 毎月末の 3 営業日前', () => {
  const expected = MONTHS_2026.map(m => oracleMonthEndMinus3Biz(2026, m));

  it('糖衣形', () => {
    const dates = evalDates(PRELUDE + `
monthEnd |> roll(Preceding, on: bizDay) |> shift(-3, unit: bizDay)
`, Y2026);
    expect(dates).toEqual(expected);
  });

  it('core 展開形と一致', () => {
    const dates = evalDates(PRELUDE + `
everyDay |> within(month) |> last |> roll(Preceding, on: bizDay) |> shift(-3, unit: bizDay)
`, Y2026);
    expect(dates).toEqual(expected);
  });

  it('軸の畳み込み（@JP axis: bizDay で on:/unit: を省略。§3.3）', () => {
    const dates = evalDates(PRELUDE + `
@JP axis: bizDay
monthEnd |> roll(Preceding) |> shift(-3)
`, Y2026);
    expect(dates).toEqual(expected);
  });
});

describe('§7.2 毎月第 2 営業日の次の金曜', () => {
  const expected = MONTHS_2026.map(m => oracleSecondBizNextFriday(2026, m));
  // businessDays は変換（段）——生成子位置には置けない（F45 で §7.2 の例を修正。ADR-20 と整合）
  const SUGAR = `
businessDays(on: p) = filter(on: p)
nextWeekday(d) = roll(Following, on: (everyDay |> filter(x => weekday(x) == d)))
`;

  it('糖衣形（§7.2 修正後: everyDay |> businessDays）', () => {
    const dates = evalDates(PRELUDE + SUGAR + `
everyDay |> businessDays(on: bizDay) |> within(month) |> nth(2) |> nextWeekday(Fri)
`, Y2026);
    expect(dates).toEqual(expected);
  });

  it('core 展開形と一致', () => {
    const dates = evalDates(PRELUDE + `
everyDay |> filter(on: bizDay) |> within(month) |> nth(2)
         |> roll(Following, on: (everyDay |> filter(x => weekday(x) == Fri)))
`, Y2026);
    expect(dates).toEqual(expected);
  });

  it('nextWeekday は WKST 非依存・金曜ならその日のまま（§4.8 前方 roll）', () => {
    // 2026-01 の第 2 営業日は 1/5(月)…1/6(火)。次の金曜 1/9。
    const dates = evalDates(PRELUDE + SUGAR + `
everyDay |> businessDays(on: bizDay) |> within(month) |> nth(2) |> nextWeekday(Fri)
`, { from: '2026-01-01', to: '2026-02-01' });
    expect(dates).toEqual([oracleSecondBizNextFriday(2026, 1)]);
  });
});

describe('§7.3 会計暦（4 月始まり）', () => {
  const FY = `
premise Fiscal = Gregorian with { year = month span (_ => 12) phase: 3 }
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
`;
  const opts = { from: '2025-01-01', to: '2028-01-01' };

  it('with 上書き: 各会計年度の初日は 4/1', () => {
    const dates = evalDates(FY + `
@FY
everyDay |> within(year) |> first
`, opts);
    expect(dates).toEqual(['2025-04-01', '2026-04-01', '2027-04-01']);
  });

  it('shiftBoundary 糖衣は with 展開と一致（§3.7）', () => {
    const dates = evalDates(`
premise Fiscal2 = Gregorian |> shiftBoundary(+3, on: year, unit: month)
premise FY2 { calendar-system: Fiscal2; tz: "Asia/Tokyo"; wkst: Mon }
@FY2
everyDay |> within(year) |> first
`, opts);
    expect(dates).toEqual(['2025-04-01', '2026-04-01', '2027-04-01']);
  });

  it('quarter は継承定義が新 year に自動追従（機構 A）', () => {
    const dates = evalDates(FY + `
@FY
everyDay |> within(quarter) |> first
`, { from: '2026-01-01', to: '2027-01-01' });
    expect(dates).toEqual(['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01']);
  });

  it('month は不動: 会計暦でも暦月の月末は変わらない（日付不動・I1）', () => {
    const greg = evalDates(PRELUDE + `\nmonthEnd\n`, Y2026);
    const fisc = evalDates(FY + `\n@FY\nmonthEnd\n`, Y2026);
    expect(fisc).toEqual(greg);
  });
});

describe('§7.4 給料日（毎月 25 日・休日なら前営業日）', () => {
  it('オラクル一致', () => {
    const dates = evalDates(PRELUDE + `
everyDay |> within(month) |> nth(25) |> roll(Preceding, on: bizDay)
`, Y2026);
    expect(dates).toEqual(MONTHS_2026.map(m => oraclePayday(2026, m)));
  });
});

describe('§7.5 祝日カスケード（振替休日・国民の休日）', () => {
  it('2026: 振替 5/6 と国民の休日 9/22 が導出される', () => {
    const dates = evalDates(PRELUDE + `
statutory   = [${STATUTORY_2026.join(', ')}] covering: 2026..2026
nonHoliday  = everyDay \\ statutory
substitutes = statutory |> filter(d => weekday(d) == Sun) |> roll(Following, on: nonHoliday)
sandwiched  = ((statutory |> shift(+1, unit: day)) & (statutory |> shift(-1, unit: day))) \\ statutory
holidays    = statutory | substitutes | sandwiched
holidays
`, Y2026);
    expect(dates).toEqual(HOLIDAYS_2026);   // 16 法定 + 振替 5/6 + 挟まれ 9/22 = 18 日
  });
});

describe('§7.6 年の十二支（干支）', () => {
  it('午年の元日は 2026, 2038', () => {
    const dates = evalDates(`
premise JPEto = Gregorian with {
  yearBranch = year cycle [子, 丑, 寅, 卯, 辰, 巳, 午, 未, 申, 酉, 戌, 亥] anchor: 2020-01-01
}
@JPEto
everyDay |> within(year) |> first |> filter(d => yearBranch(d) == 午)
`, { from: '2020-01-01', to: '2039-01-01' });
    expect(dates).toEqual(['2026-01-01', '2038-01-01']);
  });
});

describe('week 窓と WKST（§3.6・stdlib §4.5）', () => {
  it('wkst: Mon → 週の第 1 日は月曜', () => {
    const dates = evalDates(PRELUDE + `
everyDay |> within(week) |> first
`, { from: '2026-01-01', to: '2026-02-01' });
    expect(dates).toEqual(['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']);
  });

  it('wkst: Sun → 週の第 1 日は日曜（週窓の切れ目だけが動く）', () => {
    const dates = evalDates(`
premise JPSun { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Sun }
@JPSun
everyDay |> within(week) |> first
`, { from: '2026-01-01', to: '2026-02-01' });
    expect(dates).toEqual(['2026-01-04', '2026-01-11', '2026-01-18', '2026-01-25']);
  });
});

describe('入れ子窓と of:（§4.3）', () => {
  it('nth(2, of: month) は月窓相対', () => {
    const dates = evalDates(PRELUDE + `
everyDay |> within(quarter) |> within(month) |> nth(2, of: month)
`, { from: '2026-01-01', to: '2026-04-01' });
    expect(dates).toEqual(['2026-01-02', '2026-02-02', '2026-03-02']);
  });

  it('first(of: quarter) は四半期相対', () => {
    const dates = evalDates(PRELUDE + `
everyDay |> within(quarter) |> first(of: quarter)
`, Y2026);
    expect(dates).toEqual(['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01']);
  });
});
