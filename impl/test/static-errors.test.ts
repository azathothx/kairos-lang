// 統治（ADR-16/I3/I4/I5）が要求する静的エラーの検証
import { describe, it, expect } from 'vitest';
import { run, lex } from '../src/index.ts';
import { PRELUDE } from './helpers.ts';

const Y2026 = { from: '2026-01-01', to: '2027-01-01' };

describe('字句（§5.5・ADR-28）', () => {
  it('市民時と経過時間の幅の混合は静的エラー（1d12h）', () => {
    expect(() => lex('x = everyDay |> strideBy(1d12h)')).toThrow(/混合できない/);
  });

  it('日付・時刻・複合幅・漢字識別子・文字列が字句として通る', () => {
    expect(() => lex('甲子 = [2026-02-19T21:01] \n w = 24h39m35.244s \n tz: "Asia/Tokyo"')).not.toThrow();
  });

  it('閉じない文字列リテラルは静的エラー（ADR-32）', () => {
    expect(() => lex('tz: "Asia/Tokyo\n')).toThrow(/閉じていない/);
  });
});

describe('統治の静的エラー', () => {
  it('core 語の再定義は静的エラー（§4.8）', () => {
    expect(() => run(PRELUDE + `\nfilter = everyDay\n`, Y2026)).toThrow(/core 語/);
  });

  it('糖衣定義の自己再帰は静的エラー（§4.8 の依存解析＝F110。旧: JS の生 stack overflow）', () => {
    expect(() => run(PRELUDE + `\nf = s => f(s)\nf(everyDay)\n`, Y2026))
      .toThrow(/糖衣定義の循環参照は静的エラー: f → f/);
  });

  it('糖衣定義の相互再帰は経路つき静的エラー（F110）', () => {
    expect(() => run(PRELUDE + `\nf = s => g(s)\ng = s => f(s)\nf(everyDay)\n`, Y2026))
      .toThrow(/糖衣定義の循環参照は静的エラー: f → g → f/);
  });

  it('引数なし束縛の循環参照も経路つき静的エラー（F110）', () => {
    expect(() => run(PRELUDE + `\nx = y\ny = x\nx\n`, Y2026))
      .toThrow(/束縛の循環参照は静的エラー: x → y → x/);
  });

  it('糖衣定義の正当な形は無傷——多引数（ストリーム＋値）・再適用・ネスト適用（F110 回帰）', () => {
    const r = run(PRELUDE + `\nf = (s, n) => s |> within(month) |> nth(n)\nf(everyDay, 15)\n`, Y2026);
    expect(r.results[0].dates.slice(0, 2)).toEqual(['2026-01-15', '2026-02-15']);
    expect(() => run(PRELUDE
      + `\nf = s => s |> within(month) |> first\ng = s => s |> filter(d => weekday(d) == Sun)\nf(everyDay) | f(g(everyDay))\n`,
      Y2026)).not.toThrow();
  });

  it('窓なしの選択子は型エラー（I4）', () => {
    expect(() => run(PRELUDE + `\neveryDay |> first\n`, Y2026)).toThrow(/I4/);
  });

  it('segmentBy は edges:/empties: が必須（I5）', () => {
    expect(() => run(PRELUDE + `
everyDay |> segmentBy(bizDay, edges: clip) |> first
`, Y2026)).toThrow(/empties/);
  });

  it('テーブルリテラルの乱順は静的エラー（§3.8）', () => {
    expect(() => run(PRELUDE + `
t = [2026-03-01, 2026-02-01]
t
`, Y2026)).toThrow(/昇順/);
  });

  it('labels: の長さ不一致は静的エラー（ADR-30）', () => {
    expect(() => run(PRELUDE + `
t = [2026-01-01, 2026-02-01] labels: [甲]
t
`, Y2026)).toThrow(/同長/);
  });

  it('軸のない roll は前文 axis: 宣言を要求（§3.3 宣言必須）', () => {
    expect(() => run(PRELUDE + `\nmonthEnd |> roll(Preceding)\n`, Y2026)).toThrow(/axis/);
  });

  it('未解決の名前は premise 相対解決のエラー（§3.4）', () => {
    expect(() => run(PRELUDE + `\neveryDay |> filter(on: nichigin)\n`, Y2026)).toThrow(/未解決/);
  });

  it('stride は from: 必須（ADR-31——窓からの起点供給は廃止）', () => {
    expect(() => run(PRELUDE + `
everyDay |> filter(on: bizDay) |> within(month) |> stride(3)
`, Y2026)).toThrow(/from/);
  });

  it('epoch: は利用側の前文には置けない（ADR-31）', () => {
    expect(() => run(PRELUDE + `
@JP epoch: 1970-01-01
everyDay |> within(month) |> first
`, Y2026)).toThrow(/前文には置けない/);
  });
});

