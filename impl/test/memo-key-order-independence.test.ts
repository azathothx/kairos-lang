// メモ化の文脈キーと評価順の独立（F114＝還流 2026-09-28 定期便 #3）——witness:
// 前文メンバー granularity: を読む右辺（within(granularity)）の値は、同じ文脈なら「先に何を評価したか」に
// 依らない。修正前は defCache／fineCache の鍵が手書き 8 語で granularity:（と epoch:）を欠き、
// @Base（month）を先に評価すると @Mine（week）が基底の値（27 点）を返した。bizDay 標準導出の鍵には
// 在圏 premise も無く、day を上書きした派生の整列エラーが基底を先に評価すると消えて基底の値が返った。
// 便の最小例（bizDay×granularity・在圏 premise）に加え、同族を公開語（evalDef）とトップ束縛（#top#）の
// 経路でも固定する（当方の実測で同じ構造を確認）。
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';

const W = { from: '2026-02-01', to: '2026-03-01' };
const dates = (src: string, i: number) => run(src, W).results[i].dates;

// 便 #3 の最小例（逐語）: Cal.nonWorking が利用側の granularity: を読む（Cal は宣言しない＝遅延解決）
const PRE = `premise Cal { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  nonWorking = everyDay |> within(granularity) |> nth(1)
}
premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon; granularity: month }
premise Mine = Base with { granularity: week }
`;
const WEEK_FIRSTS = ['2026-02-02', '2026-02-09', '2026-02-16', '2026-02-23'];   // 2 月の各週初（Mon）

describe('F114: メモ化鍵は前文メンバー全語と在圏 premise を含む（評価順で値が変わらない）', () => {
  it('① bizDay×granularity: @Base（month）を先に評価しても @Mine（week）の bizDay は週初を除く 24 点', () => {
    const alone = evalDates(PRE + '@Mine\nbizDay\n', W);
    expect(alone.length).toBe(24);
    for (const d of WEEK_FIRSTS) expect(alone).not.toContain(d);
    const src = PRE + '@Base\nbizDay\n@Mine\nbizDay\n';
    expect(dates(src, 0).length).toBe(27);          // 基底＝月初 2/1 だけ抜ける
    expect(dates(src, 1)).toEqual(alone);           // 修正前＝27 点（基底の値がヒット）
  });

  it('② 同じ premise 名でも軽量形の後置 granularity: week は別の文脈（@Base → @Base granularity: week）', () => {
    const src = PRE + '@Base\nbizDay\n@Base granularity: week\nbizDay\n';
    expect(dates(src, 0).length).toBe(27);
    expect(dates(src, 1)).toEqual(evalDates(PRE + '@Base granularity: week\nbizDay\n', W));
    expect(dates(src, 1).length).toBe(24);
  });

  it('③ bizDay×在圏 premise: day を上書きした派生は、基底の bizDay を先に評価しても整列エラーで止まる', () => {
    const P = `premise Cal { calendar-system: Gregorian; tz: "Asia/Tokyo"
  nonWorking = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
}
premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo" }
premise Mine = Base with { day = chronos grid 12h; bdd = bizDay }
`;
    const W7 = { from: '2026-02-01', to: '2026-02-08' };
    const ALIGN = /bizDay 標準導出（everyDay \\ Cal\.nonWorking）: 両辺の整列が同一でない/;
    expect(() => run(P + '@Mine\nbizDay\n', W7)).toThrow(ALIGN);
    expect(() => run(P + '@Base\nbizDay\n@Mine\nbizDay\n', W7)).toThrow(ALIGN);      // 修正前＝5 点・5 点
    expect(() => run(P + '@Base\nbizDay\n@Mine\nbdd\n', W7)).toThrow(ALIGN);         // 公開語経由も同じ
    // 対照: 在圏が同じで tz: だけ違う後置は従来どおり別の鍵（両方 5 点）
    const ctl = run(P + '@Base\nbizDay\n@Base tz: "UTC"\nbizDay\n', W7);
    expect(ctl.results.map(r => r.dates.length)).toEqual([5, 5]);
  });

  it('④ 公開語（evalDef の鍵）×granularity: Cal.firstOf は @Base を先に評価しても @Mine で週初 4 点', () => {
    const P = `premise Cal { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  firstOf = everyDay |> within(granularity) |> nth(1)
}
premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon; granularity: month }
premise Mine = Base with { granularity: week }
`;
    expect(evalDates(P + '@Mine\nCal.firstOf\n', W)).toEqual(WEEK_FIRSTS);
    const src = P + '@Base\nCal.firstOf\n@Mine\nCal.firstOf\n';
    expect(dates(src, 0)).toEqual(['2026-02-01']);
    expect(dates(src, 1)).toEqual(WEEK_FIRSTS);     // 修正前＝['2026-02-01']
  });

  it('⑤ トップ束縛（#top# の鍵）×granularity: 同じ premise 名で後置 granularity: week を変えても独立', () => {
    const P = `premise Base { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; granularity: month }
firstOf = everyDay |> within(granularity) |> nth(1)
`;
    const src = P + '@Base\nfirstOf\n@Base granularity: week\nfirstOf\n';
    expect(dates(src, 0)).toEqual(['2026-02-01']);
    expect(dates(src, 1)).toEqual(WEEK_FIRSTS);     // 修正前＝['2026-02-01']
  });
});
