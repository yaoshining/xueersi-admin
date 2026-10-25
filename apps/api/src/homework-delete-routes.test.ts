import { it, expect, vi } from 'vitest';
import { buildApp } from './app';
import { ReadonlyTalAdapter } from '@xueersi/tal-adapter';
it('删除路由拒绝跨站、缺头、额外字段和伪造确认，返回不含凭据', async () => {
  const submit = vi.fn(async () => 'accepted' as const);
  const adapter = new ReadonlyTalAdapter({
    pairingKey: 'key',
    transport: async () => ({
      mode: 'real',
      items: [
        {
          id: 'synthetic',
          subject: 'math',
          content: '合成',
          date: '2026-10-17',
          status: 'pending',
        },
      ],
    }),
    writer: {
      prepare: async () => ({ typeLabel: '合成', payload: {} }),
      prepareDelete: async () => ({}),
      submit,
    },
  });
  adapter.accept('key', {
    token: 'synthetic-private-token',
    studentId: 'student',
    sn: 'device',
    deviceCode: 'model',
  });
  const c = adapter.connection();
  if (c.status !== 'connected') throw Error();
  const app = await buildApp({ adapter }),
    headers = { host: 'localhost', 'x-local-request': '1' };
  try {
    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/homework/delete/preview',
      headers,
      payload: { id: 'synthetic', date: '2026-10-17', childId: c.child.value },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.body).not.toContain('synthetic-private-token');
    const p = preview.json(),
      payload = { ticketId: p.ticketId, secret: p.secret, confirmed: true };
    for (const patch of [
      { confirmed: false },
      { extra: true },
      { secret: 'wrong' },
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/homework/delete/confirm',
            headers,
            payload: { ...payload, ...patch },
          })
        ).statusCode,
      ).not.toBe(200);
    for (const h of [
      { host: 'localhost' },
      { ...headers, origin: 'https://evil.example' },
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/homework/delete/confirm',
            headers: h,
            payload,
          })
        ).statusCode,
      ).toBe(403);
    expect(submit).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/homework/delete/confirm',
          headers,
          payload,
        })
      ).json(),
    ).toEqual({ status: 'accepted' });
    expect(submit).toHaveBeenCalledTimes(1);
  } finally {
    await app.close();
  }
});
