// 評価の経路（list／next／validate）の本体＝HTTP に依らない純粋な関数。worker スレッド（worker.ts）の中で動かす。
// 評価器（kairos-lang）は呼び手が渡す（createRoutes の引数）＝worker は環境変数で読み込み元を差し替えられるので、静的 import にしない。
// 当て先は参照実装の CLI と同じ関数（cmdList／cmdNext）＝`--json` と同じ CliReport をそのまま返す。エラーの本文も CLI `--json` のエラー面（errorReport）。
import type { CliReport, CliErrorReport, cmdList, cmdNext, supplyResolver, errorReport, todayIn } from 'kairos-lang/cli';
import type { KairosError, SupplyError, parse, ExternalResolver } from 'kairos-lang';

/** 殻が使う評価器の面（kairos-lang と kairos-lang/cli の export のうち必要なもの） */
export interface Evaluator {
  cmdList: typeof cmdList;
  cmdNext: typeof cmdNext;
  supplyResolver: typeof supplyResolver;
  errorReport: typeof errorReport;
  todayIn: typeof todayIn;
  parse: typeof parse;
  KairosError: typeof KairosError;
  SupplyError: typeof SupplyError;
}

// 上限（mcp の LIMITS と同じ値＝87 §3「DoS でなく事故防止」）に、本文・応答の大きさと同時実行・時間を足す。
// expressions＝1 つの source の本体式の数（2026-10-31 セキュリティレビュー所見 1・2: 1 行に式を N 個並べると CliReport の各 result の
// source が行全体になり応答が N² で増えた＝64 KiB の要求に 390 MB の応答。式の数で止める）
export const LIMITS = { sourceBytes: 64 * 1024, windowYears: 10, n: 1000, horizonYears: 10, expressions: 100 } as const;
export const BODY_BYTES = 256 * 1024;
export const DEFAULT_RESPONSE_BYTES = 32 * 1024 * 1024;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
export const STATUS = { usage: 400, static: 400, supply: 422 } as const;

export type Body = Record<string, unknown>;
export type Route = 'list' | 'next' | 'validate';
export type Outcome = { status: number; body: unknown };

// ISO 文字列で読む＝Date.UTC の 2 桁年の読み替え（0099 → 1999）を避ける
const ymdMs = (s: string) => Date.parse(`${s}T00:00:00Z`);
const yearsBetween = (from: string, to: string) => (ymdMs(to) - ymdMs(from)) / (365.25 * 86_400_000);
const isRealYmd = (s: string) => { const ms = ymdMs(s); return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === s; };

/** tz の値域＝評価器の getTz と同じ（IANA 名は Intl が受けるか・固定オフセットは厳格一意形 "±HH:MM" だけ＝ADR-43・"UTC" は IANA 名）。
 *  Intl だけでは "+0900" のような別綴りも通り、評価器で static に落ちていた（2026-10-31 所見 11） */
