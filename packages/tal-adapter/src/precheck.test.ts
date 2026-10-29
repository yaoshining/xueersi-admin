import { expect, it, vi } from 'vitest';
import {
  ReadonlyTalAdapter,
  ReadFailure,
  type DraftWriter,
  type ReadTransport,
} from './index';
const session = {
  token: 'synthetic-token',
  studentId: 'student',
  sn: 'device',
  deviceCode: 'model',
};
function setup() {
  const transport = vi.fn(async () => ({ mode: 'real', items: [] }));
  const submit = vi.fn(async () => 'accepted' as const);
  const prepare = vi.fn<DraftWriter['prepare']>(async () => ({
    typeLabel: '语文 · 其他',
    payload: {},
  }));
  const adapter = new ReadonlyTalAdapter({
    vault: { load: () => session, save: () => {}, clear: () => {} },
    transport,
    writer: { prepare, submit },
  });
  const c = adapter.connection();
  if (c.status !== 'connected') throw Error();
  const draft = {
    id: 'synthetic',
    childId: c.child.value,
    subject: 'chinese' as const,
    date: '2026-10-29',
    content: '合成练习',
    targetMinutes: 0 as const,
    submissionRequirement: 'image' as const,
  };
  return { adapter, transport, prepare, submit, draft };
}
it('区分读取与配置失败，错误仅保留静态码；恢复后不自动写入', async () => {
  const s = setup();
  try {
    s.transport.mockRejectedValueOnce(new Error('synthetic-private-read'));
    await expect(s.adapter.prepareDraft(s.draft)).rejects.toMatchObject({
      code: 'SYNC_PRECHECK_READ_FAILED',
    });
    s.prepare.mockRejectedValueOnce(new Error('synthetic-private-config'));
    await expect(s.adapter.prepareDraft(s.draft)).rejects.toMatchObject({
      code: 'SYNC_PRECHECK_CONFIG_FAILED',
      message: 'SYNC_PRECHECK_CONFIG_FAILED',
    });
    expect(s.submit).not.toHaveBeenCalled();
    const p = await s.adapter.prepareDraft(s.draft);
    expect(s.submit).not.toHaveBeenCalled();
    await p.submit();
    await expect(p.submit()).rejects.toThrow();
    expect(s.submit).toHaveBeenCalledTimes(1);
  } finally {
    s.adapter.shutdown();
  }
});
it('预检超时和异步会话变化分别拒绝，不调用写运输', async () => {
  const s = setup();
  vi.useFakeTimers();
  try {
    s.prepare.mockImplementationOnce(
      async (_i, _d, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () =>
            reject(new Error('synthetic-abort')),
          ),
        ),
    );
    const timed = s.adapter.prepareDraft(s.draft).catch((error) => error);
    await vi.advanceTimersByTimeAsync(20001);
    expect(await timed).toMatchObject({ code: 'SYNC_PRECHECK_TIMEOUT' });
    s.prepare.mockImplementationOnce(async () => {
      s.adapter.disconnect();
      return { typeLabel: '语文 · 其他', payload: {} };
    });
    await expect(s.adapter.prepareDraft(s.draft)).rejects.toMatchObject({
      code: 'SYNC_PRECHECK_SESSION_CHANGED',
    });
    expect(s.submit).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
    s.adapter.shutdown();
  }
});

const reset = () =>
  new TypeError('synthetic-fetch', {
    cause: Object.assign(new Error('synthetic-network'), {
      code: 'ECONNRESET',
    }),
  });
it('列表连接重置只重读一次，不误续期，真实写入重置不重试', async () => {
  const renewal = {
    deviceId: 'synthetic-browser',
    cookies: [{ name: 'synthetic', value: 'synthetic-cookie' }],
    nextCheckAt: Date.now() + 300000,
  };
  const save = vi.fn(),
    refresh = vi.fn(async () => ({ token: 'synthetic-new', renewal }));
  const transport = vi
    .fn<ReadTransport>(async () => ({ mode: 'real', items: [] }))
    .mockRejectedValueOnce(reset());
  const prepare = vi.fn<DraftWriter['prepare']>(async () => ({
    typeLabel: '语文 · 其他',
    payload: {},
  }));
  const submit = vi.fn(async () => {
    throw reset();
  });
  const adapter = new ReadonlyTalAdapter({
    vault: { load: () => ({ ...session, renewal }), save, clear: () => {} },
    refresh,
    transport,
    writer: { prepare, submit },
  });
  try {
    const c = adapter.connection();
    if (c.status !== 'connected') throw Error();
    const p = await adapter.prepareDraft({
      id: 'synthetic',
      childId: c.child.value,
      subject: 'chinese',
      date: '2026-10-29',
      content: '合成练习',
      targetMinutes: 0,
      submissionRequirement: 'image',
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1]?.[0]).toMatchObject({
      token: 'synthetic-token',
    });
    expect(prepare.mock.calls[0]?.[0]).toMatchObject({
      token: 'synthetic-token',
    });
    expect(submit).not.toHaveBeenCalled();
    await expect(p.submit()).rejects.toThrow();
    await expect(p.submit()).rejects.toThrow();
    expect(submit).toHaveBeenCalledTimes(1);
  } finally {
    adapter.shutdown();
  }
});
it('已有预先续期不再重复续期，持续重置有界失败且保留会话', async () => {
  const renewal = {
    deviceId: 'synthetic-browser',
    cookies: [{ name: 'synthetic', value: 'synthetic-cookie' }],
    nextCheckAt: 0,
  };
  const clear = vi.fn(),
    refresh = vi.fn(async () => ({
      token: 'synthetic-new',
      renewal: { ...renewal, nextCheckAt: Date.now() + 300000 },
    }));
  const transport = vi.fn().mockRejectedValue(reset());
  const adapter = new ReadonlyTalAdapter({
    vault: { load: () => ({ ...session, renewal }), save: () => {}, clear },
    refresh,
    transport,
  });
  try {
    const c = adapter.connection();
    if (c.status !== 'connected') throw Error();
    await expect(
      adapter.listHomework({ childId: c.child.value, date: '2026-10-29' }),
    ).rejects.toThrow();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(clear).not.toHaveBeenCalled();
    expect(adapter.connection().status).toBe('connected');
  } finally {
    adapter.shutdown();
  }
});

it('连接重置后的明确过期仍允许一次静默续期', async () => {
  const renewal = {
    deviceId: 'synthetic-browser',
    cookies: [{ name: 'synthetic', value: 'synthetic-cookie' }],
    nextCheckAt: Date.now() + 300000,
  };
  const refresh = vi.fn(async () => ({ token: 'synthetic-new', renewal }));
  const transport = vi
    .fn<ReadTransport>(async () => ({ mode: 'real', items: [] }))
    .mockRejectedValueOnce(reset())
    .mockRejectedValueOnce(new ReadFailure('SESSION_EXPIRED'));
  const clear = vi.fn();
  const adapter = new ReadonlyTalAdapter({
    vault: { load: () => ({ ...session, renewal }), save: () => {}, clear },
    refresh,
    transport,
  });
  try {
    const c = adapter.connection();
    if (c.status !== 'connected') throw Error();
    await expect(
      adapter.listHomework({ childId: c.child.value, date: '2026-10-29' }),
    ).resolves.toMatchObject({ items: [] });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
  } finally {
    adapter.shutdown();
  }
});
