import { it, expect, vi } from 'vitest';
import { openDraftStore } from '@xueersi/db';
import type { Homework } from '@xueersi/contracts';
import { HomeworkDeleteService } from './homework-delete';
const item: Homework = {
  id: 'synthetic-task',
  subject: 'math',
  date: '2026-10-17',
  content: '合成作业',
  status: 'pending',
  targetMinutes: 15,
  submissionRequirement: 'image',
};
function setup() {
  const store = openDraftStore(':memory:');
  let current = structuredClone(item),
    sessionId = 'session',
    time = 1;
  const submit = vi.fn(async (): Promise<'accepted' | 'failed'> => 'accepted');
  const adapter = {
    connection: () => ({
      status: 'connected',
      sessionId,
      child: { value: 'child', label: '合成孩子' },
      device: { value: 'device', label: '合成设备' },
    }),
    prepareDelete: vi.fn(async () => {
      if (current.status !== 'pending') throw Error();
      return { item: structuredClone(current), submit };
    }),
  };
  const service = new HomeworkDeleteService(store, adapter, () => time);
  return {
    store,
    service,
    adapter,
    submit,
    change: () => {
      current = { ...current, content: '已变更' };
    },
    complete: () => {
      current = { ...current, status: 'completed' };
    },
    switch: () => {
      sessionId = 'new';
    },
    expire: () => {
      time = 400000;
    },
  };
}
it('预览/取消无写入，明确确认仅提交一次并持久阻止重复', async () => {
  const s = setup();
  try {
    const p = await s.service.preview({
      id: item.id,
      childId: 'child',
      date: item.date,
    });
    expect(s.submit).not.toHaveBeenCalled();
    await expect(
      s.service.confirm({ ...p, confirmed: false }),
    ).rejects.toThrow();
    s.service.cancel(p.ticketId);
    await expect(
      s.service.confirm({ ...p, confirmed: true }),
    ).rejects.toThrow();
    const p2 = await s.service.preview({
      id: item.id,
      childId: 'child',
      date: item.date,
    });
    expect((await s.service.confirm({ ...p2, confirmed: true })).status).toBe(
      'accepted',
    );
    await expect(
      s.service.confirm({ ...p2, confirmed: true }),
    ).rejects.toThrow();
    const restarted = new HomeworkDeleteService(s.store, s.adapter);
    await expect(
      restarted.preview({ id: item.id, childId: 'child', date: item.date }),
    ).rejects.toThrow();
    expect(s.submit).toHaveBeenCalledTimes(1);
  } finally {
    s.store.close();
  }
});
for (const action of ['change', 'complete', 'switch', 'expire'] as const)
  it(`${action}使旧删除确认失效`, async () => {
    const s = setup();
    try {
      const p = await s.service.preview({
        id: item.id,
        childId: 'child',
        date: item.date,
      });
      s[action]();
      await expect(
        s.service.confirm({ ...p, confirmed: true }),
      ).rejects.toThrow();
      expect(s.submit).not.toHaveBeenCalled();
    } finally {
      s.store.close();
    }
  });
it('删除超时未知且不自动重试', async () => {
  const s = setup();
  s.submit.mockRejectedValue(Error('synthetic-private-error'));
  try {
    const p = await s.service.preview({
      id: item.id,
      childId: 'child',
      date: item.date,
    });
    expect((await s.service.confirm({ ...p, confirmed: true })).status).toBe(
      'unknown',
    );
    await expect(
      s.service.preview({ id: item.id, childId: 'child', date: item.date }),
    ).rejects.toThrow();
    expect(s.submit).toHaveBeenCalledTimes(1);
  } finally {
    s.store.close();
  }
});