export function isValidTz(tz: string): boolean {
  if (/^[+-]/.test(tz) || tz === 'Z' || /^UTC.+/.test(tz)) {
    const m = /^([+-])(\d{2}):(\d{2})$/.exec(tz);
    return !!m && +m[2] <= 14 && +m[3] <= 59;
  }
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

// 本文の形（必須・型・未知の鍵）。違反は usage
const ALLOWED = {
  list: ['source', 'from', 'to', 'tz', 'supply', 'explain'],
  next: ['source', 'tz', 'from', 'n', 'horizonYears', 'supply', 'explain'],
  validate: ['source', 'tz'],
} as const;

/** 評価の経路の本体を、渡された評価器に束ねて作る */
export function createRoutes(ev: Evaluator) {
  const { KairosError, SupplyError } = ev;

  function checkTz(tz: string): void {
    if (!isValidTz(tz)) throw new KairosError(`tz が無効: ${tz}（IANA 名か固定オフセットの正準形 "±HH:MM" で指定する。例 Asia/Tokyo・America/New_York・UTC・+09:00）`);
  }

  /** 本体式の数（前文ブロックの内側も数える＝CliReport の results と同じ数え方）。構文の誤りはここでは黙って通し、評価で static にする */
  function countExpressions(source: string): number {
    let n = 0;
    const count = (sts: { t: string; block?: unknown }[]) => {
      for (const st of sts) {
        if (st.t === 'streamExpr') n++;
        else if (st.t === 'preamble' && Array.isArray(st.block)) count(st.block as { t: string; block?: unknown }[]);
      }
    };
    try { count(ev.parse(source).statements as { t: string; block?: unknown }[]); } catch { return 0; }
    return n;
  }

  function checkSource(source: string): void {
    if (Buffer.byteLength(source, 'utf8') > LIMITS.sourceBytes) throw new KairosError(`source が大きすぎる（上限 ${LIMITS.sourceBytes} バイト）`);
    const n = countExpressions(source);
    if (n > LIMITS.expressions) throw new KairosError(`本体式が多すぎる（${n} 個・上限 ${LIMITS.expressions}）`);
  }

  function checkShape(route: Route, b: Body): void {
    for (const k of Object.keys(b)) {
      if (!(ALLOWED[route] as readonly string[]).includes(k)) throw new KairosError(`未知の鍵: ${k}（受ける鍵は ${ALLOWED[route].join('・')}）`);
    }
    if (typeof b.source !== 'string') throw new KairosError('source（定義の文字列）が必須');
    if (typeof b.tz !== 'string') throw new KairosError('tz（IANA 名の文字列）が必須（例 Asia/Tokyo）');
    for (const k of ['from', 'to'] as const) {
      const v = b[k];
      if (v === undefined) continue;
      if (!(typeof v === 'string' && YMD.test(v))) throw new KairosError(`${k} は YYYY-MM-DD の文字列: ${JSON.stringify(v)}`);
      // 実在しない日付（2026-13-45）は評価器で 2027-02-14 に正規化され「評価範囲が逆順」と見当違いの診断になっていた（2026-10-31 所見 6）
      if (!isRealYmd(v)) throw new KairosError(`${k} は実在する日付（YYYY-MM-DD・月は 01〜12・日はその月の日数まで）: ${v}`);
    }
    if (route === 'list' && (b.from === undefined || b.to === undefined)) throw new KairosError('from と to（YYYY-MM-DD）が必須');
    const int = (k: 'n' | 'horizonYears', max: number) => {
      const v = b[k];
      if (v !== undefined && !(Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max)) {
        throw new KairosError(`${k} は 1〜${max} の整数: ${typeof v === 'number' ? String(v) : JSON.stringify(v)}`);   // Infinity は JSON で null になるので String で
      }
    };
    int('n', LIMITS.n); int('horizonYears', LIMITS.horizonYears);
    if (b.explain !== undefined && typeof b.explain !== 'boolean') throw new KairosError(`explain は真偽値: ${JSON.stringify(b.explain)}`);
    // supply は静的束（JSON オブジェクト）だけ。URL の文字列は受けない＝殻は外へ出ない
    if (b.supply !== undefined && (typeof b.supply !== 'object' || b.supply === null || Array.isArray(b.supply))) {
      throw new KairosError('supply は {束縛名: {dates|instants, covering, asof}} の JSON オブジェクト（URL は受けない＝表の取得は呼び手の仕事）');
    }
  }

  /** CLI の main と同じ写像: usage（入力の形）／supply（供給契約）／static（定義の字句・構文・静的・評価）。
   *  評価器の例外（KairosError・SupplyError）でないもの（エンジンの RangeError 等）は定義の誤りではないので 500＝内部の誤り（文言は固定・2026-10-31 所見 5） */
  function runGuarded(command: 'list' | 'next', phases: { usage: () => void; supply: () => ExternalResolver | undefined; eval: (resolve?: ExternalResolver) => CliReport }): Outcome {
    let phase: 'usage' | 'supply' | 'eval' = 'usage';
    try {
      phases.usage();
      phase = 'supply';
      const resolve = phases.supply();
      phase = 'eval';
      return { status: 200, body: phases.eval(resolve) };
    } catch (e) {
      if (phase === 'eval' && !(e instanceof KairosError) && !(e instanceof SupplyError)) return internalError();
      const message = String(e instanceof Error ? e.message : e);
      const kind = e instanceof SupplyError || phase === 'supply' ? 'supply' : phase === 'usage' ? 'usage' : 'static';
      return { status: STATUS[kind], body: ev.errorReport(command, kind, message) };
    }
  }

  const supplyOf = (supply: unknown) => supply === undefined ? undefined : ev.supplyResolver(supply, 'request body "supply"');

  function list(b: Body): Outcome {
    return runGuarded('list', {
      usage: () => {
        checkShape('list', b);
        const { source, tz, from, to } = b as { source: string; tz: string; from: string; to: string };
        checkSource(source); checkTz(tz);
        if (yearsBetween(from, to) > LIMITS.windowYears) throw new KairosError(`評価範囲が広すぎる（上限 ${LIMITS.windowYears} 年）: [${from}, ${to})`);
      },
      supply: () => supplyOf(b.supply),
      eval: resolve => ev.cmdList(b.source as string, { from: b.from as string, to: b.to as string, tz: b.tz as string,
        ...(resolve ? { resolve } : {}), ...(b.explain ? { explain: true } : {}) }),
    });
  }

  function next(b: Body): Outcome {
    return runGuarded('next', {
      usage: () => { checkShape('next', b); checkSource(b.source as string); checkTz(b.tz as string); },
      supply: () => supplyOf(b.supply),
      eval: resolve => ev.cmdNext(b.source as string, { from: (b.from as string | undefined) ?? ev.todayIn(b.tz as string), n: (b.n as number | undefined) ?? 1,
        horizonYears: (b.horizonYears as number | undefined) ?? LIMITS.horizonYears, tz: b.tz as string,
        ...(resolve ? { resolve } : {}), ...(b.explain ? { explain: true } : {}) }),
    });
  }

  /** mcp の kairos_validate と同じ本文: 空の窓 [今日, 今日) で評価し、所見は ok: false と diagnostics（所見は要求の誤りではない＝200） */
  function validate(b: Body): Outcome {
    // 要求の形の誤り（必須の欠け・型・未知の鍵）は所見でなく要求の誤り＝400
    try { checkShape('validate', b); } catch (e) { return requestError('validate', 400, (e as Error).message); }
    const r = runGuarded('list', {
      usage: () => { checkSource(b.source as string); checkTz(b.tz as string); },
      supply: () => undefined,
      eval: () => { const d = ev.todayIn(b.tz as string); return ev.cmdList(b.source as string, { from: d, to: d, tz: b.tz as string }); },
    });
    if (r.status === 500) return r;
    if (r.status !== 200) {
      const e = r.body as CliErrorReport;
      return { status: 200, body: { ok: false, version: e.version, diagnostics: [e.error] } };
    }
    const rep = r.body as CliReport;
    return { status: 200, body: { ok: true, version: rep.version, diagnostics: [], expressions: rep.results.length } };
  }

  const version = ev.errorReport('list', 'usage', '').version;

  /** 殻そのものの不具合・評価器の素の例外。本文（source）は返さず記録もしない */
  function internalError(): Outcome {
    return { status: 500, body: { version, error: { kind: 'internal', message: '内部のエラー' } } };
  }

  /** 要求の形の誤り（本文が JSON でない・大きすぎる・Content-Type）を経路ごとのエラー面で包む */
  function requestError(command: Route, status: number, message: string): Outcome {
    if (command === 'validate') return { status, body: { ok: false, version, diagnostics: [{ kind: 'usage', message }] } };
    return { status, body: ev.errorReport(command, 'usage', message) };
  }

  /** 応答の本文（CLI の --json の stdout と同じ字面＝2 字下げ・末尾改行）。上限を越える応答は usage に差し替える（2026-10-31 所見 2） */
  function render(command: Route, o: Outcome, maxResponseBytes: number): { status: number; text: string } {
    const text = JSON.stringify(o.body, null, 2) + '\n';
    if (o.status === 200 && Buffer.byteLength(text) > maxResponseBytes) {
      const err = requestError(command, 400, `応答が大きすぎる（${Buffer.byteLength(text)} バイト・上限 ${maxResponseBytes}）——範囲を狭めるか幅を粗くする`);
      return { status: err.status, text: JSON.stringify(err.body, null, 2) + '\n' };
    }
    return { status: o.status, text };
  }

  const run = (route: Route, b: Body): Outcome => route === 'list' ? list(b) : route === 'next' ? next(b) : validate(b);

  return { run, render, requestError, internalError, version };
}

export type Routes = ReturnType<typeof createRoutes>;
