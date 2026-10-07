// kairos-lang-mcp の witness: SDK の InMemoryTransport で本物の Client から tool／resource を呼ぶ（線の両端が実物）。
// 当て先は同居する参照実装の正本（vitest.config の alias＝../impl/src）。
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, LIMITS, SERVER_VERSION } from '../src/server.ts';

const JP = `premise JP {
  calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  national = [2026-01-01, 2026-01-12, 2026-02-11, 2026-02-23, 2026-03-20, 2026-04-29, 2026-05-03..2026-05-06,
              2026-07-20, 2026-08-11, 2026-09-21..2026-09-23, 2026-10-12, 2026-11-03, 2026-11-23] covering: 2026..2026
  satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  bizDay = everyDay \\ (satSun | national)
}
@JP
`;
const GARBAGE = JP + 'wed = everyDay |> filter(d => weekday(d) == Wed)\n(wed |> within(month) |> nth(1)) | (wed |> within(month) |> nth(3))\n';
const EXT = `premise H { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "x"
  h = external(kind: dates)
}
@H
everyDay \\ h
`;

let client: Client;
let server: ReturnType<typeof createServer>;
beforeAll(async () => {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  server = createServer();
  await server.connect(st);
  client = new Client({ name: 'witness', version: '0' });
  await client.connect(ct);
});
afterAll(async () => { await client.close(); await server.close(); });

type Rep = { version: string; results: { dates: string[]; annotations: unknown[]; stages?: unknown[] }[]; found?: number; requested?: number; exhausted?: boolean; error?: { kind: string; message: string }; ok?: boolean; diagnostics?: { kind: string; message: string }[]; expressions?: number };
const call = async (name: string, args: Record<string, unknown>) => {
  const r = await client.callTool({ name, arguments: args }) as { isError?: boolean; structuredContent?: unknown; content: { type: string; text?: string }[] };
  const text = r.content[0]?.text ?? '';
  return { isError: r.isError === true, rep: (r.structuredContent ?? (text.startsWith('{') ? JSON.parse(text) : undefined)) as Rep | undefined, text };
};

describe('tool 一覧と契約（tz 必須・版は kairos-lang に追随）', () => {
  it('4 本の tool があり、list／next／validate の inputSchema は tz を必須にしている', async () => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name).sort();
    expect(names).toEqual(['kairos_list', 'kairos_next', 'kairos_reference', 'kairos_validate']);
    for (const t of tools.filter(t => t.name !== 'kairos_reference')) {
      expect((t.inputSchema as { required?: string[] }).required, t.name).toContain('tz');
      expect(t.description).toContain('tz is required');
    }
    expect(SERVER_VERSION).toBe(JSON.parse(readFileSync(new URL('../../impl/package.json', import.meta.url), 'utf8')).version);
  });
});

