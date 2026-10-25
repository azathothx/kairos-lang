// 1.0 追補 29（90-open 2-7）: 結果の出口にラベルを添える——言語は不変。変わるのは出口（`results[].labels`・`--tsv` の 8 列目 label・
// `.ics` の 1 点 1 予定の SUMMARY）だけ。規則: 本体式が参照するラベル付き束縛（external／テーブルリテラルの labels:・cycle・segmentBy の
// labels:）がちょうど 1 つのとき、結果の各点 d に既存の射影 B(d) を評価して添える。ラベルの無い点は null。0 か 2 つ以上なら添えない。
// 変異で赤を実測してから数えた: hook を外す（labels が出ない）・2 つでも添える・null を '' に・tsv の列を落とす・.ics の題を名前のままに・
// .ics の題をラベルだけに・next の切り詰めを外す・被覆サマリの復元を外す・Schema の items を string だけに／labels を外す。
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { run } from '../src/index.ts';
import type { ExternalResolver } from '../src/index.ts';
import { cmdList, cmdNext, renderTsv, TSV_HEADER } from '../src/cli.ts';
import type { CliReport } from '../src/cli.ts';
import { toIcs, pointUid, seriesUid, uidKey } from '../src/ics.ts';

const ROOT = new URL('../../', import.meta.url);
const IMPL = fileURLToPath(new URL('..', import.meta.url));
const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
const validReport = ajv.compile(JSON.parse(readFileSync(new URL('schema/cli-report.schema.json', ROOT), 'utf8')));
const errorsOf = (v: { errors?: unknown }) => JSON.stringify(v.errors);

// 二十四節気の external（kind: instants・labels: 値域）。小寒 1/5 17:00 JST・大寒 1/20 10:00・立春 2/5 05:00（UTC の瞬間で供給）
const SEKKI = (body: string) => `# 二十四節気
premise H { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "x"
  sekki = external(kind: instants, labels: [小寒, 大寒, 立春])
  none = [] covering: 2026..2026
}
@H
${body}
`;
const INSTANTS = [Date.UTC(2026, 0, 5, 8), Date.UTC(2026, 0, 20, 1), Date.UTC(2026, 1, 4, 20)];
const SUPPLY = { 'H.sekki': { instants: INSTANTS, covering: '2026..2026', asof: '2026-01-01', labels: ['小寒', '大寒', '立春'] } };
const resolve: ExternalResolver = (premise, binding) => {
  const d = (SUPPLY as Record<string, typeof SUPPLY['H.sekki']>)[`${premise}.${binding}`];
  if (!d) throw new Error(`no fixture: ${premise}.${binding}`);
  return d;
};
const W = { from: '2026-01-01', to: '2026-03-01', tz: 'Asia/Tokyo' };
const DATES = ['2026-01-05T17:00', '2026-01-20T10:00', '2026-02-05T05:00'];

// 旧暦月（segmentBy の labels:＝窓列への並行ラベル。test/window-labels.test.ts と同じ 2026 年の朔 12 件）
const KYU = `
premise Kyu = Gregorian with {
  source: "test"
  asof: 2026-02-02
  tz: "Asia/Tokyo"
  newMoons = [2026-01-19T04:52, 2026-02-17T21:01, 2026-03-19T10:23, 2026-04-17T20:52,
              2026-05-17T05:01, 2026-06-15T11:54, 2026-07-14T18:44, 2026-08-13T02:37,
              2026-09-11T12:27, 2026-10-11T00:50, 2026-11-09T16:02, 2026-12-09T09:52]
    covering: 2026..2026
  lunarStart = newMoons |> snapTo(day)
  monthNos = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  lunarMonth = day |> segmentBy(lunarStart, edges: drop, empties: error, labels: monthNos)
}
premise Koyomi { calendar-system: Kyu; tz: "Asia/Tokyo"; wkst: Mon }
@Koyomi
`;
const JP = 'premise JP { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }\n@JP\n';

