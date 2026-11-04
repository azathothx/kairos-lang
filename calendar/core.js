// Kairos カレンダー——穴埋め→月めくり→.ics 保存→Playground へ往復（ja/en 両ページの app.js から init(lang) で起動）。
// 無状態の静的ページ: サーバーも送信も保存もない。評価は Playground と同じ参照実装のブラウザ版（../playground/js/）、
// .ics は Playground の buildIcs（同じ関数・重複実装しない）、共有 URL のハッシュは Playground と同じ形
// `#s=<base64url(UTF-8 のソース全文)>&f=<from>&t=<to>&z=<IANA tz>`（公開の約束・recipes/README）に、このページだけが読む
// `e=<例の id>&v=<穴の値をカンマで>` を添える。祝日表は Playground の例と同じ「例の資産」（JP_PREMISE／US_PREMISE）を import する。
// 純関数（EXAMPLES・buildSource・monthsIn・gridCells・plainWarning・calendarHash …）は DOM を触らない＝impl/test から直接呼べる。
import { run, formatAnnotation } from '../playground/js/index.js';
import { buildIcs, b64d, shareHash, rollingWindow, isPhoneLike, JP_PREMISE, US_PREMISE } from '../playground/core.js';
import { IMPL_SOURCE_SHA, IMPL_VERSION } from '../playground/js/build-info.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WD_LABEL = {
  ja: { Mon: '月', Tue: '火', Wed: '水', Thu: '木', Fri: '金', Sat: '土', Sun: '日' },
  en: { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' },
};
const ORD_EN = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };

// 言語ごとの前文（Playground の例と同じ資産・同じ場所）。ja＝内閣府の祝日表（JP）・en＝OPM の連邦祝日（US）＝/en/playground/ の例と同じ
const WORLD = {
  ja: { premise: JP_PREMISE, at: '@JP', holidays: 'national', tz: 'Asia/Tokyo' },
  en: { premise: US_PREMISE, at: '@US', holidays: 'federal', tz: 'America/New_York' },
};

/** 時刻の表示（"06:30" → "6:30"）——題（＝.ics の予定名）に使う。Playground の例の題と同じ書き方 */
const fmtTime = t => t.replace(/^0/, '');
/** "06:30" → Kairos の時刻リテラル T06:30 */
const tlit = t => `T${t}`;
const wdFilter = wd => `everyDay |> filter(d => weekday(d) == ${wd})`;

// 穴（フォームの項目）の型: select＝選択肢〈[値, 表示]〉・time＝HH:MM・check＝オン／オフ（値は '1'／'0'）
const sel = (key, options, def) => ({ key, kind: 'select', options, def });
const time = (key, def) => ({ key, kind: 'time', def });
const check = (key, def) => ({ key, kind: 'check', def: def ? '1' : '0' });
const wdOptions = lang => WEEKDAYS.map(w => [w, lang === 'ja' ? `${WD_LABEL.ja[w]}曜` : WD_LABEL.en[w]]);
const nthOptions = lang => [1, 2, 3, 4, 5].map(n => [String(n), lang === 'ja' ? `第 ${n}` : ORD_EN[n]]);
const NONE = '-';   // 「なし」の値（2 つ目の週・2 つ目の曜日）

/** 暮らしの例（5 本・日英同内容）。fields＝穴・title(v)＝題（先頭のコメント行＝.ics の予定名）・body(v)＝本体式。
 *  window: 28 の例（目覚まし）は「今日から 4 週間」の有視界の窓・他は今月の 1 日から 12 か月（Playground の alarm と同じ考え方） */
