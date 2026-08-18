// CLI サブコマンドの検証: list / next・--json・終了コード。
// 単体層は cmdList/cmdNext/renderHuman を直接呼び（表示と JSON が同じ CliReport から出る構造の検証）、
// 実走層は node サブプロセスで入口（引数解釈・stdout/stderr の割り当て・終了コード契約）を検査する。
// 終了コード契約: 0=成功・1=エラー・2=next が地平線内に要求件数未達。
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import { cmdList, cmdNext, renderHuman, todayIn, supplyResolver } from '../src/cli.ts';
import type { CliReport } from '../src/cli.ts';
import { oraclePayday, MONTHS_2026 } from './helpers.ts';

const IMPL = fileURLToPath(new URL('..', import.meta.url));
const PAYDAY = readFileSync(new URL('../examples/payday.kairos', import.meta.url), 'utf8');
const VERSION =
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version as string;

// CLI は premise 自前定義が前提（doctest の PRELUDE 注入は文書規約であって CLI の機能ではない）
const P = `premise JP {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  wkst: Mon
}
@JP
`;

const PAYDAYS_2026 = MONTHS_2026.map(m => oraclePayday(2026, m));
const GOLDEN_LIST = [
  ...PAYDAYS_2026,
  '# ⚠ 範囲外 2026-01-01..2026-01-02（holidays2026 covering 2026-01-01..2026-12-31）',
  '# 被覆サマリ',
  '#   holidays2026 covering 2026-01-01..2026-12-31 残走路 0 日',
];

describe('cmdList（単体）', () => {
  const rep = cmdList(PAYDAY, { from: '2026-01-01', to: '2027-01-01' });

  it('2026 年の給料日 12 件がオラクルと一致する', () => {
    expect(rep.results).toHaveLength(1);
    expect(rep.results[0].dates).toEqual(PAYDAYS_2026);
  });

  it('報告の表面: command・version・tz 既定・範囲の写し', () => {
    expect(rep.command).toBe('list');
    expect(rep.version).toBe(VERSION);
    expect(rep.tz).toBe('Asia/Tokyo');
    expect(rep.from).toBe('2026-01-01');
    expect(rep.to).toBe('2027-01-01');
  });

  it('points は dates と同長・狭義単調増加・tz の市民日開始と一致する', () => {
    const { points, dates } = rep.results[0];
    expect(points).toHaveLength(dates.length);
    expect(points.every((p, i) => i === 0 || points[i - 1] < p)).toBe(true);
    // 2026-01-23 の Asia/Tokyo 市民日開始 = UTC 前日 15:00
    expect(points[0]).toBe(Date.UTC(2026, 0, 23) - 9 * 3_600_000);
  });

  it('区間註釈と被覆サマリ（残走路 0）が載る', () => {
    expect(rep.results[0].annotations).toHaveLength(1);
    expect(rep.results[0].annotations[0]).toMatchObject(
      { kind: 'out-of-coverage', from: '2026-01-01', to: '2026-01-02', source: 'holidays2026' });
    expect(rep.coverage).toHaveLength(1);
    expect(rep.coverage[0].runwayDays).toBe(0);
  });

  it('JSON 直列化は無損失（undefined・関数を含まない）', () => {
    expect(JSON.parse(JSON.stringify(rep))).toEqual(rep);
  });

  it('renderHuman は旧 CLI と同じ行列を出す', () => {
    expect(renderHuman(rep)).toEqual(GOLDEN_LIST);
  });

  it('renderHuman(rep, "en") は枠組みだけ英語・註釈文は日本語のまま（--lang の線引き）', () => {
    expect(renderHuman(rep, 'en')).toEqual([
      ...PAYDAYS_2026,
      '# ⚠ 範囲外 2026-01-01..2026-01-02（holidays2026 covering 2026-01-01..2026-12-31）',
      '# coverage summary',
      '#   holidays2026 covering 2026-01-01..2026-12-31 runway 0 days',
    ]);
  });
});

