// 評価の worker（子プロセス＝child_process.fork）。評価は同期で CPU を使うので、待ち受けのプロセスから切り離す＝1 要求の時間を打ち切れる・
// /healthz が常に応答する・評価器のヒープ枯渇（V8 の致命エラー＝catch できず、worker スレッドでもプロセスごと落ちる＝実測）が
// 殻のプロセスを落とさない（2026-10-31 セキュリティレビュー所見 1・3）。
// 評価器の読み込み元: 既定は npm の kairos-lang（lock の版）。KAIROS_HTTP_EVALUATOR（kairos-lang のソース木のディレクトリ・cli.ts と index.ts）が
// あればそこから読む＝同居する参照実装の正本（../impl/src）に対する witness のため。普段は設定しない。
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRoutes } from './routes.ts';
import type { Evaluator, Route, Body } from './routes.ts';

const EVALUATOR = process.env.KAIROS_HTTP_EVALUATOR;
const cliSpec = EVALUATOR ? pathToFileURL(join(EVALUATOR, 'cli.ts')).href : 'kairos-lang/cli';
const langSpec = EVALUATOR ? pathToFileURL(join(EVALUATOR, 'index.ts')).href : 'kairos-lang';
const [cli, lang] = await Promise.all([import(cliSpec), import(langSpec)]) as [typeof import('kairos-lang/cli'), typeof import('kairos-lang')];
const ev: Evaluator = { cmdList: cli.cmdList, cmdNext: cli.cmdNext, supplyResolver: cli.supplyResolver, errorReport: cli.errorReport, todayIn: cli.todayIn,
  parse: lang.parse, KairosError: lang.KairosError, SupplyError: lang.SupplyError };
const routes = createRoutes(ev);

export interface Job { id: number; route: Route; body: Body; maxResponseBytes: number }
export interface Reply { id: number; status: number; text: string }

const send = (r: Reply) => { process.send!(r); };
process.on('message', (job: Job) => {
  try {
    send({ id: job.id, ...routes.render(job.route, routes.run(job.route, job.body), job.maxResponseBytes) });
  } catch {
    const o = routes.internalError();
    send({ id: job.id, status: o.status, text: JSON.stringify(o.body, null, 2) + '\n' });
  }
});
process.on('disconnect', () => process.exit(0));   // 親が居なくなったら終わる
send({ id: 0, status: 0, text: '' });   // 準備完了（評価器を読み終えた）
