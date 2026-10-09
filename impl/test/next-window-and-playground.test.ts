// 1.0 追補 23 の小さな宿題 2 件（90-open 2-4・設計記録の未処置の気づき）:
// (1) next の探索窓は 7 日から倍々（旧: 1 年から。日次の予定の次の 1 点に 1 年分を評価していた。細かい列の重さは to+400 日の実体化＝90-open 2-4）。
// (2) Playground＝本体式の無い定義は CLI と同じ 1 行（旧: 「（出力なし）」）・画面に参照実装の版と指紋（学習者が「同じ版」を確かめる口）。
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { cmdList, cmdNext } from '../src/cli.ts';
import type { CliLang } from '../src/cli.ts';

const JP = 'premise JP { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }\n@JP\n';

describe('next の探索窓は 7 日から倍々（90-open 2-4）', () => {
  it('分刻みの列の次の 1 点——7 日窓で見つかり、確定再評価の意味論は不変（to は最終発火日の翌日）', () => {
    const rep = cmdNext(JP + 'everyInstant |> strideBy(1m, from: 2026-01-01T00:00)\n', { from: '2026-01-01', n: 1, horizonYears: 10 });
    expect(rep).toMatchObject({ found: 1, requested: 1, to: '2026-01-02' });
    expect(rep.results[0].dates).toEqual(['2026-01-01']);
    // 1 秒刻みは計算範囲 to+400 日までの実体化が支配項（約 35 秒）＝90-open 2-4 に残る。ここでは測らない
  });
  it('224 日より先・1 年以内の発火（1 月から見た 12 月）も見つかり、to は最終発火日の翌日', () => {
    const rep = cmdNext(JP + 'everyDay |> filter(d => month(d) == 12) |> within(month) |> first\n', { from: '2026-01-05', n: 1, horizonYears: 10 });
    expect(rep).toMatchObject({ found: 1, to: '2026-12-02' });
    expect(rep.results[0].dates).toEqual(['2026-12-01']);
  });
  it('地平線まで探して不足なら to は地平線の端（従来どおり）', () => {
    const rep = cmdNext(JP + 'everyDay |> within(year) |> last\n', { from: '2026-01-05', n: 3, horizonYears: 2 });
    expect(rep).toMatchObject({ requested: 3, found: 2, horizonYears: 2, to: '2028-01-05' });
  });
});