describe('results[].labels——規則（ラベル付き束縛がちょうど 1 つのとき各点に射影 B(d)・無い点は null）', () => {
  it('external の labels: を参照する式は各点にラベル（dates と同長・順序も同じ）。filter の部分集合も同じ射影', () => {
    const r = run(SEKKI('sekki\nsekki |> filter(s => sekki(s) == 立春)\n'), { ...W, resolve });
    expect(r.results[0].dates).toEqual(DATES);
    expect(r.results[0].labels).toEqual(['小寒', '大寒', '立春']);
    expect(r.results[1].dates).toEqual(['2026-02-05T05:00']);
    expect(r.results[1].labels).toEqual(['立春']);
  });

  it('ラベル付き束縛を参照しない式には labels が無い（鍵ごと無い＝従来の報告）', () => {
    const r = run(JP + 'everyDay |> within(month) |> last\n', W);
    expect(r.results[0].dates.length).toBe(2);
    expect(r.results[0].labels).toBeUndefined();
    expect('labels' in r.results[0]).toBe(false);
  });

  it('ラベル付き束縛を 2 つ参照する式には添えない——cycle（weekday）と表・表と表', () => {
    const r = run(SEKKI('sekki |> filter(s => weekday(s) == Mon) | sekki\n'), { ...W, resolve });
    expect(r.results[0].dates).toEqual(DATES);          // 値は従来どおり
    expect(r.results[0].labels).toBeUndefined();
    const two = run(JP + 'a = [2026-01-05, 2026-01-20] covering: 2026..2026 labels: [x, y]\nb = [2026-02-05] covering: 2026..2026 labels: [z]\na | b\na\n', W);
    expect(two.results[0].labels).toBeUndefined();        // a | b＝2 つ
    expect(two.results[1].labels).toEqual(['x', 'y']);    // 式を分ければ各式に付く（テーブルリテラルの labels: も同じ）
  });

  it('shift 後の点は表に無いので null（snapTo も同じ）——点の表は「d が属する窓」を持たない', () => {
    const r = run(SEKKI('sekki |> shift(1, unit: day)\nsekki |> snapTo(day)\n'), { ...W, resolve });
    expect(r.results[0].dates).toEqual(['2026-01-06T17:00', '2026-01-21T10:00', '2026-02-06T05:00']);
    expect(r.results[0].labels).toEqual([null, null, null]);
    expect(r.results[1].dates).toEqual(['2026-01-05', '2026-01-20', '2026-02-05']);
    expect(r.results[1].labels).toEqual([null, null, null]);
  });

  it('segmentBy の labels: は窓の所属で読む——shift(-1) した朔日は前の窓のラベル・最初の窓の前（窓の外）は null', () => {
    const r = run(KYU + 'lunarMonth |> first\nlunarMonth |> first |> shift(-1, unit: day)\n', { from: '2026-01-01', to: '2026-05-01' });
    expect(r.results[0].dates).toEqual(['2026-01-19', '2026-02-17', '2026-03-19', '2026-04-17']);
    expect(r.results[0].labels).toEqual(['12', '1', '2', '3']);                 // 窓のラベル（数値）は文字列で出る
    expect(r.results[1].dates).toEqual(['2026-01-18', '2026-02-16', '2026-03-18', '2026-04-16']);
    expect(r.results[1].labels).toEqual([null, '12', '1', '2']);                // 1/18 は edges: drop で落ちた先頭窓＝窓の外
  });

  it('cycle だけを参照する式にも付く（weekday の射影）', () => {
    const r = run(JP + 'everyDay |> filter(d => weekday(d) == Wed) |> within(month) |> nth(1)\n', W);
    expect(r.results[0].dates).toEqual(['2026-01-07', '2026-02-04']);
    expect(r.results[0].labels).toEqual(['Wed', 'Wed']);
  });

  it('出口は観測面を変えない——評価が触らなかった表を射影しても被覆サマリと警告は従来のまま（0 点なら labels は []）', () => {
    // or の短絡で sekki(d) が一度も評価されない式: 値の評価は H.sekki を参照しない＝被覆サマリに出ない。出口の射影はその表を
    // 読む（点は表に無く null）が、射影が登録した被覆サマリは元に戻す（出口が観測面を変えない）
    const r = run(SEKKI('everyDay |> within(month) |> first |> filter(d => dayNo(d) == 1 or sekki(d) == 立春)\n'), { ...W, resolve });
    expect(r.results[0].dates).toEqual(['2026-01-01', '2026-02-01']);
    expect(r.results[0].labels).toEqual([null, null]);
    expect(r.coverage).toEqual([]);
    expect(r.warnings).toEqual([]);
    const z = run(SEKKI('none |> filter(d => sekki(d) == 立春)\n'), { ...W, resolve });   // 空テーブルの filter＝述語は一度も走らない
    expect(z.results[0].dates).toEqual([]);
    expect(z.results[0].labels).toEqual([]);
    expect(z.coverage.map(c => c.source)).toEqual(['H.none']);
  });

  it('label: 付与式（計算ラベル。stdlib の month・year）はラベル付き束縛に数えない——month を参照する式に labels は無い', () => {
    const r = run(JP + 'everyDay |> within(month) |> first\nmonth |> first\n', W);
    expect(r.results[0].dates).toEqual(['2026-01-01', '2026-02-01']);
    expect(r.results[0].labels).toBeUndefined();
    expect(r.results[1].labels).toBeUndefined();
  });

  it('同梱例 rokuyo: lunarMonth を参照する 3 式とも旧暦の月番号が付く（大安の列は月をまたいで 11→12→1→2）', () => {
    const src = readFileSync(new URL('../examples/rokuyo.kairos', import.meta.url), 'utf8');
    const rep = cmdList(src, { from: '2026-01-01', to: '2026-04-01', tz: 'Asia/Tokyo' });
    expect(rep.results[0].labels).toEqual(['12', '1', '2']);                     // 朔日
    expect(rep.results[1].labels).toEqual(['11', '12', '1']);                    // 十五日
    expect(rep.results[2].dates.length).toBe(14);                                // 大安
    expect(rep.results[2].labels).toEqual(['11', '11', '11', '12', '12', '12', '12', '1', '1', '1', '1', '1', '2', '2']);
  });
});

