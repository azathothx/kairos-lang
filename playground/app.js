// Kairos Playground — ブラウザ内評価（生成物 js/ はリファレンス実装のトランスパイル。
// ビルド: 非公開正本の tools/build-playground.mjs）
import { run, formatAnnotation } from './js/index.js';

const $ = id => document.getElementById(id);
const src = $('pg-src'), out = $('pg-out');

const EXAMPLES = {
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

function evaluate() {
  const from = $('pg-from').value, to = $('pg-to').value, tz = $('pg-tz').value.trim();
  try {
    const r = run(src.value, { from, to, tz: tz || undefined });
    const lines = [];
    r.results.forEach((res, i) => {
      if (r.results.length > 1) lines.push(`# 式 ${i + 1}（${res.dates.length} 件）`);
      for (const d of res.dates) lines.push(d);
      for (const a of res.annotations) lines.push(`# ⚠ ${formatAnnotation(a)}`);
    });
    if (r.results.length === 1 && r.results[0].dates.length === 0
        && r.results[0].annotations.length === 0) lines.push('（点ゼロ）');
    if (r.coverage.length > 0) {
      lines.push('# 被覆サマリ');
      for (const c of r.coverage) {
        lines.push(`#   ${c.source} covering ${c.covering}${c.asof ? ` asof ${c.asof}` : ''}`
          + `${c.concluded ? '（完結主張）' : ''}`
          + ` 残走路 ${c.runwayDays === null ? '∞' : `${c.runwayDays} 日`}`);
      }
    }
    for (const w of r.warnings) lines.push(`警告: ${w}`);
    out.textContent = lines.join('\n') || '（出力なし）';
  } catch (e) {
    out.textContent = String(e && e.message ? e.message : e);
  }
}

const b64e = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => new TextDecoder().decode(
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

function share() {
  const h = new URLSearchParams({ s: b64e(src.value), f: $('pg-from').value, t: $('pg-to').value });
  const tz = $('pg-tz').value.trim();
  if (tz && tz !== 'Asia/Tokyo') h.set('z', tz);
  location.hash = h.toString();
  out.textContent = 'この URL に式と評価範囲を固定した。そのまま共有できる。\n\n' + location.href;
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
  const ex = EXAMPLES[e.target.value];
  if (!ex) return;
  src.value = ex.code;
  $('pg-from').value = ex.from;
  $('pg-to').value = ex.to;
  evaluate();
});
$('pg-run').addEventListener('click', evaluate);
$('pg-share').addEventListener('click', share);
src.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); evaluate(); }
});

if (restore()) evaluate();
else {
  $('pg-example').value = 'payday';
  $('pg-example').dispatchEvent(new Event('change'));
}
