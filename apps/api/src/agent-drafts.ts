import type { FastifyInstance } from 'fastify';
import { AgentDraftWriteSchema } from '@xueersi/contracts';
import {
  DraftConflictError,
  draftVersion,
  type openDraftStore,
} from '@xueersi/db';
import type { ReadonlyTalAdapter } from '@xueersi/tal-adapter';
export function registerAgentDrafts(
  app: FastifyInstance,
  store: ReturnType<typeof openDraftStore>,
  adapter: ReadonlyTalAdapter,
) {
  app.get('/api/v1/agent/drafts', async (_req, reply) => {
    const c = adapter.connection();
    if (c.status !== 'connected')
      return reply.code(403).send({ error: { code: 'CONNECTION_REQUIRED' } });
    return {
      items: store
        .list()
        .filter((d) => d.childId === c.child.value)
        .map((draft) => ({ draft, version: draftVersion(draft) })),
    };
  });
  app.post('/api/v1/agent/drafts', async (req, reply) => {
    const parsed = AgentDraftWriteSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: { code: 'INVALID_INPUT' } });
    const c = adapter.connection();
    if (c.status !== 'connected' || c.child.value !== parsed.data.draft.childId)
      return reply.code(403).send({ error: { code: 'TARGET_MISMATCH' } });
    try {
      return store.saveAgentDraft(
        parsed.data.draft,
        parsed.data.expectedVersion,
      );
    } catch (e) {
      if (e instanceof DraftConflictError)
        return reply.code(409).send({ error: { code: 'DRAFT_CONFLICT' } });
      throw e;
    }
  });
}