export const EXAMPLES = {
  ja: {
    garbage: {
      label: '資源ごみ（第 1・第 3 水曜）',
      fields: [sel('n1', nthOptions('ja'), '1'), sel('n2', [[NONE, 'なし'], ...nthOptions('ja')], '3'), sel('wd', wdOptions('ja'), 'Wed')],
      form: '第 {n1}・{n2} {wd}に出す',
      title: v => v.n2 === NONE || v.n2 === v.n1
        ? `資源ごみ（第 ${v.n1} ${WD_LABEL.ja[v.wd]}曜）`
        : `資源ごみ（第 ${v.n1}・第 ${v.n2} ${WD_LABEL.ja[v.wd]}曜）`,
      body: v => `wd = ${wdFilter(v.wd)}\n` + nthUnion('wd', v.n1, v.n2),
    },
    burnable: {
      label: '燃えるごみ（毎週 月曜と木曜）',
      fields: [sel('d1', wdOptions('ja'), 'Mon'), sel('d2', [[NONE, 'なし'], ...wdOptions('ja')], 'Thu')],
      form: '毎週 {d1}と{d2}に出す（祝日も回収）',
      title: v => v.d2 === NONE || v.d2 === v.d1
        ? `燃えるごみ（毎週 ${WD_LABEL.ja[v.d1]}曜）`
        : `燃えるごみ（毎週 ${WD_LABEL.ja[v.d1]}曜と${WD_LABEL.ja[v.d2]}曜）`,
      body: v => weeklyFilter(v.d1, v.d2),
    },
    pay: {
      label: '給料日（15 日と月末・休みなら前営業日）',
      fields: [sel('day', dayOptions('ja'), '15'), check('eom', true), sel('roll', [['Preceding', '前の営業日'], ['Following', '次の営業日']], 'Preceding')],
      form: '{day}に振り込み{eom:・月末も}・休みなら{roll}',
      title: v => `給料日（${v.day} 日${v.eom === '1' ? 'と月末' : ''}・休日なら${v.roll === 'Preceding' ? '前' : '翌'}営業日）`,
      body: v => payBody(v),
    },
    alarm: {
      label: '目覚まし（平日 6:30・土曜と祝日 8:00）',
      window: 28,
      fields: [time('wk', '06:30'), time('late', '08:00')],
      form: '平日 {wk}・土曜と祝日 {late} に鳴らす',
      title: v => `目覚まし（平日 ${fmtTime(v.wk)}・土曜と祝日 ${fmtTime(v.late)}）`,
      body: (v, W) => alarmBody(v, W),
    },
    lesson: {
      label: '習い事（毎週 火曜 17:00・8 月と年末年始は休み）',
      fields: [sel('wd', wdOptions('ja'), 'Tue'), time('at', '17:00'), check('summer', true), check('newyear', true)],
      form: '毎週 {wd} {at} から{summer:・8 月は休み}{newyear:・年末年始（12/29〜1/3）は休み}',
      title: v => `習い事（毎週 ${WD_LABEL.ja[v.wd]}曜 ${fmtTime(v.at)}${offText('ja', v)}）`,
      body: v => lessonBody(v),
    },
  },
  en: {
    garbage: {
      label: 'Recycling pickup (1st and 3rd Wednesday)',
      fields: [sel('n1', nthOptions('en'), '1'), sel('n2', [[NONE, 'none'], ...nthOptions('en')], '3'), sel('wd', wdOptions('en'), 'Wed')],
      form: 'the {n1} and {n2} {wd} of each month',
      title: v => v.n2 === NONE || v.n2 === v.n1
        ? `Recycling pickup (${ORD_EN[v.n1]} ${WD_LABEL.en[v.wd]})`
        : `Recycling pickup (${ORD_EN[v.n1]} and ${ORD_EN[v.n2]} ${WD_LABEL.en[v.wd]})`,
      body: v => `wd = ${wdFilter(v.wd)}\n` + nthUnion('wd', v.n1, v.n2),
    },
    burnable: {
      label: 'Trash pickup (every Monday and Thursday)',
      fields: [sel('d1', wdOptions('en'), 'Mon'), sel('d2', [[NONE, 'none'], ...wdOptions('en')], 'Thu')],
      form: 'every {d1} and {d2} (holidays included)',
      title: v => v.d2 === NONE || v.d2 === v.d1
        ? `Trash pickup (every ${WD_LABEL.en[v.d1]})`
        : `Trash pickup (every ${WD_LABEL.en[v.d1]} and ${WD_LABEL.en[v.d2]})`,
      body: v => weeklyFilter(v.d1, v.d2),
    },
    pay: {
      label: 'Payday (15th and month-end; previous business day on holidays)',
      fields: [sel('day', dayOptions('en'), '15'), check('eom', true), sel('roll', [['Preceding', 'the previous business day'], ['Following', 'the next business day']], 'Preceding')],
      form: 'paid on the {day}{eom: and at month-end}; on a holiday, {roll}',
      title: v => `Payday (${ordEn(v.day)}${v.eom === '1' ? ' and month-end' : ''}; ${v.roll === 'Preceding' ? 'previous' : 'next'} business day on holidays)`,
      body: v => payBody(v),
    },
    alarm: {
      label: 'Alarm clock (weekdays 6:30, Saturdays and holidays 8:00)',
      window: 28,
      fields: [time('wk', '06:30'), time('late', '08:00')],
      form: 'weekdays at {wk}, Saturdays and holidays at {late}',
      title: v => `Alarm clock (weekdays ${fmtTime(v.wk)}, Saturdays and holidays ${fmtTime(v.late)})`,
      body: (v, W) => alarmBody(v, W),
    },
    lesson: {
      label: 'Weekly class (Tuesdays 17:00; off in August and over the New Year)',
      fields: [sel('wd', wdOptions('en'), 'Tue'), time('at', '17:00'), check('summer', true), check('newyear', true)],
      form: 'every {wd} at {at}{summer:, off in August}{newyear:, off Dec 29 to Jan 3}',
      title: v => `Weekly class (${WD_LABEL.en[v.wd]}s ${fmtTime(v.at)}${offText('en', v)})`,
      body: v => lessonBody(v),
    },
  },
};

