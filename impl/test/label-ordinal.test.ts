// 列挙ラベルの序数射影 labelOrdinal(B, x)（ADR-54・1.1 の追加拡張）の witness
// - ADR-54「検証の案」(1)〜(9): 大安の外延一致・m13 の罠・値域外／型不一致／引数個数の文言・誘導 3 種・重複値域・
//   点形の継承（範囲外註釈・tz 名検査）・曜日番号＝ordinalIn（wkst: Mon）・往復・予約語。
//   (10) 既存スイートが無変更で緑＝追加拡張の証人は、本ファイル以外の全数が担う
// - doctest にエラー期待の記法は無いのでエラー系はここ。診断の型名は typeName（日本語）で固定し、変異で割れる形にする
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';
import type { ExternalData } from '../src/index.ts';
import { PRELUDE } from './helpers.ts';

// 供給側の正準例（reference/segmentBy.md の external 版六曜）と同じ固定材: 朔 5 件・値域 m1〜m12 を宣言・供給は m12 m1 m2 m3 m4
const SAKU: ExternalData = {
  dates: ['2026-01-19', '2026-02-17', '2026-03-19', '2026-04-17', '2026-05-17'],
  covering: '2026-01-01..2026-05-31', asof: '2026-09-03', labels: ['m12', 'm1', 'm2', 'm3', 'm4'],
};
const resolve = (_p: string, binding: string): ExternalData => {
  if (binding === 'saku') return SAKU;
  throw new Error(`固定材がない: ${binding}`);
};
const L = `
premise L { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "moon/saku"
  saku  = external(kind: dates, labels: [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12])
  lunar = day |> segmentBy(saku, edges: drop, empties: keep, label: (p => saku(p)))
  monthLabelNo = l => l == m1 ? 1 : l == m2 ? 2 : l == m3 ? 3 : l == m4 ? 4 : l == m5 ? 5 : l == m6 ? 6 : l == m7 ? 7 : l == m8 ? 8 : l == m9 ? 9 : l == m10 ? 10 : l == m11 ? 11 : 12
  rokuyoOld = d => (monthLabelNo(lunar(d)) + ordinalIn(day, lunar, d)) mod 6
  rokuyoNew = d => (labelOrdinal(saku, lunar(d)) + ordinalIn(day, lunar, d)) mod 6
  extra = day cycle [m13, m14] anchor: 2026-01-05
}
@L
`;
const H1 = { from: '2026-01-01', to: '2026-06-01', resolve };

// 節切り月の周期ラベル（labels: cycle＝値域 3 形の (iii)）。覆域は 1/5〜4/5 で評価範囲の両端が範囲外
const SEKKI = `
premise T = Gregorian with {
  tz: "Asia/Tokyo"
  setsu = [2026-01-05, 2026-02-04, 2026-03-05, 2026-04-05] covering: 2026-01-05..2026-04-05
  sekkiMonth = everyDay |> segmentBy(setsu, edges: drop, empties: error,
                                     labels: cycle [寅, 卯, 辰, 巳, 午, 未, 申, 酉, 戌, 亥, 子, 丑] anchor: 2026-02-04)
  seg3 = everyDay |> segmentBy(setsu, edges: drop, empties: error, labels: cycle [10, 20, 30] anchor: 2026-02-04)
}
@T
`;
const Y2026 = { from: '2026-01-01', to: '2027-01-01' };

