#!/usr/bin/env node
// HTTP で待ち受ける入口（`npx kairos-lang-http`・Docker の CMD）。ログは stderr（本文＝source は書かない）
import { createServer, optionsFromEnv, SHELL_VERSION, KAIROS_LANG_VERSION } from './server.ts';

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(SHELL_VERSION);
} else {
  const opts = optionsFromEnv();
  const port = Number(process.env.PORT ?? 8080);
  const server = createServer(opts);
  server.listen(port, () => {
    console.error(`kairos-lang-http ${SHELL_VERSION} (kairos-lang ${KAIROS_LANG_VERSION}): listening on :${port} (max concurrency ${opts.maxConcurrency})`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
