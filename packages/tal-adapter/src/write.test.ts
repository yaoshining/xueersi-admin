import { it, expect, vi } from 'vitest';
import { ReadonlyTalAdapter, ReadFailure, type DraftWriter } from './index';
it('只读预检可续期，写运输无 Cookie 且失败不重放', async () => {
  const session = {
    token: 'synthetic-old',
    studentId: 'student',
    sn: 'device',
    deviceCode: 'model',
    renewal: {
      deviceId: 'browser',
      cookies: [{ name: 'test', value: 'synthetic-cookie' }],
      nextCheckAt: 0,
    },
  };
  const submit = vi.fn(async () => {
    throw new ReadFailure('SESSION_EXPIRED');
  });
  const prepare = vi.fn<DraftWriter['prepare']>(async () => ({
    typeLabel: '数学 · 其他',
    payload: { synthetic: true },
  }));
  const adapter = new ReadonlyTalAdapter({
    vault: { load: () => session, save: () => {}, clear: () => {} },
    transport: async () => ({ mode: 'real', items: [] }),
    refresh: async () => ({
      token: 'synthetic-new',
      renewal: { ...session.renewal, nextCheckAt: Date.now() + 300000 },
    }),
    writer: { prepare, submit },
  });
  try {
    const c = adapter.connection();
    if (c.status !== 'connected') throw Error();
    const p = await adapter.prepareDraft({
      id: 'test',
      childId: c.child.value,
      subject: 'math',
      date: '2026-10-17',
      content: '合成作业',
      targetMinutes: 15,
      submissionRequirement: 'audio-or-video',
    });
    expect(submit).not.toHaveBeenCalled();
    expect(prepare.mock.calls[0]?.[0]).toMatchObject({
      token: 'synthetic-new',
    });
    await expect(p.submit()).rejects.toThrow();
    await expect(p.submit()).rejects.toThrow();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(submit.mock.calls)).not.toContain('cookie');
  } finally {
    adapter.shutdown();
  }
});