describe('出口の 3 形——--json（Schema）・--tsv の 8 列目・.ics の SUMMARY・next', () => {
  it('CliReport に labels が載り Schema に通る・labels の要素は string|null（数値は通らない）・無い報告も通る', () => {
    const rep = cmdList(SEKKI('sekki\n'), { ...W, resolve });
    expect(rep.results[0].labels).toEqual(['小寒', '大寒', '立春']);
    expect(validReport(rep), errorsOf(validReport)).toBe(true);
    const shifted = cmdList(SEKKI('sekki |> shift(1, unit: day)\n'), { ...W, resolve });
    expect(shifted.results[0].labels).toEqual([null, null, null]);
    expect(validReport(shifted), errorsOf(validReport)).toBe(true);
    const mut = (f: (r: CliReport) => void) => { const c = JSON.parse(JSON.stringify(rep)) as CliReport; f(c); return validReport(c); };
    expect(mut(r => { (r.results[0].labels as unknown[])[0] = 12; })).toBe(false);
    expect(mut(r => { delete r.results[0].labels; })).toBe(true);
  });

  it('--tsv: 見出し行の 8 列目は label・ラベルのある点はその値・無い点と添えない式は空', () => {
    expect(TSV_HEADER[7]).toBe('label');
    expect(TSV_HEADER).toHaveLength(8);
    const rep = cmdList(SEKKI('sekki\nsekki |> shift(1, unit: day)\neveryDay |> within(month) |> last\n'), { ...W, resolve });
    const rows = renderTsv(rep).slice(1).map(l => l.split('\t'));
    expect(rows).toHaveLength(3 + 3 + 2);
    expect(rows.every(r => r.length === 8)).toBe(true);
    expect(rows.slice(0, 3).map(r => r[7])).toEqual(['小寒', '大寒', '立春']);
    expect(rows.slice(3).map(r => r[7])).toEqual(['', '', '', '', '']);
    expect(rows[0].slice(3, 7)).toEqual(['2026-01-05', '17:00', String(INSTANTS[0]), '']);   // 7 列は従来どおり
  });

  it('.ics（1 点 1 予定）: ラベルのある点は SUMMARY と通知の文が「名前 · ラベル」・無い点は名前・UID は不変・series は名前のまま', () => {
    const src = SEKKI('sekki\nsekki |> shift(1, unit: day)\n');
    const rep = cmdList(src, { ...W, resolve });
    const ics = toIcs(rep, { source: src }).replace(/\r\n[ \t]/g, '');
    const events = ics.split('BEGIN:VEVENT').slice(1).map(e => e.split('END:VEVENT')[0]);
    expect(events.filter(e => !e.includes('SUMMARY:⚠'))).toHaveLength(6);
    expect(events[0]).toContain('SUMMARY:二十四節気 · sekki · 小寒');      // 名前は残す（「12」のようなラベルだけでは予定が読めない）
    expect(events[0]).toContain('DESCRIPTION:二十四節気 · sekki · 小寒');  // VALARM の文（時刻付きの点）
    expect(events[2]).toContain('SUMMARY:二十四節気 · sekki · 立春');
    expect(ics).not.toContain('SUMMARY:小寒');                              // ラベルだけの題は出ない
    expect(events[3]).toContain('SUMMARY:二十四節気 · sekki |> shift(1\\, unit: day)\r\n');   // null の点は名前だけ
    expect(events[0]).toContain(`UID:${pointUid(uidKey(0, 'sekki', 'Asia/Tokyo'), INSTANTS[0])}`);
    expect(events[0]).toContain(`UID:${rep.results[0].uid.replace('-series@', `-${INSTANTS[0]}@`)}`);
    const series = toIcs(rep, { source: src, series: true }).replace(/\r\n[ \t]/g, '');
    expect(series).toContain(`UID:${seriesUid(uidKey(0, 'sekki', 'Asia/Tokyo'))}`);
    expect(series).toContain('SUMMARY:二十四節気 · sekki\r\n');
    expect(series).not.toContain('· 小寒');
  });

  it('next: labels も要求件数で切る（dates と同長のまま）——同じ日に 2 瞬間ある表で n=1', () => {
    const rep = cmdNext(SEKKI('sekki\n'), { from: '2026-01-01', n: 2, horizonYears: 1, tz: 'Asia/Tokyo', resolve });
    expect(rep.found).toBe(2);
    expect(rep.results[0].dates).toEqual(DATES.slice(0, 2));
    expect(rep.results[0].labels).toEqual(['小寒', '大寒']);
    expect(validReport(rep), errorsOf(validReport)).toBe(true);
    // 確定再評価 [from, 1/6) は 1/5 の 2 瞬間を両方持つ＝dates と同じく labels も n で切る
    const sameDay: ExternalResolver = () => ({ instants: [Date.UTC(2026, 0, 5, 8), Date.UTC(2026, 0, 5, 11), INSTANTS[1]],
                                               covering: '2026..2026', asof: '2026-01-01', labels: ['小寒', '大寒', '立春'] });
    const one = cmdNext(SEKKI('sekki\n'), { from: '2026-01-01', n: 1, horizonYears: 1, tz: 'Asia/Tokyo', resolve: sameDay });
    expect(one.results[0].dates).toEqual(['2026-01-05T17:00']);
    expect(one.results[0].labels).toEqual(['小寒']);
  });

  describe('CLI 実走（サブプロセス）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kairos-labels-'));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));
    const put = (name: string, data: string) => { const f = join(dir, name); writeFileSync(f, data); return f; };
    const cli = (...args: string[]) => spawnSync(process.execPath, ['src/cli.ts', ...args], { cwd: IMPL, encoding: 'utf8', env: { ...process.env, TZ: 'Asia/Tokyo' } });
    const RANGE = ['--from', '2026-01-01', '--to', '2026-03-01', '--tz', 'Asia/Tokyo'];

    it('--json --supply の実出力に labels が載り Schema に通る・--tsv の 8 列目・--ics の SUMMARY', () => {
      const def = put('sekki.kairos', SEKKI('sekki\n'));
      const sup = put('sekki.json', JSON.stringify(SUPPLY));
      const j = cli('list', ...RANGE, '--json', '--supply', sup, def);
      expect(j.status).toBe(0);
      const rep = JSON.parse(j.stdout) as CliReport;
      expect(rep.results[0].labels).toEqual(['小寒', '大寒', '立春']);
      expect(validReport(rep), errorsOf(validReport)).toBe(true);
      const t = cli('list', ...RANGE, '--tsv', '--supply', sup, def);
      expect(t.status).toBe(0);
      const lines = t.stdout.split('\n').filter(l => l !== '');
      expect(lines[0]).toBe('expr\tsource\tuid\tdate\ttime\tepoch_ms\tnote\tlabel');
      expect(lines.slice(1).map(l => l.split('\t')[7])).toEqual(['小寒', '大寒', '立春']);
      const i = cli('list', ...RANGE, '--ics', '--supply', sup, def);
      expect(i.status).toBe(0);
      expect(i.stdout).toContain('SUMMARY:二十四節気 · 立春\r\n');       // 式が 1 つなら「名前 · ラベル」
      expect(i.stdout).not.toContain('SUMMARY:二十四節気\r\n');           // 3 点ともラベルがあるので名前だけの題は無い
      expect(i.stdout).not.toContain('SUMMARY:立春');
    });
  });
});

