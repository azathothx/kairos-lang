// 外部供給宣言 external（ADR-46・socket）——実行時に解決されるテーブルリテラル
// - 宣言（kind=整列の主張・labels=値域・source）が字面の代役・解決値にリテラルと同一の統治検査
// - 解決は評価文脈の随伴（要求駆動・一評価一解決・定義側 premise 単位のスナップショット）
// - 観測等価: 同じデータをリテラルで直書きした場合と観測面（点・註釈・被覆サマリ）が一致する
import { describe, it, expect } from 'vitest';
import { run, SupplyError } from '../src/index.ts';
import type { ExternalResolver, ExternalData } from '../src/index.ts';

/** external 束縛を premise ブロックに置く定型（external は premise 束縛の rhs 限定＝ADR-46） */
const src = (bindings: string, body: string) => `
premise Eph { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "test-db"
${bindings}
}
@Eph
${body}
`;

const resolver = (table: Record<string, ExternalData>): ExternalResolver =>
  (premise, binding) => {
    const d = table[`${premise}.${binding}`];
    if (!d) throw new Error(`no fixture: ${premise}.${binding}`);
    return d;
  };

describe('external の基本解決と観測面', () => {
  it('kind: dates——点・範囲外註釈・被覆サマリ（源・asof・残走路）', () => {
    const r = run(src('h = external(kind: dates)', 'h'),
      { from: '2026-01-01', to: '2026-03-01', resolve: resolver({
        'Eph.h': { dates: ['2026-01-01', '2026-01-12'], covering: '2026-01-01..2026-01-31', asof: '2026-01-15' } }) });
    expect(r.results[0].dates).toEqual(['2026-01-01', '2026-01-12']);
    expect(r.results[0].annotations.length).toBeGreaterThan(0);   // 2 月は覆域外
    const c = r.coverage.find(c => c.source === 'Eph.h')!;
    expect(c.asof).toBe('2026-01-15');
    expect(c.runwayDays!).toBeLessThan(0);
  });

  it('kind: instants + labels 値域——裸名のラベル比較が書ける（宣言＝静的知識）', () => {
    const r = run(src('sekki = external(kind: instants, labels: [小寒, 大寒, 立春])',
      'sekki |> filter(s => sekki(s) == 立春) |> snapTo(day)'),
      { from: '2026-01-01', to: '2026-03-01', resolve: resolver({
        'Eph.sekki': { instants: [Date.UTC(2026, 0, 5, 8), Date.UTC(2026, 0, 20, 1), Date.UTC(2026, 1, 4, 20)],
                       covering: '2026..2026', asof: '2026-01-01', labels: ['小寒', '大寒', '立春'] } }) });
    expect(r.results[0].dates).toEqual(['2026-02-05']);   // UTC 2/4 20時 = JST 2/5
  });

  it('開端 covering（完結主張）も字面どおり通る——concluded・残走路 null', () => {
    const r = run(src('h = external(kind: dates)', 'h'),
      { from: '2026-01-01', to: '2026-02-01', resolve: resolver({
        'Eph.h': { dates: ['2026-01-05'], covering: '..', asof: 'x' } }) });
    const c = r.coverage.find(c => c.source === 'Eph.h')!;
    expect(c.concluded).toBe(true);
    expect(c.runwayDays).toBeNull();
  });
});