describe('(1) 大安の外延一致——external の labels: 値域（判断 1 (i)）・三項 12 段の畳み込み（判断 2）', () => {
  const DAIAN = ['2026-01-24', '2026-01-30', '2026-02-05', '2026-02-11', '2026-02-21', '2026-02-27',
    '2026-03-05', '2026-03-11', '2026-03-17', '2026-03-22', '2026-03-28', '2026-04-03', '2026-04-09',
    '2026-04-15', '2026-04-19', '2026-04-25', '2026-05-01', '2026-05-07', '2026-05-13', '2026-05-18',
    '2026-05-24', '2026-05-30'];   // 1.0.12 配布物の三項形で実測（22 点）

  it('labelOrdinal 形と三項形は同じ点列・同じ註釈（起点を 0 にしても順序を反転しても割れる）', () => {
    const a = run(L + 'everyDay |> filter(d => rokuyoOld(d) == 0)\n', H1);
    const b = run(L + 'everyDay |> filter(d => rokuyoNew(d) == 0)\n', H1);
    expect(b.results[0].dates).toEqual(DAIAN);
    expect(b.results[0].dates).toEqual(a.results[0].dates);
    expect(b.results[0].annotations).toEqual(a.results[0].annotations);
    expect(b.results[0].annotations.map(x => `${x.from}..${x.to} ${x.source}`)).toEqual(['2026-01-01..2026-01-19 L.saku']);
  });

  it('値形: 識別子形と文字列形は同じ序数（§5.5）・点形は B(d) の射影を経る（判断 3）', () => {
    const two = { from: '2026-02-17', to: '2026-02-19', resolve };
    expect(evalDates(L + 'everyDay |> filter(d => labelOrdinal(saku, m3) == 3)\n', two)).toEqual(['2026-02-17', '2026-02-18']);
    expect(evalDates(L + 'everyDay |> filter(d => labelOrdinal(saku, "m3") == 3)\n', two)).toEqual(['2026-02-17', '2026-02-18']);
    expect(evalDates(L + 'everyDay |> filter(d => labelOrdinal(saku, m12) == 12)\n', two)).toEqual(['2026-02-17', '2026-02-18']);
    // 朔日 2026-02-17 のラベルは供給の m1（宣言順の位置 1）——点形は値域の宣言順を読み、供給列の位置（2）ではない
    expect(evalDates(L + 'everyDay |> filter(d => labelOrdinal(saku, 2026-02-17) == 1)\n', two)).toEqual(['2026-02-17', '2026-02-18']);
    // 表に無い点は B(d) の射影の規約どおり（テーブル射影の硬エラー）——本語は別の文言を足さない
    expect(() => run(L + 'everyDay |> filter(d => labelOrdinal(saku, 2026-02-18) == 1)\n', two)).toThrow(/テーブル射影: 点が列にない/);
  });
});

describe('(2) m13 の罠——既定枝が黙って吸う三項形と、明示エラーになる labelOrdinal（判断 2）', () => {
  const two = { from: '2026-02-17', to: '2026-02-19', resolve };
  it('値域の外のラベル m13 は三項形では既定枝の 12 に化けて警告 0', () => {
    const r = run(L + 'everyDay |> filter(d => monthLabelNo(m13) == 12)\n', two);
    expect(r.results[0].dates).toEqual(['2026-02-17', '2026-02-18']);
    expect(r.warnings).toEqual([]);
  });
  it('labelOrdinal は「値域の外」の明示エラー（値域の表示つき）', () => {
    expect(() => run(L + 'everyDay |> filter(d => labelOrdinal(saku, m13) == 12)\n', two))
      .toThrow(/^labelOrdinal: m13 は saku の値域の外（値域 \[m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12\]。三項形の既定枝が黙って吸っていた形＝ADR-54 判断 2）$/);
  });
  it('13 個以上の値域は診断の表示を 12 個で打ち切る（「, …」）——序数そのものは 13 以降も読める', () => {
    const Z = `
premise Z = Gregorian with { tz: "Asia/Tokyo"; z13 = day cycle [a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13] anchor: 2026-01-05 }
@Z
`;
    const R = { from: '2026-01-05', to: '2026-01-19' };
    // 宣言に無い識別子は 1.0 どおり名前解決で止まるので、値域の外は文字列形で渡す（§5.5）
    expect(() => run(Z + 'everyDay |> filter(d => labelOrdinal(z13, "b0") == 1)\n', R))
      .toThrow(/^labelOrdinal: b0 は z13 の値域の外（値域 \[a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, …\]。三項形の既定枝が黙って吸っていた形＝ADR-54 判断 2）$/);
    expect(evalDates(Z + 'everyDay |> filter(d => labelOrdinal(z13, a13) == 13)\n', R).length).toBe(14);
    expect(evalDates(Z + 'everyDay |> filter(d => labelOrdinal(z13, d) == 13)\n', R)).toEqual(['2026-01-17']);
  });
});

