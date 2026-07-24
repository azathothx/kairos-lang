// Kairos 評価器（プロトタイプ）
//
// 設計:
// - core 演算子だけを実装し、Gregorian は stdlib/gregorian.kairos（Kairos ソース）を評価して立てる。
// - 時間ストリームは計算範囲 [紀元 1970-01-01, to+マージン) で有界に実体化する（I7 の遅延・無限は
//   プロトタイプでは近似。範囲外・1970 以前は未対応）。
// - TZ は固定オフセットのみ（DST 未対応）。市民日＝24h に縮退する。
// - カレンダー実体（ADR-35）と整列検査（ADR-36）は実装済み——整列タグは評価時伝播（静的検査の近似）で、
//   tz 成分は名札（幾何はグローバル固定オフセット）。
// - 範囲外出自（ADR-37）は実装済み——値随伴の区間註釈（輸送表 §4.10）・実効被覆域の分類器・
//   被覆主張・被覆サマリ。クリップは runProgram の結果組み立てで一度だけ（判断 8）。
// - 窓所属の述語 coincides（仮称）と stride の入力相対（ADR-38）は実装済み——証人規則の三分岐・
//   tz 静的検査・filter 輸送の逆像拡幅（F75）・stride の n 域検査。
// - 日付ラベル保存の再錨 rebase（仮称・ADR-40）と免除系の tz 名検査（ADR-36 改訂 2）は実装済み。
// - 営業時間の供給規約と標準導出（ADR-41）は実装済み——sessionOpens/sessionCloses の対宣言・整合性検査
//   （結合実効被覆域∩実体化範囲の局所交互・端の切り欠き・同時刻対の文脈順序）・実体相対の
//   bizOpen/bizClose/isOpen（証人三分岐・実体キーのメモ化）。時刻付き anchor/from: の日内
//   オフセットは壁時計ラベル読み（ADR-31 改訂 2＝F87 の修正）。
// - 未実装: Modified ロール・everyInstant の一般合成・前文 tz: の写像評価。詳細は README。

import type {
  Expr, Stage, Arg, Statement, Program, PremiseBlock, Member, Param, ListElem, CoveringRange,
} from './ast.ts';
import type { DateVal, WidthVal } from './lexer.ts';
import { getTz, Tz } from './tz.ts';
import { parseCoveringText } from './parser.ts';

export class KairosError extends Error {}

/** 供給エラー（ADR-46 判断 7 (a)）: 解決失敗の機械可読な部分類。実装系（発報層等）は本分類を
 *  boot throw から除外して劣化運転に落としてよい——契約違反（KairosError）とは区別される */
export class SupplyError extends KairosError {}

const DAY_MS = 86_400_000;

// ---- 値 ----

export interface Iv { start: number; end: number }           // 半開区間 [start, end)。±Infinity 可
export interface WinLevel {
  name?: string; iv: Iv[]; labelFn?: LambdaV; grain?: GridTag | null; ann: Ann[];
  /** 窓列への並行ラベル列（ADR-39）: 添字＝窓列序数（実効被覆域内の先頭マーカー起点の窓が 0）。
   *  窓はラベルを格納しない——束縛に付く射影の定義データ（ADR-30 の原理の窓版） */
  labels?: (number | string | boolean)[];
  /** 窓列への周期ラベル（ADR-47）: ラベル(窓 i) = list[(i − i0) mod N]。i0＝anchor の属する窓の
   *  窓列序数（マーカー列基準＝実体化・評価範囲に依存しない） */
  labelsCycle?: { list: (number | string | boolean)[]; i0: number };
}

/** 評価註釈（ADR-37・I6）: 「範囲外」（out-of-coverage）の区間の出自。値に随伴し、
 *  演算子の輸送表（§4.10）で伝播する。from/to は ±Infinity 可＝内部は非クリップで運び、
 *  評価範囲 [from, to) へのクリップは表面（runProgram の結果組み立て）で一度だけ行う（判断 8）。 */
export interface Ann {
  from: number;
  to: number;
  source: string;        // 源（premise.束縛名。無名テーブルは '(無名テーブル)'）
  covering: string;      // 源の covering の表示形
  covIv: Iv[];           // 源の covering 区間（被覆主張の必要条件検査用）
  asof?: string;
}

/** 範囲外分類の失敗（ADR-37 判断 6）: 失敗した参照点が依存の実効被覆域の外。
 *  ストリーム文脈（filter の述語）は捕まえて「落として註釈」、純値文脈はそのまま
 *  範囲外分類の明示エラーとして表面化する（「値なし」スロットは導入しない） */
export class OutOfCoverageSignal extends KairosError {
  entries: Ann[];
  /** 述語が読んだ窓の区間（窓越し参照＝coincides 等）。filter の輸送はこの逆像へ拡幅する（F75・ADR-37 改訂 2） */
  window?: Iv;
  constructor(msg: string, entries: Ann[], window?: Iv) {
    super(msg);
    this.entries = entries;
    this.window = window;
  }
}

/** 整列（ADR-36）: 「全点が原子グリッド G＝（幅・正規化位相・tz 名）の目盛り点上にある」という
 *  静的主張。null は「なし」。位相は幅を法として正規化（civil＝市民日序数 mod 日数幅＋日内オフセット・
 *  elapsed＝anchor/紀元の chronos ms mod 幅）——既定整列と等価な anchor: は同一 G になり、
 *  日内オフセットを持つ anchor（毎日 09:00 級）は既定 day と別 G になる。
 *  プロトタイプは評価時にタグとして伝播する（束縛解決後静的検査の近似）。 */
export interface GridTag {
  kind: 'civil' | 'elapsed' | 'vacuous';
  step: number;                 // civil: 日数 / elapsed: ms / vacuous: 0
  phase: number;                // 正規化位相（幅を法とする。civil は市民日序数 mod step）
  off: number;                  // civil: anchor の日内オフセット ms（既定整列は 0）/ elapsed: 0
  tz: string;                   // civil のみ（elapsed/vacuous は ''）
}
/** 空テーブルの整列＝空虚適合（ADR-45・F98）: 違反しうる点が無いため全ての整列に空虚に適合する
 *  第三状態。「なし」（主張できない＝検査に落ちる）と別で、検査には**通り**、結合では相手の整列を
 *  継承する。tz 名検査（checkTzMembership）は kind が civil でないため自動で素通し（点ゼロに
 *  1 日ずれは起き得ない） */
const VACUOUS_GRAIN: GridTag = { kind: 'vacuous', step: 0, phase: 0, off: 0, tz: '' };
const isVacuous = (a: GridTag | null | undefined): boolean => a?.kind === 'vacuous';
function gridEq(a: GridTag | null | undefined, b: GridTag | null | undefined): boolean {
  if (isVacuous(a) || isVacuous(b)) return true;   // 空虚適合は相手が「なし」でも通す（ADR-45）
  return !!a && !!b && a.kind === b.kind && a.step === b.step && a.phase === b.phase
    && a.off === b.off && a.tz === b.tz;
}
const gridDesc = (a: GridTag | null | undefined) =>
  isVacuous(a) ? '空虚適合（空テーブル）'
    : a ? `${a.kind === 'civil' ? `市民日 ${a.step}d` : `経過 ${a.step}ms`} 位相 ${a.phase}`
    + `${a.off ? ` 日内 +${a.off}ms` : ''}${a.tz ? ` tz "${a.tz}"` : ''}` : 'なし';

export type V =
  | number | boolean | string | V[]
  | PointV | StreamV | WindowsV | CycleV | TableV | LambdaV | WidthV | ChronosV | InstantV;

export interface PointV { k: 'point'; ms: number }
export interface StreamV {
  k: 'stream'; pts: number[]; wins: WinLevel[]; align: GridTag | null; ann: Ann[];
  /** 導出構造が実体化地平線を越えて続くか（生成子由来＝真・テーブル由来＝偽。ADR-39 の
   *  「マーカー点列は有限」の静的判定＝ADR-36 の整列計算と同型の保守近似） */
  endless: boolean;
}
export interface WindowsV { k: 'windows'; name?: string; iv: Iv[]; units: number[]; labelFn?: LambdaV; grain: GridTag | null }
export interface CycleV { k: 'cycle'; iv: Iv[]; labels: string[]; anchor: number; grain: GridTag | null }
export interface TableV {
  k: 'table'; pts: number[]; labels?: string[];
  covIv: Iv[];           // データ被覆域（ADR-37 判断 1: 値には触れない主張。省略時は列の端）
  covDesc: string;       // covering の表示形
  concluded: boolean;    // 開端 covering（完結主張）の有無
  src?: string;          // 出自（premise.束縛名。evalDef/top-level 束縛で焼印）
  asof?: string;
  align: GridTag | null;
}
export interface LambdaV { k: 'lambda'; params: string[]; body: Expr; env: Env }
export interface WidthV { k: 'width'; w: WidthVal }
export interface ChronosV { k: 'chronos' }
export interface InstantV { k: 'instant' }

const isObj = (v: V): v is Exclude<V, number | boolean | string | V[]> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
/** 値型（数値・列挙名/文字列・論理）か——適用の引数型 dispatch（ADR-42 判断 4） */
const isValueV = (v: V): v is number | string | boolean =>
  typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean';
const kindOf = (v: V): string =>
  Array.isArray(v) ? 'list' : typeof v === 'object' && v !== null ? (v as any).k : typeof v;

// ---- premise ----

interface BindingDecl { params: Param[]; rhs: Expr; covering?: CoveringRange[] }

export class PremiseInstance {
  name: string;
  members: Map<string, string | Expr>;
  defs: Map<string, BindingDecl>;
  base: PremiseInstance | null;
  constructor(
    name: string,
    members: Map<string, string | Expr>,
    defs: Map<string, BindingDecl>,
    base: PremiseInstance | null,
  ) {
    this.name = name;
    this.members = members;
    this.defs = defs;
    this.base = base;
  }
  findDef(name: string): BindingDecl | undefined {
    return this.defs.get(name) ?? this.base?.findDef(name);
  }
  /** 定義側 premise の特定（external のスナップショット単位＝ADR-46 判断 5。member 解決規則の
   *  「定義側優先」〈ADR-35 判断 8〉と同じ向きの探索） */
  findDefOwner(name: string): { def: BindingDecl; owner: PremiseInstance } | undefined {
    const def = this.defs.get(name);
    if (def) return { def, owner: this };
    return this.base?.findDefOwner(name);
  }
}

export interface Env {
  rt: Runtime;
  premise: PremiseInstance | null;   // 在圏 premise（機構 A: def 本体の裸名もこのルートで再解決）
  members: Map<string, string | Expr>;
  locals: Map<string, V> | null;
  parent: Env | null;
}

function childEnv(env: Env, locals: Map<string, V>): Env {
  return { ...env, locals, parent: env };
}

// ---- 実行時 ----

export interface RunOptions {
  from: string;                       // YYYY-MM-DD
  to: string;                         // YYYY-MM-DD（排他）
  tz?: string;                        // 既定 Asia/Tokyo（前文 tz: があれば優先）
  resolve?: ExternalResolver;         // 外部供給宣言 external の解決子（ADR-46。無ければ解決時に供給エラー）
}

/** external 束縛の宣言（解決子に渡す静的知識。ADR-46） */
export interface ExternalDecl {
  kind: 'dates' | 'instants';
  labels?: string[];                  // ラベル値域の列挙（宣言＝静的知識）
  source: string;                     // 解決後の source:（named-arg 上書き済み）
}
/** external の解決値（wire）。kind ごとの形——dates は市民日付の字面（言語側で錨打ち＝派生 tz
 *  上書きで再錨可能）・instants は epoch ms（壁時計字面は DST 重複で二意になり得るため） */
export interface ExternalData {
  dates?: string[];                   // kind: dates — "YYYY-MM-DD"
  instants?: number[];                // kind: instants — epoch ms（有限整数）
  covering: string;                   // covering-list 字面（"2026..2026"・"2026-01-01.."・".."・区間リスト可）。必須
  asof: string;                       // データの観測日。必須（欠落＝契約違反）
  labels?: string[];                  // 宣言済みのときのみ・時点列と同長
}
export type ExternalResolver = (premise: string, binding: string, decl: ExternalDecl) => ExternalData;

/** 区間註釈の表面形（ADR-37 判断 5/7 (a)）: 評価範囲 [from, to) にクリップ済み */
export interface ResultAnnotation {
  kind: 'out-of-coverage';
  from: string; to: string;            // 表示形
  fromMs: number; toMs: number;        // 交差計算用（「判定は外部」の器）
  source: string; covering: string; asof?: string;
}

/** 区間註釈の正準一行表示。CLI と doctest（`#~>` 照合）で共有——書式のズレを封じる */
export function formatAnnotation(a: ResultAnnotation): string {
  return `範囲外 ${a.from}..${a.to}（${a.source} covering ${a.covering}${a.asof ? `, asof ${a.asof}` : ''}）`;
}

/** 被覆サマリの一行（ADR-37 判断 7 (b)）: クリップしない静的な監視面 */
export interface CoverageEntry {
  source: string;
  covering: string;
  asof?: string;
  concluded: boolean;                  // 完結主張（開端 covering）の有無——黙らせた事実の可観測化
  runwayDays: number | null;           // 評価 to から覆域終端までの残走路（日）。開端＝null
}

export interface RunResult {
  results: { source: string; points: number[]; dates: string[]; annotations: ResultAnnotation[] }[];
  coverage: CoverageEntry[];           // results と同格（註釈を捨てる短絡アクセスを既定にしない）
  warnings: string[];
  format: (ms: number) => string;
  runtime: Runtime;
}

export class Runtime {
  premises = new Map<string, PremiseInstance>();
  topBindings = new Map<string, BindingDecl>();
  warnings: string[] = [];
  /** external の解決子（ADR-46。RunOptions.resolve から） */
  resolver?: ExternalResolver;
  /** 被覆サマリの収集（ADR-37 判断 7 (b)）: 評価が参照した各データ源・被覆主張 */
  coverage = new Map<string, { source: string; covering: string; asof?: string; concluded: boolean; covEnd: number }>();
  vocab = new Set<string>(['Following', 'Preceding', 'Modified', 'latest',
    'clip', 'drop', 'error', 'keep']);
  tzName: string;                     // 実行既定 tz（CLI/API 引数。前文 tz: が在圏で上書きする）
  tz: Tz;                             // 実行既定 tz の幾何（表示・from/to 解決）
  epoch: number;                      // 1970-01-01T00:00（実行既定 tz）の UTC ms＝実体化の下限
  computeEnd: number;

  fromMs: number;
  toMs: number;

  constructor(fromMs: number, toMs: number, tz: string) {
    this.fromMs = fromMs;
    this.toMs = toMs;
    this.tzName = tz;
    this.tz = getTz(tz);
    this.epoch = this.tz.civilDayStart(1970, 1, 1);
    this.computeEnd = toMs + 400 * DAY_MS;
    if (fromMs < this.epoch) throw new KairosError('プロトタイプの評価範囲は 1970-01-01 以降');
  }

  /** 実行既定 tz での錨打ち（表示・asof 等の寛容な文脈。隙間→最初の瞬間・重複→最初の候補） */
  dateToMs(d: DateVal): number {
    const local = Date.UTC(d.y, d.mo - 1, d.d, d.h, d.mi, Math.floor(d.s), Math.round((d.s % 1) * 1000));
    return this.tz.anchor(local).ms;
  }
  /** 表示形（実行既定 tz の市民ラベル） */
  fmt(ms: number): string {
    return this.tz.format(ms);
  }
}

// ---- 補助: 区間・点列 ----

/** start でソート済みの区間列から ms を含む区間の添字（なければ -1） */
function ivIndexOf(iv: Iv[], ms: number): number {
  let lo = 0, hi = iv.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (iv[mid].start <= ms) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 && ms < iv[ans].end ? ans : -1;
}

function ptIndexOf(pts: number[], ms: number): number {
  let lo = 0, hi = pts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid] === ms) return mid;
    if (pts[mid] < ms) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}

/** ソート済み点列で ms より大きい最初の添字（なければ length） */
function ptUpperBound(pts: number[], ms: number): number {
  let lo = 0, hi = pts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid] <= ms) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** ソート済み点列の集合演算 */
function ptUnion(a: number[], b: number[]): number[] {
  const out: number[] = []; let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i] < b[j])) out.push(a[i++]);
    else if (i >= a.length || b[j] < a[i]) out.push(b[j++]);
    else { out.push(a[i]); i++; j++; }
  }
  return out;
}
function ptInter(a: number[], b: number[]): number[] {
  const out: number[] = []; let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] < b[j]) i++; else if (b[j] < a[i]) j++;
    else { out.push(a[i]); i++; j++; }
  }
  return out;
}
function ptDiff(a: number[], b: number[]): number[] {
  const out: number[] = []; let i = 0, j = 0;
  while (i < a.length) {
    while (j < b.length && b[j] < a[i]) j++;
    if (j >= b.length || b[j] !== a[i]) out.push(a[i]);
    i++;
  }
  return out;
}

// ---- 補助: 区間列（±Infinity 可）と評価註釈（ADR-37） ----

/** 区間列を整列・併合した正規形 */
function mergeIv(iv: Iv[]): Iv[] {
  const s = iv.filter(x => x.end > x.start).sort((a, b) => a.start - b.start);
  const out: Iv[] = [];
  for (const x of s) {
    const last = out[out.length - 1];
    if (last && x.start <= last.end) last.end = Math.max(last.end, x.end);
    else out.push({ ...x });
  }
  return out;
}

/** 全時間 (-∞, +∞) に対する区間列の補集合 */
function complementIv(iv: Iv[]): Iv[] {
  const m = mergeIv(iv);
  const out: Iv[] = [];
  let cur = -Infinity;
  for (const x of m) {
    if (x.start > cur) out.push({ start: cur, end: x.start });
    cur = Math.max(cur, x.end);
  }
  if (cur < Infinity) out.push({ start: cur, end: Infinity });
  return out;
}

function ivContainsPoint(iv: Iv[], ms: number): boolean {
  return iv.some(x => x.start <= ms && ms < x.end);
}

/** c ⊆ ∪iv か（被覆主張の必要条件検査・ADR-37 判断 5） */
function ivCovers(iv: Iv[], c: Iv): boolean {
  return mergeIv(iv).some(x => x.start <= c.start && c.end <= x.end);
}

const annKey = (a: Ann) => `${a.source}#${a.covering}#${a.asof ?? ''}`;

/** 同一属性（源・covering・asof）の註釈区間を整列・併合した正規形 */
function normAnn(list: Ann[]): Ann[] {
  const groups = new Map<string, Ann[]>();
  for (const a of list) {
    if (a.to <= a.from) continue;
    const k = annKey(a);
    const g = groups.get(k);
    if (g) g.push(a); else groups.set(k, [a]);
  }
  const out: Ann[] = [];
  for (const g of groups.values()) {
    g.sort((x, y) => x.from - y.from);
    let cur = { ...g[0] };
    for (let i = 1; i < g.length; i++) {
      if (g[i].from <= cur.to) cur.to = Math.max(cur.to, g[i].to);
      else { out.push(cur); cur = { ...g[i] }; }
    }
    out.push(cur);
  }
  return out.sort((x, y) => x.from - y.from || x.to - y.to);
}

/** 註釈の和（結合子の輸送規則。自動相殺なし＝ADR-37 判断 4） */
function annUnion(...lists: Ann[][]): Ann[] {
  return normAnn(lists.flat());
}

/** ms を含む註釈エントリ（分類器の基準＝実効被覆域の外か） */
function annAt(ann: Ann[], ms: number): Ann[] {
  return ann.filter(a => a.from <= ms && ms < a.to);
}

/** 評価範囲へのクリップ（表面で一度だけ＝ADR-37 判断 8） */
function clipAnn(ann: Ann[], from: number, to: number): Ann[] {
  return normAnn(ann.map(a => ({ ...a, from: Math.max(a.from, from), to: Math.min(a.to, to) })));
}

/** roll による入力註釈の像（過大近似・単調）: 区間内の点の着地はこの包に収まる。
 *  軸が空のときの早期 return は健全（F99 検証で確認）——未知入力の着地は既知軸点が無ければ
 *  成立せず、未知の軸点への着地依存は dependImageAnn（軸註釈の依存像）が引き受ける */