describe('cmdNext（単体）', () => {
  it('from 以降の次の 3 発火・to は最終発火日の翌日・残走路が答えの範囲と整合する', () => {
    const rep = cmdNext(PAYDAY, { from: '2026-08-06', n: 3, horizonYears: 10 });
    expect(rep.results[0].dates).toEqual(['2026-08-25', '2026-09-25', '2026-10-23']);
    expect(rep).toMatchObject({ command: 'next', requested: 3, found: 3, to: '2026-10-24' });
    expect(rep.results[0].annotations).toEqual([]);
    expect(rep.coverage[0].runwayDays).toBe(69);   // 2026-10-24 → 2027-01-01
  });

  it('被覆の切れ目をまたぐ答えには註釈が併走する（黙って返さない）', () => {
    const rep = cmdNext(PAYDAY, { from: '2026-11-01', n: 3, horizonYears: 10 });
    expect(rep.results[0].dates).toEqual(['2026-11-25', '2026-12-25', '2027-01-25']);
    expect(rep.results[0].annotations).toHaveLength(1);
    expect(rep.results[0].annotations[0]).toMatchObject({ from: '2027-01-01', to: '2027-01-26' });
    expect(rep.coverage[0].runwayDays).toBe(-25);
  });

  it('探索窓は倍々に広がる（毎月 1 日 × 25 件＝ 4 年窓が要る）', () => {
    const rep = cmdNext(`${P}everyDay |> within(month) |> nth(1)\n`,
      { from: '2026-08-06', n: 25, horizonYears: 10 });
    const dates = rep.results[0].dates;
    expect(dates).toHaveLength(25);
    expect(dates[0]).toBe('2026-09-01');
    expect(dates[24]).toBe('2028-09-01');
    expect(rep.to).toBe('2028-09-02');
    expect(rep.coverage).toEqual([]);              // everyDay はデータ被覆を持たない
  });

  it('地平線まで探して不足なら見つかった分を返す（found < requested）', () => {
    const rep = cmdNext(`${P}once = [2026-09-01] covering: 2026..2026\nonce\n`,
      { from: '2026-08-06', n: 3, horizonYears: 2 });
    expect(rep).toMatchObject({ requested: 3, found: 1, horizonYears: 2, to: '2028-08-06' });
    expect(rep.results[0].dates).toEqual(['2026-09-01']);
    expect(rep.results[0].annotations.length).toBeGreaterThanOrEqual(1);
    expect(rep.coverage[0].runwayDays).toBeLessThan(0);
  });

  it('本体式が複数のファイルは明示エラー（どの式の「次」か曖昧なため）', () => {
    const two = `${P}everyDay |> within(month) |> nth(1)\neveryDay |> within(month) |> nth(15)\n`;
    expect(() => cmdNext(two, { from: '2026-08-06', n: 1, horizonYears: 10 }))
      .toThrow(/本体式 1 つ/);
  });

  it('本体式がないファイルはエラー', () => {
    expect(() => cmdNext(`${P}x = [2026-01-01] covering: 2026..2026\n`,
      { from: '2026-08-06', n: 1, horizonYears: 10 })).toThrow(/本体式がない/);
  });
});

// external 供給の固定材（reference/external.md の正準形——premise 内・tz 必須・source は premise 側）
const EXT = `premise HRDB {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  wkst: Mon
  source: "hr-db/holidays"
  holidays = external(kind: dates)
}
@HRDB
holidays
`;
const SUPPLY = {
  holidays: {
    dates: ['2026-01-01', '2026-01-12'],
    covering: '2026-01-01..2026-01-31',
    asof: '2026-01-15',
  },
};

