// 時点どうしの順序比較と標準糖衣 since／before（ADR-55・1.1 の追加拡張）の witness
// - ADR-55「検証の案」(a)〜(i): 第 35 弾の 51 点の外延一致・境界（半開 [since, before)）・目盛り外 14:30・輸送行（註釈 ..10-01）・
//   整列「なし」の和・窓の保存・型規則の誘導（混在・単独時刻・ラベル）・数値比較の回帰・予約語。
//   (h) の「既存の数値比較 doctest が全数緑」は本ファイル以外の全数が担う（既存スイートが無変更で緑＝追加拡張の証人）
// - 固定材はブログ第 35 弾（492）の Office premise（9:00–17:00・祝日 3 日・毎正時 hourly）をそのまま使う
//   ＝1.0.12 の epochOrdinal 形で実測した 51 点（3＋40＋8）が基準
// - 診断は typeName（日本語）で両辺を見る形に固定し、文言の変異で割れるようにする
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';
import { PRELUDE } from './helpers.ts';

const OFFICE = `
premise Office {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "example"
  satSunC = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  holidays = [2026-10-12, 2026-11-03, 2026-11-23] covering: 2026-10-01..2026-12-31
  nonWorking = satSunC | holidays
  nine = chronos grid 1d anchor: 2026-01-01T09:00
  five = chronos grid 1d anchor: 2026-01-01T17:00
  sessionOpens  = nine |> first
  sessionCloses = five |> first
}
premise JP {
  calendar-system: Gregorian
  calendar: Office
  tz: "Asia/Tokyo"
  wkst: Mon
  hourly = everyInstant |> strideBy(1h, from: 2026-01-01)
}
@JP
`;
const DL = { from: '2026-10-26', to: '2026-11-05' };   // 10/26（月）14 時の時点で、締め切りは 11/4（水）17 時
const OPEN = 'hourly |> filter(t => isOpen(t))';
const SUGAR = `${OPEN} |> since(2026-10-26T14:00) |> before(2026-11-04T17:00)\n`;
const EPOCH = `${OPEN.slice(0, -1)} and epochOrdinal(hour, t) >= epochOrdinal(hour, 2026-10-26T14:00)`
  + ` and epochOrdinal(hour, t) < epochOrdinal(hour, 2026-11-04T17:00))\n`;
const ann = (r: ReturnType<typeof run>) => r.results[0].annotations.map(x => `${x.from}..${x.to} ${x.source}`);

describe('(a) 第 35 弾の外延一致——epochOrdinal 形と糖衣形の 51 点（判断 2 の補題＝目盛り上のリテラルでは外延同値）', () => {
  it('since／before 形は 51 点・先頭 14:00・末尾 16:00・epochOrdinal 形と同じ点列・同じ註釈・同じ警告', () => {
    const sugar = run(OFFICE + SUGAR, DL);
    const old = run(OFFICE + EPOCH, DL);
    expect(sugar.results[0].dates).toHaveLength(51);
    expect(sugar.results[0].dates[0]).toBe('2026-10-26T14:00');
    expect(sugar.results[0].dates.at(-1)).toBe('2026-11-04T16:00');
    expect(sugar.results[0].dates).toEqual(old.results[0].dates);
    expect(sugar.results[0].annotations).toEqual(old.results[0].annotations);
    expect(sugar.warnings).toEqual(old.warnings);
  });

  it('内訳 3＋40＋8: 当日の残り 3 点・間の 5 営業日 40 点・締め切り当日 8 点（11/3 文化の日は 0）', () => {
    const d = evalDates(OFFICE + SUGAR, DL);
    const on = (day: string) => d.filter(x => x.startsWith(day)).length;
    expect(on('2026-10-26')).toBe(3);
    expect(on('2026-11-03')).toBe(0);
    expect(on('2026-11-04')).toBe(8);
    expect(['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02'].map(on)).toEqual([8, 8, 8, 8, 8]);
  });

  it('糖衣は展開で消える——filter(t => t >= p and t < q) の直書きと同一（§4.8・判断 5）', () => {
    const direct = evalDates(OFFICE + `${OPEN} |> filter(t => t >= 2026-10-26T14:00 and t < 2026-11-04T17:00)\n`, DL);
    expect(direct).toEqual(evalDates(OFFICE + SUGAR, DL));
    expect(direct).toHaveLength(51);
  });
});

