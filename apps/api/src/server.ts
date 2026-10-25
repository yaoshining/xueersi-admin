import { readFileSync } from 'node:fs';
import { parseNasConfig } from './nas-security';
import { loadLocalConnector } from './connector';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
const nas = parseNasConfig(process.env);
if (
  nas &&
  (!process.env.TLS_KEY_FILE ||
    !process.env.TLS_CERT_FILE ||
    !process.env.TAL_KEY_FILE ||
    !process.env.TAL_SESSION_FILE)
)
  throw new Error('NAS 缺少 TLS 或持久化密钥配置');
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT 必须是有效端口');
// 默认仅监听本机回环；显式 NAS 配置启用 HTTPS 和管理端身份验证。
const databasePath =
  process.env.DATABASE_PATH === ':memory:'
    ? ':memory:'
    : resolve(
        process.env.DATABASE_PATH ??
          fileURLToPath(
            new URL('../../../data/drafts.sqlite', import.meta.url),
          ),
      );
if (databasePath !== ':memory:')
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
const app = await buildApp({
  nas,
  tls: nas
    ? {
        key: readFileSync(process.env.TLS_KEY_FILE!),
        cert: readFileSync(process.env.TLS_CERT_FILE!),
      }
    : undefined,
  databasePath,
  handoffOrigin:
    process.env.TAL_EXTENSION_ORIGIN &&
    /^chrome-extension:\/\/[a-p]{32}$/.test(process.env.TAL_EXTENSION_ORIGIN)
      ? process.env.TAL_EXTENSION_ORIGIN
      : undefined,
  adapter: await loadLocalConnector(
    process.env.TAL_READONLY_MODULE,
    process.env.TAL_PAIRING_KEY_FILE,
    process.env.TAL_SESSION_FILE,
    nas ? process.env.TAL_KEY_FILE : undefined,
  ),
  migrationsFolder: fileURLToPath(
    new URL(
      import.meta.url.endsWith('.ts')
        ? '../../../packages/db/migrations'
        : './migrations',
      import.meta.url,
    ),
  ),
  webRoot:
    process.env.SERVE_WEB === 'true'
      ? fileURLToPath(new URL('../../web/dist', import.meta.url))
      : undefined,
});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    void app.close();
  });
await app.listen({ host: nas ? '0.0.0.0' : '127.0.0.1', port });
console.info(
  nas
    ? `学伴局域网服务：${nas.origin}`
    : `学伴本机服务：http://127.0.0.1:${port}`,
);
