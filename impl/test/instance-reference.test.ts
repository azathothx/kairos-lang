// 窓インスタンス参照（ADR-42: 位置依存の名前解釈と窓インスタンス参照——適用の型規則）の検証
// - dispatch: 引数式の型で分岐（点→束縛名射影・値→逆像。判定は糖衣展開後・実引数束縛後＝ADR-42 判断 4）
// - 意味論: W(v) ≡ W の要素点列 |> filter(d => W(d) == v)（判断 2。全マッチの和・ゼロマッチは空）
// - 輸送行（判断 3・F94）: 「窓列→要素点列」の出力註釈＝窓列の実効被覆域の補集合（第 5 の窓リーダーサイト）
// - 静的検査群 (a)〜(g)（判断 7）・修飾適用形 C.W(args)（EBNF 唯一の追補）・F96（shiftBoundary のラベル保存）
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';
import { iso, addDays } from './helpers.ts';

/** [from, toExcl) の連続日（独立オラクル用） */
function days(from: string, toExcl: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); iso(d) < toExcl; d = addDays(d, 1)) out.push(iso(d));
  return out;
}

const G = 'premise G { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }\n@G\n';
const F = 'premise F { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }\n@F\n';
const Y8 = { from: '2019-01-01', to: '2027-01-01' };

// マーカー覆域が有限の labels: 窓（輸送行・(c)/(g) の器）——朔 2 件・覆域 2026-01-19..2026-03-31
const LUNAR_2 = G + `
newMoons2 = [2026-01-19T04:52, 2026-02-17T21:01] covering: 2026-01-19..2026-03-31
lunarW = day |> segmentBy((newMoons2 |> snapTo(day)), edges: drop, empties: keep, labels: [1, 2])
`;

describe('正準例（F9 の帰結・ADR-42 判断 2/4）', () => {
  it('year(2020) ＝ 2020 年の全日（頭位置の値引数＝逆像）', () => {
    expect(evalDates(G + 'year(2020)', Y8)).toEqual(days('2020-01-01', '2021-01-01'));
  });

  it('month(5) & year(2026) ＝ 2026 年 5 月（インスタンス参照どうしの積・同一 G）', () => {
    expect(evalDates(G + 'month(5) & year(2026)', Y8)).toEqual(days('2026-05-01', '2026-06-01'));
  });

  it('F9 の元例: (marineDay \\ year(2020)) | [2020-07-23]——「移動元」を式で指す', () => {
    const dates = evalDates(G + `
marineDay = everyDay |> filter(d => monthNo(d) == 7 and weekday(d) == Mon)
  |> within(month) |> nth(3)
(marineDay \\ year(2020)) | [2020-07-23] covering: 2020..2020
`, { from: '2019-01-01', to: '2022-01-01' });
    expect(dates).toEqual(['2019-07-15', '2020-07-23', '2021-07-19']);
  });

  it('定義的等式: year(2020) ≡ 要素点列 |> filter(d => year(d) == 2020)（外延一致）', () => {
    expect(evalDates(G + 'year(2020)', Y8))
      .toEqual(evalDates(G + 'everyDay |> filter(d => year(d) == 2020)', Y8));
  });

  it('点引数は束縛名射影のまま（dispatch の既存面・不変）: year(2026-05-15) == 2026', () => {
    expect(evalDates(G + 'everyDay |> filter(d => year(2026-05-15) == 2026)',
      { from: '2026-01-01', to: '2026-01-03' })).toEqual(['2026-01-01', '2026-01-02']);
  });

  it('自由なラッパは多相（判断 4——判定は実引数束縛後・呼び出しごとに型が確定）', () => {
    // 値引数→逆像。同じ f が点引数なら射影になる（型はラッパ定義でなく呼び出しで決まる）
    expect(evalDates(G + 'f(v) = year(v)\nf(2020)', Y8))
      .toEqual(days('2020-01-01', '2021-01-01'));
    expect(evalDates(G + 'f(v) = year(v)\neveryDay |> filter(d => f(2026-05-15) == 2026)',
      { from: '2026-01-01', to: '2026-01-02' })).toEqual(['2026-01-01']);
  });

  it('segmentBy 由来（label: 式・stream 表現）: kyuMonth("五月") ＝ 朔 6/15〜7/13 の 29 日', () => {
    const KYUREKI = `
premise KyurekiI = Gregorian with {
  tz: "Asia/Tokyo"
  newMoons = [2026-01-19T04:52, 2026-02-17T21:01, 2026-03-19T10:23, 2026-04-17T20:52,
              2026-05-17T05:01, 2026-06-15T11:54, 2026-07-14T18:44, 2026-08-13T02:37,
              2026-09-11T12:27, 2026-10-11T00:50, 2026-11-09T16:02, 2026-12-09T09:52]
    covering: 2026..2026
  lunarStart  = newMoons |> snapTo(day)
  lunarMonthW = day |> segmentBy(lunarStart, edges: drop, empties: error)
  monthNames  = ["十二月", "一月", "二月", "三月", "四月", "五月",
                 "六月", "七月", "八月", "九月", "十月", "十一月"]
  kyuMonth    = day |> segmentBy(lunarStart, edges: drop, empties: error,
                                 label: (p => monthNames[epochOrdinal(lunarMonthW, p)]))
}
premise Koyomi { calendar-system: KyurekiI; tz: "Asia/Tokyo"; wkst: Mon }
@Koyomi
kyuMonth("五月")
`;
    expect(evalDates(KYUREKI, { from: '2026-01-01', to: '2027-01-01' }))
      .toEqual(days('2026-06-15', '2026-07-14'));
  });
});

