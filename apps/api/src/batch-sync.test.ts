import { afterEach, expect, it, vi } from 'vitest';
import { openDraftStore } from '@xueersi/db';
import type { Draft } from '@xueersi/contracts';
import { SyncService } from './sync';
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((close) => close()));
function setup() {
  const store = openDraftStore(':memory:');
  cleanups.push(() => store.close());
  const drafts: Draft[] = [1, 2, 3].map((n) => ({
    id: `draft-${n}`,
    childId: 'child-test',
    subject: 'math',
    date: '2026-10-19',
    content: `合成练习 ${n}`,
    targetMinutes: 15,
    submissionRequirement: n === 2 ? 'audio' : 'image',
  }));
  drafts.forEach((d) => store.create(d));
  const context = {
    status: 'connected',
    sessionId: 'synthetic-session',
    child: { value: 'child-test', label: '测试孩子' },
    device: { value: 'device-test', label: '测试设备' },
  };
  const submit = vi.fn<() => Promise<'accepted' | 'failed'>>(
    async () => 'accepted',
  );
  const adapter = {
    connection: () => context,
    prepareDraft: vi.fn(async (_d: Draft) => ({
      typeLabel: '数学 · 其他',
      submit,
    })),
  };
  let now = Date.parse('2026-10-19T10:00:00+08:00');
  return {
    store,
    drafts,
    submit,
    adapter,
    context,
    service: new SyncService(store, adapter, () => now),
    expire: () => {
      now += 300001;
    },
  };
}
it('一次确认按预览发送全部，重复确认不重发，成功项退出待同步列表', async () => {
  const s = setup();
  const p = await s.service.previewBatch(s.drafts.map((d) => d.id));
  expect(p.summaries.map((x) => x.draft.submissionRequirement)).toEqual([
    'image',
    'audio',
    'image',
  ]);
  expect(s.submit).not.toHaveBeenCalled();
  await expect(
    s.service.confirmBatch({ ...p, confirmed: false }),
  ).rejects.toThrow();
  const results = await Promise.allSettled([
    s.service.confirmBatch({ ...p, confirmed: true }),
    s.service.confirmBatch({ ...p, confirmed: true }),
  ]);
  expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(s.submit).toHaveBeenCalledTimes(3);
  expect(s.store.list()).toHaveLength(0);
  expect(s.store.syncRecords()).toHaveLength(3);
  s.store.update({ ...s.drafts[0]!, content: '修改后的合成练习' });
  expect(s.store.list().map((d) => d.id)).toEqual(['draft-1']);
});
it('兼容单条同步历史，原草稿保留且未知/拒绝项不冒充已同步', async () => {
  const s = setup();
  const p = await s.service.preview('draft-1');
  await s.service.confirm({ ...p, confirmed: true });
  expect(s.store.list().map((d) => d.id)).toEqual(['draft-2', 'draft-3']);
  expect(s.store.get('draft-1')).toEqual(s.drafts[0]);
  s.submit.mockRejectedValueOnce(new Error('synthetic'));
  await s.service.confirm({
    ...(await s.service.preview('draft-2')),
    confirmed: true,
  });
  expect(s.store.list().map((d) => d.id)).toContain('draft-2');
});
it.each([
  'changed',
  'removed',
  'session',
  'device',
  'expired',
  'cancelled',
  'type',
])('任何批次预检失效都在首个写入前拒绝：%s', async (kind) => {
  const s = setup();
  const p = await s.service.previewBatch(['draft-1', 'draft-2']);
  if (kind === 'changed') s.store.update({ ...s.drafts[1]!, content: '改变' });
  if (kind === 'removed') s.store.remove('draft-2');
  if (kind === 'session') s.context.sessionId = 'other-session';
  if (kind === 'device') s.context.device.value = 'other-device';
  if (kind === 'expired') s.expire();
  if (kind === 'cancelled') s.service.cancelBatch(p.ticketId);
  if (kind === 'type')
    s.adapter.prepareDraft.mockImplementation(async () => ({
      typeLabel: '改变的类型',
      submit: s.submit,
    }));
  await expect(
    s.service.confirmBatch({ ...p, confirmed: true }),
  ).rejects.toThrow();
  expect(s.submit).not.toHaveBeenCalled();
});
it.each(['failed', 'unknown'] as const)(
  '部分 %s 后停止，已发送记录持久防重，未发送可重新预览',
  async (status) => {
    const s = setup();
    s.submit.mockResolvedValueOnce('accepted');
    if (status === 'failed') s.submit.mockResolvedValueOnce('failed');
    else s.submit.mockRejectedValueOnce(new Error('synthetic-secret'));
    const p = await s.service.previewBatch(['draft-1', 'draft-2', 'draft-3']);
    const r = await s.service.confirmBatch({ ...p, confirmed: true });
    expect(r.items.map((x) => x.status)).toEqual([
      'accepted',
      status,
      'not_sent',
    ]);
    expect(s.submit).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(r)).not.toContain('synthetic-secret');
    await expect(s.service.previewBatch(['draft-1'])).rejects.toThrow();
    await expect(s.service.previewBatch(['draft-3'])).resolves.toBeDefined();
    const restart = new SyncService(s.store, s.adapter, () =>
      Date.parse('2026-10-19T10:00:00+08:00'),
    );
    await expect(
      restart.confirmBatch({ ...p, confirmed: true }),
    ).rejects.toThrow();
    await expect(restart.preview('draft-1')).rejects.toThrow();
  },
);
it('拒绝空批次、超限、重复ID/内容和混合孩子', async () => {
  const s = setup();
  s.store.create({ ...s.drafts[0]!, id: 'copy' });
  s.store.create({ ...s.drafts[0]!, id: 'other', childId: 'other-child' });
  for (const ids of [
    [],
    Array.from({ length: 21 }, (_, i) => String(i)),
    ['draft-1', 'draft-1'],
    ['draft-1', 'copy'],
    ['draft-1', 'other'],
  ])
    await expect(s.service.previewBatch(ids)).rejects.toThrow();
  expect(s.submit).not.toHaveBeenCalled();
});
it('批量和单条并发共享防重；后续目标变化停止', async () => {
  const s = setup();
  const batch = await s.service.previewBatch(['draft-1', 'draft-2']);
  const single = await s.service.preview('draft-1');
  await s.service.confirm({ ...single, confirmed: true });
  await expect(
    s.service.confirmBatch({ ...batch, confirmed: true }),
  ).rejects.toThrow();
  expect(s.submit).toHaveBeenCalledTimes(1);
  const p = await s.service.previewBatch(['draft-2', 'draft-3']);
  s.submit.mockImplementationOnce(async () => {
    s.context.device.value = 'changed';
    return 'accepted';
  });
  const result = await s.service.confirmBatch({ ...p, confirmed: true });
  expect(result.items.map((i) => i.status)).toEqual(['accepted', 'not_sent']);
  expect(s.submit).toHaveBeenCalledTimes(2);
});
it('全批异步预检期间改变其他条目仍在首写前拒绝', async () => {
  const s = setup();
  const p = await s.service.previewBatch(['draft-1', 'draft-2']);
  s.adapter.prepareDraft.mockImplementationOnce(async () => {
    s.store.update({ ...s.drafts[1]!, content: '预检期间更改' });
    return { typeLabel: '数学 · 其他', submit: s.submit };
  });
  await expect(
    s.service.confirmBatch({ ...p, confirmed: true }),
  ).rejects.toThrow();
  expect(s.submit).not.toHaveBeenCalled();
});
