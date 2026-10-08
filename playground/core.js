// Kairos Playground — ブラウザ内評価の共通本体（ja/en 両ページの app.js から init(lang) で起動。
// UI 文字列は辞書切替・評価器出力（註釈・エラー＝日本語が正）は共通。プリセット例は言語別
// （en＝米国連邦祝日版・cascade〈日本の振替休日導出〉だけは見せ場として日英共通。2026-09-01）。
// 生成物 js/ はリファレンス実装のトランスパイル。ビルド: 非公開正本の tools/build-playground.mjs）
import { run, formatAnnotation } from './js/index.js';
import { toIcs, icsEventCount, titleFromSource } from './js/ics.js';
import { IMPL_SOURCE_SHA, IMPL_VERSION } from './js/build-info.js';

// CLI の list と同じ文言（本体式の無い定義は CLI では使い方エラー＝F126。Playground も同じ 1 行を出す・1.0 追補 23）
const NO_BODY = '本体式がない（評価する式を 1 行以上書く。premise だけのファイルは評価対象が無い）';

const STRINGS = {
  ja: {
    exprHead: (i, n) => `# 式 ${i}（${n} 件）`,
    empty: (from, to) => `# 0 点（[${from}, ${to}) に該当なし）`,
    noOutput: '（出力なし）',
    build: (v, sha) => `参照実装 ${v}（指紋 ${sha}）——表示は CLI の list と同じ`,
    coverageHead: '# 被覆サマリ',
    concluded: '（完結主張）',
    runway: d => `残走路 ${d === null ? '∞' : `${d} 日`}`,
    warning: w => `警告: ${w}`,
    shared: url => 'この URL に式と評価範囲を固定した。そのまま共有できる。\n\n' + url,
    // series（既定）では 1 式が 1 つの繰り返し予定＝カレンダー上の件数は式の数・回数は点の数（2026-10-07 公開前レビュー）
    icsSaved: (name, n, m, series) => series
      ? `${name} を保存した（繰り返し予定 ${m} 件・${n} 回分）——カレンダーアプリで開くか取り込む`
      : `${name} を保存した（予定 ${n} 件）——カレンダーアプリで開くか取り込む`,
    icsEmpty: '予定が 0 件——.ics は作らない',
  },
  en: {
    exprHead: (i, n) => `# expression ${i} (${n} point${n === 1 ? '' : 's'})`,
    empty: (from, to) => `# 0 points (nothing in [${from}, ${to}))`,
    noOutput: '(no output)',
    build: (v, sha) => `reference implementation ${v} (fingerprint ${sha}) — the output is what the CLI's list prints`,
    coverageHead: '# coverage summary',
    concluded: '(concluded)',
    runway: d => `runway ${d === null ? '∞' : `${d} day${d === 1 ? '' : 's'}`}`,
    warning: w => `warning: ${w}`,
    shared: url => 'The expression and evaluation range are pinned to this URL — share it as is.\n\n' + url,
    icsSaved: (name, n, m, series) => series
      ? `Saved ${name} (${m} recurring event${m === 1 ? '' : 's'}, ${n} occurrence${n === 1 ? '' : 's'}) — open or import it in your calendar app`
      : `Saved ${name} (${n} event${n === 1 ? '' : 's'}) — open or import it in your calendar app`,
    icsEmpty: 'No events in range — nothing to export',
  },
};

