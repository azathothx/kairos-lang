// 1.0 追補 24: .ics（iCalendar）書き出し——CLI --ics と Playground「カレンダーに入れる」の witness。
// 決め（impl/src/ics.ts 冒頭）: 終日／時刻付き・RRULE なし・VALARM は時刻付きのみ・註釈は終日の予定（表示形の半開 [from, to)）・
// 決定性（DTSTAMP＝DTSTART・UID は定義と点から）・名前は先頭コメント行・CRLF と 75 オクテット折り返し。
// 変異 4 系統（折り返しを外す・VALARM を落とす・DTEND を閉端にする・RDATE を落とす）で赤を実測してから数える（2026-08-31 の教訓）。
// 公開前レビュー（2026-10-07）で足した 4 本（; のエスケープ・ε 註釈の DTEND・同じ字面の式の UID・CLI の予定 0 件）は退行版へ戻して赤を実測。
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { toIcs, foldLine, escapeText, icsUtc, fnv1a64, titleFromSource, icsEventCount } from '../src/ics.ts';
import { cmdList } from '../src/cli.ts';

const IMPL = fileURLToPath(new URL('..', import.meta.url));
const JP = `premise JP {
  calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  national = [2026-01-01, 2026-01-12, 2026-02-11, 2026-02-23, 2026-03-20, 2026-04-29, 2026-05-03..2026-05-06,
              2026-07-20, 2026-08-11, 2026-09-21..2026-09-23, 2026-10-12, 2026-11-03, 2026-11-23] covering: 2026..2026
  satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  bizDay = everyDay \\ (satSun | national)
}
@JP
`;
const ALARM = '# 目覚まし（平日 6:30・土曜と祝日 8:00）\n' + JP + `sat = everyDay |> filter(d => weekday(d) == Sat)
sun = everyDay |> filter(d => weekday(d) == Sun)
lateDay = (sat | national) \\ sun
(bizDay |> at(T06:30)) | (lateDay |> at(T08:00))
`;
const GARBAGE = '# 資源ごみ（第 1・第 3 水曜）\n' + JP + `wed = everyDay |> filter(d => weekday(d) == Wed)
(wed |> within(month) |> nth(1)) | (wed |> within(month) |> nth(3))
`;
const lines = (ics: string) => ics.split('\r\n');
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, '');
const events = (ics: string) => unfold(ics).split('BEGIN:VEVENT').slice(1).map(e => e.split('END:VEVENT')[0]);
const W = { from: '2026-10-05', to: '2026-10-07', tz: 'Asia/Tokyo' };

