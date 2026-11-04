// カレンダーページ（/calendar/・/en/calendar/＝2026-10-30 新設）: 穴埋めの例が組み立てる式は CLI の list と同じ点列を返す。
// ページはブラウザ専用（DOM）だが、式の組み立て・格子・⚠ の言い換え・共有 URL のハッシュは純関数＝ここから直接呼ぶ。
// .ics は Playground の buildIcs をそのまま呼ぶ（ics.test.ts が CLI と同一文字列を検査済み）ので、ここでは点列と URL の往復を見る。
// 例ごとに it を分ける: 1 本に束ねると約 45 評価＝単独 11 秒・スイートの負荷時に 48 秒で既定の 30 秒を超えた（2026-10-30 実測）
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { cmdList } from '../src/cli.ts';

const root = new URL('../../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');

type Values = Record<string, string>;
type Cal = {
  EXAMPLES: Record<string, Record<string, { fields: { key: string }[]; window?: number }>>;
  buildSource: (lang: string, id: string, v: Values) => string;
  defaultValues: (lang: string, id: string) => Values;
  packValues: (lang: string, id: string, v: Values) => string;
  unpackValues: (lang: string, id: string, packed: string) => Values;
  holidaySource: (lang: string) => string;
  monthsIn: (from: string, to: string) => { y: number; m: number }[];
  gridCells: (y: number, m: number, wkst?: string) => { date: string; day: number; inMonth: boolean }[][];
  wkstOf: (source: string) => string;
  weekOrder: (wkst: string) => number[];
  plainWarning: (lang: string, a: unknown[], c: unknown[]) => string | null;
  calendarHash: (o: { lang: string; exampleId: string | null; values: Values; source: string; from: string; to: string; tz: string }) => URLSearchParams;
  parseCalendarHash: (h: string) => { e?: string; v?: string; s?: string; f?: string; t?: string; z?: string } | null;
  nameOf: (source: string) => string;
  hasExample: (lang: string, id: string) => boolean;
  isValidTz: (tz: string) => boolean;
  withName: (source: string, name: string) => string;
};
type Run = (s: string, o: { from: string; to: string; tz: string }) => { results: { dates: string[]; annotations: unknown[] }[]; coverage: unknown[] };

const cal = await import(new URL('../../calendar/core.js', import.meta.url).href) as Cal;
const { run } = await import(new URL('../../playground/js/index.js', import.meta.url).href) as { run: Run };
const { b64d } = await import(new URL('../../playground/core.js', import.meta.url).href) as { b64d: (s: string) => string };

/** 例 5 本（指示は 4〜6 本）。例を足したらここと variants・expected にも足す */
const IDS = ['garbage', 'burnable', 'pay', 'alarm', 'lesson'];
// 穴を変えた形（既定値以外）: 2 つ目の週なし・曜日 1 つ・月末なしの翌営業日・時刻違い・休みなし
const variants: Record<string, Values> = {
  garbage: { n1: '2', n2: '-', wd: 'Fri' }, burnable: { d1: 'Wed', d2: 'Wed' }, pay: { day: '25', eom: '0', roll: 'Following' },
  alarm: { wk: '07:15', late: '09:00' }, lesson: { wd: 'Sat', at: '10:30', summer: '0', newyear: '0' },
};
const W = { from: '2026-10-01', to: '2027-01-01' };
const expected: Record<string, string[]> = {   // 既定値の先頭 3 点（ja）——穴埋めの意味が変わったら割れる
  garbage: ['2026-10-07', '2026-10-21', '2026-11-04'], burnable: ['2026-10-01', '2026-10-05', '2026-10-08'],
  pay: ['2026-10-15', '2026-10-30', '2026-11-13'], alarm: ['2026-10-01T06:30', '2026-10-02T06:30', '2026-10-03T08:00'],
  lesson: ['2026-10-06T17:00', '2026-10-13T17:00', '2026-10-20T17:00'],
};
const tzOf = (lang: string) => (lang === 'ja' ? 'Asia/Tokyo' : 'America/New_York');

