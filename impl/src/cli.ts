// Kairos CLI — サブコマンド: list（範囲の点列）・next（次の N 発火）
// 使い方（kairos ＝ node src/cli.ts。配布名は 1.0 で npm bin / SEA に載せる）:
//   kairos list [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--tz Zone] [--json] <file.kairos>
//   kairos next [-n 件数] [--from YYYY-MM-DD] [--horizon 年数] [--tz Zone] [--json] <file.kairos>
// サブコマンド省略時（先頭引数がファイル）は list——旧形式の実行例を全て生かす後方互換。
// 終了コード: 0=成功・1=エラー・2=next が地平線内に要求件数を見つけられず（部分結果は表示する）。
// external() の解決子は持たない（解決時は供給エラー＝ADR-46 の既定どおり）。
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { run, formatAnnotation, KairosError } from './index.ts';
import type { RunResult } from './index.ts';
import type { ResultAnnotation, CoverageEntry } from './eval.ts';

// 実装版（JSON 出力の版規律）。SEA 束ね時は build 側でリテラルへ差し替え（index.ts の stdlib と同型）
const VERSION: string =
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

/** CLI の結果表面。人間表示（renderHuman）と --json はこの一つの器から出す——両表示の乖離を封じる */
export interface CliReport {
  command: 'list' | 'next';
  version: string;                     // 参照実装の版（package.json）
  tz: string;                          // 実行既定 tz（前文 tz: が在圏なら評価はそちらが優先）
  from: string;                        // 評価範囲 [from, to)。next では to ＝確定再評価の右端
  to: string;
  requested?: number;                  // next: 要求件数 N
  found?: number;                      // next: 実際に見つけた件数（< requested なら終了コード 2）
  horizonYears?: number;               // next: 探索地平線（年）
  results: {
    source: string;
    dates: string[];                   // 表示形（YYYY-MM-DD[Thh:mm[:ss]]・実行 tz の市民ラベル)
    points: number[];                  // epoch ms——「判定は外部」の交差計算用の器
    annotations: ResultAnnotation[];   // 区間註釈（fromMs/toMs 込み・ADR-37 判断 5/7 (a)）
  }[];
  coverage: CoverageEntry[];           // 被覆サマリ（ADR-37 判断 7 (b)。残走路は評価 to 起点）
  warnings: string[];
}

/** 実行 tz の今日（市民日付）。時計読みは CLI 境界のみ——言語・評価は不変に決定的 */
export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat('en-CA',
    { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// 日付字面の算術（純グレゴリオ・Date.UTC の正規化に委ねる。2/29+1y 等は run() 側の
// civilDayStart が翌日に正規化＝評価範囲の端としては安全）
const partsOf = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new KairosError(`日付は YYYY-MM-DD: ${s}`);
  return [+m[1], +m[2], +m[3]] as const;
};
const addYears = (s: string, k: number) => {
  const [y, mo, d] = partsOf(s);
  return `${String(y + k).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};
const addDays = (s: string, n: number) => {
  const [y, mo, d] = partsOf(s);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
};

interface CmdOpts { from: string; to?: string; tz?: string }

function toReport(command: 'list' | 'next', r: RunResult, o: CmdOpts & { to: string },
                  next?: { requested: number; found: number; horizonYears: number }): CliReport {
  return {
    command,
    version: VERSION,
    tz: o.tz ?? 'Asia/Tokyo',
    from: o.from,
    to: o.to,
    ...(next ? { requested: next.requested, found: next.found, horizonYears: next.horizonYears } : {}),
    results: r.results.map(res => ({
      source: res.source, dates: res.dates, points: res.points, annotations: res.annotations,
    })),
    coverage: r.coverage,
    warnings: r.warnings,
  };
}

/** list: 範囲 [from, to) の全発火＋註釈＋被覆サマリ */
export function cmdList(source: string, o: CmdOpts & { to: string }): CliReport {
  return toReport('list', run(source, o), o);
}

/** next: from 以降の次の N 発火。窓を 1 年から倍々に広げて探索し（上限＝horizon 年）、
 *  見つかったら [from, 最終発火日の翌日) で確定再評価——註釈・残走路が答えの範囲と整合する。
 *  地平線まで探して不足なら見つかった分を返す（found < requested）。 */
export function cmdNext(source: string, o: CmdOpts & { n: number; horizonYears: number }): CliReport {
  const meta = { requested: o.n, found: 0, horizonYears: o.horizonYears };
  let years = Math.min(1, o.horizonYears);
  for (;;) {
    const to = addYears(o.from, years);
    const r = run(source, { from: o.from, to, ...(o.tz ? { tz: o.tz } : {}) });
    if (r.results.length === 0) throw new KairosError('本体式がない');
    if (r.results.length > 1) throw new KairosError(
      `next は本体式 1 つのファイル向け（${r.results.length} 式ある——list を使うか式を 1 つに）`);
    const found = r.results[0];
    if (found.dates.length >= o.n) {
      // 確定再評価: 右端＝N 発火目の翌市民日（同日複数瞬間の切り落としは slice で）
      const toFinal = addDays(found.dates[o.n - 1].slice(0, 10), 1);
      const rf = run(source, { from: o.from, to: toFinal, ...(o.tz ? { tz: o.tz } : {}) });
      const res = rf.results[0];
      res.dates = res.dates.slice(0, o.n);
      res.points = res.points.slice(0, o.n);
      return toReport('next', rf, { ...o, to: toFinal }, { ...meta, found: o.n });
    }
    if (years >= o.horizonYears) {
      return toReport('next', r, { ...o, to }, { ...meta, found: found.dates.length });
    }
    years = Math.min(years * 2, o.horizonYears);
  }
}

/** 人間向け表示（stdout 行列）。--json と同じ CliReport から出す */
export function renderHuman(rep: CliReport): string[] {
  const out: string[] = [];
  rep.results.forEach((res, i) => {
    if (rep.results.length > 1) out.push(`# 式 ${i + 1}（${res.dates.length} 件）`);
    for (const d of res.dates) out.push(d);
    // 区間註釈（ADR-37 判断 5/7 (a)）: 結果の後に表示——対処は呼び手の責務（判定は外部）
    for (const a of res.annotations) out.push(`# ⚠ ${formatAnnotation(a)}`);
  });
  // 被覆サマリ（ADR-37 判断 7 (b)）: クリップしない・完結主張も常時表示
  if (rep.coverage.length > 0) {
    out.push('# 被覆サマリ');
    for (const c of rep.coverage) {
      out.push(`#   ${c.source} covering ${c.covering}${c.asof ? ` asof ${c.asof}` : ''}`
        + `${c.concluded ? '（完結主張）' : ''}`
        + ` 残走路 ${c.runwayDays === null ? '∞' : `${c.runwayDays} 日`}`);
    }
  }
  return out;
}