describe('.ics 書き出し（1.0 追補 24）: 終日と時刻付き・VALARM・RRULE なし・註釈の予定', () => {
  it('日粒度の点は終日（DTSTART;VALUE=DATE）・VALARM なし・RRULE は書かない・先頭コメント行が名前', () => {
    const rep = cmdList(GARBAGE, { from: '2026-01-01', to: '2026-03-01', tz: 'Asia/Tokyo' });
    const ics = toIcs(rep, { source: GARBAGE });
    const ev = events(ics);
    expect(ev.length).toBe(4);                                        // 1/7 1/21 2/4 2/18
    expect(ev[0]).toContain('DTSTART;VALUE=DATE:20260107');
    expect(ev[0]).not.toContain('DTEND');
    expect(ev[0]).toContain('TRANSP:TRANSPARENT');             // 空き時間を塞がない
    expect(ev[0]).not.toContain('VALARM');
    expect(ics).not.toContain('RRULE');
    expect(ev[0]).toContain('SUMMARY:資源ごみ（第 1・第 3 水曜）');
    expect(ics).toContain('X-WR-CALNAME:資源ごみ（第 1・第 3 水曜）');
    expect(ics).toContain('X-KAIROS-RANGE:2026-01-01/2026-03-01');
    expect(ics).toContain('X-KAIROS-TZ:Asia/Tokyo');
  });
  it('時刻付きの点は UTC の瞬間（JST 06:30 ＝ 前日 21:30Z）・0 分（DTEND＝DTSTART）＋VALARM（ACTION:DISPLAY・TRIGGER:PT0M）', () => {
    const rep = cmdList(ALARM, W);
    const ev = events(toIcs(rep, { source: ALARM }));
    expect(ev.length).toBe(2);
    expect(ev[0]).toContain('DTSTART:20261004T213000Z');
    expect(ev[0]).toContain('DTEND:20261004T213000Z');          // 0 分（Google は DTEND 無しを 1 時間にする＝2026-10-06 実測）
    expect(ev[0]).toContain('X-KAIROS-LABEL:2026-10-05T06:30');
    expect(ev[0]).toContain('X-KAIROS-POINT:' + rep.results[0].points[0]);
    expect(ev[0]).toContain('BEGIN:VALARM');
    expect(ev[0]).toContain('ACTION:DISPLAY');
    expect(ev[0]).toContain('TRIGGER:PT0M');
  });
  it('区間註釈は終日の予定（表示形の半開 [from, to) を DTSTART/DTEND に・TRANSP:TRANSPARENT）——表の外は黙らない', () => {
    const src = JP + 'd15 = everyDay |> within(month) |> nth(15)\neom = everyDay |> within(month) |> last\n(d15 | eom) |> roll(Preceding, on: bizDay)\n';
    const rep = cmdList(src, { from: '2026-01-01', to: '2026-03-01', tz: 'Asia/Tokyo' });
    expect(rep.results[0].annotations.length).toBe(1);                // 窓頭 2026-01-01..2026-01-02（ADR-37）
    const a = rep.results[0].annotations[0];
    const ics = toIcs(rep);
    const ann = events(ics).filter(e => e.includes('SUMMARY:⚠'));
    expect(ann.length).toBe(1);
    expect(ann[0]).toContain(`DTSTART;VALUE=DATE:${a.from.replace(/-/g, '')}`);
    expect(ann[0]).toContain(`DTEND;VALUE=DATE:${a.to.replace(/-/g, '')}`);
    expect(ann[0]).toContain('SUMMARY:⚠ 範囲外 2026-01-01..2026-01-02（JP.national covering 2026-01-01..2026-12-31）');
    expect(ann[0]).toContain('TRANSP:TRANSPARENT');
    expect(ann[0]).toContain('この区間は表の外に依存する');
    expect(ann[0]).not.toContain('VALARM');
    expect(unfold(toIcs(rep, { lang: 'en' }))).toContain('update the table and regenerate');   // 折り返しを戻してから探す
    expect(events(ics).length).toBe(4 + 1);                           // 1/15 1/30 2/13 2/27 ＋註釈
  });
  it('ε（1 ms）の註釈区間は表示形が同じ日付になる——DTEND は書かない（DTEND は DTSTART より後＝RFC 5545 §3.8.2.2・DTEND 無しの終日は 1 日。公開前レビュー 2026-10-07）', () => {
    // 表が 1 日だけ・窓頭が軸点＝roll(Preceding) が窓頭の直前（表の外）を見る形。評価器は ε の区間を返し、表示形は from == to に畳まれる
    const src = `premise P {
  calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  national = [2026-02-11] covering: 2026..2026
  satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  bizDay = everyDay \\ (satSun | national)
}
@P
everyDay |> within(month) |> nth(15) |> roll(Preceding, on: bizDay)
`;
    const rep = cmdList(src, { from: '2026-01-01', to: '2026-03-01', tz: 'Asia/Tokyo' });
    const a = rep.results[0].annotations;
    expect(a.length).toBe(1);
    expect([a[0].from, a[0].to, a[0].toMs - a[0].fromMs]).toEqual(['2026-01-01', '2026-01-01', 1]);
    const ann = events(toIcs(rep)).filter(e => e.includes('SUMMARY:⚠'));
    expect(ann.length).toBe(1);
    expect(ann[0]).toContain('DTSTART;VALUE=DATE:20260101');
    expect(ann[0]).not.toContain('DTEND');
  });
});