describe('supplyResolver（--supply の静的束・単体）', () => {
  it('束縛名キーで解決し、premise 修飾キーが優先される', () => {
    const r = supplyResolver({
      holidays: SUPPLY.holidays,
      'HRDB.holidays': { ...SUPPLY.holidays, asof: '2026-01-20' },
    }, 'test.json');
    expect(r('HRDB', 'holidays', { kind: 'dates', source: 's' }).asof).toBe('2026-01-20');
    expect(r('OTHER', 'holidays', { kind: 'dates', source: 's' }).asof).toBe('2026-01-15');
  });

  it('キー欠落は供給エラー（どのキーを探したかまで言う）', () => {
    const r = supplyResolver({}, 'test.json');
    expect(() => r('HRDB', 'holidays', { kind: 'dates', source: 's' }))
      .toThrow(/--supply test\.json に holidays がない.*HRDB\.holidays/);
  });

  it('形の検査: dates と instants の同居・covering/asof 欠落・型違いを拒否する', () => {
    const base = { covering: '2026..2026', asof: '2026-01-01' };
    expect(() => supplyResolver({ x: { dates: [], instants: [], ...base } }, 't'))
      .toThrow(/どちらか一方/);
    expect(() => supplyResolver({ x: { dates: ['2026-01-01'], asof: '2026-01-01' } }, 't'))
      .toThrow(/covering/);
    expect(() => supplyResolver({ x: { dates: ['2026-01-01'], covering: '2026..2026' } }, 't'))
      .toThrow(/asof/);
    expect(() => supplyResolver({ x: { instants: ['not-a-number'], ...base } }, 't'))
      .toThrow(/epoch ミリ秒/);
  });
});

describe('--supply の評価合流（cmdList / cmdNext）', () => {
  it('dates wire: 解決値で評価され、被覆サマリに supply 由来の asof が載る', () => {
    const rep = cmdList(EXT, { from: '2026-01-01', to: '2026-02-01',
      resolve: supplyResolver(SUPPLY, 't') });
    expect(rep.results[0].dates).toEqual(['2026-01-01', '2026-01-12']);
    expect(rep.coverage[0]).toMatchObject(
      { source: 'HRDB.holidays', asof: '2026-01-15', runwayDays: 0 });
  });

  it('instants wire: epoch ミリ秒（CliReport の points と同じ規約）が瞬間列になる', () => {
    const src = `premise CLK {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  wkst: Mon
  source: "runtime/ticks"
  ticks = external(kind: instants)
}
@CLK
ticks
`;
    const ms = Date.UTC(2026, 0, 5);        // = 2026-01-05T09:00 JST
    const rep = cmdList(src, { from: '2026-01-01', to: '2026-02-01',
      resolve: supplyResolver({ ticks: { instants: [ms],
        covering: '2026-01-01..2026-01-31', asof: '2026-01-05' } }, 't') });
    expect(rep.results[0].dates).toEqual(['2026-01-05T09:00']);
    expect(rep.results[0].points).toEqual([ms]);
  });

  it('next も同じ解決子で回る（探索の再評価にも配管される）', () => {
    const rep = cmdNext(EXT, { from: '2026-01-02', n: 1, horizonYears: 10,
      resolve: supplyResolver(SUPPLY, 't') });
    expect(rep.results[0].dates).toEqual(['2026-01-12']);
    expect(rep.found).toBe(1);
  });
});