function rollImageAnn(ann: Ann[], axis: number[], conv: 'Following' | 'Preceding'): Ann[] {
  if (axis.length === 0) return normAnn(ann);
  return normAnn(ann.map(a => {
    if (conv === 'Following') {
      if (a.to === Infinity) return { ...a };
      const j = ptUpperBound(axis, a.to - 1);          // a.to 以上の最初の軸点＝着地の上界
      return j < axis.length ? { ...a, to: Math.max(a.to, axis[j] + 1) } : { ...a, to: Infinity };
    }
    if (a.from === -Infinity) return { ...a };
    const j = ptUpperBound(axis, a.from) - 1;          // a.from 以下の最後の軸点＝着地の下界
    return j >= 0 ? { ...a, from: Math.min(a.from, axis[j]) } : { ...a, from: -Infinity };
  }));
}

/** 軸の註釈区間の依存像（ADR-37 判断 4 roll 行）: 規約の逆方向へ直前（Following）／
 *  直後（Preceding）の既知軸点まで拡張——その帯の入力は未知の軸点へ着地し得た。
 *  軸が空（点ゼロのテーブル等・F99）でも一般則がそのまま働く——既知軸点が無ければ帯は ±∞ へ
 *  広がり、開端 covering（完結主張）なら axisAnn が空で拡張対象なし＝註釈なしの空が保存される */
function dependImageAnn(axisAnn: Ann[], axis: number[], conv: 'Following' | 'Preceding'): Ann[] {
  return normAnn(axisAnn.map(a => {
    if (conv === 'Following') {
      if (a.from === -Infinity) return { ...a };
      const j = ptUpperBound(axis, a.from - 1) - 1;    // 直前の既知軸点（< a.from の最後）
      return j >= 0 ? { ...a, from: Math.min(a.from, axis[j]) } : { ...a, from: -Infinity };
    }
    if (a.to === Infinity) return { ...a };
    const j = ptUpperBound(axis, a.to - 1);            // 直後の既知軸点（≥ a.to の最初）
    return j < axis.length ? { ...a, to: Math.max(a.to, axis[j] + 1) } : { ...a, to: Infinity };
  }));
}

/** shift（窓語 unit）の平行移動像: 区間端を同じ窓添字ずらしで写す（過大近似可） */
function shiftAnnByWindows(ann: Ann[], iv: Iv[], n: number): Ann[] {
  const move = (ms: number): number => {
    if (!isFinite(ms)) return ms;
    const i = ivIndexOf(iv, ms);
    if (i < 0) return n >= 0 ? Infinity : -Infinity;   // 実体化の外→安全側
    const j = i + n;
    if (j < 0) return -Infinity;
    if (j >= iv.length) return Infinity;
    return iv[j].start + (ms - iv[i].start);
  };
  return normAnn(ann.map(a => ({ ...a, from: move(a.from), to: move(a.to) })));
}

/** shift（点列軸 unit）の平行移動像: 区間端を軸上の n 歩で写す（過大近似可） */
function shiftAnnByAxis(ann: Ann[], axis: number[], n: number): Ann[] {
  if (axis.length === 0) return normAnn(ann);
  const step = (k: number): number => (k < 0 ? -Infinity : k >= axis.length ? Infinity : axis[k]);
  return normAnn(ann.map(a => {
    const from = a.from === -Infinity ? -Infinity
      : step(ptUpperBound(axis, a.from - 1) + n);            // 区間内最初の軸点から n 歩
    const toBase = a.to === Infinity ? Infinity
      : step(ptUpperBound(axis, a.to - 1) - 1 + n);          // 区間内最後の軸点から n 歩
    return { ...a, from, to: toBase === Infinity ? Infinity : toBase + 1 };
  }));
}

/** snapTo の註釈の像: 端点を属する窓の先頭へ床処理（覆域の端を窓粒度で解決する操作形） */
function snapAnn(ann: Ann[], w: Iv[]): Ann[] {
  const floor = (ms: number): number => {
    if (!isFinite(ms)) return ms;
    const i = ivIndexOf(w, ms);
    return i >= 0 ? w[i].start : ms;
  };
  return normAnn(ann.map(a => ({ ...a, from: floor(a.from), to: floor(a.to) })));
}

// ---- 細粒度カレンダー導出（ADR-41） ----

/** 細粒度標準導出の実体化形（ADR-41 判断 3）: bizOpen/bizClose のストリームと、isOpen の
 *  三分岐（真／範囲外／偽）の判定材料（セッション断片・生マーカー・依存註釈）。実体ごとにメモ化 */
interface BizFine {
  open: StreamV;              // bizOpen＝C.sessionOpens のうち開場日（実体 tz 市民日）が C の営業日の点
  close: StreamV;             // bizClose＝bizOpen セッションの併合区間の和の右端
  segIv: Iv[];                // セッション断片 [open, close)（落ちた断片も保持・非重複・昇順）
  segDayStart: number[];      // 断片の開場点の属する実体 tz 市民日の開始（営業日性の判定点）
  segKept: boolean[];         // 断片が営業日セッションか（偽＝開場日が nonWorking で落ちた）
  markers: number[];          // 生マーカー時刻（sessionOpens ∪ sessionCloses）——セッション外の閉場確定の下界
  markerAnn: Ann[];           // sessionOpens/sessionCloses の註釈の和（マーカー未知の区間）
  dayAnn: Ann[];              // 営業日データ（C.everyDay \ C.nonWorking）の註釈
}

// ---- 評価器 ----

const CORE_STAGES = new Set(['within', 'segmentBy', 'first', 'nth', 'last', 'roll', 'shift',
  'snapTo', 'rebase', 'filter', 'stride', 'strideBy']);
const CORE_WORDS = new Set([...CORE_STAGES, 'everyDay', 'everyInstant', 'chronos',
  'grid', 'span', 'split', 'cycle', 'ordinalIn', 'epochOrdinal', 'coincides', 'external']);

/** 実在日の検査（ADR-43 の字句検査の解決値向け再執行——external は字句層を経ないため。ADR-46） */
function isRealDate(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
}
/** external 呼び出しの構造判定（位置検査・tz 必須執行が共用） */
function isExternalCall(x: unknown): x is Extract<Expr, { t: 'call' }> {
  return !!x && typeof x === 'object' && (x as any).t === 'call'
    && (x as any).callee?.t === 'name' && (x as any).callee.name === 'external';
}

export class Evaluator {
  /** premise 公開語のメモ（参照しうる文脈メンバー wkst・tz・calendar-system をキーに含める。I6） */
  private defCache = new Map<string, V>();
  /** 評価中の label: 付与式（再入ガード。自己参照＝定義中の束縛名のラベル射影を検出。ADR-34） */
  private labelStack = new Set<LambdaV>();
  /** 導出中のカレンダー実体（自己・相互循環の検出。ADR-35 判断 8——ADR-41 の導出鎖
   *  isOpen → bizOpen → C.nonWorking 越しの自己・相互参照もこの集合で捕まる） */
  private derivingEntities = new Set<string>();
  /** 細粒度導出（ADR-41）のメモ——実体名＋文脈キー（defCache と同じ面。ADR-41 帰結） */
  private fineCache = new Map<string, BizFine>();
  /** external のスナップショット（ADR-46 判断 5）: 一評価一解決。キー＝定義側 premise#束縛#解決後 source
   *  ——with 派生・多文脈・修飾参照は同一スナップショットを見る。変換（錨打ち・covering 端）は
   *  defCache 側＝評価文脈ごと（リテラルの再錨と同型） */
  private socketCache = new Map<string, ExternalData>();
  /** 評価中の premise 束縛（external の合法位置の文脈。null＝本体層・top-level＝external 不可） */
  private externalCtx: { root: PremiseInstance; name: string } | null = null;
  /** filter 述語に流れている点列の整列（免除系 tz 検査の評価時近似＝ADR-36 改訂 2/ADR-40。
   *  点はデータを運ばない（ADR-30/33）ため、静的検査の近似として評価文脈で運ぶ） */
  private predicateAlign: GridTag | null = null;
  rt: Runtime;
  constructor(rt: Runtime) { this.rt = rt; }

  // ---------- プログラム ----------

  runProgram(program: Program, defaultMembers: Map<string, string | Expr>): RunResult['results'] {
    const results: RunResult['results'] = [];
    let env: Env = { rt: this.rt, premise: null, members: defaultMembers, locals: null, parent: null };

    const execStatements = (stmts: Statement[], env0: Env): Env => {
      let cur = env0;
      for (const st of stmts) {
        switch (st.t) {
          case 'premiseDef':
            this.registerPremise(st);
            break;
          case 'preamble': {
            const members = new Map(defaultMembers);
            let premise: PremiseInstance | null = null;
            if (st.name) {
              premise = this.rt.premises.get(st.name)
                ?? this.err(`未定義の premise: @${st.name}`);
              for (const [k, v] of premise.members) members.set(k, v);
            }
            if (st.members.some(m => m.key === 'epoch')) {
              this.err('epoch: は原始的定義のメンバー——利用側の前文には置けない（ADR-31）');
            }
            for (const m of st.members) members.set(m.key, m.value);
            const next: Env = { rt: this.rt, premise, members, locals: null, parent: null };
            if (st.block) { execStatements(st.block, next); }
            else cur = next;   // 次の前文まで以降の文を統べる（§3.2）
            break;
          }
          case 'binding': {
            if (CORE_WORDS.has(st.name)) this.err(`core 語 ${st.name} の再定義は静的エラー（§4.8）`);
            this.rt.topBindings.set(st.name, { params: st.params, rhs: st.rhs, covering: st.covering });
            this.scanVocab(st.rhs);
            break;
          }
          case 'streamExpr': {
            const v = this.evalExpr(st.expr, cur);
            const s = this.toStream(v);
            const trimmed = s.pts.filter(p => p >= this.rt.fromMs && p < this.rt.toMs);
            // 区間註釈は評価範囲 [from, to) にクリップして結果と同格に返す（表面で一度だけ＝ADR-37 判断 8）。
            // 表示形は閉端→半開端変換の ε（+1ms。輸送の依存像で生じる）を正規化する——正規化しないと
            // 真夜中の端が「2026-01-02T00:00」と印字され日付裸の端と不統一になる。fromMs/toMs は正確なまま
            const disp = (ms: number) => this.rt.fmt(ms % 1000 === 1 ? ms - 1 : ms);
            const annotations: ResultAnnotation[] = clipAnn(s.ann, this.rt.fromMs, this.rt.toMs).map(a => ({
              kind: 'out-of-coverage' as const,
              from: disp(a.from), to: disp(a.to), fromMs: a.from, toMs: a.to,
              source: a.source, covering: a.covering, ...(a.asof ? { asof: a.asof } : {}),
            }));
            results.push({ source: '', points: trimmed, dates: trimmed.map(p => this.rt.fmt(p)), annotations });
            break;
          }
        }
      }
      return cur;
    };
    execStatements(program.statements, env);
    return results;
  }

  registerPremise(st: Statement & { t: 'premiseDef' }) {
    const members = new Map<string, string | Expr>();
    const defs = new Map<string, BindingDecl>();
    let base: PremiseInstance | null = null;

    const absorb = (block: PremiseBlock) => {
      for (const m of block.members) members.set(m.key, m.value);
      for (const b of block.bindings) {
        if (CORE_WORDS.has(b.name)) this.err(`core 語 ${b.name} の再定義は静的エラー（§4.8）`);
        defs.set(b.name, { params: b.params, rhs: b.rhs, covering: b.covering });
        this.scanVocab(b.rhs);
      }
    };

    if (st.block) absorb(st.block);
    if (st.expr) {
      base = this.rt.premises.get(st.expr.base) ?? this.err(`未定義の premise: ${st.expr.base}`);
      if (st.expr.withBlock) absorb(st.expr.withBlock);
      for (const stage of st.expr.stages) {
        if (stage.name !== 'shiftBoundary') this.err(`premise 段 ${stage.name} は未対応（プロトタイプ）`);
        const { d, W, U } = this.shiftBoundaryArgs(stage);
        defs.set(W, this.expandShiftBoundary(base, d, W, U));
      }
    }
    // tz: 宣言必須の執行（ADR-35 判断 1 / ADR-37 判断 1・執行点＝宣言時）:
    // covering: または日付テーブルを持つ premise は、覆域の端と錨打ちの市民日が利用側 tz で
    // 動かないよう tz: を宣言する（base 連鎖の宣言でもよい＝member 解決規則で内側固定）
    if (!members.has('tz') && ![...(function* (b: PremiseInstance | null) {
      for (; b; b = b.base) yield b;
    })(base)].some(b => b.members.has('tz'))) {
      for (const [dn, decl] of defs) {
        if (this.hasDateTable(decl.rhs)) {
          this.err(`covering:/日付テーブルを持つ premise は tz: を宣言する（覆域の端と錨打ちの市民日の内側固定`
            + `——ADR-33/35/37）: ${st.name}（束縛 ${dn}）`);
        }
      }
    }
    // epoch: メンバー（ADR-31）——プロトタイプは言語既定（1970-01-01）のみ対応
    const epochE = members.get('epoch');
    if (epochE !== undefined) {
      const env: Env = { rt: this.rt, premise: null, members: new Map(), locals: null, parent: null };
      const v = typeof epochE === 'string' ? undefined : this.evalExpr(epochE, env);
      if (!(v && typeof v === 'object' && !Array.isArray(v) && v.k === 'point' && v.ms === this.rt.epoch)) {
        this.err('プロトタイプは既定紀元（1970-01-01）のみ対応（epoch: の別値は未実装。ADR-31）');
      }
    }
    this.rt.premises.set(st.name, new PremiseInstance(st.name, members, defs, base));
  }

  /** shiftBoundary(δ, on: W, unit: U) → W = U span (_ => k) phase: φ₀+δ（§3.7） */
  private shiftBoundaryArgs(stage: Stage): { d: number; W: string; U: string } {
    let d: number | undefined, W: string | undefined, U: string | undefined;
    for (const a of stage.args) {
      if (!a.name) d = this.constNum(a.value);
      else if (a.name === 'on') W = a.value.t === 'name' ? a.value.name : undefined;
      else if (a.name === 'unit') U = a.value.t === 'name' ? a.value.name : undefined;
    }
    if (d === undefined || !W || !U) this.err('shiftBoundary(δ, on: W, unit: U) の引数が不足');
    return { d: d!, W: W!, U: U! };
  }

  private expandShiftBoundary(base: PremiseInstance, d: number, W: string, U: string): BindingDecl {
    const def = base.findDef(W) ?? this.err(`shiftBoundary: base に窓 ${W} がない`);
    const rhs = def.rhs;
    if (rhs.t !== 'gen' || rhs.word !== 'span' || rhs.operand.t !== 'name' || rhs.operand.name !== U) {
      this.err(`shiftBoundary の射程外: base の ${W} は「${U} span (定数)」の形でない（§3.7）`);
    }
    const g = rhs as Extract<Expr, { t: 'gen' }>;
    const k = this.constLambdaValue(g.arg);
    const phi0 = g.named.phase ? this.constNum(g.named.phase) : 0;
    // 位相は k を法として合成（負の δ も正規化＝F65）。base の label: は保存する（ADR-34 帰結・§3.7）
    const named: Record<string, Expr> = { phase: { t: 'num', v: ((phi0 + d) % k + k) % k } };
    if (g.named.label) named.label = g.named.label;
    return {
      params: [],
      rhs: {
        t: 'gen', operand: { t: 'name', name: U }, word: 'span',
        arg: { t: 'lambda', params: ['_'], body: { t: 'num', v: k } },
        named,
      },
    };
  }

  private constNum(e: Expr): number {
    if (e.t === 'num') return e.v;
    if (e.t === 'neg') return -this.constNum(e.e);
    this.err('数値定数を期待');
  }
  private constLambdaValue(e: Expr): number {
    if (e.t === 'lambda' && e.body.t === 'num') return e.body.v;
    this.err('shiftBoundary の射程は k 定数の span のみ（§3.7）');
  }

  /** rhs が covering: つき、または日付要素を含むテーブルリテラルを含むか（tz: 必須の執行の判定）。
   *  external 束縛も対象（解決値 covering の端と kind: dates の錨は定義側 tz で解決——ADR-46 判断 4） */
  private hasDateTable(e: Expr | ListElem): boolean {
    if (!e || typeof e !== 'object') return false;
    if (isExternalCall(e)) return true;
    if (e.t === 'list') {
      if (e.covering) return true;
      if (e.elems.some(el => ('t' in el) && (el.t === 'date' || el.t === 'range'))) return true;
    }
    for (const v of Object.values(e)) {
      if (Array.isArray(v)) { if (v.some(x => x && typeof x === 'object' && this.hasDateTable(x as Expr))) return true; }
      else if (v && typeof v === 'object' && 't' in v && this.hasDateTable(v as Expr)) return true;
    }
    return false;
  }

