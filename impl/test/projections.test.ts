// 射影一族（§4.9・ADR-30）・テーブルリテラル（§3.8・ADR-26/30）・天文暦データの検証
// 期待値は 40-examples/95-reference-data.md（NAOJ 令和8年暦要項）に一致させる。
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';
import { PRELUDE } from './helpers.ts';

const Y2026 = { from: '2026-01-01', to: '2027-01-01' };

// 二十四節気 2026（NAOJ 暦要項・JST）
const SEKKI_TABLE = `
sekki = [2026-01-05T17:23, 2026-01-20T10:45, 2026-02-04T05:02, 2026-02-19T00:52,
         2026-03-05T22:59, 2026-03-20T23:46, 2026-04-05T03:40, 2026-04-20T10:39,
         2026-05-05T20:49, 2026-05-21T09:37, 2026-06-06T00:48, 2026-06-21T17:25,
         2026-07-07T10:57, 2026-07-23T04:13, 2026-08-07T20:43, 2026-08-23T11:19,
         2026-09-07T23:41, 2026-09-23T09:05, 2026-10-08T15:29, 2026-10-23T18:38,
         2026-11-07T18:52, 2026-11-22T16:23, 2026-12-07T11:53, 2026-12-22T05:50]
  covering: 2026..2026
  labels: [小寒, 大寒, 立春, 雨水, 啓蟄, 春分, 清明, 穀雨, 立夏, 小満, 芒種, 夏至,
           小暑, 大暑, 立秋, 処暑, 白露, 秋分, 寒露, 霜降, 立冬, 小雪, 大雪, 冬至]
risshun = sekki |> filter(s => sekki(s) == 立春)
`;

describe('ラベル付きテーブルと束縛名射影（ADR-30・F33 解決）', () => {
  it('立春をラベルで選び snapTo(day) で日に落とす → 2/4', () => {
    const dates = evalDates(PRELUDE + SEKKI_TABLE + `
risshun |> snapTo(day)
`, Y2026);
    expect(dates).toEqual(['2026-02-04']);
  });

  it('八十八夜＝立春 +87 日 → 5/2（暦要項の雑節と一致）', () => {
    const dates = evalDates(PRELUDE + SEKKI_TABLE + `
risshun |> shift(+87, unit: day) |> snapTo(day)
`, Y2026);
    expect(dates).toEqual(['2026-05-02']);
  });

  it('二百十日＝立春 +209 日 → 9/1', () => {
    const dates = evalDates(PRELUDE + SEKKI_TABLE + `
risshun |> shift(+209, unit: day) |> snapTo(day)
`, Y2026);
    expect(dates).toEqual(['2026-09-01']);
  });

  it('shift(unit: day) は窓内オフセット（時刻）を保存し、snapTo が日へ丸める', () => {
    const r = run(PRELUDE + SEKKI_TABLE + `
risshun |> shift(+87, unit: day)
`, Y2026);
    expect(r.results[0].dates).toEqual(['2026-05-02T05:02']);   // 立春 2/4 05:02 の 87 日後
  });
});

describe('segmentBy と旧暦（朔で切る太陰太陽暦・ADR-26）', () => {
  it('朔日（新月の日）が各旧暦月の第 1 日になる（旧正月 2/17 を含む）', () => {
    const dates = evalDates(PRELUDE + `
newMoons = [2026-01-19T04:52, 2026-02-17T21:01, 2026-03-19T10:23, 2026-04-17T20:52,
            2026-05-17T05:01, 2026-06-15T11:54, 2026-07-14T18:44, 2026-08-13T02:37,
            2026-09-11T12:27, 2026-10-11T00:50, 2026-11-09T16:02, 2026-12-09T09:52]
lunarStart = newMoons |> snapTo(day)
everyDay |> segmentBy(lunarStart, edges: drop, empties: drop) |> first
`, Y2026);
    expect(dates).toEqual([
      '2026-01-19', '2026-02-17', '2026-03-19', '2026-04-17', '2026-05-17', '2026-06-15',
      '2026-07-14', '2026-08-13', '2026-09-11', '2026-10-11', '2026-11-09',
    ]);   // 最後の朔 12/9 以降は edges: drop で窓にならない
  });
});

