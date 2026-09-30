// 境界チェックリスト（2026-09-29・design/60-reviews/2026-09-29-boundary-checklist.md）——「黙って通る形」10 件の witness。
// 敵対的レビューの代替として当方が境界値を列挙して実測し、統治外エラー（F116＝static-errors.test.ts）のほかに
// 黙って通る形が 10 件見つかった（設計者裁定「全部」）。各項は「止まること」と「正当な形は通ること」の対で固定する。
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import { run, evalDates, SupplyError } from '../src/index.ts';
import { cmdList, readInput, renderHuman } from '../src/cli.ts';
import type { CliLang } from '../src/cli.ts';

const JP = 'premise JP { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }\n@JP\n';
const W = { from: '2026-01-01', to: '2026-04-01' };

describe('境界チェックリスト: 黙って通る形は止まる（F117〜F126・1.0 追補 22）', () => {
  it('F117 評価範囲の逆順（to < from）は使い方エラー——from = to の空範囲は正当', () => {
    expect(() => run(JP + 'everyDay\n', { from: '2026-02-01', to: '2026-01-01' })).toThrow(/^評価範囲が逆順: to が from より前/);
    expect(run(JP + 'everyDay\n', { from: '2026-01-01', to: '2026-01-01' }).results[0].dates).toEqual([]);
  });

  it('F118 tz: "" は静的エラー（premise の宣言・軽量形の後置とも。旧: 未宣言と同じ扱いで黙って機械 tz）', () => {
    expect(() => run('premise E { calendar-system: Gregorian; tz: ""; wkst: Mon }\n@E\neveryDay\n', W)).toThrow(/^tz: は空にできない（premise E/);
    expect(() => run(JP.replace('@JP\n', '@JP tz: ""\n') + 'everyDay\n', W)).toThrow(/^tz: は空にできない（@JP/);
  });

  it('F119 先頭の BOM（U+FEFF）は読み飛ばす——CRLF も従来どおり可（旧: 字句エラー「不明な文字」）', () => {
    expect(run('﻿' + JP + 'everyDay\n', { from: '2026-01-01', to: '2026-01-03' }).results[0].dates).toEqual(['2026-01-01', '2026-01-02']);
    expect(run(JP.replace(/\n/g, '\r\n') + 'everyDay\r\n', { from: '2026-01-01', to: '2026-01-03' }).results[0].dates).toEqual(['2026-01-01', '2026-01-02']);
  });

  it('F120 nth(0)・nth(-1)・nth(1.5) は静的エラー——要素が足りない窓の空（nth(32)）は正当のまま', () => {
    for (const n of ['0', '-1', '1.5']) {
      expect(() => run(JP + `everyDay |> within(month) |> nth(${n})\n`, W)).toThrow(/^nth: n は 1 以上の整数（/);
    }
    expect(evalDates(JP + 'everyDay |> within(month) |> nth(32)\n', W)).toEqual([]);
    expect(evalDates(JP + 'everyDay |> within(month) |> nth(31)\n', W)).toEqual(['2026-01-31', '2026-03-31']);
  });

  it('F121 年 5 桁は字句エラー（旧: 先頭 4 桁が日付と読まれて別のエラーへ誤誘導）——年 0000 は 4 桁として受理', () => {
    expect(() => run(JP + 'x = [10000-01-01] covering: 2026..2026\nx\n', W)).toThrow(/^字句エラー\(\d+:\d+\): 年は 4 桁（0000\.\.9999）: 10000-01-01/);
    expect(() => run(JP + 'x = [0000-01-01] covering: 0000..0000\nx\n', W)).not.toThrow();
  });

  it('F122 同一ブロック内の前文メンバー二重宣言は静的エラー——派生 with の上書きと軽量形の後置は正当', () => {
    expect(() => run('premise A { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; wkst: Sun }\n@A\neveryDay\n', W))
      .toThrow(/^前文メンバーの二重宣言: wkst:（premise A/);
    expect(() => run(JP.replace('@JP\n', '@JP wkst: Sun wkst: Mon\n') + 'everyDay\n', W)).toThrow(/^前文メンバーの二重宣言: wkst:（@JP/);
    expect(() => run(JP + 'premise B = JP with { wkst: Sun }\n@B\neveryDay |> within(week) |> nth(1)\n', W)).not.toThrow();
    expect(() => run(JP.replace('@JP\n', '@JP wkst: Sun\n') + 'everyDay |> within(week) |> nth(1)\n', W)).not.toThrow();
  });

  it('F123 同じプログラム内の premise 同名再定義は静的エラー（旧: 後勝ちで黙る）', () => {
    expect(() => run(JP + 'premise JP { calendar-system: Gregorian; tz: "UTC"; wkst: Mon }\n@JP\neveryDay\n', W))
      .toThrow(/^premise の再定義は静的エラー: JP（/);
  });

  it('F124 異なる型の等値比較はエラー（旧: 黙って偽）——ラベルの識別子形と文字列形の等値（§5.5）は保たれる', () => {
    expect(() => run(JP + 'everyDay |> filter(d => "a" == 1)\n', W)).toThrow(/^等値比較の両辺の型が異なる: 文字列（ラベル） と 数値/);
    expect(() => run(JP + 'everyDay |> filter(d => dayNo(d) == "1")\n', W)).toThrow(/^等値比較の両辺の型が異なる: 数値 と 文字列（ラベル）/);
    expect(() => run(JP + 'everyDay |> filter(d => dayNo(d) != "1")\n', W)).toThrow(/等値比較の両辺の型が異なる/);
    expect(evalDates(JP + 'everyDay |> filter(d => weekday(d) == "Mon")\n', { from: '2026-01-01', to: '2026-01-20' }))
      .toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
  });

  it('F125 0 除算・mod 0・div 0 はエラー（旧: NaN で黙って偽）', () => {
    expect(() => run(JP + 'everyDay |> filter(d => dayNo(d) / 0 == 1)\n', W)).toThrow(/^0 で割れない（\/ の右辺は 0 以外/);
    expect(() => run(JP + 'everyDay |> filter(d => dayNo(d) mod 0 == 1)\n', W)).toThrow(/^0 で割れない（mod の右辺は 0 以外/);
    expect(() => run(JP + 'everyDay |> filter(d => dayNo(d) div 0 == 1)\n', W)).toThrow(/^0 で割れない（div の右辺は 0 以外/);
    expect(evalDates(JP + 'everyDay |> filter(d => dayNo(d) mod 10 == 0)\n', { from: '2026-01-01', to: '2026-02-01' })).toEqual(['2026-01-10', '2026-01-20', '2026-01-30']);
  });

  it('F126 CLI list は本体式の無いファイル（空・premise だけ）を使い方エラーに（旧: exit 0 の空出力）', () => {
    const o = { from: '2026-01-01', to: '2026-02-01' } as any;
    expect(() => cmdList('', o)).toThrow(/^本体式がない（評価する式を 1 行以上書く/);
    expect(() => cmdList('premise JP { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }\n', o)).toThrow(/^本体式がない/);
    expect(cmdList(JP + 'everyDay\n', o).results[0].dates.length).toBe(31);
  });
});

