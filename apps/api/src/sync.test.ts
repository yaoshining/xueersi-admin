import { it, expect, vi } from 'vitest';
import { openDraftStore } from '@xueersi/db';
import { SyncService } from './sync';
const draft = {
  id: 'test',
  childId: 'child-test',
  subject: 'math' as const,
  date: '2026-10-17',
  content: '合成作业',
  targetMinutes: 15 as const,
  submissionRequirement: 'image' as const,
};
const context = {
  status: 'connected' as const,
  sessionId: 'session',
  child: { value: draft.childId, label: '测试孩子' },
  device: { value: 'device-test', label: '测试设备' },
};
function setup() {
  const store = openDraftStore(':memory:');
  store.create(draft);
  const submit = vi.fn(async () => 'accepted' as const);
  const adapter = {
    connection: () => context,
    prepareDraft: vi.fn(async () => ({ typeLabel: '数学 · 其他', submit })),
  };
  let now = Date.parse('2026-10-17T10:00:00+08:00');
  const service = new SyncService(store, adapter, () => now);
  return {
    store,
    submit,
    adapter,
    service,
    advance: () => {
      now += 300001;
    },
  };
}
it('预览完整、确认前不写，且并发/复制草稿不重复写', async () => {
  const s = setup();
  try {
    const p = await s.service.preview(draft.id);
    expect(p.summary.draft.targetMinutes).toBe(15);
    expect(p.summary.draft.submissionRequirement).toBe('image');
    expect(s.submit).not.toHaveBeenCalled();
    await expect(
      s.service.confirm({ ...p, confirmed: false }),
    ).rejects.toThrow();
    const result = await s.service.confirm({
      ticketId: p.ticketId,
      secret: p.secret,
      confirmed: true,
    });
    expect(result.status).toBe('accepted');
    await expect(
      s.service.confirm({
        ticketId: p.ticketId,
        secret: p.secret,
        confirmed: true,
      }),
    ).rejects.toThrow();
    s.store.create({ ...draft, id: 'copy' });
    await expect(s.service.preview('copy')).rejects.toThrow();
    expect(s.submit).toHaveBeenCalledTimes(1);
  } finally {
    s.store.close();
  }
});
it('修改、取消和过期票据不会发送', async () => {
  const s = setup();
  try {
    const p = await s.service.preview(draft.id);
    s.store.update({ ...draft, content: '修改' });
    await expect(
      s.service.confirm({ ...p, confirmed: true }),
    ).rejects.toThrow();
    const q = await s.service.preview(draft.id);
    s.service.cancel(q.ticketId);
    await expect(
      s.service.confirm({ ...q, confirmed: true }),
    ).rejects.toThrow();
    const r = await s.service.preview(draft.id);
    s.advance();
    await expect(
      s.service.confirm({ ...r, confirmed: true }),
    ).rejects.toThrow();
    expect(s.submit).not.toHaveBeenCalled();
  } finally {
    s.store.close();
  }
});
it('未知网络结果持久防重，明确拒绝允许重新预览', async () => {
  const s = setup();
  try {
    s.submit.mockRejectedValueOnce(new Error('synthetic-secret'));
    const p = await s.service.preview(draft.id);
    const result = await s.service.confirm({ ...p, confirmed: true });
    expect(result.status).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('secret');
    await expect(s.service.preview(draft.id)).rejects.toThrow();
  } finally {
    s.store.close();
  }
});
it('校验孩子、字数、日期和必填选项', async () => {
  const s = setup();
  try {
    for (const patch of [
      { childId: 'other' },
      { content: '字'.repeat(301) },
      { date: '2026-10-16' },
      { date: '2026-11-18' },
      { targetMinutes: null },
      { submissionRequirement: null },
    ]) {
      s.store.update({ ...draft, ...patch });
      await expect(s.service.preview(draft.id)).rejects.toThrow();
    }
    expect(s.adapter.prepareDraft).not.toHaveBeenCalled();
  } finally {
    s.store.close();
  }
});
it('两个预览同时确认也只发送一次，明确拒绝后需重新确认', async () => {
  const s = setup();
  try {
    s.submit.mockResolvedValueOnce('failed' as 'accepted');
    const [a, b] = await Promise.all([
      s.service.preview(draft.id),
      s.service.preview(draft.id),
    ]);
    const results = await Promise.allSettled([
      s.service.confirm({ ...a, confirmed: true }),
      s.service.confirm({ ...b, confirmed: true }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(s.submit).toHaveBeenCalledTimes(1);
    const c = await s.service.preview(draft.id);
    expect((await s.service.confirm({ ...c, confirmed: true })).status).toBe(
      'accepted',
    );
    expect(s.submit).toHaveBeenCalledTimes(2);
  } finally {
    s.store.close();
  }
});
it('提交前的异步预检期间修改草稿也会失效', async () => {
  const s = setup();
  try {
    const p = await s.service.preview(draft.id);
    s.adapter.prepareDraft.mockImplementationOnce(async () => {
      s.store.update({ ...draft, content: '新内容' });
      return { typeLabel: '数学 · 其他', submit: s.submit };
    });
    await expect(
      s.service.confirm({ ...p, confirmed: true }),
    ).rejects.toThrow();
    expect(s.submit).not.toHaveBeenCalled();
  } finally {
    s.store.close();
  }
});
it('外部已响应但本机结果保存失败时仍标为待核对，不误报提交前失败', async () => {
  const s = setup();
  try {
    const p = await s.service.preview(draft.id);
    vi.spyOn(s.store, 'finishSync').mockImplementation(() => {
      throw new Error('synthetic-disk-error');
    });
    expect((await s.service.confirm({ ...p, confirmed: true })).status).toBe(
      'unknown',
    );
    await expect(s.service.preview(draft.id)).rejects.toThrow();
  } finally {
    s.store.close();
  }
});