describe('(b) 境界は半開 [since, before)——since は p を含み・before は p を含まない（判断 4）', () => {
  const DAY = { from: '2026-11-04', to: '2026-11-05' };
  it('hourly |> since(09:00) |> before(17:00) は 09..16 の 8 点（17:00 は出ない・09:00 は出る）', () => {
    const d = evalDates(OFFICE + 'hourly |> since(2026-11-04T09:00) |> before(2026-11-04T17:00)\n', DAY);
    expect(d).toHaveLength(8);
    expect(d[0]).toBe('2026-11-04T09:00');
    expect(d.at(-1)).toBe('2026-11-04T16:00');
    expect(d).not.toContain('2026-11-04T17:00');
  });

  it('p が入力の点でなくても「p 以上の最初の入力点」から（位相は入力のまま・新しい点を作らない＝ADR-34 判断 4 不変）', () => {
    const d = evalDates(OFFICE + 'hourly |> since(2026-11-04T09:30)\n', DAY);
    expect(d[0]).toBe('2026-11-04T10:00');
    expect(d).not.toContain('2026-11-04T09:30');
  });

  it('since(日付リテラル) は在圏 tz の市民日の開始瞬間——hourly |> since(2026-10-26) の先頭は 00:00', () => {
    expect(evalDates(OFFICE + 'hourly |> since(2026-10-26)\n', { from: '2026-10-26', to: '2026-10-27' })[0]).toBe('2026-10-26');
  });

  it('日粒度の列に時刻付きリテラル: everyDay |> before(2026-11-04T17:00) は 11-04 を含む（日の点は 00:00。文書化のみ・警告なし）', () => {
    const r = run(OFFICE + 'everyDay |> before(2026-11-04T17:00)\n', { from: '2026-11-01', to: '2026-11-10' });
    expect(r.results[0].dates).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
    expect(r.warnings).toEqual([]);
  });
});

describe('(c) 目盛り外の錨 14:30——瞬間の順序は 50 点・先頭 15:00、床比較の epochOrdinal 形は 51 点（判断 2）', () => {
  it('since(14:30) は 14:00 を含まない（単位を持たない）・epochOrdinal(hour) 形は 14 時台の床で 14:00 を含む', () => {
    const sugar = evalDates(OFFICE + `${OPEN} |> since(2026-10-26T14:30) |> before(2026-11-04T17:00)\n`, DL);
    expect(sugar).toHaveLength(50);
    expect(sugar[0]).toBe('2026-10-26T15:00');
    const floor = evalDates(OFFICE + EPOCH.replace('2026-10-26T14:00', '2026-10-26T14:30'), DL);
    expect(floor).toHaveLength(51);
    expect(floor[0]).toBe('2026-10-26T14:00');
  });
});

describe('(d) 輸送行は filter 行——註釈は覆域外の区間ちょうど（判断 5。stride 展開なら評価域の末尾まで膨張）', () => {
  const R = { from: '2026-09-25', to: '2026-10-05' };   // 祝日表の覆域は 10-01 から
  it('bizDay |> since(2026-09-28) の註釈は 09-25..10-01（覆域外の区間そのもの）・点は 5', () => {
    const r = run(OFFICE + 'bizDay |> since(2026-09-28)\n', R);
    expect(r.results[0].dates).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(ann(r)).toEqual(['2026-09-25..2026-10-01 Office.holidays']);
  });

  it('対照: 利用側糖衣 stride(1, from:) は同じ点で註釈が ..10-05 へ膨張（展開先を filter に固定した理由）', () => {
    const r = run(OFFICE + 'bizDay |> stride(1, from: 2026-09-28)\n', R);
    expect(r.results[0].dates).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(ann(r)).toEqual(['2026-09-25..2026-10-05 Office.holidays']);
  });
});

describe('(e) 整列「なし」の和にも掛かる——差 \\ で作る before は ADR-36 の静的エラー（判断 5）', () => {
  const R = { from: '2026-09-28', to: '2026-10-03' };
  it('(bizDay | hourly) |> before(2026-10-01) は 72 点（日の点と 00:00 の瞬間は同一）・直書き filter と同一', () => {
    const d = evalDates(OFFICE + '(bizDay | hourly) |> before(2026-10-01)\n', R);
    expect(d).toHaveLength(72);
    expect(d[0]).toBe('2026-09-28');
    expect(d.at(-1)).toBe('2026-09-30T23:00');
    expect(d.some(x => x.startsWith('2026-10-01'))).toBe(false);
    expect(d).toEqual(evalDates(OFFICE + '(bizDay | hourly) |> filter(t => t < 2026-10-01)\n', R));
  });

  it('差 \\ で作る形は整列「なし」で止まる（ADR-36）——糖衣が filter 展開である理由', () => {
    expect(() => run(OFFICE + 'u = bizDay | hourly\nu \\ (u |> since(2026-10-01))\n', R))
      .toThrow(/^結合子 \\: 両辺の整列が同一でない/);
  });
});

