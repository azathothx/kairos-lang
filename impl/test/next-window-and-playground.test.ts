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
