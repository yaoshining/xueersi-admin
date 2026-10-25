import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  DeleteQuerySchema,
  type DeleteQuery,
  type DeletePreview,
  type Homework,
} from '@xueersi/contracts';
import type { openDraftStore } from '@xueersi/db';
import type { FastifyInstance } from 'fastify';
type Adapter = {
  connection(): {
    status: string;
    sessionId?: string;
    child?: { value: string; label: string };
    device?: { value: string; label: string };
  };
  prepareDelete(
    query: DeleteQuery,
  ): Promise<{ item: Homework; submit(): Promise<'accepted' | 'failed'> }>;
};
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class HomeworkDeleteService {
  private tickets = new Map<
    string,
    {
      secretHash: string;
      expiresAt: number;
      query: DeleteQuery;
      snapshot: string;
      binding: string;
      fingerprint: string;
    }
  >();
  constructor(
    private store: ReturnType<typeof openDraftStore>,
    private adapter: Adapter,
    private now = Date.now,
  ) {}
  private context(query: DeleteQuery) {
    const c = this.adapter.connection();
    if (
      c.status !== 'connected' ||
      !c.child ||
      !c.device ||
      c.child.value !== query.childId
    )
      throw Error('TARGET_MISMATCH');
    return {
      child: c.child.label,
      device: c.device.label,
      binding: hash([c.sessionId, c.child.value, c.device.value]),
      fingerprint: hash([c.child.value, c.device.value, query.id]),
    };
  }
  async preview(input: DeleteQuery): Promise<DeletePreview> {
    const query = DeleteQuerySchema.parse(input),
      c = this.context(query);
    for (const [id, t] of this.tickets)
      if (t.expiresAt <= this.now()) this.tickets.delete(id);
    if (this.tickets.size >= 100 || this.store.deletionBlocked(c.fingerprint))
      throw Error('DELETE_BLOCKED');
    const prepared = await this.adapter.prepareDelete(query);
    if (
      prepared.item.status !== 'pending' ||
      prepared.item.id !== query.id ||
      prepared.item.date !== query.date ||
      this.context(query).binding !== c.binding
    )
      throw Error('STALE_DELETE');
    const ticketId = randomUUID(),
      secret = randomBytes(32).toString('hex'),
      expiresAt = this.now() + 300000;
    this.tickets.set(ticketId, {
      secretHash: hash(secret),
      expiresAt,
      query,
      snapshot: hash(prepared.item),
      binding: c.binding,
      fingerprint: c.fingerprint,
    });
    return {
      ticketId,
      secret,
      expiresAt,
      summary: { item: prepared.item, child: c.child, device: c.device },
    };
  }
  cancel(id: string) {
    this.tickets.delete(id);
  }
  async confirm(input: {
    ticketId: string;
    secret: string;
    confirmed: boolean;
  }) {
    const t = this.tickets.get(input.ticketId);
    if (
      !input.confirmed ||
      !t ||
      t.secretHash !== hash(input.secret) ||
      t.expiresAt <= this.now()
    )
      throw Error('INVALID_CONFIRMATION');
    this.tickets.delete(input.ticketId);
    if (this.context(t.query).binding !== t.binding)
      throw Error('STALE_DELETE');
    const prepared = await this.adapter.prepareDelete(t.query);
    if (
      this.context(t.query).binding !== t.binding ||
      t.expiresAt <= this.now() ||
      prepared.item.status !== 'pending' ||
      hash(prepared.item) !== t.snapshot
    )
      throw Error('STALE_DELETE');
    if (!this.store.claimDeletion(t.fingerprint)) throw Error('DELETE_BLOCKED');
    let status: 'accepted' | 'failed' | 'unknown';
    try {
      status = await prepared.submit();
      if (!['accepted', 'failed'].includes(status)) status = 'unknown';
    } catch {
      status = 'unknown';
    }
    try {
      this.store.finishDeletion(t.fingerprint, status);
    } catch {
      status = 'unknown';
    }
    return { status };
  }
}
export function registerHomeworkDelete(
  app: FastifyInstance,
  store: ReturnType<typeof openDraftStore>,
  adapter: Adapter,
) {
  const service = new HomeworkDeleteService(store, adapter);
  app.post('/api/v1/homework/delete/preview', async (req, reply) => {
    const parsed = DeleteQuerySchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: { code: 'INVALID_DELETE' } });
    try {
      return await service.preview(parsed.data);
    } catch {
      return reply
        .code(409)
        .send({ error: { code: 'DELETE_PRECHECK_FAILED' } });
    }
  });
  app.post('/api/v1/homework/delete/confirm', async (req, reply) => {
    const b = req.body as
      { ticketId: string; secret: string; confirmed: boolean } | undefined;
    if (
      !b ||
      typeof b.ticketId !== 'string' ||
      typeof b.secret !== 'string' ||
      b.confirmed !== true ||
      Object.keys(b).length !== 3
    )
      return reply.code(400).send({ error: { code: 'INVALID_CONFIRMATION' } });
    try {
      return await service.confirm(b);
    } catch {
      return reply
        .code(409)
        .send({ error: { code: 'DELETE_PRECHECK_FAILED' } });
    }
  });
  app.delete<{ Params: { id: string } }>(
    '/api/v1/homework/delete/preview/:id',
    async (req) => {
      service.cancel(req.params.id);
      return { ok: true };
    },
  );
}