// 暮らしの例（2026-10-06 設計者裁定「エンジニアでない一般の人向けの入口」）: 式を読まずに「カレンダーに入れる」まで行ける
// 最短経路。先頭のコメント行が予定の名前（.ics の SUMMARY）になる。ブログ第 30・31 弾の例と同じ定義
const JP_PREMISE = `premise JP {
  calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  national = [2026-01-01, 2026-01-12, 2026-02-11, 2026-02-23, 2026-03-20, 2026-04-29, 2026-05-03..2026-05-06,
              2026-07-20, 2026-08-11, 2026-09-21..2026-09-23, 2026-10-12, 2026-11-03, 2026-11-23] covering: 2026..2026
  satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  bizDay = everyDay \\ (satSun | national)
}`;
const EXAMPLES = {
  garbage: {
    from: '2026-01-01', to: '2027-01-01',
    code: `# 資源ごみ（第 1・第 3 水曜）
${JP_PREMISE}

@JP
wed = everyDay |> filter(d => weekday(d) == Wed)
(wed |> within(month) |> nth(1)) | (wed |> within(month) |> nth(3))`,
  },
  pay15: {
    from: '2026-01-01', to: '2027-01-01',
    code: `# 給料日（15 日と月末・休日なら前営業日）
${JP_PREMISE}

@JP
d15 = everyDay |> within(month) |> nth(15)
eom = everyDay |> within(month) |> last
(d15 | eom) |> roll(Preceding, on: bizDay)`,
  },
  alarm: {
    window: 28,   // 選んだ日から 4 週間＝今日から先の有視界の窓（設計者裁定 2026-10-07。固定の範囲だと 11 月以降は過去の予定だけになる）
    code: `# 目覚まし（平日 6:30・土曜と祝日 8:00）
${JP_PREMISE}

@JP
sat = everyDay |> filter(d => weekday(d) == Sat)
sun = everyDay |> filter(d => weekday(d) == Sun)
lateDay = (sat | national) \\ sun
(bizDay |> at(T06:30)) | (lateDay |> at(T08:00))`,
  },
  payday: {
    from: '2026-07-01', to: '2026-11-01',
    code: `premise JP {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  wkst: Mon
}

@JP
holidays2026 = [2026-01-01, 2026-01-12, 2026-02-11, 2026-02-23, 2026-03-20,
                2026-04-29, 2026-05-03, 2026-05-04, 2026-05-05, 2026-05-06,
                2026-07-20, 2026-08-11, 2026-09-21, 2026-09-22, 2026-09-23,
                2026-10-12, 2026-11-03, 2026-11-23] covering: 2026..2026
satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
bizDay = everyDay \\ (satSun | holidays2026)

everyDay |> within(month) |> nth(25) |> roll(Preceding, on: bizDay)`,
  },
  monthend3: {
    from: '2026-08-01', to: '2026-12-01',
    code: `premise JP {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  wkst: Mon
}

@JP
holidays2026 = [2026-01-01, 2026-01-12, 2026-02-11, 2026-02-23, 2026-03-20,
                2026-04-29, 2026-05-03, 2026-05-04, 2026-05-05, 2026-05-06,
                2026-07-20, 2026-08-11, 2026-09-21, 2026-09-22, 2026-09-23,
                2026-10-12, 2026-11-03, 2026-11-23] covering: 2026..2026
satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
bizDay = everyDay \\ (satSun | holidays2026)

monthEnd |> roll(Preceding, on: bizDay) |> shift(-3, unit: bizDay)`,
  },
  cascade: {
    from: '2026-01-01', to: '2027-01-01',
    code: `premise JP {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  wkst: Mon
}

@JP
statutory = [2026-01-01, 2026-01-12, 2026-02-11, 2026-02-23, 2026-03-20,
             2026-04-29, 2026-05-03, 2026-05-04, 2026-05-05,
             2026-07-20, 2026-08-11, 2026-09-21, 2026-09-23,
             2026-10-12, 2026-11-03, 2026-11-23] covering: 2026..2026
nonHoliday  = everyDay \\ statutory
substitutes = statutory |> filter(d => weekday(d) == Sun) |> roll(Following, on: nonHoliday)
sandwiched  = ((statutory |> shift(+1, unit: day)) & (statutory |> shift(-1, unit: day))) \\ statutory

substitutes | sandwiched`,
  },
  friday13: {
    from: '2026-01-01', to: '2027-01-01',
    code: `premise JP {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  wkst: Mon
}

@JP
(everyDay |> filter(d => weekday(d) == Fri)) & (everyDay |> within(month) |> nth(13))`,
  },
  empty: {
    from: '2027-01-04', to: '2027-01-11',
    code: `premise JP {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  wkst: Mon
}

@JP
holidays2027 = [] covering: 2027..2027
satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
bizDay = everyDay \\ (satSun | holidays2027)

bizDay`,
  },
};