describe('kairos_list', () => {
  it('CliReport をそのまま返す（第 1・第 3 水曜 1〜6 月＝12 点・version は参照実装の版）', async () => {
    const { isError, rep } = await call('kairos_list', { source: GARBAGE, from: '2026-01-01', to: '2026-07-01', tz: 'Asia/Tokyo' });
    expect(isError).toBe(false);
    expect(rep!.version).toBe(SERVER_VERSION);
    expect(rep!.results[0].dates.length).toBe(12);
    expect(rep!.results[0].dates[0]).toBe('2026-01-07');
  });
  it('explain で results[].stages が付く・評価器の文言（註釈）は日本語（報告は言語中立＝lang の引数は無い）', async () => {
    const src = JP + 'everyDay |> within(month) |> last |> roll(Preceding, on: bizDay)\n';
    const { rep } = await call('kairos_list', { source: src, from: '2026-01-01', to: '2026-03-01', tz: 'Asia/Tokyo', explain: true });
    expect(rep!.results[0].stages!.length).toBeGreaterThan(1);
    expect(rep!.results[0].annotations.length).toBe(1);
    expect(JSON.stringify(rep!.results[0].annotations[0])).toContain('out-of-coverage');
  });
  it('supply で external を解く・供給の欠落は kind supply・形の違反も supply', async () => {
    const good = await call('kairos_list', { source: EXT, from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo',
      supply: { 'H.h': { dates: ['2026-01-12'], covering: '2026-01-01..2026-02-28', asof: '2026-01-01' } } });
    expect(good.isError).toBe(false);
    expect(good.rep!.results[0].dates).not.toContain('2026-01-12');
    expect(good.rep!.results[0].dates.length).toBe(30);
    const missing = await call('kairos_list', { source: EXT, from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo', supply: {} });
    expect(missing.isError).toBe(true);
    expect(missing.rep!.error!.kind).toBe('supply');
    const malformed = await call('kairos_list', { source: EXT, from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo', supply: { 'H.h': { dates: 'x' } } });
    expect(malformed.rep!.error!.kind).toBe('supply');
  });
  it('エラーは構造化（usage＝tz 無効・窓が 10 年超・source 超過／static＝定義の誤り）・isError つき・protocol error にしない', async () => {
    const badTz = await call('kairos_list', { source: GARBAGE, from: '2026-01-01', to: '2026-02-01', tz: 'Mars/Olympus' });
    expect(badTz.isError).toBe(true);
    expect(badTz.rep!.error).toMatchObject({ kind: 'usage' });
    expect(badTz.rep!.error!.message).toContain('tz が無効');
    const wide = await call('kairos_list', { source: GARBAGE, from: '2026-01-01', to: '2037-01-02', tz: 'Asia/Tokyo' });
    expect(wide.rep!.error).toMatchObject({ kind: 'usage' });
    expect(wide.rep!.error!.message).toContain(`${LIMITS.windowYears} 年`);
    const big = await call('kairos_list', { source: GARBAGE + '#' + 'x'.repeat(LIMITS.sourceBytes), from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' });
    expect(big.rep!.error).toMatchObject({ kind: 'usage' });
    const stat = await call('kairos_list', { source: JP + 'everyDay |> within(month) |> nth(0)\n', from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' });
    expect(stat.isError).toBe(true);
    expect(stat.rep!.error).toMatchObject({ kind: 'static' });
    expect(stat.rep!.error!.message).toContain('nth');
    expect(stat.rep!.version).toBe(SERVER_VERSION);
  });
  it('引数の形の誤り（from の書式・tz の欠落）は SDK の検証で止まる（tool は呼ばれない）', async () => {
    const r = await client.callTool({ name: 'kairos_list', arguments: { source: GARBAGE, from: '2026/01/01', to: '2026-02-01', tz: 'Asia/Tokyo' } });
    expect(r.isError).toBe(true);
    const r2 = await client.callTool({ name: 'kairos_list', arguments: { source: GARBAGE, from: '2026-01-01', to: '2026-02-01' } });
    expect(r2.isError).toBe(true);
  });
});

describe('kairos_next', () => {
  it('次の 3 点・地平線内の不足は found < requested で読む（報告は CLI の CliReport そのまま＝公開 schema の鍵以外を足さない）', async () => {
    const r = await call('kairos_next', { source: GARBAGE, from: '2026-01-01', n: 3, tz: 'Asia/Tokyo' });
    expect(r.isError).toBe(false);
    expect(r.rep!.results[0].dates).toEqual(['2026-01-07', '2026-01-21', '2026-02-04']);
    expect([r.rep!.found, r.rep!.requested]).toEqual([3, 3]);
    expect('exhausted' in r.rep!).toBe(false);
    const short = await call('kairos_next', { source: JP + 'everyDay |> within(year) |> last\n', from: '2026-01-05', n: 3, horizonYears: 1, tz: 'Asia/Tokyo' });
    expect(short.isError).toBe(false);
    expect([short.rep!.found, short.rep!.requested]).toEqual([1, 3]);   // 地平線 1 年で年末は 1 回
    expect('exhausted' in short.rep!).toBe(false);
  });
  it('from 省略は tz の今日から（決定的な点列の中で、今日以降の最初の点）', async () => {
    const r = await call('kairos_next', { source: JP + 'everyDay\n', tz: 'Asia/Tokyo' });
    expect(r.isError).toBe(false);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    expect(r.rep!.results[0].dates).toEqual([today]);
  });
  it('複数式のファイルは static エラー（CLI と同じ文言）', async () => {
    const r = await call('kairos_next', { source: JP + 'everyDay\neveryDay\n', from: '2026-01-01', tz: 'Asia/Tokyo' });
    expect(r.rep!.error).toMatchObject({ kind: 'static' });
    expect(r.rep!.error!.message).toContain('next は本体式 1 つ');
  });
});

describe('kairos_validate', () => {
  it('正しい定義は ok: true（式の数つき）・誤りは ok: false と diagnostics（kind・message）', async () => {
    const good = await call('kairos_validate', { source: GARBAGE, tz: 'Asia/Tokyo' });
    expect(good.rep).toMatchObject({ ok: true, diagnostics: [], expressions: 1 });
    const bad = await call('kairos_validate', { source: JP + 'everyDay |> within(month) |> nth(x)\n', tz: 'Asia/Tokyo' });
    expect(bad.rep!.ok).toBe(false);
    expect(bad.rep!.diagnostics![0]).toMatchObject({ kind: 'static' });
    expect(bad.rep!.diagnostics![0].message).toContain('未解決の名前');
    const none = await call('kairos_validate', { source: JP, tz: 'Asia/Tokyo' });
    expect(none.rep!.ok).toBe(false);
    expect(none.rep!.diagnostics![0].message).toMatch(/^本体式がない/);
  });
});

describe('kairos_reference と resources', () => {
  it('語のページ（日本語が正・英語版あり）・未知の語は一覧つきの usage', async () => {
    const ja = await call('kairos_reference', { word: 'roll' });
    expect(ja.isError).toBe(false);
    expect(ja.text).toContain('roll');
    expect(ja.text).toMatch(/[ぁ-ん]/);
    const en = await call('kairos_reference', { word: 'roll', lang: 'en' });
    expect(en.text).toContain('roll');
    expect(en.text).not.toMatch(/[ぁ-ん]/);
    const bad = await call('kairos_reference', { word: 'nope' });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain('available:');
    expect(bad.text).toContain('within');
    const traversal = await call('kairos_reference', { word: '../llms' });
    expect(traversal.isError).toBe(true);
  });
  it('kairos://llms.txt と kairos://reference/{lang}/{word} が読める・一覧に 33 語×2', async () => {
    const llms = await client.readResource({ uri: 'kairos://llms.txt' });
    const textOf = (c: { text?: string; blob?: string }) => c.text ?? '';
    expect(textOf(llms.contents[0])).toContain('Kairos');
    const ref = await client.readResource({ uri: 'kairos://reference/en/nth' });
    expect(textOf(ref.contents[0])).toContain('nth');
    const list = await client.listResources();
    const uris = list.resources.map(r => r.uri);
    expect(uris).toContain('kairos://llms.txt');
    expect(uris.filter(u => u.startsWith('kairos://reference/ja/')).length).toBe(33);
    expect(uris.filter(u => u.startsWith('kairos://reference/en/')).length).toBe(33);
  });
});
