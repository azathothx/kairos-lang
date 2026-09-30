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
