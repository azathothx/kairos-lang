#!/usr/bin/env node
// Kairos CLI — サブコマンド: list（範囲の点列）・next（次の N 発火）
// 使い方（kairos ＝ node src/cli.ts。配布名は 1.0 で npm bin / SEA に載せる）:
//   kairos list [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--tz Zone] [--json] <file.kairos>
//   kairos next [-n 件数] [--from YYYY-MM-DD] [--horizon 年数] [--tz Zone] [--json] <file.kairos>
// サブコマンド省略時（先頭引数がファイル）は list——旧形式の実行例を全て生かす後方互換。
// 終了コード: 0=成功・1=エラー・2=next が地平線内に要求件数を見つけられず（部分結果は表示する）。
// external() は --supply <file.json> の静的束で解決できる（supplyResolver → RunOptions.resolve）。
// --supply 無しでの解決は供給エラー（ADR-46 の既定どおり）。
import { readFileSync, realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { run, formatAnnotation, KairosError, SupplyError } from './index.ts';
import type { RunResult, ExternalData, ExternalResolver } from './index.ts';
import type { ResultAnnotation, CoverageEntry, StageTrace } from './eval.ts';

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
    source: string;                    // 本体式の字面（1.0 追補 23。旧: 常に空文字列）
    line: number;                      // 本体式の 1 行目（1 起点）。同じ字面でも直前の前文で結果が変わるので要る
    dates: string[];                   // 表示形（YYYY-MM-DD[Thh:mm[:ss[.SSS]]][±HH:MM]・実行 tz の市民ラベル。DST の重複時刻は
                                       // オフセット付き・秒未満は .SSS＝points と一対一。schema/cli-report.schema.json）
    points: number[];                  // epoch ms——「判定は外部」の交差計算用の器（点の同一性）
    annotations: ResultAnnotation[];   // 区間註釈（fromMs/toMs 込み・ADR-37 判断 5/7 (a)）
    stages?: StageTrace[];             // --explain のときだけ: 段ごとの途中値と点数（軽量 explain・1.0 追補 23）
  }[];
  coverage: CoverageEntry[];           // 被覆サマリ（ADR-37 判断 7 (b)。残走路は評価 to 起点）
  warnings: string[];
}

/** --json のエラー表面（1.0 追補 23）: stdout に JSON で返す（終了コード 1 は不変）。kind＝usage（引数・ファイル・--supply の
 *  JSON 自体）／supply（供給契約の違反＝SupplyError）／static（定義の字句・構文・静的・評価のエラー＝KairosError）。
 *  機械の消費側（MCP 等）が stderr を読まずに済む器 */
export interface CliErrorReport {
  command: 'list' | 'next';
  version: string;
  error: { kind: 'usage' | 'supply' | 'static'; message: string };
}

/** 機械（実行環境）の tz＝Intl の解決値。CLI の既定 tz はこれ（1.0.1——1.0.0 は Asia/Tokyo 固定で、非 JST の環境では
 *  日粒度の点が時刻付きで印字され [from, to) の窓が日をまたいだ）。時計読みと同じく CLI 境界だけで読む——
 *  ライブラリ側（run / cmdList / cmdNext の既定）は Asia/Tokyo のままで、評価は不変に決定的 */
export function hostTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
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

interface CmdOpts { from: string; to?: string; tz?: string; resolve?: ExternalResolver; explain?: boolean }

/** 入力ファイル（定義・--supply）を UTF-8 の文字列で読む。Windows の導線で踏む 3 形を CLI 境界で受ける
 *  （境界チェックリスト三巡目 2026-09-30・F142）:
 *  - UTF-16（PowerShell 5 の `>`・Out-File の既定）は「不明な文字」「JSON が壊れている」へ誤誘導していた→保存し直しを案内
 *  - UTF-8 の BOM（Set-Content -Encoding UTF8・古いメモ帳）は読み飛ばす（定義ファイルは字句解析側＝F119。JSON はここ）
 *  - 読めないファイルは Node の英語文言（ENOENT: …）だけだった→どの引数のファイルかを添える */