describe('観測等価（リテラル直書きと external の一致）', () => {
  const opts = { from: '2026-01-01', to: '2026-06-01' };
  it('dates: points・annotations・coverage が一致する', () => {
    const lit = run(src('h = [2026-02-10, 2026-03-01] covering: 2026-02-01..2026-03-31', 'h'), opts);
    const ext = run(src('h = external(kind: dates)', 'h'),
      { ...opts, resolve: resolver({
        'Eph.h': { dates: ['2026-02-10', '2026-03-01'], covering: '2026-02-01..2026-03-31', asof: 'x' } }) });
    expect(ext.results[0].dates).toEqual(lit.results[0].dates);
    expect(ext.results[0].annotations.map(a => [a.fromMs, a.toMs]))
      .toEqual(lit.results[0].annotations.map(a => [a.fromMs, a.toMs]));
    const cl = lit.coverage.find(c => c.source === 'Eph.h')!;
    const ce = ext.coverage.find(c => c.source === 'Eph.h')!;
    expect(ce.runwayDays).toEqual(cl.runwayDays);
    expect(ce.concluded).toEqual(cl.concluded);
  });

  it('day 整列も一致——roll の軸に渡せる', () => {
    const r = run(src('h = external(kind: dates)', '[2026-01-07] |> roll(Following, on: everyDay \\ h)'),
      { from: '2026-01-01', to: '2026-02-01', resolve: resolver({
        'Eph.h': { dates: ['2026-01-07'], covering: '2026..2026', asof: 'x' } }) });
    expect(r.results[0].dates).toEqual(['2026-01-08']);
  });

  it('パイプ合成でも出自の焼印（束縛名）が保たれる', () => {
    const r = run(src('sekki = external(kind: instants) |> snapTo(day)', 'sekki'),
      { from: '2026-01-01', to: '2027-06-01', resolve: resolver({
        'Eph.sekki': { instants: [Date.UTC(2026, 1, 4, 20)], covering: '2026..2026', asof: 'x' } }) });
    expect(r.results[0].annotations.some(a => a.source === 'Eph.sekki')).toBe(true);
  });
});

describe('空データと整列（宣言どおり——ADR-45 の空虚適合はリテラルの字面規則）', () => {
  it('空 dates の nonWorking で実体が boot——bizDay = everyDay（F98 と同じ帰結が宣言経由で立つ）', () => {
    const r = run(`
premise Cal { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "db"
  nonWorking = external(kind: dates)
}
premise Use { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; calendar: Cal }
@Use
bizDay
`, { from: '2026-01-05', to: '2026-01-08', resolve: resolver({
      'Cal.nonWorking': { dates: [], covering: '2026-01-01..2026-12-31', asof: '2026-01-01' } }) });
    expect(r.results[0].dates).toEqual(['2026-01-05', '2026-01-06', '2026-01-07']);
    expect(r.results[0].annotations).toEqual([]);
  });

  it('空でも整列は宣言どおり（dates＝day グリッド）——経過グリッド相手は空でも静的エラー（0→1 行の非連続なし）', () => {
    const go = (dates: string[]) => () =>
      run(src('h = external(kind: dates)',
        '(everyInstant |> strideBy(1d, from: 2026-01-05T09:00)) \\ h'),
        { from: '2026-01-05', to: '2026-01-07',
          resolve: resolver({ 'Eph.h': { dates, covering: '2026..2026', asof: 'x' } }) });
    expect(go([])).toThrow(/整列/);                    // 空でも宣言 day グリッドを主張——落ちる
    expect(go(['2026-01-06'])).toThrow(/整列/);        // 1 行でも同じ——判定がデータで変わらない
  });
});