describe('(3) 値域外・型不一致・引数個数の文言（typeName＝日本語の型名）', () => {
  it('値域外: 別の宣言のラベルを渡すと値域の表示つきで止まる', () => {
    expect(() => run(SEKKI + 'everyDay |> filter(d => labelOrdinal(weekday, 寅) == 1)\n', Y2026))
      .toThrow(/^labelOrdinal: 寅 は weekday の値域の外（値域 \[Mon, Tue, Wed, Thu, Fri, Sat, Sun\]。/);
  });
  it('型不一致: 数値を名前の値域に・名前を数値の値域に（==/!= と同じ規則）', () => {
    expect(() => run(PRELUDE + 'everyDay |> filter(d => labelOrdinal(weekday, 3) == 3)\n', Y2026))
      .toThrow(/^labelOrdinal: x の型（数値）が weekday の値域の型（文字列（ラベル））と不一致（==\/!= と同じ規則——比較は同じ型どうし。§4.9・ADR-54 判断 2）$/);
    expect(() => run(SEKKI + 'everyDay |> filter(d => labelOrdinal(seg3, 寅) == 1)\n', Y2026))
      .toThrow(/^labelOrdinal: x の型（文字列（ラベル））が seg3 の値域の型（数値）と不一致/);
    expect(() => run(PRELUDE + 'everyDay |> filter(d => labelOrdinal(weekday, everyDay) == 3)\n', Y2026))
      .toThrow(/^labelOrdinal: x の型（時間ストリーム）が weekday の値域の型（文字列（ラベル））と不一致/);
  });
  it('引数個数: 1 個・3 個は静的エラー（位置引数 2 個）・名前付き引数は個数が合っていても理由を言って止まる', () => {
    expect(() => run(PRELUDE + 'everyDay |> filter(d => labelOrdinal(weekday) == 1)\n', Y2026))
      .toThrow(/^labelOrdinal: 引数は 2 つ（B, x）——B は値域を宣言した束縛・x はラベル値または点（ADR-54）（渡されたのは 1 個）$/);
    expect(() => run(PRELUDE + 'everyDay |> filter(d => labelOrdinal(weekday, d, d) == 1)\n', Y2026))
      .toThrow(/^labelOrdinal: 引数は 2 つ.*（渡されたのは 3 個）$/);
    // epochOrdinal／ordinalIn と同じ規則・同じ文言（positionalArity＝2026-10-30 所見 2）
    expect(() => run(PRELUDE + 'everyDay |> filter(d => labelOrdinal(weekday, x: d) == 1)\n', Y2026))
      .toThrow(/^labelOrdinal: 名前付き引数は受け取らない——位置引数 2 個（B, x）——B は値域を宣言した束縛・x はラベル値または点（ADR-54）$/);
  });
});

