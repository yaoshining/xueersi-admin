import {
  timingSafeEqual,
  randomUUID,
  randomBytes,
  createHash,
} from 'node:crypto';
import {
  HomeworkReportSchema,
  DeleteQuerySchema,
  type DeleteQuery,
  SessionHandoffSchema,
  CookieRenewalSchema,
  type CookieRenewal,
  ReadQuerySchema,
  RealHomeworkResponseSchema,
  type SessionHandoff,
  type Connection,
  type Draft,
} from '@xueersi/contracts';
export class ConnectionRequiredError extends Error {
  readonly code = 'CONNECTION_REQUIRED';
  constructor() {
    super('尚未连接学而思账号');
    this.name = 'ConnectionRequiredError';
  }
}
export class DisconnectedTalAdapter {
  async listHomework(): Promise<never> {
    throw new ConnectionRequiredError();
  }
}
export class ReadFailure extends Error {
  constructor(
    readonly code:
      | 'READ_FAILED'
      | 'SESSION_EXPIRED'
      | 'INVALID_QUERY'
      | 'PAIRING_DENIED' = 'READ_FAILED',
  ) {
    super('作业读取失败');
  }
}
export type ReadTransport = (
  input: Readonly<
    Omit<SessionHandoff, 'renewal'> & { date: string; endDate?: string }
  >,
  signal: AbortSignal,
) => Promise<unknown>;
export type RefreshTransport = (
  input: Readonly<SessionHandoff>,
  signal: AbortSignal,
) => Promise<{ token: string; renewal?: CookieRenewal }>;
export type ReportTransport = (
  input: Parameters<ReadTransport>[0],
  id: string,
  signal: AbortSignal,
) => Promise<unknown>;
export type DraftWriter = {
  prepareDelete?(
    input: Parameters<ReadTransport>[0],
    id: string,
    signal: AbortSignal,
  ): Promise<unknown>;
  prepare(
    input: Parameters<ReadTransport>[0],
    draft: Draft,
    signal: AbortSignal,
  ): Promise<{ typeLabel: string; payload: unknown }>;
  submit(
    input: Parameters<ReadTransport>[0],
    payload: unknown,
    signal: AbortSignal,
  ): Promise<'accepted' | 'failed'>;
};
export interface SessionVault {
  load(): unknown;
  save(session: SessionHandoff): void;
  clear(): void;
}
/** 生产持久化由本机保险箱提供；HTTP 状态始终不返回凭据。 */
export class ReadonlyTalAdapter {
  #session: SessionHandoff | null = null;
  #sessionId = '';
  #generation = 0;
  #expiresAt = 0;
  #verified = false;
  #reason: 'session-expired' | undefined;
  #expiryTimer: ReturnType<typeof setTimeout> | undefined;
  #pairingKey: string | undefined;
  #pairingExpiresAt = 0;
  #now: () => number;
  #transport: ReadTransport | undefined;
  #writer: DraftWriter | undefined;
  #report: ReportTransport | undefined;
  #refresh: RefreshTransport | undefined;
  #vault: SessionVault | undefined;
  #controllers = new Set<AbortController>();
  #refreshing: Promise<void> | undefined;
  #retryAt = 0;
  constructor(
    options: {
      transport?: ReadTransport;
      writer?: DraftWriter;
      report?: ReportTransport;
      refresh?: RefreshTransport;
      vault?: SessionVault;
      pairingKey?: string;
      now?: () => number;
    } = {},
  ) {
    this.#now = options.now ?? Date.now;
    this.#transport = options.transport;
    this.#writer = options.writer;
    this.#report = options.report;
    this.#refresh = options.refresh;
    this.#vault = options.vault;
    this.#pairingKey = options.pairingKey;
    this.#pairingExpiresAt = this.#now() + 300000;
    if (this.#vault) {
      const saved = this.#vault.load();
      if (saved != null) {
        if (!this.#transport) throw new Error('本机会话缺少读取配置');
        this.#activate(SessionHandoffSchema.parse(saved));
      }
    }
  }
  #activate(session: SessionHandoff) {
    this.#session = session;
    this.#sessionId = randomUUID();
    this.#reason = undefined;
    this.#verified = false;
    this.#retryAt = 0;
    this.#expiresAt = this.#vault ? Infinity : this.#now() + 900000;
    if (!this.#vault) {
      this.#expiryTimer = setTimeout(() => this.disconnect(), 900000);
      this.#expiryTimer.unref();
    }
  }
  issuePairing() {
    if (!this.#transport) throw new ReadFailure('PAIRING_DENIED');
    this.#pairingKey = randomBytes(32).toString('hex');
    this.#pairingExpiresAt = this.#now() + 300000;
    return this.#pairingKey;
  }
  #checkPairing(key: string) {
    const expected = Buffer.from(this.#pairingKey ?? '');
    const supplied = Buffer.from(key);
    if (
      !this.#transport ||
      !expected.length ||
      expected.length !== supplied.length ||
      !timingSafeEqual(expected, supplied) ||
      this.#now() >= this.#pairingExpiresAt
    )
      throw new ReadFailure('PAIRING_DENIED');
  }
  accept(key: string, input: unknown) {
    this.#checkPairing(key);
    const parsed = SessionHandoffSchema.safeParse(input);
    if (!parsed.success || (parsed.data.renewal && !this.#vault))
      throw new ReadFailure('PAIRING_DENIED');
    this.#vault?.save(parsed.data);
    this.shutdown();
    this.#activate(parsed.data);
    this.#pairingKey = undefined;
  }
  async acceptRenewal(key: string, input: unknown, date: string) {
    this.#checkPairing(key);
    const parsed = CookieRenewalSchema.safeParse(input);
    if (
      !parsed.success ||
      !parsed.data.cookies.length ||
      !this.#session ||
      !this.#vault ||
      !this.#refresh ||
      !this.#transport
    )
      throw new ReadFailure('PAIRING_DENIED');
    this.#pairingKey = undefined;
    const session = this.#session,
      generation = this.#generation;
    const controller = new AbortController();
    this.#controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 20000);
    timer.unref();
    try {
      const renewed = await this.#refresh(
        { ...session, renewal: { ...parsed.data, nextCheckAt: 0 } },
        controller.signal,
      );
      const next = SessionHandoffSchema.parse({ ...session, ...renewed });
      if (!next.renewal) throw new ReadFailure();
      const response = await this.#transport(
        readInput(next, date),
        controller.signal,
      );
      const result = RealHomeworkResponseSchema.parse(response);
      if (
        result.items.some((item) => item.date !== date) ||
        controller.signal.aborted ||
        generation !== this.#generation ||
        this.#session !== session
      )
        throw new ReadFailure();
      this.#vault.save(next);
      this.shutdown();
      this.#activate(next);
      this.#verified = true;
    } catch {
      throw new ReadFailure();
    } finally {
      clearTimeout(timer);
      this.#controllers.delete(controller);
    }
  }
  connection(): Connection {
    if (this.#session && this.#now() >= this.#expiresAt) this.disconnect();
    return this.#session
      ? {
          status: 'connected',
          canRead: true,
          canWrite: !!this.#writer,
          sessionId: this.#sessionId,
          persistence: this.#vault ? 'encrypted' : 'memory',
          verification: this.#verified ? 'verified' : 'pending',
          renewal:
            this.#refresh && this.#session.renewal?.cookies.length
              ? 'automatic'
              : 'login-required',
          child: {
            value: this.#childId(),
            label: this.#session.childName ?? '已授权孩子',
          },
          device: {
            value:
              'device-' +
              createHash('sha256')
                .update(this.#session.sn)
                .digest('hex')
                .slice(0, 24),
            label: this.#session.deviceName ?? '已授权学习机',
          },
        }
      : {
          status: 'disconnected',
          canRead: false,
          canWrite: false,
          ...(this.#reason ? { reason: this.#reason } : {}),
        };
  }
  #childId() {
    return (
      'child-' +
      createHash('sha256')
        .update(this.#session?.studentId ?? '')
        .digest('hex')
        .slice(0, 24)
    );
  }
  /** 服务正常关闭不能删除已授权的持久会话。 */
  shutdown() {
    clearTimeout(this.#expiryTimer);
    this.#expiryTimer = undefined;
    this.#generation++;
    this.#session = null;
    this.#sessionId = '';
    this.#refreshing = undefined;
    for (const c of this.#controllers) c.abort();
    this.#controllers.clear();
  }
  disconnect() {
    this.shutdown();
    this.#reason = undefined;
    this.#pairingKey = undefined;
    this.#vault?.clear();
  }
  #expire() {
    this.disconnect();
    this.#reason = 'session-expired';
  }
  async #renew(session: SessionHandoff, generation: number) {
    if (generation !== this.#generation || !this.#session)
      throw new ReadFailure();
    if (this.#session !== session) return;
    if (this.#refreshing) return this.#refreshing;
    if (!this.#refresh) {
      this.#expire();
      throw new ReadFailure('SESSION_EXPIRED');
    }
    if (this.#now() < this.#retryAt) throw new ReadFailure();
    const controller = new AbortController();
    this.#controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 20000);
    timer.unref();
    const refresh = this.#refresh;
    const pending = (async () => {
      try {
        const renewed = await refresh(
          Object.freeze(structuredClone(session)),
          controller.signal,
        );
        if (
          controller.signal.aborted ||
          generation !== this.#generation ||
          this.#session !== session
        )
          throw new ReadFailure();
        const next = SessionHandoffSchema.parse({
          ...session,
          ...renewed,
        });
        this.#vault?.save(next);
        this.#session = next;
        this.#verified = false;
        this.#retryAt = 0;
      } catch (error) {
        if (generation === this.#generation && this.#session === session) {
          if (
            error instanceof ReadFailure &&
            error.code === 'SESSION_EXPIRED'
          ) {
            this.#expire();
            throw error;
          }
          this.#retryAt = this.#now() + 30000;
        }
        throw new ReadFailure();
      } finally {
        clearTimeout(timer);
        this.#controllers.delete(controller);
      }
    })();
    this.#refreshing = pending;
    try {
      await pending;
    } finally {
      if (this.#refreshing === pending) this.#refreshing = undefined;
    }
  }
  async prepareDraft(draft: Draft) {
    if (!this.#writer) throw new Error('SYNC_NOT_CONFIGURED');
    const sessionId = this.#sessionId;
    await this.listHomework({ childId: draft.childId, date: draft.date });
    if (!this.#session || this.#sessionId !== sessionId)
      throw new ReadFailure();
    const writer = this.#writer;
    const input = readInput(this.#session, draft.date);
    const controller = new AbortController();
    this.#controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 20000);
    timer.unref();
    let prepared: Awaited<ReturnType<DraftWriter['prepare']>>;
    try {
      prepared = await writer.prepare(
        input,
        structuredClone(draft),
        controller.signal,
      );
      if (controller.signal.aborted || this.#sessionId !== sessionId)
        throw new ReadFailure();
    } finally {
      clearTimeout(timer);
      this.#controllers.delete(controller);
    }
    let used = false;
    return {
      typeLabel: prepared.typeLabel,
      submit: async () => {
        if (used || this.#sessionId !== sessionId || !this.connection().canRead)
          throw new ReadFailure();
        used = true;
        const c = new AbortController();
        this.#controllers.add(c);
        const timeout = setTimeout(() => c.abort(), 20000);
        timeout.unref();
        try {
          const result = await writer.submit(input, prepared.payload, c.signal);
          if (c.signal.aborted || !['accepted', 'failed'].includes(result))
            throw new ReadFailure();
          return result;
        } finally {
          clearTimeout(timeout);
          this.#controllers.delete(c);
        }
      },
    };
  }
  async #readSelected(query: DeleteQuery) {
    const parsed = DeleteQuerySchema.parse(query),
      sessionId = this.#sessionId;
    const list = await this.listHomework({
      childId: parsed.childId,
      date: parsed.date,
    });
    const item = list.items.find((item) => item.id === parsed.id);
    if (!item || !this.#session || this.#sessionId !== sessionId)
      throw new ReadFailure('INVALID_QUERY');
    return { item, sessionId, input: readInput(this.#session, parsed.date) };
  }
  async report(query: DeleteQuery) {
    const selected = await this.#readSelected(query);
    if (!this.#report || selected.item.status !== 'completed')
      throw new ReadFailure();
    const c = new AbortController();
    this.#controllers.add(c);
    const timer = setTimeout(() => c.abort(), 20000);
    timer.unref();
    try {
      const result = HomeworkReportSchema.parse(
        await this.#report(selected.input, query.id, c.signal),
      );
      if (c.signal.aborted || this.#sessionId !== selected.sessionId)
        throw new ReadFailure();
      return result;
    } finally {
      clearTimeout(timer);
      this.#controllers.delete(c);
    }
  }
  async prepareDelete(query: DeleteQuery) {
    const selected = await this.#readSelected(query),
      writer = this.#writer;
    if (selected.item.status !== 'pending' || !writer?.prepareDelete)
      throw new ReadFailure();
    const c = new AbortController();
    this.#controllers.add(c);
    const timer = setTimeout(() => c.abort(), 20000);
    timer.unref();
    let payload: unknown;
    try {
      payload = await writer.prepareDelete(selected.input, query.id, c.signal);
      if (c.signal.aborted || this.#sessionId !== selected.sessionId)
        throw new ReadFailure();
    } finally {
      clearTimeout(timer);
      this.#controllers.delete(c);
    }
    let used = false;
    return {
      item: selected.item,
      submit: async () => {
        if (
          used ||
          this.#sessionId !== selected.sessionId ||
          !this.connection().canRead
        )
          throw new ReadFailure();
        used = true;
        const controller = new AbortController();
        this.#controllers.add(controller);
        const timeout = setTimeout(() => controller.abort(), 20000);
        timeout.unref();
        try {
          const result = await writer.submit(
            selected.input,
            payload,
            controller.signal,
          );
          if (
            controller.signal.aborted ||
            !['accepted', 'failed'].includes(result)
          )
            throw new ReadFailure();
          return result;
        } finally {
          clearTimeout(timeout);
          this.#controllers.delete(controller);
        }
      },
    };
  }
  async listHomework(query: unknown) {
    if (!this.connection().canRead || !this.#session || !this.#transport)
      throw new ConnectionRequiredError();
    const parsed = ReadQuerySchema.safeParse(query);
    if (!parsed.success || parsed.data.childId !== this.#childId())
      throw new ReadFailure('INVALID_QUERY');
    const generation = this.#generation;
    let renewalAttempted = false;
    if (
      this.#session.renewal &&
      this.#refresh &&
      this.#now() >= this.#session.renewal.nextCheckAt
    ) {
      renewalAttempted = true;
      await this.#renew(this.#session, generation);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const session = this.#session;
      if (!session || generation !== this.#generation) throw new ReadFailure();
      const controller = new AbortController();
      this.#controllers.add(controller);
      const timer = setTimeout(
        () => controller.abort(),
        Math.min(20000, this.#expiresAt - this.#now()),
      );
      timer.unref();
      try {
        const response = await this.#transport(
          readInput(session, parsed.data.date, parsed.data.endDate),
          controller.signal,
        );
        if (
          controller.signal.aborted ||
          generation !== this.#generation ||
          !this.connection().canRead
        )
          throw new ReadFailure();
        const result = RealHomeworkResponseSchema.parse(response);
        if (
          result.items.some(
            (item) =>
              item.date < parsed.data.date ||
              item.date > (parsed.data.endDate ?? parsed.data.date),
          )
        )
          throw new ReadFailure();
        this.#verified = true;
        return result;
      } catch (error) {
        if (generation !== this.#generation || controller.signal.aborted)
          throw new ReadFailure();
        if (error instanceof ReadFailure && error.code === 'SESSION_EXPIRED') {
          if (attempt === 1 || renewalAttempted) {
            this.#expire();
            throw error;
          }
          renewalAttempted = true;
          await this.#renew(session, generation);
        } else throw new ReadFailure();
      } finally {
        clearTimeout(timer);
        this.#controllers.delete(controller);
      }
    }
    throw new ReadFailure();
  }
}

/** 作业运输只获得应用令牌；认证 Cookie 永不进入作业请求上下文。 */
function readInput(session: SessionHandoff, date: string, endDate?: string) {
  return Object.freeze({
    token: session.token,
    studentId: session.studentId,
    sn: session.sn,
    deviceCode: session.deviceCode,
    childName: session.childName,
    deviceName: session.deviceName,
    date,
    ...(endDate ? { endDate } : {}),
  });
}
export { createCookieRefresh } from './cookie-refresh';