describe('(f) 窓を保存——within(month) |> since(p) |> first が成立（判断 5）', () => {
  const R = { from: '2026-10-01', to: '2026-12-01' };
  it('within(month) |> since(2026-10-15) |> first ＝ [10-15, 11-01]', () => {
    expect(evalDates(OFFICE + 'everyDay |> within(month) |> since(2026-10-15) |> first\n', R)).toEqual(['2026-10-15', '2026-11-01']);
  });
  it('within(month) |> before(2026-11-20) |> last ＝ [10-31, 11-19]', () => {
    expect(evalDates(OFFICE + 'everyDay |> within(month) |> before(2026-11-20) |> last\n', R)).toEqual(['2026-10-31', '2026-11-19']);
  });
});

describe('(g) 型規則——混在・単独時刻・ラベルは誘導つきエラー（判断 3・typeName で両辺を見る）', () => {
  const R = { from: '2026-10-01', to: '2026-10-03' };
  it('時点と数値: 両辺の型名を左右の順に（1.0.10 の「数値ではない: point」＝左辺の英語種別止まりを統一）', () => {
    expect(() => run(OFFICE + 'everyDay |> filter(t => t >= 5)\n', R))
      .toThrow(/^順序比較の両辺の型が異なる: 時点 と 数値（順序比較は数値どうし・時点どうし。§4\.9・ADR-55）$/);
    expect(() => run(OFFICE + 'everyDay |> filter(d => 5 < d)\n', R))
      .toThrow(/^順序比較の両辺の型が異なる: 数値 と 時点（/);
    expect(() => run(OFFICE + 'everyDay |> filter(d => everyDay < d)\n', R))
      .toThrow(/^順序比較の両辺の型が異なる: 時間ストリーム と 時点（/);
    expect(() => run(OFFICE + 'everyDay |> filter(d => weekday(d) >= 5)\n', R))
      .toThrow(/^順序比較の両辺の型が異なる: 文字列（ラベル） と 数値（/);
  });

  it('単独時刻: since(T14:00) は呼び出し時に ADR-51 の誘導（2026-10-24）・順序比較の右辺が時刻でも止まる・単独時刻どうしの順序も定義しない', () => {
    const re = /^順序比較 (>=|<) の両辺（(時点|時刻) と 時刻）に単独時刻リテラルがある——単独時刻リテラルは strideBy\(1d, from:\)（壁時計 tick）の位置でのみ使える。ここでは日付つきの日時リテラルで錨を明示する（ADR-51。単独時刻どうしの順序も定義しない＝ADR-55）$/;
    expect(() => run(OFFICE + 'everyDay |> since(T14:00)\n', R)).toThrow(/^since\(p\) の p に単独時刻リテラルは渡せない——単独時刻リテラルは strideBy\(1d, from:\)（壁時計 tick）の位置でのみ使える。日付つきの日時リテラルで錨を明示する（ADR-51・ADR-55）/);
    expect(() => run(OFFICE + 'everyDay |> filter(d => T09:00 < T17:00)\n', R)).toThrow(re);
  });

  it('ラベルどうし: weekday(d) >= Mon は labelOrdinal への誘導・誘導先の形は動く（Fri 以降の 3 日）', () => {
    expect(() => run(OFFICE + 'everyDay |> filter(d => weekday(d) >= Mon)\n', R))
      .toThrow(/^ラベルの順序は定義しない: 文字列（ラベル） どうしの >=——ラベルの順序は labelOrdinal\(B, x\) で宣言値域の序数（数値）にしてから比較する（§4\.9・ADR-54／55）$/);
    expect(evalDates(OFFICE + 'everyDay |> filter(d => labelOrdinal(weekday, d) >= labelOrdinal(weekday, Fri))\n',
      { from: '2026-01-05', to: '2026-01-12' })).toEqual(['2026-01-09', '2026-01-10', '2026-01-11']);
  });

  it('同じ型でも数値・時点以外は定義しない（論理値どうし）', () => {
    expect(() => run(OFFICE + 'everyDay |> filter(d => (weekday(d) == Mon) < (weekday(d) == Tue))\n', R))
      .toThrow(/^順序比較は数値どうし・時点どうしに限る: 論理値 どうしの <（§4\.9・ADR-55）$/);
  });

  it('等値の規則は不変: t == 5 は 1.0 追補 22 の文言のまま・時点どうしの等値は従来どおり通る', () => {
    expect(() => run(OFFICE + 'everyDay |> filter(t => t == 5)\n', R))
      .toThrow(/^等値比較の両辺の型が異なる: 時点 と 数値（比較は同じ型どうし。§4\.9）$/);
    expect(evalDates(OFFICE + 'everyDay |> filter(t => t == 2026-10-02)\n', R)).toEqual(['2026-10-02']);
  });
});