describe('契約検査（解決時・リテラルと同一の統治）', () => {
  const go = (data: Partial<ExternalData>, decl = 'kind: dates') => () =>
    run(src(`h = external(${decl})`, 'h'),
      { from: '2026-01-01', to: '2026-02-01',
        resolve: resolver({ 'Eph.h': data as ExternalData }) });

  it('covering 欠落は契約違反', () => {
    expect(go({ dates: ['2026-01-05'], asof: 'x' } as any)).toThrow(/covering がない/);
  });
  it('asof 欠落は契約違反', () => {
    expect(go({ dates: ['2026-01-05'], covering: '2026..2026' } as any)).toThrow(/asof がない/);
  });
  it('kind 不一致（dates 宣言に instants）は契約違反', () => {
    expect(go({ instants: [0], covering: '2026..2026', asof: 'x' })).toThrow(/dates（"YYYY-MM-DD" の列）を運ぶ/);
  });
  it('乱順・重複は契約違反', () => {
    expect(go({ dates: ['2026-01-05', '2026-01-05'], covering: '2026..2026', asof: 'x' })).toThrow(/昇順・重複なし/);
  });
  it('covering 外の点は契約違反（包含＝ADR-37 判断 1）', () => {
    expect(go({ dates: ['2027-01-05'], covering: '2026..2026', asof: 'x' })).toThrow(/covering の外/);
  });
  it('実在しない日付は契約違反（ADR-43 の再執行——黙ったロールオーバーの封止）', () => {
    expect(go({ dates: ['2026-02-30'], covering: '2026..2026', asof: 'x' })).toThrow(/実在しない日付/);
  });
  it('instants の非整数は契約違反', () => {
    expect(go({ instants: [1.5], covering: '2026..2026', asof: 'x' }, 'kind: instants')).toThrow(/有限整数/);
  });
  it('labels 宣言つきに同長違反は契約違反', () => {
    expect(go({ dates: ['2026-01-05'], covering: '2026..2026', asof: 'x', labels: ['a', 'b'] },
      'kind: dates, labels: [a, b]')).toThrow(/同長/);
  });
  it('宣言値域の外のラベルは契約違反', () => {
    expect(go({ dates: ['2026-01-05'], covering: '2026..2026', asof: 'x', labels: ['c'] },
      'kind: dates, labels: [a, b]')).toThrow(/値域の外/);
  });
  it('labels 無宣言にラベル到着は契約違反（黙って捨てない）', () => {
    expect(go({ dates: ['2026-01-05'], covering: '2026..2026', asof: 'x', labels: ['a'] })).toThrow(/無宣言/);
  });
  it('covering 字面が読めないのは契約違反', () => {
    expect(go({ dates: ['2026-01-05'], covering: 'garbage', asof: 'x' })).toThrow(/covering が読めない/);
  });
  it('静的 asof:（版ピン）と解決値 asof の不一致は被覆サマリに常時表示', () => {
    const r = run(`
premise Pin { calendar-system: Gregorian; tz: "Asia/Tokyo"; source: "db"; asof: 2026-07-01
  h = external(kind: dates)
}
@Pin
h
`, { from: '2026-01-01', to: '2026-02-01', resolve: resolver({
      'Pin.h': { dates: ['2026-01-05'], covering: '2026..2026', asof: '2026-07-13' } }) });
    expect(r.coverage.find(c => c.source === 'Pin.h')!.asof).toContain('不一致');
  });
});

describe('供給エラー（解決失敗の機械可読な部分類——契約違反と区別）', () => {
  it('解決子が無ければ SupplyError', () => {
    try {
      run(src('h = external(kind: dates)', 'h'), { from: '2026-01-01', to: '2026-02-01' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SupplyError);
      expect((e as Error).message).toContain('供給エラー');
    }
  });
  it('解決子の失敗は SupplyError に包む（インフラ失敗の識別＝boot throw から除外できる）', () => {
    try {
      run(src('h = external(kind: dates)', 'h'),
        { from: '2026-01-01', to: '2026-02-01', resolve: () => { throw new Error('DB down'); } });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SupplyError);
      expect((e as Error).message).toContain('DB down');
    }
  });
  it('未参照の external は解決されない（要求駆動——解決子が無くてもエラーにならない）', () => {
    const r = run(src('h = external(kind: dates)', 'everyDay'),
      { from: '2026-01-05', to: '2026-01-07' });
    expect(r.results[0].dates.length).toBe(2);
  });
});