describe('Playground: 本体式の無い定義は CLI と同じ文言・画面に参照実装の版と指紋（1.0 追補 23）', () => {
  it('core.js は premise だけの定義に CLI の使い方エラーと同じ 1 行を出し、pg-build に版と指紋を出す', async () => {
    const mk = (value = '') => ({ value, textContent: '', h: {} as Record<string, (e?: unknown) => void>,
      addEventListener(t: string, f: (e?: unknown) => void) { this.h[t] = f; }, dispatchEvent() { /* プリセット読込は不要 */ } });
    const els: Record<string, ReturnType<typeof mk>> = Object.fromEntries(
      ['pg-src', 'pg-out', 'pg-from', 'pg-to', 'pg-tz', 'pg-example', 'pg-run', 'pg-share', 'pg-build', 'pg-ics', 'pg-ics-split', 'pg-msg'].map(id => [id, mk()]));
    const g = globalThis as Record<string, unknown>;
    const saved = { document: g.document, location: g.location };
    g.document = { getElementById: (id: string) => els[id] };
    g.location = { hash: '', href: '' };
    try {
      const { init } = await import(new URL('../../playground/core.js', import.meta.url).href) as { init: (lang: string) => void };
      const info = readFileSync(new URL('../../playground/js/build-info.js', import.meta.url), 'utf8');
      const version = /IMPL_VERSION = '([^']+)'/.exec(info)![1];
      const sha = /IMPL_SOURCE_SHA = '([0-9a-f]{12})'/.exec(info)![1];
      expect(version).toBe(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);   // 版は package.json と同じ
      let cliMessage = '';
      try { cmdList(JP, { from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' }); } catch (e) { cliMessage = (e as Error).message; }
      expect(cliMessage).toMatch(/^本体式がない/);
      for (const lang of ['ja', 'en'] as CliLang[]) {
        init(lang);
        expect(els['pg-build'].textContent).toContain(version);
        expect(els['pg-build'].textContent).toContain(sha);
        els['pg-src'].value = JP; els['pg-from'].value = '2026-01-01'; els['pg-to'].value = '2026-02-01'; els['pg-tz'].value = 'Asia/Tokyo';
        els['pg-run'].h.click();
        expect(els['pg-out'].textContent).toBe(cliMessage);     // 日英とも評価器メッセージは日本語が正
      }
    } finally { g.document = saved.document; g.location = saved.location; }
  });
  it('「1 点ずつ別の予定にする」の既定＝スマホ（タッチ主体か狭い画面）ではオン・PC ではオフ（設計者裁定 2026-10-08＝スマホのアプリは RDATE を読まず、series は単発になり以後取り込めない）', async () => {
    const { isPhoneLike } = await import(new URL('../../playground/core.js', import.meta.url).href) as
      { isPhoneLike: (env?: Record<string, unknown>) => boolean };
    expect(isPhoneLike({ matchMedia: () => ({ matches: true }), innerWidth: 1200 })).toBe(true);     // タッチ主体
    expect(isPhoneLike({ matchMedia: () => ({ matches: false }), innerWidth: 390 })).toBe(true);     // 狭い画面
    expect(isPhoneLike({ matchMedia: () => ({ matches: false }), innerWidth: 1200 })).toBe(false);   // PC
    expect(isPhoneLike({})).toBe(false);                                                            // 判定できない環境は PC 扱い
    const mk = (value = '') => ({ value, textContent: '', checked: false, h: {} as Record<string, (e?: unknown) => void>,
      addEventListener(t: string, f: (e?: unknown) => void) { this.h[t] = f; }, dispatchEvent() { /* no-op */ } });
    const els: Record<string, ReturnType<typeof mk>> = Object.fromEntries(
      ['pg-src', 'pg-out', 'pg-from', 'pg-to', 'pg-tz', 'pg-example', 'pg-run', 'pg-share', 'pg-build', 'pg-ics', 'pg-ics-split', 'pg-msg'].map(id => [id, mk()]));
    const g = globalThis as Record<string, unknown>;
    const saved = { document: g.document, location: g.location, matchMedia: g.matchMedia };
    g.document = { getElementById: (id: string) => els[id] };
    g.location = { hash: '', href: '' };
    try {
      const { init } = await import(new URL('../../playground/core.js', import.meta.url).href) as { init: (lang: string) => void };
      g.matchMedia = () => ({ matches: true });
      init('ja');
      expect(els['pg-ics-split'].checked).toBe(true);     // スマホ＝既定で 1 点ずつ
      els['pg-ics-split'].checked = false;
      g.matchMedia = () => ({ matches: false });
      init('ja');
      expect(els['pg-ics-split'].checked).toBe(false);    // PC＝既定は series のまま
    } finally { g.document = saved.document; g.location = saved.location; g.matchMedia = saved.matchMedia; }
  });
});

describe('Playground の例の祝日表（2026-10-09 設計者裁定＝例は資産として毎年延ばす・言語は年で腐るデータを配布しない）', () => {
  const core = readFileSync(new URL('../../playground/core.js', import.meta.url), 'utf8');
  // 出所: 内閣府「国民の祝日について」CSV（2026-10-09 取得・休日 3/22 を含む 17 件）・OPM Federal Holidays（observed・2026-10-09 取得・11 件）
  const JP_2027 = ['2027-01-01', '2027-01-11', '2027-02-11', '2027-02-23', '2027-03-21', '2027-03-22', '2027-04-29', '2027-05-03', '2027-05-04',
    '2027-05-05', '2027-07-19', '2027-08-11', '2027-09-20', '2027-09-23', '2027-10-11', '2027-11-03', '2027-11-23'];
  const US_2027 = ['2027-01-01', '2027-01-18', '2027-02-15', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-10-11', '2027-11-11',
    '2027-11-25', '2027-12-24'];
  // 空でない表と covering を core.js から拾う（`holidays2027 = [] covering: 2027..2027` の空の表の教材は対象外）
  const tables = [...core.matchAll(/(\w+)\s*=\s*\[([^\]]+)\]\s*covering:\s*(\d{4})\.\.(\d{4})/g)]
    .map(m => ({ name: m[1], body: m[2], from: Number(m[3]), to: Number(m[4]) }));
  const expand = (body: string): string[] => body.split(',').map(x => x.trim()).filter(Boolean).flatMap(x => {
    const r = x.split('..'); if (r.length === 1) return [x];
    const out: string[] = [];
    for (let d = new Date(r[0] + 'T00:00:00Z'); d <= new Date(r[1] + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
    return out;
  });
  it('鮮度: 表の終端が「今日＋28 日（有視界の窓）＋余裕 60 日」より先にある——赤なら翌年分を上流から足す（年次作業・時計を読む唯一の witness）', () => {
    expect(tables.length).toBe(7);                                   // JP_PREMISE・payday・monthend3・cascade・US_PREMISE・en payday・en monthend3
    const deadline = Date.now() + 88 * 86400000;
    for (const t of tables) {
      const end = Date.UTC(t.to, 11, 31);
      expect(end, `${t.name} の表は ${t.to}-12-31 で尽きる（今日＋88 日より手前）——翌年分を内閣府 CSV／OPM から足す`).toBeGreaterThan(deadline);
    }
  });
  it('内容: 日本の表の 2027 年分は内閣府 CSV と一致（休日 3/22 を含む・cascade の statutory は祝日のみ）・米国は OPM の observed と一致・名前に年を含めない', () => {
    const jp = tables.filter(t => t.name === 'national' || t.name === 'holidays');
    expect(jp.map(t => t.name)).toEqual(['national', 'holidays', 'holidays']);
    for (const t of jp) expect(expand(t.body).filter(d => d.startsWith('2027')), t.name).toEqual(JP_2027);
    const st = tables.find(t => t.name === 'statutory')!;
    expect(expand(st.body).filter(d => d.startsWith('2027'))).toEqual(JP_2027.filter(d => d !== '2027-03-22'));
    const us = tables.filter(t => t.name === 'federal');
    expect(us.length).toBe(3);
    for (const t of us) expect(expand(t.body).filter(d => d.startsWith('2027')), t.name).toEqual(US_2027);
    for (const t of tables) expect(t.from).toBe(2026);
    expect(core).not.toMatch(/holidays2026|federal2026/);          // 表は年をまたぐので binding 名に年を含めない（2026-10-09 改名）
  });
});