// 二巡目（2026-09-30）——一巡目で覆っていなかった層（premise 層の生成語・派生・ラムダ・構文の深さ）
describe('境界チェックリスト 二巡目: 統治外エラーと黙って通る形（F127〜F135）', () => {
  const U = (defs: string) => `premise U { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon\n  ${defs}\n}\n@U\n`;
  const Y = { from: '2025-01-01', to: '2027-01-01' };

  it('F127 span の個数は 1 以上の整数（1.5 は統治外 TypeError だった）', () => {
    expect(() => run(U('m = day span (_ => 1.5)') + 'm\n', W)).toThrow(/^span: 個数は 1 以上の整数（1\.5 は不可）/);
    expect(() => run(U('m = day span (_ => 0)') + 'm\n', W)).toThrow(/^span: 個数は 1 以上の整数（0 は不可）/);
  });
  it('F128 split の各幅は 1 以上の整数（0・負は統治外 TypeError だった）', () => {
    expect(() => run(U('q = year split (_ => [0, 12]) by: month') + 'q\n', W)).toThrow(/^split: 幅は 1 以上の整数（0 は不可）/);
    expect(() => run(U('q = year split (_ => [-1, 13]) by: month') + 'q\n', W)).toThrow(/^split: 幅は 1 以上の整数（-1 は不可）/);
    expect(() => run(U('q = year split (_ => [3, 3, 3, 3]) by: month') + 'everyDay |> within(q) |> first\n', Y)).not.toThrow();
  });
  it('F129 phase と rephase の δ は整数（1.5 は統治外 TypeError だった）', () => {
    expect(() => run(U('y = month span (_ => 12) phase: 1.5') + 'everyDay |> within(y) |> first\n', Y)).toThrow(/^span: phase は 0 以上の整数（1\.5 は不可/);
    expect(() => run('premise F = Gregorian |> rephase(+1.5, on: year, unit: month)\npremise FY { calendar-system: F; tz: "Asia/Tokyo"; wkst: Mon }\n@FY\neveryDay\n', Y)).toThrow(/^rephase: δ は整数（1\.5 は不可/);
    expect(() => run('premise F = Gregorian |> rephase(+3, on: year, unit: month)\npremise FY { calendar-system: F; tz: "Asia/Tokyo"; wkst: Mon }\n@FY\neveryDay\n', Y)).not.toThrow();
  });
  it('F130 grid の 0 幅は静的エラー（旧: 実体化が前進せず停止しない＝strideBy の F112 と同型）', () => {
    expect(() => run(U('x = chronos grid 0d') + 'x\n', W)).toThrow(/^grid: 幅は正の量（0 幅は前進しない＝無限ループ/);
    expect(() => run(U('x = chronos grid 0h') + 'x\n', W)).toThrow(/^grid: 幅は正の量/);
    expect(run(U('x = chronos grid 1d anchor: 2026-01-01') + 'x\n', { from: '2026-01-01', to: '2026-01-04' }).results[0].dates.length).toBe(3);
  });
  it('F131 式の入れ子は 200 段まで（括弧 1000 段は構文解析のスタック溢れ＝統治外だった）', () => {
    const deep = (n: number) => JP + 'everyDay |> filter(d => ' + '('.repeat(n) + 'dayNo(d) == 1' + ')'.repeat(n) + ')\n';
    expect(() => run(deep(1000), W)).toThrow(/^構文エラー\(\d+:\d+\): 式の入れ子が深すぎる（上限 200 段/);
    expect(() => run(deep(50), W)).not.toThrow();
  });
  it('F132 ラムダの引数の個数が違えばエラー（旧: undefined が黙って束縛される）', () => {
    expect(() => run(JP + 'everyDay |> filter((a, b) => a == b)\n', W)).toThrow(/^引数の個数が違う: \(無名ラムダ\) は仮引数 2 個（1 個渡された）/);
    expect(() => run(JP + 'f = a => a\neveryDay |> filter(d => f() == 2)\n', W)).toThrow(/^引数の個数が違う: f は仮引数 1 個（0 個渡された）/);
    expect(() => run(JP + 'f = a => a\neveryDay |> filter(d => f(dayNo(d), 9) == 2)\n', W)).toThrow(/^引数の個数が違う: f は仮引数 1 個（2 個渡された）/);
  });
  it('F133 射影（stdlib の束縛）の余分な引数もエラー（旧: dayNo(d, d) は黙って無視・dayNo() は「時点ではない: undefined」）', () => {
    expect(() => run(JP + 'everyDay |> filter(d => dayNo(d, d) == 2)\n', W)).toThrow(/^引数の個数が違う: dayNo は仮引数 1 個（2 個渡された）/);
    expect(() => run(JP + 'everyDay |> filter(d => dayNo() == 2)\n', W)).toThrow(/^引数の個数が違う: dayNo は仮引数 1 個（0 個渡された）/);
  });
  it('F134 束縛の再定義は静的エラー（トップ束縛・premise 内とも。旧: 後勝ちで黙る）', () => {
    expect(() => run(JP + 'x = everyDay\nx = everyDay\nx\n', W)).toThrow(/^束縛の再定義は静的エラー: x（/);
    expect(() => run(U('a = everyDay\n  a = everyDay') + 'a\n', W)).toThrow(/^premise U の束縛の再定義は静的エラー: a（/);
    expect(() => run(JP + 'premise B = JP with { monthEnd = everyDay |> within(month) |> last }\n@B\nmonthEnd\n', W)).not.toThrow();
  });
  it('F135 cycle の空ラベル列は静的エラー（旧: 黙って通り、射影が undefined を返す）', () => {
    // premise の束縛は参照されるまで評価されない（遅延）ので本体で c を読む
    expect(() => run(U('c = day cycle [] anchor: 2026-01-01') + 'everyDay |> filter(d => c(d) == c(d))\n', W)).toThrow(/^cycle: ラベル列が空（/);
    expect(() => run(U('c = day cycle [A, A, B] anchor: 2026-01-01') + 'everyDay |> filter(d => c(d) == B)\n', W)).not.toThrow();   // 重複ラベルは正当（4 勤 4 休など）
  });
});

