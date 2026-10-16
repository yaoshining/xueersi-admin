import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT 必须是有效端口');
// 当前版本尚未实现管理端身份验证，只监听本机回环地址。
const app = await buildApp({
  webRoot:
    process.env.SERVE_WEB === 'true'
      ? fileURLToPath(new URL('../../web/dist', import.meta.url))
      : undefined,
});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    void app.close();
  });
await app.listen({ host: '127.0.0.1', port });
console.info(`学伴本机服务：http://127.0.0.1:${port}`);
