import { it, expect, vi } from 'vitest';
import { buildApp } from './app';
import { ReadonlyTalAdapter } from '@xueersi/tal-adapter';
import type { SessionHandoff } from '@xueersi/contracts';
const session = {
  token: 'synthetic-old',
  studentId: 'synthetic-child',
  sn: 'synthetic-device',
  deviceCode: 'synthetic-model',
};
const renewal = {
  deviceId: 'synthetic-auth-device',
  cookies: [{ name: 'synthetic_auth', value: 'synthetic-cookie' }],
  nextCheckAt: 0,
};
const origin = 'chrome-extension://' + 'a'.repeat(32);
function setup() {
  let saved: SessionHandoff | null = structuredClone(session);
  const vault = {
    load: () => saved,
    save: (s: SessionHandoff) => {
      saved = structuredClone(s);
    },
    clear: () => {
      saved = null;
    },
  };
  const refresh = vi.fn().mockResolvedValue({
    token: 'synthetic-new',
    renewal: { ...renewal, nextCheckAt: Date.now() + 300000 },
  });
  const transport = vi.fn().mockResolvedValue({ mode: 'real', items: [] });
  const adapter = new ReadonlyTalAdapter({ vault, refresh, transport });
  return { vault, refresh, transport, adapter };
}
it('只有指定扩展配对后可交接；先只读验证再保存，返回无凭据，配对不可重放', async () => {
  const { adapter, refresh, transport, vault } = setup();
  const app = await buildApp({ adapter, handoffOrigin: origin });
  const headers = { origin, 'x-local-request': '1' };
  try {
    const key = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/session/pairing',
        headers,
      })
    ).json().key;
    for (const bad of [
      { origin: 'https://baodian.tal.com', 'x-local-request': '1' },
      { origin: 'https://evil.example', 'x-local-request': '1' },
      { origin },
    ]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/session/renewal',
            headers: { ...bad, 'x-pairing-key': key },
            payload: renewal,
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(refresh).not.toHaveBeenCalled();
    const send = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/session/renewal',
        headers: { ...headers, 'x-pairing-key': key },
        payload: renewal,
      });
    const response = await send();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(vault.load()?.token).toBe('synthetic-new');
    expect((await send()).statusCode).toBe(403);
    const state = (await app.inject('/api/v1/connection')).json();
    expect(state.renewal).toBe('automatic');
    expect(JSON.stringify(state)).not.toContain('synthetic-cookie');
  } finally {
    await app.close();
  }
});
it('读取验证失败不能覆盖已有会话，Cookie 不能从普通会话接口进入', async () => {
  const { adapter, vault, transport } = setup();
  transport.mockRejectedValue(Error('synthetic-secret'));
  const app = await buildApp({ adapter, handoffOrigin: origin });
  const headers = { origin, 'x-local-request': '1' };
  try {
    const key = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/session/pairing',
        headers,
      })
    ).json().key;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/session/renewal',
      headers: { ...headers, 'x-pairing-key': key },
      payload: renewal,
    });
    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain('synthetic-secret');
    expect(vault.load()).toEqual(session);
    const key2 = adapter.issuePairing();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/session',
          headers: { origin: 'https://baodian.tal.com', 'x-pairing-key': key2 },
          payload: { ...session, renewal },
        })
      ).statusCode,
    ).toBe(403);
  } finally {
    await app.close();
  }
});
it('交接中断开或更换会话，迟到结果不复活旧会话', async () => {
  for (const action of ['disconnect', 'replace'] as const) {
    const { adapter, vault, refresh } = setup();
    let resolve!: (v: unknown) => void;
    refresh.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = adapter
      .acceptRenewal(adapter.issuePairing(), renewal, '2026-10-17')
      .catch((e) => e);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    if (action === 'disconnect') adapter.disconnect();
    else
      adapter.accept(adapter.issuePairing(), {
        ...session,
        token: 'synthetic-replacement',
      });
    resolve({ token: 'synthetic-new', renewal });
    await pending;
    expect(vault.load()).toEqual(
      action === 'disconnect'
        ? null
        : { ...session, token: 'synthetic-replacement' },
    );
    adapter.shutdown();
  }
});
