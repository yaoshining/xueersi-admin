import type { ServerOptions } from 'node:https';
import { nasGuard, type NasConfig } from './nas-security';
import { registerHomeworkMedia, type MediaReader } from './homework-media';
import { registerAgentDrafts } from './agent-drafts';
import { openDraftStore } from '@xueersi/db';
import { registerHomeworkDelete } from './homework-delete';
import { registerSync } from './sync';
import { registerDrafts } from './drafts';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { HomeworkResponseSchema } from '@xueersi/contracts';
import { businessDate } from '@xueersi/domain';
import {
  ConnectionRequiredError,
  ReadonlyTalAdapter,
  ReadFailure,
} from '@xueersi/tal-adapter';

export async function buildApp(
  options: {
    nas?: NasConfig;
    tls?: Pick<ServerOptions, 'key' | 'cert'>;
    mediaReader?: MediaReader;
    webRoot?: string;
    databasePath?: string;
    migrationsFolder?: string;
    adapter?: ReadonlyTalAdapter;
    handoffOrigin?: string;
  } = {},
) {
  const app = Fastify({
    logger: false,
    bodyLimit: 8 * 1024 * 1024,
    ...(options.tls ? { https: options.tls } : {}),
  });
  const store = openDraftStore(
    options.databasePath ?? ':memory:',
    options.migrationsFolder,
  );
  const adapter = options.adapter ?? new ReadonlyTalAdapter();
  app.addHook('onClose', async () => {
    store.close();
    adapter.shutdown();
  });
  if (options.nas) app.addHook('onRequest', nasGuard(options.nas));
  app.addHook('onRequest', async (request, reply) => {
    if (options.nas) return;
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host ?? ''))
      return reply.code(403).send({ error: { code: 'LOCAL_ONLY' } });
    if (!request.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    const origin = request.headers.origin;
    if (
      ['/api/v1/session/pairing', '/api/v1/session/renewal'].includes(
        request.url,
      )
    ) {
      if (
        !options.handoffOrigin ||
        origin !== options.handoffOrigin ||
        !['POST', 'OPTIONS'].includes(request.method)
      )
        return reply.code(403).send({ error: { code: 'ORIGIN_DENIED' } });
      reply
        .header('Access-Control-Allow-Origin', origin)
        .header('Vary', 'Origin')
        .header('Access-Control-Allow-Methods', 'POST')
        .header(
          'Access-Control-Allow-Headers',
          'Content-Type, X-Pairing-Key, X-Local-Request',
        );
      if (request.method === 'OPTIONS') return reply.code(204).send();
      if (request.headers['x-local-request'] !== '1')
        return reply
          .code(403)
          .send({ error: { code: 'LOCAL_HEADER_REQUIRED' } });
      return;
    }
    if (
      request.url === '/api/v1/session' &&
      ['POST', 'OPTIONS'].includes(request.method) &&
      (origin === 'https://baodian.tal.com' ||
        (options.handoffOrigin && origin === options.handoffOrigin))
    ) {
      reply
        .header('Access-Control-Allow-Origin', origin)
        .header('Vary', 'Origin')
        .header('Access-Control-Allow-Methods', 'POST')
        .header(
          'Access-Control-Allow-Headers',
          'Content-Type, X-Pairing-Key, X-Local-Request',
        );
      if (request.method === 'OPTIONS') return reply.code(204).send();
      return;
    }
    if (
      (origin && origin !== `http://${request.headers.host}`) ||
      request.headers['sec-fetch-site'] === 'cross-site'
    )
      return reply.code(403).send({ error: { code: 'ORIGIN_DENIED' } });
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      request.headers['x-local-request'] !== '1'
    )
      return reply.code(403).send({ error: { code: 'LOCAL_HEADER_REQUIRED' } });
  });
  app.setErrorHandler((error, _request, reply) =>
    reply
      .code(
        (error as { statusCode?: number }).statusCode === 413
          ? 413
          : (error as { statusCode?: number }).statusCode === 400
            ? 400
            : 500,
      )
      .send({ error: { code: 'LOCAL_SERVICE_ERROR' } }),
  );
  registerDrafts(app, store);
  registerAgentDrafts(app, store, adapter);
  registerSync(app, store, adapter);
  registerHomeworkDelete(app, store, adapter);
  registerHomeworkMedia(app, adapter, options.mediaReader);
  app.get('/api/v1/homework/report', async (request, reply) => {
    try {
      return await adapter.report(
        request.query as import('@xueersi/contracts').DeleteQuery,
      );
    } catch {
      return reply.code(503).send({ error: { code: 'REPORT_UNAVAILABLE' } });
    }
  });

  app.get('/api/v1/health', async () => ({
    status: 'ok',
    service: 'xueersi-admin',
  }));
  app.get('/api/v1/connection', async () => adapter.connection());
  app.post('/api/v1/session/pairing', async (_request, reply) => {
    try {
      return { key: adapter.issuePairing(), expiresIn: 300 };
    } catch {
      return reply.code(503).send({ error: { code: 'PAIRING_UNAVAILABLE' } });
    }
  });
  app.post(
    '/api/v1/session/renewal',
    { bodyLimit: 16384 },
    async (request, reply) => {
      try {
        await adapter.acceptRenewal(
          String(request.headers['x-pairing-key'] ?? ''),
          request.body,
          businessDate(new Date()),
        );
        return { ok: true };
      } catch {
        return reply
          .code(403)
          .send({ error: { code: 'RENEWAL_HANDOFF_FAILED' } });
      }
    },
  );
  app.post('/api/v1/session', { bodyLimit: 16384 }, async (request, reply) => {
    try {
      if (
        request.body &&
        typeof request.body === 'object' &&
        'renewal' in request.body
      )
        throw new Error();
      adapter.accept(
        String(request.headers['x-pairing-key'] ?? ''),
        request.body,
      );
      return { ok: true };
    } catch {
      return reply.code(403).send({ error: { code: 'PAIRING_DENIED' } });
    }
  });
  app.delete('/api/v1/session', async () => {
    adapter.disconnect();
    return { ok: true };
  });
  app.get('/api/v1/homework', async (request, reply) => {
    try {
      return await adapter.listHomework(request.query);
    } catch (error) {
      const code =
        error instanceof ConnectionRequiredError
          ? error.code
          : error instanceof ReadFailure
            ? error.code
            : 'READ_FAILED';
      return reply
        .code(
          code === 'INVALID_QUERY'
            ? 400
            : code === 'SESSION_EXPIRED'
              ? 401
              : 503,
        )
        .send({ error: { code } });
    }
  });
  app.get('/api/v1/demo/homework', async () => {
    const date = businessDate(new Date());
    return HomeworkResponseSchema.parse({
      mode: 'demo',
      items: [
        {
          id: 'demo-reading',
          subject: 'chinese',
          content: '阅读一篇短文并记录三个新词',
          date,
          status: 'pending',
        },
        {
          id: 'demo-math',
          subject: 'math',
          content: '完成十道口算练习',
          date,
          status: 'pending',
        },
        {
          id: 'demo-english',
          subject: 'english',
          content: '朗读一段英文对话',
          date,
          status: 'completed',
        },
      ],
    });
  });
  if (options.webRoot)
    await app.register(fastifyStatic, { root: options.webRoot });
  app.setNotFoundHandler((request, reply) => {
    if (
      options.webRoot &&
      request.method === 'GET' &&
      !request.url.startsWith('/api/') &&
      request.headers.accept?.includes('text/html')
    )
      return reply.sendFile('index.html');
    return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
  });
  return app;
}