// ultra 5（2026-10-24）の所見の処置: 出口の射影が後続の式の観測面を変えない（defCache／fineCache の巻き戻し）・RunOptions.labels: false。
// 変異で赤を実測: 巻き戻しを外す（後続の式の被覆サマリから later が消える）・labels: false を無視する（labels が出る）。
describe('出口の射影は後続の式の観測面を変えない（メモ化の巻き戻し・2026-10-24）', () => {
  const BASE = `premise JP { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@JP
holidays   = [2026-01-01, 2026-01-12] covering: 2026..2026
later      = [2027-03-01] covering: 2027..2027
nonWorking = holidays | later
`;
  const O = { from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' };
  const covOf = (rep: CliReport) => rep.coverage.map(c => `${c.source}#${c.covering}`).sort();
  it('先行する式が射影でだけ強制した束縛（0 点の filter の述語内）は、後続の式で被覆サマリに登録される（1.0.11 と同じ面）', () => {
    const alone = cmdList(BASE + 'nonWorking\n', O);
    const after = cmdList(BASE + '(holidays \\ holidays) |> filter(d => coincides(nonWorking, day, d))\nnonWorking\n', O);
    expect(after.results.map(r => r.points.length)).toEqual([0, 2]);
    expect(covOf(alone)).toContain('later#2027-01-01..2027-12-31');
    expect(covOf(after)).toEqual(covOf(alone));
    expect(after.warnings).toEqual(alone.warnings);
  });
});

describe('RunOptions.labels: false＝出口のラベルを計算しない（人間表示と next の探索窓・2026-10-24）', () => {
  const O = { from: '2026-01-01', to: '2026-03-01', tz: 'Asia/Tokyo', resolve };
  it('run の既定は labels を持ち、labels: false では鍵ごと無い（点・被覆サマリ・警告は同じ）', () => {
    const on = run(SEKKI('sekki\n'), O);
    const off = run(SEKKI('sekki\n'), { ...O, labels: false });
    expect(on.results[0].labels).toEqual(['小寒', '大寒', '立春']);
    expect(off.results[0].labels).toBeUndefined();
    expect(off.results[0].points).toEqual(on.results[0].points);
    expect(off.coverage).toEqual(on.coverage);
    expect(off.warnings).toEqual(on.warnings);
  });
  it('cmdList／cmdNext も labels: false を通す・既定は従来どおり', () => {
    expect(cmdList(SEKKI('sekki\n'), O).results[0].labels).toEqual(['小寒', '大寒', '立春']);
    expect(cmdList(SEKKI('sekki\n'), { ...O, labels: false }).results[0].labels).toBeUndefined();
    const n = { from: '2026-01-01', n: 2, horizonYears: 1, tz: 'Asia/Tokyo', resolve };
    expect(cmdNext(SEKKI('sekki\n'), n).results[0].labels).toEqual(['小寒', '大寒']);
    expect(cmdNext(SEKKI('sekki\n'), { ...n, labels: false }).results[0].labels).toBeUndefined();
  });
});