describe('修飾適用形 C.W(args)（EBNF 唯一の追補・機構 A の修飾ピン。判断 4）', () => {
  it('Fiscal 下の year(2026) は年度（4 月始まり）・Gregorian.year(2026) は暦年', () => {
    const opts = { from: '2026-01-01', to: '2027-06-01' };
    expect(evalDates(F + 'year(2026)', opts)).toEqual(days('2026-04-01', '2027-04-01'));
    expect(evalDates(F + 'Gregorian.year(2026)', opts)).toEqual(days('2026-01-01', '2027-01-01'));
  });

  it('修飾ピンは結合子被演算子にも立つ: monthStart & Gregorian.year(2026)', () => {
    expect(evalDates(F + 'monthStart & Gregorian.year(2026)',
      { from: '2026-01-01', to: '2027-06-01' }).length).toBe(12);
  });

  it('修飾ピンの射影面（両面に同一に効く）: Gregorian.year(2026-05-15) == 2026', () => {
    expect(evalDates(F + 'everyDay |> filter(d => Gregorian.year(2026-05-15) == 2026)',
      { from: '2026-01-01', to: '2026-01-02' })).toEqual(['2026-01-01']);
  });
});

describe('全マッチの和・空（判断 2——番号ラベルは一意キーではない）', () => {
  it('lunarMonth25(6) は閏六月を含む（前月番号の繰り返し＝全マッチの和の正しい帰結）', () => {
    // 朔・閏六月は NAOJ 令和7年暦要項（95-reference-data.md・coincides.test.ts と同一データ）。
    // 六月 = [2025-06-25, 2025-07-25)・閏六月 = [2025-07-25, 2025-08-23)——中気を含まない月
    const dates = evalDates(G + `
premise Kyu25I = Gregorian with {
  tz: "Asia/Tokyo"
  newMoons25 = [2024-12-31T07:27, 2025-01-29T21:36, 2025-02-28T09:45, 2025-03-29T19:58,
                2025-04-28T04:31, 2025-05-27T12:02, 2025-06-25T19:32, 2025-07-25T04:11,
                2025-08-23T15:07, 2025-09-22T04:54, 2025-10-21T21:25, 2025-11-20T15:47,
                2025-12-20T10:43] covering: 2024-12-31..2025-12-31
  lunarStart25  = newMoons25 |> snapTo(day)
  lunarMonth25  = day |> segmentBy(lunarStart25, edges: drop, empties: keep,
                                   labels: [12, 1, 2, 3, 4, 5, 6, 6, 7, 8, 9, 10, 11])
}
premise Koyomi25 { calendar-system: Kyu25I; tz: "Asia/Tokyo"; wkst: Mon }
@Koyomi25
lunarMonth25(6)
`, { from: '2025-01-01', to: '2026-01-01' });
    expect(dates).toEqual(days('2025-06-25', '2025-08-23'));
  });

  it('空窓は正当な空（欠ティティ級・ADR-15）: 要素の無い窓のインスタンス参照は空', () => {
    const r = run(G + `
mks = [2026-01-01, 2026-02-01, 2026-03-01] covering: 2026-01-01..2026-03-31
seg = ([2026-01-10, 2026-03-10] covering: 2026-01-01..2026-03-31)
  |> segmentBy(mks, edges: drop, empties: keep, labels: [1, 2, 3])
seg(2)
`, { from: '2026-01-01', to: '2026-04-01' });
    expect(r.results[0].dates).toEqual([]);
    expect(r.results[0].annotations).toEqual([]);
  });

  it('ゼロマッチ（計算ラベル＝値域が列挙不能）は註釈なしの空: month(0)', () => {
    const r = run(G + 'month(0)', Y8);
    expect(r.results[0].dates).toEqual([]);
    expect(r.results[0].annotations).toEqual([]);
  });
});

describe('輸送行（判断 3・F94——「窓列→要素点列」＝窓列の実効被覆域の補集合）', () => {
  it('マーカー覆域の先は「落ちて註釈」——要素点が無くても註釈の湧き口が立つ', () => {
    const r = run(LUNAR_2 + 'lunarW(1)', { from: '2026-01-01', to: '2026-06-01' });
    expect(r.results[0].dates).toEqual(days('2026-01-19', '2026-02-17'));
    expect(r.results[0].annotations).toEqual([
      expect.objectContaining({ source: 'newMoons2', to: '2026-01-19' }),     // 覆域の頭側
      expect.objectContaining({ source: 'newMoons2', from: '2026-04-01' }),   // 覆域の先
    ]);
  });

  it('規則由来の窓（year）は覆域完全＝註釈ゼロ（既存例に波及なし）', () => {
    const r = run(G + 'year(2020)', Y8);
    expect(r.results[0].annotations).toEqual([]);
  });
});

