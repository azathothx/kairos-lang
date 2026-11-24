// 組み込みの口（1.1.1・2026-11-06・言語不変）: 参照実装を評価器として組み込む利用側のための出口 4 つ（90-open 3-25）。
// (1) stdlib は生成モジュール（配布物に node:fs 無し）・STDLIB_SOURCE の export（読むため＝差し替えの口ではない）
// (2) results[].grain＝最後の段の整列タグ（静的主張・null は「主張なし」）
// (3) CoverageEntry の始端・終端（ms と表示形）・external の宣言値域
// (4) RunOptions.limits＝実体化の上限を既定より下げる口（上げられない・非整数は使い方の誤り）
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { run, evalDates, STDLIB_SOURCE, DEFAULT_LIMITS, KairosError } from '../src/index.ts';
import type { ExternalResolver, ExternalData } from '../src/index.ts';
import { cmdList } from '../src/cli.ts';

const root = new URL('../../', import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, root), 'utf8');
const H = 3_600_000;
const jst = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) - 9 * H;   // Asia/Tokyo の市民日開始

const JP = `premise JPX { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }\n@JPX\n`;
const R = { from: '2026-01-01', to: '2026-02-01' };

describe('(1) stdlib は生成モジュール——配布物の import に node:fs が要らない', () => {
  const STDLIB_FILES = ['gregorian.kairos', 'fiscal.kairos', 'isoweek.kairos'];   // 依存順（生成器と同じ）
  const expected = STDLIB_FILES.map(f => read(`impl/stdlib/${f}`)).join('\n');

  it('STDLIB_SOURCE は stdlib/*.kairos を依存順に連結したもの（export は読むため）', () => {
    expect(STDLIB_SOURCE).toBe(expected);
    expect(STDLIB_SOURCE.length).toBeGreaterThan(1000);
  });

  it('commit された src/stdlib-data.ts は鮮度が保たれている（*.kairos を直したら npm run gen）', () => {
    expect(read('impl/src/stdlib-data.ts')).toContain(`export const STDLIB_SOURCE: string = ${JSON.stringify(expected)};`);
  });

  it('src の Node 依存は cli.ts の利用者ファイル読みだけ（index.ts と評価器は fs の無い環境でも import できる）', () => {
    const files = readdirSync(new URL('impl/src/', root)).filter(f => f.endsWith('.ts'));
    const withNode = files.filter(f => /from 'node:/.test(read(`impl/src/${f}`)));
    expect(withNode).toEqual(['cli.ts']);
    expect(read('impl/src/index.ts')).not.toMatch(/readFileSync|import\.meta\.url/);
  });

  it('標準 premise は生成モジュール経由でも評価できる', () => {
    expect(evalDates(JP + 'everyDay |> within(month) |> first\n', R)).toEqual(['2026-01-01']);
    expect(evalDates('@Fiscal tz: "Asia/Tokyo"\neveryDay |> within(quarter) |> first\n', { from: '2026-04-01', to: '2026-07-01' })).toEqual(['2026-04-01']);
  });
});

describe('(2) results[].grain——最後の段の整列タグ', () => {
  it('everyDay は市民日の目盛り（step 1・off 0・tz）', () => {
    expect(run(JP + 'everyDay\n', R).results[0].grain)
      .toEqual({ kind: 'civil', step: 1, phase: 0, off: 0, tz: 'Asia/Tokyo' });
  });

  it('日付リテラルのテーブルは市民日・時刻付きのテーブルは null（主張なし＝時刻の点の意味ではない）', () => {
    const d = run(JP + 'h = [2026-01-01, 2026-01-12] covering: 2026-01-01..2026-01-31\nh\n', R);
    expect(d.results[0].grain).toEqual({ kind: 'civil', step: 1, phase: 0, off: 0, tz: 'Asia/Tokyo' });
    const t = run(JP + 'm = [2026-01-05T09:00, 2026-01-12T09:00] covering: ..\nm\n', R);
    expect(t.results[0].dates).toEqual(['2026-01-05T09:00', '2026-01-12T09:00']);
    expect(t.results[0].grain).toBeNull();
  });

  it('日内オフセット付きの civil（毎週月曜 09:00 の目盛り）: off は 9 時間の ms・phase は紀元からの市民日序数 mod step', () => {
    const r = run(JP + 'x = chronos grid 7d anchor: 2026-01-05T09:00\nx\n', R);
    expect(r.results[0].dates[0]).toBe('2026-01-05T09:00');
    const dayIdx = Math.round((Date.UTC(2026, 0, 5) - Date.UTC(1970, 0, 1)) / 86_400_000);
    expect(r.results[0].grain).toEqual({ kind: 'civil', step: 7, phase: dayIdx % 7, off: 9 * H, tz: 'Asia/Tokyo' });
  });

  it('経過時間幅の目盛りは elapsed（step は ms・phase は紀元 ms mod step）', () => {
    const g = run(JP + 'g = chronos grid 10800s\ng\n', R);
    expect(g.results[0].grain).toEqual({ kind: 'elapsed', step: 3 * H, phase: 0 });
    const s = run(JP + 'everyInstant |> strideBy(3600s, from: 2026-01-01T00:30)\n', R);
    expect(s.results[0].grain).toEqual({ kind: 'elapsed', step: H, phase: ((jst(2026, 1, 1) + 30 * 60_000) % H + H) % H });
  });

  it('空テーブル（空虚適合）は null', () => {
    expect(run(JP + '[] covering: ..\n', R).results[0].grain).toBeNull();
  });

  it('CLI の報告（--json）にも同じ形で載り、公開 schema に通る', () => {
    const rep = cmdList(JP + 'everyDay\n', R);
    expect(rep.results[0].grain).toEqual({ kind: 'civil', step: 1, phase: 0, off: 0, tz: 'Asia/Tokyo' });
    const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
    const valid = ajv.compile(JSON.parse(read('schema/cli-report.schema.json')));
    expect(valid(rep), JSON.stringify(valid.errors)).toBe(true);
    // schema は grain の形を縛る: 欄の欠けた civil・未知の kind は通らない
    const broken = JSON.parse(JSON.stringify(rep));
    broken.results[0].grain = { kind: 'civil', step: 1 };
    expect(valid(broken)).toBe(false);
    broken.results[0].grain = { kind: 'weekly', step: 1, phase: 0 };
    expect(valid(broken)).toBe(false);
  });
});

describe('(3) 被覆サマリの始端・終端・宣言値域', () => {
  const src = (bindings: string, body: string) =>
    `premise Eph { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "test-db"\n${bindings}\n}\n@Eph\n${body}\n`;
  const resolver = (table: Record<string, ExternalData>): ExternalResolver => (premise, binding) => {
    const d = table[`${premise}.${binding}`];
    if (!d) throw new Error(`no fixture: ${premise}.${binding}`);
    return d;
  };

  it('external（labels: 宣言）: 閉区間の両端が ms と表示形で出て、宣言値域が宣言順で載る', () => {
    const r = run(src('h = external(kind: dates, labels: [前期, 後期])', 'h'),
      { from: '2026-01-01', to: '2026-03-01', resolve: resolver({
        'Eph.h': { dates: ['2026-01-01', '2026-01-12'], covering: '2026-01-01..2026-01-31', asof: '2026-01-15', labels: ['前期', '後期'] } }) });
    const c = r.coverage.find(c => c.source === 'Eph.h')!;
    expect(c).toMatchObject({ covering: '2026-01-01..2026-01-31', asof: '2026-01-15', concluded: false, runwayDays: -28 });
    expect(c.startMs).toBe(jst(2026, 1, 1));
    expect(c.endMs).toBe(jst(2026, 2, 1));   // 排他端＝1 月 31 日の翌日 0 時（runwayDays の起点）
    expect(c.start).toBe('2026-01-01');
    expect(c.end).toBe('2026-02-01');
    expect(c.labelDomain).toEqual(['前期', '後期']);
    expect(Math.round((c.endMs! - jst(2026, 3, 1)) / 86_400_000)).toBe(c.runwayDays);
  });

  it('開端は null（残走路の null と同じ規約）・区間リストは最小の始端と最大の終端', () => {
    const open = run(JP + 'h = [2026-01-01] covering: 2026-01-01..\nh\n', R).coverage[0];
    expect(open).toMatchObject({ startMs: jst(2026, 1, 1), start: '2026-01-01', endMs: null, end: null, runwayDays: null });
    const both = run(JP + '[] covering: ..\n', R).coverage[0];
    expect(both).toMatchObject({ startMs: null, endMs: null, start: null, end: null, concluded: true });
    const list = run(JP + 'h = [2026-01-05, 2026-03-02] covering: 2026-01-01..2026-01-31, 2026-03-01..2026-03-31\nh\n',
      { from: '2026-01-01', to: '2026-04-01' }).coverage[0];
    expect(list.startMs).toBe(jst(2026, 1, 1));
    expect(list.endMs).toBe(jst(2026, 4, 1));
  });

  it('リテラルの並行 labels: は値域ではない＝labelDomain は出ない（ADR-54 判断 1 と同じ線）', () => {
    const c = run(JP + 'h = [2026-01-01, 2026-01-12] covering: 2026..2026 labels: [a, b]\nh\n', R).coverage[0];
    expect('labelDomain' in c).toBe(false);
    expect(c.start).toBe('2026-01-01');
    expect(c.end).toBe('2027-01-01');
  });

  it('CLI の報告の coverage も公開 schema に通る（新欄は任意欄＝1.1.0 の報告も通る）', () => {
    const rep = cmdList(JP + 'h = [2026-01-01] covering: 2026-01-01..\nh\n', R);
    const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
    const valid = ajv.compile(JSON.parse(read('schema/cli-report.schema.json')));
    expect(valid(rep), JSON.stringify(valid.errors)).toBe(true);
    const old = JSON.parse(JSON.stringify(rep));
    for (const c of old.coverage) { delete c.startMs; delete c.endMs; delete c.start; delete c.end; }
    for (const r of old.results) delete r.grain;
    expect(valid(old), JSON.stringify(valid.errors)).toBe(true);
  });
});

describe('(4) RunOptions.limits——実体化の上限を下げる口', () => {
  const STRIDE = 'everyInstant |> strideBy(3600s, from: 2026-01-01)\n';   // 1 月＝744 点・to+400 日まで約 1 万点
  const ALL = '|> snapTo(day)\n';   // 全列挙を要する段（述語 filter・snapTo・shift・roll・結合子）＝全列挙の門に掛ける

  it('既定値は export される定数（2^24・2^26・2^22）で凍結', () => {
    expect(DEFAULT_LIMITS).toEqual({ gridWindows: 2 ** 24, stridePoints: 2 ** 26, strideRange: 2 ** 22 });
    expect(Object.isFrozen(DEFAULT_LIMITS)).toBe(true);
  });

  it('stridePoints を下げると全列挙の形が止まり、診断文は実値（「（2^n）」の添え書きは既定値のときだけ）', () => {
    expect(evalDates(JP + STRIDE + ALL, R)).toContain('2026-01-01');   // 既定では通る（約 1 万点の全列挙）
    expect(() => run(JP + STRIDE + ALL, { ...R, limits: { stridePoints: 1000 } }))
      .toThrow(/^strideBy: 点が多すぎて実体化できない.*参照実装の実体化の上限 1,000。/);
    expect(() => run(JP + STRIDE + ALL, { ...R, limits: { stridePoints: 1000 } })).not.toThrow(/2\^/);
    expect(() => run(JP + STRIDE + ALL, { ...R, limits: { stridePoints: 1024 } })).toThrow(/参照実装の実体化の上限 1,024。/);
    expect(() => run(JP + 'everyInstant |> strideBy(1s, from: 2023-01-01)' + ALL, R)).toThrow(/参照実装の実体化の上限 67,108,864（2\^26）。/);   // 既定値の文言は従来どおり
  });

  it('strideRange を下げると出口（評価範囲内の切り出し）が止まる・全列挙を要しない形は上限の内側で通る', () => {
    expect(evalDates(JP + STRIDE, { ...R, limits: { strideRange: 800 } })).toHaveLength(744);
    expect(() => run(JP + STRIDE, { ...R, limits: { strideRange: 500 } }))
      .toThrow(/^strideBy: 評価範囲内の点が多すぎて実体化できない（約 744 個——参照実装の出力の上限 500。/);
  });

  it('gridWindows を下げると grid（経過時間幅＝算術の窓列）を点列に読む形と選択子の窓が止まる', () => {
    const G = 'x = chronos grid 3600s\nx\n';   // 紀元からの窓数は約 49 万＝既定 2^24 の内側
    expect(evalDates(JP + G, R)).toHaveLength(744);
    expect(() => run(JP + G, { ...R, limits: { gridWindows: 100 } }))
      .toThrow(/^grid: 点が多すぎて実体化できない.*参照実装の実体化の上限 100。/);
    const S = 'marks = [2026-01-05, 2026-01-06]\nmarks |> within(chronos grid 60s) |> first\n';
    expect(evalDates(JP + S, R)).toEqual(['2026-01-05', '2026-01-06']);
    expect(() => run(JP + S, { ...R, limits: { gridWindows: 1 } }))
      .toThrow(/^選択子 first: 点の属する窓が多すぎて実体化できない.*参照実装の実体化の上限 1。/);
  });

  it('既定より大きい値・0・非整数・数でない値は使い方の誤り（黙って丸めない）。空の limits は無害', () => {
    for (const bad of [{ stridePoints: 2 ** 27 }, { gridWindows: 0 }, { strideRange: 1.5 }, { gridWindows: NaN }, { stridePoints: '1000' as unknown as number }]) {
      expect(() => run(JP + 'everyDay\n', { ...R, limits: bad }), JSON.stringify(bad))
        .toThrow(/^limits\.(gridWindows|stridePoints|strideRange) は 1 以上 [\d,]+（2\^\d+）以下の整数（既定より大きい値は受け付けない/);
      expect(() => run(JP + 'everyDay\n', { ...R, limits: bad })).toThrow(KairosError);
    }
    expect(() => run(JP + 'everyDay\n', { ...R, limits: { stridePoints: 2 ** 27 } })).toThrow(/67,108,864（2\^26）/);
    expect(evalDates(JP + 'everyDay\n', { ...R, limits: {} })).toHaveLength(31);
    expect(evalDates(JP + 'everyDay\n', { ...R, limits: { gridWindows: 2 ** 24, stridePoints: 2 ** 26, strideRange: 2 ** 22 } })).toHaveLength(31);
  });
});