describe('strideBy の幅（F112・2026-09-29 レッドチーム監査で実測: 0 幅は前進せず無限ループ）', () => {
  it('経過時間 0s は静的エラー（ADR-38 判断 12 の strideBy 版）', () => {
    expect(() => run(PRELUDE + `\neveryInstant |> strideBy(0s, from: 2026-01-01)\n`, Y2026))
      .toThrow(/strideBy: 幅は正の量/);
  });
  it('市民日 0d も同じ', () => {
    expect(() => run(PRELUDE + `\neveryInstant |> strideBy(0d, from: 2026-01-01)\n`, Y2026))
      .toThrow(/strideBy: 幅は正の量/);
  });
});

describe('shift の n は整数（F116・2026-09-29 境界チェックリスト: 非整数は統治外エラーだった）', () => {
  const CAL = `
premise Cal { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  nonWorking = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
}
premise JP = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon }
@JP
`;
  it('窓単位 shift(1.5, unit: month)（旧: TypeError Cannot read properties of undefined）', () => {
    expect(() => run(CAL + 'everyDay |> within(month) |> nth(1) |> shift(1.5, unit: month)\n', Y2026))
      .toThrow(/^shift: n は整数（1\.5 は不可。方向は符号で表す。§5\.2）$/);
  });
  it('点列軸 shift(1.5, unit: bizDay)（旧: NaN の日付が window-clip 警告に漏れて 0 点）', () => {
    expect(() => run(CAL + 'everyDay |> within(month) |> nth(1) |> roll(Following, on: bizDay) |> shift(1.5, unit: bizDay)\n', Y2026))
      .toThrow(/shift: n は整数/);
  });
  it('対照: shift(-1, unit: bizDay) は通る・shift(0) も通る（恒等）', () => {
    expect(() => run(CAL + 'everyDay |> within(month) |> nth(1) |> roll(Following, on: bizDay) |> shift(-1, unit: bizDay)\n', Y2026)).not.toThrow();
    expect(() => run(CAL + 'everyDay |> within(month) |> nth(1) |> roll(Following, on: bizDay) |> shift(0, unit: bizDay)\n', Y2026)).not.toThrow();
  });
});

describe('前文の公開語と同名の top-level 束縛（90-open 3-17・1.1.0 の診断の小物）', () => {
  it('day = day cycle […] の day(d) は公開語の側に解決され、誘導つきの「適用できない値」で止まる。別名（roster）なら通る', () => {
    expect(() => run(PRELUDE + 'day = day cycle [On, Off] anchor: 2026-01-05\neveryDay |> filter(d => day(d) == On)\n', Y2026))
      .toThrow(/^適用できない値: windows（day は在圏 premise の公開語で、同名の利用側 top-level 束縛は隠れる＝束縛を別の名に改名する/);
    expect(() => run(PRELUDE + 'roster = day cycle [On, Off] anchor: 2026-01-05\neveryDay |> filter(d => roster(d) == On)\n', Y2026)).not.toThrow();
  });
});

describe('序数射影の引数の数（2026-10-29・1.0 由来の宿題＝語名なしの「時点ではない: undefined」の修正）', () => {
  it('epochOrdinal(T09:00)・ordinalIn(T09:00) は語名と形つきの静的エラー（undefined は漏れない）。正しい形は通る', () => {
    expect(() => run(PRELUDE + 'everyDay |> filter(d => epochOrdinal(T09:00) > 3)\n', Y2026)).toThrow(/^epochOrdinal: 引数は 2 つ（単位, 点）——epochOrdinal\(month, d\)/);
    expect(() => run(PRELUDE + 'everyDay |> filter(d => ordinalIn(T09:00) > 3)\n', Y2026)).toThrow(/^ordinalIn: 引数は 3 つ（単位, 窓, 点）——ordinalIn\(day, month, d\)/);
    expect(() => run(PRELUDE + 'everyDay |> filter(d => epochOrdinal(month, d) > 3 and ordinalIn(day, month, d) > 1)\n', Y2026)).not.toThrow();
  });
});

