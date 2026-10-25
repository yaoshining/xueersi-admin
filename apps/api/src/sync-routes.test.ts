import { it, expect, vi } from 'vitest';
import { buildApp } from './app';
import { ReadonlyTalAdapter } from '@xueersi/tal-adapter';
import { businessDate } from '@xueersi/domain';
it('HTTP 确认严格校验、同源保护，记录不泄露令牌或确认密钥', async () => {
  const submit = vi.fn(async () => 'accepted' as const);
  const adapter = new ReadonlyTalAdapter({
    transport: async () => ({ mode: 'real', items: [] }),
    pairingKey: 'synthetic-key',
    writer: {
      prepare: async () => ({ typeLabel: '数学 · 其他', payload: {} }),
      submit,
    },
  });
  adapter.accept('synthetic-key', {
    token: 'synthetic-secret-token',
    studentId: 'student',
    sn: 'device',
    deviceCode: 'model',
  });
  const c = adapter.connection();
  if (c.status !== 'connected') throw Error();
  const app = await buildApp({ adapter });
  const headers = { host: 'localhost', 'x-local-request': '1' };
  const draft = {
    id: 'test',
    childId: c.child.value,
    subject: 'math',
    date: businessDate(new Date()),
    content: '合成作业',
    targetMinutes: 15,
    submissionRequirement: 'image',
  };
  try {
    await app.inject({
      method: 'POST',
      url: '/api/v1/drafts',
      headers,
      payload: draft,
    });
    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/preview',
      headers,
      payload: { draftId: draft.id },
    });
    expect(preview.statusCode).toBe(200);
    expect(submit).not.toHaveBeenCalled();
    const p = preview.json();
    const payload = { ticketId: p.ticketId, secret: p.secret, confirmed: true };
    for (const patch of [
      { confirmed: false },
      { secret: 'wrong' },
      { extra: true },
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/sync/confirm',
            headers,
            payload: { ...payload, ...patch },
          })
        ).statusCode,
      ).not.toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/sync/confirm',
          headers: { ...headers, origin: 'https://evil.example' },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/sync/confirm',
          headers: { host: 'localhost' },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect(submit).not.toHaveBeenCalled();
    const result = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/confirm',
      headers,
      payload,
    });
    expect(result.json().status).toBe('accepted');
    expect(submit).toHaveBeenCalledTimes(1);
    const records = await app.inject('/api/v1/sync/records');
    expect(records.body).not.toContain(p.secret);
    expect(records.body).not.toContain('synthetic-secret-token');
  } finally {
    await app.close();
  }
});
it('批量接口严格确认、同源保护、取消及历史分类', async () => {
  const submit = vi.fn(async () => 'accepted' as const);
  const adapter = new ReadonlyTalAdapter({
    transport: async () => ({ mode: 'real', items: [] }),
    pairingKey: 'synthetic-key',
    writer: {
      prepare: async () => ({ typeLabel: '数学 · 其他', payload: {} }),
      submit,
    },
  });
  adapter.accept('synthetic-key', {
    token: 'synthetic-only',
    studentId: 'student',
    sn: 'device',
    deviceCode: 'model',
  });
  const c = adapter.connection();
  if (c.status !== 'connected') throw Error();
  const app = await buildApp({ adapter });
  const headers = { host: 'localhost', 'x-local-request': '1' };
  try {
    for (const n of [1, 2])
      await app.inject({
        method: 'POST',
        url: '/api/v1/drafts',
        headers,
        payload: {
          id: `batch-${n}`,
          childId: c.child.value,
          subject: 'math',
          date: businessDate(new Date()),
          content: `合成练习 ${n}`,
          targetMinutes: 15,
          submissionRequirement: 'image',
        },
      });
    for (const payload of [
      { draftIds: [] },
      { draftIds: ['batch-1', 'batch-1'] },
      { draftIds: ['batch-1'], extra: true },
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/sync/batch/preview',
            headers,
            payload,
          })
        ).statusCode,
      ).toBe(400);
    const preview = async () =>
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/sync/batch/preview',
          headers,
          payload: { draftIds: ['batch-1', 'batch-2'] },
        })
      ).json();
    const p = await preview();
    const payload = { ticketId: p.ticketId, secret: p.secret, confirmed: true };
    for (const patch of [
      { confirmed: false },
      { secret: 'wrong' },
      { draftIds: ['batch-1'] },
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/sync/batch/confirm',
            headers,
            payload: { ...payload, ...patch },
          })
        ).statusCode,
      ).not.toBe(200);
    for (const denied of [
      { host: 'localhost' },
      { ...headers, origin: 'https://evil.example' },
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/sync/batch/confirm',
            headers: denied,
            payload,
          })
        ).statusCode,
      ).toBe(403);
    expect(submit).not.toHaveBeenCalled();
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/sync/batch/preview/${p.ticketId}`,
      headers,
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/sync/batch/confirm',
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(409);
    const q = await preview();
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/batch/confirm',
      headers,
      payload: { ticketId: q.ticketId, secret: q.secret, confirmed: true },
    });
    expect(r.json().items.map((x: { status: string }) => x.status)).toEqual([
      'accepted',
      'accepted',
    ]);
    expect(submit).toHaveBeenCalledTimes(2);
    expect((await app.inject('/api/v1/drafts')).json().items).toEqual([]);
    const records = await app.inject('/api/v1/sync/records');
    expect(records.json().items).toHaveLength(2);
    expect(records.body).not.toContain(q.secret);
    expect(records.body).not.toContain('synthetic-only');
  } finally {
    await app.close();
  }
});