function dayOptions(lang) {
  const out = [];
  for (let d = 1; d <= 28; d++) out.push([String(d), lang === 'ja' ? `${d} 日` : ordEn(String(d))]);
  return out;
}
function ordEn(n) {
  const k = Number(n) % 100;
  const s = k >= 11 && k <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[Number(n) % 10] ?? 'th';
  return `${n}${s}`;
}
function nthUnion(name, n1, n2) {
  const one = n => `(${name} |> within(month) |> nth(${n}))`;
  return n2 === NONE || n2 === n1 ? `${name} |> within(month) |> nth(${n1})` : `${one(n1)} | ${one(n2)}`;
}
function weeklyFilter(d1, d2) {
  return d2 === NONE || d2 === d1 ? wdFilter(d1) : `everyDay |> filter(d => weekday(d) == ${d1} or weekday(d) == ${d2})`;
}
function payBody(v) {
  const lines = [`payDay = everyDay |> within(month) |> nth(${v.day})`];
  if (v.eom === '1') {
    lines.push('eom = everyDay |> within(month) |> last');
    lines.push(`(payDay | eom) |> roll(${v.roll}, on: bizDay)`);
  } else lines.push(`payDay |> roll(${v.roll}, on: bizDay)`);
  return lines.join('\n');
}
function alarmBody(v, W) {
  return [
    'sat = everyDay |> filter(d => weekday(d) == Sat)',
    'sun = everyDay |> filter(d => weekday(d) == Sun)',
    `lateDay = (sat | ${W.holidays}) \\ sun`,
    `(bizDay |> at(${tlit(v.wk)})) | (lateDay |> at(${tlit(v.late)}))`,
  ].join('\n');
}
function lessonBody(v) {
  const lines = [`lesson = ${wdFilter(v.wd)}`];
  const off = [];
  if (v.summer === '1') { lines.push('offSummer = everyDay |> filter(d => month(d) == 8)'); off.push('offSummer'); }
  if (v.newyear === '1') {
    lines.push('yearEnd = everyDay |> within(year) |> last');
    lines.push('newYear = everyDay |> within(year) |> nth(1)');
    lines.push('offYearEnd = yearEnd | (yearEnd |> shift(-1, unit: day)) | (yearEnd |> shift(-2, unit: day)) | newYear | (newYear |> shift(1, unit: day)) | (newYear |> shift(2, unit: day))');
    off.push('offYearEnd');
  }
  const base = off.length === 0 ? 'lesson' : off.length === 1 ? `(lesson \\ ${off[0]})` : `(lesson \\ (${off.join(' | ')}))`;
  lines.push(`${base} |> at(${tlit(v.at)})`);
  return lines.join('\n');
}
function offText(lang, v) {
  const parts = [];
  if (v.summer === '1') parts.push(lang === 'ja' ? '8 月' : 'August');
  if (v.newyear === '1') parts.push(lang === 'ja' ? '年末年始' : 'the New Year');
  if (parts.length === 0) return '';
  return lang === 'ja' ? `・${parts.join('と')}は休み` : `; off in ${parts.join(' and over ')}`;
}

/** 例の存在＝own property だけを見る（URL の `e` に `constructor`・`__proto__` 等が来ても例として扱わない・2026-10-31 機械レビュー所見 1） */
export const hasExample = (lang, id) => Object.hasOwn(EXAMPLES[lang] ?? {}, id);
const exampleOf = (lang, id) => { if (!hasExample(lang, id)) throw new Error(`unknown example: ${id}`); return EXAMPLES[lang][id]; };

/** 例の既定値（穴の順） */
export function defaultValues(lang, id) {
  return Object.fromEntries(exampleOf(lang, id).fields.map(f => [f.key, f.def]));
}

/** 穴の値の検査＝選択肢にない値・時刻でない値は既定値に戻す（URL から来た値を信じない） */
export function sanitizeValues(lang, id, values) {
  const out = {};
  for (const f of exampleOf(lang, id).fields) {
    const v = values?.[f.key];
    if (f.kind === 'select') out[f.key] = f.options.some(o => o[0] === v) ? v : f.def;
    else if (f.kind === 'time') out[f.key] = /^([01]\d|2[0-3]):[0-5]\d$/.test(v ?? '') ? v : f.def;
    else out[f.key] = v === '1' || v === '0' ? v : f.def;
  }
  return out;
}

/** 穴の値 ⇄ URL の v（穴の順にカンマ区切り） */
export function packValues(lang, id, values) {
  return exampleOf(lang, id).fields.map(f => values[f.key]).join(',');
}
export function unpackValues(lang, id, packed) {
  const parts = String(packed ?? '').split(',');
  const raw = Object.fromEntries(exampleOf(lang, id).fields.map((f, i) => [f.key, parts[i]]));
  return sanitizeValues(lang, id, raw);
}

/** 例と穴の値からソース全文を組み立てる（題のコメント行＋前文＋本体式）。CLI に渡せばカレンダーと同じ点列が出る */
export function buildSource(lang, id, values) {
  const ex = exampleOf(lang, id);
  const W = WORLD[lang];
  const v = sanitizeValues(lang, id, values);
  return `# ${ex.title(v)}\n${W.premise}\n\n${W.at}\n${ex.body(v, W)}`;
}

/** 祝日の列を出す式（格子の赤＝例と同じ表から）。Playground の例の資産をそのまま読む */
export function holidaySource(lang) {
  const W = WORLD[lang];
  return `${W.premise}\n\n${W.at}\n${W.holidays}`;
}

/** 言語の既定 tz（例の前文と同じ） */
export const defaultTz = lang => WORLD[lang].tz;
/** IANA 名として Intl が受けるか（不正なら窓の計算は既定 tz で行い、評価器の「不正な tz」の文言を黄枠に出す・所見 2） */
export function isValidTz(tz) { try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return true; } catch { return false; } }

