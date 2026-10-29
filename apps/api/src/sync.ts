import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrecheckFailure } from '@xueersi/tal-adapter';
import { businessDate } from '@xueersi/domain';
import {
  BatchSyncRequestSchema,
  SyncConfirmationSchema,
  type BatchSyncPreview,
  type BatchSyncResult,
  type Draft,
  type SyncPreview,
  type SyncRecord,
} from '@xueersi/contracts';
import type { openDraftStore } from '@xueersi/db';
import type { FastifyInstance } from 'fastify';

type Context = {
  status: string;
  sessionId?: string;
  child?: { value: string; label: string };
  device?: { value: string; label: string };
};
type Adapter = {
  connection(): Context;
  prepareDraft(
    draft: Draft,
  ): Promise<{ typeLabel: string; submit(): Promise<'accepted' | 'failed'> }>;
};
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class SyncError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export class SyncService {
  private tickets = new Map<
    string,
    {
      secretHash: string;
      preview: Omit<SyncPreview, 'secret'>;
      snapshot: string;
      binding: string;
      fingerprint: string;
    }
  >();
  private batches = new Map<
    string,
    { secretHash: string; expiresAt: number; previews: SyncPreview[] }
  >();
  async previewBatch(ids: string[]): Promise<BatchSyncPreview> {
    if (!BatchSyncRequestSchema.safeParse({ draftIds: ids }).success)
      throw new SyncError('INVALID_BATCH');
    for (const [id, batch] of this.batches)
      if (batch.expiresAt <= this.now()) this.cancelBatch(id);
    if (this.batches.size >= 100) throw new SyncError('TOO_MANY_PREVIEWS');
    const states = ids.map((id) => this.read(id));
    if (new Set(states.map((s) => s.fingerprint)).size !== ids.length)
      throw new SyncError('DUPLICATE_SYNC');
    const previews: SyncPreview[] = [];
    try {
      for (const id of ids) previews.push(await this.preview(id));
      // 所有异步预检结束后再次核对，防止批次准备期间发生切换或编辑。
      for (const p of previews) this.validateTicket(p.ticketId);
      if (
        new Set(previews.map((p) => this.tickets.get(p.ticketId)!.binding))
          .size !== 1
      )
        throw new SyncError('TARGET_MISMATCH');
      const ticketId = randomUUID(),
        secret = randomBytes(32).toString('hex');
      const expiresAt = Math.min(...previews.map((p) => p.expiresAt));
      this.batches.set(ticketId, {
        secretHash: hash(secret),
        expiresAt,
        previews,
      });
      return {
        ticketId,
        secret,
        expiresAt,
        summaries: previews.map((p) => p.summary),
      };
    } catch (error) {
      previews.forEach((p) => this.cancel(p.ticketId));
      throw error;
    }
  }
  cancelBatch(id: string) {
    this.batches.get(id)?.previews.forEach((p) => this.cancel(p.ticketId));
    this.batches.delete(id);
  }
  private validateTicket(id: string) {
    const ticket = this.tickets.get(id);
    if (!ticket || ticket.preview.expiresAt <= this.now())
      throw new SyncError('INVALID_CONFIRMATION');
    const current = this.read(ticket.preview.summary.draft.id);
    if (
      current.snapshot !== ticket.snapshot ||
      current.binding !== ticket.binding
    )
      throw new SyncError('STALE_PREVIEW');
    if (this.store.syncBlocked(ticket.fingerprint))
      throw new SyncError('DUPLICATE_SYNC');
    return ticket;
  }
  async confirmBatch(input: {
    ticketId: string;
    secret: string;
    confirmed: boolean;
  }): Promise<BatchSyncResult> {
    const batch = this.batches.get(input.ticketId);
    if (
      !input.confirmed ||
      !batch ||
      batch.secretHash !== hash(input.secret) ||
      batch.expiresAt <= this.now()
    )
      throw new SyncError('INVALID_CONFIRMATION');
    this.batches.delete(input.ticketId); // 在任何 await 前消费，避免重复确认。
    try {
      // 首条写入前，对整批执行只读预检和最终快照校验。
      const preparedItems = new Map<
        string,
        Awaited<ReturnType<Adapter['prepareDraft']>>
      >();
      for (const p of batch.previews) {
        this.validateTicket(p.ticketId);
        const prepared = await this.adapter.prepareDraft(p.summary.draft);
        if (prepared.typeLabel !== p.summary.typeLabel)
          throw new SyncError('STALE_PREVIEW');
        preparedItems.set(p.ticketId, prepared);
      }
      batch.previews.forEach((p) => this.validateTicket(p.ticketId));
      const items: BatchSyncResult['items'] = [];
      let stopped = false;
      for (const p of batch.previews) {
        if (stopped) {
          items.push({ draftId: p.summary.draft.id, status: 'not_sent' });
          continue;
        }
        try {
          const ticket = this.validateTicket(p.ticketId);
          this.tickets.delete(p.ticketId);
          const record = await this.sendPrepared(
            ticket,
            preparedItems.get(p.ticketId)!,
          );
          const status =
            record.status === 'sending' ? 'unknown' : record.status;
          items.push({ draftId: p.summary.draft.id, status, record });
          stopped = status !== 'accepted';
        } catch (error) {
          items.push({
            draftId: p.summary.draft.id,
            status: 'not_sent',
            code:
              error instanceof SyncError || error instanceof PrecheckFailure
                ? error.code
                : 'SYNC_PRECHECK_FAILED',
          });
          stopped = true;
        }
      }
      return { items };
    } finally {
      batch.previews.forEach((p) => this.cancel(p.ticketId));
    }
  }
  constructor(
    private store: ReturnType<typeof openDraftStore>,
    private adapter: Adapter,
    private now = Date.now,
  ) {}
  private read(id: string) {
    const draft = this.store.get(id),
      context = this.adapter.connection();
    if (!draft) throw new SyncError('DRAFT_MISSING');
    if (
      context.status !== 'connected' ||
      !context.child ||
      !context.device ||
      draft.childId !== context.child.value
    )
      throw new SyncError('TARGET_MISMATCH');
    const today = businessDate(new Date(this.now()));
    if (
      draft.content.length > 300 ||
      draft.targetMinutes === null ||
      draft.submissionRequirement === null ||
      draft.date < today ||
      draft.date > businessDate(new Date(this.now() + 30 * 86400000))
    )
      throw new SyncError('INVALID_SYNC_DRAFT');
    const binding = hash([
      context.sessionId,
      context.child.value,
      context.device.value,
    ]);
    const fingerprint = hash([
      context.child.value,
      context.device.value,
      draft.subject,
      draft.date,
      draft.content,
      draft.targetMinutes,
      draft.submissionRequirement,
    ]);
    return { draft, context, binding, fingerprint, snapshot: hash(draft) };
  }
  async preview(id: string): Promise<SyncPreview> {
    for (const [key, ticket] of this.tickets)
      if (ticket.preview.expiresAt <= this.now()) this.tickets.delete(key);
    if (this.tickets.size >= 100) throw new SyncError('TOO_MANY_PREVIEWS');
    const state = this.read(id);
    if (this.store.syncBlocked(state.fingerprint))
      throw new SyncError('DUPLICATE_SYNC');
    const prepared = await this.adapter.prepareDraft(state.draft);
    const current = this.read(id);
    if (
      current.snapshot !== state.snapshot ||
      current.binding !== state.binding
    )
      throw new SyncError('STALE_PREVIEW');
    const secret = randomBytes(32).toString('hex');
    const preview = {
      ticketId: randomUUID(),
      expiresAt: this.now() + 300000,
      summary: {
        draft: state.draft,
        child: state.context.child!.label,
        device: state.context.device!.label,
        typeLabel: prepared.typeLabel,
      },
    };
    this.tickets.set(preview.ticketId, {
      secretHash: hash(secret),
      preview,
      snapshot: state.snapshot,
      binding: state.binding,
      fingerprint: state.fingerprint,
    });
    return { ...preview, secret };
  }
  cancel(id: string) {
    this.tickets.delete(id);
  }
  async confirm(input: {
    ticketId: string;
    secret: string;
    confirmed: boolean;
  }): Promise<SyncRecord> {
    const ticket = this.tickets.get(input.ticketId);
    if (
      !input.confirmed ||
      !ticket ||
      hash(input.secret) !== ticket.secretHash ||
      ticket.preview.expiresAt <= this.now()
    )
      throw new SyncError('INVALID_CONFIRMATION');
    this.tickets.delete(input.ticketId);
    const check = () => {
      const current = this.read(ticket.preview.summary.draft.id);
      if (
        ticket.preview.expiresAt <= this.now() ||
        current.snapshot !== ticket.snapshot ||
        current.binding !== ticket.binding
      )
        throw new SyncError('STALE_PREVIEW');
    };
    check();
    const prepared = await this.adapter.prepareDraft(
      ticket.preview.summary.draft,
    );
    check();
    if (prepared.typeLabel !== ticket.preview.summary.typeLabel)
      throw new SyncError('STALE_PREVIEW');
    return this.sendPrepared(ticket, prepared);
  }
  private async sendPrepared(
    ticket: { fingerprint: string; preview: Omit<SyncPreview, 'secret'> },
    prepared: Awaited<ReturnType<Adapter['prepareDraft']>>,
  ): Promise<SyncRecord> {
    const record: SyncRecord = {
      id: randomUUID(),
      createdAt: this.now(),
      status: 'sending',
      summary: ticket.preview.summary,
    };
    if (!this.store.claimSync(ticket.fingerprint, record))
      throw new SyncError('DUPLICATE_SYNC');
    try {
      record.status = await prepared.submit();
    } catch {
      record.status = 'unknown';
    }
    try {
      this.store.finishSync(record.id, record.status);
    } catch {
      // 外部副作用可能已发生；保留持久 sending 占位，阻止重放。
      record.status = 'unknown';
    }
    return record;
  }
  records() {
    return { items: this.store.syncRecords() };
  }
}
export function registerSync(
  app: FastifyInstance,
  store: ReturnType<typeof openDraftStore>,
  adapter: Adapter,
) {
  const service = new SyncService(store, adapter);
  app.post('/api/v1/sync/batch/preview', async (request, reply) => {
    const parsed = BatchSyncRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: { code: 'INVALID_BATCH' } });
    try {
      return await service.previewBatch(parsed.data.draftIds);
    } catch (error) {
      return reply.code(409).send({
        error: {
          code:
            error instanceof SyncError || error instanceof PrecheckFailure
              ? error.code
              : 'SYNC_PRECHECK_FAILED',
        },
      });
    }
  });
  app.post('/api/v1/sync/batch/confirm', async (request, reply) => {
    const parsed = SyncConfirmationSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: { code: 'INVALID_CONFIRMATION' } });
    try {
      return await service.confirmBatch(parsed.data);
    } catch (error) {
      return reply.code(409).send({
        error: {
          code:
            error instanceof SyncError || error instanceof PrecheckFailure
              ? error.code
              : 'SYNC_PRECHECK_FAILED',
        },
      });
    }
  });
  app.delete<{ Params: { id: string } }>(
    '/api/v1/sync/batch/preview/:id',
    async (request) => {
      service.cancelBatch(request.params.id);
      return { ok: true };
    },
  );
  app.get('/api/v1/sync/records', async () => service.records());
  app.post('/api/v1/sync/preview', async (request, reply) => {
    const body = request.body as { draftId?: unknown } | undefined;
    if (
      !body ||
      typeof body.draftId !== 'string' ||
      Object.keys(body).length !== 1
    )
      return reply.code(400).send({ error: { code: 'INVALID_SYNC_DRAFT' } });
    try {
      return await service.preview(body.draftId);
    } catch (error) {
      return reply.code(409).send({
        error: {
          code:
            error instanceof SyncError || error instanceof PrecheckFailure
              ? error.code
              : 'SYNC_PRECHECK_FAILED',
        },
      });
    }
  });
  app.post('/api/v1/sync/confirm', async (request, reply) => {
    const body = request.body as
      { ticketId: string; secret: string; confirmed: boolean } | undefined;
    if (
      !body ||
      typeof body.ticketId !== 'string' ||
      typeof body.secret !== 'string' ||
      body.confirmed !== true ||
      Object.keys(body).length !== 3
    )
      return reply.code(400).send({ error: { code: 'INVALID_CONFIRMATION' } });
    try {
      return await service.confirm(body);
    } catch (error) {
      return reply.code(409).send({
        error: {
          code:
            error instanceof SyncError || error instanceof PrecheckFailure
              ? error.code
              : 'SYNC_PRECHECK_FAILED',
        },
      });
    }
  });
  app.delete<{ Params: { id: string } }>(
    '/api/v1/sync/preview/:id',
    async (request) => {
      service.cancel(request.params.id);
      return { ok: true };
    },
  );
}