describe('(h) 数値比較の回帰と在圏 tz——1.0 の数値比較は不変・時点のリテラルは在圏 tz で解決（ADR-33）', () => {
  it('dayNo の 4 演算子（1 月）', () => {
    const JAN = { from: '2026-01-01', to: '2026-02-01' };
    expect(evalDates(PRELUDE + 'everyDay |> filter(d => dayNo(d) > 29)\n', JAN)).toEqual(['2026-01-30', '2026-01-31']);
    expect(evalDates(PRELUDE + 'everyDay |> filter(d => dayNo(d) >= 30)\n', JAN)).toEqual(['2026-01-30', '2026-01-31']);
    expect(evalDates(PRELUDE + 'everyDay |> filter(d => dayNo(d) < 3)\n', JAN)).toEqual(['2026-01-01', '2026-01-02']);
    expect(evalDates(PRELUDE + 'everyDay |> filter(d => dayNo(d) <= 2)\n', JAN)).toEqual(['2026-01-01', '2026-01-02']);
  });

  it('NY の壁時計 09:00 を since で切る——リテラルは premise の tz で時点に解決（DST 切替日 3/8 を含む）', () => {
    const NY = 'premise NY { calendar-system: Gregorian; tz: "America/New_York"; wkst: Sun }\n@NY\n';
    expect(evalDates(NY + 'everyDay |> at(T09:00) |> since(2026-03-08T09:00)\n',
      { from: '2026-03-07', to: '2026-03-10', tz: 'America/New_York' })).toEqual(['2026-03-08T09:00', '2026-03-09T09:00']);
  });
});

describe('(i) 予約語——利用側 top-level の since／before 束縛は誘導つき静的エラー・1.0 の語は不変（判断 8）', () => {
  const R = { from: '2026-01-01', to: '2026-01-03' };
  it('since(p) = …／before = … は静的エラー（改名の案内つき）', () => {
    expect(() => run(OFFICE + 'since(p) = s => s\neveryDay\n', R))
      .toThrow(/^since は 1\.1 で追加した語（予約語・stdlib の標準糖衣）——同名の利用側 top-level 束縛は静的エラー（§4\.8）。利用側の束縛は別の名に改名する（ADR-55 判断 8）$/);
    expect(() => run(OFFICE + 'before = 1\neveryDay\n', R))
      .toThrow(/^before は 1\.1 で追加した語（予約語・stdlib の標準糖衣）——/);
  });

  it('3 語（labelOrdinal・since・before）は同じ規約の下——どの診断も「1.1 で追加した語（予約語」を名指す', () => {
    for (const src of ['labelOrdinal = 1', 'since = 1', 'before = 1']) {
      expect(() => run(OFFICE + src + '\neveryDay\n', R)).toThrow(/1\.1 で追加した語（予約語/);
    }
  });

  it('1.0 の stdlib 語 at の top-level 束縛は従来どおり黙って stdlib が勝つ（1.0 で動いていたファイルを止めない）', () => {
    expect(evalDates(OFFICE + 'at(a) = s => s\neveryDay |> at(T09:00)\n', R)).toEqual(['2026-01-01T09:00', '2026-01-02T09:00']);
  });

  it('派生 with の同名束縛は従来どおり基底の公開語を上書きする（判断 8 は利用側 top-level に限る・§4.8）', () => {
    const X = 'premise X = Gregorian with { tz: "Asia/Tokyo"; wkst: Mon; since(p) = s => s }\n@X\n';
    expect(evalDates(X + 'everyDay |> since(2026-01-05)\n', { from: '2026-01-01', to: '2026-01-04' }))
      .toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });
});