describe('(4) 値域にならないラベル源は誘導つき静的エラー（判断 1）', () => {
  const LUNAR = PRELUDE + `
newMoons = [2026-01-19T04:52, 2026-02-17T21:01, 2026-03-19T10:23, 2026-04-17T20:52] covering: 2026-01-19..2026-04-30
lunarMonth = everyDay |> segmentBy((newMoons |> snapTo(day)), edges: drop, empties: error, labels: [12, 1, 2, 3])
`;
  it('segmentBy の静的 labels:（窓列への並行列）→ 数値を labels: に直接書く', () => {
    expect(() => run(LUNAR + 'everyDay |> filter(d => labelOrdinal(lunarMonth, d) == 1)\n', Y2026))
      .toThrow(/^labelOrdinal: lunarMonth の labels: は窓列への並行ラベル列（窓順・点順の割り当て列）で列挙順ではない——値域は宣言リスト（external の labels:・窓束縛 cycle・segmentBy の labels: cycle）に限る。番号が要るなら labels: に数値を直接書く（stdlib\/kyureki の形）か epochOrdinal の差で（ADR-54 判断 1）$/);
    // 並行列そのものの読みは従来どおり（1.0 の意味は不変）
    expect(evalDates(LUNAR + 'lunarMonth |> first |> filter(d => lunarMonth(d) == 1)\n', Y2026)).toEqual(['2026-02-17']);
  });
  it('テーブルリテラルの labels:（点列への並行列）も不受理', () => {
    expect(() => run(PRELUDE + `
sekki = [2026-02-04, 2026-03-05] covering: 2026..2026 labels: [立春, 啓蟄]
everyDay |> filter(d => labelOrdinal(sekki, 立春) == 1)
`, Y2026)).toThrow(/^labelOrdinal: sekki の labels: はテーブルの点列への並行ラベル列（窓順・点順の割り当て列）で列挙順ではない/);
  });
  it('label: ラムダ（計算ラベル）→ 値域を持つ側の束縛を渡す誘導（premise 束縛・stdlib の month とも）', () => {
    expect(() => run(L + 'everyDay |> filter(d => labelOrdinal(lunar, d) == 1)\n', H1))
      .toThrow(/^labelOrdinal: lunar のラベル源は label: ラムダ（計算ラベル）で値域を列挙できない——値域を持つ側の束縛を渡す（labelOrdinal\(B, lunar\(d\)\) の形〈B＝値域を宣言した束縛〉。ADR-42 判断 7 \(g\)・ADR-54 判断 1）$/);
    expect(() => run(PRELUDE + 'everyDay |> filter(d => labelOrdinal(month, d) == 1)\n', Y2026))
      .toThrow(/^labelOrdinal: month のラベル源は label: ラムダ/);
  });
  it('ラベル源のない束縛（窓束縛 week・生成語の窓 day・ラベル無しテーブル）と束縛でない値（ストリーム）', () => {
    expect(() => run(PRELUDE + 'everyDay |> filter(d => labelOrdinal(week, d) == 1)\n', Y2026))
      .toThrow(/^labelOrdinal: week（窓束縛）にラベル源がない——第 1 引数は値域を宣言した束縛（external の labels:・窓束縛 cycle・segmentBy の labels: cycle。ADR-54 判断 1）$/);
    expect(() => run(PRELUDE + 'everyDay |> filter(d => labelOrdinal(day, d) == 1)\n', Y2026))
      .toThrow(/^labelOrdinal: day（窓）にラベル源がない——第 1 引数は値域を宣言した束縛/);
    expect(() => run(PRELUDE + 'everyDay |> filter(d => labelOrdinal(holidays2026, d) == 1)\n', Y2026))
      .toThrow(/^labelOrdinal: holidays2026（テーブル）にラベル源がない/);
    expect(() => run(PRELUDE + 'everyDay |> filter(d => labelOrdinal(everyDay, d) == 1)\n', Y2026))
      .toThrow(/^labelOrdinal: 第 1 引数は値域を宣言した束縛（external の labels:・窓束縛 cycle・segmentBy の labels: cycle）——stream は受け取れない（ADR-54 判断 1）$/);
  });
});

