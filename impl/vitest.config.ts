import { defineConfig } from 'vitest/config';

// 有界実体化のプロトタイプはテストが計算重（hour 級グリッド・多年 everyDay の値射影）で、
// ワーカー並列時に既定 5s を超えることがある——タイムアウトは「遅い」でなく「壊れた」の検出に使う
export default defineConfig({
  test: { testTimeout: 30_000 },
});
