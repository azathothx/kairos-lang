// テーブルリテラル後置の順序自由化と黙殺封じ（F104・2026-07-25 第 5 便）
// - 従来: labels: の値リストが後続の covering: を「内側リストの後置」として吸い、誰にも読まれず
//   黙殺されていた（EBNF 固定順の外の書き方を無検査受理——覆域は既定〈列の端〉に落ちる）
// - 修正: labels: の値は後置なしでパースし、covering:/labels: は外側でどの順でも受ける。
//   二重指定は構文エラー
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';

const JP = `
premise JPX { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@JPX
`;
const Y2026 = { from: '2026-01-01', to: '2026-05-01' };

describe('テーブル後置の順序自由（F104）', () => {
  it('labels: の後の covering: も解釈される——包含検査が働く（黙殺なら素通りしていた形）', () => {
    expect(() => run(JP + `
t = [2026-01-05, 2026-02-04] labels: [小寒, 立春] covering: 2026-02-01..2026-03-01
t
`, Y2026)).toThrow(/covering の外/);
  });

  it('labels: の後の covering: が覆域として効く——範囲外註釈の境界が主張どおり', () => {
    const r = run(JP + `
t = [2026-02-04, 2026-03-05] labels: [立春, 啓蟄] covering: 2026-02-01..2026-04-01
t
`, Y2026);
    expect(r.results[0].dates).toEqual(['2026-02-04', '2026-03-05']);
    // 覆域 [2/1..4/1] → 評価範囲 [1/1..5/1) の外側 2 区間が範囲外
    expect(r.results[0].annotations.length).toBe(2);
    expect(r.results[0].annotations[0].covering).toContain('2026-02-01..2026-04-01');
  });

  it('正書順（covering: → labels:）は従来どおり', () => {
    expect(evalDates(JP + `
t = [2026-02-04, 2026-03-05] covering: 2026-02-01..2026-04-01 labels: [立春, 啓蟄]
t
`, Y2026)).toEqual(['2026-02-04', '2026-03-05']);
  });

  it('covering: の二重指定は構文エラー', () => {
    expect(() => run(JP + `
t = [2026-02-04] covering: 2026..2026 labels: [立春] covering: 2026..2027
t
`, Y2026)).toThrow(/covering: の二重指定/);
  });

  it('labels: の二重指定は構文エラー', () => {
    expect(() => run(JP + `
t = [2026-02-04] labels: [立春] labels: [啓蟄]
t
`, Y2026)).toThrow(/labels: の二重指定/);
  });
});
