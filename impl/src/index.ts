// Kairos リファレンス実装（プロトタイプ）— 公開 API
import { readFileSync } from 'node:fs';
import { parse } from './parser.ts';
import { Runtime, Evaluator, KairosError } from './eval.ts';
import { getTz } from './tz.ts';
import type { RunOptions, RunResult } from './eval.ts';
import type { Expr } from './ast.ts';

export { parse } from './parser.ts';
export { lex } from './lexer.ts';
export { KairosError, formatAnnotation } from './eval.ts';
export type { RunOptions, RunResult } from './eval.ts';

// 標準 premise の読み込み順は依存順（派生は base の登録が先に要る）。readdir の辞書順は不可
const STDLIB_FILES = ['gregorian.kairos', 'fiscal.kairos', 'isoweek.kairos'];
const stdlibSource = STDLIB_FILES
  .map(f => readFileSync(new URL(`../stdlib/${f}`, import.meta.url), 'utf8'))
  .join('\n');

/** Kairos プログラムを評価し、各本体式の時間ストリームを [from, to) で返す */
export function run(source: string, opts: RunOptions): RunResult {
  const tz = opts.tz ?? 'Asia/Tokyo';
  const tzObj = getTz(tz);
  const d = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) throw new KairosError(`日付は YYYY-MM-DD: ${s}`);
    return tzObj.civilDayStart(+m[1], +m[2], +m[3]);   // 評価範囲の端は実行 tz の市民日
  };
  const rt = new Runtime(d(opts.from), d(opts.to), tz);
  const ev = new Evaluator(rt);

  const stdlib = parse(stdlibSource);
  const program = parse(source);

  // stdlib の premise を先に登録（cycle ラベル語彙の走査を含む）
  for (const st of stdlib.statements) {
    if (st.t === 'premiseDef') ev.registerPremise(st);
  }
  for (const st of program.statements) {
    if (st.t === 'premiseDef') for (const b of st.block?.bindings ?? []) ev.scanVocab(b.rhs);
  }

  const defaultMembers = new Map<string, string | Expr>();
  const results = ev.runProgram(program, defaultMembers);
  // 被覆サマリ（ADR-37 判断 7 (b)）: クリップしない静的な監視面。残走路＝評価 to から覆域終端まで
  const coverage = [...rt.coverage.values()].map(c => ({
    source: c.source,
    covering: c.covering,
    ...(c.asof ? { asof: c.asof } : {}),
    concluded: c.concluded,
    runwayDays: Number.isFinite(c.covEnd) ? Math.round((c.covEnd - rt.toMs) / 86_400_000) : null,
  }));
  return {
    results,
    coverage,
    warnings: rt.warnings,
    format: ms => rt.fmt(ms),
    runtime: rt,
  };
}

/** 単一式の評価糖衣: 最後の本体式の日付列を返す */
export function evalDates(source: string, opts: RunOptions): string[] {
  const r = run(source, opts);
  if (r.results.length === 0) throw new KairosError('本体式がない');
  return r.results[r.results.length - 1].dates;
}
