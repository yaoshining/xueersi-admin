import type { FastifyInstance } from 'fastify';
import { DraftSchema, DraftImportSchema } from '@xueersi/contracts';
import { DraftConflictError, openDraftStore } from '@xueersi/db';
export function registerDrafts(
  app: FastifyInstance,
  store: ReturnType<typeof openDraftStore>,
) {
  app.get('/api/v1/drafts', async () => ({ items: store.list() }));
  app.get<{ Params: { id: string } }>(
    '/api/v1/drafts/:id',
    async (request, reply) => {
      const draft = store.get(request.params.id);
      return (
        draft ?? reply.code(404).send({ error: { code: 'DRAFT_NOT_FOUND' } })
      );
    },
  );
  app.post('/api/v1/drafts', async (request, reply) => {
    const parsed = DraftSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: { code: 'INVALID_DRAFT' } });
    try {
      store.create(parsed.data);
      return reply.code(201).send(parsed.data);
    } catch (error) {
      if (error instanceof DraftConflictError)
        return reply.code(409).send({ error: { code: 'DRAFT_CONFLICT' } });
      throw error;
    }
  });
  app.post('/api/v1/drafts/import', async (request, reply) => {
    const parsed = DraftImportSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: { code: 'INVALID_DRAFT' } });
    try {
      store.importMany(parsed.data.items);
      return { ok: true };
    } catch (error) {
      if (error instanceof DraftConflictError)
        return reply.code(409).send({ error: { code: 'DRAFT_CONFLICT' } });
      throw error;
    }
  });
  app.put<{ Params: { id: string } }>(
    '/api/v1/drafts/:id',
    async (request, reply) => {
      const parsed = DraftSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.id !== request.params.id)
        return reply.code(400).send({ error: { code: 'INVALID_DRAFT' } });
      return store.update(parsed.data)
        ? parsed.data
        : reply.code(404).send({ error: { code: 'DRAFT_NOT_FOUND' } });
    },
  );
  app.delete<{ Params: { id: string } }>(
    '/api/v1/drafts/:id',
    async (request, reply) =>
      store.remove(request.params.id)
        ? { ok: true }
        : reply.code(404).send({ error: { code: 'DRAFT_NOT_FOUND' } }),
  );
}
