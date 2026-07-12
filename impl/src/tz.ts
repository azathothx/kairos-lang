// IANA タイムゾーン（依存ゼロ・Intl ベース）
//
// ADR-33 の射影パラメータモデルの幾何側: tz は「chronos → 市民ラベル」の写像で、
// - オフセットの遷移点列を Intl.DateTimeFormat の探査＋二分法で一度だけ構築しキャッシュする
// - 市民日は「その日付になる最初の瞬間」からの半開区間（ADR-33 判断 4——DST の隙間・重複も同規則）
// - DST 切替日の市民日は 23/25 時間（幅規約 ADR-11/12: 1d は市民日であって 86400s ではない）
import { KairosError } from './eval.ts';

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

/** 遷移タイムラインの構築範囲（プロトタイプの実体化はこの中に収まる） */
const RANGE_LO = Date.UTC(1969, 0, 1);
const RANGE_HI = Date.UTC(2101, 0, 1);

export interface CivilFields { y: number; mo: number; d: number; h: number; mi: number; s: number; ms: number }

export type AnchorResult =
  | { kind: 'unique'; ms: number }
  | { kind: 'gap'; ms: number }                  // 存在しない時刻——ms は「その時刻以後の最初の瞬間」（遷移点）
  | { kind: 'overlap'; ms: number; alt: number }; // 二意の時刻——ms は最初の候補・alt は後の候補

export class Tz {
  readonly name: string;
  /** 区間 [t[i], t[i+1]) のオフセット off[i]（分）。t[0] = RANGE_LO */
  private t: number[] = [];
  private off: number[] = [];
  /** 市民日開始の実体化キャッシュ（1970-01-01 の市民日が添字 0） */
  private days: number[] = [];
  private daysHi = 0;

  constructor(name: string) {
    this.name = name;
    const dtf = new Intl.DateTimeFormat('en-CA', {
      timeZone: name, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const offAt = (ms: number): number => {
      const p: Record<string, number> = {};
      for (const part of dtf.formatToParts(ms)) {
        if (part.type !== 'literal') p[part.type] = +part.value;
      }
      const local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
      return Math.round((local - Math.floor(ms / 1000) * 1000) / MIN_MS);
    };
    // 探査（14 日刻み）＋二分法で遷移点列を構築（分精度）
    let cur = RANGE_LO;
    let curOff = offAt(cur);
    this.t.push(RANGE_LO);
    this.off.push(curOff);
    const STEP = 14 * DAY_MS;
    while (cur < RANGE_HI) {
      const next = Math.min(cur + STEP, RANGE_HI);
      const nextOff = offAt(next);
      if (nextOff !== curOff) {
        let lo = cur, hi = next;                 // 遷移は (lo, hi] のどこか
        while (hi - lo > MIN_MS) {
          const mid = lo + Math.floor((hi - lo) / 2 / MIN_MS) * MIN_MS;
          if (offAt(mid) === curOff) lo = mid; else hi = mid;
        }
        this.t.push(hi);
        this.off.push(nextOff);
        curOff = nextOff;
      }
      cur = next;
    }
  }

  /** 瞬間のオフセット（分） */
  offsetAt(ms: number): number {
    let lo = 0, hi = this.t.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.t[mid] <= ms) lo = mid; else hi = mid - 1;
    }
    return this.off[lo];
  }

