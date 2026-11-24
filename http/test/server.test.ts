// kairos-lang-http の witness: 同一プロセスで待ち受けて fetch で叩く（線の両端が実物）。
// 当て先は同居する参照実装の正本（vitest.config の alias＝../impl/src。評価の worker は KAIROS_HTTP_EVALUATOR で同じ ../impl/src を読む）。
// 比べる相手は同じ関数を直接呼んだ結果と、CLI の --json の実走。
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { request } from 'node:http';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cmdList, cmdNext, supplyResolver, errorReport, todayIn } from 'kairos-lang/cli';
import { parse, KairosError, SupplyError } from 'kairos-lang';
import { createServer, LIMITS, BODY_BYTES, SHELL_VERSION, KAIROS_LANG_VERSION, REQUEST_TIMEOUT_MS, HEADERS_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } from '../src/server.ts';
import { createRoutes } from '../src/routes.ts';

// 評価の worker は Node が直接読む（vitest の alias が効かない）ので、同居の impl を環境変数で当てる
process.env.KAIROS_HTTP_EVALUATOR = fileURLToPath(new URL('../../impl/src', import.meta.url));

const JP = `premise JP {
  calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  national = [2026-01-01, 2026-01-12, 2026-02-11, 2026-02-23, 2026-03-20, 2026-04-29, 2026-05-03..2026-05-06,
              2026-07-20, 2026-08-11, 2026-09-21..2026-09-23, 2026-10-12, 2026-11-03, 2026-11-23] covering: 2026..2026
  satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  bizDay = everyDay \\ (satSun | national)
}
@JP
`;
const MONTHEND = JP + 'everyDay |> within(month) |> last |> roll(Preceding, on: bizDay)\n';
const GARBAGE = JP + 'wed = everyDay |> filter(d => weekday(d) == Wed)\n(wed |> within(month) |> nth(1)) | (wed |> within(month) |> nth(3))\n';
const STATIC_BAD = JP + 'everyDay |> within(month) |> nth(0)\n';
const EXT = `premise H { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "x"
  h = external(kind: dates)
}
@H
everyDay \\ h
`;
// 数秒かかりメモリの軽い評価（1 分刻み約 58 万点に述語＝手元で約 3 秒・RSS 200 MB）。打ち切り・同時実行・/healthz の witness に使う
const SLOW = JP + 'everyInstant |> strideBy(60s, from: 2026-10-26) |> filter(d => weekday(d) == Mon)\n';
const SLOW_RANGE = { from: '2026-10-26', to: '2026-10-27', tz: 'Asia/Tokyo' };

const IMPL_CLI = new URL('../../impl/src/cli.ts', import.meta.url).pathname;
const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const IMPL_PKG = JSON.parse(readFileSync(new URL('../../impl/package.json', import.meta.url), 'utf8')) as { version: string };