// ultra 6（2026-10-24）の所見の処置: 予約語はラベル名にも使えない・since／before の p は適用時に検査する。
// 変異で赤を実測: addVocab の検査を外す（cycle は「ラベルは名前」・== since は型違いの別文言に化ける）・applyValue の検査を外す（0 点の範囲で黙って空）
describe('予約語はラベル名にも使えない（2026-10-24）——1.0 で before／since をラベルにしていた定義は誘導つき静的エラー', () => {
  const R = { from: '2026-01-01', to: '2026-01-11' };
  const re = (w: string) => new RegExp(`^${w} は 1\\.1 で追加した語（予約語）——ラベル名（cycle のラベル列・labels:）にも使えない（§4\\.8）。ラベルは別の名に改名する（ADR-55 判断 8）`);
  it('cycle のラベル列（1.0 では before が文字列に解決して動いた形＝1.0.12 で 5 点）', () => {
    expect(() => run(OFFICE + 'phase = day cycle [before, after] anchor: 2026-01-01\neveryDay |> filter(d => phase(d) == before)\n', R)).toThrow(re('before'));
  });
  it('テーブルリテラルの labels:・segmentBy の labels:・external の labels:', () => {
    expect(() => run(OFFICE + 't = [2026-01-01, 2026-01-02] covering: 2026..2026 labels: [since, after]\nt |> filter(d => t(d) == since)\n', R)).toThrow(re('since'));
    expect(() => run(OFFICE + 'term = everyDay |> segmentBy(hourly, edges: drop, empties: error, labels: [labelOrdinal, a, b, c])\nterm\n', R)).toThrow(re('labelOrdinal'));
    const ext = 'premise X { calendar-system: Gregorian; tz: "Asia/Tokyo"; source: "x"\n  e = external(kind: dates, labels: [before, after])\n}\n@X\ne\n';
    expect(() => run(ext, R)).toThrow(re('before'));
  });
  it('予約語でないラベル名は従来どおり（after・odd は語彙に入る）', () => {
    expect(evalDates(OFFICE + 'phase = day cycle [odd, after] anchor: 2026-01-01\neveryDay |> filter(d => phase(d) == odd)\n', R))
      .toEqual(['2026-01-01', '2026-01-03', '2026-01-05', '2026-01-07', '2026-01-09']);
  });
});

describe('since(p)／before(p) の p は呼び出し時に検査する（2026-10-24）——列が空でも止まる', () => {
  // 空の列＝展開 filter の述語は一度も走らない。評価範囲を土日に絞るだけでは足りない（列は評価範囲の先まで実体化され、その点で述語が走る）
  const EMPTY = '(everyDay \\ everyDay)';
  const weekend = { from: '2026-10-01', to: '2026-10-03' };
  it('前提: この列は空', () => {
    expect(evalDates(OFFICE + EMPTY + '\n', weekend)).toEqual([]);
  });
  it('空の列 |> since(T14:00)／before(T14:00) でも ADR-51 の誘導で止まる（修正前は黙って 0 点・exit 0）', () => {
    expect(() => run(OFFICE + EMPTY + ' |> since(T14:00)\n', weekend))
      .toThrow(/^since\(p\) の p に単独時刻リテラルは渡せない——単独時刻リテラルは strideBy\(1d, from:\)（壁時計 tick）の位置でのみ使える。日付つきの日時リテラルで錨を明示する（ADR-51・ADR-55）/);
    expect(() => run(OFFICE + EMPTY + ' |> before(T14:00)\n', weekend)).toThrow(/^before\(p\) の p に単独時刻リテラルは渡せない/);
  });
  it('p が時点でない型（数値・ラベル）も呼び出し時に型名つきで止まる', () => {
    expect(() => run(OFFICE + EMPTY + ' |> since(5)\n', weekend)).toThrow(/^since\(p\) の p は日付つきの日時リテラル（時点）: 数値 が渡された（ADR-55）/);
    expect(() => run(OFFICE + EMPTY + ' |> before(Mon)\n', weekend)).toThrow(/^before\(p\) の p は日付つきの日時リテラル（時点）: 文字列（ラベル） が渡された（ADR-55）/);
  });
  it('派生 with で since を上書きした利用側の定義には掛からない（§4.8 の既存挙動＝stdlib の定義そのものだけを検査）', () => {
    const X = 'premise X = Gregorian with { tz: "Asia/Tokyo"; wkst: Mon; since(p) = s => s }\n@X\n';
    expect(evalDates(X + 'everyDay |> since(T14:00)\n', { from: '2026-01-01', to: '2026-01-03' })).toEqual(['2026-01-01', '2026-01-02']);
  });
});