export function readInput(path: string, what: string): string {
  let buf: Buffer;
  try { buf = readFileSync(path); } catch (e) {
    throw new KairosError(`${what}が読めない: ${path}（${(e as Error).message}）`);
  }
  if ((buf[0] === 0xFF && buf[1] === 0xFE) || (buf[0] === 0xFE && buf[1] === 0xFF)) {
    throw new KairosError(`${what}が UTF-16 で保存されている: ${path}——UTF-8 で保存し直す`
      + '（PowerShell 5 の > と Out-File は UTF-16 になる。Set-Content -Encoding utf8 か PowerShell 7 を使う）');
  }
  const text = buf.toString('utf8');
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

/** --supply の静的束から external 解決子を作る（ADR-46 の RunOptions.resolve へ渡す形）。
 *  形: {キー: {dates|instants, covering, asof [, labels]}}——キーは束縛名または "premise.束縛名"
 *  （premise 修飾が優先。source は named-arg 上書きで多対一になり得るためキーにしない）。
 *  ここでは JSON の形だけを検査する——覆域の包含・昇順・実在日などの供給契約 12 種は
 *  評価器側の検査（external の統治）がそのまま掛かる。 */
export function supplyResolver(raw: unknown, origin: string): ExternalResolver {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new KairosError(`--supply は {束縛名: {dates|instants, covering, asof}} の JSON オブジェクト: ${origin}`);
  }
  const table = new Map<string, ExternalData>();
  for (const [key, v] of Object.entries(raw)) {
    const where = `--supply ${origin} の "${key}"`;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new KairosError(`${where} は {dates|instants, covering, asof} のオブジェクト`);
    }
    const e = v as Record<string, unknown>;
    const hasDates = 'dates' in e, hasInstants = 'instants' in e;
    if (hasDates === hasInstants) {
      throw new KairosError(`${where}: dates / instants はどちらか一方（wire は宣言の kind と評価器が照合する）`);
    }
    if (typeof e.covering !== 'string' || e.covering === '') throw new KairosError(`${where}: covering（文字列）が必須`);
    if (typeof e.asof !== 'string' || e.asof === '') throw new KairosError(`${where}: asof（文字列）が必須`);
    if (hasDates && !(Array.isArray(e.dates) && e.dates.every(d => typeof d === 'string'))) {
      throw new KairosError(`${where}: dates は "YYYY-MM-DD" の文字列配列`);
    }
    if (hasInstants && !(Array.isArray(e.instants) && e.instants.every(n => typeof n === 'number'))) {
      throw new KairosError(`${where}: instants は epoch ミリ秒の数値配列（CliReport の points と同じ規約）`);
    }
    if ('labels' in e && !(Array.isArray(e.labels) && e.labels.every(l => typeof l === 'string'))) {
      throw new KairosError(`${where}: labels は文字列配列`);
    }
    table.set(key, {
      ...(hasDates ? { dates: e.dates as string[] } : { instants: e.instants as number[] }),
      covering: e.covering,
      asof: e.asof,
      ...('labels' in e ? { labels: e.labels as string[] } : {}),
    });
  }
  return (premise, binding) => {
    const hit = table.get(`${premise}.${binding}`) ?? table.get(binding);
    if (!hit) {
      throw new SupplyError(`供給エラー: --supply ${origin} に ${binding} がない`
        + `（キーは束縛名または "premise.束縛名"——ここでは "${premise}.${binding}"）`);
    }
    return hit;
  };
}

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
      source: res.source, line: res.line, dates: res.dates, points: res.points, annotations: res.annotations,
      ...(res.stages ? { stages: res.stages } : {}),
    })),
    coverage: r.coverage,
    warnings: r.warnings,
  };
}

/** list: 範囲 [from, to) の全発火＋註釈＋被覆サマリ */
export function cmdList(source: string, o: CmdOpts & { to: string }): CliReport {
  const r = run(source, { from: o.from, to: o.to,
    ...(o.tz ? { tz: o.tz } : {}), ...(o.resolve ? { resolve: o.resolve } : {}), ...(o.explain ? { explain: true } : {}) });
  // 本体式の無いファイル（空・premise だけ）は exit 0 の空出力だった（境界チェックリスト 2026-09-29・F126）
  if (r.results.length === 0) throw new KairosError('本体式がない（評価する式を 1 行以上書く。premise だけのファイルは評価対象が無い）');
  return toReport('list', r, o);
}

