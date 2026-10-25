import { it, expect, vi } from 'vitest';
import { ReadonlyTalAdapter, type ReadTransport } from './index';
it('月范围校验权限、长度和返回日期边界', async () => {
  let date = '2026-10-31';
  const transport = vi.fn<ReadTransport>(async () => ({
    mode: 'real',
    items: [
      {
        id: 'synthetic',
        subject: 'math',
        content: '合成',
        status: 'pending',
        date,
      },
    ],
  }));
  const a = new ReadonlyTalAdapter({ pairingKey: 'key', transport });
  a.accept('key', {
    token: 'synthetic',
    studentId: 'student',
    sn: 'device',
    deviceCode: 'model',
  });
  const c = a.connection();
  if (c.status !== 'connected') throw Error();
  try {
    for (const q of [
      { date: '2026-10-31', endDate: '2026-10-01' },
      { date: '2026-10-01', endDate: '2026-12-01' },
    ])
      await expect(
        a.listHomework({ ...q, childId: c.child.value }),
      ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
    const q = {
      date: '2026-10-01',
      endDate: '2026-10-31',
      childId: c.child.value,
    };
    expect((await a.listHomework(q)).items).toHaveLength(1);
    expect(transport.mock.calls[0]?.[0]).toMatchObject({
      date: q.date,
      endDate: q.endDate,
    });
    date = '2026-11-01';
    await expect(a.listHomework(q)).rejects.toThrow();
  } finally {
    a.shutdown();
  }
});