// ---- 日付の算術（文字列 YYYY-MM-DD と Date.UTC だけ＝実行環境の TZ に依らない） ----
const p2 = n => String(n).padStart(2, '0');
export const ymd = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`; };
const parts = s => s.slice(0, 10).split('-').map(Number);
export const addDays = (s, n) => { const [y, m, d] = parts(s); return ymd(y, m, d + n); };
/** ISO の曜日（Mon=1 … Sun=7） */
export const isoWeekday = s => { const [y, m, d] = parts(s); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return w === 0 ? 7 : w; };

/** 今月の 1 日から months か月の半開区間（tz の市民日で「今日」を読む）。評価は from/to の値だけで決まる（URL は範囲を固定する） */
export function monthsWindow(tz, months, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, m] = parts(today);
  return { from: ymd(y, m, 1), to: ymd(y, m + months, 1) };
}

/** [from, to) に掛かる月の一覧（{ y, m }・to の当日は含まない） */
export function monthsIn(from, to) {
  const [fy, fm] = parts(from);
  const last = addDays(to, -1);
  const [ly, lm] = parts(last < from ? from : last);
  const out = [];
  for (let y = fy, m = fm; y < ly || (y === ly && m <= lm); m++) {
    if (m === 13) { m = 1; y++; }
    out.push({ y, m });
  }
  return out;
}

/** 在圏 premise の週の始まり（`wkst:`）。`@Name` 行（字下げ・末尾の註を許す）が指す premise を読み、派生 `premise Name = Base with { … }` に無ければ基底へ辿る。
 *  ソースに定義の無い名（標準 premise）や見つからないときは Mon（Gregorian の既定）。格子の先頭と曜日の見出しがこれに従う（2026-10-30・所見 3 で連鎖と註に対応） */
export function wkstOf(source) {
  const WD = 'Mon|Tue|Wed|Thu|Fri|Sat|Sun';
  let name = /^\s*@(\w+)\b/m.exec(source)?.[1];
  for (let depth = 0; name && depth < 10; depth++) {
    const def = new RegExp(`^\\s*premise\\s+${name}\\b\\s*(?:=\\s*(\\w+)\\s+with\\s*)?\\{([^}]*)\\}`, 'm').exec(source);
    if (!def) break;
    const m = new RegExp(`\\bwkst:\\s*(${WD})\\b`).exec(def[2]);
    if (m) return m[1];
    name = def[1];   // 派生で with に wkst が無ければ基底へ（無印の定義なら undefined で終わる）
  }
  return 'Mon';
}
/** 曜日の見出しの並び（wkst から 7 つ）＝ISO 番号の列（Mon=1 … Sun=7） */
export const weekOrder = wkst => { const k = Math.max(0, WEEKDAYS.indexOf(wkst)); return WEEKDAYS.map((_, i) => ((k + i) % 7) + 1); };

/** 週の始まりが wkst の格子（週 × 7・既定は月曜）。前後の月の日も埋める（inMonth: false＝破線で描く） */
export function gridCells(y, m, wkst = 'Mon') {
  const first = ymd(y, m, 1);
  const k = Math.max(0, WEEKDAYS.indexOf(wkst)) + 1;   // wkst の ISO 番号
  const start = addDays(first, -((isoWeekday(first) - k + 7) % 7));
  const lastDay = ymd(y, m + 1, 0);
  const end = addDays(lastDay, (k - 1 - isoWeekday(lastDay) + 7) % 7);
  const weeks = [];
  for (let d = start, row = []; d <= end; d = addDays(d, 1)) {
    row.push({ date: d, day: Number(d.slice(8, 10)), inMonth: d.slice(0, 7) === first.slice(0, 7) });
    if (row.length === 7) { weeks.push(row); row = []; }
  }
  return weeks;
}

/** 評価結果の点を日ごとに束ねる: { 'YYYY-MM-DD': [{ time: 'HH:MM'|null, expr: 式の番号 }] }。日付は表示 tz の市民日（ラベルの字面） */
export function pointsByDay(results) {
  const map = {};
  results.forEach((res, i) => {
    for (const label of res.dates) {
      const day = label.slice(0, 10);
      (map[day] ??= []).push({ time: label.length > 10 ? label.slice(11, 16) : null, expr: i + 1 });
    }
  });
  return map;
}

const yearOf = s => Number(s.slice(0, 4));
/** ⚠（範囲外の註釈）の平易な一言。表の年の範囲は coverage の covering（"2026..2027" か "2026-01-01..2027-12-31"）から読む。
 *  言い換えられない形（開端・読めない covering）は原文を見るよう促す 1 行 */
export function plainWarning(lang, annotations, coverage) {
  if (!annotations || annotations.length === 0) return null;
  const T = lang === 'ja'
    ? { ends: (e, ys) => `この表は ${e} 年分までです。${ys.join('・')} 年の予定は祝日を知らずに出ています。`,
        starts: (s, ys) => `この表は ${s} 年分からです。${ys.join('・')} 年の予定は祝日を知らずに出ています。`,
        other: '祝日の表の外に出ている期間があります（下の原文を参照）。' }
    : { ends: (e, ys) => `The holiday table ends with ${e}. The dates in ${ys.join(', ')} were computed without knowing the holidays.`,
        starts: (s, ys) => `The holiday table starts with ${s}. The dates in ${ys.join(', ')} were computed without knowing the holidays.`,
        other: 'Part of the range lies outside the holiday table (see the original lines below).' };
  const bounds = (coverage ?? []).map(c => /^(\d{4})(?:-\d{2}-\d{2})?\.\.(\d{4})(?:-\d{2}-\d{2})?$/.exec(c.covering))
    .filter(Boolean).map(m => ({ start: Number(m[1]), end: Number(m[2]) }));
  if (bounds.length === 0) return T.other;
  const start = Math.min(...bounds.map(b => b.start)), end = Math.max(...bounds.map(b => b.end));
  const after = new Set(), before = new Set();
  for (const a of annotations) {
    const lastDay = addDays(a.to, -1);   // 註釈は半開 [from, to)
    for (let y = yearOf(a.from); y <= yearOf(lastDay < a.from ? a.from : lastDay); y++) {
      if (y > end) after.add(y); else if (y < start) before.add(y);
    }
  }
  const both = after.size > 0 && before.size > 0;
  if (both) return T.starts(start, [...before].sort()) + (lang === 'ja' ? '' : ' ') + T.ends(end, [...after].sort());
  if (after.size > 0) return T.ends(end, [...after].sort());
  if (before.size > 0) return T.starts(start, [...before].sort());
  return T.other;
}

/** 予定の名前＝式の先頭のコメント行（Playground と同じ規約: .ics の予定名・印刷の題）。無ければ '' */
export function nameOf(source) {
  const l = source.split('\n').map(x => x.trim()).find(x => x !== '');
  return l && l.startsWith('#') ? l.replace(/^#+\s*/, '') : '';
}
/** 式の先頭のコメント行を name に差し替える（無ければ足す・name が空なら外す）。URL の s はこの式ごと載るので新しい項目は要らない */
export function withName(source, name) {
  const lines = source.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  const hasTitle = i < lines.length && lines[i].trim().startsWith('#');
  const n = String(name ?? '').replace(/[\r\n]+/g, ' ').trim();   // 改行は式の行を増やすので空白に（所見 6）
  if (hasTitle) { if (n) lines[i] = `# ${n}`; else lines.splice(i, 1); }
  else if (n) lines.splice(i, 0, `# ${n}`);
  return lines.join('\n');
}

