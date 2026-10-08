import { formatAnnotation } from './eval.js';
const CRLF = '\r\n';
/** TEXT 値のエスケープ（RFC 5545 §3.3.11） */
export function escapeText(s) {
    // '\\;'＝バックスラッシュ＋セミコロン（JS の '\;' は ';' に潰れて未エスケープになる＝公開前レビュー 2026-10-07 で検出）
    return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
/** 75 オクテット折り返し（継続行は先頭に空白 1 つ＋74 オクテット）。UTF-8 の継続バイト（10xxxxxx）の前では切らない */
export function foldLine(line) {
    const enc = new TextEncoder().encode(line);
    if (enc.length <= 75)
        return [line];
    const dec = new TextDecoder();
    const out = [];
    let i = 0;
    while (i < enc.length) {
        const limit = out.length === 0 ? 75 : 74;
        let j = Math.min(i + limit, enc.length);
        while (j < enc.length && j > i && (enc[j] & 0xC0) === 0x80)
            j--;
        // エスケープ列（\n・\;・\,・\\）も割らない——RFC 5545 §3.1 は任意の位置で折り返せるが、行末が孤立した「\」になる形
        // （`…@JP\` + 継続行 `n…`）を Google カレンダーの取り込みが「処理できません」で拒んだ（設計者実測 2026-10-08・1.0.7 の目覚まし）。
        // 行末に奇数個の \ が続くなら、その \ を次の行へ送る
        if (j < enc.length && j - i > 1) {
            let k = j, bs = 0;
            while (k > i && enc[k - 1] === 0x5C) {
                bs++;
                k--;
            }
            if (bs % 2 === 1)
                j--;
        }
        out.push((out.length === 0 ? '' : ' ') + dec.decode(enc.subarray(i, j)));
        i = j;
    }
    return out;
}
/** epoch ms → iCalendar の UTC 形 YYYYMMDDTHHMMSSZ（秒未満は切り捨て） */
export function icsUtc(ms) {
    const d = new Date(Math.floor(ms / 1000) * 1000);
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`
        + `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}
/** FNV-1a 64 bit（16 桁 hex）——依存ゼロ・ブラウザと Node で同じ値 */
export function fnv1a64(s) {
    let h = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    for (const b of new TextEncoder().encode(s)) {
        h ^= BigInt(b);
        h = (h * prime) & 0xffffffffffffffffn;
    }
    return h.toString(16).padStart(16, '0');
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDateLabel = (label) => DATE_RE.test(label);
const dateValue = (label) => label.replace(/-/g, '');
/** 定義の先頭の非空行がコメント（# …）ならそれを名前として読む。無ければ undefined */
export function titleFromSource(source) {
    if (!source)
        return undefined;
    const first = source.replace(/^\uFEFF/, '').split('\n').map(l => l.trim()).find(l => l !== '');
    if (!first || !first.startsWith('#'))
        return undefined;
    const t = first.replace(/^#+\s*/, '').trim();
    return t === '' ? undefined : t;
}
const STR = {
    ja: { annotationNote: 'この区間は表の外に依存する——表を更新して再生成する' },
    en: { annotationNote: 'This interval depends on data outside the table — update the table and regenerate' },
};
/** 評価結果を .ics の文字列にする（CRLF 終端）。予定の件数は dates の総数（註釈の予定は数えない） */
export function toIcs(rep, opts = {}) {
    const lang = opts.lang ?? 'ja';
    const title = opts.title ?? titleFromSource(opts.source) ?? opts.fallbackTitle;
    const many = rep.results.length > 1;
    const lines = [];
    const push = (name, value) => lines.push(...foldLine(`${name}:${value}`));
    push('BEGIN', 'VCALENDAR');
    push('VERSION', '2.0');
    push('PRODID', `-//kairos-lang.org//Kairos ${rep.version}//EN`);
    push('CALSCALE', 'GREGORIAN');
    push('METHOD', 'PUBLISH');
    push('X-WR-CALNAME', escapeText(title ?? 'Kairos'));
    push('X-KAIROS-VERSION', rep.version);
    push('X-KAIROS-TZ', rep.tz);
    push('X-KAIROS-RANGE', `${rep.from}/${rep.to}`);
    if (opts.source !== undefined)
        push('X-KAIROS-SOURCE', escapeText(opts.source));
    rep.results.forEach((res, idx) => {
        const srcLine = res.source.split('\n')[0].trim();
        const name = title === undefined ? (srcLine || 'Kairos') : many ? `${title} · ${srcLine}` : title;
        // UID の鍵＝式の字面・ファイル内の順番（idx）・tz。順番を含めるのは、同じ字面の式が 2 つ（別の前文の下など）あっても
        // UID が衝突しない（RFC 5545 §3.8.4.7 の MUST）ため——字面だけだと series で別の点列の 2 予定が 1 つに潰れる（公開前レビュー 2026-10-07）
        const key = fnv1a64(`${idx}\u0000${res.source}\u0000${rep.tz}`).slice(0, 12);
        const alarm = () => {
            push('BEGIN', 'VALARM');
            push('ACTION', 'DISPLAY');
            push('DESCRIPTION', escapeText(name));
            push('TRIGGER', 'PT0M');
            push('END', 'VALARM');
        };
        if (opts.series) {
            // 1 式 1 予定: 先頭の点が DTSTART・残りは RDATE（25 個ずつ複数行）。粒度は式の点列で決める（全部が日付なら終日）
            if (res.dates.length > 0) {
                const allDay = res.dates.every(isDateLabel);
                const ms0 = res.points[0];
                push('BEGIN', 'VEVENT');
                push('UID', `kairos-${key}-series@kairos-lang.org`);
                push('DTSTAMP', icsUtc(ms0));
                if (allDay)
                    lines.push(`DTSTART;VALUE=DATE:${dateValue(res.dates[0])}`);
                else {
                    push('DTSTART', icsUtc(ms0));
                    push('DTEND', icsUtc(ms0));
                }
                for (let i = 1; i < res.dates.length; i += 25) {
                    const chunk = res.dates.slice(i, i + 25).map((l, j) => allDay ? dateValue(l) : icsUtc(res.points[i + j]));
                    if (allDay)
                        push('RDATE;VALUE=DATE', chunk.join(','));
                    else
                        push('RDATE', chunk.join(','));
                }
                push('SUMMARY', escapeText(name));
                push('DESCRIPTION', escapeText(`${res.dates.length} × ${res.dates[0]} … ${res.dates[res.dates.length - 1]}\n${res.source}`));
                push('X-KAIROS-COUNT', String(res.dates.length));
                push('X-KAIROS-LABEL', res.dates[0]);
                push('TRANSP', 'TRANSPARENT');
                if (!allDay)
                    alarm();
                push('END', 'VEVENT');
            }
        }
        else {
            res.dates.forEach((label, i) => {
                const ms = res.points[i];
                const allDay = isDateLabel(label);
                push('BEGIN', 'VEVENT');
                push('UID', `kairos-${key}-${ms}@kairos-lang.org`);
                push('DTSTAMP', icsUtc(ms));
                if (allDay)
                    lines.push(`DTSTART;VALUE=DATE:${dateValue(label)}`);
                else {
                    push('DTSTART', icsUtc(ms));
                    push('DTEND', icsUtc(ms));
                }
                push('SUMMARY', escapeText(name));
                push('DESCRIPTION', escapeText(`${label}\n${res.source}`));
                push('X-KAIROS-POINT', String(ms));
                push('X-KAIROS-LABEL', label);
                push('TRANSP', 'TRANSPARENT');
                if (!allDay)
                    alarm();
                push('END', 'VEVENT');
            });
        }
        for (const a of res.annotations) {
            push('BEGIN', 'VEVENT');
            push('UID', `kairos-${key}-ann-${a.fromMs}-${a.toMs}@kairos-lang.org`);
            push('DTSTAMP', icsUtc(a.fromMs));
            // 表示形が同じ（ε＝1 ms の区間が同じ日付ラベルに畳まれた形）なら DTEND を書かない——DTEND は DTSTART より後でなければ
            // ならない（RFC 5545 §3.8.2.2）。DTEND 無しの終日は 1 日（§3.6.1）＝半開 [from, from+1 日) と同じ意味
            if (isDateLabel(a.from) && isDateLabel(a.to)) {
                lines.push(`DTSTART;VALUE=DATE:${dateValue(a.from)}`);
                if (dateValue(a.to) !== dateValue(a.from))
                    lines.push(`DTEND;VALUE=DATE:${dateValue(a.to)}`);
            }
            else {
                push('DTSTART', icsUtc(a.fromMs));
                if (icsUtc(a.toMs) !== icsUtc(a.fromMs))
                    push('DTEND', icsUtc(a.toMs));
            }
            push('SUMMARY', escapeText(`⚠ ${formatAnnotation(a)}`));
            push('DESCRIPTION', escapeText(`${STR[lang].annotationNote}\n${res.source}`));
            push('TRANSP', 'TRANSPARENT');
            push('END', 'VEVENT');
        }
    });
    push('END', 'VCALENDAR');
    return lines.join(CRLF) + CRLF;
}
/** 予定の件数（dates の総数）——Playground の保存メッセージと CLI の検査で共有 */
export function icsEventCount(rep) {
    return rep.results.reduce((n, r) => n + r.dates.length, 0);
}