  /** 瞬間の市民フィールド */
  localFields(ms: number): CivilFields {
    const d = new Date(ms + this.offsetAt(ms) * MIN_MS);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(),
             h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), ms: d.getUTCMilliseconds() };
  }

  /** 市民フィールド（local-as-UTC ms）の錨打ち。DST の隙間・重複を検出する（ADR-33） */
  anchor(localAsUtc: number): AnchorResult {
    // 近傍の区間のオフセット候補で逆写像を試す
    const cands: number[] = [];
    const seen = new Set<number>();
    let lo = 0, hi = this.t.length - 1;
    while (lo < hi) {                            // localAsUtc 近傍の区間添字（±1 日で足りる）
      const mid = (lo + hi + 1) >> 1;
      if (this.t[mid] <= localAsUtc - DAY_MS) lo = mid; else hi = mid - 1;
    }
    for (let i = lo; i < this.t.length && this.t[i] <= localAsUtc + DAY_MS; i++) {
      const o = this.off[i];
      if (seen.has(o)) continue;
      seen.add(o);
      const u = localAsUtc - o * MIN_MS;
      if (this.offsetAt(u) === o) cands.push(u);
    }
    cands.sort((a, b) => a - b);
    if (cands.length === 1) return { kind: 'unique', ms: cands[0] };
    if (cands.length >= 2) return { kind: 'overlap', ms: cands[0], alt: cands[cands.length - 1] };
    // 隙間: 時計が飛んだ——「その時刻以後の最初の瞬間」＝直近の遷移点（ADR-33 判断 4）
    for (let i = 1; i < this.t.length; i++) {
      const tr = this.t[i];
      const before = tr - 1 + this.off[i - 1] * MIN_MS;  // 遷移直前の市民時刻
      const after = tr + this.off[i] * MIN_MS;           // 遷移直後の市民時刻
      if (before < localAsUtc && localAsUtc <= after) return { kind: 'gap', ms: tr };
    }
    // ここに来るのは構築範囲外など——保守的にオフセット即値で写す
    return { kind: 'unique', ms: localAsUtc - this.offsetAt(localAsUtc) * MIN_MS };
  }

  /** 市民日の開始＝「その日付になる最初の瞬間」（ADR-33 判断 4。真夜中が隙間なら遷移点） */
  civilDayStart(y: number, mo: number, d: number): number {
    const a = this.anchor(Date.UTC(y, mo - 1, d));
    return a.ms;                                 // gap→遷移点・overlap→最初の候補・unique→そのまま
  }

  /** 市民日開始 ms を n 市民日ぶん歩進（フィールド演算＝壁時計保存） */
  addCivilDays(dayStartMs: number, n: number): number {
    const f = this.localFields(dayStartMs);
    return this.civilDayStart(f.y, f.mo, f.d + n);
  }

  /** ms の属する市民日の開始 */
  floorToDay(ms: number): number {
    const f = this.localFields(ms);
    const s = this.civilDayStart(f.y, f.mo, f.d);
    return s <= ms ? s : this.civilDayStart(f.y, f.mo, f.d - 1);   // 稀な端の防御
  }

  /** 瞬間の壁時計の日内ラベル（h:m:s.ms の ms 換算）——日開始からの経過ではなくラベル読み。
   *  時刻付き anchor/from: の窓境界の正（ADR-31 改訂 2・F87）: 切替日の anchor でも
   *  atTimeOfDay と往復して「各市民日でその壁時計を最初に読む瞬間」が立つ */
  timeOfDayLabel(ms: number): number {
    const f = this.localFields(ms);
    return ((f.h * 60 + f.mi) * 60 + f.s) * 1000 + f.ms;
  }

  /** 市民日 D（開始 ms）で壁時計 (h,m,s) ＝ todMs を最初に読む瞬間（ADR-31 改訂 2）:
   *  隙間（存在しない時刻）なら隙間明けの最初の瞬間・重複（二度ある時刻）なら最初の出現 */
  atTimeOfDay(dayStartMs: number, todMs: number): number {
    if (todMs === 0) return dayStartMs;
    const f = this.localFields(dayStartMs);
    const a = this.anchor(Date.UTC(f.y, f.mo - 1, f.d) + todMs);
    return a.ms;
  }

  /** [1970-01-01 の市民日, hi) の市民日開始列（添字 0 ＝紀元の市民日。キャッシュ・追記拡張） */
  dayStarts(hi: number): number[] {
    if (hi > this.daysHi) {
      if (this.days.length === 0) this.days.push(this.civilDayStart(1970, 1, 1));
      let last = this.days[this.days.length - 1];
      while (last < hi + DAY_MS) {
        last = this.addCivilDays(last, 1);
        this.days.push(last);
      }
      this.daysHi = hi;
    }
    return this.days;
  }

  /** 市民日開始の紀元（1970-01-01 の市民日）からの序数。dayStarts の添字 */
  dayIndex(dayStartMs: number): number {
    // 概算（24h 割り）から局所補正——市民日は 23〜25h なので誤差は小さい
    const days = this.dayStarts(Math.max(dayStartMs + 2 * DAY_MS, this.daysHi));
    let i = Math.min(Math.max(Math.round((dayStartMs - days[0]) / DAY_MS), 0), days.length - 1);
    while (days[i] > dayStartMs && i > 0) i--;
    while (i + 1 < days.length && days[i + 1] <= dayStartMs) i++;
    return i;
  }

  /** 表示形（YYYY-MM-DD[Thh:mm[:ss]]）——この tz の市民ラベル */
  format(ms: number): string {
    const f = this.localFields(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    const date = `${f.y}-${p(f.mo)}-${p(f.d)}`;
    if (f.h || f.mi || f.s || f.ms) {
      return `${date}T${p(f.h)}:${p(f.mi)}` + (f.s ? `:${p(f.s)}` : '');
    }
    return date;
  }
}

const TZ_CACHE = new Map<string, Tz>();

/** 固定オフセット表記の厳格一意形（F66 (b)・ADR-43）: ^[+-]HH:MM$（ゼロ埋め必須・HH 00–14・
 *  MM 00–59）のみ。Intl が受ける別綴り（"+0900"・"+15:00" 等）もここで封じる——同じオフセットの
 *  二綴りは tz 名の文字列等値（ADR-36 判断 6・defCache キー）を黙って割る。Intl に渡す前の字句検査 */
function checkTzLexical(name: string): void {
  if (/^[+-]/.test(name) || name === 'Z' || /^UTC.+/.test(name)) {
    const m = /^([+-])(\d{2}):(\d{2})$/.exec(name);
    if (!m || +m[2] > 14 || +m[3] > 59) {
      throw new KairosError(`不正な固定オフセット tz: "${name}"——正準形は "±HH:MM"（ゼロ埋め必須・`
        + `HH 00..14・MM 00..59。例 "+09:00"）か IANA 名（"UTC" は IANA 名として合法。F66/ADR-43）`);
    }
  }
}

/** tz 名から Tz を得る（プロセス内キャッシュ）。不正な名前は静的エラー */
export function getTz(name: string): Tz {
  const hit = TZ_CACHE.get(name);
  if (hit) return hit;
  checkTzLexical(name);   // 固定オフセットの厳格一意形（F66 (b)）——Intl の受理より狭い
  try {
    const tz = new Tz(name);
    TZ_CACHE.set(name, tz);
    return tz;
  } catch (e) {
    if (e instanceof RangeError) {
      throw new KairosError(`不正な tz 名: "${name}"（IANA 名か固定オフセット正準形 "±HH:MM"。ADR-33/36/43）`);
    }
    throw e;
  }
}
