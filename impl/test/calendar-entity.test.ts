// カレンダー実体（ADR-35）と粒度整合（ADR-36）の検証
// - 標準導出 bizDay・軸位置の premise 名（on: TSE）・正体判定の静的エラー
// - 整列タグの伝播と &・\・filter(on:)・roll(on:)・shift(unit: 点列軸) の検査
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';
import { PRELUDE, MONTHS_2026, oraclePayday } from './helpers.ts';

const Y2026 = { from: '2026-01-01', to: '2027-01-01' };
const JAN = { from: '2026-01-01', to: '2026-02-01' };

describe('ADR-35: カレンダー実体と bizDay 標準導出', () => {
  it('標準導出 bizDay がオラクル（給料日 12 か月）と一致する', () => {
    const dates = evalDates(PRELUDE + `
everyDay |> within(month) |> nth(25) |> roll(Preceding, on: bizDay)
`, Y2026);
    expect(dates).toEqual(MONTHS_2026.map(m => oraclePayday(2026, m)));
  });

  it('on: TSE ≡ calendar: TSE の下での on: bizDay（判断 4 の等価）', () => {
    const viaBizDay = evalDates(PRELUDE + `
everyDay |> within(month) |> nth(25) |> roll(Preceding, on: bizDay)
`, Y2026);
    const viaEntity = evalDates(PRELUDE + `
everyDay |> within(month) |> nth(25) |> roll(Preceding, on: TSE)
`, Y2026);
    expect(viaEntity).toEqual(viaBizDay);
  });

  it('axis: に実体名を畳める（@JP axis: TSE で roll(Preceding) を省略形に）', () => {
    const dates = evalDates(PRELUDE + `
@JP axis: TSE
everyDay |> within(month) |> nth(25) |> roll(Preceding)
`, Y2026);
    expect(dates).toEqual(MONTHS_2026.map(m => oraclePayday(2026, m)));
  });

  it('実体でない premise 名を軸位置に置くと正体判定の静的エラー', () => {
    expect(() => run(PRELUDE + `
monthEnd |> roll(Preceding, on: Gregorian)
`, Y2026)).toThrow(/カレンダー実体ではない/);
  });

  it('calendar: が nonWorking を持たない premise を指すと bizDay 導出でエラー', () => {
    expect(() => run(`
premise P { calendar-system: Gregorian; calendar: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@P
everyDay |> filter(on: bizDay)
`, JAN)).toThrow(/カレンダー実体ではない/);
  });

  it('calendar: の在圏では bizDay の手動束縛は静的エラー（言語予約）', () => {
    expect(() => run(PRELUDE + `
bizDay = everyDay
everyDay |> filter(on: bizDay)
`, JAN)).toThrow(/言語予約/);
  });

  it('tz: を宣言しない実体は正体判定でエラー（内側固定の執行点）', () => {
    expect(() => run(`
premise NoTz {
  calendar-system: Gregorian
  source: "example"
  nonWorking = [2026-01-01] covering: 2026..2026
}
premise P { calendar-system: Gregorian; calendar: NoTz; tz: "Asia/Tokyo"; wkst: Mon }
@P
everyDay |> filter(on: bizDay)
`, JAN)).toThrow(/tz: を宣言/);
  });

  it('時刻付きの nonWorking は正体判定でエラー（day 整列の要求）', () => {
    expect(() => run(`
premise HalfDay {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "example"
  nonWorking = [2026-01-05T13:00]
}
premise P { calendar-system: Gregorian; calendar: HalfDay; tz: "Asia/Tokyo"; wkst: Mon }
@P
everyDay |> filter(on: bizDay)
`, JAN)).toThrow(/市民日グリッドに整列/);
  });

  it('軸位置の名前が束縛にも premise 名にも解決できると曖昧エラー（ADR-17）', () => {
    expect(() => run(PRELUDE + `
TSE = everyDay
monthEnd |> roll(Preceding, on: TSE)
`, Y2026)).toThrow(/曖昧/);
  });

  it('実体の相互参照は循環エラー（判断 8）', () => {
    expect(() => run(`
premise Q {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "example"
  nonWorking = everyDay |> filter(on: R)
}
premise R {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "example"
  nonWorking = everyDay |> filter(on: Q)
}
premise P { calendar-system: Gregorian; calendar: Q; tz: "Asia/Tokyo"; wkst: Mon }
@P
everyDay |> filter(on: bizDay)
`, JAN)).toThrow(/循環/);
  });

  it('実体と利用側の tz 名不一致は標準導出の整列エラー（F54 のタグ検査）', () => {
    expect(() => run(`
premise UTCCal {
  calendar-system: Gregorian
  tz: "UTC"
  source: "example"
  nonWorking = [2026-01-01] covering: 2026..2026
}
premise P { calendar-system: Gregorian; calendar: UTCCal; tz: "Asia/Tokyo"; wkst: Mon }
@P
everyDay |> filter(on: bizDay)
`, JAN)).toThrow(/整列|市民日グリッド/);
  });

  it('nonWorking を持つ premise は calendar-system: に立てられない（逆向き正体判定）', () => {
    expect(() => run(PRELUDE + `
premise Bad { calendar-system: TSE; tz: "Asia/Tokyo" }
@Bad
everyDay |> within(month) |> first
`, JAN)).toThrow(/calendar-system: にカレンダー実体は立てられない/);
  });
});