// 英語ページのプリセット（2026-09-01 言語別化）: payday/monthend3/friday13/empty は米国連邦祝日
//（observed）・America/New_York 版。cascade（日本の振替休日・国民の休日の導出）だけは言語の
// 見せ場として日英共通——「法定表から規則で導く」の実演は日本の暦がいちばん濃い。
const US_PREMISE = `premise US {
  calendar-system: Gregorian; tz: "America/New_York"; wkst: Sun
  federal2026 = [2026-01-01, 2026-01-19, 2026-02-16, 2026-05-25, 2026-06-19, 2026-07-03, 2026-09-07, 2026-10-12,
                 2026-11-11, 2026-11-26, 2026-12-25] covering: 2026..2026
  satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  bizDay = everyDay \\ (satSun | federal2026)
}`;
const EXAMPLES_EN = {
  garbage: {
    from: '2026-01-01', to: '2027-01-01', tz: 'America/New_York',
    code: `# Recycling pickup (1st and 3rd Wednesday)
${US_PREMISE}

@US
wed = everyDay |> filter(d => weekday(d) == Wed)
(wed |> within(month) |> nth(1)) | (wed |> within(month) |> nth(3))`,
  },
  pay15: {
    from: '2026-01-01', to: '2027-01-01', tz: 'America/New_York',
    code: `# Payday (15th and month-end; previous business day on holidays)
${US_PREMISE}

@US
d15 = everyDay |> within(month) |> nth(15)
eom = everyDay |> within(month) |> last
(d15 | eom) |> roll(Preceding, on: bizDay)`,
  },
  alarm: {
    window: 28, tz: 'America/New_York',
    code: `# Alarm clock (weekdays 6:30, Saturdays and holidays 8:00)
${US_PREMISE}

@US
sat = everyDay |> filter(d => weekday(d) == Sat)
sun = everyDay |> filter(d => weekday(d) == Sun)
lateDay = (sat | federal2026) \\ sun
(bizDay |> at(T06:30)) | (lateDay |> at(T08:00))`,
  },
  payday: {
    from: '2026-07-01', to: '2026-11-01', tz: 'America/New_York',
    code: `premise US {
  calendar-system: Gregorian
  tz: "America/New_York"
  wkst: Sun
}

@US
federal2026 = [2026-01-01, 2026-01-19, 2026-02-16, 2026-05-25, 2026-06-19,
               2026-07-03, 2026-09-07, 2026-10-12, 2026-11-11, 2026-11-26,
               2026-12-25] covering: 2026..2026
satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
bizDay = everyDay \\ (satSun | federal2026)

everyDay |> within(month) |> nth(25) |> roll(Preceding, on: bizDay)`,
  },
  monthend3: {
    from: '2026-08-01', to: '2026-12-01', tz: 'America/New_York',
    code: `premise US {
  calendar-system: Gregorian
  tz: "America/New_York"
  wkst: Sun
}

@US
federal2026 = [2026-01-01, 2026-01-19, 2026-02-16, 2026-05-25, 2026-06-19,
               2026-07-03, 2026-09-07, 2026-10-12, 2026-11-11, 2026-11-26,
               2026-12-25] covering: 2026..2026
satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
bizDay = everyDay \\ (satSun | federal2026)

monthEnd |> roll(Preceding, on: bizDay) |> shift(-3, unit: bizDay)`,
  },
  cascade: EXAMPLES.cascade,
  friday13: {
    from: '2026-01-01', to: '2027-01-01', tz: 'America/New_York',
    code: `premise US {
  calendar-system: Gregorian
  tz: "America/New_York"
  wkst: Sun
}

@US
(everyDay |> filter(d => weekday(d) == Fri)) & (everyDay |> within(month) |> nth(13))`,
  },
  empty: {
    from: '2027-01-04', to: '2027-01-11', tz: 'America/New_York',
    code: `premise US {
  calendar-system: Gregorian
  tz: "America/New_York"
  wkst: Sun
}

@US
holidays2027 = [] covering: 2027..2027
satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
bizDay = everyDay \\ (satSun | holidays2027)

bizDay`,
  },
};

