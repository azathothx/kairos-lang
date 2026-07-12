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
