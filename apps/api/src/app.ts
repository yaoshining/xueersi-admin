import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { HomeworkResponseSchema } from '@xueersi/contracts';
import { businessDate } from '@xueersi/domain';
import {
  ConnectionRequiredError,
  DisconnectedTalAdapter,
} from '@xueersi/tal-adapter';

export async function buildApp(options: { webRoot?: string } = {}) {
  const app = Fastify({ logger: false });
  const adapter = new DisconnectedTalAdapter();
  app.get('/api/v1/health', async () => ({
    status: 'ok',
    service: 'xueersi-admin',
  }));
  app.get('/api/v1/connection', async () => ({
    status: 'disconnected',
    canRead: false,
    canWrite: false,
  }));
  app.get('/api/v1/homework', async (_, reply) => {
    try {
      return await adapter.listHomework();
    } catch (error) {
      if (error instanceof ConnectionRequiredError)
        return reply
          .code(503)
          .send({ error: { code: error.code, message: error.message } });
      throw error;
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
