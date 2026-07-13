// 空テーブルリテラルの合法化（ADR-45・F98）と roll 空軸の依存像修正（F99）
// - `[] covering: …` に限り時間ストリーム定数へ昇格（「点ゼロだが覆域は主張したい」の一次形）
// - 各静的検査（包含・昇順・labels: 同長）は空虚に成立・整列は空虚適合（第三状態＝検査に通る）
// - 覆域の観測面（範囲外註釈・被覆サマリ・残走路）は非空テーブルと同じ器
// - F99: 空軸への roll で「有限 covering＝空＋註釈」vs「開端 covering＝註釈なしの空」の観測差
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';

const JP = `
premise JPX { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@JPX
`;

// ---- 昇格（ADR-45 判断 1）----

describe('空テーブルの昇格（covering: 後置に限る）', () => {
  it('[] covering: 閉区間 → 点ゼロの時間ストリーム定数', () => {
    const r = run(JP + `[] covering: 2026-07-13..2026-07-13`,
      { from: '2026-07-13', to: '2026-07-14' });
    expect(r.results[0].dates).toEqual([]);
    expect(r.results[0].annotations).toEqual([]);   // 評価は覆域内＝註釈ゼロ（正当な空）
  });

  it('[] covering: ..（開端＝完結主張）→ 恒空・concluded・残走路 null', () => {
    const r = run(JP + `[] covering: ..`, { from: '2026-01-01', to: '2027-01-01' });
    expect(r.results[0].dates).toEqual([]);
    expect(r.results[0].annotations).toEqual([]);
    expect(r.coverage[0].concluded).toBe(true);
    expect(r.coverage[0].runwayDays).toBeNull();
  });

  it('labels: [] は同長 0=0 で合法', () => {
    expect(evalDates(JP + `
sekki = [] covering: 2026..2026 labels: []
sekki
`, { from: '2026-01-01', to: '2026-02-01' })).toEqual([]);
  });

  it('空でない labels: は同長違反の静的エラー', () => {
    expect(() => run(JP + `[] covering: 2026..2026 labels: [小寒]`,
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/同長/);
  });

  it('covering: なし（labels: のみ）は誘導つき静的エラー', () => {
    expect(() => run(JP + `[] labels: []`,
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/空テーブルは covering: を明示/);
  });

  it('裸の [] はストリーム位置で誘導つき静的エラー（値リストの空は従来どおり）', () => {
    expect(() => run(JP + `[] |> snapTo(day)`,
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/covering: を付ければ空テーブル/);
  });

  it('premise 内の [] covering: にも tz: 宣言必須が掛かる（ADR-37 判断 1）', () => {
    expect(() => run(`
premise NoTz { calendar-system: Gregorian
  sekki = [] covering: 2026..2026
}
@NoTz
sekki
`, { from: '2026-01-01', to: '2026-02-01' })).toThrow(/tz/);
  });
});

// ---- 覆域の観測面（ADR-37 の器がそのまま働く）----

describe('空テーブルの覆域観測（範囲外註釈・被覆サマリ・残走路）', () => {
  it('覆域を越える評価は範囲外註釈——「まだ無い」が観測可能', () => {
    const r = run(JP + `
sekki = [] covering: 2026-07-13..2026-07-13
sekki
`, { from: '2026-07-01', to: '2026-08-01' });
    expect(r.results[0].dates).toEqual([]);
    expect(r.results[0].annotations.length).toBeGreaterThan(0);   // 覆域外の前後帯
  });

  it('被覆サマリに源・covering・残走路（即負）が立つ——F98 の運用信号', () => {
    const r = run(JP + `
sekki = [] covering: 2026-07-13..2026-07-13
sekki
`, { from: '2026-07-01', to: '2026-11-01' });
    const c = r.coverage.find(c => c.source.includes('sekki'))!;
    expect(c).toBeDefined();
    expect(c.concluded).toBe(false);
    expect(c.runwayDays!).toBeLessThan(0);   // 残走路が即負＝「データを入れよ」
  });

  it('asof は空テーブルにも随伴する（premise の @ 前文）', () => {
    const r = run(`
premise Obs { calendar-system: Gregorian; tz: "Asia/Tokyo"; asof: 2026-07-13; source: "naoj"
  sekki = [] covering: 2026..2026
}
@Obs
sekki
`, { from: '2026-01-01', to: '2026-02-01' });
    const c = r.coverage.find(c => c.source.includes('sekki'))!;
    expect(c.asof).toBe('2026-07-13');
  });
});

// ---- 整列の空虚適合（第三状態・ADR-36 改訂）----

describe('空虚適合（全整列に適合・結合は相手を継承）', () => {
  it('day グリッド相手の & / \\ が通る（検査は空虚に成立）', () => {
    const r = run(JP + `
h = [] covering: 2026..2026
everyDay \\ h
`, { from: '2026-01-05', to: '2026-01-08' });
    expect(r.results[0].dates).toEqual(['2026-01-05', '2026-01-06', '2026-01-07']);
  });

  it('継承した整列で下流の整列検査も通る（everyDay \\ 空 を roll の軸に）', () => {
    expect(evalDates(JP + `
h = [] covering: 2026..2026
[2026-01-07] |> roll(Following, on: everyDay \\ h)
`, { from: '2026-01-01', to: '2026-02-01' })).toEqual(['2026-01-07']);
  });

  it('経過グリッド相手でも通る（回避形〈day 整列〉では静的エラーだった合成）', () => {
    const r = run(JP + `
h = [] covering: 2026..2026
(everyInstant |> strideBy(1d, from: 2026-01-05T09:00)) \\ h
`, { from: '2026-01-05', to: '2026-01-07' });
    expect(r.results[0].dates.length).toBe(2);   // 1/5 09:00・1/6 09:00
  });

  it('空 nonWorking のカレンダー実体が boot する——bizDay = everyDay（F98 の本丸）', () => {
    const r = run(`
premise Cal { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "db"
  nonWorking = [] covering: 2026-01-01..2026-01-31
}
premise Use { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; calendar: Cal }
@Use
bizDay
`, { from: '2026-01-05', to: '2026-01-08' });
    expect(r.results[0].dates).toEqual(['2026-01-05', '2026-01-06', '2026-01-07']);
    expect(r.results[0].annotations).toEqual([]);   // 覆域内＝退化なし
  });

  it('空 nonWorking の覆域を越えると bizDay に範囲外註釈（退化するが観測可能）', () => {
    const r = run(`
premise Cal { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "db"
  nonWorking = [] covering: 2026-01-01..2026-01-31
}
premise Use { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; calendar: Cal }
@Use
bizDay
`, { from: '2026-01-25', to: '2026-02-10' });
    expect(r.results[0].annotations.length).toBeGreaterThan(0);
  });

  it('shift(unit: day) は空虚適合を保存して空のまま', () => {
    expect(evalDates(JP + `
h = [] covering: 2026..2026
h |> shift(+1, unit: day)
`, { from: '2026-01-01', to: '2026-02-01' })).toEqual([]);
  });

  it('rebase は点ゼロの恒等（day グリッド要求を空虚に通す）', () => {
    expect(evalDates(JP + `
h = [] covering: 2026..2026
h |> rebase(to: "America/New_York")
`, { from: '2026-01-01', to: '2026-02-01' })).toEqual([]);
  });
});

// ---- 消費位置の観測（回避形と等価・判断 6 の分類は軟化しない）----

describe('空テーブルの消費（ADR-37 判断 6 は不変）', () => {
  it('束縛名射影の覆域内失敗は従来どおり硬エラー（完全主張は分類を軟化しない）', () => {
    expect(() => run(JP + `
sekki = [] covering: 2026..2026 labels: []
everyDay |> filter(d => sekki(d) == 立春)
`, { from: '2026-02-01', to: '2026-02-10' })).toThrow(/列にない|範囲外/);
  });

  it('coincides(空 S, day, t) は覆域内で偽が確定（「無いことは知識」）', () => {
    const r = run(JP + `
sekki = [] covering: 2026..2026
everyDay |> filter(t => coincides(sekki, day, t))
`, { from: '2026-02-01', to: '2026-02-05' });
    expect(r.results[0].dates).toEqual([]);
    expect(r.results[0].annotations).toEqual([]);   // 覆域内＝正当な空
  });

  it('shift(unit: 空の点列軸) は覆域内で硬エラー（点が軸上にない）', () => {
    expect(() => run(JP + `
h = [] covering: 2026..2026
[2026-01-07] |> shift(+1, unit: h)
`, { from: '2026-01-01', to: '2026-02-01' })).toThrow(/軸上にない/);
  });

  it('segmentBy の空マーカーは従来どおり硬エラー（F98 の射程はテーブル直書きまで）', () => {
    expect(() => run(JP + `
m = [] covering: 2026..2026
day |> segmentBy(m, edges: clip, empties: error)
`, { from: '2026-01-01', to: '2026-02-01' })).toThrow(/マーカーが空/);
  });
});

// ---- F99: roll 空軸の依存像（有限 covering と開端の観測差）----

describe('roll 空軸の依存像（F99 修正の回帰）', () => {
  it('有限 covering の空軸へ roll → 空＋範囲外註釈（未知の軸点に着地し得た）', () => {
    const r = run(JP + `
sekki = [] covering: 2026-01-01..2026-12-31
[2026-03-10] covering: 2026-03-10..2026-03-10 |> roll(Following, on: sekki)
`, { from: '2026-03-01', to: '2026-04-01' });
    expect(r.results[0].dates).toEqual([]);
    // 修正前は当日が点も註釈も無かった（黙って違う結果）——依存像が評価域を覆う
    const covers = r.results[0].annotations.some(a => a.source.includes('sekki'));
    expect(covers).toBe(true);
  });

  it('開端 covering（完結主張）の空軸へ roll → 註釈なしの空（正当な該当なし）', () => {
    const r = run(JP + `
sekki = [] covering: ..
[2026-03-10] covering: 2026-03-10..2026-03-10 |> roll(Following, on: sekki)
`, { from: '2026-03-10', to: '2026-03-11' });
    expect(r.results[0].dates).toEqual([]);
    expect(r.results[0].annotations).toEqual([]);
  });
});
