// Kairos HTTP shell — kairos-lang-http（2026-10-24 決定: 言語側の別パッケージ・mcp/ と同型）。経路の当て先は参照実装の CLI と同じ関数
// （kairos-lang/cli の cmdList／cmdNext）＝`--json` と同じ CliReport をそのまま返す。エラーの本文も CLI `--json` のエラー面（errorReport）。
// 持たないもの: 状態・認証・課金・ログの保存・URL の取得（supply は本文の静的束だけ）。tz は必須（コンテナの tz に依らせない）。
// 評価は常駐の worker プロセス（同時実行数ぶん・child_process.fork）で動かす＝1 要求の時間を打ち切れる（KAIROS_HTTP_TIMEOUT_MS）・待ち受けは
// 止まらない（/healthz は常に応答）・評価器のヒープ枯渇は worker だけが落ちて 500 になる（2026-10-31 セキュリティレビュー所見 1・3・4）。
// スレッド（worker_threads）でなくプロセスなのは、V8 の致命エラー（ヒープ枯渇）はスレッドでは隔離できずプロセスごと SIGABRT になるため（実測）。
import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse, Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { errorReport, cmdList, cmdNext, supplyResolver, todayIn } from 'kairos-lang/cli';
import { parse, KairosError, SupplyError } from 'kairos-lang';
import { createRoutes, LIMITS, BODY_BYTES, DEFAULT_RESPONSE_BYTES } from './routes.ts';
import type { Body, Route } from './routes.ts';
import type { Job, Reply } from './worker.ts';

export { LIMITS, BODY_BYTES, DEFAULT_RESPONSE_BYTES };

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')) as { version: string };
/** この殻の版＝kairos-lang に追随（同じ番号＝同じ契約） */
export const SHELL_VERSION: string = PKG.version;
/** 評価器（kairos-lang）の版＝CliReport の version と同じ値 */
export const KAIROS_LANG_VERSION: string = errorReport('list', 'usage', '').version;

export const DEFAULT_MAX_CONCURRENCY = 4;
export const DEFAULT_TIMEOUT_MS = 10_000;
/** 要求の読み込みの時間の上限（ヘッダ・本文）。遅い送信が待ち受けを握り続けない（所見 4）。評価の時間は TIMEOUT_MS が別に守る */
export const REQUEST_TIMEOUT_MS = 30_000;
export const HEADERS_TIMEOUT_MS = 15_000;

// 待ち受けのスレッドでも使う経路の部品（エラーの顔の生成）。評価そのものは worker
const local = createRoutes({ cmdList, cmdNext, supplyResolver, errorReport, todayIn, parse, KairosError, SupplyError });

/** worker の入口（ソースのまま動かすとき .ts・配布物は .js） */
const WORKER_PATH = fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? './worker.ts' : './worker.js', import.meta.url));

type Outcome = { status: number; body: unknown };
type Rendered = { status: number; text: string };

/** 経路の外の誤り（404・405・413・415・429）の本文。CLI のエラー面と同じ鍵（error.kind・message）に command を持たない形 */
const shellError = (message: string) => ({ version: KAIROS_LANG_VERSION, error: { kind: 'usage', message } });
const render = (o: Outcome): Rendered => ({ status: o.status, text: JSON.stringify(o.body, null, 2) + '\n' });
const INTERNAL = render(local.internalError());
const timeoutError = (ms: number): Rendered => render({ status: 504, body: { version: KAIROS_LANG_VERSION, error: { kind: 'timeout',
  message: `評価が時間の上限（${ms} ms）を超えたので打ち切った——範囲を狭めるか幅を粗くする。上限は KAIROS_HTTP_TIMEOUT_MS` } } });

export type LogMode = 'access' | 'off';
export interface ShellOptions {
  /** 評価の同時実行の上限＝常駐 worker の数。全部が評価中なら即 429（Retry-After つき） */
  maxConcurrency?: number;
  /** 1 要求の評価の時間の上限（ms）。超えたら worker を止めて 504・worker は作り直す */
  timeoutMs?: number;
  /** 応答の本文の上限（バイト）。超えたら 400 usage「応答が大きすぎる」 */
  maxResponseBytes?: number;
  /** worker 1 つのヒープの上限（MB＝--max-old-space-size）。超えた評価は worker だけが落ちて 500・worker は作り直す。未設定＝Node の既定 */
  workerHeapMb?: number;
  /** 評価器の読み込み元（kairos-lang のソース木のディレクトリ）。witness 用・普段は未設定＝npm の kairos-lang */
  evaluator?: string;
  /** access＝1 要求 1 行（メソッド・パス・状態・ミリ秒）を stderr へ。本文（source）は書かない。off＝書かない */
  log?: LogMode;
}

