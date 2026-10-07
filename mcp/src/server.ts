// Kairos MCP server — kairos-lang-mcp（87 段 2・設計者裁定 2026-10-05: 案 A＝別パッケージ・tz は必須・診断は日本語が正・
// エラーは構造化して返す）。tool の当て先は参照実装の CLI と同じ関数（kairos-lang/cli の cmdList／cmdNext）＝`--json` と同じ
// CliReport をそのまま返す。評価は決定的・時計を読むのは next の from 既定（tz の今日）だけ。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { cmdList, cmdNext, supplyResolver, errorReport, todayIn } from 'kairos-lang/cli';
import type { CliReport, CliErrorReport } from 'kairos-lang/cli';
import { KairosError, SupplyError } from 'kairos-lang';
import type { ExternalResolver } from 'kairos-lang';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')) as { version: string };
/** このサーバの版＝kairos-lang に追随（同じ番号＝同じ契約） */
export const SERVER_VERSION: string = PKG.version;
/** 同梱文書（scripts/bundle-docs.mjs が reference 日英と llms.txt を束ねる） */
export const DOCS_DIR = join(HERE, '..', 'docs');

// 上限（87 §3「DoS でなく事故防止」）
export const LIMITS = { sourceBytes: 64 * 1024, windowYears: 10, n: 1000, horizonYears: 10 } as const;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
type Lang = 'ja' | 'en';