  /** cycle のラベル列・labels: 列から列挙ラベル語彙を集める（名前解決のフォールバック用） */
  scanVocab(e: Expr | ListElem) {
    const visit = (x: Expr | ListElem) => {
      if (!x || typeof x !== 'object') return;
      if (x.t === 'gen' && x.word === 'cycle' && x.arg.t === 'list') {
        for (const el of x.arg.elems) if ('t' in el && el.t === 'name') this.rt.vocab.add(el.name);
      }
      if (x.t === 'list' && x.labels && x.labels.t === 'list') {
        for (const el of x.labels.elems) if ('t' in el && el.t === 'name') this.rt.vocab.add(el.name);
      }
      // segmentBy の labels: 引数（ADR-39）の列挙名も語彙に収集（named-arg の形で現れる）
      if (!('t' in x) && (x as any).name === 'labels' && (x as any).value?.t === 'list') {
        for (const el of (x as any).value.elems) {
          if ('t' in el && el.t === 'name') this.rt.vocab.add(el.name);
        }
      }
      // labels: cycle 形（ADR-47）の列挙名も同様に収集
      if (!('t' in x) && (x as any).name === 'labels' && (x as any).value?.t === 'cycleLabels'
        && (x as any).value.list?.t === 'list') {
        for (const el of (x as any).value.list.elems) {
          if ('t' in el && el.t === 'name') this.rt.vocab.add(el.name);
        }
      }
      for (const v of Object.values(x)) {
        if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v === 'object' && 't' in v) visit(v as Expr);
      }
    };
    visit(e);
  }

  // ---------- 名前解決（§3.4: premise 相対） ----------

  resolve(name: string, env: Env): V {
    // calendar: の在圏では bizDay は言語予約の導出名（手動束縛は静的エラー。ADR-35 判断 4）
    if (name === 'bizDay' && env.members.has('calendar')) {
      if (this.isBoundName('bizDay', env)) {
        this.err('calendar: の在圏では bizDay は言語予約の導出名——手動束縛は静的エラー（独自軸は別名で。ADR-35）');
      }
      return this.deriveBizDay(env);
    }
    // calendar: の在圏では bizOpen/bizClose も言語予約の導出名（細粒度の標準導出。ADR-41 判断 3）
    if ((name === 'bizOpen' || name === 'bizClose') && env.members.has('calendar')) {
      if (this.isBoundName(name, env)) {
        this.err(`calendar: の在圏では ${name} は言語予約の導出名——手動束縛は静的エラー（独自の列は別名で。ADR-41）`);
      }
      const fine = this.deriveBizFine(env);
      return name === 'bizOpen' ? fine.open : fine.close;
    }
    for (let e: Env | null = env; e; e = e.parent) {
      if (e.locals?.has(name)) return e.locals.get(name)!;
    }
    // 在圏 premise の公開語（機構 A: ルートは env.premise のまま）
    if (env.premise) {
      const def = env.premise.findDef(name);
      if (def) return this.evalDef(env.premise, name, def, env);
      const cs = this.calendarSystemOf(env);
      if (cs) {
        const def2 = cs.findDef(name);
        if (def2) return this.evalDef(cs, name, def2, env);
      }
    } else {
      const cs = this.calendarSystemOf(env);
      if (cs) {
        const def = cs.findDef(name);
        if (def) return this.evalDef(cs, name, def, env);
      }
    }
    // 前文メンバー（wkst 等の遅延解決。§3.6・§4.8）
    if (env.members.has(name)) {
      const m = env.members.get(name)!;
      return typeof m === 'string' ? m : this.evalExpr(m, env);
    }
    if (this.rt.topBindings.has(name)) {
      const b = this.rt.topBindings.get(name)!;
      if (b.params.length > 0) this.err(`${name} は引数付き束縛（呼び出しが必要）`);
      // top-level 束縛は external 不可（source: 統治が premise に要る。ADR-46）——premise 定義の
      // 評価中に参照されても文脈を継がない（合法位置のすり抜け防止）
      const prevCtx = this.externalCtx;
      this.externalCtx = null;
      let v: V;
      try { v = this.evalExpr(b.rhs, env); } finally { this.externalCtx = prevCtx; }
      if (isObj(v) && v.k === 'table' && !v.src) v = { ...v, src: name };   // 出自の焼印（ADR-37 判断 2）
      if (isObj(v) && v.k === 'windows' && !v.name) v = { ...v, name };     // 診断用の束縛名（ADR-42）
      if (b.covering) v = this.applyClaim(v, b.covering, name, env);        // 明示の被覆主張（判断 5）
      return v;
    }
    if (name === 'chronos') return { k: 'chronos' };
    if (name === 'everyDay') return this.everyDay(env);
    if (name === 'everyInstant') return { k: 'instant' };
    if (this.rt.vocab.has(name)) return name;   // 列挙ラベル（意味論で区別。§5.6 注記）
    this.err(`未解決の名前: ${name}（premise 相対解決 §3.4）`);
  }

  /** 名前が束縛（locals・premise 公開語・メンバー・top-level）として解決可能か（軸位置の曖昧性検出用） */
  private isBoundName(name: string, env: Env): boolean {
    if (this.lookupLocal(name, env) !== undefined) return true;
    if (env.premise?.findDef(name)) return true;
    const cs = this.calendarSystemOf(env);
    if (cs?.findDef(name)) return true;
    if (env.members.has(name)) return true;
    if (this.rt.topBindings.has(name)) return true;
    return false;
  }

  private calendarSystemOf(env: Env): PremiseInstance | null {
    const m = env.members.get('calendar-system');
    if (!m) return null;
    const name = typeof m === 'string' ? m : m.t === 'name' ? m.name : null;
    if (!name) return null;
    const inst = this.rt.premises.get(name) ?? null;
    // 逆向き正体判定: nonWorking を持つ premise は calendar-system: に立てない（ADR-35 判断 2）
    if (inst?.findDef('nonWorking')) {
      this.err(`calendar-system: にカレンダー実体は立てられない: ${name}（nonWorking を持つ premise。ADR-35 正体判定）`);
    }
    return inst;
  }

  /** member 解決規則（ADR-35 判断 8）: 定義側（root と base 連鎖）が宣言するメンバーは定義側の値で
   *  固定し、宣言しないメンバーだけ利用側で解決する（tz: の内側固定と wkst: の遅延解決が同居する形） */
  private overlayMembers(base: Map<string, string | Expr>, root: PremiseInstance): Map<string, string | Expr> {
    const chain: PremiseInstance[] = [];
    for (let p: PremiseInstance | null = root; p; p = p.base) chain.unshift(p);
    if (chain.every(p => p.members.size === 0)) return base;
    const m = new Map(base);
    for (const p of chain) for (const [k, v] of p.members) m.set(k, v);
    return m;
  }

  private memberStr(members: Map<string, string | Expr>, key: string): string {
    const m = members.get(key);
    if (m === undefined) return '';
    if (typeof m === 'string') return m;
    if (m.t === 'name') return m.name;
    if (m.t === 'str') return m.v;
    return JSON.stringify(m);   // その他の式も一意にキー化（'?' への潰しは衝突源。I6 の文脈キー）
  }

  /** premise 公開語の評価。裸名は root（利用側の premise）で再解決される＝機構 A。
   *  前文メンバーは定義側優先で上書き重ね（ADR-35 判断 8） */
  private evalDef(root: PremiseInstance, name: string, def: BindingDecl, env: Env): V {
    const members = this.overlayMembers(env.members, root);
    const defEnv: Env = { ...env, premise: root, members };
    this.checkExternalPositions(root, name, def);   // external の合法位置（ADR-46 判断 1）
    if (def.params.length > 0) {
      // 引数付き束縛は lambda 値として返す
      return { k: 'lambda', params: def.params.map(p => p.name), body: def.rhs, env: defEnv };
    }
    // asof/source をキーに含める（版差の誤共有防止——註釈が asof を運ぶ。ADR-37）
    const key = `${root.name}#${name}#`
      + ['wkst', 'tz', 'calendar-system', 'calendar', 'axis', 'roll', 'asof', 'source']
        .map(k => this.memberStr(members, k)).join('#');
    const hit = this.defCache.get(key);
    if (hit !== undefined) return hit;
    const prevCtx = this.externalCtx;
    this.externalCtx = { root, name };
    let v: V;
    try { v = this.evalExpr(def.rhs, defEnv); } finally { this.externalCtx = prevCtx; }
    if (isObj(v) && v.k === 'table' && !v.src) v = { ...v, src: `${root.name}.${name}` };  // 出自の焼印
    if (isObj(v) && v.k === 'windows' && !v.name) v = { ...v, name: `${root.name}.${name}` };  // 診断用の束縛名（ADR-42）
    if (def.covering) v = this.applyClaim(v, def.covering, `${root.name}.${name}`, defEnv); // 被覆主張
    this.defCache.set(key, v);
    return v;
  }

  /** 明示の被覆主張（ADR-37 判断 5）: 成分由来の註釈をこの束縛の主張の補集合で置き換える
   *  （相殺の唯一の口）。必要条件検査: 主張範囲 ⊆（成分の covering の和 ∪ 註釈区間の補集合）
   *  ——規則ベースの成分（註釈なし）は補集合側が全時間を語る */
  private applyClaim(v: V, claim: CoveringRange[], source: string, env: Env): V {
    if (isObj(v) && v.k === 'lambda') this.err(`被覆主張は引数なしの束縛にのみ付く: ${source}（ADR-37）`);
    const { iv, desc, concluded } = this.resolveCovering(claim, env);
    const s = this.toStream(v);
    const spoken = mergeIv([
      ...complementIv(s.ann.map(a => ({ start: a.from, end: a.to }))),
      ...s.ann.flatMap(a => a.covIv),
    ]);
    for (const c of iv) {
      if (!ivCovers(spoken, c)) {
        this.err(`被覆主張が成分覆域を越える: ${source} covering ${desc}`
          + `——どの成分も語れない区間の完全性は主張できない（必要条件・ADR-37 判断 5）`);
      }
    }
    const asof = this.asofOf(env.members);
    const ann: Ann[] = complementIv(iv).map(x => ({
      from: x.start, to: x.end, source, covering: desc, covIv: iv, ...(asof ? { asof } : {}),
    }));
    this.registerCoverage(source, desc, iv, concluded, asof);   // 主張は被覆サマリに常時表示
    return { ...s, ann };
  }

  /** external の合法位置の静的検査（ADR-46 判断 1）: premise 束縛の rhs 自身または pipe の先頭のみ。
   *  引数つき束縛・深い位置（ラムダ内・引数内・結合子の枝）は静的エラー */
  private checkExternalPositions(root: PremiseInstance, name: string, def: BindingDecl): void {
    const legal = new Set<unknown>();
    if (isExternalCall(def.rhs)) legal.add(def.rhs);
    if (def.rhs.t === 'pipe' && isExternalCall(def.rhs.head)) legal.add(def.rhs.head);
    let found = false;
    const walk = (x: unknown): void => {
      if (!x || typeof x !== 'object') return;
      if (isExternalCall(x)) {
        found = true;
        if (!legal.has(x)) {
          this.err(`external は premise 束縛の右辺の先頭でのみ書ける: ${root.name}.${name}`
            + '（合成は external(…) |> … の形・本体層/ラムダ内/引数位置は不可。ADR-46）');
        }
      }
      for (const v of Object.values(x)) {
        if (Array.isArray(v)) v.forEach(walk);
        else walk(v);
      }
    };
    walk(def.rhs);
    if (found && def.params.length > 0) {
      this.err(`external は引数なしの束縛にのみ書ける: ${root.name}.${name}（ADR-46）`);
    }
  }

  /** 外部供給宣言 external（ADR-46）: 実行時に解決されるテーブルリテラル。宣言（kind・labels 値域・
   *  source）が字面の代役＝静的知識を先取りし、解決値にリテラルと同一の統治検査を課す */
  private evalExternal(e: Extract<Expr, { t: 'call' }>, env: Env): V {
    const ctx = this.externalCtx;
    if (!ctx) {
      this.err('external は premise 束縛の右辺（先頭）でのみ書ける'
        + '（source: 統治が premise に要る——本体層・top-level 束縛は不可。ADR-46）');
    }
    // 宣言の構造読み（kind 値・labels 値域は評価しない——位置依存のキーワード解釈＝ADR-42 の統一原理）
    let kind: 'dates' | 'instants' | undefined;
    let declLabels: string[] | undefined;
    let srcOverride: string | undefined;
    for (const a of e.args) {
      if (!a.name) this.err('external は named-arg のみを取る（kind: が必須。ADR-46）');
      if (a.name === 'kind') {
        if (a.value.t !== 'name' || (a.value.name !== 'dates' && a.value.name !== 'instants')) {
          this.err('external の kind: は dates | instants（整列の主張＝字面クラスの宣言。ADR-46）');
        }
        kind = a.value.name as 'dates' | 'instants';
      } else if (a.name === 'labels') {
        if (a.value.t !== 'list') this.err('external の labels: はラベル値域の列挙リスト（ADR-46）');
        declLabels = a.value.elems.map(el =>
          ('t' in el && el.t === 'name') ? el.name : this.err('external の labels: の要素はラベル名'));
        if (declLabels.length === 0) this.err('external の labels: は空にできない（無宣言＝ラベルなし。ADR-46）');
      } else if (a.name === 'source') {
        const v = this.evalExpr(a.value, env);
        if (typeof v !== 'string') this.err(`external の source: は文字列リテラル: ${kindOf(v)}`);
        srcOverride = v;
      } else {
        this.err(`external の未知の引数: ${a.name}:（黙って捨てない——ADR-39/46）`);
      }
    }
    if (!kind) this.err('external は kind: が必須（dates | instants＝整列の主張。ADR-46）');
    const owner = ctx.root.findDefOwner(ctx.name)?.owner ?? ctx.root;
    const source = srcOverride ?? this.memberStr(env.members, 'source');
    if (!source) {
      this.err(`external は source: が必須（premise メンバーまたは named-arg。ADR-46）: ${owner.name}.${ctx.name}`);
    }
    // スナップショット（判断 5）: 一評価一解決——キー＝定義側 premise#束縛#解決後 source
    const snapKey = `${owner.name}#${ctx.name}#${source}`;
    let data = this.socketCache.get(snapKey);
    if (data === undefined) {
      const decl: ExternalDecl = { kind, ...(declLabels ? { labels: declLabels } : {}), source };
      if (!this.rt.resolver) {
        throw new SupplyError(`供給エラー: 解決子がない——external ${owner.name}.${ctx.name}`
          + `（source: "${source}"）は解決できない（ADR-46 判断 7 (a)）`);
      }
      try {
        data = this.rt.resolver(owner.name, ctx.name, decl);
      } catch (err) {
        if (err instanceof KairosError) throw err;
        throw new SupplyError(`供給エラー: 解決に失敗——external ${owner.name}.${ctx.name}`
          + `（source: "${source}"）: ${(err as Error).message}`);
      }
      if (!data) {
        throw new SupplyError(`供給エラー: 解決値が無い——external ${owner.name}.${ctx.name}（source: "${source}"）`);
      }
      this.socketCache.set(snapKey, data);
    }
    return this.externalToTable(owner, ctx.name, kind, declLabels, data, env);
  }

  /** 解決値→テーブル値の変換と契約検査（ADR-46 判断 6。リテラルと同一の統治・文言体系） */
  private externalToTable(owner: PremiseInstance, name: string, kind: 'dates' | 'instants',
                          declLabels: string[] | undefined, data: ExternalData, env: Env): TableV {
    const src = `${owner.name}.${name}`;
    if (typeof data.covering !== 'string' || data.covering.trim() === '') {
      this.err(`契約違反: covering がない——external ${src}（解決値は覆域の主張を必ず運ぶ。ADR-46）`);
    }
    let claim: CoveringRange[];
    try {
      claim = parseCoveringText(data.covering);
    } catch (err) {
      this.err(`契約違反: covering が読めない——external ${src}: ${(err as Error).message}`);
    }
    const r = this.resolveCovering(claim, env);
    if (typeof data.asof !== 'string' || data.asof.trim() === '') {
      this.err(`契約違反: asof がない——external ${src}（データの観測日はデータと一緒に来る。ADR-46）`);
    }
    let asof = data.asof;
    const staticAsof = this.asofOf(env.members);
    if (staticAsof && staticAsof !== 'latest' && staticAsof !== asof) {
      asof = `${asof}（宣言 asof ${staticAsof} と不一致）`;   // 黙って上書きしない——被覆サマリ・註釈に常時表示
    }
    let pts: number[];
    if (kind === 'dates') {
      if (!Array.isArray(data.dates)) {
        this.err(`契約違反: kind: dates の解決値は dates（"YYYY-MM-DD" の列）を運ぶ——external ${src}`);
      }
      if (data.instants) this.err(`契約違反: kind: dates に instants が来た——external ${src}`);
      const tz = this.tzObjOf(env);   // 定義側 tz（覆域端と同じ解決＝判断 4）で錨打ち——派生の tz 上書きで再錨可能
      pts = data.dates.map(s => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s))
          ?? this.err(`契約違反: 日付の形式が不正——external ${src}: ${s}（"YYYY-MM-DD"）`);
        const y = +m[1], mo = +m[2], d = +m[3];
        if (!isRealDate(y, mo, d)) {
          this.err(`契約違反: 実在しない日付——external ${src}: ${s}`
            + '（黙ったロールオーバーの封止＝ADR-43 の字句検査の解決値向け再執行。ADR-46）');
        }
        return tz.civilDayStart(y, mo, d);
      });
    } else {
      if (!Array.isArray(data.instants)) {
        this.err(`契約違反: kind: instants の解決値は instants（epoch ms の列）を運ぶ——external ${src}`);
      }
      if (data.dates) this.err(`契約違反: kind: instants に dates が来た——external ${src}`);
      for (const v of data.instants) {
        if (typeof v !== 'number' || !Number.isInteger(v)) {
          this.err(`契約違反: instants は有限整数の epoch ms——external ${src}: ${v}`);
        }
      }
      pts = data.instants.slice();
    }
    for (let i = 1; i < pts.length; i++) {
      if (pts[i] <= pts[i - 1]) this.err(`契約違反: 解決値は昇順・重複なし——external ${src}（§3.8 と同じ整列則）`);
    }
    for (const p of pts) {
      if (!ivContainsPoint(r.iv, p)) {
        this.err(`契約違反: 解決値の点が covering の外——external ${src}: ${this.rt.fmt(p)}`
          + '（列の全要素は covering に包含——ADR-37 判断 1）');
      }
    }
    let labels: string[] | undefined;
    if (declLabels) {
      if (!Array.isArray(data.labels)) this.err(`契約違反: labels 宣言つきの external にラベルが来ない——${src}`);
      if (data.labels.length !== pts.length) this.err(`契約違反: labels は時点列と同長——external ${src}（ADR-30）`);
      for (const l of data.labels) {
        if (!declLabels.includes(l)) {
          this.err(`契約違反: 宣言値域の外のラベル——external ${src}: ${l}（域外の封止＝ADR-42 判断 7 の契約版）`);
        }
      }
      labels = data.labels.slice();
    } else if (data.labels) {
      this.err(`契約違反: labels 無宣言の external にラベルが来た——${src}（黙って捨てない＝ADR-39 の統治）`);
    }
    // 整列は宣言から静的に決まる（空でも宣言どおり＝ADR-46 判断 2。dates の目盛り所属は錨打ちの構成で保証）
    const align = kind === 'dates' ? this.dayGrain(env) : null;
    return { k: 'table', pts, labels, covIv: r.iv, covDesc: r.desc, concluded: r.concluded, asof, src, align };
  }

  /** asof: メンバーの表示形（註釈・被覆サマリの属性） */
  private asofOf(members: Map<string, string | Expr>): string | undefined {
    const m = members.get('asof');
    if (m === undefined) return undefined;
    if (typeof m === 'string') return m;
    if (m.t === 'date') return this.rt.fmt(this.rt.dateToMs(m.v));
    if (m.t === 'str') return m.v;
    if (m.t === 'name') return m.name;
    return JSON.stringify(m);
  }

  /** 被覆サマリへの登録（ADR-37 判断 7 (b)）: 評価が参照した各データ源・被覆主張 */
  private registerCoverage(source: string, covDesc: string, covIv: Iv[], concluded: boolean, asof?: string) {
    const key = `${source}#${covDesc}#${asof ?? ''}`;
    if (this.rt.coverage.has(key)) return;
    const covEnd = covIv.length ? Math.max(...covIv.map(x => x.end)) : Infinity;
    this.rt.coverage.set(key, { source, covering: covDesc, ...(asof ? { asof } : {}), concluded, covEnd });
  }

  /** テーブルの範囲外註釈＝覆域の補集合（ADR-37 判断 1: 値は列が決め、註釈は covering が決める） */
  private tableAnn(t: TableV): Ann[] {
    const src = t.src ?? '(無名テーブル)';
    return complementIv(t.covIv).map(x => ({
      from: x.start, to: x.end, source: src, covering: t.covDesc, covIv: t.covIv,
      ...(t.asof ? { asof: t.asof } : {}),
    }));
  }

  /** 窓相当の値の註釈（窓列の実効被覆域の補集合）。生成語の windows（暦法純粋）は無註釈 */
  private winAnnOfV(v: V): Ann[] {
    if (isObj(v) && v.k === 'stream' && v.wins.length > 0) return v.wins[v.wins.length - 1].ann;
    return [];
  }

  /** 窓リーダーの覆域検査（ADR-37 判断 4/6・F82）: 点が窓に解決できても、その窓が窓列自身の
   *  註釈区間（マーカー覆域の補集合）に交差するなら窓境界そのものが未知——証人・序数の判定
   *  以前に範囲外へ分類する（過小近似は不可。合成マーカー（openTick | closeTick 級）の帯が
   *  覆域の尽きた側で黙って 24 時間帯化して読まれる欠陥の封止） */
  private winCovOrOut(win: Iv, ann: Ann[], what: string): void {
    const overlap = ann.filter(a => a.from < win.end && win.start < a.to);
    if (overlap.length === 0) return;
    const a = overlap[0];
    throw new OutOfCoverageSignal(
      `範囲外（out-of-coverage）: ${what}の窓 [${this.rt.fmt(Math.max(win.start, -8.64e15))}, `
      + `${this.rt.fmt(Math.min(win.end, 8.64e15))}) はマーカー覆域の外に掛かり境界が未知`
      + `（${a.source} covering ${a.covering}${a.asof ? `, asof ${a.asof}` : ''}——ADR-37 判断 4/6・F82）`,
      overlap, win);
  }

  /** 分類器（ADR-37 判断 6）: 失敗点が依存の実効被覆域の外＝註釈区間の内なら範囲外シグナル・
   *  内（覆域内の失敗）なら従来どおり硬エラー（取り違え＝ADR-16 の統治のまま） */
  private outOrErr(ms: number, depAnn: Ann[], hardMsg: string): never {
    const hit = annAt(depAnn, ms);
    if (hit.length > 0) {
      const a = hit[0];
      throw new OutOfCoverageSignal(
        `範囲外（out-of-coverage）: 参照点 ${this.rt.fmt(ms)} は ${a.source} の実効被覆域の外`
        + `（covering ${a.covering}${a.asof ? `, asof ${a.asof}` : ''}——判定は外部・ADR-37）`, hit);
    }
    this.err(hardMsg);
  }

  private everyDay(env: Env): StreamV {
    const day = this.resolve('day', env);
    if (kindOf(day) !== 'windows') this.err('everyDay: 在圏暦法に day がない');
    const dw = day as WindowsV;
    return { k: 'stream', pts: dw.units.slice(), wins: [], align: dw.grain, ann: [], endless: true };
  }

  /** 在圏 tz 名（ADR-36 判断 6: リテラル文字列の等値）。未宣言は実行既定 tz へフォールバック */
  private tzNameOf(env: Env): string {
    return this.memberStr(env.members, 'tz') || this.rt.tzName;
  }

  /** 在圏 tz の幾何（ADR-33 射影パラメータモデル）——タグの tz 名と実グリッドはここで一致する */
  private tzObjOf(env: Env): Tz {
    return getTz(this.tzNameOf(env));
  }

  /** 日付・時刻リテラルの錨打ち（在圏 tz。ADR-33）: 日付のみ＝市民日の最初の瞬間・
   *  時刻付きで DST の隙間（存在しない時刻）・重複（二意の時刻）は明示エラー */
  private anchorDate(d: DateVal, env: Env): number {
    const tz = this.tzObjOf(env);
    if (!d.hasTime) return tz.civilDayStart(d.y, d.mo, d.d);
    const local = Date.UTC(d.y, d.mo - 1, d.d, d.h, d.mi, Math.floor(d.s), Math.round((d.s % 1) * 1000));
    const a = tz.anchor(local);
    const p = (n: number) => String(n).padStart(2, '0');
    const lit = `${d.y}-${p(d.mo)}-${p(d.d)}T${p(d.h)}:${p(d.mi)}`;
    if (a.kind === 'gap') {
      this.err(`存在しない時刻: ${lit}（tz "${tz.name}" の DST の隙間に落ちる——実在の壁時計で書く。ADR-33）`);
    }
    if (a.kind === 'overlap') {
      this.err(`二意の時刻: ${lit}（tz "${tz.name}" の DST の重複に落ちる——解決規約は将来の opt-in。ADR-33）`);
    }
    return a.ms;
  }

  /** 市民日グリッド（1d・既定整列・在圏 tz）——テーブル・day 原子の整列の既定形 */
  private dayGrain(env: Env): GridTag {
    return { kind: 'civil', step: 1, phase: 0, off: 0, tz: this.tzNameOf(env) };
  }

  /** 整列の検査（ADR-36 判断 3）: 等値所属の両辺は同一 G を要求 */
  private checkAlign(input: GridTag | null, axis: GridTag | null, ctx: string): void {
    if (!gridEq(input, axis)) {
      this.err(`${ctx}: 両辺の整列が同一でない——点の等値所属が黙って空振りする形（ADR-36）。`
        + `入力=${gridDesc(input)}・軸/右辺=${gridDesc(axis)}。同じ点が意図なら snapTo で明示的に整合する`
        + `（同じ所属〈日〉が意図なら coincides。ADR-38）`);
    }
  }

  /** 免除系の tz 名検査（ADR-36 改訂 2・ADR-40 判断 6）: 区間所属は幅・位相を問わない（免除は維持）が、
   *  tz 名だけは日付座標系そのもの——市民グリッド入力 × 市民の窓要素グリッドの不一致は
   *  「ラベル 1 日ずれの束ね・曜日読み」が黙って通る形なので静的エラー。snapTo は除外（chronos 所属） */
  private checkTzMembership(input: GridTag | null | undefined, win: GridTag | null | undefined, ctx: string): void {
    if (input && input.kind === 'civil' && input.tz && win && win.kind === 'civil' && win.tz
      && input.tz !== win.tz) {
      this.err(`${ctx}: 入力と窓の tz 名が不一致（入力="${input.tz}"・窓="${win.tz}"）——ラベル 1 日ずれの`
        + `所属が黙って通る形（ADR-36 改訂 2/ADR-40）。同じ日付の所属が意図なら rebase(to: "${win.tz}") で再錨する`);
    }
  }

  /** 軸位置の名前の評価（ADR-35 判断 4）: 束縛は通常解決・premise 名だけならカレンダー実体の
   *  読み替え（標準導出 bizDay）・両方に解決できる名前は曖昧＝静的エラー */
  private evalAxis(e: Expr, env: Env): V {
    if (e.t === 'name' && this.rt.premises.has(e.name)) {
      if (this.isBoundName(e.name, env)) {
        this.err(`軸位置の名前 ${e.name} は束縛にも premise 名にも解決できて曖昧（ADR-35/17）`);
      }
      return this.deriveBizDay(env, this.rt.premises.get(e.name)!);
    }
    return this.evalExpr(e, env);
  }

  /** 在圏 calendar: の実体の解決（deriveBizDay / deriveBizFine の共通部） */
  private calendarEntity(env: Env, what: string): PremiseInstance {
    const m = env.members.get('calendar');
    if (m === undefined) this.err(`${what}: 在圏に calendar: がない（前文で宣言する。§3.3/§3.9）`);
    const name = typeof m === 'string' ? m : m.t === 'name' ? m.name : null;
    if (!name) this.err('calendar: はカレンダー実体（premise 名）を取る（ADR-35）');
    return this.rt.premises.get(name) ?? this.err(`calendar: が指す premise が未定義: ${name}`);
  }

  /** bizDay 標準導出（ADR-35 判断 3/4）: everyDay \ C.nonWorking——everyDay は在圏解決・
   *  C.nonWorking は C にピン（member 解決規則で内側固定）。正体判定込み */
  private deriveBizDay(env: Env, entity?: PremiseInstance): StreamV {
    const ent = entity ?? this.calendarEntity(env, 'bizDay');
    // 正体判定（ADR-35 判断 2。実体としての初回使用時に走る）
    const nw = ent.findDef('nonWorking')
      ?? this.err(`カレンダー実体ではない: ${ent.name}（公開語 nonWorking を持たない。ADR-35 正体判定）`);
    if (nw.params.length > 0) this.err(`正体判定: nonWorking は引数なしの束縛（ADR-35）: ${ent.name}`);
    const entMembers = this.overlayMembers(new Map(), ent);
    if (!entMembers.has('tz')) {
      this.err(`正体判定: カレンダー実体は tz: を宣言する（内側固定の執行点。ADR-33/35）: ${ent.name}`);
    }
    if (this.derivingEntities.has(ent.name)) {
      this.err(`カレンダー実体の循環（自己・相互参照）: ${ent.name}（ADR-35 判断 8）`);
    }
    // 導出のメモ化（公開語の defCache と同じ文脈キー）: 述語内の bizDay 参照（coincides 等）が
    // 評価点ごとに再導出して二次コストになるのを防ぐ
    const cacheKey = `bizDay⌗${ent.name}⌗`
      + ['wkst', 'tz', 'calendar-system', 'calendar', 'axis', 'roll', 'asof', 'source']
        .map(k => this.memberStr(env.members, k)).join('#');
    const hit = this.defCache.get(cacheKey);
    if (hit !== undefined) return hit as StreamV;
    this.derivingEntities.add(ent.name);
    try {
      const nwV = this.toStream(this.evalDef(ent, 'nonWorking', nw, env) as V);
      // 正体判定: nonWorking は実体 tz の市民日グリッドに整列（「日粒度で読む」の操作的定義）
      const entDay: GridTag = { kind: 'civil', step: 1, phase: 0, off: 0,
        tz: this.memberStr(this.overlayMembers(env.members, ent), 'tz') || this.rt.tzName };
      if (!gridEq(nwV.align, entDay)) {
        this.err(`正体判定: nonWorking は実体 tz の市民日グリッドに整列する（ADR-35。細粒度は別の束縛に）: `
          + `${ent.name} の nonWorking の整列=${gridDesc(nwV.align)}`);
      }
      const every = this.everyDay(env);
      this.checkAlign(every.align, nwV.align, `bizDay 標準導出（everyDay \\ ${ent.name}.nonWorking）`);
      // 差 \ は両辺の註釈の和（ADR-35 判断 3 / ADR-37）: 祝日データの尽きた先の退化は、するが観測可能
      const v: StreamV = { k: 'stream', pts: ptDiff(every.pts, nwV.pts), wins: [], align: every.align,
                           ann: annUnion(every.ann, nwV.ann), endless: true };
      this.defCache.set(cacheKey, v);
      return v;
    } finally {
      this.derivingEntities.delete(ent.name);
    }
  }

  /** 細粒度標準導出（ADR-41）: bizOpen・bizClose・isOpen の共通実体化。評価は実体相対
   *  （判断 3）——C の env（member 解決＝定義側優先・ADR-35 判断 8）で C.sessionOpens・C.sessionCloses・
   *  C.nonWorking・C.everyDay を読む。対宣言と整合性の検査は細粒度導出の初回使用時 */
  private deriveBizFine(env: Env): BizFine {
    const ent = this.calendarEntity(env, '細粒度導出（bizOpen/bizClose/isOpen）');
    // 正体判定（ADR-35 判断 2）
    if (!ent.findDef('nonWorking')) {
      this.err(`カレンダー実体ではない: ${ent.name}（公開語 nonWorking を持たない。ADR-35 正体判定）`);
    }
    if (!this.overlayMembers(new Map(), ent).has('tz')) {
      this.err(`正体判定: カレンダー実体は tz: を宣言する（内側固定の執行点。ADR-33/35）: ${ent.name}`);
    }
    // 供給規約＝対宣言（ADR-41 判断 1）: with 派生は継承込みで判定（findDef が base 連鎖を辿る）
    const opensDef = ent.findDef('sessionOpens');
    const closesDef = ent.findDef('sessionCloses');
    if (!opensDef && !closesDef) {
      this.err(`実体 ${ent.name} は sessionOpens/sessionCloses を宣言していない`
        + `——細粒度導出（bizOpen/bizClose/isOpen）は静的エラー（ADR-41）`);
    }
    if (!opensDef || !closesDef) {
      this.err(`sessionOpens/sessionCloses は対で宣言する——実体 ${ent.name} は ${opensDef ? 'sessionOpens' : 'sessionCloses'} だけ`
        + `（片方だけは静的エラー・with 派生は継承込みで判定。ADR-41）`);
    }
    if (opensDef.params.length > 0 || closesDef.params.length > 0) {
      this.err(`sessionOpens/sessionCloses は引数なしの時間ストリーム束縛（ADR-41）: ${ent.name}`);
    }
    // メモ化は実体名＋文脈キー（定義側優先で重ねたメンバー。defCache と同じ面——ADR-41 帰結）
    const entMembers = this.overlayMembers(env.members, ent);
    const key = `bizFine⌗${ent.name}⌗`
      + ['wkst', 'tz', 'calendar-system', 'calendar', 'axis', 'roll', 'asof', 'source']
        .map(k => this.memberStr(entMembers, k)).join('#');
    const hit = this.fineCache.get(key);
    if (hit) return hit;
    if (this.derivingEntities.has(ent.name)) {
      this.err(`カレンダー実体の循環（自己・相互参照）: ${ent.name}`
        + `（ADR-35 判断 8——導出鎖 isOpen → bizOpen → nonWorking 越しも検査）`);
    }
    this.derivingEntities.add(ent.name);
    try {
      const entEnv: Env = { ...env, premise: ent, members: entMembers };
      const entTz = this.tzObjOf(entEnv);
      // 実体相対の評価（判断 3）: 点は実体 tz の市民座標の事実（ADR-33 判断 10 の内側固定）
      const opensS = this.toStream(this.evalDef(ent, 'sessionOpens', opensDef, env));
      const closesS = this.toStream(this.evalDef(ent, 'sessionCloses', closesDef, env));
      const nwS = this.toStream(this.evalDef(ent, 'nonWorking', ent.findDef('nonWorking')!, env));
      const entDay: GridTag = { kind: 'civil', step: 1, phase: 0, off: 0, tz: entTz.name };
      if (!gridEq(nwS.align, entDay)) {
        this.err(`正体判定: nonWorking は実体 tz の市民日グリッドに整列する（ADR-35。細粒度は sessionOpens/sessionCloses に）: `
          + `${ent.name} の nonWorking の整列=${gridDesc(nwS.align)}`);
      }
      const every = this.everyDay(entEnv);
      const bizDays = new Set(ptDiff(every.pts, nwS.pts));   // C の営業日＝C.everyDay \ C.nonWorking
      const dayAnn = annUnion(every.ann, nwS.ann);
      const markerAnn = annUnion(opensS.ann, closesS.ann);
      // 整合性検査（判断 2）: 初回使用時・データ相対の層
      this.checkAlternation(ent, opensS.pts, closesS.pts, markerAnn);
      // セッション断片の構築: 開場マーカーごとの半開区間 [open, close)。同時刻の open/close は
      // 両点保持——順序は文脈で一意（直前が open 状態なら close→open＝連続営業・closed 状態なら
      // open→close＝幅 0 セッション＝空）。落ちた断片（開場日が非営業日）も isOpen の偽の材料に保持
      const segIv: Iv[] = [];
      const segDayStart: number[] = [];
      const segKept: boolean[] = [];
      const closeSet = new Set<number>();      // 断片を閉じた実 close（bizClose の候補）
      let since = -1;                          // 現セッションの開場点（-1＝閉場中）
      let sinceDay = 0;
      const push = (end: number) => {
        if (end > since) {                     // 幅 0 のセッションは空（区間の和に現れない。判断 2）
          segIv.push({ start: since, end });
          segDayStart.push(sinceDay);
          segKept.push(bizDays.has(sinceDay));
        }
      };
      let i = 0, j = 0;
      while (i < opensS.pts.length || j < closesS.pts.length) {
        const to = i < opensS.pts.length ? opensS.pts[i] : Infinity;
        const tc = j < closesS.pts.length ? closesS.pts[j] : Infinity;
        if (to === tc) {
          // 同時刻対: 開場中なら close→open（断片を切って即開く＝連続営業）・閉場中なら幅 0
          if (since >= 0) { push(to); closeSet.add(to); since = to; sinceDay = entTz.floorToDay(to); }
          i++; j++;
        } else if (to < tc) {
          if (since < 0) { since = to; sinceDay = entTz.floorToDay(to); }   // 交互破れは検査済み
          i++;
        } else {
          if (since >= 0) { push(tc); closeSet.add(tc); since = -1; }
          j++;
        }
      }
      if (since >= 0) push(this.rt.computeEnd);   // 尾の孤立 open（切り欠き）＝実体化端まで開く
      // bizOpen＝営業日の開場点（判断 3。帰属は開場日固定——実体 tz の市民日で読む）
      const bizOpens = opensS.pts.filter(o => bizDays.has(entTz.floorToDay(o)));
      // bizClose＝bizOpen セッションの併合区間の和の右端（接する断片は融合・実体化端の仮端は除く）
      const bizCloses = mergeIv(segIv.filter((_, k) => segKept[k]))
        .map(x => x.end).filter(e2 => closeSet.has(e2));
      const ann = annUnion(markerAnn, dayAnn);   // 導出は sessionOpens/sessionCloses/nonWorking の註釈に依存（判断 3）
      const fine: BizFine = {
        open: { k: 'stream', pts: bizOpens, wins: [], align: null, ann, endless: opensS.endless },
        close: { k: 'stream', pts: bizCloses, wins: [], align: null, ann, endless: closesS.endless },
        segIv, segDayStart, segKept,
        markers: ptUnion(opensS.pts, closesS.pts), markerAnn, dayAnn,
      };
      this.fineCache.set(key, fine);
      return fine;
    } finally {
      this.derivingEntities.delete(ent.name);
    }
  }

  /** 整合性検査（ADR-41 判断 2）: マーカー列（sessionOpens/sessionCloses の成分別の素性つきマージ）の局所交互。
   *  定義域＝結合実効被覆域（両ストリームの註釈区間の補集合）∩ 実体化範囲——註釈区間は未知で
   *  あって違反ではない。定義域の頭の孤立 close・尾の孤立 open は切り欠きとして合法。
   *  同時刻の open/close は両点保持——順序は文脈で一意なので状態を変えない。層はデータ相対 */
  private checkAlternation(ent: PremiseInstance, sessionOpens: number[], sessionCloses: number[], markerAnn: Ann[]) {
    const domain = complementIv(markerAnn.map(a => ({ start: a.from, end: a.to })))
      .map(x => ({ start: Math.max(x.start, this.rt.epoch), end: Math.min(x.end, this.rt.computeEnd) }))
      .filter(x => x.start < x.end);
    for (const D of domain) {
      let state: 'open' | 'closed' | null = null;   // 定義域の頭は不定（切り欠き許容）
      let i = ptUpperBound(sessionOpens, D.start - 1);
      let j = ptUpperBound(sessionCloses, D.start - 1);
      for (;;) {
        const to = i < sessionOpens.length && sessionOpens[i] < D.end ? sessionOpens[i] : Infinity;
        const tc = j < sessionCloses.length && sessionCloses[j] < D.end ? sessionCloses[j] : Infinity;
        if (to === Infinity && tc === Infinity) break;
        if (to === tc) { i++; j++; continue; }      // 同時刻対＝close→open か open→close（状態不変）
        if (to < tc) {
          if (state === 'open') {
            this.err(`カレンダー実体 ${ent.name} の開場列/閉場列の交互が破れている: `
              + `${this.rt.fmt(to)} の open の直前のマーカーも open`
              + `（sessionOpens/sessionCloses は半開区間の列を定める——データ相対エラー・ADR-41 判断 2）`);
          }
          state = 'open'; i++;
        } else {
          if (state === 'closed') {
            this.err(`カレンダー実体 ${ent.name} の開場列/閉場列の交互が破れている: `
              + `${this.rt.fmt(tc)} の close の直前のマーカーも close`
              + `（sessionOpens/sessionCloses は半開区間の列を定める——データ相対エラー・ADR-41 判断 2）`);
          }
          state = 'closed'; j++;
        }
      }
    }
  }

  /** isOpen(t) の判定（ADR-41 判断 3）: t が bizOpen セッションの半開区間の和に入るか。
   *  覆域は証人規則の三分岐——真偽が sessionOpens/sessionCloses/nonWorking の註釈区間に依存するなら範囲外
   *  （filter 文脈は落として註釈・純値文脈は明示エラー。ADR-37 判断 6 の分類器と同じ層） */
  private isOpenAt(ms: number, env: Env): boolean {
    const f = this.deriveBizFine(env);
    const k = ivIndexOf(f.segIv, ms);
    if (k >= 0) {
      // セッション断片内: 判定材料＝[開場点, t] のマーカー既知性・開場日の営業日性
      const o = f.segIv[k].start;
      const hit = [
        ...f.markerAnn.filter(a => a.from <= ms && a.to > o),
        ...annAt(f.dayAnn, f.segDayStart[k]),
      ];
      if (hit.length > 0) this.openOut(ms, hit);
      return f.segKept[k];
    }
    // セッション外: 直前の既知マーカー〜t に未知のマーカー（註釈区間）が挟まらなければ閉場で確定
    const j = ptUpperBound(f.markers, ms) - 1;
    const lo = j >= 0 ? f.markers[j] : this.rt.epoch;   // 実体化の頭は閉扱い（頭の切り欠き＝保守側）
    const hit = f.markerAnn.filter(a => a.from <= ms && a.to > lo);
    if (hit.length > 0) this.openOut(ms, hit);
    return false;
  }

  /** isOpen の範囲外シグナル（ADR-41 判断 3 の範囲外側・ADR-37 の分類器の流儀） */
  private openOut(ms: number, hit: Ann[]): never {
    const a = hit[0];
    throw new OutOfCoverageSignal(
      `範囲外（out-of-coverage）: isOpen の判定点 ${this.rt.fmt(ms)} は ${a.source} の実効被覆域に依存する`
      + `（covering ${a.covering}${a.asof ? `, asof ${a.asof}` : ''}——判定は外部・ADR-41/ADR-37）`, hit);
  }

  // ---------- 式 ----------

  evalExpr(e: Expr, env: Env): V {
    switch (e.t) {
      case 'num': return e.v;
      case 'str': return e.v;
      case 'name': return this.resolve(e.name, env);
      case 'qualified': {
        const inst = this.rt.premises.get(e.ns) ?? this.err(`未定義の premise: ${e.ns}`);
        const def = inst.findDef(e.name) ?? this.err(`${e.ns}.${e.name} は未定義`);
        return this.evalDef(inst, e.name, def, env);   // 修飾参照は base 値にピン（機構 A）
      }
      case 'date': return { k: 'point', ms: this.anchorDate(e.v, env) };   // 錨打ちは在圏 tz（ADR-33）
      case 'width': return { k: 'width', w: e.v };
      case 'lambda': return { k: 'lambda', params: e.params, body: e.body, env };
      case 'list': return this.evalList(e, env);
      case 'neg': return -this.num(this.evalExpr(e.e, env));
      case 'not': return !this.bool(this.evalExpr(e.e, env));
      case 'ternary':
        return this.bool(this.evalExpr(e.c, env)) ? this.evalExpr(e.a, env) : this.evalExpr(e.b, env);
      case 'bin': return this.evalBin(e, env);
      case 'index': {
        const l = this.evalExpr(e.target, env);
        if (!Array.isArray(l)) this.err('添字はリストにのみ適用できる');
        const i = this.num(this.evalExpr(e.index, env));
        if (i < 0 || i >= l.length) this.err(`添字が範囲外: ${i}`);
        return l[i];
      }
      case 'call': return this.evalCall(e, env);
      case 'pipe': {
        const v = this.evalExpr(e.head, env);
        // everyInstant は連続基底の全点＝実体化できないので strideBy が直接受ける（§4.2）
        if (isObj(v) && v.k === 'instant') {
          if (e.stages[0]?.name !== 'strideBy') {
            this.err('everyInstant は strideBy を直後に要する（プロトタイプ）');
          }
          let s = this.applyStage({ k: 'stream', pts: [], wins: [], align: null, ann: [], endless: true }, e.stages[0], env);
          for (const st of e.stages.slice(1)) s = this.applyStage(s, st, env);
          return s;
        }
        let s = this.toStream(v, e.head.t === 'name' ? e.head.name : undefined);
        for (const st of e.stages) s = this.applyStage(s, st, env);
        return s;
      }
      case 'combine': {
        const ls = this.toStream(this.evalExpr(e.l, env));
        const rs = this.toStream(this.evalExpr(e.r, env));
        // ADR-36: & と \ は両辺同一 G を要求。| は不問（混合の出力は整列なし）。
        // 空虚適合（空テーブル・ADR-45）は検査に通り、出力整列は相手側を継承する
        let align: GridTag | null;
        if (e.op === '|') {
          align = isVacuous(ls.align) ? rs.align : isVacuous(rs.align) ? ls.align
            : gridEq(ls.align, rs.align) ? ls.align : null;
        } else {
          this.checkAlign(ls.align, rs.align, `結合子 ${e.op}`);
          align = isVacuous(ls.align) ? rs.align : ls.align;
        }
        const a = ls.pts, b = rs.pts;
        const pts = e.op === '|' ? ptUnion(a, b) : e.op === '&' ? ptInter(a, b) : ptDiff(a, b);
        // 註釈は両辺の和・自動相殺なし（`|` も例外にしない。ADR-37 判断 4）。
        // endless: 和は片方でも無限なら無限・積は両方・差は左辺（右辺は削るだけ）
        const endless = e.op === '|' ? ls.endless || rs.endless
          : e.op === '&' ? ls.endless && rs.endless : ls.endless;
        return { k: 'stream', pts, wins: [], align, ann: annUnion(ls.ann, rs.ann), endless };
      }
      case 'gen': return this.evalGen(e, env);
      default: this.err(`未対応の式: ${(e as any).t}`);
    }
  }

  private evalList(e: Extract<Expr, { t: 'list' }>, env: Env): V {
    const vals: V[] = [];
    for (const el of e.elems) {
      if ('t' in el && el.t === 'range') {
        const a = this.point(this.evalExpr(el.a, env));
        const b = this.point(this.evalExpr(el.b, env));
        const tz = this.tzObjOf(env);
        for (let p = a; p <= b; p = tz.addCivilDays(p, 1)) {   // 連続日への展開糖衣（§3.8・市民日歩進）
          vals.push({ k: 'point', ms: p });
        }
      } else {
        vals.push(this.evalExpr(el as Expr, env));
      }
    }
    // 時点要素のリストは時間ストリーム定数に昇格（ADR-26）
    if (vals.length > 0 && vals.every(v => isObj(v) && v.k === 'point')) {
      const pts = (vals as PointV[]).map(p => p.ms);
      for (let i = 1; i < pts.length; i++) {
        if (pts[i] <= pts[i - 1]) this.err('テーブルリテラルは昇順・重複なし（§3.8 静的エラー）');
      }
      let labels: string[] | undefined;
      if (e.labels) {
        if (e.labels.t !== 'list') this.err('labels: はリストを取る');
        const ls = e.labels.elems.map(el =>
          ('t' in el && el.t === 'name') ? el.name : this.err('labels: の要素はラベル名'));
        if (ls.length !== pts.length) this.err('labels: は時点列と同長（ADR-30）');
        labels = ls;
      }
      let covIv: Iv[];
      let covDesc: string;
      let concluded = false;
      if (e.covering) {
        const r = this.resolveCovering(e.covering, env);
        covIv = r.iv; covDesc = r.desc; concluded = r.concluded;
        // 静的検査（ADR-37 判断 1）: 主張と値の整合——列の全要素は covering に包含
        for (const p of pts) {
          if (!ivContainsPoint(covIv, p)) {
            this.err(`テーブルの要素が covering の外: ${this.rt.fmt(p)}（列の全要素は covering に包含——ADR-37）`);
          }
        }
      } else {
        // 省略時は列の端（閉区間 [先頭要素, 末尾要素]）が覆域＝最狭の主張（ADR-26/37 既定）
        covIv = [{ start: pts[0], end: pts[pts.length - 1] + 1 }];
        covDesc = `${this.rt.fmt(pts[0])}..${this.rt.fmt(pts[pts.length - 1])}`;
      }
      const asof = this.asofOf(env.members);
      // ADR-36: 全要素が「日付のみの字句」→ 錨打ちに使われた tz の市民日グリッド。
      // 時刻付き・字句でない要素（計算値・名前参照）を含む → なし
      const dateOnly = e.elems.every(el =>
        ('t' in el && el.t === 'range')
          ? el.a.t === 'date' && !el.a.v.hasTime && el.b.t === 'date' && !el.b.v.hasTime
          : (el as Expr).t === 'date' && !(el as Extract<Expr, { t: 'date' }>).v.hasTime);
      return { k: 'table', pts, labels, covIv, covDesc, concluded, ...(asof ? { asof } : {}),
               align: dateOnly ? this.dayGrain(env) : null };
    }
    // 空テーブル（ADR-45・F98）: 空リストは covering: 後置に限り時間ストリーム定数に昇格する。
    // 「点ゼロだが覆域は主張したい」の一次形——包含・昇順・同長の各検査は空虚に成立し、
    // 整列は空虚適合（全整列に適合する第三状態）。生成器は行数 0..N で同一の出力形になる
    if (vals.length === 0 && e.covering) {
      let labels: string[] | undefined;
      if (e.labels) {
        if (e.labels.t !== 'list') this.err('labels: はリストを取る');
        if (e.labels.elems.length !== 0) this.err('labels: は時点列と同長（ADR-30）——空テーブルに付く labels: は [] のみ');
        labels = [];
      }
      const r = this.resolveCovering(e.covering, env);
      const asof = this.asofOf(env.members);
      return { k: 'table', pts: [], labels, covIv: r.iv, covDesc: r.desc, concluded: r.concluded,
               ...(asof ? { asof } : {}), align: VACUOUS_GRAIN };
    }
    if (vals.length === 0 && e.labels) {
      this.err('空テーブルは covering: を明示する（省略既定「列の端」が空列で定義できない。ADR-45）');
    }
    if (e.labels || e.covering) this.err('labels:/covering: は時点列（テーブルリテラル）にのみ付く');
    return vals;
  }

  /** covering-list の解決（ADR-37 判断 9）: 端は premise tz の市民日・年は暦年・
   *  端の省略＝開端（完結主張＝±∞）・区間リスト＝中抜けの申告 */
  private resolveCovering(list: CoveringRange[], env: Env): { iv: Iv[]; desc: string; concluded: boolean } {
    const iv: Iv[] = [];
    const parts: string[] = [];
    const tz = this.tzObjOf(env);
    const dateStr = (ms: number) => {   // 覆域は premise tz の市民日——表示もその市民ラベルで
      const f = tz.localFields(ms);
      const p = (n: number) => String(n).padStart(2, '0');
      return `${f.y}-${p(f.mo)}-${p(f.d)}`;
    };
    for (const r of list) {
      const start = r.a ? this.coveringEdge(r.a, env, false) : -Infinity;
      const end = r.b ? this.coveringEdge(r.b, env, true) : Infinity;
      if (end <= start) this.err('covering: 区間の端が逆順');
      iv.push({ start, end });
      parts.push(`${r.a ? dateStr(start) : ''}..${r.b ? dateStr(end - 1) : ''}`);
    }
    for (let i = 1; i < iv.length; i++) {
      if (iv[i].start < iv[i - 1].end) this.err('covering: 区間リストは昇順・重複なし（ADR-37 判断 9）');
    }
    return { iv, desc: parts.join(', '), concluded: iv.some(x => x.start === -Infinity || x.end === Infinity) };
  }

  /** covering の端は premise の tz の市民日で解決する（ADR-37 判断 1） */
  private coveringEdge(e: Expr, env: Env, isEnd: boolean): number {
    const tz = this.tzObjOf(env);
    if (e.t === 'date' && !e.v.hasTime) {   // 日付略記はフィールドで市民日解決（+1 日も市民日歩進）
      return tz.civilDayStart(e.v.y, e.v.mo, isEnd ? e.v.d + 1 : e.v.d);
    }
    const v = this.evalExpr(e, env);
    if (typeof v === 'number') {  // 年だけの略記（§5.6 covering-range）
      return tz.civilDayStart(isEnd ? v + 1 : v, 1, 1);
    }
    if (isObj(v) && v.k === 'point') return isEnd ? tz.addCivilDays(tz.floorToDay(v.ms), 1) : v.ms;
    this.err('covering: の端は年または日付');
  }

  private evalBin(e: Extract<Expr, { t: 'bin' }>, env: Env): V {
    if (e.op === 'and') return this.bool(this.evalExpr(e.l, env)) && this.bool(this.evalExpr(e.r, env));
    if (e.op === 'or') return this.bool(this.evalExpr(e.l, env)) || this.bool(this.evalExpr(e.r, env));
    const l = this.evalExpr(e.l, env);
    const r = this.evalExpr(e.r, env);
    switch (e.op) {
      case '+': return this.num(l) + this.num(r);
      case '-': return this.num(l) - this.num(r);
      case '*': return this.num(l) * this.num(r);
      case '/': return this.num(l) / this.num(r);
      case 'mod': { const a = this.num(l), b = this.num(r); return ((a % b) + b) % b; }
      case 'div': return Math.floor(this.num(l) / this.num(r));
      case '<': return this.num(l) < this.num(r);
      case '<=': return this.num(l) <= this.num(r);
      case '>': return this.num(l) > this.num(r);
      case '>=': return this.num(l) >= this.num(r);
      case '==': return this.eq(l, r);
      case '!=': return !this.eq(l, r);
      case 'in': {
        if (!Array.isArray(r)) this.err('in の右辺はリスト');
        return r.some(x => this.eq(l, x));
      }
      default: this.err(`未対応の演算子: ${e.op}`);
    }
  }

  private eq(l: V, r: V): boolean {
    if (isObj(l) && l.k === 'point' && isObj(r) && r.k === 'point') return l.ms === r.ms;
    return l === r;
  }

  private evalCall(e: Extract<Expr, { t: 'call' }>, env: Env): V {
    if (e.callee.t === 'name') {
      const name = e.callee.name;
      if (name === 'external') return this.evalExternal(e, env);   // 外部供給宣言（ADR-46）
      // 射影（§4.9・ADR-30）。窓所属の失敗は実効被覆域で分類（ADR-37 判断 6）
      if (name === 'ordinalIn') {
        const [uV, wV, dV] = e.args.map(a => this.evalExpr(a.value, env));
        const d = this.point(dV);
        // 免除系の tz 名検査（ADR-40）: 単位窓×枠窓・述語入力×枠窓
        this.checkTzMembership(this.winGrainOf(uV), this.winGrainOf(wV), 'ordinalIn（単位窓×枠窓）');
        this.checkTzMembership(this.predicateAlign, this.winGrainOf(wV), 'ordinalIn');
        const u = this.intervalsOf(uV, env);
        const w = this.intervalsOf(wV, env);
        const wi = ivIndexOf(w, d);
        if (wi < 0) this.outOrErr(d, this.winAnnOfV(wV), 'ordinalIn: 点が枠窓の外');
        const ui = ivIndexOf(u, d);
        if (ui < 0) this.outOrErr(d, this.winAnnOfV(uV), 'ordinalIn: 点が単位窓の外');
        this.winCovOrOut(w[wi], this.winAnnOfV(wV), 'ordinalIn（枠窓）');
        this.winCovOrOut(u[ui], this.winAnnOfV(uV), 'ordinalIn（単位窓）');
        let first = ui;
        while (first > 0 && u[first - 1].start >= w[wi].start) first--;
        return ui - first + 1;   // 1 起点（ADR-30）
      }
      if (name === 'epochOrdinal') {
        const [uV, dV] = e.args.map(a => this.evalExpr(a.value, env));
        const d = this.point(dV);
        this.checkTzMembership(this.predicateAlign, this.winGrainOf(uV), 'epochOrdinal');   // ADR-40
        const uIv = this.intervalsOf(uV, env);
        const idx = ivIndexOf(uIv, d);
        if (idx < 0) this.outOrErr(d, this.winAnnOfV(uV), 'epochOrdinal: 点が窓の外');
        this.winCovOrOut(uIv[idx], this.winAnnOfV(uV), 'epochOrdinal');
        return idx;   // 存在する窓列の通し序数（先頭 0。データ由来窓の規則は F60＝ADR-31 改訂で確定）
      }
      // 窓所属の述語（仮称 coincides。ADR-38）: 点 d の属する w 窓の中に S の点が在るか——
      // 値式の有界存在量化。整列要求（同一 G）は課さない（区間所属＝ADR-36 判断 7 の免除系）
      if (name === 'coincides') {
        if (e.args.length !== 3) this.err('coincides(S, w, d) は 3 引数（ADR-38）');
        // S: 軸位置と同一規則の準用（束縛名・修飾名・インライン式→有効点ストリーム）。
        // premise 名の読み替えは適用しない（標準導出は bizDay の名で書ける）
        const sV = this.evalExpr(e.args[0].value, env);
        if (isObj(sV) && sV.k === 'windows') {
          this.err('coincides: S に窓語は置けない——原子点列への暗黙降格は恒真化の罠'
            + '（点列を意図するなら month |> first を書く。ADR-38 判断 3）');
        }
        const S = this.toStream(sV);
        const wV = this.evalExpr(e.args[1].value, env);
        if (isObj(wV) && wV.k === 'cycle') {
          this.err('coincides: w に cycle 名は立てられない——cycle は窓でなくラベル（ADR-21/38）');
        }
        const w = this.intervalsOf(wV, env);
        const d = this.point(this.evalExpr(e.args[2].value, env));
        // tz の静的検査（ADR-38 判断 5）: 幅・位相は不問（所属だから細分は許す）が、tz 名だけは
        // 日付座標系そのもの——クロス tz の黙った 1 日ずれを免除系の裏口から再開させない。
        // S の整列「なし」は検査不能（合法）——coincides は chronos 所属であり「同じ日付ラベル」ではない（F69）
        const wg = this.winGrainOf(wV);
        if (S.align && S.align.kind === 'civil' && S.align.tz
          && wg && wg.kind === 'civil' && wg.tz && S.align.tz !== wg.tz) {
          this.err(`coincides: S と w の tz 名が不一致（S="${S.align.tz}"・w="${wg.tz}"）`
            + '——chronos 所属であり「同じ日付ラベル」の所属ではない（F69 の再錨の領分。ADR-38 判断 5）');
        }
        const wi = ivIndexOf(w, d);
        if (wi < 0) this.outOrErr(d, this.winAnnOfV(wV), 'coincides: 点が窓の外');
        const win = w[wi];
        // (0) 窓列自身の覆域検査（F82）: 窓境界が未知なら証人の有無以前に範囲外
        this.winCovOrOut(win, this.winAnnOfV(wV), 'coincides');
        // 証人規則の三分岐（ADR-38 判断 4。基準は実効被覆域＝輸送済み註釈区間の補集合）:
        // (i) 窓内に非註釈区間の S の点（証人）→ 真（∃ は単調・註釈不要）。
        //     註釈区間内の点は証人にならない（everyDay \ holidays の退化尾部を確信に使わない）
        for (let i = ptUpperBound(S.pts, win.start - 1); i < S.pts.length && S.pts[i] < win.end; i++) {
          if (annAt(S.ann, S.pts[i]).length === 0) return true;
        }
        // (ii) 証人なし ∧ 窓 ∩ S の註釈区間 ≠ ∅ → 範囲外（読んだ窓を運び filter が逆像拡幅する＝F75）
        const overlap = S.ann.filter(a => a.from < win.end && win.start < a.to);
        if (overlap.length > 0) {
          const a = overlap[0];
          throw new OutOfCoverageSignal(
            `範囲外（out-of-coverage）: coincides の窓 [${this.rt.fmt(Math.max(win.start, -8.64e15))}, `
            + `${this.rt.fmt(Math.min(win.end, 8.64e15))}) は ${a.source} の実効被覆域に掛かり、証人（非註釈区間の点）が無い`
            + `（covering ${a.covering}${a.asof ? `, asof ${a.asof}` : ''}——判定は外部・ADR-38 判断 4）`,
            overlap, win);
        }
        return false;   // (iii) 窓が完全に実効被覆域内 → 偽（覆域完全性に依存する側）
      }
      // 営業中の導出値述語（仮称 isOpen。ADR-41 判断 3）: t が bizOpen セッションの半開区間の
      // 和に入るか——実体相対（C の文化で解決する chronos 述語。読み手の tz に依存しないので
      // coincides と違い tz の静的検査は掛からない＝F89）。calendar: 非在圏では自由な束縛名
      if (name === 'isOpen' && env.members.has('calendar')) {
        if (this.isBoundName('isOpen', env)) {
          this.err('calendar: の在圏では isOpen は言語予約の導出名——手動束縛は静的エラー（独自の述語は別名で。ADR-41）');
        }
        if (e.args.length !== 1 || e.args[0].name) this.err('isOpen(t) は位置引数 1 個（ADR-41）');
        return this.isOpenAt(this.point(this.evalExpr(e.args[0].value, env)), env);
      }
      if (name === 'not') return !this.bool(this.evalExpr(e.args[0].value, env));
      // 引数付き束縛（糖衣・値関数）: 呼び出し時の在圏 premise で遅延解決（§4.8）
      const local = this.lookupLocal(name, env);
      if (local === undefined) {
        const binding = this.lookupBinding(name, env);
        if (binding && binding.decl.params.length > 0) {
          const locals = this.bindParams(binding.decl.params, e.args, env, name);
          const defEnv = binding.premise ? { ...env, premise: binding.premise } : env;
          return this.evalExpr(binding.decl.rhs, childEnv(defEnv, locals));
        }
      }
    }
    const callee = this.evalExpr(e.callee, env);
    // 束縛名を診断用に随伴（窓束縛のインスタンス参照・射影のエラーメッセージ。ADR-42）
    const calleeName = e.callee.t === 'name' ? e.callee.name
      : e.callee.t === 'qualified' ? `${e.callee.ns}.${e.callee.name}` : undefined;
    return this.applyValue(callee, e.args.map(a => this.evalExpr(a.value, env)), env, calleeName);
  }

  private lookupLocal(name: string, env: Env): V | undefined {
    for (let e: Env | null = env; e; e = e.parent) {
      if (e.locals?.has(name)) return e.locals.get(name);
    }
    return undefined;
  }

  private lookupBinding(name: string, env: Env): { decl: BindingDecl; premise: PremiseInstance | null } | null {
    if (env.premise) {
      const d = env.premise.findDef(name);
      if (d) return { decl: d, premise: env.premise };
    }
    const cs = this.calendarSystemOf(env);
    if (cs) {
      const d = cs.findDef(name);
      if (d) return { decl: d, premise: cs };
    }
    const t = this.rt.topBindings.get(name);
    if (t) return { decl: t, premise: null };
    return null;
  }

  private bindParams(params: Param[], args: Arg[], env: Env, name: string): Map<string, V> {
    const locals = new Map<string, V>();
    const positional = args.filter(a => !a.name);
    let pi = 0;
    for (const p of params) {
      const arg = p.key !== undefined
        ? args.find(a => a.name === p.key) ?? this.err(`${name}: 名前付き引数 ${p.key}: が必要`)
        : positional[pi++] ?? this.err(`${name}: 引数が不足`);
      locals.set(p.name, this.evalExpr(arg.value, env));
    }
    // 未知の名前付き引数・余剰の位置引数を黙って捨てない（ADR-39——タイポの検査面）
    const keys = new Set(params.filter(p => p.key !== undefined).map(p => p.key));
    for (const a of args) {
      if (a.name && !keys.has(a.name)) this.err(`${name}: 未知の名前付き引数 ${a.name}:（黙って捨てない——ADR-39）`);
    }
    if (pi < positional.length) this.err(`${name}: 引数が多すぎる（位置引数 ${positional.length} 個・仮引数 ${pi} 個）`);
    return locals;
  }

  /** 値の適用: ラムダ・cycle（点→ラベル）・ラベル付きテーブル（点→ラベル。ADR-30 束縛名射影）・
   *  label: 付与式つきの窓（点→ラベル。§4.9・ADR-34 束縛名射影）。
   *  窓束縛は引数の型で dispatch（ADR-42 判断 4: 点→射影・値→窓インスタンス参照＝逆像。
   *  判定時点は糖衣展開後・実引数束縛後＝実引数の評価値の型） */
  applyValue(callee: V, args: V[], env: Env, calleeName?: string): V {
    if (isObj(callee)) {
      if (callee.k === 'lambda') {
        const locals = new Map<string, V>();
        callee.params.forEach((p, i) => locals.set(p, args[i]));
        return this.evalExpr(callee.body, childEnv(callee.env, locals));
      }
      if (callee.k === 'cycle') {
        if (isValueV(args[0])) {   // ADR-42 判断 5/7 (b): 値引数は窓束縛のみ
          this.err('インスタンス参照（値引数適用）は窓束縛のみ——cycle は台の点列を filter で書く'
            + '（everyDay |> filter(d => weekday(d) == Mon)。ADR-42 判断 5/7 (b)）');
        }
        this.checkTzMembership(this.predicateAlign, callee.grain, 'cycle 射影');   // ADR-40（weekday 等）
        const ms = this.point(args[0]);
        const idx = ivIndexOf(callee.iv, ms);
        if (idx < 0) this.err('cycle: 点が対象窓の外');
        const L = callee.labels.length;
        return callee.labels[(((idx - callee.anchor) % L) + L) % L];
      }
      if (callee.k === 'table') {
        if (isValueV(args[0])) {   // ADR-42 判断 5/7 (b): 値引数は窓束縛のみ
          this.err('インスタンス参照（値引数適用）は窓束縛のみ——テーブルは台の点列を filter で書く'
            + '（sekki |> filter(s => sekki(s) == 立春)。ADR-42 判断 5/7 (b)）');
        }
        if (!callee.labels) this.err('ラベル列（labels:）のないテーブルは射影できない');
        this.registerCoverage(callee.src ?? '(無名テーブル)', callee.covDesc, callee.covIv,
          callee.concluded, callee.asof);
        const ms = this.point(args[0]);
        const i = ptIndexOf(callee.pts, ms);
        if (i < 0) this.outOrErr(ms, this.tableAnn(callee), 'テーブル射影: 点が列にない');
        return callee.labels[i];
      }
      if (callee.k === 'windows') {
        const who = `窓束縛 ${calleeName ?? callee.name ?? '(無名)'}`;
        if (isValueV(args[0])) {   // 値引数＝窓インスタンス参照（ADR-42 判断 4）
          if (!callee.labelFn) {
            this.err(`${who} にラベル源（label:/labels:）がない——インスタンス参照には label: を`
              + '付けるか、値関数の filter（everyDay |> filter(d => isoYearNo(d) == 2026) 級）で'
              + '書く（ADR-42 判断 7 (a)）');
          }
          return this.windowInstance(who, { fn: callee.labelFn }, callee.iv, callee.units,
            callee.grain ?? null, [], [], true, args[0], env);
        }
        if (callee.labelFn) {
          this.checkArgIsPoint(args[0], who);   // ADR-42 判断 7 (e)
          this.checkTzMembership(this.predicateAlign, callee.grain, 'label 射影');   // ADR-40
          return this.projectLabel(callee.labelFn, callee.iv, [], args[0], env);
        }
      }
      if (callee.k === 'stream' && callee.wins.length > 0) {
        const top = callee.wins[callee.wins.length - 1];
        const who = `窓束縛 ${calleeName ?? top.name ?? '(無名)'}`;
        if (isValueV(args[0])) {   // 値引数＝窓インスタンス参照（ADR-42 判断 4。segmentBy 由来の表現）
          if (!top.labelFn && !top.labels && !top.labelsCycle) {
            this.err(`${who} にラベル源（label:/labels:）がない——インスタンス参照には label: を`
              + '付けるか、値関数の filter（everyDay |> filter(d => isoYearNo(d) == 2026) 級）で'
              + '書く（ADR-42 判断 7 (a)）');
          }
          return this.windowInstance(who, { fn: top.labelFn, labels: top.labels, labelsCycle: top.labelsCycle }, top.iv,
            callee.pts, callee.align, top.ann, callee.ann, callee.endless, args[0], env);
        }
        if (top.labelFn || top.labels || top.labelsCycle) {
          this.checkArgIsPoint(args[0], who);   // ADR-42 判断 7 (e)
          this.checkTzMembership(this.predicateAlign, top.grain, 'ラベル射影');    // ADR-40
        }
        if (top.labelFn) return this.projectLabel(top.labelFn, top.iv, top.ann, args[0], env);
        // 窓列への並行ラベル列の束縛名射影（ADR-39）: 名前(d) ≡ labels[窓列序数(d の属する窓)]。
        // 読みは区間所属——空窓のラベルもマーカー点等の窓区間内の任意の点から読める
        if (top.labels || top.labelsCycle) {
          const ms = this.point(args[0]);
          const idx = ivIndexOf(top.iv, ms);
          if (idx < 0) this.outOrErr(ms, top.ann, 'ラベル射影: 点が窓の外');
          this.winCovOrOut(top.iv[idx], top.ann, 'ラベル射影');
          if (top.labelsCycle) {   // 周期ラベル（ADR-47）: list[(i − i0) mod N]・負も法で正規化（F65 規約）
            const { list, i0 } = top.labelsCycle;
            const N = list.length;
            return list[(((idx - i0) % N) + N) % N];
          }
          if (idx >= top.labels!.length) this.err('ラベル射影: 窓列序数がラベル列を越えた（内部整合）');
          return top.labels![idx];
        }
      }
      if (callee.k === 'stream' && isValueV(args[0])) {   // ADR-42 判断 7 (b): 点列束縛
        this.err('インスタンス参照（値引数適用）は窓束縛のみ——点列束縛は filter で書く'
          + '（S |> filter(d => …)。ADR-42 判断 7 (b)）');
      }
    }
    this.err(`適用できない値: ${kindOf(callee)}`);
  }

  /** 窓束縛への引数の型域（ADR-42 判断 7 (e)）: 点（射影）か値（インスタンス参照）のみ */
  private checkArgIsPoint(arg: V, who: string): void {
    if (!isObj(arg) || arg.k !== 'point') {
      this.err(`${who}: 引数は点（射影）か値（インスタンス参照）——ストリーム等は置けない`
        + `（窓所属は within/coincides で。ADR-42 判断 7 (e)）: ${kindOf(arg)}`);
    }
  }

  /** 窓インスタンス参照（ADR-42 判断 2）: W(v) ≡ W の要素点列 |> filter(d => W(d) == v)。
   *  要素点列＝W の定義が窓に束ねた入力点列のうち W の窓に属する点（grid/span/split 連鎖では
   *  原子グリッドの目盛りと同値・segmentBy では入力ストリームの点＝F93 の修正）。
   *  出力の註釈区間＝窓列の実効被覆域の補集合（判断 3 の輸送行＝F94・segmentBy 行の継承）。
   *  ラベルは窓ごとに一定（付与式は窓先頭点で評価＝ADR-34 の構造保証）なので窓単位で評価する
   *  （外延等価の最適化——ADR-42 帰結）。ラベル一意でなければ全マッチの和・ゼロマッチは空（ADR-15） */
  private windowInstance(
    who: string,
    src: { fn?: LambdaV; labels?: (number | string | boolean)[]; labelsCycle?: { list: (number | string | boolean)[]; i0: number } },
    iv: Iv[], inputPts: number[], align: GridTag | null,
    winAnn: Ann[], baseAnn: Ann[], endless: boolean,
    v: number | string | boolean, env: Env,
  ): StreamV {
    // (f) 自束縛への値引数適用の締め（ADR-34 改訂）: 逆像は定義上ラベル射影を内包する——
    // 「射影を呼ぶ形」だけの検査は W(v) 経由の無限再帰を見逃す（相互参照も labelStack が捕まえる）
    if (src.fn && this.labelStack.has(src.fn)) {
      this.err('label: 付与式は定義中の束縛名（自己または相互）への値引数適用（インスタンス参照）を'
        + '呼べない——逆像は射影を内包する（ADR-34 改訂・ADR-42 判断 7 (f)）');
    }
    // labels: リテラル＝値域が静的に列挙できる束縛: 型域 (c) と域外 (g) を先に検査（ADR-42 判断 7。
    // cycle 形〈ADR-47〉のリストも静的な全値域として同じ検査に乗る）
    const domain = src.labels ?? src.labelsCycle?.list;
    if (domain) {
      if (typeof domain[0] !== typeof v) {
        this.err(`${who}: 値引数の型（${typeof v}）がラベル値の型域（${typeof domain[0]}）と`
          + '不一致（ADR-42 判断 7 (c)）');
      }
      if (!domain.includes(v)) {
        this.err(`${who}(${typeof v === 'string' ? `"${v}"` : v}): ラベル値域（labels: リテラル）の外`
          + '——域外の値引数は静的エラー（タイポが「註釈なしの空」で流れるのを封じる。'
          + 'ADR-42 判断 7 (g)。計算ラベル〈label: 式〉は列挙不能なので該当なし＝空）');
      }
    }
    // 要素点列（判断 2）: 窓列・点列ともソート済み＝スイープで窓所属だけ拾う
    const elemPts: number[] = [];
    let wi = 0;
    for (const p of inputPts) {
      while (wi < iv.length && p >= iv[wi].end) wi++;
      if (wi >= iv.length) break;
      if (p >= iv[wi].start) elemPts.push(p);
    }
    // 輸送行（判断 3・F94）: マーカー覆域の外では要素点そのものが無く filter が一度も走らない——
    // 窓列の実効被覆域の補集合をここで湧かせないと F61 と同型の黙った退化になる
    const elem: StreamV = { k: 'stream', pts: elemPts, wins: [], align,
                            ann: annUnion(baseAnn, winAnn), endless };
    // 覆域外に張られた窓（境界未知＝F82 の第 5 の窓リーダーサイト）はラベル評価が範囲外シグナルを
    // 投げ、filter 共通経路が「落として註釈」＋窓の逆像への拡幅（F75）で輸送する。
    // 窓単位のメモはシグナルも保存（点ごとの再投げで輸送は filter と共有・評価は窓 1 回）
    const memo = new Map<number, { label?: V; sig?: OutOfCoverageSignal }>();
    const labelAt = (i: number): V => {
      const m = memo.get(i);
      if (m) { if (m.sig) throw m.sig; return m.label!; }
      try {
        let label: V;
        if (src.fn) {
          label = this.projectLabel(src.fn, iv, winAnn, { k: 'point', ms: iv[i].start }, env);
        } else if (src.labelsCycle) {   // 周期ラベル（ADR-47）
          this.winCovOrOut(iv[i], winAnn, 'インスタンス参照');
          const { list, i0 } = src.labelsCycle;
          const N = list.length;
          label = list[(((i - i0) % N) + N) % N];
        } else {
          this.winCovOrOut(iv[i], winAnn, 'インスタンス参照');
          if (i >= src.labels!.length) this.err('インスタンス参照: 窓列序数がラベル列を越えた（内部整合）');
          label = src.labels![i];
        }
        memo.set(i, { label });
        return label;
      } catch (e) {
        if (e instanceof OutOfCoverageSignal) memo.set(i, { sig: e });
        throw e;
      }
    };
    let typeChecked = !!domain;
    return this.filterByPredicate(elem, ms => {
      const i = ivIndexOf(iv, ms);
      if (i < 0) return false;   // 要素点列は窓所属で作るので来ない（防御）
      const label = labelAt(i);
      if (!typeChecked) {   // (c) 計算ラベルの型域は最初の窓の値で検査（ADR-34 判断 3 の等質前提）
        if (typeof label !== typeof v) {
          this.err(`${who}: 値引数の型（${typeof v}）がラベル値の型域（${typeof label}）と`
            + '不一致（ADR-42 判断 7 (c)）');
        }
        typeChecked = true;
      }
      return label === v;
    });
  }

  /** 述語 filter の共通経路（ADR-37 判断 4/6・F75）: 述語が範囲外参照を要求した点は落とし、
   *  依存の註釈区間（窓越し参照は読んだ窓の逆像へ拡幅）を出力へ輸送する。filter 段と
   *  窓インスタンス参照（ADR-42 判断 3）が共有する。
   *  predicateAlign＝述語に流れる点の整列（免除系 tz 検査の評価時近似の文脈。ADR-40） */
  private filterByPredicate(stream: StreamV, test: (ms: number) => boolean): StreamV {
    const kept: number[] = [];
    let ann = stream.ann;
    const prevAlign = this.predicateAlign;
    this.predicateAlign = stream.align;
    try {
      for (const p of stream.pts) {
        try {
          if (test(p)) kept.push(p);
        } catch (err) {
          if (err instanceof OutOfCoverageSignal) {
            let extra = err.entries;
            if (err.window) {
              const w = err.window;
              extra = [...extra, ...err.entries.map(a => ({ ...a, from: w.start, to: w.end }))];
            }
            ann = annUnion(ann, extra);
          } else throw err;
        }
      }
    } finally {
      this.predicateAlign = prevAlign;
    }
    return { ...stream, pts: kept, ann };
  }

  /** label: 射影（§4.9・ADR-34）: 名前(d) ≡ 付与式(d の属する窓の先頭点)。評価は射影時・遅延（I7） */
  private projectLabel(fn: LambdaV, iv: Iv[], depAnn: Ann[], arg: V, env: Env): V {
    if (this.labelStack.has(fn)) {
      this.err('label: 付与式は定義中の束縛名（自己または相互）のラベル射影を呼べない（隣接窓参照の裏面・I7）');
    }
    const idx = ivIndexOf(iv, this.point(arg));
    if (idx < 0) this.outOrErr(this.point(arg), depAnn, 'label 射影: 点が窓の外');
    this.winCovOrOut(iv[idx], depAnn, 'label 射影');
    this.labelStack.add(fn);
    try {
      const v = this.applyValue(fn, [{ k: 'point', ms: iv[idx].start }], env);
      // ラベル値の型域は値型（数値・論理・列挙名・文字列。ADR-34 判断 3）——点・窓・ストリーム等は不可
      if (typeof v !== 'number' && typeof v !== 'string' && typeof v !== 'boolean') {
        this.err(`label: 付与式の値は値型（ADR-34）: ${kindOf(v)}`);
      }
      return v;
    } finally {
      this.labelStack.delete(fn);
    }
  }

  // ---------- premise 層: 窓生成語（§3.6） ----------

  /** gen 語ごとの既知 named-arg（ADR-39: 未知の名前付き引数を黙って捨てない）。
   *  cycle の label: は既知に含め、genLabelFn の専用エラー（ADR-34）に委ねる */
  private static readonly GEN_NAMED: Record<string, Set<string>> = {
    grid: new Set(['anchor', 'label']),
    span: new Set(['phase', 'label']),
    split: new Set(['by', 'label']),
    cycle: new Set(['anchor', 'label']),
  };

  private evalGen(e: Extract<Expr, { t: 'gen' }>, env: Env): V {
    for (const key of Object.keys(e.named)) {
      if (!Evaluator.GEN_NAMED[e.word].has(key)) {
        this.err(`${e.word}: 未知の名前付き引数 ${key}:（黙って捨てない——ADR-39。`
          + `窓のデータラベルは segmentBy の labels:・周期ラベルは窓束縛 cycle か labels: cycle〈ADR-47〉）`);
      }
    }
    const labelFn = this.genLabelFn(e, env);   // label: 付与式（§4.9・ADR-34）。cycle は対象外
    const operand = this.evalExpr(e.operand, env);
    switch (e.word) {
      case 'grid': {
        if (kindOf(operand) !== 'chronos') this.err('grid は chronos だけが受け取る（ADR-29）');
        const w = this.evalExpr(e.arg, env);
        if (!isObj(w) || w.k !== 'width') this.err('grid は幅リテラルを取る');
        const mod = (a: number, b: number) => ((a % b) + b) % b;
        if (w.w.kind === 'civil') {
          // 市民時幅（ADR-31/33）: 位相は在圏 tz の市民日の開始瞬間——DST 切替日は 23/25 時間
          //（1d は市民日であって 86400s ではない＝ADR-11/12 の幅規約）。anchor: で位相・日内オフセット上書き
          const tz = this.tzObjOf(env);
          const days = tz.dayStarts(this.rt.computeEnd + (w.w.days + 2) * DAY_MS);
          const stepDays = w.w.days;
          let phase = 0;   // 紀元（在圏 tz の 1970-01-01 の市民日）からの日序数 mod 幅
          let off = 0;     // 日内オフセット（壁時計）
          if (e.named.anchor) {
            const anchor = this.point(this.evalExpr(e.named.anchor, env));
            const aDay = tz.floorToDay(anchor);
            // 日内オフセットは壁時計ラベル読み（経過 ms ではない・ADR-31 改訂 2＝F87 の修正）:
            // anchor が DST 切替日でも全目盛りが anchor の壁時計時刻を通り、同じ壁時計 anchor の
            // 2 本が同一 G になる。市民日の開始点は日整列（真夜中遷移 tz の 01:00 開始も off 0）
            off = anchor === aDay ? 0 : tz.timeOfDayLabel(anchor);
            phase = mod(tz.dayIndex(aDay), stepDays);
          }
          const iv: Iv[] = [];
          for (let i = phase; i + stepDays < days.length; i += stepDays) {
            const s = off === 0 ? days[i] : tz.atTimeOfDay(days[i], off);
            if (s >= this.rt.computeEnd) break;
            iv.push({ start: s, end: off === 0 ? days[i + stepDays] : tz.atTimeOfDay(days[i + stepDays], off) });
          }
          const grain: GridTag = { kind: 'civil', step: stepDays, phase, off, tz: this.tzNameOf(env) };
          return { k: 'windows', iv, units: iv.map(x => x.start), labelFn, grain };
        }
        // 経過時間幅: 既定位相は在圏 tz の紀元（epoch: 上書きは未対応＝ADR-31）・anchor: で上書き
        const step = w.w.ms;
        const tzEpoch = this.tzObjOf(env).civilDayStart(1970, 1, 1);
        let t0 = tzEpoch;
        if (e.named.anchor) {
          const anchor = this.point(this.evalExpr(e.named.anchor, env));
          const k = Math.ceil((tzEpoch - anchor) / step);
          t0 = anchor + k * step;   // 紀元以後で最初の位相点（それ以前はプロトタイプの評価範囲外）
        }
        const iv: Iv[] = [];
        for (let t = t0; t < this.rt.computeEnd; t += step) iv.push({ start: t, end: t + step });
        const grain: GridTag = { kind: 'elapsed', step, phase: mod(t0, step), off: 0, tz: '' };
        return { k: 'windows', iv, units: iv.map(x => x.start), labelFn, grain };
      }
      case 'span': {
        const units = this.windowsOf(operand);
        const f = this.evalExpr(e.arg, env);
        const phase = e.named.phase ? this.num(this.evalExpr(e.named.phase, env)) : 0;
        if (phase < 0) this.err('span: phase は 0 以上（負位相は周期を法として正規化して書く。F65）');
        const iv: Iv[] = [];
        // phase > 0 のとき、紀元前に始まる窓の切れ端を先頭に張る。I5 では窓は全域を覆うが、
        // 有界実体化（紀元起点）は頭の単位 phase 個を覆えず、ordinalIn が「枠窓の外」を誤報していた
        if (phase > 0 && units.iv.length > 0) {
          const cut = Math.min(phase, units.iv.length);
          iv.push({ start: units.iv[0].start, end: units.iv[cut - 1].end });
        }
        let idx = phase, n = 0;
        while (idx < units.iv.length) {
          const k = this.num(this.applyValue(f, [n], env));
          if (k < 1) this.err('span: 個数は 1 以上');
          const last = Math.min(idx + k, units.iv.length) - 1;
          iv.push({ start: units.iv[idx].start, end: units.iv[last].end });
          idx += k; n++;
        }
        return { k: 'windows', iv, units: units.units, labelFn, grain: units.grain };
      }
      case 'split': {
        const parent = this.windowsOf(operand);
        const g = this.evalExpr(e.arg, env);
        const byName = e.named.by;
        if (!byName) this.err('split は by: で幅の単位を明示する（§3.6）');
        const u = this.windowsOf(this.evalExpr(byName, env));
        const iv: Iv[] = [];
        parent.iv.forEach((p, y) => {
          const widths = this.applyValue(g, [y], env);
          if (!Array.isArray(widths)) this.err('split の g は幅リストを返す');
          // 親窓内の単位窓を幅リストで割る。幅総和＝親は I5 で検査
          let ui = u.iv.findIndex(x => x.start >= p.start);
          const inParent = u.iv.filter(x => x.start >= p.start && x.end <= p.end).length;
          const endIdx = ui + inParent - 1;   // 親窓内の最後の単位
          const total = (widths as V[]).reduce((s: number, w) => s + this.num(w), 0);
          // 実体化の両端に接する親窓は切れ端でありうる（span の頭の切れ端・末尾の打ち切り）ため検査しない
          if (total !== inParent && p.start > this.rt.epoch && p.end < this.rt.computeEnd) {
            this.rt.warnings.push(`I5: split の幅総和 ${total} ≠ 親窓内の単位数 ${inParent}`);
          }
          for (const w of widths as V[]) {
            const k = this.num(w);
            if (ui + k - 1 > endIdx) break;   // 幅ぶんの単位が親窓内にない（実体化の端）
            iv.push({ start: u.iv[ui].start, end: u.iv[ui + k - 1].end });
            ui += k;
          }
          // 実体化の端（切れ端の親窓）では残りの単位にも切れ端窓を張る（I5: 全域を覆う）
          if (ui <= endIdx) iv.push({ start: u.iv[ui].start, end: u.iv[endIdx].end });
        });
        return { k: 'windows', iv, units: parent.units, labelFn, grain: parent.grain };
      }
      case 'cycle': {
        const target = this.windowsOf(operand);
        const labelsV = this.evalExpr(e.arg, env);
        if (!Array.isArray(labelsV)) this.err('cycle はラベルのリストを取る');
        const labels = (labelsV as V[]).map(l => typeof l === 'string' ? l : this.err('cycle のラベルは名前'));
        const anchorE = e.named.anchor ?? this.err('cycle は anchor: が必要（§3.6）');
        const anchor = ivIndexOf(target.iv, this.point(this.evalExpr(anchorE, env)));
        if (anchor < 0) this.err('cycle: anchor が対象窓の外');
        return { k: 'cycle', iv: target.iv, labels, anchor, grain: target.grain };
      }
    }
  }

  /** segmentBy の labels: リストの評価（ADR-39）: リテラルまたはリスト束縛名。
   *  ラベル値の型域は ADR-34 判断 3 と同一（スカラー値・等質・空リスト不可） */
  private windowLabelList(e: Expr, env: Env): (number | string | boolean)[] {
    const v = this.evalExpr(e, env);
    if (!Array.isArray(v)) {
      this.err(`segmentBy(labels:): リスト（リテラルまたはリスト束縛名）を取る: ${kindOf(v)}（ADR-39）`);
    }
    if (v.length === 0) this.err('segmentBy(labels:): 空リストは不可（ADR-39）');
    const out: (number | string | boolean)[] = [];
    for (const x of v) {
      if (typeof x !== 'number' && typeof x !== 'string' && typeof x !== 'boolean') {
        this.err(`segmentBy(labels:): ラベル値は値型（数値・論理・列挙名・文字列。ADR-34 判断 3）: ${kindOf(x)}`);
      }
      out.push(x);
    }
    if (!out.every(x => typeof x === typeof out[0])) {
      this.err('segmentBy(labels:): ラベル列は等質（同一の値型。ADR-34 判断 3）');
    }
    return out;
  }

  /** gen-expr の label: 付与式（§4.9・ADR-34）。ラムダ値を評価時の環境ごと閉包として保持し、
   *  評価は射影時まで遅延する（I7。premise 相対の遅延解決＝ADR-17 はラムダの env が担う） */
  private genLabelFn(e: Extract<Expr, { t: 'gen' }>, env: Env): LambdaV | undefined {
    const labelE = e.named.label;
    if (labelE === undefined) return undefined;
    if (e.word === 'cycle') this.err('cycle は label: を取らない（ラベル列は cycle 自身が持つ。ADR-34）');
    return this.labelLambda(labelE, env);
  }

  private labelLambda(labelE: Expr, env: Env): LambdaV {
    const v = this.evalExpr(labelE, env);
    if (!isObj(v) || v.k !== 'lambda') this.err(`label: はラムダ（付与式）を取る: ${kindOf(v)}（§4.9）`);
    return v;
  }

  // ---------- 本体層: core 段（§4） ----------

  /** core 段ごとの既知 named-arg（ADR-39: 未知の名前付き引数を黙って捨てない——タイポの検査面） */
  private static readonly STAGE_NAMED: Record<string, Set<string>> = {
    within: new Set<string>([]),
    segmentBy: new Set(['edges', 'empties', 'label', 'labels']),
    first: new Set(['of']), nth: new Set(['of']), last: new Set(['of']),
    filter: new Set(['on']),
    roll: new Set(['on']),
    shift: new Set(['unit']),
    snapTo: new Set<string>([]),
    rebase: new Set(['to']),
    stride: new Set(['from']),
    strideBy: new Set(['from']),
  };

  applyStage(stream: StreamV, stage: Stage, env: Env): StreamV {
    const named = (key: string) => stage.args.find(a => a.name === key)?.value;
    const positional = stage.args.filter(a => !a.name).map(a => a.value);
    if (CORE_STAGES.has(stage.name)) {
      const known = Evaluator.STAGE_NAMED[stage.name];
      for (const a of stage.args) {
        if (a.name && !known.has(a.name)) {
          this.err(`${stage.name}: 未知の名前付き引数 ${a.name}:（黙って捨てない——ADR-39）`);
        }
      }
    }

    switch (stage.name) {
      case 'within': {
        const wname = positional[0]?.t === 'name' ? positional[0].name : undefined;
        const w = this.evalExpr(positional[0] ?? this.err('within(w) の窓名が必要'), env);
        const iv = this.intervalsOf(w, env);
        this.checkPartition(iv, wname ?? 'within');
        // ラベルは随伴させない——射影はラベル付き束縛名に限る（ADR-30 の範囲を広げない。ADR-34 帰結）
        const wgrain = isObj(w) && w.k === 'windows' ? w.grain : this.winGrainOf(w);
        this.checkTzMembership(stream.align, wgrain, 'within');   // 免除系の tz 名検査（ADR-40）
        return { k: 'stream', pts: stream.pts,
                 wins: [...stream.wins, { name: wname, iv, grain: wgrain, ann: this.winAnnOfV(w) }],
                 align: stream.align, ann: stream.ann, endless: stream.endless };
      }
      case 'segmentBy': {
        const labelE = named('label');
        const labelFn = labelE ? this.labelLambda(labelE, env) : undefined;   // label: 付与式（§4.9・ADR-34）
        const edges = named('edges') ?? this.err('segmentBy は edges: が必須（I5・§4.2）');
        const empties = named('empties') ?? this.err('segmentBy は empties: が必須（I5・§4.2）');
        const edgesV = this.sym(this.evalExpr(edges, env));
        const emptiesV = this.sym(this.evalExpr(empties, env));
        const markerS = this.toStream(this.evalExpr(positional[0] ?? this.err('segmentBy にマーカーが必要'), env));
        const markers = markerS.pts;
        if (markers.length < 1) this.err('segmentBy: マーカーが空');
        // マーカーの実効被覆域（ADR-37 判断 4）: 覆域は「範囲内に他のマーカーは無い」を保証する——
        // edges:/empties: の発火判定は覆域の端であって列の端ではない
        const cov = complementIv(markerS.ann.map(a => ({ start: a.from, end: a.to })));
        const covOf = (ms: number) => cov.find(x => x.start <= ms && ms < x.end);
        // 窓列への並行ラベル列（ADR-39）: 前提条件と締め・覆域基準の同長性検査（F62 の器）。
        // 検査は窓束縛の評価と同時＝射影の有無に依らず走る（長さ検査はラベル射影を遅延させない）
        const labelsE = named('labels');
        let labels: (number | string | boolean)[] | undefined;
        let labelsCycle: { list: (number | string | boolean)[]; i0: number } | undefined;
        if (labelsE) {
          const form = labelsE.t === 'cycleLabels' ? 'labels: cycle' : 'labels:';
          if (labelFn) {
            this.err('segmentBy: labels: と label: は同居できない——ラベル源の二重化'
              + '（束縛名射影の一意性。ADR-39 判断 4）');
          }
          if (edgesV === 'clip') {
            this.err(`segmentBy(${form}): edges: clip とは組めない——擬似窓（マーカー起点でない窓）が`
              + '窓列序数とリスト添字の対応を黙ってずらす（edges: drop へ。ADR-39 判断 4）');
          }
          if (emptiesV === 'drop') {
            this.err(`segmentBy(${form}): empties: drop とは組めない——空窓の除去が序数を詰め、`
              + 'どのラベルが落ちたかリストから判別できない（empties: keep/error へ。ADR-39 判断 4）');
          }
          if (markerS.endless) {
            this.err(`segmentBy(${form}): 規則マーカー（無限の点列）の窓列はデータラベルの対象外——`
              + '周期ラベルは窓束縛 cycle・計算番号は ordinalIn か label: ラムダで（ADR-39 判断 4・ADR-47）');
          }
          // マーカー流の実効被覆域は全マーカー点を包む単一の無註釈区間であること（合成マーカーの締め。
          // 静的形は窓数確定・cycle 形は位相確定の根拠——註釈域内の未知マーカーは位相を黙ってずらす）
          const home = cov.find(x => x.start <= markers[0] && markers[markers.length - 1] < x.end);
          if (!home) {
            this.err(`segmentBy(${form}): マーカーの実効被覆域が全マーカーを包む単一の無註釈区間でない`
              + '——窓数・位相が確定しない（合成マーカーは束縛後置の covering: で覆域を確定してから。'
              + 'ADR-39 判断 4 / ADR-37 判断 5）');
          }
          if (labelsE.t === 'cycleLabels') {
            // 周期ラベル（ADR-47）: 同長性検査は課さない（周期は任意の窓数を覆う）。
            // i0 はマーカー列基準で計算＝実体化・評価範囲に依存しない（ADR-39 判断 2 の原則）
            const list = this.windowLabelList(labelsE.list, env);
            const anchorMs = this.point(this.evalExpr(labelsE.anchor, env));
            if (anchorMs < markers[0] || anchorMs >= home.end) {
              this.err('segmentBy(labels: cycle): anchor が窓列のいずれの窓にも属さない（頭側・範囲外'
                + '——位相が定まらない）。覆域の更新で anchor の窓が消えた場合は、anchor をリスト周期'
                + '（N 窓）分先の対応する実日へ進めれば全ラベル不変（ADR-47）');
            }
            let i0 = markers.length - 1;
            for (let j = 0; j < markers.length - 1; j++) {
              if (anchorMs < markers[j + 1]) { i0 = j; break; }
            }
            labelsCycle = { list, i0 };
          } else {
            labels = this.windowLabelList(labelsE, env);
            // 同長性検査（覆域基準）: 期待窓数＝マーカー数（ADR-37 の覆域端確定の最終窓を含む。
            // 評価範囲・実体化範囲に依存しない正確な数え方）
            if (labels.length !== markers.length) {
              this.err(`segmentBy(labels:): ラベル列の長さ ${labels.length} ≠ 窓数 ${markers.length}`
                + '（窓数は覆域基準＝マーカー数。マーカーとラベルは対で更新する——ADR-39/F62）');
            }
          }
        }
        const iv: Iv[] = [];
        for (let i = 0; i < markers.length - 1; i++) iv.push({ start: markers[i], end: markers[i + 1] });
        // 覆域内では最終マーカー起点の窓も覆域端まで確定して張る（＝窓列の実効被覆域）
        const mLast = markers[markers.length - 1];
        const tailCov = covOf(mLast);
        const fEnd = Math.min(tailCov ? tailCov.end : mLast, this.rt.computeEnd);
        if (fEnd > mLast) iv.push({ start: mLast, end: fEnd });
        const defEnd = iv.length ? iv[iv.length - 1].end : mLast;   // 確定窓の末端
        // 頭側（覆域始端〜最初のマーカー）だけが edges: の領分。覆域外の点は範囲外＝註釈が引き受ける
        if (edgesV === 'error') {
          const headCov = covOf(markers[0]);
          const headStart = Math.max(headCov ? headCov.start : markers[0], this.rt.epoch);
          const outside = stream.pts.some(p => p >= headStart && p < markers[0]);
          if (outside) this.err('segmentBy(edges: error): 窓の外に点がある');
        }
        let windows = iv;
        if (edgesV === 'clip') {
          windows = [{ start: this.rt.epoch, end: markers[0] }, ...iv];
          if (defEnd < this.rt.computeEnd) windows = [...windows, { start: defEnd, end: this.rt.computeEnd }];
        }
        if (emptiesV !== 'keep') {
          // スイープで各窓の要素数を数える（点・窓ともソート済み）
          const nonEmpty = new Set<number>();
          let wi = 0;
          for (const p of stream.pts) {
            while (wi < windows.length && p >= windows[wi].end) wi++;
            if (wi >= windows.length) break;
            if (p >= windows[wi].start) nonEmpty.add(wi);
          }
          const empties_ = windows.map((_, i) => i).filter(i => !nonEmpty.has(i));
          if (emptiesV === 'error' && empties_.length > 0) this.err('segmentBy(empties: error): 空窓がある');
          if (emptiesV === 'drop') windows = windows.filter((_, i) => nonEmpty.has(i));
        }
        const pts = edgesV === 'drop'
          ? stream.pts.filter(p => p >= markers[0] && p < defEnd)
          : stream.pts;
        // 窓の切れ目＝マーカー点なので、この窓列の grain はマーカーの整列（snapTo の主張に使う）。
        // 窓列の註釈＝マーカー覆域の補集合（判断 4）——分類器（判断 6）の基準になる実効被覆域。
        // 精密化（ADR-37 改訂 3・F105）: マーカー覆域内でも窓の張られていない区間（edges: drop/error の
        // 頭側・empties: drop の中抜け）は窓列としては語れない——窓列由来の註釈にする（射影・coincides の
        // 分類器が「落として註釈」を選べる。末尾の覆域端確定＝F72 の頭側対称）。覆域註釈のない
        // 規則マーカーは従来どおり対象外
        let winAnn = markerS.ann;
        if (markerS.ann.length > 0 && windows.length > 0) {
          const like = markerS.ann.find(a => a.to <= windows[0].start) ?? markerS.ann[0];
          const lo = Math.max(covOf(markers[0])?.start ?? markers[0], this.rt.epoch);
          const gaps: Ann[] = [];
          let prev = lo;
          for (const w of windows) {
            if (prev < w.start) gaps.push({ ...like, from: prev, to: w.start });
            prev = Math.max(prev, w.end);
          }
          if (gaps.length > 0) winAnn = annUnion(markerS.ann, gaps);
        }
        return { k: 'stream', pts,
                 wins: [...stream.wins, { iv: windows, labelFn, grain: markerS.align, ann: winAnn, labels, labelsCycle }],
                 align: stream.align, ann: annUnion(stream.ann, markerS.ann), endless: stream.endless };
      }
      case 'first': case 'last': case 'nth': {
        if (stream.wins.length === 0) this.err(`選択子 ${stage.name} は窓なしでは型エラー（I4）`);
        let n = 1;
        if (stage.name === 'nth') n = this.num(this.evalExpr(positional[0] ?? this.err('nth(n) の n が必要'), env));
        const ofE = named('of');
        let level = stream.wins.length - 1;   // 既定は最内窓（§4.3）
        if (ofE) {
          const ofName = ofE.t === 'name' ? ofE.name : this.err('of: は窓名');
          level = stream.wins.findIndex(w => w.name === ofName);
          if (level < 0) this.err(`of: ${ofName} に該当する窓がない`);
        }
        const iv = stream.wins[level].iv;
        this.checkTzMembership(stream.align, stream.wins[level].grain, `選択子 ${stage.name}`);   // ADR-40
        // 判断 4（選択子）: 対象窓が註釈区間に交差したら窓全域へ拡幅（窓内の序数は覆域外を覗き得る）
        const combined = annUnion(stream.ann, stream.wins[level].ann);
        const widened: Ann[] = [];
        const out: number[] = [];
        let pi = 0;
        for (const w of iv) {
          for (const a of combined) {
            if (a.from < w.end && w.start < a.to) widened.push({ ...a, from: w.start, to: w.end });
          }
          const inWin: number[] = [];
          while (pi < stream.pts.length && stream.pts[pi] < w.start) pi++;
          let pj = pi;
          while (pj < stream.pts.length && stream.pts[pj] < w.end) inWin.push(stream.pts[pj++]);
          pi = pj;
          if (inWin.length === 0) continue;    // 空は正当な値（I15/ADR-15）
          if (stage.name === 'first') out.push(inWin[0]);
          else if (stage.name === 'last') out.push(inWin[inWin.length - 1]);
          else if (n >= 1 && n <= inWin.length) out.push(inWin[n - 1]);
        }
        return { k: 'stream', pts: out, wins: stream.wins.slice(0, level), align: stream.align,
                 ann: annUnion(combined, widened), endless: stream.endless };  // 対象窓と内側を消費
      }
      case 'filter': {
        const onE = named('on');
        if (onE || !positional[0]) {
          // on: 明示、または前文 axis: の畳み込み（どちらも軸＝等値所属。ADR-35 の読み替えも通す）
          const axisS = this.toStream(this.evalAxis(onE ?? this.axisMember(env, 'filter'), env));
          this.checkAlign(stream.align, axisS.align, 'filter(on:)');
          const set = new Set(axisS.pts);
          return { ...stream, pts: stream.pts.filter(p => set.has(p)),
                   ann: annUnion(stream.ann, axisS.ann),     // 等値所属は軸の覆域に依存（判断 4）
                   endless: stream.endless && axisS.endless };   // 積と同型（軸が有限なら出力も有限）
        }
        const pred = this.evalExpr(positional[0], env);
        // 判断 4/6: 述語が範囲外参照を要求した点は落とし、依存の註釈区間を出力に註釈（共通経路）
        return this.filterByPredicate(stream, p =>
          this.bool(this.applyValue(pred, [{ k: 'point', ms: p }], env)));
      }
      case 'roll': {
        const conv = this.sym(this.evalExpr(positional[0] ?? this.err('roll は規約が必要（I3）'), env));
        const axisS = this.toStream(this.evalAxis(named('on') ?? this.axisMember(env, 'roll'), env));
        this.checkAlign(stream.align, axisS.align, 'roll(on:)');
        const axis = axisS.pts;
        if (conv === 'Modified') this.err('Modified は未実装（プロトタイプ）');
        if (conv !== 'Following' && conv !== 'Preceding') this.err(`未知のロール規約: ${conv}`);
        const pts: number[] = [];
        for (const p of stream.pts) {
          if (ptIndexOf(axis, p) >= 0) { pts.push(p); continue; }   // 有効点は動かない
          if (conv === 'Following') {
            const i = ptUpperBound(axis, p);
            if (i < axis.length) { pts.push(axis[i]); continue; }
          } else {
            const i = ptUpperBound(axis, p) - 1;
            if (i >= 0) { pts.push(axis[i]); continue; }
          }
          // 着地先が無い＝軸の尽き。三分岐（ADR-37 判断 6/8）:
          if (annAt(axisS.ann, p).length > 0) continue;   // ②実効被覆域外→空＋註釈（依存像が張る）
          if (axis.length > 0
            && (conv === 'Following' ? axis[axis.length - 1] >= this.rt.toMs : axis[0] <= this.rt.fromMs)) {
            // ①実体化地平線（軸は評価需要域の外まで実体化されている＝データ端ではない）
            this.rt.warnings.push(`horizon-clip: roll(${conv}) ${this.rt.fmt(p)}`
              + '（計算範囲 to+400日 の実体化地平線——言語の地平線ではない。ADR-37 判断 8）');
            continue;
          }
          continue;   // ③完結データ（開端 covering）の正当な尽き→註釈なしの空（ADR-15）
        }
        // 出力註釈＝入力註釈の像 ∪ 軸の註釈区間の依存像（判断 4 の roll 行）
        const ann = annUnion(rollImageAnn(stream.ann, axis, conv), dependImageAnn(axisS.ann, axis, conv));
        return { ...stream, pts: [...new Set(pts)].sort((a, b) => a - b), ann };
      }
      case 'shift': {
        const n = this.num(this.evalExpr(positional[0] ?? this.err('shift(n) の n が必要'), env));
        const unitV = this.evalAxis(named('unit') ?? this.axisMember(env, 'shift'), env);
        const pts: number[] = [];
        let align: GridTag | null;
        let ann: Ann[];
        if (isObj(unitV) && unitV.k === 'windows') {
          // 窓単位: 属する窓の添字を n 動かし、窓内オフセットを保存（区間所属＝整列検査なし。ADR-36）。
          // 出力整列は「入力整列＝単位窓の要素グリッド」なら保存、さもなくば なし
          align = gridEq(stream.align, unitV.grain) ? stream.align : null;
          for (const p of stream.pts) {
            const i = ivIndexOf(unitV.iv, p);
            if (i < 0) {
              if (p >= this.rt.computeEnd || p < this.rt.epoch) {   // ①実体化地平線（判断 8）
                this.rt.warnings.push(`horizon-clip: shift ${this.rt.fmt(p)}`
                  + '（計算範囲 to+400日 の実体化地平線——言語の地平線ではない。ADR-37 判断 8）');
                continue;
              }
              this.err('shift: 点が単位窓の外');
            }
            const j = i + n;
            if (j < 0 || j >= unitV.iv.length) {                    // ①窓語 unit は暦法純粋＝地平線
              this.rt.warnings.push(`horizon-clip: shift ${this.rt.fmt(p)}`
                + '（計算範囲 to+400日 の実体化地平線——言語の地平線ではない。ADR-37 判断 8）');
              continue;
            }
            pts.push(unitV.iv[j].start + (p - unitV.iv[i].start));
          }
          // 判断 4: 入力註釈 ∪ n·U 平行移動した像（窓添字ずらしの像）
          ann = annUnion(stream.ann, shiftAnnByWindows(stream.ann, unitV.iv, n));
        } else {
          // 点列軸（bizDay 等）: 軸上の位置を n 動かす。等値所属なので整列検査（ADR-36）
          const axisS = this.toStream(unitV);
          this.checkAlign(stream.align, axisS.align, 'shift(unit: 点列軸)');
          align = axisS.align;
          const axis = axisS.pts;
          let extra: Ann[] = [];
          for (const p of stream.pts) {
            const i = ptIndexOf(axis, p);
            if (i < 0) {
              const hit = annAt(axisS.ann, p);
              if (hit.length > 0) { extra = annUnion(extra, hit); continue; }   // ②範囲外→落として註釈
              this.err('shift: 点が軸上にない（先に roll で有効点へ寄せる）');
            }
            const j = i + n;
            if (j >= 0 && j < axis.length) { pts.push(axis[j]); continue; }
            // 着地が軸の外＝軸の尽き。三分岐（判断 6/8）
            const beyond = j >= axis.length;
            const edgeProbe = beyond ? axis[axis.length - 1] + 1 : axis[0] - 1;
            const hit = annAt(axisS.ann, edgeProbe);
            if (hit.length > 0) { extra = annUnion(extra, hit); continue; }     // ②
            if (beyond ? axis[axis.length - 1] >= this.rt.toMs : axis[0] <= this.rt.fromMs) {
              this.rt.warnings.push(`horizon-clip: shift ${this.rt.fmt(p)}`
                + '（計算範囲 to+400日 の実体化地平線——言語の地平線ではない。ADR-37 判断 8）');
              continue;                                                          // ①
            }
            continue;                                                            // ③完結の尽き
          }
          // 判断 4: 入力註釈 ∪ 軸上 n 歩の平行移動像（満了 90 日前通知の漏れを塞ぐ側）
          ann = annUnion(stream.ann, shiftAnnByAxis(stream.ann, axis, n), extra);
        }
        return { ...stream, pts: pts.sort((a, b) => a - b), align, ann };
      }
      case 'snapTo': {
        const wV = this.evalExpr(positional[0] ?? this.err('snapTo(w) の窓が必要'), env);
        const w = this.intervalsOf(wV, env);
        const wAnn = this.winAnnOfV(wV);
        const pts: number[] = [];
        let extra: Ann[] = [];
        for (const p of stream.pts) {
          const i = ivIndexOf(w, p);
          if (i >= 0) { pts.push(w[i].start); continue; }
          // 点が窓の外。三分岐（ADR-37 判断 6/8）:
          if (p >= this.rt.computeEnd || p < this.rt.epoch) {   // ①実体化地平線
            this.rt.warnings.push(`horizon-clip: snapTo ${this.rt.fmt(p)}`
              + '（計算範囲 to+400日 の実体化地平線——言語の地平線ではない。ADR-37 判断 8）');
            continue;
          }
          const hit = annAt(wAnn, p);
          if (hit.length > 0) { extra = annUnion(extra, hit); continue; }   // ②範囲外→落として註釈
          this.err('snapTo: 点が窓の外');                                    // ③覆域内→硬エラー維持
        }
        // ADR-36 判断 5: 出力は w の要素グリッドを主張（＝再整列の明示手段）。
        // 註釈の像は端点を窓先頭へ床処理（覆域の端を窓粒度で解決）
        return { ...stream, pts: [...new Set(pts)].sort((a, b) => a - b), align: this.winGrainOf(wV),
                 ann: annUnion(snapAnn(stream.ann, w), extra) };
      }
      case 'rebase': {
        // 日付ラベル保存の再錨（仮称 rebase・ADR-40）: 各点（source tz の市民日の先頭点）の日付ラベルを
        // to tz の同日付の市民日の最初の瞬間へ写す（ADR-33 判断 4）。単射・順序保存
        const toE = named('to') ?? this.err('rebase は to: が必須（対象座標系の tz 名。ADR-40）');
        const toV = this.evalExpr(toE, env);
        if (typeof toV !== 'string') {
          this.err(`rebase: to: は tz 名の文字列リテラルを取る: ${kindOf(toV)}（premise 名は不可——ADR-40 判断 5）`);
        }
        // 入力は既定整列の day グリッド（G＝幅 1d・日内オフセット 0・tz 名つき）——source tz は整列から
        const g = stream.align;
        if (isVacuous(g)) return stream;   // 空テーブル＝点ゼロの再錨は恒等（空虚適合。ADR-45）
        if (!g || g.kind !== 'civil' || g.step !== 1 || g.off !== 0 || !g.tz) {
          this.err('rebase: 入力は既定整列の day グリッド（幅 1d・日内オフセット 0・tz 名つき）を要求'
            + `——現在の整列=${gridDesc(g)}。時刻つき・anchor つき・整列なしは静的エラー`
            + '（時刻保存の再錨は将来拡張——rebase＋同 tz 化後の coincides で書ける。ADR-40 判断 4）');
        }
        if (g.tz === toV) return stream;   // source == to は恒等（ADR-40 判断 5）
        const srcTz = getTz(g.tz);
        const toTz = getTz(toV);
        const mapDay = (dayStart: number): number => {
          const f = srcTz.localFields(dayStart);
          const t = toTz.civilDayStart(f.y, f.mo, f.d);
          const tf = toTz.localFields(t);
          if (tf.y !== f.y || tf.mo !== f.mo || tf.d !== f.d) {
            const pp = (n: number) => String(n).padStart(2, '0');
            this.err(`rebase: 存在しない日付 ${f.y}-${pp(f.mo)}-${pp(f.d)}（tz "${toV}" に無い——`
              + '日付変更線の移動で消えた日。ADR-33 判断 9 のデータ相対エラー・ADR-40 判断 3）');
          }
          return t;
        };
        // 日付順は tz に依らず同順＝単射・順序保存。写像は東行きで最大 1 日ぶん実体化範囲を
        // 越え得るため、計算範囲端でクリップ（実装の近似地平線——ADR-37 判断 8 と同じ据え方）
        const pts = stream.pts.map(mapDay).filter(p => p < this.rt.computeEnd);
        // 註釈の輸送（ADR-37 輸送表の rebase 行）: 端点を source の day 窓へ floor/ceil で膨らませて
        // からラベル対応で写す（過大近似許容）。存在しない日付の端は安全側の隣日へ広げる
        const mapEdge = (ms: number, up: boolean): number => {
          if (!isFinite(ms)) return ms;
          let day = srcTz.floorToDay(ms);
          if (up && day < ms) day = srcTz.addCivilDays(day, 1);   // ceil
          for (let k = 0; k < 3; k++) {
            const f = srcTz.localFields(day);
            const t = toTz.civilDayStart(f.y, f.mo, f.d);
            const tf = toTz.localFields(t);
            if (tf.y === f.y && tf.mo === f.mo && tf.d === f.d) return t;
            day = srcTz.addCivilDays(day, up ? 1 : -1);
          }
          return up ? Infinity : -Infinity;
        };
        const ann = normAnn(stream.ann.map(a => ({ ...a, from: mapEdge(a.from, false), to: mapEdge(a.to, true) })));
        // 出力整列は to tz の day グリッド（構成的・ADR-36 整列表の rebase 行）
        const align: GridTag = { kind: 'civil', step: 1, phase: 0, off: 0, tz: toV };
        return { ...stream, pts, align, ann };
      }
      case 'stride': {
        const n = this.num(this.evalExpr(positional[0] ?? this.err('stride(n) の n が必要'), env));
        // n の域（ADR-38 判断 12）: stride(0) が JS 剰余で「黙って空」になる故障クラスの根絶
        if (!Number.isInteger(n) || n < 1) {
          this.err(`stride: n は 1 以上の整数（${n} は不可。ADR-38 判断 12）`);
        }
        const fromE = named('from') ?? this.err('stride: from: が必須（起点の明示。ADR-31・§4.7）');
        const anchor = this.point(this.evalExpr(fromE, env));
        // 判断 4（ストライド）: 歩行が註釈区間に交差したら最初の交差点から先すべて（位相は状態＝汚染は伝染）
        const tails = stream.ann.filter(a => a.to > anchor)
          .map(a => ({ ...a, from: Math.max(a.from, anchor), to: Infinity }));
        const ann = annUnion(stream.ann, tails);
        const start = stream.pts.findIndex(p => p >= anchor);
        if (start < 0) return { ...stream, pts: [], ann };
        return { ...stream, pts: stream.pts.slice(start).filter((_, i) => i % n === 0), ann };
      }
      case 'strideBy': {
        const wV = this.evalExpr(positional[0] ?? this.err('strideBy(w) の幅が必要'), env);
        if (!isObj(wV) || wV.k !== 'width') this.err('strideBy は幅リテラルを取る');
        const fromE = named('from') ?? this.err('strideBy: from: が必須（起点の明示。ADR-31・§4.7）');
        const anchor = this.point(this.evalExpr(fromE, env));
        const mod = (a: number, b: number) => ((a % b) + b) % b;
        const pts: number[] = [];
        let align: GridTag;
        if (wV.w.kind === 'civil') {
          // 市民時幅は市民日で歩進＝壁時計保存（DST の日は 23/25h。ADR-11/12）。
          // 日内オフセットは壁時計ラベル読み——grid の時刻付き anchor と同じ規定（ADR-31 改訂 2＝F87）
          const tz = this.tzObjOf(env);
          const aDay = tz.floorToDay(anchor);
          const off = anchor === aDay ? 0 : tz.timeOfDayLabel(anchor);
          const days = tz.dayStarts(this.rt.computeEnd + DAY_MS);
          const aIdx = tz.dayIndex(aDay);
          for (let i = aIdx; i < days.length; i += wV.w.days) {
            const t = off === 0 ? days[i] : tz.atTimeOfDay(days[i], off);
            if (t >= this.rt.computeEnd) break;
            pts.push(t);
          }
          align = { kind: 'civil', step: wV.w.days, phase: mod(aIdx, wV.w.days), off,
                    tz: this.tzNameOf(env) };
        } else {
          const step = wV.w.ms;
          for (let t = anchor; t < this.rt.computeEnd; t += step) pts.push(t);
          align = { kind: 'elapsed', step, phase: mod(anchor, step), off: 0, tz: '' };
        }
        // ADR-36: strideBy の出力は定義上 anchor 付きグリッドの目盛りそのもの。
        // 生成子（入力の点に依存しない幅の等差列）＝暦法純粋な再生成なので註釈を生まない
        return { k: 'stream', pts, wins: [], align, ann: [], endless: true };
      }
      default: {
        // 糖衣段: 束縛を呼び出し時の在圏 premise で解決し、右辺を機械的に差し込む（§4.8）
        const binding = this.lookupBinding(stage.name, env);
        if (!binding) this.err(`未知の段: ${stage.name}`);
        const locals = this.bindParams(binding.decl.params, stage.args, env, stage.name);
        const defEnv = childEnv(binding.premise ? { ...env, premise: binding.premise } : env, locals);
        return this.applyTransform(binding.decl.rhs, defEnv, stream);
      }
    }
  }

  /** 糖衣右辺の変換適用: 基底 B（s => s |> …）とポイントフリー略記 A の両方（§4.8） */
  private applyTransform(rhs: Expr, env: Env, stream: StreamV): StreamV {
    if (rhs.t === 'lambda') {   // 基底 B
      const v = this.applyValue({ k: 'lambda', params: rhs.params, body: rhs.body, env }, [stream], env);
      return this.toStream(v);
    }
    if (rhs.t === 'pipe') {     // 略記 A: 先頭段から合成
      let s = this.applyTransform(rhs.head, env, stream);
      for (const st of rhs.stages) s = this.applyStage(s, st, env);
      return s;
    }
    if (rhs.t === 'call' && rhs.callee.t === 'name') {
      return this.applyStage(stream, { name: rhs.callee.name, args: rhs.args }, env);
    }
    if (rhs.t === 'name') {
      return this.applyStage(stream, { name: rhs.name, args: [] }, env);
    }
    this.err('糖衣の右辺を変換として適用できない（生成子を含む糖衣は生成子位置で使う）');
  }

  private axisMember(env: Env, op: string): Expr {
    const m = env.members.get('axis');
    if (!m) this.err(`${op}: 軸がない（on:/unit: を書くか前文で axis: を宣言。§3.3 は宣言必須）`);
    return typeof m === 'string' ? { t: 'name', name: m } : m;
  }

  // ---------- 型の取り出し・変換 ----------

  toStream(v: V, name?: string): StreamV {
    if (isObj(v)) {
      if (v.k === 'stream') return v;
      if (v.k === 'windows') {
        return { k: 'stream', pts: v.units.filter(p => p < this.rt.computeEnd),
                 wins: [{ name: name ?? v.name, iv: v.iv, labelFn: v.labelFn, grain: v.grain, ann: [] }],
                 align: v.grain, ann: [], endless: true };
      }
      if (v.k === 'table') {
        // 覆域の補集合＝範囲外註釈（ADR-37 判断 1）。参照は被覆サマリにも記録（判断 7 (b)）
        this.registerCoverage(v.src ?? '(無名テーブル)', v.covDesc, v.covIv, v.concluded, v.asof);
        return { k: 'stream', pts: v.pts.slice(), wins: [], align: v.align, ann: this.tableAnn(v),
                 endless: false };
      }
      if (v.k === 'point') return { k: 'stream', pts: [v.ms], wins: [], align: null, ann: [], endless: false };
      if (v.k === 'instant') this.err('everyInstant は strideBy(w, from:) と併用する（プロトタイプ）');
    }
    this.err(`時間ストリームではない: ${kindOf(v)}`
      + (Array.isArray(v) && v.length === 0 ? '（空リストは covering: を付ければ空テーブル。ADR-45）' : ''));
  }

  /** snapTo/within の対象窓の要素グリッド（ADR-36 判断 2 の「要素グリッド」）。
   *  windows＝生成連鎖の grain・窓つきストリーム＝最内窓の grain（segmentBy はマーカーの整列） */
  private winGrainOf(v: V): GridTag | null {
    if (isObj(v)) {
      if (v.k === 'windows') return v.grain;
      if (v.k === 'stream' && v.wins.length > 0) return v.wins[v.wins.length - 1].grain ?? null;
    }
    return null;
  }

  toPoints(v: V): number[] {
    return this.toStream(v).pts;
  }

  private windowsOf(v: V): WindowsV {
    if (isObj(v) && v.k === 'windows') return v;
    this.err(`窓（パーティション）ではない: ${kindOf(v)}`);
  }

  /** 窓相当（windows・cycle・窓つきストリーム）から区間列を得る */
  intervalsOf(v: V, env: Env): Iv[] {
    if (isObj(v)) {
      if (v.k === 'windows') return v.iv;
      if (v.k === 'cycle') return v.iv;
      if (v.k === 'stream' && v.wins.length > 0) return v.wins[v.wins.length - 1].iv;
    }
    this.err(`窓として使えない値: ${kindOf(v)}`);
  }

  private checkPartition(iv: Iv[], name: string) {
    for (let i = 1; i < iv.length; i++) {
      if (iv[i].start !== iv[i - 1].end) {
        this.rt.warnings.push(`I5: 窓 ${name} は連続でない（${this.rt.fmt(iv[i - 1].end)} 付近）`);
        return;
      }
    }
  }

  // ---------- プリミティブ取り出し ----------

  private num(v: V): number {
    if (typeof v === 'number') return v;
    this.err(`数値ではない: ${kindOf(v)}`);
  }
  private bool(v: V): boolean {
    if (typeof v === 'boolean') return v;
    this.err(`論理値ではない: ${kindOf(v)}`);
  }
  private sym(v: V): string {
    if (typeof v === 'string') return v;
    this.err(`ラベルではない: ${kindOf(v)}`);
  }
  private point(v: V): number {
    if (isObj(v) && v.k === 'point') return v.ms;
    this.err(`時点ではない: ${kindOf(v)}`);
  }

  private err(msg: string): never {
    throw new KairosError(msg);
  }
}