/** 環境変数（KAIROS_HTTP_MAX_CONCURRENCY・KAIROS_HTTP_TIMEOUT_MS・KAIROS_HTTP_WORKER_HEAP_MB・KAIROS_HTTP_LOG・KAIROS_HTTP_EVALUATOR）から既定の設定を読む */
export function optionsFromEnv(env: NodeJS.ProcessEnv = process.env): Required<Omit<ShellOptions, 'evaluator' | 'workerHeapMb'>> & Pick<ShellOptions, 'evaluator' | 'workerHeapMb'> {
  const positiveInt = (name: string, fallback: number | undefined) => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${name} は正の整数: ${raw}`);
    return n;
  };
  const log = env.KAIROS_HTTP_LOG ?? 'access';
  if (log !== 'access' && log !== 'off') throw new Error(`KAIROS_HTTP_LOG は access または off: ${log}`);
  const heap = positiveInt('KAIROS_HTTP_WORKER_HEAP_MB', undefined);
  return {
    maxConcurrency: positiveInt('KAIROS_HTTP_MAX_CONCURRENCY', DEFAULT_MAX_CONCURRENCY)!,
    timeoutMs: positiveInt('KAIROS_HTTP_TIMEOUT_MS', DEFAULT_TIMEOUT_MS)!,
    maxResponseBytes: DEFAULT_RESPONSE_BYTES,
    log,
    ...(heap !== undefined ? { workerHeapMb: heap } : {}),
    ...(env.KAIROS_HTTP_EVALUATOR ? { evaluator: env.KAIROS_HTTP_EVALUATOR } : {}),
  };
}

interface Pending { resolve: (r: Rendered) => void; timer?: ReturnType<typeof setTimeout> }

/** 常駐 worker の群。空いている worker に 1 要求を渡し、時間の上限で止める。落ちた worker は作り直す */
class Pool {
  private idle: ChildProcess[] = [];
  private readonly all = new Set<ChildProcess>();
  private readonly pending = new Map<ChildProcess, Pending>();
  private ready = new Map<ChildProcess, Promise<void>>();
  private closed = false;
  private seq = 0;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly evaluator: string | undefined;
  private readonly heapMb: number | undefined;
  constructor(size: number, timeoutMs: number, maxResponseBytes: number, evaluator?: string, heapMb?: number) {
    this.timeoutMs = timeoutMs; this.maxResponseBytes = maxResponseBytes; this.evaluator = evaluator; this.heapMb = heapMb;
    for (let i = 0; i < size; i++) this.spawn();
  }
  /** 評価中でない worker の数（429 の判定） */
  get available(): number { return this.idle.length; }   // （参考値）
  private spawn(): void {
    if (this.closed) return;
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (this.evaluator) env.KAIROS_HTTP_EVALUATOR = this.evaluator; else delete env.KAIROS_HTTP_EVALUATOR;
    const w = fork(WORKER_PATH, [], { env, execArgv: this.heapMb !== undefined ? [`--max-old-space-size=${this.heapMb}`] : [], stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      serialization: 'advanced' });   // 構造化クローン＝JSON の Infinity→null のような変形を避ける
    this.all.add(w);
    // 準備完了（評価器を読み終えた合図）を待ってから使う。待っている間も idle に数える＝要求は合図の後に渡る
    let signalReady!: () => void;
    this.ready.set(w, new Promise<void>(r => { signalReady = r; }));
    w.on('message', (m: Reply) => {
      if (m.id === 0) { signalReady(); return; }
      const p = this.pending.get(w);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(w);
      this.idle.push(w);
      p.resolve({ status: m.status, text: m.text });
    });
    const fail = () => {
      this.all.delete(w);
      this.ready.delete(w);
      this.idle = this.idle.filter(x => x !== w);
      const p = this.pending.get(w);
      if (p) { clearTimeout(p.timer); this.pending.delete(w); p.resolve(INTERNAL); }   // 評価器のヒープ枯渇など＝500・source は返さない
      this.spawn();
    };
    w.on('error', fail);
    w.on('exit', () => { if (this.all.has(w)) fail(); });
    w.on('disconnect', () => { if (this.all.has(w)) { w.kill('SIGKILL'); fail(); } });
    this.idle.push(w);
  }
  /** 空いている worker があれば評価を渡す。無ければ undefined（呼び手が 429） */
  run(route: Route, body: Body): Promise<Rendered> | undefined {
    const w = this.idle.pop();
    if (!w) return undefined;
    return new Promise<Rendered>(resolve => {
      const p: Pending = { resolve };
      this.pending.set(w, p);
      const job: Job = { id: ++this.seq, route, body, maxResponseBytes: this.maxResponseBytes };
      // 評価器を読み終えた worker に渡し、渡した時点から時間を計る（起動直後・作り直し直後の読み込み時間は数えない）
      void this.ready.get(w)?.then(() => {
        if (this.pending.get(w) !== p) return;   // 待っている間に落ちた
        w.send(job);
        p.timer = setTimeout(() => {
          // 打ち切り: 応答は 504。代わりの worker を先に起こしてから（次の要求が 429 にならない）止める
          this.pending.delete(w);
          this.all.delete(w);
          this.ready.delete(w);
          resolve(timeoutError(this.timeoutMs));
          this.spawn();
          w.kill('SIGKILL');
        }, this.timeoutMs);
      });
    });
  }
  close(): void {
    this.closed = true;
    for (const w of this.all) w.kill('SIGKILL');
    this.all.clear(); this.idle = []; this.pending.clear(); this.ready.clear();
  }
}

const COMMON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } as const;

function send(res: ServerResponse, r: Rendered, headers: Record<string, string> = {}, head = false): void {
  res.writeHead(r.status, { ...COMMON_HEADERS, 'Content-Length': String(Buffer.byteLength(r.text)), ...headers });
  res.end(head ? undefined : r.text);
}

/** 本文を読む。上限を超えたら直ちに undefined（残りは読まない＝呼び手が 413 を書いて接続を閉じる） */
function readBody(req: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > BODY_BYTES) return resolve(undefined);
    const chunks: Buffer[] = [];
    let size = 0, done = false;
    const finish = (v: string | undefined) => { if (!done) { done = true; resolve(v); } };
    req.on('data', (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > BODY_BYTES) { chunks.length = 0; finish(undefined); return; }
      chunks.push(c);
    });
    req.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
    req.on('error', e => { if (!done) { done = true; reject(e); } });
  });
}

const ROUTES: Record<string, { method: 'GET' | 'POST'; command?: Route; body?: () => unknown }> = {
  '/v1/list': { method: 'POST', command: 'list' },
  '/v1/next': { method: 'POST', command: 'next' },
  '/v1/validate': { method: 'POST', command: 'validate' },
  '/v1/version': { method: 'GET', body: () => ({ kairosLang: KAIROS_LANG_VERSION, shell: SHELL_VERSION }) },
  '/healthz': { method: 'GET', body: () => ({ ok: true }) },
};

const isJson = (ct: string | undefined) => /^application\/json\s*(;.*)?$/i.test((ct ?? '').trim());

export type Handler = ((req: IncomingMessage, res: ServerResponse) => Promise<void>) & { close: () => void };

/** 要求の処理器（node:http の request リスナ）を作る。worker の群は処理器ごと＝使い終えたら close() */
export function createHandler(opts: ShellOptions = {}): Handler {
  const { maxConcurrency, timeoutMs, maxResponseBytes, evaluator, workerHeapMb, log } = { ...optionsFromEnv(), ...opts };
  const pool = new Pool(maxConcurrency, timeoutMs, maxResponseBytes, evaluator, workerHeapMb);
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const t0 = performance.now();
    const path = (req.url ?? '/').split('?')[0];
    if (log === 'access') res.on('finish', () => console.error(`${req.method} ${path} ${res.statusCode} ${Math.round(performance.now() - t0)}ms`));
    const route = Object.hasOwn(ROUTES, path) ? ROUTES[path] : undefined;
    if (!route) { req.resume(); return send(res, render({ status: 404, body: shellError(`未知のパス: ${path}`) })); }
    const allow = route.method === 'GET' ? 'GET, HEAD' : 'POST';
    const head = route.method === 'GET' && req.method === 'HEAD';
    if (req.method !== route.method && !head) {
      req.resume();
      return send(res, render({ status: 405, body: shellError(`${path} は ${allow} だけ: ${req.method}`) }), { Allow: allow });
    }
    if (!route.command) return send(res, render({ status: 200, body: route.body!() }), {}, head);
    const command = route.command;
    try {
      if (!isJson(req.headers['content-type'])) {
        req.resume();
        return send(res, render(local.requestError(command, 415, `Content-Type は application/json: ${req.headers['content-type'] ?? '（なし）'}`)));
      }
      const text = await readBody(req);
      if (text === undefined) {
        // 上限超過は直ちに答えて接続を閉じる＝流し込みを読み続けない（所見 4）
        send(res, render(local.requestError(command, 413, `本文が大きすぎる（上限 ${BODY_BYTES} バイト）`)), { Connection: 'close' });
        res.once('finish', () => req.destroy());
        return;
      }
      let body: unknown;
      try { body = JSON.parse(text); } catch (e) {
        return send(res, render(local.requestError(command, 400, `本文の JSON が壊れている: ${(e as Error).message}`)));
      }
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return send(res, render(local.requestError(command, 400, '本文は JSON オブジェクト')));
      }
      // 本文を読み終えてから worker を取る＝遅い送信は評価の枠を握らない（所見 4）
      const job = pool.run(command, body as Body);
      if (!job) return send(res, render({ status: 429, body: shellError(`同時実行の上限（${maxConcurrency}）に達している`) }), { 'Retry-After': '1' });
      send(res, await job);
    } catch {
      // 殻そのものの不具合。本文（source）は返さず記録もしない
      if (!res.headersSent) send(res, INTERNAL);
    }
  };
  return Object.assign(handler, { close: () => pool.close() });
}

/** 既定の処理器（環境変数の設定で作る） */
export const handler = (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  defaultHandler ??= createHandler();
  return defaultHandler(req, res);
};
let defaultHandler: Handler | undefined;

/** HTTP サーバを作る（listen は呼び手）。close で worker も止まる。要求の読み込みの時間は Node の既定（300 秒）より短く */
export function createServer(opts: ShellOptions = {}): Server {
  const h = createHandler(opts);
  const server = createHttpServer(h);
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.on('close', () => h.close());
  return server;
}
