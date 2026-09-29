// 前文メンバーの自己参照（F115＝還流 2026-09-28 定期便 #4）——witness:
// `roll: roll`・`axis: axis`・`axis: roll; roll: axis` のように値が前文メンバー名へ戻る宣言は、
// 名前解決が無限再帰して誘導の無い `RangeError: Maximum call stack size exceeded` で落ちていた。
// 解決中の値の再入で止め、誘導つきのエラーにする。premise の宣言・派生の継承・軽量形の後置の 3 形と、
// roll:／axis: 以外の語（wkst:・granularity:）・相互参照・対照（正常な宣言・同名の公開語・正当な入れ子）。
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';

const CAL = `
premise Cal { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  hol = [2026-02-11, 2026-02-23, 2026-03-20] covering: 2026..2026
  nonWorking = (everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)) | hol
}
`;
const W = { from: '2026-02-01', to: '2026-04-01' };
const B = (m: string) => CAL + `premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon; ${m} }\n`;
const ROLL = '@Base\neveryDay |> within(month) |> nth(1) |> roll(on: bizDay)';
const SELF = (k: string) => new RegExp(`^前文メンバーの自己参照: ${k}: の値が ${k} 自身へ戻る（直接または相互）——値には規約（Following/Preceding）・点列や premise の名前・文字列を書く（前文メンバー名は値にならない。§3\\.3）$`);

describe('F115: 前文メンバーの自己参照は誘導つきエラー（RangeError にしない）', () => {
  it('roll: roll——premise の宣言', () => {
    expect(() => run(B('roll: roll') + ROLL, W)).toThrow(SELF('roll'));
  });
  it('roll: roll——派生の継承（Base の宣言を Mine が継ぐ）', () => {
    expect(() => run(B('roll: roll') + 'premise Mine = Base with { }\n@Mine\neveryDay |> within(month) |> nth(1) |> roll(on: bizDay)', W))
      .toThrow(SELF('roll'));
  });
  it('roll: roll——軽量形の後置', () => {
    expect(() => run(B('') + '@Base roll: roll\neveryDay |> within(month) |> nth(1) |> roll(on: bizDay)', W)).toThrow(SELF('roll'));
  });
  it('axis: axis（宣言・後置）', () => {
    expect(() => run(B('axis: axis') + '@Base\neveryDay |> within(month) |> nth(1) |> roll(Following)', W)).toThrow(SELF('axis'));
    expect(() => run(B('') + '@Base axis: axis\neveryDay |> within(month) |> nth(1) |> roll(Following)', W)).toThrow(SELF('axis'));
  });
  it('wkst: wkst・granularity: granularity（roll:/axis: 以外の語も同じ経路）', () => {
    expect(() => run(B('wkst: wkst') + '@Base\neveryDay |> within(week) |> nth(1)', W)).toThrow(SELF('wkst'));
    expect(() => run(B('granularity: granularity') + '@Base\neveryDay |> within(granularity) |> nth(1)', W)).toThrow(SELF('granularity'));
  });
  it('相互参照 axis: roll; roll: axis', () => {
    expect(() => run(B('axis: roll; roll: axis') + '@Base\neveryDay |> within(month) |> nth(1) |> roll()', W)).toThrow(/前文メンバーの自己参照/);
  });
  it('対照: 正常な宣言は通る（roll: Following・axis: bizDay）', () => {
    expect(evalDates(B('roll: Following') + ROLL, W)).toEqual(['2026-02-02', '2026-03-02']);
    expect(evalDates(B('axis: bizDay') + '@Base\neveryDay |> within(month) |> nth(1) |> roll(Following)', W)).toEqual(['2026-02-02', '2026-03-02']);
  });
  it('対照: 同名の公開語があれば公開語が先に解決される（axis: axis で公開語 axis = bizDay は自己参照でない）', () => {
    expect(evalDates(CAL + `premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon; axis: axis
  axis = bizDay
}
@Base
everyDay |> within(month) |> nth(1) |> roll(Following)`, W)).toEqual(['2026-02-02', '2026-03-02']);
  });
  it('対照: 正当な入れ子（axis: bizDay の導出中に nonWorking が granularity: を読む）は誤検出しない', () => {
    expect(evalDates(`premise Cal { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  nonWorking = everyDay |> within(granularity) |> nth(1)
}
premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon; granularity: month; axis: bizDay }
@Base
everyDay |> within(month) |> nth(2) |> roll(Following)`, W)).toEqual(['2026-02-02', '2026-03-02']);
  });
});
