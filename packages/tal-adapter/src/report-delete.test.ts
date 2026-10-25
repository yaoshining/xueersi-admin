import { it, expect, vi } from 'vitest';
import { ReadonlyTalAdapter } from './index';
it('附件与删除先验证孩子/列表归属，完成状态禁止删除，运输无 Cookie', async () => {
  let status = 'completed';
  const report = vi.fn(async () => ({
    attachments: [
      {
        kind: 'audio',
        state: 'available',
        url: 'https://media.example.com/audio',
      },
    ],
  }));
  const prepareDelete = vi.fn(async () => ({ synthetic: true })),
    submit = vi.fn(async () => 'accepted' as const);
  const adapter = new ReadonlyTalAdapter({
    pairingKey: 'key',
    transport: async () => ({
      mode: 'real',
      items: [
        {
          id: 'task',
          date: '2026-10-17',
          subject: 'math',
          content: '合成',
          status,
        },
      ],
    }),
    report,
    writer: {
      prepare: async () => ({ typeLabel: '合成', payload: {} }),
      prepareDelete,
      submit,
    },
  });
  adapter.accept('key', {
    token: 'synthetic-token',
    studentId: 'student',
    sn: 'device',
    deviceCode: 'model',
  });
  const c = adapter.connection();
  if (c.status !== 'connected') throw Error();
  const query = { id: 'task', date: '2026-10-17', childId: c.child.value };
  try {
    await expect(adapter.report({ ...query, id: 'other' })).rejects.toThrow();
    await expect(
      adapter.report({ ...query, childId: 'other' }),
    ).rejects.toThrow();
    expect(report).not.toHaveBeenCalled();
    expect((await adapter.report(query)).attachments).toHaveLength(1);
    await expect(adapter.prepareDelete(query)).rejects.toThrow();
    expect(prepareDelete).not.toHaveBeenCalled();
    status = 'pending';
    const p = await adapter.prepareDelete(query);
    expect(submit).not.toHaveBeenCalled();
    await p.submit();
    await expect(p.submit()).rejects.toThrow();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(submit.mock.calls)).not.toContain('renewal');
    const old = await adapter.prepareDelete(query);
    adapter.disconnect();
    await expect(old.submit()).rejects.toThrow();
    expect(submit).toHaveBeenCalledTimes(1);
  } finally {
    adapter.shutdown();
  }
});