describe('スナップショット（一評価一解決・定義側 premise 単位）', () => {
  it('with 派生・複数本体式から参照しても解決は一回', () => {
    let calls = 0;
    const r = run(`
premise Base { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "db"
  h = external(kind: dates)
}
premise D = Base with { wkst: Sun }
@Base
h
@D
h
`, { from: '2026-01-01', to: '2026-02-01', resolve: () => {
      calls++;
      return { dates: ['2026-01-05'], covering: '2026..2026', asof: 'x' };
    } });
    expect(r.results.length).toBe(2);
    expect(r.results[0].dates).toEqual(r.results[1].dates);
    expect(calls).toBe(1);   // 定義側（Base.h）単位のスナップショット
  });
  it('解決子には定義側 premise 名が渡る（派生名ではない）', () => {
    const seen: string[] = [];
    run(`
premise Base { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "db"
  h = external(kind: dates)
}
premise D = Base with { wkst: Sun }
@D
h
`, { from: '2026-01-01', to: '2026-02-01', resolve: (p) => {
      seen.push(p);
      return { dates: [], covering: '2026..2026', asof: 'x' };
    } });
    expect(seen).toEqual(['Base']);
  });
  it('source: の named-arg 上書きは解決子に渡り、別スナップショットになる', () => {
    const seen: string[] = [];
    run(src(`a = external(kind: dates, source: "db-a")
  b = external(kind: dates, source: "db-b")`, 'a | b'),
      { from: '2026-01-01', to: '2026-02-01', resolve: (p, b, decl) => {
        seen.push(decl.source);
        return { dates: [], covering: '2026..2026', asof: 'x' };
      } });
    expect(seen.sort()).toEqual(['db-a', 'db-b']);
  });
});

describe('位置と統治の静的検査', () => {
  it('本体層直書きは静的エラー（誘導つき）', () => {
    expect(() => run(src('', 'external(kind: dates)'),
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/premise 束縛の右辺/);
  });
  it('top-level 束縛（前文の下）は静的エラー——external は premise ブロックの中に置く', () => {
    expect(() => run(src('', `h = external(kind: dates)
h`), { from: '2026-01-01', to: '2026-02-01' })).toThrow(/premise 束縛の右辺/);
  });
  it('深い位置（結合子の枝）は静的エラー', () => {
    expect(() => run(src('h = everyDay \\ external(kind: dates)', 'h'),
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/先頭でのみ/);
  });
  it('ラムダ内（filter の述語）は静的エラー', () => {
    expect(() => run(src('h = everyDay |> filter(d => coincides(external(kind: dates), day, d))', 'h'),
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/先頭でのみ/);
  });
  it('引数つき束縛には書けない（適用時のラムダ本体評価でも文脈が立たず拒否される）', () => {
    expect(() => run(src('f(x) = external(kind: dates)', 'f(1)'),
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/引数なしの束縛|premise 束縛の右辺/);
  });
  it('external を持つ premise は tz: 宣言必須', () => {
    expect(() => run(`
premise NoTz { calendar-system: Gregorian; source: "db"
  h = external(kind: dates)
}
@NoTz
h
`, { from: '2026-01-01', to: '2026-02-01' })).toThrow(/tz/);
  });
  it('source: が無ければ静的エラー（premise メンバーにも named-arg にも無い）', () => {
    expect(() => run(`
premise NoSrc { calendar-system: Gregorian; tz: "Asia/Tokyo"
  h = external(kind: dates)
}
@NoSrc
h
`, { from: '2026-01-01', to: '2026-02-01', resolve: () => ({ dates: [], covering: '..', asof: 'x' }) }))
      .toThrow(/source: が必須/);
  });
  it('kind: 欠落・未知の値・未知の引数は静的エラー', () => {
    const go = (decl: string) => () => run(src(`h = external(${decl})`, 'h'),
      { from: '2026-01-01', to: '2026-02-01', resolve: () => ({ dates: [], covering: '..', asof: 'x' }) });
    expect(go('')).toThrow(/kind: が必須/);
    expect(go('kind: fancy')).toThrow(/dates \| instants/);
    expect(go('kind: dates, mode: fast')).toThrow(/未知の引数/);
  });
  it('external の再定義は core 語エラー', () => {
    expect(() => run(src('', `external = everyDay
external`), { from: '2026-01-01', to: '2026-02-01' })).toThrow(/core 語/);
  });
});
