import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// テストは同居する参照実装の正本（../impl/src）に対して走らせる——公開パッケージ kairos-lang の版に依らず、
// 「いまの impl と同じ契約」を検査する（1.0.7 の npm 公開前でも走る）。配布物は kairos-lang/cli を解決する。
// 評価の worker（src/worker.ts）は Node が直接読むので alias が効かない＝テストは KAIROS_HTTP_EVALUATOR で同じ ../impl/src を当てる
// （test/server.test.ts の先頭）。worker を .ts のまま動かすので、テストの実行は Node 22.18 以上（型の剥がし）。配布物（dist）は Node 20 以上
export default defineConfig({
  resolve: {
    alias: {
      'kairos-lang/cli': fileURLToPath(new URL('../impl/src/cli.ts', import.meta.url)),
      'kairos-lang': fileURLToPath(new URL('../impl/src/index.ts', import.meta.url)),
    },
  },
  test: { testTimeout: 30_000 },
});
