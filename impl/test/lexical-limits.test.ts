// 字句の締めと裸の日付束縛（F51/F66/F97 の裁定・ADR-43）
// - F66 (a): 非実在日付（2026-02-30 級）は字句エラー——proleptic Gregorian 固定（月 01..12・
//   日は月と閏年規則の実在日のみ。黙ったロールオーバーの封止。時刻部検査 23:59:60 と同じ層）
// - F66 (b): 固定オフセット tz は厳格一意形 ^[+-]HH:MM$ のみ（ゼロ埋め必須・HH 00..14・MM 00..59。
//   Intl が受ける別綴り "+0900"・"+15:00" も封じる。"UTC" は IANA 名として合法）
// - F97: 日付リテラルの裸の値束縛（d0 = 2026-05-15）は値型の一員として正式に合法（挙動の固定）
import { describe, it, expect } from 'vitest';
import { evalDates, lex } from '../src/index.ts';

const G = 'premise G { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }\n@G\n';
const JAN = { from: '2026-01-01', to: '2026-02-01' };

describe('F66 (a) 非実在日付は字句エラー（proleptic Gregorian 固定）', () => {
  it('2026-02-30 は字句エラー（2026-03-02 への黙ったロールオーバーを封じる）', () => {
    expect(() => lex('2026-02-30')).toThrow(/実在しない日付: 2026-02-30/);
    expect(() => evalDates(G + '[2026-02-30] covering: ..', JAN)).toThrow(/実在しない日付/);
  });

  it('平年の 2 月 29 日はエラー・閏年は合法（4 年規則）', () => {
    expect(() => lex('2025-02-29')).toThrow(/実在しない日付: 2025-02-29/);
    expect(() => lex('2024-02-29')).not.toThrow();
  });

  it('100 年規則・400 年規則: 1900-02-29 エラー・2000-02-29 合法', () => {
    expect(() => lex('1900-02-29')).toThrow(/実在しない日付: 1900-02-29/);
    expect(() => lex('2000-02-29')).not.toThrow();
  });

  it('月の域外（2026-13-01・2026-00-10）と日の域外（2026-04-31・2026-01-00）', () => {
    expect(() => lex('2026-13-01')).toThrow(/実在しない日付: 2026-13-01/);
    expect(() => lex('2026-00-10')).toThrow(/実在しない日付: 2026-00-10/);
    expect(() => lex('2026-04-31')).toThrow(/実在しない日付: 2026-04-31/);
    expect(() => lex('2026-01-00')).toThrow(/実在しない日付: 2026-01-00/);
  });

  it('時刻付きリテラルでも日付部の検査が先に立つ・正常日付は不変', () => {
    expect(() => lex('2026-02-30T09:00')).toThrow(/実在しない日付/);
    expect(() => lex('2026-12-31T23:59:59')).not.toThrow();
  });
});

describe('F66 (b) 固定オフセット tz は厳格一意形（Intl に渡す前の字句検査）', () => {
  const withTz = (tz: string) =>
    `premise P { calendar-system: Gregorian; tz: "${tz}"; wkst: Mon }\n@P\neveryDay`;

  it('正準形は合法: "+09:00"・"-05:30"・"+14:00"・IANA 名の "UTC"', () => {
    for (const tz of ['+09:00', '-05:30', '+14:00', 'UTC']) {
      expect(evalDates(withTz(tz), JAN).length).toBe(31);
    }
  });

  it('ゼロ埋めなし・コロンなしの別綴りは明示エラー（Intl が受ける "+0900" も封じる）', () => {
    expect(() => evalDates(withTz('+9:00'), JAN)).toThrow(/不正な固定オフセット tz: "\+9:00"/);
    expect(() => evalDates(withTz('+0900'), JAN)).toThrow(/不正な固定オフセット tz: "\+0900"/);
  });

  it('"Z"・"UTC+9" 級は明示エラー（誘導: 正準形 "±HH:MM" か IANA 名）', () => {
    expect(() => evalDates(withTz('Z'), JAN)).toThrow(/不正な固定オフセット tz: "Z".*±HH:MM/s);
    expect(() => evalDates(withTz('UTC+9'), JAN)).toThrow(/不正な固定オフセット tz: "UTC\+9"/);
  });

  it('域外のオフセットは明示エラー: "+15:00"（HH は 00..14）・"+09:60"（MM は 00..59）', () => {
    expect(() => evalDates(withTz('+15:00'), JAN)).toThrow(/不正な固定オフセット tz: "\+15:00"/);
    expect(() => evalDates(withTz('+09:60'), JAN)).toThrow(/不正な固定オフセット tz: "\+09:60"/);
  });
});

describe('F97 日付リテラルの裸の値束縛は合法（値型の一員としての時点・挙動の固定）', () => {
  it('d0 = 2026-05-15 → year(d0) は束縛名射影（点引数のまま）', () => {
    expect(evalDates(G + 'd0 = 2026-05-15\neveryDay |> filter(d => year(d0) == 2026)',
      { from: '2026-01-01', to: '2026-01-03' })).toEqual(['2026-01-01', '2026-01-02']);
  });

  it('stride の from: に束縛名で渡せる（リテラル直書きと同じ点列）', () => {
    expect(evalDates(G + 'd0 = 2026-01-05\neveryDay |> stride(7, from: d0)', JAN))
      .toEqual(evalDates(G + 'everyDay |> stride(7, from: 2026-01-05)', JAN));
  });

  it('grid の anchor: に束縛名で渡せる', () => {
    const src = (a: string) => G + `${a}decade = chronos grid 10d anchor: ${a ? 'd0' : '2026-01-05'}
everyDay |> within(decade) |> first`;
    expect(evalDates(src('d0 = 2026-01-05\n'), JAN)).toEqual(evalDates(src(''), JAN));
    expect(evalDates(src('d0 = 2026-01-05\n'), JAN)).toEqual(['2026-01-05', '2026-01-15', '2026-01-25']);
  });

  it('時刻付きリテラルの裸束縛も同様（strideBy の from:）', () => {
    expect(evalDates(G + 'd0t = 2026-01-05T09:00\neveryInstant |> strideBy(1d, from: d0t)',
      { from: '2026-01-05', to: '2026-01-08' }))
      .toEqual(['2026-01-05T09:00', '2026-01-06T09:00', '2026-01-07T09:00']);
  });
});