describe('カレンダーページ（/calendar/）: 穴埋めの例は CLI と同じ点列・共有 URL は Playground と同じ形で往復する', () => {
  for (const id of IDS) {
    it(`例 ${id}: 日英とも既定値と穴を変えた形が CLI の list と同じ点列・穴の値は URL の v と往復・ja の先頭 3 点は固定`, () => {
      for (const lang of ['ja', 'en']) {
        const tz = tzOf(lang);
        expect(cal.EXAMPLES[lang][id].fields.map(f => f.key)).toEqual(cal.EXAMPLES.ja[id].fields.map(f => f.key));   // 英語は同内容のミラー（同じ穴）
        for (const values of [cal.defaultValues(lang, id), variants[id]]) {
          const src = cal.buildSource(lang, id, values);
          expect(src.startsWith('# ')).toBe(true);                                                  // 先頭のコメント行＝予定の名前
          const page = run(src, { ...W, tz }).results.map(r => r.dates);
          const cli = cmdList(src, { ...W, tz }).results.map(r => r.dates);
          expect(page, `${lang}/${id}`).toEqual(cli);                                               // ページの評価器＝CLI
          expect(page.length).toBe(1);
          expect(page[0].length).toBeGreaterThan(0);
          expect(cal.unpackValues(lang, id, cal.packValues(lang, id, values))).toEqual(values);     // 穴の値は URL の v と往復する
        }
      }
      expect(run(cal.buildSource('ja', id, cal.defaultValues('ja', id)), { ...W, tz: 'Asia/Tokyo' }).results[0].dates.slice(0, 3)).toEqual(expected[id]);
    });
  }

  it('例の一覧は日英で同じ 5 本・祝日の列は格子の赤と同じ式・⚠ は平易な一言・格子は在圏 premise の wkst に従う（既定は月曜）・共有 URL は b64d で元のソースに戻る・日英 HTML の部品', () => {
    expect(Object.keys(cal.EXAMPLES.ja)).toEqual(IDS);
    expect(Object.keys(cal.EXAMPLES.en)).toEqual(IDS);
    // 2026-10-12（ja＝スポーツの日・en＝Columbus Day）は両方の表で祝日。祝日の列はページの格子の赤と同じ式から出る
    for (const lang of ['ja', 'en']) {
      expect(run(cal.holidaySource(lang), { from: '2026-10-01', to: '2026-11-01', tz: tzOf(lang) }).results[0].dates).toEqual(['2026-10-12']);
    }
    // ⚠ の平易な一言: 2028 年に掛かる範囲（表は 2027 年分まで）
    const far = run(cal.buildSource('ja', 'pay', cal.defaultValues('ja', 'pay')), { from: '2027-12-01', to: '2028-02-01', tz: 'Asia/Tokyo' });
    expect(far.results[0].annotations.length).toBeGreaterThan(0);
    expect(cal.plainWarning('ja', far.results[0].annotations, far.coverage)).toBe('この表は 2027 年分までです。2028 年の予定は祝日を知らずに出ています。');
    expect(cal.plainWarning('en', far.results[0].annotations, far.coverage)).toBe('The holiday table ends with 2027. The dates in 2028 were computed without knowing the holidays.');
    expect(cal.plainWarning('ja', [], far.coverage)).toBeNull();                                     // 註釈が無ければ一言も無い
    const both = run(cal.buildSource('ja', 'pay', cal.defaultValues('ja', 'pay')), { from: '2025-12-01', to: '2028-02-01', tz: 'Asia/Tokyo' });
    const bothText = cal.plainWarning('ja', both.results[0].annotations, both.coverage)!;
    expect(bothText).toContain('2025 年');                                                          // 表の前後の両方にはみ出したら両方言う（所見 5）
    expect(bothText).toContain('2028 年');
    // 格子: 週の始まりは在圏 premise の wkst（既定は月曜）・前後の月で埋める・[from, to) に掛かる月だけ
    expect(cal.wkstOf(cal.buildSource('ja', 'garbage', cal.defaultValues('ja', 'garbage')))).toBe('Mon');          // JP_PREMISE は wkst: Mon
    expect(cal.wkstOf(cal.buildSource('en', 'garbage', cal.defaultValues('en', 'garbage')))).toBe('Sun');          // US_PREMISE は wkst: Sun
    expect(cal.wkstOf('premise P = Gregorian with { wkst: Sat }\n@P\neveryDay')).toBe('Sat');                      // 派生 with の形
    expect(cal.wkstOf('premise A { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Sun }\npremise B { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Tue }\n@B\neveryDay')).toBe('Tue');   // @ が指す方
    expect(cal.wkstOf('@Gregorian\neveryDay')).toBe('Mon');                                                           // 無ければ Mon
    // 機械レビュー所見 3（2026-10-31）: 派生の連鎖は基底まで辿る・@ 行の註と字下げ・wkst の無い premise は他の premise の値を拾わない
    const AB = 'premise A { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Sun }\npremise B { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }\n';
    expect(cal.wkstOf(AB + 'premise P = B with { tz: "Asia/Tokyo" }\n@P\neveryDay')).toBe('Mon');
    expect(cal.wkstOf(AB + '@B # 在圏\neveryDay')).toBe('Mon');
    expect(cal.wkstOf(AB + '  @A\neveryDay')).toBe('Sun');
    expect(cal.wkstOf(AB + 'premise X { calendar-system: Gregorian; tz: "Asia/Tokyo" }\n@X\neveryDay')).toBe('Mon');
    expect(cal.weekOrder('Sun')).toEqual([7, 1, 2, 3, 4, 5, 6]);
    const octSun = cal.gridCells(2026, 10, 'Sun');
    expect(octSun.length).toBe(5);
    expect(octSun[0].map(c => `${c.inMonth ? '' : '.'}${c.day}`)).toEqual(['.27', '.28', '.29', '.30', '1', '2', '3']);
    expect(octSun[4][6]).toEqual({ date: '2026-10-31', day: 31, inMonth: true });
    const oct = cal.gridCells(2026, 10);
    expect(oct.length).toBe(5);
    expect(oct[0].map(c => `${c.inMonth ? '' : '.'}${c.day}`)).toEqual(['.28', '.29', '.30', '1', '2', '3', '4']);
    expect(oct[4][6]).toEqual({ date: '2026-11-01', day: 1, inMonth: false });
    expect(cal.monthsIn('2026-10-15', '2027-01-01').map(x => x.m)).toEqual([10, 11, 12]);
    expect(cal.monthsIn('2026-12-31', '2027-01-01')).toEqual([{ y: 2026, m: 12 }]);
    // 共有 URL のハッシュ＝Playground と同じ s・f・t・z（z は Asia/Tokyo 以外のときだけ）＋e・v。s は b64d で元のソース全文に戻る
    const src = cal.buildSource('ja', 'garbage', { n1: '1', n2: '3', wd: 'Wed' });
    const h = cal.calendarHash({ lang: 'ja', exampleId: 'garbage', values: { n1: '1', n2: '3', wd: 'Wed' }, source: src, from: W.from, to: W.to, tz: 'Asia/Tokyo' });
    expect([...h.keys()]).toEqual(['s', 'f', 't', 'e', 'v']);
    expect(b64d(h.get('s')!)).toBe(src);
    expect(Buffer.from(h.get('s')!, 'base64url').toString('utf8')).toBe(src);                       // base64url・UTF-8（tools/pg-link.mjs と同じ）
    const back = cal.parseCalendarHash('#' + h.toString())!;
    expect(back).toEqual({ e: 'garbage', v: '1,3,Wed', s: src, f: W.from, t: W.to, z: undefined });
    expect(cal.calendarHash({ lang: 'en', exampleId: null, values: {}, source: src, from: W.from, to: W.to, tz: 'America/New_York' }).get('z')).toBe('America/New_York');
    expect(cal.parseCalendarHash('')).toBeNull();
    expect(cal.parseCalendarHash('#s=%%%')).toBeNull();                                             // 壊れたハッシュは null（例外にしない）
    // 予定の名前＝式の先頭のコメント行（Playground の規約と同じ・.ics の予定名と印刷の題）。Playground 由来の式では欄で差し替える
    expect(cal.nameOf(src)).toBe('資源ごみ（第 1・第 3 水曜）');
    expect(cal.nameOf('premise X { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }\n@X\neveryDay')).toBe('');
    expect(cal.withName('premise X {}\n@X\neveryDay', '塾')).toBe('# 塾\npremise X {}\n@X\neveryDay');            // 無ければ足す
    expect(cal.withName('# a\nx', ' b ')).toBe('# b\nx');                                                           // 差し替え（前後の空白は落とす）
    expect(cal.withName('# a\nx', '')).toBe('x');                                                                    // 空なら外す
    expect(cal.withName('\n\n# a\nx', 'b')).toBe('\n\n# b\nx');                                                  // 先頭の空行は保つ
    expect(cal.nameOf(cal.withName(src, '別名'))).toBe('別名');
    expect(cal.withName('# a\nx', 'b\neveryDay')).toBe('# b everyDay\nx');                                     // 改行は式の行を増やさない（所見 6）
    // URL から来た値を信じない（所見 1・7）: 無い例・選択肢にない値・時刻でない値
    expect(cal.hasExample('ja', 'garbage')).toBe(true);
    expect(cal.hasExample('ja', 'constructor')).toBe(false);
    expect(cal.hasExample('ja', '__proto__')).toBe(false);
    expect(() => cal.unpackValues('ja', 'constructor', '')).toThrow(/unknown example/);
    expect(cal.unpackValues('ja', 'garbage', '9,x,Foo')).toEqual({ n1: '1', n2: '3', wd: 'Wed' });
    expect(cal.unpackValues('ja', 'alarm', '25:00,7:30')).toEqual({ wk: '06:30', late: '08:00' });
    expect(cal.isValidTz('Asia/Tokyo')).toBe(true);
    expect(cal.isValidTz('Asia/Tokyoo')).toBe(false);                                               // 不正な tz は窓の計算を既定 tz で（所見 2）
    // ページの部品: 日英の HTML に同じ id・Playground 側に「カレンダーで見る」の導線・共有 URL の形の公開文書（recipes/README 日英）
    for (const html of ['calendar/index.html', 'en/calendar/index.html']) {
      const t = read(html);
      expect(t.startsWith('---\n')).toBe(true);
      expect(t).toContain('layout: default');
      for (const id of ['cal-example', 'cal-fields', 'cal-from', 'cal-to', 'cal-tz', 'cal-months', 'cal-prev', 'cal-next', 'cal-ics', 'cal-ics-split', 'cal-pg', 'cal-share', 'cal-warn', 'cal-warn-raw-pre', 'cal-src']) {
        expect(t, `${html} に id=${id}`).toContain(`id="${id}"`);
      }
    }
    for (const html of ['playground/index.html', 'en/playground/index.html']) expect(read(html)).toContain('id="pg-calendar"');
    for (const md of ['recipes/README.md', 'en/recipes/README.md']) {
      const t = read(md);
      expect(t).toContain('#s=');
      expect(t).toContain('base64url');
      expect(t).toContain('calendar/');
    }
  });
});