const USAGE = `使い方（kairos ＝ node src/cli.ts）:
  kairos list [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--tz Zone] [--json] <file.kairos>
      範囲 [from, to) の全発火・区間註釈・被覆サマリ（既定: 実行 tz の今日から 1 年）
  kairos next [-n 件数] [--from YYYY-MM-DD] [--horizon 年数] [--tz Zone] [--json] <file.kairos>
      from 以降の次の N 発火（既定: n=1・from=今日・地平線 10 年。本体式 1 つのファイル向け）
サブコマンド省略時は list。終了コード: 0=成功・1=エラー・2=next が地平線内に要求件数未達`;

const OPTS = {
  list: {
    from: { type: 'string' }, to: { type: 'string' },
    tz: { type: 'string' }, json: { type: 'boolean' },
  },
  next: {
    n: { type: 'string', short: 'n' }, from: { type: 'string' }, horizon: { type: 'string' },
    tz: { type: 'string' }, json: { type: 'boolean' },
  },
} as const;

const posInt = (s: string, name: string) => {
  if (!/^\d+$/.test(s) || +s < 1) throw new KairosError(`${name} は正の整数: ${s}`);
  return +s;
};

function main(argv: string[]): number {
  let cmd: 'list' | 'next';
  let rest = argv;
  if (argv[0] === 'list' || argv[0] === 'next') {
    cmd = argv[0];
    rest = argv.slice(1);
  } else if (argv.length > 0 && !argv[0].startsWith('-')) {
    cmd = 'list';                     // 旧形式: kairos <file.kairos> --from … --to …
  } else {
    console.error(USAGE);
    return 1;
  }
  try {
    const { values, positionals } = parseArgs(
      { args: rest, options: OPTS[cmd], allowPositionals: true, strict: true });
    if (positionals.length !== 1) throw new KairosError('ファイルを 1 つ指定する');
    const source = readFileSync(positionals[0], 'utf8');
    const tz = values.tz as string | undefined;
    const from = (values.from as string | undefined) ?? todayIn(tz ?? 'Asia/Tokyo');

    let rep: CliReport;
    if (cmd === 'list') {
      const to = (values as { to?: string }).to ?? addYears(from, 1);
      rep = cmdList(source, { from, to, ...(tz ? { tz } : {}) });
    } else {
      const n = posInt((values as { n?: string }).n ?? '1', '-n');
      const horizonYears = posInt((values as { horizon?: string }).horizon ?? '10', '--horizon');
      rep = cmdNext(source, { from, n, horizonYears, ...(tz ? { tz } : {}) });
    }

    if (values.json) console.log(JSON.stringify(rep, null, 2));
    else for (const line of renderHuman(rep)) console.log(line);
    for (const w of rep.warnings) console.error(`警告: ${w}`);
    if (rep.command === 'next' && rep.found! < rep.requested!) {
      console.error(`⚠ 地平線 ${rep.horizonYears} 年以内の発火は ${rep.found} 件（要求 ${rep.requested} 件）`);
      return 2;
    }
    return 0;
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    if (e instanceof Error && 'code' in e && String(e.code).startsWith('ERR_PARSE_ARGS')) {
      console.error(USAGE);           // 引数の誤り（未知フラグ等）には使い方を添える
    }
    return 1;
  }
}

// vitest からの import では実行しない（テストは cmdList/cmdNext/renderHuman を直接呼ぶ）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