describe('ADR-36: 整列の検査', () => {
  it('everyDay \\ 時刻付き列は静的エラー（黙って空振りしない）', () => {
    expect(() => run(PRELUDE + `
everyDay \\ [2026-01-05T13:00]
`, JAN)).toThrow(/整列/);
  });

  it('snapTo(day) の明示整合で差が立つ（1/5 が除かれる）', () => {
    const dates = evalDates(PRELUDE + `
everyDay \\ ([2026-01-05T13:00] |> snapTo(day))
`, { from: '2026-01-04', to: '2026-01-07' });
    expect(dates).toEqual(['2026-01-04', '2026-01-06']);
  });

  it('和 | は整列不問（混合スケジュールは合法）だが、混合出力を & に流すとそこでエラー', () => {
    const mixed = evalDates(PRELUDE + `
(everyDay | [2026-01-05T13:00])
`, { from: '2026-01-04', to: '2026-01-06' });
    expect(mixed).toEqual(['2026-01-04', '2026-01-05', '2026-01-05T13:00']);
    expect(() => run(PRELUDE + `
(everyDay | [2026-01-05T13:00]) & everyDay
`, JAN)).toThrow(/整列/);
  });

  it('filter(on: 時刻付き列) は静的エラー', () => {
    expect(() => run(PRELUDE + `
everyDay |> filter(on: [2026-01-05T13:00])
`, JAN)).toThrow(/整列/);
  });

  it('roll の軸が時刻付き列なら静的エラー', () => {
    expect(() => run(PRELUDE + `
monthEnd |> roll(Preceding, on: [2026-01-05T13:00, 2026-02-05T13:00])
`, Y2026)).toThrow(/整列/);
  });

  it('shift(unit: day)（窓語）は整列なしの入力にも合法（区間所属・八十八夜の形）', () => {
    const dates = evalDates(PRELUDE + `
[2026-02-04T05:02] |> shift(+87, unit: day) |> snapTo(day)
`, Y2026);
    expect(dates).toEqual(['2026-05-02']);
  });

  it('strideBy(1d, from: 日付) は everyDay と同一グリッド（& が成立する）', () => {
    const dates = evalDates(PRELUDE + `
(everyInstant |> strideBy(1d, from: 2026-01-05)) & everyDay
`, { from: '2026-01-04', to: '2026-01-08' });
    expect(dates).toEqual(['2026-01-05', '2026-01-06', '2026-01-07']);
  });

  it('日内オフセットを持つ市民時グリッド（毎日 09:00）は everyDay と別 G（黙って空にならない）', () => {
    expect(() => run(PRELUDE + `
(everyInstant |> strideBy(1d, from: 2026-01-05T09:00)) & everyDay
`, JAN)).toThrow(/整列/);
  });
});