/** 「カレンダーに入れる」の本体（純関数・ブラウザ API を使わない＝テストから直接呼べる）。
 *  同じ評価結果（run）を toIcs へ渡す——Playground と CLI の .ics は同じ関数から出る。 */
export function buildIcs(source, { from, to, tz, lang, series }) {
  const r = run(source, { from, to, tz: tz || undefined });
  const rep = { version: IMPL_VERSION, tz: tz || 'Asia/Tokyo', from, to,
    results: r.results.map(res => ({ source: res.source, dates: res.dates, points: res.points, annotations: res.annotations })) };
  const title = titleFromSource(source);
  // ファイル名＝予定の名前（使えない文字は -）。上限 80 字（40 字だと英語の暮らしの例の題が語の途中で切れた＝2026-10-07）
  const name = (title ? title.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) : `kairos-${from}_${to}`) + '.ics';
  const count = icsEventCount(rep);                                                   // 点の総数（註釈の予定は数えない）
  const events = series === true ? rep.results.filter(r => r.dates.length > 0).length : count;   // カレンダー上の件数（series は式ごと 1）
  return { text: toIcs(rep, { lang, source, series: series === true }), name, count, events };
}

/** 今日（tz の市民日）から days 日の半開区間 [from, to) を YYYY-MM-DD で返す——例の「有視界の窓」用。
 *  評価そのものは from/to の値だけで決まる（共有 URL は範囲を固定する）ので決定性は保つ。now はテスト用 */
export function rollingWindow(tz, days, now = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, m, d] = ymd.split('-').map(Number);
  const to = new Date(Date.UTC(y, m - 1, d + days));
  const p = n => String(n).padStart(2, '0');
  return { from: ymd, to: `${to.getUTCFullYear()}-${p(to.getUTCMonth() + 1)}-${p(to.getUTCDate())}` };
}

/** スマホらしさの判定（タッチ主体のポインタか狭い画面）。判定できない環境（テスト・古いブラウザ）では false＝PC 扱い */
export function isPhoneLike(env = globalThis) {
  try {
    const coarse = typeof env.matchMedia === 'function' && env.matchMedia('(pointer: coarse)').matches === true;
    const narrow = typeof env.innerWidth === 'number' && env.innerWidth > 0 && env.innerWidth < 700;
    return Boolean(coarse || narrow);
  } catch { return false; }
}