/** next: from 以降の次の N 発火。窓を 7 日から倍々に広げて探索し（1 年以降は年単位・上限＝horizon 年）、
 *  見つかったら [from, 最終発火日の翌日) で確定再評価——註釈・残走路が答えの範囲と整合する。
 *  地平線まで探して不足なら見つかった分を返す（found < requested）。 */
export function cmdNext(source: string, o: CmdOpts & { n: number; horizonYears: number }): CliReport {
  const meta = { requested: o.n, found: 0, horizonYears: o.horizonYears };
  const runOpts = { ...(o.tz ? { tz: o.tz } : {}), ...(o.resolve ? { resolve: o.resolve } : {}), ...(o.explain ? { explain: true } : {}) };
  // 探索窓は 7 日から倍々（〜224 日）→1 年から倍々→地平線（90-open 2-4・1.0 追補 23。旧: 1 年から——1 秒刻みの列では 1 点のために
  // 約 3,100 万点を実体化して実用上止まった）。確定再評価の意味論は不変（見つかった窓で [from, 最終発火日の翌日) を再評価）
  const steps: string[] = [];
  for (let d = 7; d < 366; d *= 2) steps.push(addDays(o.from, d));
  for (let y = 1; y < o.horizonYears; y *= 2) steps.push(addYears(o.from, y));
  steps.push(addYears(o.from, o.horizonYears));
  for (const to of steps) {
    const r = run(source, { from: o.from, to, ...runOpts });
    if (r.results.length === 0) throw new KairosError('本体式がない（評価する式を 1 行以上書く。premise だけのファイルは評価対象が無い）');
    if (r.results.length > 1) throw new KairosError(
      `next は本体式 1 つのファイル向け（${r.results.length} 式ある——list を使うか式を 1 つに）`);
    const found = r.results[0];
    if (found.dates.length >= o.n) {
      // 確定再評価: 右端＝N 発火目の翌市民日（同日複数瞬間の切り落としは slice で）
      const toFinal = addDays(found.dates[o.n - 1].slice(0, 10), 1);
      const rf = run(source, { from: o.from, to: toFinal, ...runOpts });
      const res = rf.results[0];
      res.dates = res.dates.slice(0, o.n);
      res.points = res.points.slice(0, o.n);
      return toReport('next', rf, { ...o, to: toFinal }, { ...meta, found: o.n });
    }
    if (to === steps[steps.length - 1]) {
      return toReport('next', r, { ...o, to }, { ...meta, found: found.dates.length });
    }
  }
  throw new Error('unreachable');
}

/** 表示言語（--lang en で定型出力の枠組みだけ英語化。評価器メッセージ＝エラー・註釈文は
 * 日本語が正のまま・--json は言語中立——線引きは en/playground と同一） */
export type CliLang = 'ja' | 'en';
const CLI_STRINGS = {
  ja: {
    exprHead: (i: number, n: number) => `# 式 ${i}（${n} 件）`,
    coverageHead: '# 被覆サマリ',
    concluded: '（完結主張）',
    runway: (d: number | null) => `残走路 ${d === null ? '∞' : `${d} 日`}`,
    warning: (w: string) => `警告: ${w}`,
    horizonShort: (rep: CliReport) =>
      `⚠ 地平線 ${rep.horizonYears} 年以内の発火は ${rep.found} 件（要求 ${rep.requested} 件）`,
    empty: (rep: CliReport) => `# 0 点（[${rep.from}, ${rep.to}) に該当なし）`,
    explain: (st: StageTrace[]) => '# explain: ' + st.map(s =>
      `${s.stage} ${s.count}${s.windows !== undefined ? ` [窓 ${s.windows}]` : ''}${s.annotations ? ` ⚠${s.annotations}` : ''}`).join(' → '),
  },
  en: {
    exprHead: (i: number, n: number) => `# expression ${i} (${n} point${n === 1 ? '' : 's'})`,
    coverageHead: '# coverage summary',
    concluded: '(concluded)',
    runway: (d: number | null) => `runway ${d === null ? '∞' : `${d} day${d === 1 ? '' : 's'}`}`,
    warning: (w: string) => `warning: ${w}`,
    horizonShort: (rep: CliReport) =>
      `⚠ only ${rep.found} firing(s) within the ${rep.horizonYears}-year horizon (requested ${rep.requested})`,
    empty: (rep: CliReport) => `# 0 points (nothing in [${rep.from}, ${rep.to}))`,
    explain: (st: StageTrace[]) => '# explain: ' + st.map(s =>
      `${s.stage} ${s.count}${s.windows !== undefined ? ` [${s.windows} window${s.windows === 1 ? '' : 's'}]` : ''}${s.annotations ? ` ⚠${s.annotations}` : ''}`).join(' → '),
  },
} as const;