describe('.ics 書き出し: series（1 式 1 予定＋RDATE＝1 つの繰り返し予定）', () => {
  it('終日の式は DTSTART;VALUE=DATE ＋ RDATE;VALUE=DATE（残りの点）・UID は式ごと・X-KAIROS-COUNT・註釈は別の予定のまま', () => {
    const src = JP + 'd15 = everyDay |> within(month) |> nth(15)\neom = everyDay |> within(month) |> last\n(d15 | eom) |> roll(Preceding, on: bizDay)\n';
    const rep = cmdList(src, { from: '2026-01-01', to: '2026-03-01', tz: 'Asia/Tokyo' });
    const ics = toIcs(rep, { series: true, title: '給料日' });
    const ev = events(ics);
    expect(ev.length).toBe(2);                                        // 式の予定 1 ＋ 註釈 1
    expect(ev[0]).toContain('UID:kairos-');
    expect(ev[0]).toMatch(/UID:kairos-[0-9a-f]{12}-series@kairos-lang\.org/);
    expect(ev[0]).toContain('DTSTART;VALUE=DATE:20260115');
    expect(ev[0]).toContain('RDATE;VALUE=DATE:20260130,20260213,20260227');
    expect(ev[0]).toContain('X-KAIROS-COUNT:4');
    expect(ev[0]).toContain('SUMMARY:給料日');
    expect(ev[0]).toContain('TRANSP:TRANSPARENT');
    expect(ev[0]).not.toContain('VALARM');
    expect(ev[1]).toContain('SUMMARY:⚠ 範囲外');
    expect(icsEventCount(rep)).toBe(4);                                // 件数は点のまま
  });
  it('時刻付きの式は DTSTART/DTEND（0 分）＋ RDATE の UTC 列・VALARM は 1 つ・25 個ずつ複数行・点列は 1 点 1 予定の形と同じ', () => {
    const rep = cmdList(ALARM, { from: '2026-10-05', to: '2026-12-01', tz: 'Asia/Tokyo' });
    const n = rep.results[0].dates.length;
    expect(n).toBeGreaterThan(26);
    const ics = toIcs(rep, { series: true, source: ALARM });
    const ev = events(ics);
    expect(ev.length).toBe(1);
    expect(ev[0]).toContain('DTSTART:20261004T213000Z');
    expect(ev[0]).toContain('DTEND:20261004T213000Z');
    expect((ev[0].match(/^RDATE:/gm) ?? []).length).toBe(Math.ceil((n - 1) / 25));
    expect((ev[0].match(/BEGIN:VALARM/g) ?? []).length).toBe(1);
    const rdates = ev[0].split('\r\n').filter(l => l.startsWith('RDATE:')).flatMap(l => l.slice(6).split(','));
    const single = events(toIcs(rep, { source: ALARM })).map(e => /DTSTART:(\S+)/.exec(e)![1]);
    expect(['20261004T213000Z', ...rdates]).toEqual(single);           // 同じ点列
    expect(toIcs(rep, { series: true, source: ALARM })).toBe(toIcs(rep, { series: true, source: ALARM }));
  });
});

