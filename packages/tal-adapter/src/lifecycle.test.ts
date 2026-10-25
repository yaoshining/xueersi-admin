import { it, expect, vi } from 'vitest';
import { ReadonlyTalAdapter, ReadFailure, type SessionVault } from './index';
const session = {
  token: 'synthetic-old',
  studentId: 'synthetic-student',
  sn: 'synthetic-sn',
  deviceCode: 'synthetic-model',
  childName: '测试孩子',
  deviceName: '测试学习机',
};
const result = { mode: 'real', items: [] };
function vault() {
  let saved: unknown = null;
  return {
    load: () => saved,
    save: (s: unknown) => {
      saved = structuredClone(s);
    },
    clear: () => {
      saved = null;
    },
  } as SessionVault;
}
function query(a: ReadonlyTalAdapter) {
  const c = a.connection();
  if (c.status !== 'connected') throw Error('not connected');
  return { childId: c.child.value, date: '2026-10-17' };
}
it('长期保存、关闭后恢复名称，主动断开后不恢复', async () => {
  let now = 1000;
  const store = vault();
  const transport = vi.fn().mockResolvedValue(result);
  const a = new ReadonlyTalAdapter({
    vault: store,
    transport,
    pairingKey: 'key',
    now: () => now,
  });
  a.accept('key', session);
  now += 86400000;
  expect(await a.listHomework(query(a))).toEqual(result);
  a.shutdown();
  const b = new ReadonlyTalAdapter({ vault: store, transport });
  expect(b.connection()).toMatchObject({
    persistence: 'encrypted',
    verification: 'pending',
    child: { label: '测试孩子' },
    device: { label: '测试学习机' },
  });
  await b.listHomework(query(b));
  expect(b.connection()).toMatchObject({ verification: 'verified' });
  expect(JSON.stringify(b.connection())).not.toContain(session.token);
  b.disconnect();
  expect(
    new ReadonlyTalAdapter({ vault: store, transport }).connection().canRead,
  ).toBe(false);
});
it('并发失效只续期一次并持久化新令牌', async () => {
  const store = vault();
  let resolve!: (v: { token: string }) => void;
  const refresh = vi.fn(
    () =>
      new Promise<{ token: string }>((r) => {
        resolve = r;
      }),
  );
  const transport = vi.fn(async (s: { token: string }) => {
    if (s.token === 'synthetic-old') throw new ReadFailure('SESSION_EXPIRED');
    return result;
  });
  const a = new ReadonlyTalAdapter({
    vault: store,
    transport,
    refresh,
    pairingKey: 'key',
  });
  a.accept('key', session);
  const q = query(a);
  const p1 = a.listHomework(q);
  const p2 = a.listHomework(q);
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  resolve({ token: 'synthetic-new' });
  expect(await Promise.all([p1, p2])).toEqual([result, result]);
  a.shutdown();
  const b = new ReadonlyTalAdapter({ vault: store, transport });
  await b.listHomework(query(b));
  expect(transport.mock.lastCall?.[0].token).toBe('synthetic-new');
  b.shutdown();
});
it('断开使在途续期失效，不能重新保存', async () => {
  const store = vault();
  let resolve!: (v: { token: string }) => void;
  const refresh = vi.fn(
    () =>
      new Promise<{ token: string }>((r) => {
        resolve = r;
      }),
  );
  const a = new ReadonlyTalAdapter({
    vault: store,
    transport: async () => {
      throw new ReadFailure('SESSION_EXPIRED');
    },
    refresh,
    pairingKey: 'key',
  });
  a.accept('key', session);
  const done = a.listHomework(query(a)).catch((e) => e);
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  a.disconnect();
  resolve({ token: 'synthetic-new' });
  await done;
  expect(store.load()).toBeNull();
  expect(a.connection().canRead).toBe(false);
});
it('官方失效无续期时需重新登录，普通网络失败保留会话', async () => {
  const store = vault();
  const transport = vi.fn().mockRejectedValue(new Error('network'));
  const a = new ReadonlyTalAdapter({
    vault: store,
    transport,
    pairingKey: 'key',
  });
  a.accept('key', session);
  await expect(a.listHomework(query(a))).rejects.toThrow();
  expect(a.connection().canRead).toBe(true);
  expect(store.load()).not.toBeNull();
  transport.mockRejectedValue(new ReadFailure('SESSION_EXPIRED'));
  await expect(a.listHomework(query(a))).rejects.toThrow();
  expect(a.connection()).toMatchObject({
    status: 'disconnected',
    reason: 'session-expired',
  });
  expect(store.load()).toBeNull();
});
it('续期网络失败有退避，旧凭据保留', async () => {
  let now = 0;
  const refresh = vi.fn().mockRejectedValue(new Error('network'));
  const store = vault();
  const a = new ReadonlyTalAdapter({
    vault: store,
    transport: async () => {
      throw new ReadFailure('SESSION_EXPIRED');
    },
    refresh,
    pairingKey: 'key',
    now: () => now,
  });
  a.accept('key', session);
  const q = query(a);
  await expect(a.listHomework(q)).rejects.toThrow();
  await expect(a.listHomework(q)).rejects.toThrow();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(store.load()).not.toBeNull();
  now += 30001;
  await expect(a.listHomework(q)).rejects.toThrow();
  expect(refresh).toHaveBeenCalledTimes(2);
  a.shutdown();
});
it('坏名称拒绝且兼容缺省名称，动态配对一次性且超时', () => {
  let now = 0;
  const a = new ReadonlyTalAdapter({
    transport: async () => result,
    now: () => now,
  });
  const key = a.issuePairing();
  expect(() => a.accept(key, { ...session, childName: '坏\n名称' })).toThrow();
  a.accept(key, session);
  expect(() => a.accept(key, session)).toThrow();
  const key2 = a.issuePairing();
  now += 300001;
  expect(() => a.accept(key2, session)).toThrow();
  a.shutdown();
});
