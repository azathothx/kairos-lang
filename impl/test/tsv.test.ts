// --tsv（1.0.10・2026-10-12 決定・言語不変）の witness: 1 点 1 行のタブ区切り＝Excel／PowerShell（Import-Csv -Delimiter "`t"）向けの出力の橋。
// 決め（src/cli.ts renderTsv）: 1 行目は見出し行・列は固定順 expr source uid date time epoch_ms note・date と time を分ける（Excel が日付型・時刻型に読む・
// ラベルは schema の dates pattern で分解し、日粒度の点は DST 重複のオフセットが付いても time は空）・
// note は註釈の区間 [fromMs, toMs) に入る点だけ・stdout は見出し行と点の行だけ（被覆サマリ・註釈・警告・explain・0 点の知らせは stderr）・
// --json／--ics と排他・--lang は行に影響しない（言語中立）・BOM なし・クォートなし（source のタブ・改行・復帰は 1 つの空白に）。
// 単体層は renderTsv を直接呼び（--json と同じ CliReport から出る構造の検証）、実走層は node サブプロセスで stdout/stderr の割り当てと終了コードを検査する。
// 変異 3 系統（見出し行を落とす・note を常に空にする・被覆サマリを stdout に出す）で赤を実測してから数える（2026-08-31 の教訓）。
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import { cmdList, cmdNext, renderTsv, renderHumanAux, renderHuman, TSV_HEADER } from '../src/cli.ts';
import type { CliReport } from '../src/cli.ts';
import { oraclePayday, MONTHS_2026 } from './helpers.ts';

const IMPL = fileURLToPath(new URL('..', import.meta.url));
const PAYDAY = readFileSync(new URL('../examples/payday.kairos', import.meta.url), 'utf8');
const HEADER = 'expr\tsource\tuid\tdate\ttime\tepoch_ms\tnote\tlabel';   // 8 列目 label は 1.0 追補 29（結果の出口のラベル）
const PAYDAYS_2026 = MONTHS_2026.map(m => oraclePayday(2026, m));

const JP = `premise JP {
  calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
}
@JP
`;
// witness-rule の例（tools/figures/figs/witness-rule.mjs）: 祝日表の covering を 2026-07-15 で切る——7/16 以降は表の外
const JP_CUT = `premise JP {
  calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  national = [2026-01-01, 2026-01-12, 2026-02-11, 2026-02-23, 2026-03-20, 2026-04-29, 2026-05-03..2026-05-06] covering: 2026-01-01..2026-07-15
}
@JP
`;
const CUT = JP_CUT + 'everyDay \\ national\n';                                            // 7/13〜7/15 は表の内・7/16〜7/17 は註釈の区間
const COINCIDES = JP_CUT + 'month |> first |> filter(m => coincides(national, month, m))\n';   // 5 月の窓だけ真・7 月の窓は範囲外の註釈
const CUT_NOTE = '範囲外 2026-07-16..2026-07-18（JP.national covering 2026-01-01..2026-07-15）';
const TWO = JP + 'everyDay |> within(month) |> nth(1)\neveryDay |> within(month) |> nth(15)\n';
const TIMED = JP + '[2026-01-05, 2026-01-05T09:00, 2026-01-05T09:00:30, 2026-01-05T09:00:30.250] covering: 2026..2026\n';
const MULTILINE = JP + 'wed = everyDay |> filter(d => weekday(d) == Wed)\n'
  + '(wed |> within(month) |> nth(1))\n | (wed\t|> within(month) |> nth(3))\n';
const EMPTY = JP + 'everyDay |> filter(d => dayNo(d) == 32)\n';
const WARN = JP + 'far = [2026-06-01, 2126-06-01T04:00] covering: .. |> snapTo(month)\n'
  + 'everyDay |> filter(d => not coincides(far, day, d))\n';
const NY = 'premise NY {\n  calendar-system: Gregorian; tz: "America/New_York"; wkst: Mon\n}\n@NY\n'
  + 'chronos grid 1d anchor: 2026-01-01T01:30\n';
// + 符号側の重複（Europe/Berlin は 2026-10-25 03:00→02:00・02:30 が二度ある）＝time は 02:30+02:00
const DE = 'premise DE {\n  calendar-system: Gregorian; tz: "Europe/Berlin"; wkst: Mon\n}\n@DE\n'
  + 'chronos grid 1d anchor: 2026-01-01T02:30\n';
