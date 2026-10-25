import { it, expect, vi } from 'vitest';
import { ReadonlyTalAdapter, ReadFailure } from './index';
import type { SessionHandoff } from '@xueersi/contracts';
const savedSession = {
  token: 'synthetic-old',
  studentId: 'synthetic-child',
  sn: 'synthetic-device',
  deviceCode: 'synthetic-model',
  renewal: {
    deviceId: 'synthetic-auth-device',
    cookies: [{ name: 'synthetic_auth', value: 'synthetic-cookie' }],
    nextCheckAt: 0,
  },
};
const result = { mode: 'real', items: [] };
function setup(
  refresh = vi.fn().mockResolvedValue({
    token: 'synthetic-old',
    renewal: {
      ...savedSession.renewal,
      nextCheckAt: 301000,
      cookies: [{ name: 'synthetic_auth', value: 'synthetic-rotated' }],
    },
  }),
) {
  let saved: SessionHandoff | null = structuredClone(savedSession);
  const vault = {
    load: () => saved,
    save: vi.fn((s: SessionHandoff) => {
      saved = structuredClone(s);
    }),
    clear: () => {
      saved = null;
    },
  };
  const transport = vi.fn().mockResolvedValue(result);
  const a = new ReadonlyTalAdapter({
    vault,
    transport,
    refresh,
    now: () => 1000,
  });
  const state = a.connection();
  if (state.status !== 'connected') throw Error();
  return {
    a,
    query: { childId: state.child.value, date: '2026-10-17' },
    vault,
    transport,
    refresh,
  };
}
it('到期检查合并并发，允许相同令牌并保存轮换 Cookie；作业运输不接收 Cookie', async () => {
  const { a, query, vault, transport, refresh } = setup();
  expect(
    await Promise.all([a.listHomework(query), a.listHomework(query)]),
  ).toEqual([result, result]);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(vault.load()?.renewal?.cookies[0].value).toBe('synthetic-rotated');
  expect(transport.mock.calls[0][0]).not.toHaveProperty('renewal');
  await a.listHomework(query);
  expect(refresh).toHaveBeenCalledTimes(1);
  a.shutdown();
});
it('保存失败不提交候选，退避期间不再次认证', async () => {
  const { a, query, vault, refresh } = setup();
  vault.save.mockImplementation(() => {
    throw Error('disk');
  });
  await expect(a.listHomework(query)).rejects.toMatchObject({
    code: 'READ_FAILED',
  });
  await expect(a.listHomework(query)).rejects.toMatchObject({
    code: 'READ_FAILED',
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(vault.load()?.token).toBe('synthetic-old');
  a.shutdown();
});
it('认证拒绝清除会话，接口状态不暴露 Cookie', async () => {
  const { a, query, vault } = setup(
    vi.fn().mockRejectedValue(new ReadFailure('SESSION_EXPIRED')),
  );
  expect(JSON.stringify(a.connection())).not.toContain('synthetic-cookie');
  await expect(a.listHomework(query)).rejects.toMatchObject({
    code: 'SESSION_EXPIRED',
  });
  expect(vault.load()).toBeNull();
  expect(a.connection()).toMatchObject({ reason: 'session-expired' });
});
it('并发旧读取的失效不会清除已更新会话', async () => {
  const { a, query, transport, refresh, vault } = setup();
  // 定期续期先完成，再以不同令牌触发认证失败恢复。
  refresh.mockResolvedValueOnce({
    token: 'synthetic-new',
    renewal: { ...savedSession.renewal, nextCheckAt: 301000 },
  });
  await a.listHomework(query);
  transport.mockImplementation(async (s: { token: string }) => {
    if (s.token === 'synthetic-new') throw new ReadFailure('SESSION_EXPIRED');
    return result;
  });
  refresh.mockResolvedValue({
    token: 'synthetic-final',
    renewal: { ...savedSession.renewal, nextCheckAt: 301000 },
  });
  expect(
    await Promise.all([a.listHomework(query), a.listHomework(query)]),
  ).toEqual([result, result]);
  expect(vault.load()?.token).toBe('synthetic-final');
  a.shutdown();
});
it('无 Cookie 的旧会话不会误报自动续期', () => {
  const a = new ReadonlyTalAdapter({
    transport: async () => result,
    refresh: vi.fn(),
    pairingKey: 'synthetic-key',
  });
  const { renewal: ignored, ...old } = savedSession;
  void ignored;
  a.accept('synthetic-key', old);
  expect(a.connection()).toMatchObject({ renewal: 'login-required' });
  a.shutdown();
});
it('已轮换凭据重启后可恢复，读取只重试一次', async () => {
  const { a, query, vault, refresh } = setup();
  await a.listHomework(query);
  a.shutdown();
  const transport = vi
    .fn()
    .mockRejectedValue(new ReadFailure('SESSION_EXPIRED'));
  const restarted = new ReadonlyTalAdapter({
    vault,
    refresh,
    transport,
    now: () => 1000,
  });
  const state = restarted.connection();
  if (state.status !== 'connected') throw Error();
  await expect(
    restarted.listHomework({ ...query, childId: state.child.value }),
  ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(vault.load()).toBeNull();
});