describe('(5) 値域の重複は呼び出し時の静的エラー・宣言は合法のまま（判断 5）', () => {
  const S = `
premise S = Gregorian with { tz: "Asia/Tokyo"; shift4 = day cycle [On, On, On, On, Off, Off, Off, Off] anchor: 2026-01-05 }
@S
`;
  const W2 = { from: '2026-01-05', to: '2026-01-19' };
  it('4 勤 4 休の cycle はラベル射影として従来どおり動く', () => {
    expect(evalDates(S + 'everyDay |> filter(d => shift4(d) == On)\n', W2))
      .toEqual(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16']);
  });
  it('labelOrdinal は点形・値形とも重複で止まる（序数が一意でない）', () => {
    const re = /^labelOrdinal: shift4 の値域に On が重複——序数が一意でない（宣言は合法のまま。位相の量〈サイクルの何日目〉は epochOrdinal の差で書く。ADR-54 判断 5）$/;
    expect(() => run(S + 'everyDay |> filter(d => labelOrdinal(shift4, d) == 1)\n', W2)).toThrow(re);
    expect(() => run(S + 'everyDay |> filter(d => labelOrdinal(shift4, Off) == 5)\n', W2)).toThrow(re);
  });
  it('修飾名 B（Tok.sh）でも診断は修飾名のまま（点形・値形）', () => {
    const Q = `
premise Tok = Gregorian with { tz: "Asia/Tokyo"; sh = day cycle [A, A, B] anchor: 2026-01-05 }
premise S = Gregorian with { tz: "Asia/Tokyo" }
@S
`;
    const re = /^labelOrdinal: Tok\.sh の値域に A が重複——序数が一意でない（宣言は合法のまま。位相の量〈サイクルの何日目〉は epochOrdinal の差で書く。ADR-54 判断 5）$/;
    expect(() => run(Q + 'everyDay |> filter(d => labelOrdinal(Tok.sh, d) == 1)\n', W2)).toThrow(re);
    expect(() => run(Q + 'everyDay |> filter(d => labelOrdinal(Tok.sh, B) == 3)\n', W2)).toThrow(re);
  });
  it('数値の値域（labels: cycle [10, 20, 30]）も一様に位置を返す（判断 5）', () => {
    expect(evalDates(SEKKI + 'everyDay |> filter(d => labelOrdinal(seg3, 30) == 3)\n', { from: '2026-02-04', to: '2026-02-06' }))
      .toEqual(['2026-02-04', '2026-02-05']);
    const d = evalDates(SEKKI + 'everyDay |> filter(d => labelOrdinal(seg3, d) == 2)\n', { from: '2026-02-04', to: '2026-04-05' });
    expect(d[0]).toBe('2026-03-05');
    expect(d[d.length - 1]).toBe('2026-04-04');
  });
});

describe('(6) 点形は B(d) の規約を継承する（判断 3）——範囲外の註釈輸送・tz 名検査', () => {
  const R = { from: '2026-01-01', to: '2026-05-01' };
  it('labels: cycle の覆域の外は束縛名射影と同じ註釈（本語自身は註釈を生まない）', () => {
    const a = run(SEKKI + 'everyDay |> filter(d => sekkiMonth(d) == 寅)\n', R);
    const b = run(SEKKI + 'everyDay |> filter(d => labelOrdinal(sekkiMonth, d) == 1)\n', R);
    expect(b.results[0].dates).toEqual(a.results[0].dates);
    expect(b.results[0].dates[0]).toBe('2026-02-04');
    expect(b.results[0].annotations).toEqual(a.results[0].annotations);
    expect(b.results[0].annotations.length).toBeGreaterThan(0);
    expect(b.results[0].annotations[0].from).toBe('2026-01-01');   // 頭側＝覆域始端より前
  });
  it('述語に流れる点の整列 × cycle の対象グリッドの tz 名不一致は静的エラー（ADR-40 を B(d) 経由で継承）', () => {
    const CROSS = `
premise Tok = Gregorian with {
  source: "test-tokyo"; asof: 2026-01-01
  tz: "Asia/Tokyo"
  hol = [2026-01-01, 2026-01-12] covering: 2026..2026
  biz = everyDay \\ hol
}
premise UNY { calendar-system: Gregorian; tz: "America/New_York"; wkst: Mon }
@UNY
`;
    expect(() => run(CROSS + 'Tok.biz |> filter(d => labelOrdinal(weekday, d) == 1)\n', { from: '2026-01-01', to: '2026-02-01', tz: 'America/New_York' }))
      .toThrow(/^cycle 射影: 入力と窓の tz 名が不一致（入力="Asia\/Tokyo"・窓="America\/New_York"）/);
  });
});

describe('(7) 曜日番号——labelOrdinal(weekday, d) は wkst に依らない cycle のリスト順（判断 4）', () => {
  it('wkst: Mon では ordinalIn(day, week, d) と全日一致', () => {
    const all = evalDates(PRELUDE + 'everyDay |> filter(d => labelOrdinal(weekday, d) == ordinalIn(day, week, d))\n', Y2026);
    expect(all.length).toBe(365);
    expect(evalDates(PRELUDE + 'everyDay |> filter(d => labelOrdinal(weekday, d) != ordinalIn(day, week, d))\n', Y2026)).toEqual([]);
  });
  it('wkst: Sun では ordinalIn の 7 は土曜・labelOrdinal の 7 は日曜のまま（Sun == 7 は定数）', () => {
    const US = `
premise US { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Sun }
@US
`;
    const R = { from: '2026-01-01', to: '2026-01-20' };
    expect(evalDates(US + 'everyDay |> filter(d => ordinalIn(day, week, d) == 7)\n', R)).toEqual(['2026-01-03', '2026-01-10', '2026-01-17']);
    expect(evalDates(US + 'everyDay |> filter(d => labelOrdinal(weekday, d) == 7)\n', R)).toEqual(['2026-01-04', '2026-01-11', '2026-01-18']);
    expect(evalDates(US + 'everyDay |> filter(d => labelOrdinal(weekday, Sun) == 7 and labelOrdinal(weekday, Mon) == 1)\n', R).length).toBe(19);
  });
});

describe('(8) 往復——リスト添字（0 起点）と序数（1 起点）の関係 E[labelOrdinal(B, v) − 1] == v', () => {
  it('曜日リストで全日往復（添字は 0 起点・序数は 1 起点＝三つの序数の使い分け）', () => {
    const R = { from: '2026-01-01', to: '2026-02-01' };
    const src = PRELUDE + `
L7 = [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
everyDay |> filter(d => L7[labelOrdinal(weekday, d) - 1] == weekday(d))
`;
    expect(evalDates(src, R).length).toBe(31);
    expect(evalDates(PRELUDE + `
L7 = [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
everyDay |> filter(d => L7[labelOrdinal(weekday, d) - 1] != weekday(d))
`, R)).toEqual([]);
  });
});

describe('(9) 予約語——1.1 の追加語と同名の束縛は誘導つき静的エラー（判断 8・§4.8）', () => {
  const RE = /^core 語 labelOrdinal の再定義は静的エラー（§4.8）——labelOrdinal は 1.1 で追加した語（予約語）。利用側の束縛は別の名に改名する（ADR-54 判断 8）$/;
  it('top-level 束縛', () => {
    expect(() => run(PRELUDE + 'labelOrdinal = 3\neveryDay\n', Y2026)).toThrow(RE);
    expect(() => run(PRELUDE + 'labelOrdinal = l => 1\neveryDay\n', Y2026)).toThrow(RE);
  });
  it('premise ブロック内の束縛', () => {
    expect(() => run(`
premise P { calendar-system: Gregorian; tz: "Asia/Tokyo"; labelOrdinal = 3 }
@P
everyDay
`, Y2026)).toThrow(RE);
  });
  it('1.0 の core 語の診断は不変（誘導文は付かない）', () => {
    expect(() => run(PRELUDE + 'epochOrdinal = 3\neveryDay\n', Y2026)).toThrow(/^core 語 epochOrdinal の再定義は静的エラー（§4.8）$/);
  });
});