/** 人間向け表示（stdout 行列）。--json と同じ CliReport から出す */
export function renderHuman(rep: CliReport, lang: CliLang = 'ja'): string[] {
  const T = CLI_STRINGS[lang];
  const out: string[] = [];
  rep.results.forEach((res, i) => {
    if (rep.results.length > 1) out.push(T.exprHead(i + 1, res.dates.length));
    // 単一式の 0 点は黙らない（複数式は見出し行が点数を出す・next は ⚠ 地平線行が出る）——# 接頭なので
    // 機械処理はコメントとして落とせる。exit 0 は不変＝空は正当な結果（手当て (a)・2026-09-29 裁定・1.0 追補 22）
    else if (rep.command === 'list' && res.dates.length === 0) out.push(T.empty(rep));
    for (const d of res.dates) out.push(d);
    // 区間註釈（ADR-37 判断 5/7 (a)）: 結果の後に表示——対処は呼び手の責務（判定は外部）
    for (const a of res.annotations) out.push(`# ⚠ ${formatAnnotation(a)}`);
    // --explain: 段ごとの途中値と点数（SQL の実行計画に相当・# 接頭でコメント扱い）
    if (res.stages) out.push(T.explain(res.stages));
  });
  // 被覆サマリ（ADR-37 判断 7 (b)）: クリップしない・完結主張も常時表示
  if (rep.coverage.length > 0) {
    out.push(T.coverageHead);
    for (const c of rep.coverage) {
      out.push(`#   ${c.source} covering ${c.covering}${c.asof ? ` asof ${c.asof}` : ''}`
        + `${c.concluded ? T.concluded : ''}`
        + ` ${T.runway(c.runwayDays)}`);
    }
  }
  return out;
}

const USAGE_JA = `使い方（kairos ＝ node src/cli.ts）:
  kairos list [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--tz Zone] [--supply data.json] [--json] [--explain] [--lang en] <file.kairos>
      範囲 [from, to) の全発火・区間註釈・被覆サマリ（既定: 機械の tz の今日から 1 年）
  kairos next [-n 件数] [--from YYYY-MM-DD] [--horizon 年数] [--tz Zone] [--supply data.json] [--json] [--explain] [--lang en] <file.kairos>
      from 以降の次の N 発火（既定: n=1・from=今日・地平線 10 年。本体式 1 つのファイル向け）
  --tz: ラベルと [from, to) の端点の tz（既定＝機械の tz。定義の premise tz と違うと日粒度の点は時刻付きで印字される）
  --supply: external の解決値を静的束で渡す——{束縛名: {dates|instants, covering, asof [, labels]}}
  --lang en: 定型出力の枠組みを英語表示（エラー・註釈文は日本語が正のまま・--json は言語中立）
  --explain: 本体式の段ごとの点数と途中値を # explain: 行（--json では results[].stages）に出す
サブコマンド省略時は list・--version で実装版。終了コード: 0=成功・1=エラー・2=next が地平線内に要求件数未達`;