/** このページの共有 URL のハッシュ＝Playground と同じ s・f・t・z に、例の id（e）と穴の値（v）を添える。e が無ければ Playground 由来の式 */
export function calendarHash({ lang, exampleId, values, source, from, to, tz }) {
  const h = shareHash(source, from, to, tz);
  if (exampleId) { h.set('e', exampleId); h.set('v', packValues(lang, exampleId, values)); }
  return h;
}
/** ハッシュを読む: { e, v, s, f, t, z }（無い項目は undefined・s は復号済み）。読めなければ null */
export function parseCalendarHash(hash) {
  if (!hash || hash.length < 2) return null;
  try {
    const h = new URLSearchParams(hash.replace(/^#/, ''));
    const s = h.get('s');
    return { e: h.get('e') ?? undefined, v: h.get('v') ?? undefined, s: s ? b64d(s) : undefined,
      f: h.get('f') ?? undefined, t: h.get('t') ?? undefined, z: h.get('z') ?? undefined };
  } catch { return null; }
}

const STRINGS = {
  ja: {
    monthTitle: (y, m) => `${y} 年 ${m} 月`,
    wd: ['月', '火', '水', '木', '金', '土', '日'],
    more: n => `+${n}`,
    build: (v, sha) => `参照実装 ${v}（指紋 ${sha}）——Playground・CLI と同じ評価器`,
    shared: url => 'この URL に例・穴の値・範囲を固定した。そのまま共有できる。\n' + url,
    icsSaved: (name, n, m, series) => series
      ? `${name} を保存した（繰り返し予定 ${m} 件・${n} 回分）——カレンダーアプリで開くか取り込む`
      : `${name} を保存した（予定 ${n} 件）——カレンダーアプリで開くか取り込む`,
    icsEmpty: '予定が 0 件——.ics は作らない',
    points: n => `${n} 回`,
    none: '範囲に予定なし',
    fromPlayground: 'この式は Playground から来た（穴埋めの例ではない）。式を変えるのは「Playground で開く」から。',
    custom: 'Playground の式',
    nameLabel: '予定の名前（印刷の題・.ics の予定名）',
    namePlaceholder: '例: 目覚まし',
    holiday: '祝日',
    today: '今日',
    footer: (title) => `${title} — kairos-lang.org/calendar/`,
  },
  en: {
    monthTitle: (y, m) => `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`,
    wd: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    more: n => `+${n}`,
    build: (v, sha) => `reference implementation ${v} (fingerprint ${sha}) — the same evaluator as the Playground and the CLI`,
    shared: url => 'The example, its values and the range are pinned to this URL — share it as is.\n' + url,
    icsSaved: (name, n, m, series) => series
      ? `Saved ${name} (${m} recurring event${m === 1 ? '' : 's'}, ${n} occurrence${n === 1 ? '' : 's'}) — open or import it in your calendar app`
      : `Saved ${name} (${n} event${n === 1 ? '' : 's'}) — open or import it in your calendar app`,
    icsEmpty: 'No events in range — nothing to export',
    points: n => `${n} occurrence${n === 1 ? '' : 's'}`,
    none: 'nothing in this range',
    fromPlayground: 'This expression came from the Playground (not a fill-in example). To change it, use "Open in the Playground".',
    custom: 'Playground expression',
    nameLabel: 'Name of the schedule (print title and .ics event name)',
    namePlaceholder: 'e.g. Alarm clock',
    holiday: 'holiday',
    today: 'today',
    footer: (title) => `${title} — kairos-lang.org/en/calendar/`,
  },
};

/** 例の説明文（form）に穴の入力を埋め込む: {key}＝select／time の入力・{key:文}＝check（文はラベル） */
function renderForm(ex, values, onChange) {
  const frag = document.createDocumentFragment();
  const re = /\{(\w+)(?::([^}]*))?\}/g;
  let last = 0, m;
  const fieldOf = k => ex.fields.find(f => f.key === k);
  while ((m = re.exec(ex.form))) {
    if (m.index > last) frag.appendChild(document.createTextNode(ex.form.slice(last, m.index)));
    const f = fieldOf(m[1]);
    if (f) {
      if (f.kind === 'select') {
        const s = document.createElement('select');
        s.className = 'cal-hole';
        for (const [val, label] of f.options) { const o = document.createElement('option'); o.value = val; o.textContent = label; s.appendChild(o); }
        s.value = values[f.key];
        s.addEventListener('change', () => { values[f.key] = s.value; onChange(); });
        frag.appendChild(s);
      } else if (f.kind === 'time') {
        const i = document.createElement('input');
        i.type = 'time'; i.className = 'cal-hole'; i.value = values[f.key]; i.required = true;
        i.addEventListener('change', () => { if (/^\d{2}:\d{2}$/.test(i.value)) { values[f.key] = i.value; onChange(); } });
        frag.appendChild(i);
      } else {
        const l = document.createElement('label');
        l.className = 'cal-check';
        const c = document.createElement('input');
        c.type = 'checkbox'; c.checked = values[f.key] === '1';
        c.addEventListener('change', () => { values[f.key] = c.checked ? '1' : '0'; onChange(); });
        l.appendChild(c);
        l.appendChild(document.createTextNode(m[2] ?? f.key));
        frag.appendChild(l);
      }
    }
    last = re.lastIndex;
  }
  if (last < ex.form.length) frag.appendChild(document.createTextNode(ex.form.slice(last)));
  return frag;
}

export function init(lang) {
  const T = STRINGS[lang];
  const EX = EXAMPLES[lang];
  const $ = id => document.getElementById(id);
  document.body.classList.add('cal-page');
  const build = $('cal-build');
  if (build) build.textContent = T.build(IMPL_VERSION, IMPL_SOURCE_SHA);
  const msg = $('cal-msg');
  const say = t => { if (msg) msg.textContent = t; };

  // 状態＝例の id・穴の値・範囲・tz・（Playground 由来の）式。URL のハッシュに全部載せる（保存はしない）
  const state = { exampleId: null, values: {}, source: '', from: '', to: '', tz: defaultTz(lang), monthIdx: 0, months: [] };
  const exSel = $('cal-example'), fields = $('cal-fields'), srcPre = $('cal-src');
  const fromIn = $('cal-from'), toIn = $('cal-to'), tzIn = $('cal-tz');
  const note = $('cal-note');

  for (const [id, ex] of Object.entries(EX)) {
    const o = document.createElement('option'); o.value = id; o.textContent = ex.label; exSel.appendChild(o);
  }
  const customOpt = document.createElement('option');
  customOpt.value = ''; customOpt.textContent = T.custom; customOpt.hidden = true; exSel.appendChild(customOpt);

  const currentSource = () => state.exampleId ? buildSource(lang, state.exampleId, state.values) : state.source;

  function selectExample(id, values, keepRange) {
    state.exampleId = id;
    state.values = sanitizeValues(lang, id, values ?? defaultValues(lang, id));
    exSel.value = id;
    if (note) note.hidden = true;
    if (!keepRange) {
      const ex = EX[id];
      const wtz = isValidTz(state.tz) ? state.tz : defaultTz(lang);   // 不正な tz は評価器が黄枠に出す。窓だけ既定 tz で取る
      const w = ex.window ? rollingWindow(wtz, ex.window) : monthsWindow(wtz, 12);
      state.from = w.from; state.to = w.to;
      fromIn.value = w.from; toIn.value = w.to;
    }
    fields.replaceChildren(renderForm(EX[id], state.values, update));
    update();
  }

  function useCustom(source) {
    state.exampleId = null;
    state.source = source;
    exSel.value = '';
    // 予定の名前（2026-10-31）: 先頭のコメント行を差し替える＝印刷の題・.ics の予定名・URL の s がこの 1 行に従う
    const l = document.createElement('label');
    l.className = 'cal-name';
    l.appendChild(document.createTextNode(T.nameLabel + ' '));
    const i = document.createElement('input');
    i.type = 'text'; i.id = 'cal-name'; i.size = 28; i.value = nameOf(source); i.placeholder = T.namePlaceholder;
    i.addEventListener('change', () => { state.source = withName(state.source, i.value); update(); });
    l.appendChild(i);
    fields.replaceChildren(l);
    if (note) { note.textContent = T.fromPlayground; note.hidden = false; }
    update();
  }

  function readRange() {
    if (fromIn.value) state.from = fromIn.value;
    if (toIn.value) state.to = toIn.value;
    const tz = tzIn.value.trim();
    if (tz) state.tz = tz;
  }

  function update() {
    say('');
    readRange();
    const source = currentSource();
    if (srcPre) srcPre.textContent = source;
    // URL に状態を載せる（履歴は増やさない）。Playground へのリンクも同じ s・f・t・z
    const h = calendarHash({ lang, exampleId: state.exampleId, values: state.values, source, from: state.from, to: state.to, tz: state.tz });
    try { history.replaceState(null, '', '#' + h.toString()); } catch { /* file: 等で失敗しても描画は続ける */ }
    const pg = $('cal-pg');
    if (pg) pg.href = '../playground/#' + shareHash(source, state.from, state.to, state.tz).toString();
    render(source);
  }

  function render(source) {
    const warn = $('cal-warn'), raw = $('cal-warn-raw'), rawPre = $('cal-warn-raw-pre'), count = $('cal-count');
    const monthsEl = $('cal-months');
    let r;
    try {
      r = run(source, { from: state.from, to: state.to, tz: state.tz });
    } catch (e) {
      monthsEl.replaceChildren();
      if (warn) { warn.textContent = String(e && e.message ? e.message : e); warn.hidden = false; warn.classList.add('cal-error'); }
      if (raw) raw.hidden = true;
      if (count) count.textContent = '';
      return;
    }
    if (warn) warn.classList.remove('cal-error');
    const annotations = r.results.flatMap(res => res.annotations);
    const plain = plainWarning(lang, annotations, r.coverage);
    const rawLines = [
      ...annotations.map(a => `# ⚠ ${formatAnnotation(a)}`),
      ...r.coverage.map(c => `#   ${c.source} covering ${c.covering}${c.asof ? ` asof ${c.asof}` : ''} ${lang === 'ja' ? '残走路' : 'runway'} ${c.runwayDays === null ? '∞' : c.runwayDays}`),
      ...r.warnings.map(w => (lang === 'ja' ? '警告: ' : 'warning: ') + w),
    ];
    if (warn) { warn.textContent = plain ?? (r.warnings.length ? r.warnings.join(' / ') : ''); warn.hidden = !warn.textContent; }
    if (raw && rawPre) { rawPre.textContent = rawLines.join('\n'); raw.hidden = rawLines.length === 0; }
    const total = r.results.reduce((n, res) => n + res.dates.length, 0);
    if (count) count.textContent = total === 0 ? T.none : T.points(total);

    const byDay = pointsByDay(r.results);
    const wk = wkstOf(source);
    const order = weekOrder(wk);   // 見出しと列の曜日（ISO 番号）
    state.months = monthsIn(state.from, state.to);
    if (state.monthIdx >= state.months.length) state.monthIdx = 0;
    // 祝日（赤）: 例と同じ表を同じ評価器で引く。格子の端（前後の月の日）まで含めて引く
    let holidays = new Set();
    try {
      const first = gridCells(state.months[0].y, state.months[0].m, wk)[0][0].date;
      const lastM = state.months[state.months.length - 1];
      const lastWeeks = gridCells(lastM.y, lastM.m, wk);
      const last = lastWeeks[lastWeeks.length - 1][6].date;
      holidays = new Set(run(holidaySource(lang), { from: first, to: addDays(last, 1), tz: state.tz }).results[0].dates.map(d => d.slice(0, 10)));
    } catch { /* 祝日が引けなくても格子は出す */ }
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: state.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const title = nameOf(source) || 'Kairos';

    monthsEl.replaceChildren(...state.months.map(({ y, m }, idx) => {
      const sec = document.createElement('section');
      sec.className = 'cal-month' + (idx === state.monthIdx ? ' cal-current' : '');
      const h2 = document.createElement('h2'); h2.className = 'cal-month-title'; h2.textContent = T.monthTitle(y, m);
      sec.appendChild(h2);
      const table = document.createElement('table'); table.className = 'cal-grid';
      const thead = document.createElement('thead'); const hr = document.createElement('tr');
      order.forEach(n => { const th = document.createElement('th'); th.textContent = T.wd[n - 1]; if (n === 7) th.className = 'sun'; if (n === 6) th.className = 'sat'; hr.appendChild(th); });
      thead.appendChild(hr); table.appendChild(thead);
      const tbody = document.createElement('tbody');
      for (const week of gridCells(y, m, wk)) {
        const tr = document.createElement('tr');
        week.forEach(c => {
          const td = document.createElement('td');
          const cls = ['day'];
          const n = isoWeekday(c.date);
          if (!c.inMonth) cls.push('other');
          if (holidays.has(c.date)) cls.push('hol');
          if (n === 7) cls.push('sun'); if (n === 6) cls.push('sat');
          if (c.date === today) cls.push('today');
          td.className = cls.join(' ');
          const num = document.createElement('div'); num.className = 'num'; num.textContent = String(c.day);
          if (holidays.has(c.date)) num.title = T.holiday;
          td.appendChild(num);
          const pts = byDay[c.date];
          if (pts && c.inMonth) {
            const box = document.createElement('div'); box.className = 'pts';
            const timed = pts.filter(p => p.time);
            if (timed.length === 0) { const dot = document.createElement('span'); dot.className = 'dot'; dot.textContent = '●'; box.appendChild(dot); }
            else {
              timed.slice(0, 3).forEach(p => { const s = document.createElement('span'); s.className = 't'; s.textContent = p.time; box.appendChild(s); });
              if (timed.length > 3) { const s = document.createElement('span'); s.className = 't more'; s.textContent = T.more(timed.length - 3); box.appendChild(s); }
              if (pts.length > timed.length) { const dot = document.createElement('span'); dot.className = 'dot'; dot.textContent = '●'; box.appendChild(dot); }
            }
            td.title = pts.map(p => p.time ?? '●').join(' ');
            td.classList.add('has');
            box.setAttribute('aria-label', pts.map(p => p.time ?? title).join(', '));
            td.appendChild(box);
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      sec.appendChild(table);
      const foot = document.createElement('p'); foot.className = 'cal-foot'; foot.textContent = T.footer(title);
      sec.appendChild(foot);
      return sec;
    }));
    updateNav();
  }

  function updateNav() {
    const prev = $('cal-prev'), next = $('cal-next'), label = $('cal-month-label');
    const n = state.months.length;
    if (prev) prev.disabled = state.monthIdx <= 0;
    if (next) next.disabled = state.monthIdx >= n - 1;
    const cur = state.months[state.monthIdx];
    if (label) {
      const pos = `${state.monthIdx + 1}/${n}`;
      label.textContent = cur ? (lang === 'ja' ? `${T.monthTitle(cur.y, cur.m)}（${pos}）` : `${T.monthTitle(cur.y, cur.m)} (${pos})`) : '';
    }
    document.querySelectorAll('.cal-month').forEach((el, i) => el.classList.toggle('cal-current', i === state.monthIdx));
  }
  const flip = d => { state.monthIdx = Math.max(0, Math.min(state.months.length - 1, state.monthIdx + d)); updateNav(); say(''); };   // 次の操作で「URL に固定」の表示も消す
  $('cal-prev')?.addEventListener('click', () => flip(-1));
  $('cal-next')?.addEventListener('click', () => flip(1));
  document.addEventListener('keydown', e => {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft') flip(-1); else if (e.key === 'ArrowRight') flip(1);
  });

  exSel.addEventListener('change', e => { if (e.target.value) selectExample(e.target.value); });
  for (const el of [fromIn, toIn, tzIn]) el.addEventListener('change', () => { state.monthIdx = 0; update(); });

  $('cal-share')?.addEventListener('click', () => {
    update();
    location.hash = calendarHash({ lang, exampleId: state.exampleId, values: state.values, source: currentSource(), from: state.from, to: state.to, tz: state.tz }).toString();
    say(T.shared(location.href));
  });
  $('cal-print')?.addEventListener('click', () => window.print());

  // .ics 保存＝Playground の buildIcs をそのまま呼ぶ（同じ関数・同じ既定＝PC は繰り返し予定・スマホは 1 点ずつ）
  const splitBox = $('cal-ics-split');
  if (splitBox && isPhoneLike()) splitBox.checked = true;
  $('cal-ics')?.addEventListener('click', () => {
    try {
      update();
      const split = splitBox ? splitBox.checked === true : false;
      const r = buildIcs(currentSource(), { from: state.from, to: state.to, tz: state.tz, lang, series: !split });
      if (r.count === 0) { say(T.icsEmpty); return; }
      const blob = new Blob([r.text], { type: 'text/calendar;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = r.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      const asSeries = !split && r.points > 0;
      say(T.icsSaved(r.name, asSeries ? r.points : r.count, r.events, asSeries));
    } catch (e) {
      say(String(e && e.message ? e.message : e));
    }
  });

  // 起動: URL のハッシュ（e＝穴埋めの例・無ければ s＝Playground の式）→ 無ければ最初の例。URL から来た値で落ちたら最初の例へ（所見 1・2）
  try {
    const h = parseCalendarHash(location.hash);
    if (h && (h.f || h.t || h.z)) {
      if (h.f) { state.from = h.f; fromIn.value = h.f; }
      if (h.t) { state.to = h.t; toIn.value = h.t; }
      state.tz = h.z || 'Asia/Tokyo';   // z が無ければ Asia/Tokyo（共有 URL の約束＝Playground と同じ）
      tzIn.value = state.tz;
    } else tzIn.value = state.tz;
    if (h && h.e && hasExample(lang, h.e)) selectExample(h.e, unpackValues(lang, h.e, h.v), Boolean(h.f && h.t));
    else if (h && h.s) {
      if (!h.f || !h.t) { const w = monthsWindow(isValidTz(state.tz) ? state.tz : defaultTz(lang), 12); state.from = w.from; state.to = w.to; fromIn.value = w.from; toIn.value = w.to; }
      useCustom(h.s);
    } else selectExample(Object.keys(EX)[0]);
  } catch (e) {
    say(String(e && e.message ? e.message : e));
    selectExample(Object.keys(EX)[0]);
  }
}