describe('静的検査群（判断 7）', () => {
  it('(a) ラベル源なし窓束縛への値引数——windows 表現（quarter）', () => {
    expect(() => run(G + 'quarter(2)', Y8))
      .toThrow(/窓束縛 quarter にラベル源（label:\/labels:）がない/);
  });

  it('(a) ラベル源なし窓束縛への値引数——stream 表現（ISOWeek の isoWeek）＋ filter 誘導', () => {
    expect(() => run('premise I { calendar-system: ISOWeek; tz: "Asia/Tokyo"; wkst: Mon }\n@I\nisoWeek(2026)', Y8))
      .toThrow(/窓束縛 isoWeek にラベル源.*isoYearNo/s);
  });

  it('(b) cycle への値引数＝filter 正準形へ誘導', () => {
    expect(() => run(G + 'weekday(Mon)', Y8))
      .toThrow(/インスタンス参照（値引数適用）は窓束縛のみ——cycle は台の点列を filter で書く/);
  });

  it('(b) ラベル付きテーブルへの値引数＝filter 正準形へ誘導', () => {
    expect(() => run(G + `
premise SK = Gregorian with {
  tz: "Asia/Tokyo"
  sekki2 = [2026-02-04, 2026-05-02] covering: 2026..2026 labels: [立春, 八十八夜]
}
premise KK { calendar-system: SK; tz: "Asia/Tokyo"; wkst: Mon }
@KK
sekki2(立春)
`, Y8)).toThrow(/インスタンス参照（値引数適用）は窓束縛のみ——テーブルは台の点列を filter で書く/);
  });

  it('(b) 点列束縛への値引数＝filter 正準形へ誘導', () => {
    expect(() => run(G + 'mon = everyDay |> filter(d => weekday(d) == Mon)\nmon(5)', Y8))
      .toThrow(/インスタンス参照（値引数適用）は窓束縛のみ——点列束縛は filter で書く/);
  });

  it('(c) 型域不一致——計算ラベル（label: 式）は最初の窓の値で検査', () => {
    expect(() => run(G + 'year("五月")', Y8))
      .toThrow(/値引数の型（string）がラベル値の型域（number）と不一致/);
  });

  it('(c) 型域不一致——labels: リテラルは値域から先に検査', () => {
    expect(() => run(LUNAR_2 + 'lunarW("一月")', { from: '2026-01-01', to: '2026-06-01' }))
      .toThrow(/値引数の型（string）がラベル値の型域（number）と不一致/);
  });

  it('(d) 細粒度・整列違いとの & は既存の整列検査が守る（ADR-36）', () => {
    expect(() => run(G + '([2026-01-05T09:00] covering: ..) & year(2026)', Y8))
      .toThrow(/結合子 &: 両辺の整列が同一でない/);
  });

  it('(e) 窓束縛へのストリーム引数（year(everyDay) 級）', () => {
    expect(() => run(G + 'year(everyDay)', Y8))
      .toThrow(/引数は点（射影）か値（インスタンス参照）——ストリーム等は置けない/);
  });

  it('(f) label: 付与式内の自束縛への値引数適用——逆像は射影を内包（ADR-34 改訂）', () => {
    expect(() => run(G + `
premise P2 = Gregorian with { fy = month span (_ => 12) phase: 3 label: (p => fy(1) in [1]) }
premise Q { calendar-system: P2; tz: "Asia/Tokyo"; wkst: Mon }
@Q
fy(1)
`, Y8)).toThrow(/値引数適用（インスタンス参照）を呼べない——逆像は射影を内包する/);
  });

  it('(g) labels: リテラル（静的に列挙できる値域）の域外＝静的エラー', () => {
    expect(() => run(LUNAR_2 + 'lunarW(3)', { from: '2026-01-01', to: '2026-06-01' }))
      .toThrow(/ラベル値域（labels: リテラル）の外/);
  });

  it('値式位置の W(v) は型エラー（ストリームは値式に混ざれない＝ADR-18 の型分離）', () => {
    expect(() => run(G + 'x = year(2020) + 1\nx', Y8)).toThrow(/数値ではない: stream/);
  });
});

describe('F96 回帰（shiftBoundary は base の label: を保存——Fiscal.year の同時付与と等価）', () => {
  it('shiftBoundary(+3) の year(2026) ＝ Fiscal の year(2026)（ラベルも切断も一致）', () => {
    const opts = { from: '2026-01-01', to: '2027-06-01' };
    const viaSB = evalDates('premise Fiscal2 = Gregorian |> shiftBoundary(+3, on: year, unit: month)\n'
      + 'premise F2 { calendar-system: Fiscal2; tz: "Asia/Tokyo"; wkst: Mon }\n@F2\nyear(2026)', opts);
    expect(viaSB).toEqual(days('2026-04-01', '2027-04-01'));
    expect(viaSB).toEqual(evalDates(F + 'year(2026)', opts));
  });
});