// 三巡目（2026-09-30）——Kyureki（テーブル版・供給版）・供給の契約と資源・細粒度の幅と字面・CLI の入力ファイル・
// Playground の UI 層・--json の形。実測録は design/60-reviews/2026-09-29-boundary-checklist.md の三巡目節
describe('境界チェックリスト 三巡目: 統治外エラー・偽エラー・黙って通る形（F136〜F146）', () => {
  const U = (defs: string) => `premise U { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon\n  ${defs}\n}\n@U\n`;
  const H = (decl = 'kind: dates', body = 'h') =>
    `premise H { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "x"\n  h = external(${decl})\n}\n@H\n${body}\n`;
  const M = { from: '2026-01-01', to: '2026-02-01' };
  const sup = (data: unknown) => ({ ...M, resolve: (() => data) as any });
  const OK = { dates: ['2026-01-05'], covering: '2026..2026', asof: '2026-01-01' };
  // 旧暦（stdlib/kyureki.md §1 と同じ朔 38 件・月番号 38 件）
  const KY = (nos = '12, 1, 2, 3, 4, 5, 6, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12') => `premise Kyureki = Gregorian with {
  source: "eco.mtk.nao.ac.jp/koyomi/yoko"
  asof:   2026-02-02
  tz:     "Asia/Tokyo"
  newMoons = [2024-12-31T07:27,
              2025-01-29T21:36, 2025-02-28T09:45, 2025-03-29T19:58, 2025-04-28T04:31, 2025-05-27T12:02,
              2025-06-25T19:32, 2025-07-25T04:11, 2025-08-23T15:07, 2025-09-22T04:54, 2025-10-21T21:25,
              2025-11-20T15:47, 2025-12-20T10:43, 2026-01-19T04:52, 2026-02-17T21:01, 2026-03-19T10:23,
              2026-04-17T20:52, 2026-05-17T05:01, 2026-06-15T11:54, 2026-07-14T18:44, 2026-08-13T02:37,
              2026-09-11T12:27, 2026-10-11T00:50, 2026-11-09T16:02, 2026-12-09T09:52, 2027-01-08T05:24,
              2027-02-07T00:56, 2027-03-08T18:29, 2027-04-07T08:51, 2027-05-06T19:59, 2027-06-05T04:40,
              2027-07-04T12:02, 2027-08-02T19:05, 2027-09-01T02:41, 2027-09-30T11:36, 2027-10-29T22:37,
              2027-11-28T12:24, 2027-12-28T05:12] covering: 2024-12-31..2027-12-31
  lunarStart = newMoons |> snapTo(day)
  monthNos   = [${nos}]
  lunarMonth = day |> segmentBy(lunarStart, edges: drop, empties: error, labels: monthNos)
  lunarDayNo = d => ordinalIn(day, lunarMonth, d)
  rokuyoNo   = d => (lunarMonth(d) + lunarDayNo(d)) mod 6
}
premise Koyomi { calendar-system: Kyureki; tz: "Asia/Tokyo"; wkst: Mon }
@Koyomi
`;
  const IMPL = fileURLToPath(new URL('..', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'kairos-boundary3-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const put = (name: string, data: string | Buffer) => { const f = join(dir, name); writeFileSync(f, data); return f; };
  const cli = (...args: string[]) => spawnSync(process.execPath, ['src/cli.ts', ...args], { cwd: IMPL, encoding: 'utf8' });
  const RANGE = ['--from', '2026-01-01', '--to', '2026-02-01', '--tz', 'Asia/Tokyo'];

  it('F136 covering の区間リストは個数で落ちない（旧: 13 万個で Math.max のスプレッドが RangeError＝統治外）', () => {
    const cov = Array.from({ length: 130000 }, (_, i) => {
      const a = new Date(Date.UTC(2026, 0, 1 + i * 2)).toISOString().slice(0, 10); return `${a}..${a}`;
    }).join(', ');
    const r = run(H(), { from: '2026-01-01', to: '2026-01-03', resolve: () => ({ dates: ['2026-01-01'], covering: cov, asof: '2026-01-01' }) });
    expect(r.results[0].dates).toEqual(['2026-01-01']);
    expect(r.coverage[0].runwayDays).toBe(2 * 129999 + 1 - 2);   // 最後の区間の翌日 − 評価 to
  });

  it('F137 配列に入らない点数の実体化は診断つきで止まる（旧: 1 ms 幅で RangeError: Invalid array length＝統治外）', () => {
    expect(() => run(JP + 'everyInstant |> strideBy(0.001s, from: 2026-01-01)\n', M)).toThrow(/^strideBy: 点が多すぎて実体化できない（.*約 37,238,400,000 個/);
    expect(() => run(U('x = chronos grid 0.001s') + 'x\n', M)).toThrow(/^grid: 点が多すぎて実体化できない/);
    expect(evalDates(JP + 'everyInstant |> strideBy(12h, from: 2026-01-01)\n', { from: '2026-01-01', to: '2026-01-02' })).toEqual(['2026-01-01', '2026-01-01T12:00']);
  });

  it('F138 市民日の幅は整数（旧: 1.5d は黙って 3 日ごと・0.5d は 1 日ごと——添字が非整数で点が欠落）', () => {
    for (const w of ['1.5d', '0.5d']) {
      expect(() => run(JP + `everyInstant |> strideBy(${w}, from: 2026-01-01)\n`, M)).toThrow(/^字句エラー\(\d+:\d+\): 市民日の幅は整数: \d\.5d（/);
      expect(() => run(U(`x = chronos grid ${w}`) + 'x\n', M)).toThrow(/市民日の幅は整数/);
    }
    expect(evalDates(JP + 'everyInstant |> strideBy(2d, from: 2026-01-01)\n', { from: '2026-01-01', to: '2026-01-07' })).toEqual(['2026-01-01', '2026-01-03', '2026-01-05']);
    expect(evalDates(JP + 'everyInstant |> strideBy(2.0d, from: 2026-01-01)\n', { from: '2026-01-01', to: '2026-01-04' })).toEqual(['2026-01-01', '2026-01-03']);
  });

  it('F139 ms 未満の幅・秒の小数 4 桁以上は字句エラー（旧: 点が非整数の epoch ms になる・字面は黙って丸め）', () => {
    expect(() => run(JP + 'everyInstant |> strideBy(0.0004s, from: 2026-01-01)\n', M)).toThrow(/^字句エラー\(\d+:\d+\): 幅は 1 ms の整数倍: 0\.0004s（/);
    expect(() => run(JP + 'everyInstant |> strideBy(24h39m35.2444s, from: 2026-01-01)\n', M)).toThrow(/幅は 1 ms の整数倍: 24h39m35\.2444s/);
    expect(() => run(JP + '[2026-01-01T00:00:00.0004]\n', M)).toThrow(/^字句エラー\(\d+:\d+\): 秒の小数は 3 桁まで: 2026-01-01T00:00:00\.0004（/);
    expect(() => run(JP + 'everyDay |> at(T09:00:00.0004)\n', M)).toThrow(/秒の小数は 3 桁まで: T09:00:00\.0004/);
    // 正当な形: 火星の 1 sol（spec §5.5 の例）は整数 ms で正確・十進の塵を作らない・末尾の 0 は可
    const sol = run(JP + 'everyInstant |> strideBy(24h39m35.244s, from: 2026-01-01)\n', { from: '2026-01-01', to: '2026-01-05' }).results[0].points;
    expect(sol[1] - sol[0]).toBe(88_775_244);
    expect(sol.every(Number.isInteger)).toBe(true);
    const h = run(JP + 'everyInstant |> strideBy(1.1h, from: 2026-01-01)\n', { from: '2026-01-01', to: '2026-01-02' }).results[0].points;
    expect(h[1] - h[0]).toBe(3_960_000);
    expect(run(JP + '[2026-01-01T00:00:00.5000]\n', M).results[0].points[0] % 1000).toBe(500);
    expect(run(JP + 'everyDay |> at(T09:00:00.25)\n', { from: '2026-01-01', to: '2026-01-02' }).results[0].points[0] % 1000).toBe(250);
  });

  it('F140 時刻として表せない instants は契約違反（旧: 黙って通り、診断の日付が NaN-NaN-NaN）——1970 より前は従来どおり可', () => {
    for (const v of [8.64e15 + 1, 1e17, -1e17]) {
      expect(() => run(H('kind: instants'), sup({ instants: [v], covering: '2026..2026', asof: 'x' })))
        .toThrow(/^契約違反: instants が時刻の表現範囲の外——external H\.h: /);
    }
    expect(run(H('kind: instants'), sup({ instants: [-1], covering: '..', asof: 'x' })).results[0].dates).toEqual([]);
  });

  it('F141 covering の年は 4 桁（旧: 10000 以上が黙って通る・275760 超は端が NaN で別のエラーへ誤誘導）', () => {
    expect(() => run(JP + 'h = [2026-01-05] covering: 2026..10000\nh\n', M)).toThrow(/^covering: 年は 4 桁の整数（0000\.\.9999）: 10000$/);
    expect(() => run(JP + 'h = [2026-01-05] covering: 2026..300000\nh\n', M)).toThrow(/^covering: 年は 4 桁の整数/);
    expect(() => run(H(), sup({ ...OK, covering: '10000..10001' }))).toThrow(/^契約違反: covering: 年は 4 桁の整数（0000\.\.9999）: 10000——external H\.h$/);
    expect(() => run(H(), sup({ ...OK, covering: '2026..2025' }))).toThrow(/^契約違反: covering: 区間の端が逆順——external H\.h$/);   // 出自を添える
    expect(evalDates(JP + 'h = [2026-01-05] covering: 2026..9999\nh\n', M)).toEqual(['2026-01-05']);
    expect(() => run(JP + 'h = [0000-01-01] covering: 0000..0000\nh\n', M)).not.toThrow();
  });

  it('F142 CLI の入力ファイル: BOM 付き JSON は読める・UTF-16 は保存し直しを案内・読めないファイルは引数名つき', () => {
    const okJson = JSON.stringify({ h: OK });
    const def = put('h.kairos', H());
    const u16 = (s: string) => Buffer.from('﻿' + s, 'utf16le');
    const bom = cli('list', ...RANGE, '--supply', put('bom.json', '﻿' + okJson), def);
    expect(bom.status).toBe(0);
    expect(bom.stdout.split('\n')[0]).toBe('2026-01-05');
    const s16 = cli('list', ...RANGE, '--supply', put('u16.json', u16(okJson)), def);
    expect(s16.status).toBe(1);
    expect(s16.stderr).toMatch(/^--supply のファイルが UTF-16 で保存されている: .*u16\.json——UTF-8 で保存し直す/);
    const d16 = cli('list', ...RANGE, put('u16.kairos', u16(JP + 'everyDay\n')));
    expect(d16.status).toBe(1);
    expect(d16.stderr).toMatch(/^定義ファイルが UTF-16 で保存されている: /);
    const none = cli('list', ...RANGE, '--supply', join(dir, 'nope.json'), def);
    expect(none.status).toBe(1);
    expect(none.stderr).toMatch(/^--supply のファイルが読めない: .*nope\.json（ENOENT/);
    expect(readInput(put('plain.kairos', 'abc'), '定義ファイル')).toBe('abc');
  });

  it('F143 解決子の戻り値: Promise・非オブジェクトは供給エラーで名指し（旧: 「covering がない」へ誤誘導）・Error でない throw も文言に出る', () => {
    const asyncResolver = (async () => OK) as any;
    expect(() => run(H(), { ...M, resolve: asyncResolver })).toThrow(/^供給エラー: 解決子が Promise を返した——external H\.h/);
    expect(() => run(H(), { ...M, resolve: asyncResolver })).toThrow(SupplyError);
    for (const v of ['ok', [OK], 5]) expect(() => run(H(), sup(v))).toThrow(/^供給エラー: 解決値がオブジェクトでない——external H\.h/);
    expect(() => run(H(), { ...M, resolve: () => { throw 'boom'; } })).toThrow(/^供給エラー: 解決に失敗——external H\.h（source: "x"）: boom$/);
    expect(evalDates(H(), sup(OK))).toEqual(['2026-01-05']);
  });

  it('F144 旧暦を狭い窓で評価できる（旧: 朔が to+400 日で切られ「ラベル列の長さ ≠ 窓数」の偽エラー）——検査は狭い窓でも正確なまま', () => {
    const oct = run(KY() + 'everyDay |> filter(d => rokuyoNo(d) == 0)\n', { from: '2026-10-01', to: '2026-11-01' });
    expect(oct.results[0].dates).toEqual(['2026-10-02', '2026-10-08', '2026-10-13', '2026-10-19', '2026-10-25', '2026-10-31']);   // stdlib/kyureki.md §6 の大安と同じ
    expect(oct.warnings).toEqual([]);   // 朔は落ちていない＝horizon-clip なし
    expect(evalDates(KY() + 'lunarMonth |> first |> filter(d => lunarMonth(d) == 1)\n', { from: '2025-01-01', to: '2025-03-01' })).toEqual(['2025-01-29']);
    // 覆域より 400 日以上前は 0 点＋範囲外註釈（旧: 「segmentBy: マーカーが空」）
    const before = run(KY() + 'lunarMonth |> first\n', { from: '2020-01-01', to: '2021-01-01' });
    expect(before.results[0].dates).toEqual([]);
    expect(before.results[0].annotations).toEqual([expect.objectContaining({ from: '2020-01-01', to: '2021-01-01', source: 'Kyureki.newMoons' })]);
    // ラベルの過不足は狭い窓でも同じ数字で止まる（評価範囲非依存＝spec §4.2）
    const short = '12, 1, 2, 3, 4, 5, 6, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11';
    for (const w of [{ from: '2025-01-01', to: '2025-03-01' }, { from: '2025-01-01', to: '2027-03-01' }]) {
      expect(() => run(KY(short) + 'lunarMonth |> first\n', w)).toThrow(/^segmentBy\(labels:\): ラベル列の長さ 37 ≠ 窓数 38/);
    }
  });

  it('F145 empties: error は実体化範囲に収まる窓だけを判定する（旧: 計算範囲の先・1970 年より前の窓が「空窓がある」の偽エラー）', () => {
    const TERM = 'starts = [2026-04-01, 2026-10-01, 2027-04-01, 2027-10-01, 2028-04-01, 2028-10-01, 2029-04-01] covering: 2026-04-01..2029-09-30\n'
      + '  term = day |> segmentBy(starts, edges: drop, empties: error, labels: [1, 2, 3, 4, 5, 6, 7])';
    expect(evalDates(U(TERM) + 'everyDay |> filter(d => term(d) == 1) |> take(2, from: 2026-05-01)\n', { from: '2026-05-01', to: '2026-06-01' }))
      .toEqual(['2026-05-01', '2026-05-02']);
    const ERA = 'eras = [1868-10-23, 1912-07-30, 1926-12-25, 1989-01-08, 2019-05-01] covering: 1868-10-23..\n'
      + '  era = day |> segmentBy(eras, edges: drop, empties: error, labels: [明治, 大正, 昭和, 平成, 令和])';
    expect(evalDates(U(ERA) + 'era |> first |> filter(d => era(d) == 令和)\n', { from: '2019-01-01', to: '2020-01-01' })).toEqual(['2019-05-01']);
    expect(evalDates(U(ERA) + 'everyDay |> filter(d => era(d) == 平成)\n', { from: '2019-04-29', to: '2019-05-03' })).toEqual(['2019-04-29', '2019-04-30']);
    // 実体化範囲の内側の空窓は従来どおり止まる（データ破損の検出器）
    expect(() => run(U('m = [2026-01-10T09:00, 2026-01-10T15:00, 2026-02-10] covering: 2026..2026\n  w = day |> segmentBy(m, edges: drop, empties: error)') + 'w |> first\n', W))
      .toThrow(/^segmentBy\(empties: error\): 空窓がある/);
  });

  it('F146 Playground の「URL に固定」は大きな定義でも落ちない（旧: 130 KB 前後で fromCharCode のスプレッドが RangeError）', () => {
    // core.js はブラウザ用（DOM 前提）なので、b64e の定義だけを取り出して実行する
    const core = readFileSync(new URL('../../playground/core.js', import.meta.url), 'utf8');
    const m = /const b64e = (s => \{[\s\S]*?\n  \});/.exec(core);
    expect(m).not.toBeNull();
    const b64e = new Function(`return (${m![1]});`)() as (s: string) => string;
    const big = '# ' + 'x'.repeat(300 * 1024) + '\n給料日 💴\n';
    expect(b64e(big)).toBe(Buffer.from(big, 'utf8').toString('base64url'));
    expect(b64e('a')).toBe('YQ');
  });

  it('Playground の表示は CLI の list と行単位で同じ（教材の期待出力は CLI の出力・学習者は Playground で確かめる——0 点の行も同じ）', async () => {
    // core.js はブラウザ用——DOM の代役（値と click ハンドラだけ）で init() を駆動する
    const mk = (value = '') => ({ value, textContent: '', h: {} as Record<string, (e?: unknown) => void>,
      addEventListener(t: string, f: (e?: unknown) => void) { this.h[t] = f; }, dispatchEvent() { /* 起動時のプリセット読込は不要 */ } });
    const els: Record<string, ReturnType<typeof mk>> = Object.fromEntries(
      ['pg-src', 'pg-out', 'pg-from', 'pg-to', 'pg-tz', 'pg-example', 'pg-run', 'pg-share'].map(id => [id, mk()]));
    const g = globalThis as Record<string, unknown>;
    const saved = { document: g.document, location: g.location };
    g.document = { getElementById: (id: string) => els[id] };
    g.location = { hash: '', href: '' };
    try {
      const { init } = await import(new URL('../../playground/core.js', import.meta.url).href) as { init: (lang: string) => void };
      const A = 'h = [2026-01-12] covering: 2026..2026\n';
      const cases: [string, string, string][] = [
        [JP + 'everyDay |> within(month) |> first\n', '2026-01-01', '2026-04-01'],                       // 点あり
        [JP + 'everyDay |> within(month) |> nth(31)\n', '2026-02-01', '2026-03-01'],                     // 0 点・註釈なし
        [JP + A + 'h\n', '2027-01-01', '2027-02-01'],                                                    // 0 点＋註釈＋被覆サマリ
        [JP + A + 'everyDay \\ h\n', '2026-12-30', '2027-01-03'],                                       // 点＋註釈
        [JP + 'everyDay |> within(month) |> first\neveryDay |> within(month) |> nth(31)\n', '2026-02-01', '2026-03-01'],   // 2 式（片方 0 点）
        [JP + 'everyDay |> within(month) |> last |> shift(+1, unit: day)\n', '2026-01-01', '2026-02-01'], // 警告つき
      ];
      for (const lang of ['ja', 'en'] as CliLang[]) {
        init(lang);
        for (const [src, from, to] of cases) {
          els['pg-src'].value = src; els['pg-from'].value = from; els['pg-to'].value = to; els['pg-tz'].value = 'Asia/Tokyo';
          els['pg-run'].h.click();
          const rep = cmdList(src, { from, to, tz: 'Asia/Tokyo' });
          const warn = (w: string) => (lang === 'ja' ? `警告: ${w}` : `warning: ${w}`);
          expect(els['pg-out'].textContent).toBe([...renderHuman(rep, lang), ...rep.warnings.map(warn)].join('\n'));
        }
      }
    } finally { g.document = saved.document; g.location = saved.location; }
  });

  it('文言（軽微 11・12・15・16）: 原因を指す', () => {
    expect(() => run('premise A { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Xyz }\n@A\neveryDay |> within(week) |> first\n', W))
      .toThrow(/^未解決の名前: Xyz（premise 相対解決 §3\.4）——前文メンバー wkst: の値が解決できない/);
    expect(() => run('premise A { tz: "Asia/Tokyo"; wkst: Mon }\n@A\neveryDay |> within(month) |> first\n', W))
      .toThrow(/^未解決の名前: day（premise 相対解決 §3\.4）——在圏の前文に calendar-system: の宣言が無い/);
    expect(() => run('premise A { calendar-system: Nonsense; tz: "Asia/Tokyo"; wkst: Mon }\n@A\neveryDay |> within(month) |> first\n', W))
      .toThrow(/——calendar-system: Nonsense という premise は無い/);
    expect(() => run(JP + 'evryDay |> within(month) |> first\n', W)).toThrow(/^未解決の名前: evryDay（premise 相対解決 §3\.4）$/);   // 綴り違いは従来の文言のまま
    expect(run(JP + 'everyDay |> filter(d => dayNo(d) == 32) |> takeLast(3, until: 2026-03-01)\n', W).warnings).toEqual([]);   // 空入力は地平線の話ではない
    expect(run(JP + 'everyDay |> filter(d => monthNo(d) == 2 and dayNo(d) == 29) |> takeLast(20, until: 2026-03-01)\n', W).warnings[0])
      .toMatch(/^horizon-clip: takeLast .*n=20 個中 14 個のみ/);   // 実体化下限で切れた不足は従来どおり警告
    expect(() => run(JP + 'everyInstant |> strideBy(-1s, from: 2026-01-01)\n', W)).toThrow(/^幅は正の量（負の幅は書けない/);
  });

  it('文言: 見えない文字・紛らわしい文字は符号位置と直し方つき・診断の長さは上限で切る', () => {
    expect(() => run(JP + 'everyDay |> within(month) |> first\n', W)).toThrow(/^字句エラー\(3:9\): 不明な文字: U\+00A0（ノーブレークスペース——通常の空白に直す/);
    expect(() => run(JP + 'everyDay　|> within(month) |> first\n', W)).toThrow(/不明な文字: U\+3000（全角スペース——半角の空白に直す）/);
    expect(() => run('premise Q { calendar-system: Gregorian; tz: “Asia/Tokyo”; wkst: Mon }\n@Q\neveryDay\n', W))
      .toThrow(/不明な文字: "“"（U\+201C）（引用符は半角の " を使う/);
    expect(() => run(JP + 'everyDay $\n', W)).toThrow(/不明な文字: "\$"$/);   // ASCII は従来の形
    let msg = '';
    try { run(H(), sup({ ...OK, dates: ['x'.repeat(1_000_000)] })); } catch (e) { msg = (e as Error).message; }
    expect(msg).toMatch(/^契約違反: 日付の形式が不正——external H\.h: x+…（以下略・全 1000\d{3} 字）$/);
    expect(msg.length).toBeLessThan(2100);
  });

  it('CLI の使い方（軽微 13・14）: 引数の誤りは日本語で・サブコマンド省略はフラグ先頭でも list・--help は終了 0', () => {
    const jp = put('jp.kairos', JP + 'everyDay\n');
    const unk = cli('list', '--bogus', jp);
    expect(unk.status).toBe(1);
    expect(unk.stderr).toMatch(/^未知のオプション: --bogus\n使い方/);
    const neg = cli('next', '-n', '-1', jp);
    expect(neg.status).toBe(1);
    expect(neg.stderr).toMatch(/^オプション -n の値が無いか、- で始まっている/);
    const en = cli('list', '--bogus', '--lang', 'en', jp);
    expect(en.stderr).toMatch(/^Unknown option '--bogus'/);
    const flagsFirst = cli('--from', '2026-01-01', '--to', '2026-01-03', '--tz', 'Asia/Tokyo', jp);
    expect(flagsFirst.status).toBe(0);
    expect(flagsFirst.stdout).toBe('2026-01-01\n2026-01-02\n');
    const help = cli('--help');
    expect(help.status).toBe(0);
    expect(help.stdout).toMatch(/^使い方/);
    expect(help.stderr).toBe('');
  });
});