// Havana は 01:00→00:00 に戻る（00:00 が二度ある）＝日粒度の点にも DST 重複のオフセットが付く tz（2026-11-01-04:00）
const CU = 'premise CU {\n  calendar-system: Gregorian; tz: "America/Havana"; wkst: Mon\n}\n@CU\neveryDay\n';

const rows = (lines: string[]) => lines.slice(1).map(l => l.split('\t'));
const O = { from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' };

describe('renderTsv（単体）: --json と同じ CliReport から出す', () => {
  it('1 行目は見出し行・列は固定順 expr source uid date time epoch_ms note label', () => {
    expect(TSV_HEADER.join('\t')).toBe(HEADER);
    expect(renderTsv(cmdList(PAYDAY, { from: '2026-01-01', to: '2027-01-01', tz: 'Asia/Tokyo' }))[0]).toBe(HEADER);
  });

  it('1 点 1 行・各行は 8 列・uid は results[].uid・expr は 1 起点', () => {
    const rep = cmdList(PAYDAY, { from: '2026-01-01', to: '2027-01-01', tz: 'Asia/Tokyo' });
    const lines = renderTsv(rep);
    expect(lines).toHaveLength(1 + 12);
    for (const r of rows(lines)) {
      expect(r).toHaveLength(8);
      expect(r[0]).toBe('1');
      expect(r[1]).toBe(rep.results[0].source);
      expect(r[2]).toBe(rep.results[0].uid);
      expect(r[2]).toMatch(/^kairos-[0-9a-f]{12}-series@kairos-lang\.org$/);
    }
    expect(rows(lines).map(r => r[3])).toEqual(PAYDAYS_2026);
  });

  it('date は YYYY-MM-DD・time はラベルの T 以降（秒・.SSS を保つ）・日粒度の点は空・epoch_ms は points と一致', () => {
    const rep = cmdList(TIMED, O);
    expect(rep.results[0].dates).toEqual(['2026-01-05', '2026-01-05T09:00', '2026-01-05T09:00:30', '2026-01-05T09:00:30.250']);
    const r = rows(renderTsv(rep));
    expect(r.map(x => x[3])).toEqual(['2026-01-05', '2026-01-05', '2026-01-05', '2026-01-05']);
    expect(r.map(x => x[4])).toEqual(['', '09:00', '09:00:30', '09:00:30.250']);
    expect(r.map(x => Number(x[5]))).toEqual(rep.results[0].points);
    expect(r.every(x => /^\d+$/.test(x[5]))).toBe(true);
  });

  it('DST の重複時刻はオフセット込みの time（dates と points が一対一のまま）', () => {
    const rep = cmdList(NY, { from: '2026-10-31', to: '2026-11-03', tz: 'America/New_York' });
    expect(rows(renderTsv(rep)).map(x => `${x[3]}|${x[4]}`))
      .toEqual(['2026-10-31|01:30', '2026-11-01|01:30-04:00', '2026-11-02|01:30']);
  });

  it('DST の重複時刻は + 符号のオフセットも time に残る（Europe/Berlin の 02:30+02:00）', () => {
    const rep = cmdList(DE, { from: '2026-10-24', to: '2026-10-27', tz: 'Europe/Berlin' });
    expect(rows(renderTsv(rep)).map(x => `${x[3]}|${x[4]}`))
      .toEqual(['2026-10-24|02:30', '2026-10-25|02:30+02:00', '2026-10-26|02:30']);
  });

  it('日粒度の点に DST 重複のオフセットが付く tz（Havana の 2026-11-01-04:00）: date は日付・time は空・符号を時刻に読まない', () => {
    const rep = cmdList(CU, { from: '2026-10-31', to: '2026-11-03', tz: 'America/Havana' });
    expect(rep.results[0].dates).toEqual(['2026-10-31', '2026-11-01-04:00', '2026-11-02']);
    const r = rows(renderTsv(rep));
    expect(r.map(x => `${x[3]}|${x[4]}`)).toEqual(['2026-10-31|', '2026-11-01|', '2026-11-02|']);
    expect(r.map(x => Number(x[5]))).toEqual(rep.results[0].points);   // 2 つの真夜中の識別は epoch_ms が持つ
  });

  it('expr は results の順番・source は各式の字面', () => {
    const rep = cmdList(TWO, O);
    const r = rows(renderTsv(rep));
    expect(r.map(x => [x[0], x[1], x[3]])).toEqual([
      ['1', 'everyDay |> within(month) |> nth(1)', '2026-01-01'],
      ['2', 'everyDay |> within(month) |> nth(15)', '2026-01-15'],
    ]);
    expect(r[0][2]).not.toBe(r[1][2]);                 // uid は式ごと
  });

  it('source のタブ・改行は 1 つの空白に（行が崩れない・列数は 8 のまま）', () => {
    const rep = cmdList(MULTILINE, O);
    expect(rep.results[0].source).toContain('\n');
    expect(rep.results[0].source).toContain('\t');
    const r = rows(renderTsv(rep));
    expect(r.every(x => x.length === 8)).toBe(true);
    expect(r[0][1]).toBe('(wed |> within(month) |> nth(1))  | (wed |> within(month) |> nth(3))');
  });

  it('復帰（CR）も空白に・改行は \\n（CRLF にしない）', () => {
    const rep = cmdList(TWO, O);
    rep.results[0].source = 'a\r\nb';
    const lines = renderTsv(rep);
    expect(lines[1].split('\t')[1]).toBe('a  b');
    expect(lines.join('\n')).not.toContain('\r');
  });

  it('note は註釈の区間 [fromMs, toMs) に入る点だけ・入らなければ空（witness-rule の例＝covering を 2026-07-15 で切った祝日表）', () => {
    const rep = cmdList(CUT, { from: '2026-07-13', to: '2026-07-18', tz: 'Asia/Tokyo' });
    expect(rep.results[0].annotations).toHaveLength(1);
    expect(rows(renderTsv(rep)).map(x => [x[3], x[6]])).toEqual([
      ['2026-07-13', ''], ['2026-07-14', ''], ['2026-07-15', ''],
      ['2026-07-16', CUT_NOTE], ['2026-07-17', CUT_NOTE],
    ]);
  });

  it('註釈はあるが点が区間の外（month 窓の coincides）: note は空・註釈は補助行（stderr 側）に残る', () => {
    const rep = cmdList(COINCIDES, { from: '2026-05-01', to: '2026-08-01', tz: 'Asia/Tokyo' });
    expect(rows(renderTsv(rep)).map(x => [x[3], x[6]])).toEqual([['2026-05-01', '']]);
    expect(renderHumanAux(rep)).toContain('# ⚠ 範囲外 2026-07-01..2026-08-01（JP.national covering 2026-01-01..2026-07-15）');
  });

  it('複数の註釈区間に入る点は「; 」で連結・区間は [fromMs, toMs)（左端は含む・右端は含まない）', () => {
    const rep = cmdList(TWO, O);
    const ms = rep.results[0].points[0];
    const base = { kind: 'out-of-coverage' as const, from: '2026-01-01', to: '2026-01-02', covering: '2025..2025' };
    rep.results[0].annotations = [
      { ...base, fromMs: ms - 1, toMs: ms + 1, source: 'A' },
      { ...base, fromMs: ms, toMs: ms + 1, source: 'B', asof: '2025-12-01' },   // 左端は含む
      { ...base, fromMs: ms + 1, toMs: ms + 2, source: 'C' },                   // 左端が ms より後＝外
      { ...base, fromMs: ms - 1, toMs: ms, source: 'D' },                       // 右端は含まない（toMs ＝ ms）＝外
    ];
    const note = rows(renderTsv(rep))[0][6];
    expect(note)
      .toBe('範囲外 2026-01-01..2026-01-02（A covering 2025..2025）; 範囲外 2026-01-01..2026-01-02（B covering 2025..2025, asof 2025-12-01）');
    expect(note).not.toContain('C covering');
    expect(note).not.toContain('D covering');
  });

  it('next の CliReport も同じ器で出る（被覆の切れ目をまたぐ 3 件目だけ note）', () => {
    const rep = cmdNext(PAYDAY, { from: '2026-11-01', n: 3, horizonYears: 10, tz: 'Asia/Tokyo' });
    expect(rows(renderTsv(rep)).map(x => [x[3], x[6] !== ''])).toEqual([
      ['2026-11-25', false], ['2026-12-25', false], ['2027-01-25', true],
    ]);
  });

  it('0 点は見出し行だけ', () => {
    expect(renderTsv(cmdList(EMPTY, { from: '2026-02-01', to: '2026-03-01', tz: 'Asia/Tokyo' }))).toEqual([HEADER]);
  });

  it('renderHumanAux は renderHuman から点の行を除いたもの（補助行の取り出しが人向け表示と乖離しない）', () => {
    for (const rep of [
      cmdList(PAYDAY, { from: '2026-01-01', to: '2027-01-01', tz: 'Asia/Tokyo' }),
      cmdList(TWO, O),
      cmdList(EMPTY, { from: '2026-02-01', to: '2026-03-01', tz: 'Asia/Tokyo' }),
      cmdList(WARN, { ...O, explain: true }),
    ]) {
      const points = new Set(rep.results.flatMap(r => r.dates));
      for (const lang of ['ja', 'en'] as const) {
        expect(renderHumanAux(rep, lang)).toEqual(renderHuman(rep, lang).filter(l => !points.has(l)));
      }
    }
  });
});

describe('CLI 実走（サブプロセス）: --tsv の stdout／stderr の割り当てと終了コード', () => {
  // cli.test.ts と同じく子プロセスの TZ を Asia/Tokyo に固定し、--tz も明示する（CI のランナーは UTC）
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, ['src/cli.ts', ...args],
      { cwd: IMPL, encoding: 'utf8', env: { ...process.env, TZ: 'Asia/Tokyo' } });
  const dir = mkdtempSync(join(tmpdir(), 'kairos-tsv-'));
  const file = (name: string, src: string) => { const p = join(dir, name); writeFileSync(p, src); return p; };
  const cut = file('cut.kairos', CUT), two = file('two.kairos', TWO), timed = file('timed.kairos', TIMED);
  const multi = file('multi.kairos', MULTILINE), empty = file('empty.kairos', EMPTY), warn = file('warn.kairos', WARN);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const stdoutLines = (s: string) => s.split('\n').slice(0, -1);   // 末尾の改行で終わる

  it('list --tsv: 1 行目は見出し行・以降 1 点 1 行・stdout に # 行は無い・被覆サマリと註釈は stderr', () => {
    const r = cli('list', '--from', '2026-01-01', '--to', '2027-01-01', '--tz', 'Asia/Tokyo', '--tsv', 'examples/payday.kairos');
    expect(r.status).toBe(0);
    const lines = stdoutLines(r.stdout);
    expect(lines[0]).toBe(HEADER);
    expect(lines).toHaveLength(13);
    expect(r.stdout.endsWith('\n')).toBe(true);
    expect(r.stdout.charCodeAt(0)).not.toBe(0xFEFF);          // BOM なし
    expect(r.stdout).not.toContain('\r');
    expect(lines.some(l => l.startsWith('#'))).toBe(false);
    expect(rows(lines).map(x => x[3])).toEqual(PAYDAYS_2026);
    expect(r.stderr).toContain('# ⚠ 範囲外 2026-01-01..2026-01-02（holidays2026 covering 2026-01-01..2026-12-31）');
    expect(r.stderr).toContain('# 被覆サマリ');
    expect(r.stderr).toContain('残走路 0 日');
    expect(r.stdout).not.toContain('被覆サマリ');
  });

  it('2 式のファイル: expr は 1 と 2・source は各式の字面・見出し行「# 式 n」は stderr', () => {
    const r = cli('list', '--from', '2026-01-01', '--to', '2026-02-01', '--tz', 'Asia/Tokyo', '--tsv', two);
    expect(r.status).toBe(0);
    expect(rows(stdoutLines(r.stdout)).map(x => [x[0], x[1], x[3]])).toEqual([
      ['1', 'everyDay |> within(month) |> nth(1)', '2026-01-01'],
      ['2', 'everyDay |> within(month) |> nth(15)', '2026-01-15'],
    ]);
    expect(r.stderr).toContain('# 式 1（1 件）');
    expect(r.stdout).not.toContain('# 式');
  });

  it('時刻付きの点は date と time に分かれ、日粒度の点は time が空', () => {
    const r = cli('list', '--from', '2026-01-01', '--to', '2026-02-01', '--tz', 'Asia/Tokyo', '--tsv', timed);
    expect(r.status).toBe(0);
    expect(rows(stdoutLines(r.stdout)).map(x => [x[3], x[4]])).toEqual([
      ['2026-01-05', ''], ['2026-01-05', '09:00'], ['2026-01-05', '09:00:30'], ['2026-01-05', '09:00:30.250'],
    ]);
  });

  it('epoch_ms は --json の points と一致・uid は --json の results[].uid と一致', () => {
    const args = ['list', '--from', '2026-01-01', '--to', '2026-02-01', '--tz', 'Asia/Tokyo', timed];
    const j = JSON.parse(cli(...args, '--json').stdout) as CliReport;
    const t = rows(stdoutLines(cli(...args, '--tsv').stdout));
    expect(t.map(x => Number(x[5]))).toEqual(j.results[0].points);
    expect(new Set(t.map(x => x[2]))).toEqual(new Set([j.results[0].uid]));
  });

  it('0 点は見出し行だけを stdout に出して exit 0・「# 0 点」の知らせは stderr', () => {
    const r = cli('list', '--from', '2026-02-01', '--to', '2026-03-01', '--tz', 'Asia/Tokyo', '--tsv', empty);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(HEADER + '\n');
    expect(r.stderr).toContain('# 0 点（[2026-02-01, 2026-03-01) に該当なし）');
  });

  it('note は註釈の区間に入る点だけ（covering を 2026-07-15 で切った祝日表・7/16 以降）', () => {
    const r = cli('list', '--from', '2026-07-13', '--to', '2026-07-18', '--tz', 'Asia/Tokyo', '--tsv', cut);
    expect(r.status).toBe(0);
    expect(rows(stdoutLines(r.stdout)).map(x => [x[3], x[6]])).toEqual([
      ['2026-07-13', ''], ['2026-07-14', ''], ['2026-07-15', ''],
      ['2026-07-16', CUT_NOTE], ['2026-07-17', CUT_NOTE],
    ]);
    expect(r.stderr).toContain(`# ⚠ ${CUT_NOTE}`);
  });

  it('--tsv と --json／--ics／--ics-series の同時指定は usage エラー・exit 1', () => {
    for (const other of ['--json', '--ics', '--ics-series']) {
      const r = cli('list', '--from', '2026-01-01', '--to', '2026-02-01', '--tsv', other, 'examples/payday.kairos');
      expect(r.status).toBe(1);
      const out = other === '--json' ? JSON.parse(r.stdout).error.message as string : r.stderr;   // --json はエラーも JSON
      expect(out).toMatch(/どちらか一方/);
      expect(out).toContain(`--tsv と ${other}`);
      if (other !== '--json') expect(r.stdout).toBe('');
    }
  });

  it('警告と # explain: 行は stderr・stdout は見出し行と点の行だけ', () => {
    const r = cli('list', '--from', '2026-01-01', '--to', '2026-01-03', '--tz', 'Asia/Tokyo', '--tsv', '--explain', warn);
    expect(r.status).toBe(0);
    const lines = stdoutLines(r.stdout);
    expect(lines).toHaveLength(3);
    expect(lines.slice(1).every(l => /^1\t/.test(l))).toBe(true);
    expect(r.stderr).toMatch(/^警告: horizon-clip/m);
    expect(r.stderr).toMatch(/^# explain: everyDay 2 → filter\(λ\) 2$/m);
    expect(r.stderr).toContain('# 被覆サマリ');
    expect(r.stdout).not.toContain('警告');
    expect(r.stdout).not.toContain('explain');
  });

  it('next --tsv: 次の 3 発火・被覆の切れ目をまたぐ 3 件目だけ note・exit 0', () => {
    const r = cli('next', '-n', '3', '--from', '2026-11-01', '--tz', 'Asia/Tokyo', '--tsv', 'examples/payday.kairos');
    expect(r.status).toBe(0);
    const lines = stdoutLines(r.stdout);
    expect(lines[0]).toBe(HEADER);
    expect(rows(lines).map(x => [x[3], x[6]])).toEqual([
      ['2026-11-25', ''], ['2026-12-25', ''],
      ['2027-01-25', '範囲外 2027-01-01..2027-01-26（holidays2026 covering 2026-01-01..2026-12-31）'],
    ]);
    expect(r.stderr).toContain('# 被覆サマリ');
  });

  it('next --tsv の要求件数未達は従来どおり exit 2・見つかった分は stdout・⚠ 地平線行は stderr', () => {
    const r = cli('next', '-n', '99', '--horizon', '1', '--from', '2026-11-01', '--tz', 'Asia/Tokyo', '--tsv', 'examples/payday.kairos');
    expect(r.status).toBe(2);
    const lines = stdoutLines(r.stdout);
    expect(lines[0]).toBe(HEADER);
    expect(lines).toHaveLength(13);
    expect(r.stderr).toMatch(/⚠ 地平線 1 年以内の発火は 12 件（要求 99 件）/);
    expect(r.stdout).not.toContain('⚠');
  });

  it('next --tsv の 0 件（found 0）: stdout は見出し行だけ・exit 2・⚠ 地平線行は stderr', () => {
    const r = cli('next', '-n', '1', '--horizon', '1', '--from', '2026-02-01', '--tz', 'Asia/Tokyo', '--tsv', empty);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe(HEADER + '\n');
    expect(r.stderr).toMatch(/⚠ 地平線 1 年以内の発火は 0 件（要求 1 件）/);
  });

  it('next でも --tsv と --json／--ics の同時指定は usage エラー・exit 1（list と同じ経路）', () => {
    for (const other of ['--json', '--ics']) {
      const r = cli('next', '-n', '1', '--from', '2026-02-01', '--tsv', other, 'examples/payday.kairos');
      expect(r.status).toBe(1);
      const out = other === '--json' ? JSON.parse(r.stdout).error.message as string : r.stderr;
      expect(out).toContain(`--tsv と ${other} はどちらか一方`);
      if (other !== '--json') expect(r.stdout).toBe('');
    }
  });

  it('--lang en でも stdout の行は同じ（言語中立）・stderr の枠組みだけ英語・note の註釈文は日本語のまま', () => {
    const args = ['list', '--from', '2026-07-13', '--to', '2026-07-18', '--tz', 'Asia/Tokyo', '--tsv', cut];
    const ja = cli(...args), en = cli(...args, '--lang', 'en');
    expect(en.status).toBe(0);
    expect(en.stdout).toBe(ja.stdout);
    expect(en.stdout).toContain(CUT_NOTE);
    expect(en.stderr).toContain('# coverage summary');
    expect(en.stderr).toContain('runway -2 days');
    expect(en.stderr).not.toContain('被覆サマリ');
    expect(ja.stderr).toContain('# 被覆サマリ');
  });

  it('source のタブと改行は 1 つの空白になり、行は 8 列のまま', () => {
    const r = cli('list', '--from', '2026-01-01', '--to', '2026-02-01', '--tz', 'Asia/Tokyo', '--tsv', multi);
    expect(r.status).toBe(0);
    const t = rows(stdoutLines(r.stdout));
    expect(t).toHaveLength(2);
    expect(t.every(x => x.length === 8)).toBe(true);
    expect(t[0][1]).toBe('(wed |> within(month) |> nth(1))  | (wed |> within(month) |> nth(3))');
  });

  it('使い方（日英）の list／next の行に --tsv が載る', () => {
    for (const lang of ['ja', 'en']) {
      const r = cli('--help', '--lang', lang);
      expect(r.status).toBe(0);
      expect(r.stdout.match(/\[--json\|--ics\|--tsv\]/g)).toHaveLength(2);
      expect(r.stdout).toMatch(/^  --tsv: /m);
    }
  });
});

// ultra 5（2026-10-24）の所見: label 列も source と同じくタブ・改行を空白に。言語のラベルは名前だけでタブを含めない（テーブルリテラルの
// labels: は名前・supply は宣言値域で止まる）が、renderTsv は公開関数で CliReport の labels は任意文字列（MCP 等の生成物も受ける）。
describe('renderTsv: label 列の無害化（2026-10-24）', () => {
  it('タブ・CR・LF を含むラベルでも行は 8 列のまま（空白に置き換える）', () => {
    const rep = cmdList(PAYDAY, { from: '2026-01-01', to: '2027-01-01', tz: 'Asia/Tokyo' });
    const res = rep.results[0];
    const r = { ...rep, results: [{ ...res, labels: res.points.map((_, i) => (i === 0 ? 'a\tb\r\nc' : null)) }] };
    const lines = renderTsv(r);
    expect(lines).toHaveLength(1 + 12);
    for (const row of rows(lines)) expect(row).toHaveLength(8);
    expect(rows(lines)[0][7]).toBe('a b  c');
    expect(rows(lines)[1][7]).toBe('');
  });
});