describe('todayIn', () => {
  it('実行 tz の市民日付（YYYY-MM-DD）を返す', () => {
    for (const tz of ['Asia/Tokyo', 'America/New_York', 'UTC']) {
      expect(todayIn(tz)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('CLI 実走（サブプロセス）', () => {
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, ['src/cli.ts', ...args], { cwd: IMPL, encoding: 'utf8' });

  it('旧形式（サブコマンド省略）は list と同じ出力・終了コード 0', () => {
    const r = cli('examples/payday.kairos', '--from', '2026-01-01', '--to', '2027-01-01');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(GOLDEN_LIST.join('\n') + '\n');
  });

  it('list --json は機械可読の CliReport を出す', () => {
    const r = cli('list', '--from', '2026-01-01', '--to', '2027-01-01', '--json',
      'examples/payday.kairos');
    expect(r.status).toBe(0);
    const rep = JSON.parse(r.stdout) as CliReport;
    expect(rep.command).toBe('list');
    expect(rep.version).toBe(VERSION);
    expect(rep.results[0].dates).toEqual(PAYDAYS_2026);
  });

  it('next -n 1 は次の発火 1 件・終了コード 0', () => {
    const r = cli('next', '-n', '1', '--from', '2026-08-06', 'examples/payday.kairos');
    expect(r.status).toBe(0);
    expect(r.stdout.split('\n')[0]).toBe('2026-08-25');
  });

  it('next の要求件数未達は終了コード 2・stderr に不足の内訳', () => {
    const r = cli('next', '-n', '99', '--horizon', '1', '--from', '2026-11-01',
      'examples/payday.kairos');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/地平線 1 年以内の発火は 12 件（要求 99 件）/);
  });

  it('未知のフラグは終了コード 1・使い方を添える', () => {
    const r = cli('next', '--oops', 'examples/payday.kairos');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/使い方/);
  });

  it('引数なしは終了コード 1・使い方', () => {
    const r = cli();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/使い方/);
  });

  it('--version は実装版を出して終了コード 0（配布バイナリの身元確認）', () => {
    const r = cli('--version');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(VERSION);
  });

  describe('--lang en（表示層の英語化・エラーと註釈は日本語が正のまま）', () => {
    it('list --lang en: 見出し・残走路行が英語形になる', () => {
      const r = cli('list', '--lang', 'en', '--from', '2026-01-01', '--to', '2027-01-01',
        'examples/payday.kairos');
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('# coverage summary');
      expect(r.stdout).toContain('runway 0 days');
      expect(r.stdout).not.toContain('被覆サマリ');
      // 註釈文は評価器の日本語のまま
      expect(r.stdout).toMatch(/# ⚠ 範囲外/);
    });

    it('next --lang en の要求件数未達は英語の内訳・終了コード 2 は不変', () => {
      const r = cli('next', '--lang', 'en', '-n', '99', '--horizon', '1', '--from', '2026-11-01',
        'examples/payday.kairos');
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/only 12 firing\(s\) within the 1-year horizon \(requested 99\)/);
    });

    it('引数エラー時の使い方も --lang en なら英語版が出る', () => {
      const r = cli('next', '--oops', '--lang', 'en', 'examples/payday.kairos');
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/Usage \(kairos/);
      expect(r.stderr).not.toMatch(/使い方/);
    });

    it('--lang の不正値は明示エラー・終了コード 1', () => {
      const r = cli('list', '--lang', 'fr', 'examples/payday.kairos');
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/--lang は ja または en: fr/);
    });
  });

  describe('--supply（実走）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kairos-cli-'));
    writeFileSync(join(dir, 'ext.kairos'), EXT);
    writeFileSync(join(dir, 'supply.json'), JSON.stringify(SUPPLY));
    writeFileSync(join(dir, 'broken.json'), '{ oops');
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('list --supply: 解決・評価・被覆サマリまで一気通貫', () => {
      const r = cli('list', join(dir, 'ext.kairos'), '--from', '2026-01-01', '--to', '2026-02-01',
        '--supply', join(dir, 'supply.json'));
      expect(r.status).toBe(0);
      expect(r.stdout).toBe([
        '2026-01-01',
        '2026-01-12',
        '# 被覆サマリ',
        '#   HRDB.holidays covering 2026-01-01..2026-01-31 asof 2026-01-15 残走路 0 日',
      ].join('\n') + '\n');
    });

    it('--supply 無しの external は供給エラー・終了コード 1（ADR-46 の既定）', () => {
      const r = cli('list', join(dir, 'ext.kairos'), '--from', '2026-01-01', '--to', '2026-02-01');
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/供給エラー: 解決子がない/);
    });

    it('壊れた JSON は明示エラー・終了コード 1', () => {
      const r = cli('list', join(dir, 'ext.kairos'), '--from', '2026-01-01', '--to', '2026-02-01',
        '--supply', join(dir, 'broken.json'));
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/--supply の JSON が壊れている/);
    });
  });
});
