import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// テストは同居する参照実装の正本（../impl/src）に対して走らせる——公開パッケージ kairos-lang の版に依らず、
// 「いまの impl と同じ契約」を検査する（1.0.7 の npm 公開前でも走る）。配布物は kairos-lang/cli を解決する。
export default defineConfig({
  resolve: {
    alias: {
      'kairos-lang/cli': fileURLToPath(new URL('../impl/src/cli.ts', import.meta.url)),
      'kairos-lang': fileURLToPath(new URL('../impl/src/index.ts', import.meta.url)),
    },
  },
  test: { testTimeout: 30_000 },
});