const USAGE_EN = `Usage (kairos = node src/cli.ts):
  kairos list [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--tz Zone] [--supply data.json] [--json] [--explain] [--lang en] <file.kairos>
      All firings in [from, to) plus interval annotations and the coverage summary
      (default: one year from today in the machine's time zone)
  kairos next [-n count] [--from YYYY-MM-DD] [--horizon years] [--tz Zone] [--supply data.json] [--json] [--explain] [--lang en] <file.kairos>
      The next N firings at or after from (default: n=1, from=today, horizon 10 years;
      intended for files with a single body expression)
  --tz: zone for labels and the [from, to) endpoints (default: the machine's time zone; if it differs from
      the definition's premise tz, day-granular points are printed with a time of day)
  --supply: static bundle resolving external() — {binding: {dates|instants, covering, asof [, labels]}}
  --lang en: English framing for the human-readable output. Evaluator messages (errors and
      annotation texts) stay in Japanese — the implementation's canonical output language;
      --json output is language-neutral.
  --explain: print per-stage point counts and intermediate values as a # explain: line (results[].stages with --json).
Without a subcommand, list is assumed. --version prints the implementation version.
Exit codes: 0=success, 1=error, 2=next found fewer firings than requested within the horizon`;

/** USAGE の言語選択——パース失敗経路でも使えるよう argv の素朴な走査で決める */
const pickUsage = (argv: string[]) =>
  argv.includes('--lang') && argv[argv.indexOf('--lang') + 1] === 'en' ? USAGE_EN : USAGE_JA;

const OPTS = {
  list: {
    from: { type: 'string' }, to: { type: 'string' },
    tz: { type: 'string' }, supply: { type: 'string' }, json: { type: 'boolean' },
    lang: { type: 'string' }, explain: { type: 'boolean' },
  },
  next: {
    n: { type: 'string', short: 'n' }, from: { type: 'string' }, horizon: { type: 'string' },
    tz: { type: 'string' }, supply: { type: 'string' }, json: { type: 'boolean' },
    lang: { type: 'string' }, explain: { type: 'boolean' },
  },
} as const;

const posInt = (s: string, name: string) => {
  if (!/^\d+$/.test(s) || +s < 1) throw new KairosError(`${name} は正の整数: ${s}`);
  return +s;
};

/** 入口（SEA ビルドのエントリスタブからも呼ぶ）。戻り値＝終了コード */
/** --json のエラー表面を組む（テストと main が共有） */
export function errorReport(command: 'list' | 'next', kind: CliErrorReport['error']['kind'], message: string): CliErrorReport {
  return { command, version: VERSION, error: { kind, message } };
}