describe('射影 ordinalIn / epochOrdinal（§4.9・ADR-30）', () => {
  it('固定日: ordinalIn(day, month, d) == 11 → 毎月 11 日', () => {
    const dates = evalDates(PRELUDE + `
everyDay |> filter(d => ordinalIn(day, month, d) == 11)
`, { from: '2026-01-01', to: '2026-04-01' });
    expect(dates).toEqual(['2026-01-11', '2026-02-11', '2026-03-11']);
  });

  it('epochOrdinal(month, d) mod 12 == 0 → 1 月（紀元 1970-01 起点）', () => {
    const dates = evalDates(PRELUDE + `
everyDay |> filter(d => epochOrdinal(month, d) mod 12 == 0) |> within(month) |> first
`, Y2026);
    expect(dates).toEqual(['2026-01-01']);
  });

  it('ストライドの窓ごとリセット版は ordinalIn に還元（ADR-27）: 月内 1,4,7,… 日', () => {
    const dates = evalDates(PRELUDE + `
everyDay |> filter(d => (ordinalIn(day, month, d) - 1) mod 7 == 0)
`, { from: '2026-01-01', to: '2026-02-01' });
    expect(dates).toEqual(['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22', '2026-01-29']);
  });
});

describe('ストライド（§4.7）', () => {
  it('stride(3, from:) は境界を無視して 3 点ごと', () => {
    const r = run(PRELUDE + `
bizDay
bizDay |> stride(3, from: 2026-01-05)
`, { from: '2026-01-01', to: '2026-03-01' });
    const biz = r.results[0].dates;
    const expected = biz.filter(d => d >= '2026-01-05').filter((_, i) => i % 3 === 0);
    expect(r.results[1].dates).toEqual(expected);
  });

  it('strideBy(w, from:) は幅の等差列（1 sol ごと）', () => {
    const r = run(`
premise JP2 { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@JP2
everyInstant |> strideBy(24h39m35.244s, from: 2026-01-01)
`, { from: '2026-01-01', to: '2026-01-03' });
    expect(r.results[0].dates[0]).toBe('2026-01-01');
    expect(r.results[0].dates[1]).toBe('2026-01-02T00:39:35');   // +24h39m35.244s
  });
});

describe('grid の位相（ADR-31）', () => {
  it('anchor: で一般幅（10d）の位相を張れる', () => {
    const dates = evalDates(`
premise Dekad = Gregorian with { decade = chronos grid 10d anchor: 2026-01-01 }
premise JPD { calendar-system: Dekad; tz: "Asia/Tokyo"; wkst: Mon }
@JPD
everyDay |> within(decade) |> first
`, { from: '2026-01-01', to: '2026-02-05' });
    expect(dates).toEqual(['2026-01-01', '2026-01-11', '2026-01-21', '2026-01-31']);
  });
});

describe('値式・リスト（§3.5・ADR-25/28）', () => {
  it('閏年判定が month の日数に効く（2028-02-29 が存在する）', () => {
    const dates = evalDates(PRELUDE + `
monthEnd
`, { from: '2028-02-01', to: '2028-03-01' });
    expect(dates).toEqual(['2028-02-29']);
  });

  it('平年の 2 月は 28 日まで', () => {
    const dates = evalDates(PRELUDE + `
monthEnd
`, { from: '2026-02-01', to: '2026-03-01' });
    expect(dates).toEqual(['2026-02-28']);
  });

  it('日付範囲 a..b は連続日に展開される（§3.8 糖衣）', () => {
    const dates = evalDates(PRELUDE + `
[2026-02-10..2026-02-13, 2026-03-01]
`, Y2026);
    expect(dates).toEqual(['2026-02-10', '2026-02-11', '2026-02-12', '2026-02-13', '2026-03-01']);
  });
});