export function init(lang) {
  const T = STRINGS[lang];
  const EX = lang === 'en' ? EXAMPLES_EN : EXAMPLES;
  const $ = id => document.getElementById(id);
  const build = $('pg-build');
  if (build) build.textContent = T.build(IMPL_VERSION, IMPL_SOURCE_SHA);   // 学習者が「同じ版」を画面で確かめる口（検定の追従の前提）
  const src = $('pg-src'), out = $('pg-out');
  const msg = $('pg-msg');
  const say = t => { if (msg) msg.textContent = t; };   // 「カレンダーに入れる」の保存メッセージ。評価のたびに消す（前回の「保存した」が残らない）

  function evaluate() {
    say('');
    const from = $('pg-from').value, to = $('pg-to').value, tz = $('pg-tz').value.trim();
    try {
      const r = run(src.value, { from, to, tz: tz || undefined });
      const lines = [];
      // 表示は CLI の list（impl/src/cli.ts の renderHuman）と行単位で同じにする——教材・検定の期待出力は CLI の出力で、
      // 学習者は Playground で確かめる。単一式の 0 点は CLI と同じ行を出す（旧: 註釈が無いときだけ「（点ゼロ）」・
      // 註釈があれば何も出さない＝CLI 1.0.5 の 0 点表示と食い違った。2026-09-30）
      r.results.forEach((res, i) => {
        if (r.results.length > 1) lines.push(T.exprHead(i + 1, res.dates.length));
        else if (res.dates.length === 0) lines.push(T.empty(from, to));
        for (const d of res.dates) lines.push(d);
        for (const a of res.annotations) lines.push(`# ⚠ ${formatAnnotation(a)}`);
      });
      if (r.coverage.length > 0) {
        lines.push(T.coverageHead);
        for (const c of r.coverage) {
          lines.push(`#   ${c.source} covering ${c.covering}${c.asof ? ` asof ${c.asof}` : ''}`
            + `${c.concluded ? T.concluded : ''}`
            + ` ${T.runway(c.runwayDays)}`);
        }
      }
      for (const w of r.warnings) lines.push(T.warning(w));
      out.textContent = r.results.length === 0 ? NO_BODY : (lines.join('\n') || T.noOutput);
    } catch (e) {
      out.textContent = String(e && e.message ? e.message : e);
    }
  }

  // バイト列は小分けにして文字列へ——fromCharCode(...全体) のスプレッドは 130 KB 前後で引数の上限を越え、
  // 「URL に固定」が例外で黙って何も起きなかった（境界チェックリスト三巡目 2026-09-30・F146）
  const b64e = s => {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const b64d = s => new TextDecoder().decode(
    Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

  function share() {
    const h = new URLSearchParams({ s: b64e(src.value), f: $('pg-from').value, t: $('pg-to').value });
    const tz = $('pg-tz').value.trim();
    if (tz && tz !== 'Asia/Tokyo') h.set('z', tz);
    location.hash = h.toString();
    out.textContent = T.shared(location.href);
  }

  function restore() {
    if (!location.hash || location.hash.length < 2) return false;
    try {
      const h = new URLSearchParams(location.hash.slice(1));
      if (!h.get('s')) return false;
      src.value = b64d(h.get('s'));
      if (h.get('f')) $('pg-from').value = h.get('f');
      if (h.get('t')) $('pg-to').value = h.get('t');
      if (h.get('z')) $('pg-tz').value = h.get('z');
      return true;
    } catch { return false; }
  }

  $('pg-example').addEventListener('change', e => {
    const ex = EX[e.target.value];
    if (!ex) return;
    src.value = ex.code;
    // window: N の例は選んだ日から N 日の有視界の窓（目覚まし＝今日から先の予定が出る）。他の例は固定の範囲
    const w = ex.window ? rollingWindow(ex.tz || 'Asia/Tokyo', ex.window) : ex;
    $('pg-from').value = w.from;
    $('pg-to').value = w.to;
    $('pg-tz').value = ex.tz || 'Asia/Tokyo';
    evaluate();
  });
  $('pg-run').addEventListener('click', evaluate);
  $('pg-share').addEventListener('click', share);
  // カレンダーに入れる（.ics）——ブラウザ内で作って保存する（送信なし）。予定 0 件なら作らない
  const icsBtn = $('pg-ics');
  // 既定: PC は series（1 つの繰り返し予定）・スマホ（タッチ操作か狭い画面）は「1 点ずつ」——スマホの Google カレンダーアプリは RDATE を読まず
  // 初回だけの単発予定になり、以後その UID の繰り返し予定を PC からも取り込めなくなる（設計者実測 2026-10-08・裁定同日）
  const splitBox = $('pg-ics-split');
  if (splitBox && isPhoneLike()) splitBox.checked = true;
  if (icsBtn) icsBtn.addEventListener('click', () => {
    try {
      evaluate();   // 結果欄を同じ式・同じ範囲で更新してから書き出す（編集後に評価せず押しても画面と .ics が食い違わない）
      const from = $('pg-from').value, to = $('pg-to').value, tz = $('pg-tz').value.trim();
      // 既定は series（1 式 1 つの繰り返し予定＝Google／Apple 向け・設計者裁定 2026-10-06「一般の人は Playground から取り込む」）。
      // 「1 点ずつ別の予定にする」は RDATE を読まないアプリ（Outlook 系）向けの逃がし
      const split = $('pg-ics-split') ? $('pg-ics-split').checked === true : false;
      const r = buildIcs(src.value, { from, to, tz, lang, series: !split });
      if (r.count === 0) { say(T.icsEmpty); return; }
      const blob = new Blob([r.text], { type: 'text/calendar;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = r.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      say(T.icsSaved(r.name, r.count, r.events, !split));
    } catch (e) {
      out.textContent = String(e && e.message ? e.message : e);
    }
  });
  src.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); evaluate(); }
  });

  if (restore()) evaluate();
  else {
    $('pg-example').value = 'payday';
    $('pg-example').dispatchEvent(new Event('change'));
  }
}
