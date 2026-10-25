import { it, expect, vi } from 'vitest';
import { buildApp } from './app';
import { ReadonlyTalAdapter } from '@xueersi/tal-adapter';
const handoff = {
  token: 'synthetic-secret',
  studentId: 'synthetic-student',
  sn: 'synthetic-device',
  deviceCode: 'synthetic-model',
};
it('只允许配对的官方页面交接，真实 GET 隔离且写入无路由', async () => {
  const transport = vi.fn().mockResolvedValue({ mode: 'real', items: [] });
  const adapter = new ReadonlyTalAdapter({
    transport,
    pairingKey: 'synthetic-key',
  });
  const app = await buildApp({ adapter });
  try {
    const headers = {
      host: '127.0.0.1:3107',
      origin: 'https://baodian.tal.com',
      'x-pairing-key': 'synthetic-key',
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/session',
          headers: { ...headers, origin: 'https://evil.example' },
          payload: handoff,
        })
      ).statusCode,
    ).toBe(403);
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/session',
      headers,
    });
    expect(preflight.headers['access-control-allow-origin']).toBe(
      'https://baodian.tal.com',
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/session',
          headers,
          payload: handoff,
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject('/api/v1/connection')).body).not.toContain(
      handoff.token,
    );
    const state = adapter.connection();
    if (state.status !== 'connected')
      throw new Error('missing synthetic session');
    expect(
      (
        await app.inject(
          `/api/v1/homework?childId=${state.child.value}&date=2026-10-17`,
        )
      ).json(),
    ).toEqual({ mode: 'real', items: [] });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/homework',
          headers: { host: 'localhost', 'x-local-request': '1' },
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/session',
          headers,
          payload: handoff,
        })
      ).statusCode,
    ).toBe(403);
  } finally {
    await app.close();
  }
  expect(adapter.connection().canRead).toBe(false);
});
it('新配对只给指定扩展，缺头和错误来源不发密钥', async () => {
  const origin = 'chrome-extension://' + 'a'.repeat(32);
  const adapter = new ReadonlyTalAdapter({
    transport: async () => ({ mode: 'real', items: [] }),
  });
  const app = await buildApp({ adapter, handoffOrigin: origin });
  try {
    for (const headers of [
      { origin: 'https://baodian.tal.com', 'x-local-request': '1' },
      { origin: 'https://evil.example', 'x-local-request': '1' },
      { origin },
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/session/pairing',
            headers: { host: '127.0.0.1', ...headers },
          })
        ).statusCode,
      ).toBe(403);
    const headers = { host: '127.0.0.1', origin, 'x-local-request': '1' };
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/session/pairing',
      headers,
    });
    expect(response.statusCode).toBe(200);
    const key = response.json().key;
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    const accept = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/session',
        headers: { ...headers, 'x-pairing-key': key },
        payload: {
          ...handoff,
          childName: '测试孩子',
          deviceName: '测试学习机',
        },
      });
    expect((await accept()).statusCode).toBe(200);
    expect((await accept()).statusCode).toBe(403);
    expect((await app.inject('/api/v1/connection')).json()).toMatchObject({
      child: { label: '测试孩子' },
      device: { label: '测试学习机' },
    });
  } finally {
    await app.close();
  }
});
