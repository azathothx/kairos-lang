// 束縛右辺の複数行継続（F91・ADR-44）
// 文の区切りは改行。ただし (A) 括弧・角括弧が閉じていない間の改行（現行挙動の明文化）と
// (B) 行末または行頭が 段接続 |> または結合子 |・&・\ のときは前行の継続。
// 文・前文メンバーは結合子で始まれないので一義——「行頭の結合子＝継続」に曖昧はない。
import { describe, it, expect } from 'vitest';
import { evalDates } from '../src/index.ts';

const G = 'premise G { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }\n@G\n';
const JAN = { from: '2026-01-01', to: '2026-02-01' };
const PRE = G + `
mon = everyDay |> filter(d => weekday(d) == Mon)
tue = everyDay |> filter(d => weekday(d) == Tue)
`;

describe('行頭の結合子＝前行の継続（ADR-44 (B)）', () => {
  it('行頭 |（和）——単一行と同じ結果', () => {
    expect(evalDates(PRE + 'mon\n| tue', JAN)).toEqual(evalDates(PRE + 'mon | tue', JAN));
  });

  it('行頭 &（積）——インデント付きの継続行', () => {
    expect(evalDates(G + 'month(5)\n  & year(2026)', { from: '2026-01-01', to: '2027-01-01' }))
      .toEqual(evalDates(G + 'month(5) & year(2026)', { from: '2026-01-01', to: '2027-01-01' }));
  });

  it('行頭 \\（差）——幅リテラル等と衝突しない', () => {
    expect(evalDates(PRE + 'everyDay\n\\ mon', JAN)).toEqual(evalDates(PRE + 'everyDay \\ mon', JAN));
  });

  it('束縛右辺でも効く（複数の継続行のカスケード）', () => {
    const multi = PRE + 'x = mon\n  | tue\n  \\ year(2027)\nx';
    const single = PRE + 'x = mon | tue \\ year(2027)\nx';
    expect(evalDates(multi, JAN)).toEqual(evalDates(single, JAN));
  });
});

describe('行末の結合子＝次行へ継続（ADR-44 (B)）', () => {
  it('行末 |', () => {
    expect(evalDates(PRE + 'mon |\ntue', JAN)).toEqual(evalDates(PRE + 'mon | tue', JAN));
  });

  it('行末 & と行末 \\', () => {
    expect(evalDates(G + 'month(5) &\nyear(2026)', { from: '2026-01-01', to: '2027-01-01' }))
      .toEqual(evalDates(G + 'month(5) & year(2026)', { from: '2026-01-01', to: '2027-01-01' }));
    expect(evalDates(PRE + 'x = everyDay \\\nmon\nx', JAN))
      .toEqual(evalDates(PRE + 'x = everyDay \\ mon\nx', JAN));
  });
});

describe('premise ブロック内の束縛右辺でも効く（実体の sessionOpens 級）', () => {
  it('二部制セッションの sessionOpens/sessionCloses を複数行の和で書く', () => {
    const dates = evalDates(`
premise C2 {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "test"
  nonWorking = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  sessionOpens = (everyInstant |> strideBy(1d, from: 2026-01-05T09:00))
    | (everyInstant |> strideBy(1d, from: 2026-01-05T15:00))
  sessionCloses = (everyInstant |> strideBy(1d, from: 2026-01-05T12:00))
    | (everyInstant |> strideBy(1d, from: 2026-01-05T17:00))
}
premise Q { calendar-system: Gregorian; calendar: C2; tz: "Asia/Tokyo"; wkst: Mon }
@Q
bizOpen
`, { from: '2026-01-05', to: '2026-01-06' });
    expect(dates).toEqual(['2026-01-05T09:00', '2026-01-05T15:00']);
  });
});

describe('退行なし: 直前に文が無い行頭の結合子は引き続き構文エラー', () => {
  it('プログラム先頭の | は構文エラー（継続と誤読しない）', () => {
    expect(() => evalDates('| everyDay', JAN)).toThrow(/式を期待/);
  });

  it('前文（@ 形）の直後の & は構文エラー（前文は式でない——継続先が無い）', () => {
    expect(() => evalDates(G + '& everyDay', JAN)).toThrow(/式を期待/);
  });
});