export function main(argv: string[]): number {
  if (argv[0] === '--version' || argv[0] === '-v') {   // 配布バイナリの身元確認（単体で 0 終了）
    console.log(VERSION);
    return 0;
  }
  let cmd: 'list' | 'next';
  let rest = argv;
  if (argv[0] === 'list' || argv[0] === 'next') {
    cmd = argv[0];
    rest = argv.slice(1);
  } else if (argv[0] === '--help' || argv[0] === '-h') {   // 使い方は求められたときは stdout・終了 0
    console.log(pickUsage(argv));
    return 0;
  } else if (argv.length > 0) {
    cmd = 'list';                     // サブコマンド省略は list——旧形式（ファイル先頭）もフラグ先頭も同じ（軽微 14）
  } else {
    console.error(pickUsage(argv));
    return 1;
  }
  const jsonMode = rest.includes('--json');           // エラーも JSON で返す（CliErrorReport・1.0 追補 23）
  let phase: 'usage' | 'supply' | 'eval' = 'usage';   // cmdList/cmdNext に入る前の失敗は usage（--supply の形の検査だけ supply）
  try {
    const { values, positionals } = parseArgs(
      { args: rest, options: OPTS[cmd], allowPositionals: true, strict: true });
    const langValue = (values as { lang?: string }).lang ?? 'ja';
    if (langValue !== 'ja' && langValue !== 'en') {
      throw new KairosError(`--lang は ja または en: ${langValue}`);
    }
    const lang: CliLang = langValue;
    const T = CLI_STRINGS[lang];
    if (positionals.length !== 1) throw new KairosError('ファイルを 1 つ指定する');
    const source = readInput(positionals[0], '定義ファイル');
    const tz = (values.tz as string | undefined) ?? hostTz();   // 既定＝機械の tz（--tz で上書き）
    const from = (values.from as string | undefined) ?? todayIn(tz);
    const supplyPath = (values as { supply?: string }).supply;
    let resolve: ExternalResolver | undefined;
    if (supplyPath) {
      const text = readInput(supplyPath, '--supply のファイル');
      let json: unknown;
      try { json = JSON.parse(text); } catch (e) {
        throw new KairosError(`--supply の JSON が壊れている（${supplyPath}）: ${(e as Error).message}`);
      }
      phase = 'supply';                               // JSON は読めた——以降の形の検査は供給契約の違反（kind supply）
      resolve = supplyResolver(json, supplyPath);
      phase = 'usage';
    }

    const explain = (values as { explain?: boolean }).explain === true;
    let rep: CliReport;
    if (cmd === 'list') {
      const to = (values as { to?: string }).to ?? addYears(from, 1);
      phase = 'eval';
      rep = cmdList(source, { from, to, tz, ...(resolve ? { resolve } : {}), ...(explain ? { explain } : {}) });
    } else {
      const n = posInt((values as { n?: string }).n ?? '1', '-n');
      const horizonYears = posInt((values as { horizon?: string }).horizon ?? '10', '--horizon');
      phase = 'eval';
      rep = cmdNext(source, { from, n, horizonYears, tz, ...(resolve ? { resolve } : {}), ...(explain ? { explain } : {}) });
    }

    if (values.json) console.log(JSON.stringify(rep, null, 2));
    else for (const line of renderHuman(rep, lang)) console.log(line);
    for (const w of rep.warnings) console.error(T.warning(w));
    if (rep.command === 'next' && rep.found! < rep.requested!) {
      console.error(T.horizonShort(rep));
      return 2;
    }
    return 0;
  } catch (e) {
    const code = e instanceof Error && 'code' in e ? String(e.code) : '';
    if (code.startsWith('ERR_PARSE_ARGS')) {
      // 引数の誤り（未知フラグ・値の欠落）は Node の parseArgs の英語文言のままだった（軽微 13）。--lang en は原文を出す
      const opt = /'(-{1,2}[^'\s<]+)/.exec((e as Error).message)?.[1] ?? '';
      const ja = code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' ? `未知のオプション: ${opt}`
        : code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE'
          ? `オプション ${opt} の値が無いか、- で始まっている（- で始まる値は ${opt.startsWith('--') ? `${opt}=値` : `${opt}値`} の形で書く）`
          : (e as Error).message;
      const msg = pickUsage(argv) === USAGE_EN ? (e as Error).message : ja;
      if (jsonMode) { console.log(JSON.stringify(errorReport(cmd, 'usage', msg), null, 2)); return 1; }
      console.error(msg);
      console.error(pickUsage(argv));  // 使い方を添える
      return 1;
    }
    const message = String(e instanceof Error ? e.message : e);
    if (jsonMode) {
      // --json のエラーは stdout の JSON（CliErrorReport）——機械の消費側が stderr を読まずに済む（1.0 追補 23）
      const kind = e instanceof SupplyError || phase === 'supply' ? 'supply' : phase === 'usage' ? 'usage' : 'static';
      console.log(JSON.stringify(errorReport(cmd, kind, message), null, 2));
      return 1;
    }
    console.error(message);
    return 1;
  }
}

// vitest からの import では実行しない（テストは cmdList/cmdNext/renderHuman を直接呼ぶ）。
// npm の bin は node_modules/.bin/kairos → dist/cli.js のシンボリックリンクで、argv[1] がリンク側・import.meta.url が
// 実体側になる——URL の文字列一致では main() が走らず黙って終了した（2026-09-07 pack→install 実走で検出）。
// realpath で比較する。SEA（tools/build-sea）は import.meta.url を undefined に潰すので偽に落ち、二重実行しない。
const isMain = (() => {
  if (!process.argv[1] || typeof import.meta.url !== 'string') return false;
  try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
})();
// process.exit() は stdout の未送出分を捨てる——stdout がパイプのとき（`| jq`・`$(…)`・MCP の子プロセス）大きな出力の末尾が
// 黙って欠落し、--json は 64 KB（パイプのバッファ 1 つ分）で切れて不正な JSON になった（2026-09-29 レッドチーム監査の実測＝F113・
// 604,800 行中 467,147 行）。終了コードは exitCode に置き、イベントループの排出を待ってから終了する（main は同期・開いたハンドルは無い）。
if (isMain) process.exitCode = main(process.argv.slice(2));