describe('受理境界: covering の端は日付リテラルか 4 桁の年（§5.6 covering-edge・90-open 3-21 (1)）', () => {
  const JP = 'premise JP { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }\n@JP\n';
  const M = { from: '2026-01-01', to: '2026-02-01' };
  const tbl = (cov: string) => run(JP + `h = [2026-01-05] covering: ${cov}\nh\n`, M);
  const EDGE = /^構文エラー\(\d+:\d+\): covering の端は日付リテラルか 4 桁の年（値式は不可。§5\.6）/;
  const stop: [string, string][] = [
    ['2020+5..2025', '2020'],          // 旧: 値式として評価され「要素が covering の外」へ誤誘導
    ['y..2026', 'y'],                  // 旧: 束縛名を評価して受理
    ['2026..2026+1', '2026'],          // 後端の値式
    ['(2026)..2026', '('],
    ['_..2026', '_'],
    ['2026..y', 'y'],                  // 旧: 開端の後ろの y が別の誤誘導へ
  ];
  for (const [cov, at] of stop) {
    it(`covering: ${cov} は静的エラー（'${at}' の位置）`, () => {
      expect(() => tbl(cov)).toThrow(EDGE);
      expect(() => tbl(cov)).toThrow(`（'${at}' の位置）`);
    });
  }
  it('covering: 2026-01..2026 は静的エラー＋日付リテラルへの誘導（旧: 2026 − 1＝2025 と黙って読まれて受理）', () => {
    expect(() => tbl('2026-01..2026'))
      .toThrow(/covering の端は日付リテラルか 4 桁の年（値式は不可。§5\.6）——2026-01 は日付リテラルではない（YYYY-MM-DD か YYYY）（'2026' の位置）$/);
  });
  it('束縛後置の covering: も同じ規則', () => {
    expect(() => run(JP + 'h = everyDay |> filter(d => weekday(d) == Mon) covering: 2026-01..2026\nh\n', M)).toThrow(EDGE);
  });
  it('external の解決値 wire（parseCoveringText・ADR-46）も同じ規則——2026-01..2026 は契約違反', () => {
    const H = 'premise H { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "x"\n  h = external(kind: dates)\n}\n@H\nh\n';
    const sup = (covering: string) => ({ ...M, resolve: (() => ({ dates: ['2026-01-05'], covering, asof: '2026-01-01' })) as any });
    expect(() => run(H, sup('2026-01..2026'))).toThrow(/^契約違反: covering が読めない——external H\.h: 構文エラー\(1:1\): covering の端は日付リテラルか 4 桁の年/);
    expect(run(H, sup('2026..2026')).results[0].dates).toEqual(['2026-01-05']);
  });
  const keep: [string, string][] = [
    ['2026..2026', '2026-01-01..2026-12-31'],
    ['2026..2027', '2026-01-01..2027-12-31'],
    ['2026-01-01..2026-12-31', '2026-01-01..2026-12-31'],
    ['..2026', '..2026-12-31'],
    ['2026..', '2026-01-01..'],
    ['..', '..'],
    ['2025..2025, 2026..2026', '2025-01-01..2025-12-31, 2026-01-01..2026-12-31'],
    ['2026-01-05T00:00..2026', '2026-01-05..2026-12-31'],
  ];
  for (const [cov, desc] of keep) {
    it(`covering: ${cov} は従来どおり通る（覆域 ${desc}）`, () => {
      const r = tbl(cov);
      expect(r.results[0].dates).toEqual(['2026-01-05']);
      expect(r.coverage[0].covering).toBe(desc);
    });
  }
  it('開端の直後の labels:・年の桁数の検査（評価側・F141）は従来どおり', () => {
    expect(run(JP + 'h = [2026-01-05] covering: 2026.. labels: [A]\nh\n', M).results[0].dates).toEqual(['2026-01-05']);
    expect(() => tbl('2026..10000')).toThrow(/^covering: 年は 4 桁の整数（0000\.\.9999）: 10000$/);
  });
});

describe('受理境界: & が絡む結合子の混在は括弧必須（§4.5・§5.6・90-open 3-22 (1)）', () => {
  const JP = 'premise JP { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }\n@JP\n'
    + 'a = everyDay |> filter(d => weekday(d) == Mon or weekday(d) == Tue or weekday(d) == Wed)\n'
    + 'b = everyDay |> filter(d => weekday(d) == Tue or weekday(d) == Wed or weekday(d) == Thu)\n'
    + 'c = everyDay |> filter(d => weekday(d) == Wed or weekday(d) == Thu or weekday(d) == Fri)\n';
  const M = { from: '2026-01-01', to: '2026-02-01' };
  const dates = (e: string) => run(JP + e + '\n', M).results[0].dates;
  const MIX = /^構文エラー\(\d+:\d+\): & が絡む混在は括弧で順序を明示する（§4\.5）/;
  const stop: [string, string][] = [
    ['a | b & c', '&'],                // 旧: (a | b) & c として受理
    ['a & b | c', '|'],
    ['a \\ b & c', '&'],
    ['a & b \\ c', '\\'],
    ['a | b | c & a', '&'],            // 3 項以上で & が 1 つ混ざる
    ['a | b \\ c & a', '&'],
    ['a |\n  b &\n  c', '&'],          // 行末結合子の継続（F91・ADR-44）でも同じ列
    ['a |> within(month) |> first | b & c', '&'],
  ];
  for (const [e, at] of stop) {
    it(`${JSON.stringify(e)} は静的エラー（'${at}' の位置）`, () => {
      expect(() => dates(e)).toThrow(MIX);
      expect(() => dates(e)).toThrow(`（'${at}' の位置）`);
    });
  }
  const keep: [string, string][] = [
    ['a | b | c', '((a | b) | c)'],
    ['a & b & c', '((a & b) & c)'],
    ['a \\ b \\ c', '((a \\ b) \\ c)'],
    ['a | b \\ c', '((a | b) \\ c)'],   // & が絡まない混在は左結合のまま
    ['(a | b) & c', '((a | b) & c)'],
    ['a | (b & c)', '(a | (b & c))'],
    ['a |\n  b |\n  c', '((a | b) | c)'],
    ['a |> within(month) |> last & b', '((a |> within(month) |> last) & b)'],
  ];
  for (const [e, paren] of keep) {
    it(`${JSON.stringify(e)} は従来どおり通る（${paren} と同じ列）`, () => {
      const r = dates(e);
      expect(r.length).toBeGreaterThan(0);
      expect(r).toEqual(dates(paren));
    });
  }
});