const yearsBetween = (from: string, to: string) => {
  const [fy, fm, fd] = from.split('-').map(Number), [ty, tm, td] = to.split('-').map(Number);
  return (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / (365.25 * 86_400_000);
};

/** tz の検査——IANA 名として Intl が受けるか（評価器の getTz と同じ根拠。無効なら usage） */
function checkTz(tz: string): void {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch {
    throw new KairosError(`tz が無効: ${tz}（IANA 名で指定する。例 Asia/Tokyo・America/New_York・UTC）`);
  }
}

function checkSource(source: string): void {
  if (Buffer.byteLength(source, 'utf8') > LIMITS.sourceBytes) {
    throw new KairosError(`source が大きすぎる（上限 ${LIMITS.sourceBytes} バイト）`);
  }
}

const ok = (rep: Record<string, unknown>): CallToolResult =>
  ({ content: [{ type: 'text', text: JSON.stringify(rep, null, 2) }], structuredContent: rep });
const fail = (rep: CliErrorReport | Record<string, unknown>): CallToolResult =>
  ({ content: [{ type: 'text', text: JSON.stringify(rep, null, 2) }], structuredContent: rep as Record<string, unknown>, isError: true });

/** CLI の main と同じ写像: usage（入力の形）／supply（供給契約）／static（定義の字句・構文・静的・評価） */
function runGuarded(command: 'list' | 'next', phases: { usage: () => void; supply: () => ExternalResolver | undefined; eval: (resolve?: ExternalResolver) => CliReport }): CallToolResult {
  let phase: 'usage' | 'supply' | 'eval' = 'usage';
  try {
    phases.usage();
    phase = 'supply';
    const resolve = phases.supply();
    phase = 'eval';
    return ok(phases.eval(resolve) as unknown as Record<string, unknown>);
  } catch (e) {
    const message = String(e instanceof Error ? e.message : e);
    const kind = e instanceof SupplyError || phase === 'supply' ? 'supply' : phase === 'usage' ? 'usage' : 'static';
    return fail(errorReport(command, kind, message));
  }
}

const supplyOf = (supply: unknown) => supply === undefined ? undefined : supplyResolver(supply, 'tool input "supply"');

export const TZ_RULE = 'tz is required: the IANA zone that labels and the [from, to) endpoints are read in (there is no "machine time zone" for an AI caller). '
  + 'If the definition declares tz: in its premise, evaluation uses that zone; tz here still decides the labels. '
  + 'Recommended practice: define your premise once (calendar-system, tz, wkst, holiday tables) and keep it — '
  + 'it turns tacit knowledge into explicit knowledge, and every call reuses the same text.';

const NOTE_DIAG = 'Diagnostics (errors, annotation texts) are in Japanese — the reference implementation\'s canonical output language; '
  + 'lang: "en" only switches the framing. Errors come back as {command, version, error: {kind: usage|supply|static, message}} with isError.';

export function createServer(): McpServer {
  const server = new McpServer({ name: 'kairos-lang', version: SERVER_VERSION }, {
    instructions: `Kairos is a schedule definition language (https://kairos-lang.org). Write a definition (a premise with calendar-system/tz/wkst and holiday tables, then body expressions such as 'everyDay |> within(month) |> last |> roll(Preceding, on: bizDay)'), then evaluate it with kairos_list (all firings in [from, to)) or kairos_next (the next N firings). Points are deterministic; out-of-coverage intervals are reported as annotations, never silently dropped. ${TZ_RULE} Use kairos_validate to check a definition without evaluating it, and kairos_reference to read the descriptor reference (Japanese canonical, English mirror). Read resource kairos://llms.txt for the language overview.`,
  });

  const common = {
    source: z.string().describe('The Kairos definition text (premise + body expressions). Up to 64 KB.'),
    tz: z.string().describe('IANA time zone for labels and the [from, to) endpoints, e.g. "Asia/Tokyo". Required.'),
    supply: z.record(z.string(), z.unknown()).optional().describe('Static bundle resolving external() bindings: {binding | "premise.binding": {dates: ["YYYY-MM-DD", …] | instants: [epoch ms, …], covering, asof [, labels]}} — see https://kairos-lang.org/schema/supply.schema.json'),
    explain: z.boolean().optional().describe('Also return results[].stages: per-stage point counts and intermediate values (the counterpart of a SQL execution plan).'),
  };

  server.registerTool('kairos_list', {
    title: 'Evaluate a Kairos definition over a range',
    description: `All firings of each body expression in [from, to) (to is exclusive), with interval annotations and the coverage summary — the same CliReport as 'kairos list --json' (schema: https://kairos-lang.org/schema/cli-report.schema.json). ${TZ_RULE} Window at most ${LIMITS.windowYears} years. ${NOTE_DIAG}`,
    inputSchema: {
      ...common,
      from: z.string().regex(YMD).describe('Start of the range, YYYY-MM-DD (inclusive).'),
      to: z.string().regex(YMD).describe('End of the range, YYYY-MM-DD (exclusive).'),
    },
  }, ({ source, from, to, tz, supply, explain }) => runGuarded('list', {
    usage: () => {
      checkSource(source); checkTz(tz);
      if (yearsBetween(from, to) > LIMITS.windowYears) throw new KairosError(`評価範囲が広すぎる（上限 ${LIMITS.windowYears} 年）: [${from}, ${to})`);
    },
    supply: () => supplyOf(supply),
    eval: resolve => cmdList(source, { from, to, tz, ...(resolve ? { resolve } : {}), ...(explain ? { explain } : {}) }),
  }));

  server.registerTool('kairos_next', {
    title: 'Next N firings of a Kairos definition',
    description: `The next n firings at or after from (default: today in tz), searching up to horizonYears (default ${LIMITS.horizonYears}) — the same CliReport as 'kairos next --json' (schema: https://kairos-lang.org/schema/cli-report.schema.json); found < requested means fewer than n firings exist within the horizon (the CLI's exit code 2). For files with a single body expression. ${TZ_RULE} ${NOTE_DIAG}`,
    inputSchema: {
      ...common,
      from: z.string().regex(YMD).optional().describe('Search start, YYYY-MM-DD (default: today in tz).'),
      n: z.number().int().min(1).max(LIMITS.n).optional().describe(`How many firings (default 1, at most ${LIMITS.n}).`),
      horizonYears: z.number().int().min(1).max(LIMITS.horizonYears).optional().describe(`Search horizon in years (default ${LIMITS.horizonYears}).`),
    },
  }, ({ source, from, n, horizonYears, tz, supply, explain }) => runGuarded('next', {
    // 報告は CLI の CliReport そのまま（公開 schema は additionalProperties: false＝exhausted のような追加の鍵は通らない。
    // 地平線内の不足は found < requested で読める＝2026-10-07 公開前レビュー）
    usage: () => { checkSource(source); checkTz(tz); },
    supply: () => supplyOf(supply),
    eval: resolve => cmdNext(source, { from: from ?? todayIn(tz), n: n ?? 1, horizonYears: horizonYears ?? LIMITS.horizonYears, tz,
      ...(resolve ? { resolve } : {}), ...(explain ? { explain } : {}) }),
  }));

  server.registerTool('kairos_validate', {
    title: 'Validate a Kairos definition without evaluating it',
    description: `Checks lexing, syntax, static rules and premise resolution (and the shape of supply if given) by evaluating the empty window [today, today) in tz. Returns {ok, version, diagnostics: [{kind, message}]}. Coverage-related signals (annotations, runway) only appear with a real range in kairos_list. ${TZ_RULE} ${NOTE_DIAG}`,
    inputSchema: { source: common.source, tz: common.tz, supply: common.supply },
  }, ({ source, tz, supply }) => {
    const r = runGuarded('list', {
      usage: () => { checkSource(source); checkTz(tz); },
      supply: () => supplyOf(supply),
      eval: resolve => { const d = todayIn(tz); return cmdList(source, { from: d, to: d, tz, ...(resolve ? { resolve } : {}) }); },
    });
    if (r.isError) {
      const e = r.structuredContent as unknown as CliErrorReport;
      return ok({ ok: false, version: e.version, diagnostics: [e.error] });
    }
    const rep = r.structuredContent as unknown as CliReport;
    return ok({ ok: true, version: rep.version, diagnostics: [], expressions: rep.results.length });
  });

  const words = (lang: Lang) => existsSync(join(DOCS_DIR, 'reference', lang))
    ? readdirSync(join(DOCS_DIR, 'reference', lang)).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, '')).sort()
    : [];
  const readRef = (lang: Lang, word: string) => {
    if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(word)) return undefined;
    const p = join(DOCS_DIR, 'reference', lang, `${word}.md`);
    return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
  };

  server.registerTool('kairos_reference', {
    title: 'Read the Kairos descriptor reference',
    description: 'The reference page for one descriptor (e.g. "roll", "within", "nth", "segmentBy"; "README" lists them; "combinators", "sugar-definition", "table-literal" are the shared pages). Japanese is canonical; lang: "en" returns the English mirror. Unknown words return the list of available words.',
    inputSchema: {
      word: z.string().describe('Descriptor name as written in a definition, e.g. "roll".'),
      lang: z.enum(['ja', 'en']).optional().describe('"ja" (canonical, default) or "en".'),
    },
  }, ({ word, lang }) => {
    const l: Lang = lang ?? 'ja';
    const text = readRef(l, word);
    if (text === undefined) {
      return fail({ error: { kind: 'usage', message: `unknown descriptor "${word}" — available: ${words(l).join(', ')}` }, words: words(l) });
    }
    return { content: [{ type: 'text', text }] };
  });

  server.registerResource('llms', 'kairos://llms.txt', {
    title: 'Kairos — overview for AI readers (llms.txt)',
    description: 'What the language is, where the spec/reference/playground are, the machine-readable contract and the disambiguation note.',
    mimeType: 'text/plain',
  }, uri => ({ contents: [{ uri: uri.href, text: readFileSync(join(DOCS_DIR, 'llms.txt'), 'utf8'), mimeType: 'text/plain' }] }));

  server.registerResource('reference', new ResourceTemplate('kairos://reference/{lang}/{word}', {
    list: () => ({
      resources: (['ja', 'en'] as Lang[]).flatMap(l => words(l).map(w => ({
        uri: `kairos://reference/${l}/${w}`, name: `${w} (${l})`, mimeType: 'text/markdown',
      }))),
    }),
  }), {
    title: 'Kairos descriptor reference (ja canonical / en mirror)',
    mimeType: 'text/markdown',
  }, (uri, vars) => {
    const l = String(vars.lang) as Lang, w = String(vars.word);
    const text = (l === 'ja' || l === 'en') ? readRef(l, w) : undefined;
    if (text === undefined) throw new Error(`no reference page: ${uri.href}`);
    return { contents: [{ uri: uri.href, text, mimeType: 'text/markdown' }] };
  });

  return server;
}