describe('.ics 書き出し: 決定性と名前', () => {
  it('同じ入力からは同じ文字列・DTSTAMP は DTSTART と同じ瞬間・UID は定義と点から決まり定義を変えると変わる', () => {
    const rep = cmdList(ALARM, W);
    const a = toIcs(rep, { source: ALARM }), b = toIcs(rep, { source: ALARM });
    expect(a).toBe(b);
    const ev = events(a)[0];
    expect(/DTSTAMP:(\S+)/.exec(ev)![1]).toBe(/DTSTART:(\S+)/.exec(ev)![1]);
    const uid = /UID:(\S+)/.exec(ev)![1];
    expect(uid).toMatch(/^kairos-[0-9a-f]{12}-\d+@kairos-lang\.org$/);
    const rep2 = cmdList(ALARM.replace('T06:30', 'T06:31'), W);
    expect(/UID:(\S+)/.exec(events(toIcs(rep2))[0])![1]).not.toBe(uid);
    expect(new Set(events(a).map(e => /UID:(\S+)/.exec(e)![1])).size).toBe(2);   // 点ごとに別
  });
  it('同じ字面の式が 2 つあっても UID は別（鍵にファイル内の順番を含む）——series で別の点列の 2 予定が 1 つに潰れない（RFC 5545 §3.8.4.7・公開前レビュー 2026-10-07）', () => {
    const o = { from: '2026-01-01', to: '2026-03-01', tz: 'Asia/Tokyo' };
    const src = JP + 'everyDay |> within(month) |> first\neveryDay |> within(month) |> first\n';
    const rep = cmdList(src, o);
    const series = events(toIcs(rep, { series: true })).map(e => /UID:(\S+)/.exec(e)![1]);
    expect(series.length).toBe(2);
    expect(new Set(series).size).toBe(2);
    const single = events(toIcs(rep)).map(e => /UID:(\S+)/.exec(e)![1]);
    expect(single.length).toBe(4);
    expect(new Set(single).size).toBe(4);                                          // 1 点 1 予定でも全 UID が相異なる
    expect(toIcs(rep)).toBe(toIcs(cmdList(src, o)));                                // 決定性は保つ
  });
  it('名前の優先順: title → 先頭コメント行 → fallbackTitle → 式の 1 行目。式が複数なら「名前 · 式」', () => {
    const rep = cmdList(GARBAGE, { from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' });
    expect(toIcs(rep, { title: 'ごみ', source: GARBAGE })).toContain('SUMMARY:ごみ');
    expect(toIcs(rep, { source: GARBAGE })).toContain('SUMMARY:資源ごみ（第 1・第 3 水曜）');
    expect(toIcs(rep, { fallbackTitle: 'garbage' })).toContain('SUMMARY:garbage');
    expect(toIcs(rep)).toContain('SUMMARY:(wed |> within(month) |> nth(1)) | (wed |> within(month) |> nth(3))');
    const two = cmdList(JP + 'everyDay |> within(month) |> first\neveryDay |> within(month) |> last\n', { from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' });
    const ics = toIcs(two, { title: '月' });
    expect(ics).toContain('SUMMARY:月 · everyDay |> within(month) |> first');
    expect(ics).toContain('SUMMARY:月 · everyDay |> within(month) |> last');
    expect(titleFromSource('\n  # 名前 \nx')).toBe('名前');
    expect(titleFromSource('premise X {}')).toBeUndefined();
    expect(icsEventCount(two)).toBe(2);
  });
});

describe('.ics 書き出し: 行の形（CRLF・75 オクテット折り返し・エスケープ）', () => {
  it('全行 CRLF・BEGIN/END で囲む・PRODID に版・各行 75 オクテット以内・継続行は空白始まり・多バイト文字を割らない', () => {
    const long = '# ' + 'あ'.repeat(80) + ', ; \\ の入った名前\n' + JP + 'everyDay |> within(month) |> last\n';
    const rep = cmdList(long, { from: '2026-01-01', to: '2026-03-01', tz: 'Asia/Tokyo' });
    const ics = toIcs(rep, { source: long });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//kairos-lang.org//Kairos ' + rep.version + '//EN\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    const enc = new TextEncoder();
    for (const l of lines(ics).slice(0, -1)) expect(enc.encode(l).length, l).toBeLessThanOrEqual(75);
    expect(lines(ics).some(l => l.startsWith(' '))).toBe(true);
    expect(unfold(ics)).not.toContain('�');
    expect(unfold(ics)).toContain('X-WR-CALNAME:' + 'あ'.repeat(80) + '\\, \\; \\\\ の入った名前');
    expect(unfold(ics)).toContain('X-KAIROS-SOURCE:# ' + 'あ'.repeat(80));
  });
  it('補助関数: escapeText・foldLine の境界・icsUtc の秒未満切り捨て・fnv1a64 の既知値', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');       // ; も \; に（JS の '\;' は ';' に潰れる誤記を 2026-10-07 に訂正）
    expect(foldLine('x'.repeat(75))).toEqual(['x'.repeat(75)]);
    expect(foldLine('x'.repeat(76))).toEqual(['x'.repeat(75), ' x']);
    expect(foldLine('x'.repeat(75 + 74 + 1))).toEqual(['x'.repeat(75), ' ' + 'x'.repeat(74), ' x']);
    expect(foldLine('x'.repeat(74) + 'あ')).toEqual(['x'.repeat(74), ' あ']);    // 3 バイト文字は丸ごと次行へ
    expect(icsUtc(Date.UTC(2026, 9, 4, 21, 30, 0, 999))).toBe('20261004T213000Z');
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
  });
  it('TEXT の ; は \\; にエスケープされる——英語の給料日の題（既定の経路）で SUMMARY と X-WR-CALNAME に出る・premise 行の ; も（公開前レビュー 2026-10-07）', () => {
    const src = '# Payday (15th and month-end; previous business day on holidays)\n' + JP + 'everyDay |> within(month) |> nth(15) |> roll(Preceding, on: bizDay)\n';
    const rep = cmdList(src, { from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' });
    const ics = unfold(toIcs(rep, { source: src }));
    expect(ics).toContain('SUMMARY:Payday (15th and month-end\\; previous business day on holidays)');
    expect(ics).toContain('X-WR-CALNAME:Payday (15th and month-end\\; previous business day on holidays)');
    expect(ics).toContain('calendar-system: Gregorian\\; tz: "Asia/Tokyo"\\; wkst: Mon');       // X-KAIROS-SOURCE と DESCRIPTION の premise 行
    for (const l of ics.split('\r\n').filter(l => /^(SUMMARY|DESCRIPTION|X-WR-CALNAME|X-KAIROS-SOURCE):/.test(l))) {
      expect(l.slice(l.indexOf(':') + 1).replace(/\\./g, ''), l).not.toContain(';');                 // エスケープ以外の ; は無い
    }
  });
});

describe('.ics 書き出し: CLI --ics と Playground の「カレンダーに入れる」', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kairos-ics-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const cli = (...args: string[]) => spawnSync(process.execPath, ['src/cli.ts', ...args], { cwd: IMPL, encoding: 'utf8' });
  it('list --ics は stdout に .ics（名前の既定はファイル名）・next --ics も同じ器・--ics と --json は排他（JSON のエラー形）', () => {
    const f = join(dir, 'garbage.kairos');
    writeFileSync(f, JP + 'wed = everyDay |> filter(d => weekday(d) == Wed)\n(wed |> within(month) |> nth(1)) | (wed |> within(month) |> nth(3))\n');
    const r = cli('list', '--from', '2026-01-01', '--to', '2026-02-01', '--tz', 'Asia/Tokyo', '--ics', f);
    expect(r.status).toBe(0);
    expect(r.stdout.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(r.stdout).toContain('SUMMARY:garbage');
    expect(events(r.stdout).length).toBe(2);
    const n = cli('next', '-n', '3', '--from', '2026-01-01', '--tz', 'Asia/Tokyo', '--ics', f);
    expect(n.status).toBe(0);
    expect(events(n.stdout).length).toBe(3);
    const bad = cli('list', '--from', '2026-01-01', '--to', '2026-02-01', '--ics', '--json', f);
    expect(bad.status).toBe(1);
    expect(JSON.parse(bad.stdout)).toMatchObject({ command: 'list', error: { kind: 'usage' } });
    expect(JSON.parse(bad.stdout).error.message).toContain('--ics と --json はどちらか一方');
    const ser = cli('list', '--from', '2026-01-01', '--to', '2026-03-01', '--tz', 'Asia/Tokyo', '--ics-series', f);
    expect(ser.status).toBe(0);
    expect(events(ser.stdout).length).toBe(1);
    expect(ser.stdout).toContain('RDATE;VALUE=DATE:20260121,20260204,20260218');
    expect(cli('--help').stdout).toContain('--ics-series');
    expect(cli('--help').stdout).toContain('--ics');
    expect(cli('--help', '--lang', 'en').stdout).toContain('--ics');
  });
  it('予定 0 件なら .ics を書かず stderr に知らせて終了コード 2（VEVENT の無い VCALENDAR は出さない＝Playground「0 件なら作らない」と同じ。公開前レビュー 2026-10-07）', () => {
    const f = join(dir, 'day31.kairos');
    writeFileSync(f, JP + 'everyDay |> within(month) |> nth(31)\n');
    const r = cli('list', '--from', '2026-02-01', '--to', '2026-03-01', '--tz', 'Asia/Tokyo', '--ics', f);   // 2 月に 31 日は無い
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('予定 0 件');
    const en = cli('list', '--from', '2026-02-01', '--to', '2026-03-01', '--tz', 'Asia/Tokyo', '--ics', '--lang', 'en', f);
    expect(en.status).toBe(2);
    expect(en.stdout).toBe('');
    expect(en.stderr).toContain('no events');
    const ok = cli('list', '--from', '2026-01-01', '--to', '2026-02-01', '--tz', 'Asia/Tokyo', '--ics', f);   // 1 月は 31 日がある
    expect(ok.status).toBe(0);
    expect(events(ok.stdout).length).toBe(1);
  });
  it('Playground の buildIcs は CLI の toIcs と同じ文字列を出し、暮らしの例 3 本が日英の HTML と core.js に揃う', async () => {
    const { buildIcs, rollingWindow } = await import(new URL('../../playground/core.js', import.meta.url).href) as
      { buildIcs: (s: string, o: { from: string; to: string; tz: string; lang: string; series?: boolean }) => { text: string; name: string; count: number };
        rollingWindow: (tz: string, days: number, now?: Date) => { from: string; to: string } };
    // 目覚ましの例は「今日から先の有視界の窓」（選んだ日から 4 週間・設計者裁定 2026-10-07）: JST 10/7 01:00 ＝ UTC 10/6 16:00 でも from は tz の今日
    expect(rollingWindow('Asia/Tokyo', 28, new Date(Date.UTC(2026, 9, 6, 16, 0, 0)))).toEqual({ from: '2026-10-07', to: '2026-11-04' });
    expect(rollingWindow('America/New_York', 28, new Date(Date.UTC(2026, 9, 6, 16, 0, 0)))).toEqual({ from: '2026-10-06', to: '2026-11-03' });
    expect(rollingWindow('Asia/Tokyo', 28, new Date(Date.UTC(2026, 11, 20, 0, 0, 0)))).toEqual({ from: '2026-12-20', to: '2027-01-17' });   // 年またぎ
    const pg = buildIcs(ALARM, { ...W, lang: 'ja' });
    expect(pg.text).toBe(toIcs(cmdList(ALARM, W), { source: ALARM }));
    expect(pg.count).toBe(2);
    expect(pg.name).toBe('目覚まし（平日 6-30・土曜と祝日 8-00）.ics');   // ファイル名に使えない : は - へ（Windows）
    const pgs = buildIcs(ALARM, { ...W, lang: 'ja', series: true });
    expect(pgs.text).toBe(toIcs(cmdList(ALARM, W), { source: ALARM, series: true }));
    expect(buildIcs(JP + 'everyDay |> within(month) |> nth(31)\n', { from: '2026-02-01', to: '2026-03-01', tz: 'Asia/Tokyo', lang: 'en' }).count).toBe(0);
    const root = new URL('../../', import.meta.url);
    const core = readFileSync(new URL('playground/core.js', root), 'utf8');
    for (const html of ['playground/index.html', 'en/playground/index.html']) {
      const h = readFileSync(new URL(html, root), 'utf8');
      for (const id of ['garbage', 'pay15', 'alarm']) {
        expect(h, `${html} に例 ${id}`).toContain(`<option value="${id}">`);
        expect(core).toContain(`  ${id}: {`);
      }
      expect((core.match(/^\s*window: 28,/gm) ?? []).length).toBe(2);   // 目覚まし（日英）だけが有視界の窓
      expect(h).toContain('id="pg-ics"');
      expect(h).toContain('id="pg-ics-split"');   // 既定は series・逃がしは「1 点ずつ別の予定にする」
    }
  });
});