const servers: ReturnType<typeof createServer>[] = [];
const start = async (opts: Parameters<typeof createServer>[0] = {}) => {
  const s = createServer({ log: 'off', ...opts });
  servers.push(s);
  await new Promise<void>(r => s.listen(0, '127.0.0.1', r));
  return { server: s, base: `http://127.0.0.1:${(s.address() as AddressInfo).port}`, port: (s.address() as AddressInfo).port };
};
let base: string;
beforeAll(async () => { base = (await start()).base; });
afterAll(async () => { await Promise.all(servers.map(s => new Promise(r => { s.closeAllConnections(); s.close(r); }))); });

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const postTo = async (b: string, path: string, body: unknown, headers: Record<string, string> = JSON_HEADERS) => {
  const res = await fetch(b + path, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, json: text ? JSON.parse(text) : undefined };
};
const post = (path: string, body: unknown, headers?: Record<string, string>) => postTo(base, path, body, headers);
/** 評価器の例外を CLI と同じ写像で errorReport に（期待値を組む側） */
const expectedError = (command: 'list' | 'next', kind: 'usage' | 'supply' | 'static', f: () => unknown) => {
  try { f(); } catch (e) { return errorReport(command, kind, String(e instanceof Error ? e.message : e)); }
  throw new Error('例外が出なかった');
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
/** 素のソケットで要求を書き、応答の先頭行と本文を読む（終わらなければ limitMs で切る） */
const raw = (port: number, write: (s: Socket) => void, limitMs: number) => new Promise<{ head: string; closed: boolean; ms: number }>(resolve => {
  const t0 = performance.now();
  let buf = '', closed = false;
  const s = connect(port, '127.0.0.1', () => write(s));
  const done = () => { resolve({ head: buf, closed, ms: performance.now() - t0 }); s.destroy(); };
  s.on('data', (c: Buffer) => { buf += c.toString('utf8'); if (/\r\n\r\n/.test(buf) && /Connection: close/i.test(buf)) setTimeout(done, 50); });
  s.on('close', () => { closed = true; done(); });
  s.on('error', () => { closed = true; done(); });
  setTimeout(done, limitMs);
});

describe('CLI の --json と HTTP の本文が一致する（点列・註釈・覆域サマリ・error.kind・文言まで）', () => {
  it('POST /v1/list＝cmdList の CliReport（explain の stages・範囲外の註釈・覆域サマリつき）', async () => {
    const r = await post('/v1/list', { source: MONTHEND, from: '2026-01-01', to: '2027-03-01', tz: 'Asia/Tokyo', explain: true });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const want = cmdList(MONTHEND, { from: '2026-01-01', to: '2027-03-01', tz: 'Asia/Tokyo', explain: true });
    expect(r.json).toEqual(JSON.parse(JSON.stringify(want)));
    expect(r.json.results[0].annotations.length).toBeGreaterThan(0);   // 表の外（2027）は註釈で返る
    expect(r.json.coverage.length).toBeGreaterThan(0);
    expect(r.json.results[0].stages.length).toBeGreaterThan(1);
  });
  it('POST /v1/next＝cmdNext の CliReport（requested／found／horizonYears）', async () => {
    const r = await post('/v1/next', { source: GARBAGE, from: '2026-01-01', n: 3, tz: 'Asia/Tokyo' });
    expect(r.status).toBe(200);
    const want = cmdNext(GARBAGE, { from: '2026-01-01', n: 3, horizonYears: LIMITS.horizonYears, tz: 'Asia/Tokyo' });
    expect(r.json).toEqual(JSON.parse(JSON.stringify(want)));
    expect(r.json.results[0].dates).toEqual(['2026-01-07', '2026-01-21', '2026-02-04']);
  });
  it('POST /v1/validate＝mcp の kairos_validate と同じ本文（ok・version・diagnostics・expressions）', async () => {
    const good = await post('/v1/validate', { source: GARBAGE, tz: 'Asia/Tokyo' });
    expect(good.status).toBe(200);
    expect(good.json).toEqual({ ok: true, version: KAIROS_LANG_VERSION, diagnostics: [], expressions: 1 });
    const bad = await post('/v1/validate', { source: STATIC_BAD, tz: 'Asia/Tokyo' });
    expect(bad.status).toBe(200);   // 所見は要求の誤りではない
    const e = expectedError('list', 'static', () => cmdList(STATIC_BAD, { from: '2026-01-01', to: '2026-01-01', tz: 'Asia/Tokyo' }));
    expect(bad.json).toEqual({ ok: false, version: KAIROS_LANG_VERSION, diagnostics: [e.error] });
  });
  it('static＝400・本文は errorReport（定義の誤り）', async () => {
    const r = await post('/v1/list', { source: STATIC_BAD, from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' });
    expect(r.status).toBe(400);
    expect(r.json).toEqual(expectedError('list', 'static', () => cmdList(STATIC_BAD, { from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' })));
    expect(r.json.error.message).toContain('nth');
    const n = await post('/v1/next', { source: JP + 'everyDay\neveryDay\n', from: '2026-01-01', tz: 'Asia/Tokyo' });
    expect(n.status).toBe(400);
    expect(n.json).toMatchObject({ command: 'next', error: { kind: 'static' } });
    expect(n.json.error.message).toContain('next は本体式 1 つ');
  });
  it('supply＝422・本文は errorReport（供給の欠落）／正しい供給は 200 で external が解ける', async () => {
    const supply = {};
    const r = await post('/v1/list', { source: EXT, from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo', supply });
    expect(r.status).toBe(422);
    expect(r.json).toEqual(expectedError('list', 'supply', () =>
      cmdList(EXT, { from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo', resolve: supplyResolver(supply, 'request body "supply"') })));
    const good = await post('/v1/list', { source: EXT, from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo',
      supply: { 'H.h': { dates: ['2026-01-12'], covering: '2026-01-01..2026-02-28', asof: '2026-01-01' } } });
    expect(good.status).toBe(200);
    expect(good.json.results[0].dates).not.toContain('2026-01-12');
    expect(good.json.results[0].dates.length).toBe(30);
    const malformed = await post('/v1/list', { source: EXT, from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo', supply: { 'H.h': { dates: 'x' } } });
    expect(malformed.status).toBe(422);
    expect(malformed.json.error.kind).toBe('supply');
  });
  it('usage＝400・本文は errorReport（tz が無効＝mcp と同じ文言・値域は評価器の getTz と同じ＝+09:00 は通り +0900 は usage）', async () => {
    const r = await post('/v1/list', { source: GARBAGE, from: '2026-01-01', to: '2026-02-01', tz: 'Mars/Olympus' });
    expect(r.status).toBe(400);
    expect(r.json).toEqual(errorReport('list', 'usage', 'tz が無効: Mars/Olympus（IANA 名か固定オフセットの正準形 "±HH:MM" で指定する。例 Asia/Tokyo・America/New_York・UTC・+09:00）'));
    const off = await post('/v1/list', { source: GARBAGE, from: '2026-01-01', to: '2026-02-01', tz: '+09:00' });
    expect(off.status).toBe(200);
    expect(off.json.results[0].dates).toEqual(['2026-01-07', '2026-01-21']);
    for (const tz of ['+0900', '+09', 'Z', 'UTC+9', 'GMT+9']) {
      const b = await post('/v1/list', { source: GARBAGE, from: '2026-01-01', to: '2026-02-01', tz });
      expect(b.status, tz).toBe(400);
      expect(b.json.error.message, tz).toContain('tz が無効');
    }
  });
  it('CLI の実走（kairos list --json）の stdout と本文が字面まで一致・実行機の TZ に依らない（TZ=UTC と TZ=America/Los_Angeles）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kairos-http-'));
    const file = join(dir, 'monthend.kairos');
    writeFileSync(file, MONTHEND);
    const r = await post('/v1/list', { source: MONTHEND, from: '2026-01-01', to: '2027-03-01', tz: 'Asia/Tokyo' });
    for (const TZ of ['UTC', 'America/Los_Angeles']) {
      const out = execFileSync(process.execPath, [IMPL_CLI, 'list', '--json', '--from', '2026-01-01', '--to', '2027-03-01', '--tz', 'Asia/Tokyo', file],
        { env: { ...process.env, TZ }, encoding: 'utf8' });
      expect(r.text, `TZ=${TZ}`).toBe(out);
    }
    const bad = join(dir, 'bad.kairos');
    writeFileSync(bad, STATIC_BAD);
    let out = '';
    try { execFileSync(process.execPath, [IMPL_CLI, 'list', '--json', '--from', '2026-01-01', '--to', '2026-02-01', '--tz', 'Asia/Tokyo', bad], { encoding: 'utf8' }); }
    catch (e) { out = (e as { stdout: string }).stdout; }
    const rb = await post('/v1/list', { source: STATIC_BAD, from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' });
    expect(rb.text).toBe(out);
  });
});

describe('境界と状態コード', () => {
  it('上限は mcp の LIMITS と同じ値（mcp/src/server.ts を字面で読んで比べる）', () => {
    const m = /export const LIMITS = (\{[^}]*\})/.exec(readFileSync(new URL('../../mcp/src/server.ts', import.meta.url), 'utf8'));
    expect(m).not.toBeNull();
    expect(LIMITS).toEqual(new Function(`return ${m![1]}`)());
  });
  it('本文 256 KiB 超＝413（Content-Length の宣言だけで即・流し込みは読み切らずに即＝接続を閉じる）', async () => {
    const r = await post('/v1/list', { source: '#' + 'x'.repeat(BODY_BYTES), from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' });
    expect(r.status).toBe(413);
    expect(r.json).toEqual(errorReport('list', 'usage', `本文が大きすぎる（上限 ${BODY_BYTES} バイト）`));
    const { port } = await start();
    // 宣言が上限超＝本文を 1 バイトも送らずに 413 が来る
    const declared = await raw(port, s => s.write(`POST /v1/list HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: ${BODY_BYTES + 1}\r\n\r\n`), 3000);
    expect(declared.head).toMatch(/^HTTP\/1\.1 413 /);
    expect(declared.head).toMatch(/Connection: close/i);
    expect(declared.ms).toBeLessThan(1000);
    // chunked で 300 KiB を終端なしに流す＝上限を超えた時点で 413・接続が閉じる（旧: 終端が来るまで黙って読み続けた）
    const chunk = 'x'.repeat(64 * 1024);
    const streamed = await raw(port, s => {
      s.write('POST /v1/validate HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n');
      for (let i = 0; i < 5; i++) s.write(`${chunk.length.toString(16)}\r\n${chunk}\r\n`);
    }, 3000);
    expect(streamed.head).toMatch(/^HTTP\/1\.1 413 /);
    expect(streamed.closed).toBe(true);
    expect(streamed.ms).toBeLessThan(1000);
  });
  it('source 64 KiB 超＝400・本体式 101 個＝400（mcp と同じ文言）・100 個は通る', async () => {
    const r = await post('/v1/list', { source: GARBAGE + '#' + 'x'.repeat(LIMITS.sourceBytes), from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' });
    expect(r.status).toBe(400);
    expect(r.json).toEqual(errorReport('list', 'usage', `source が大きすぎる（上限 ${LIMITS.sourceBytes} バイト）`));
    // 1 行に式を N 個並べると各 result の source が行全体になり応答が N² で増えた（所見 2）＝式の数で止める
    const many = (k: number) => JP + Array.from({ length: k }, () => 'everyDay |> within(month) |> first').join(' ') + '\n';
    const over = await post('/v1/list', { source: many(LIMITS.expressions + 1), from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' });
    expect(over.status).toBe(400);
    expect(over.json).toEqual(errorReport('list', 'usage', `本体式が多すぎる（${LIMITS.expressions + 1} 個・上限 ${LIMITS.expressions}）`));
    const ok = await post('/v1/validate', { source: many(LIMITS.expressions), tz: 'Asia/Tokyo' });
    expect(ok.json).toMatchObject({ ok: true, expressions: LIMITS.expressions });
    const overV = await post('/v1/validate', { source: many(LIMITS.expressions + 1), tz: 'Asia/Tokyo' });
    expect(overV.status).toBe(200);
    expect(overV.json).toMatchObject({ ok: false, diagnostics: [{ kind: 'usage' }] });
  });
  it('応答の本文の上限＝超えたら 400 usage「応答が大きすぎる」（上限は設定・既定 32 MiB）', async () => {
    const { base: b } = await start({ maxResponseBytes: 10_000 });
    const r = await postTo(b, '/v1/list', { source: JP + 'everyInstant |> strideBy(60s, from: 2026-01-01)\n', from: '2026-01-01', to: '2026-01-02', tz: 'Asia/Tokyo' });
    expect(r.status).toBe(400);
    expect(r.json).toMatchObject({ command: 'list', error: { kind: 'usage' } });
    expect(r.json.error.message).toMatch(/^応答が大きすぎる（\d+ バイト・上限 10000）/);
    const small = await postTo(b, '/v1/list', { source: GARBAGE, from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' });
    expect(small.status).toBe(200);
  });
  it('窓 10 年超＝400（mcp と同じ文言）・実在しない日付＝400 usage（旧: 2027-02-14 に正規化され「逆順」の static）', async () => {
    const r = await post('/v1/list', { source: GARBAGE, from: '2026-01-01', to: '2037-01-02', tz: 'Asia/Tokyo' });
    expect(r.status).toBe(400);
    expect(r.json).toEqual(errorReport('list', 'usage', `評価範囲が広すぎる（上限 ${LIMITS.windowYears} 年）: [2026-01-01, 2037-01-02)`));
    const bad = await post('/v1/list', { source: GARBAGE, from: '2026-13-45', to: '2027-01-01', tz: 'Asia/Tokyo' });
    expect(bad.status).toBe(400);
    expect(bad.json).toEqual(errorReport('list', 'usage', 'from は実在する日付（YYYY-MM-DD・月は 01〜12・日はその月の日数まで）: 2026-13-45'));
    expect((await post('/v1/list', { source: GARBAGE, from: '2026-01-01', to: '2026-02-30', tz: 'Asia/Tokyo' })).json.error.message).toMatch(/^to は実在する日付/);
    expect((await post('/v1/next', { source: GARBAGE, from: '2026-04-31', tz: 'Asia/Tokyo' })).json.error.message).toMatch(/^from は実在する日付/);
    // 年 0000〜0099 は窓の判定で 1900 年代に読み替えない（評価器の下限の文言で止まる＝static）
    const old = await post('/v1/list', { source: GARBAGE, from: '0099-01-01', to: '0099-02-01', tz: 'Asia/Tokyo' });
    expect(old.status).toBe(400);
    expect(old.json.error).toMatchObject({ kind: 'static' });
    expect(old.json.error.message).toMatch(/^参照実装の評価範囲は 1970-01-01 以降/);
  });
  it('n 1001＝400・horizonYears 11＝400・n 1e400（JSON で Infinity）は値を文言に', async () => {
    const r = await post('/v1/next', { source: GARBAGE, n: 1001, tz: 'Asia/Tokyo' });
    expect(r.status).toBe(400);
    expect(r.json).toMatchObject({ command: 'next', error: { kind: 'usage' } });
    expect(r.json.error.message).toContain(`1〜${LIMITS.n}`);
    const h = await post('/v1/next', { source: GARBAGE, horizonYears: 11, tz: 'Asia/Tokyo' });
    expect(h.status).toBe(400);
    const inf = await post('/v1/next', `{"source": ${JSON.stringify(GARBAGE)}, "tz": "Asia/Tokyo", "n": 1e400}`);
    expect(inf.json.error.message).toBe(`n は 1〜${LIMITS.n} の整数: Infinity`);
  });
  it('tz 欠け＝400（list・next・validate とも）', async () => {
    for (const [path, body] of [['/v1/list', { source: GARBAGE, from: '2026-01-01', to: '2026-02-01' }], ['/v1/next', { source: GARBAGE }], ['/v1/validate', { source: GARBAGE }]] as const) {
      const r = await post(path, body);
      expect(r.status, path).toBe(400);
      expect(JSON.stringify(r.json), path).toContain('tz（IANA 名の文字列）が必須');
    }
  });
  it('不正 JSON＝400・JSON でもオブジェクトでなければ 400・未知の鍵も 400', async () => {
    const r = await post('/v1/list', '{"source": ');
    expect(r.status).toBe(400);
    expect(r.json).toMatchObject({ command: 'list', error: { kind: 'usage' } });
    expect(r.json.error.message).toMatch(/^本文の JSON が壊れている/);
    expect((await post('/v1/next', '[1]')).status).toBe(400);
    const u = await post('/v1/list', { source: GARBAGE, from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo', lang: 'en' });
    expect(u.status).toBe(400);
    expect(u.json.error.message).toContain('未知の鍵: lang');
  });
  it('Content-Type が application/json でない POST＝415（ブラウザの単純リクエストで評価を撃てない）・charset つきは通る', async () => {
    const plain = await post('/v1/validate', { source: GARBAGE, tz: 'Asia/Tokyo' }, { 'Content-Type': 'text/plain' });
    expect(plain.status).toBe(415);
    expect(plain.json).toEqual({ ok: false, version: KAIROS_LANG_VERSION, diagnostics: [{ kind: 'usage', message: 'Content-Type は application/json: text/plain' }] });
    const form = await post('/v1/list', { source: GARBAGE, from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' }, { 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(form.status).toBe(415);
    expect(form.json).toMatchObject({ command: 'list', error: { kind: 'usage' } });
    const charset = await post('/v1/validate', { source: GARBAGE, tz: 'Asia/Tokyo' }, { 'Content-Type': 'application/json; charset=utf-8' });
    expect(charset.status).toBe(200);
  });
  it('URL を supply に入れた形＝400（殻は外へ出ない）', async () => {
    const r = await post('/v1/list', { source: EXT, from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo', supply: 'https://example.com/holidays.json' });
    expect(r.status).toBe(400);
    expect(r.json).toMatchObject({ command: 'list', error: { kind: 'usage' } });
    expect(r.json.error.message).toContain('URL は受けない');
  });
  it('評価器の素の例外（KairosError でも SupplyError でもない）は 500 internal＝エンジンの文言を返さない・評価器の例外は従来の写像', () => {
    const real = { cmdList, cmdNext, supplyResolver, errorReport, todayIn, parse, KairosError, SupplyError };
    const body = { source: GARBAGE, from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' };
    const broken = createRoutes({ ...real, cmdList: () => { throw new RangeError('Invalid array length'); } });
    expect(broken.run('list', body)).toEqual({ status: 500, body: { version: KAIROS_LANG_VERSION, error: { kind: 'internal', message: '内部のエラー' } } });
    expect(broken.run('validate', { source: GARBAGE, tz: 'Asia/Tokyo' }).status).toBe(500);
    const kairos = createRoutes({ ...real, cmdList: () => { throw new KairosError('定義の誤り'); } });
    expect(kairos.run('list', body)).toEqual({ status: 400, body: errorReport('list', 'static', '定義の誤り') });
    expect(createRoutes(real).run('list', body).status).toBe(200);
  });
});

describe('同時実行・打ち切り・待ち受けの応答性（評価は常駐 worker）', () => {
  it('評価中も GET /healthz は 1 秒以内に返る・同時実行の上限＝429（上限 1 で評価中にもう 1 本・Retry-After つき）・終われば次は 200', async () => {
    const { base: b } = await start({ maxConcurrency: 1 });
    const first = postTo(b, '/v1/list', { source: SLOW, ...SLOW_RANGE });
    await sleep(300);   // 1 本目が worker に渡った後
    const t0 = performance.now();
    const h = await fetch(b + '/healthz');
    expect(h.status).toBe(200);
    expect(performance.now() - t0).toBeLessThan(1000);
    const second = await postTo(b, '/v1/validate', { source: GARBAGE, tz: 'Asia/Tokyo' });
    expect(second.status).toBe(429);
    expect(second.headers.get('retry-after')).toBe('1');
    expect(second.json.error.message).toContain('同時実行の上限（1）');
    const r1 = await first;
    expect(r1.status).toBe(200);
    expect(r1.json.results[0].dates[0]).toBe('2026-10-26');
    expect((await postTo(b, '/v1/validate', { source: GARBAGE, tz: 'Asia/Tokyo' })).status).toBe(200);   // 枠は戻る
  });
  it('1 要求の時間の上限＝504 timeout（worker を止めて作り直す）・次の要求は 200・上限の既定は 10 秒', async () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
    const { base: b } = await start({ maxConcurrency: 1, timeoutMs: 1000 });   // SLOW（約 3 秒）は越え、次の軽い評価は冷えた worker でも越えない
    const t0 = performance.now();
    const r = await postTo(b, '/v1/list', { source: SLOW, ...SLOW_RANGE });
    expect(r.status).toBe(504);
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(r.json).toEqual({ version: KAIROS_LANG_VERSION, error: { kind: 'timeout',
      message: '評価が時間の上限（1000 ms）を超えたので打ち切った——範囲を狭めるか幅を粗くする。上限は KAIROS_HTTP_TIMEOUT_MS' } });
    const again = await postTo(b, '/v1/list', { source: GARBAGE, from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' });
    expect(again.status).toBe(200);
    expect(again.json.results[0].dates).toEqual(['2026-01-07', '2026-01-21']);
  });
  it('評価器のヒープ枯渇は worker だけが落ちて 500 internal（source を返さない）・worker は作り直され次の要求は 200・殻は落ちない', async () => {
    const { base: b } = await start({ maxConcurrency: 1, workerHeapMb: 64 });
    const t0 = performance.now();
    // 1 秒刻みを述語 filter で全列挙させる＝to+400 日まで約 3,460 万点（約 280 MB の double）＝64 MB のヒープでは尽きる。1.0.12 の殻ではプロセスごと落ちていた形（所見 3）。
    // 1.1.1 で strideBy の点列は範囲に応じた算術になり、出口（1 日分 86,400 点）だけでは尽きないので、全列挙が要る形で実体化を強いる（上限 2^26 の内側）
    const r = await postTo(b, '/v1/list', { source: JP + 'everyInstant |> strideBy(1s, from: 2026-10-26) |> filter(t => true)\n', ...SLOW_RANGE });
    expect(r.status).toBe(500);
    expect(r.json).toEqual({ version: KAIROS_LANG_VERSION, error: { kind: 'internal', message: '内部のエラー' } });
    expect(r.text).not.toContain('strideBy');
    expect(performance.now() - t0).toBeLessThan(20_000);
    const again = await postTo(b, '/v1/list', { source: GARBAGE, from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' });
    expect(again.status).toBe(200);
    expect(again.json.results[0].dates).toEqual(['2026-01-07', '2026-01-21']);
  });
  it('遅い送信（本文の途中で止まる接続）は評価の枠を握らない＝上限 1 でも別の要求が 200・要求の読み込みの時間は Node の既定より短い', async () => {
    const { server, base: b, port } = await start({ maxConcurrency: 1 });
    expect(server.requestTimeout).toBe(REQUEST_TIMEOUT_MS);
    expect(server.headersTimeout).toBe(HEADERS_TIMEOUT_MS);
    expect(REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
    expect(HEADERS_TIMEOUT_MS).toBeLessThanOrEqual(REQUEST_TIMEOUT_MS);
    const slow = connect(port, '127.0.0.1');
    await new Promise<void>(r => slow.once('connect', r));
    slow.write('POST /v1/validate HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{');
    await sleep(100);
    const r = await postTo(b, '/v1/validate', { source: GARBAGE, tz: 'Asia/Tokyo' });
    expect(r.status).toBe(200);   // 旧: 429（本文の読み込み中も枠を数えていた）
    slow.destroy();
  });
});

describe('経路の外', () => {
  it('未知のパス＝404・GET /v1/list＝405（Allow: POST）・POST /healthz＝405（Allow: GET, HEAD）・HEAD /healthz＝200 本文なし', async () => {
    const nf = await fetch(base + '/v1/nope');
    expect(nf.status).toBe(404);
    expect((await nf.json()).error.kind).toBe('usage');
    const m = await fetch(base + '/v1/list');
    expect(m.status).toBe(405);
    expect(m.headers.get('allow')).toBe('POST');
    const p = await fetch(base + '/healthz', { method: 'POST', headers: JSON_HEADERS, body: '{}' });
    expect(p.status).toBe(405);
    expect(p.headers.get('allow')).toBe('GET, HEAD');
    const hd = await fetch(base + '/healthz', { method: 'HEAD' });
    expect(hd.status).toBe(200);
    expect(await hd.text()).toBe('');
    expect(hd.headers.get('content-length')).toBe(String(Buffer.byteLength(JSON.stringify({ ok: true }, null, 2) + '\n')));
  });
  it('応答のヘッダ＝nosniff・no-store（200・404 とも）', async () => {
    for (const res of [await fetch(base + '/healthz'), await fetch(base + '/v1/nope')]) {
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });
  it('GET /healthz＝200 {ok: true}・GET /v1/version の 2 つの版が package.json と一致', async () => {
    const h = await fetch(base + '/healthz');
    expect(h.status).toBe(200);
    expect(await h.json()).toEqual({ ok: true });
    const v = await (await fetch(base + '/v1/version')).json();
    expect(v).toEqual({ kairosLang: IMPL_PKG.version, shell: PKG.version });
    expect(SHELL_VERSION).toBe(PKG.version);
    expect(PKG.version).toBe(JSON.parse(readFileSync(new URL('../../mcp/package.json', import.meta.url), 'utf8')).version);
  });
  it('next の from 省略は tz の今日から', async () => {
    const r = await post('/v1/next', { source: JP + 'everyDay\n', tz: 'Asia/Tokyo' });
    expect(r.status).toBe(200);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    expect(r.json.results[0].dates).toEqual([today]);
  });
});
