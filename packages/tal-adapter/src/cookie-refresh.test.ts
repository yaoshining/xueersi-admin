import { it, expect, vi } from 'vitest';
import { createCookieRefresh } from './cookie-refresh';
const endpoint = 'https://auth.example.invalid/v1/check';
const session = {
  token: 'synthetic-old',
  studentId: 'synthetic-child',
  sn: 'synthetic-device',
  deviceCode: 'synthetic-model',
  renewal: {
    deviceId: 'synthetic-auth-device',
    cookies: [
      { name: 'synthetic_auth', value: 'synthetic-cookie', expiresAt: 900000 },
    ],
    nextCheckAt: 0,
  },
};
const config = {
  endpoint,
  headers: { 'Client-Id': 'synthetic-client' },
  rejectedCodes: [11100],
};
function response(code = 0, token = 'synthetic-new', cookie?: string) {
  return new Response(
    JSON.stringify({ errcode: code, data: { tal_token: token } }),
    { headers: cookie ? { 'Set-Cookie': cookie } : {} },
  );
}
it('仅认证请求携带 Cookie，轮换并给出下次检查时间', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      response(
        0,
        'synthetic-new',
        'synthetic_auth=synthetic-rotated; Path=/; Secure; HttpOnly; Max-Age=600',
      ),
    );
  const refresh = createCookieRefresh(config, {
    fetch: fetcher,
    now: () => 1000,
  });
  const next = await refresh(session, new AbortController().signal);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe(endpoint);
  expect(options.redirect).toBe('error');
  expect(options.headers.Cookie).toBe('synthetic_auth=synthetic-cookie');
  expect(JSON.stringify(options)).not.toContain('synthetic-old');
  expect(next).toEqual({
    token: 'synthetic-new',
    renewal: {
      deviceId: session.renewal.deviceId,
      cookies: [
        {
          name: 'synthetic_auth',
          value: 'synthetic-rotated',
          expiresAt: 601000,
        },
      ],
      nextCheckAt: 301000,
    },
  });
});
it('不接收其他域、路径和未知名称的 Cookie，正确处理删除', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ errcode: 0, data: { tal_token: 'synthetic-old' } }),
      {
        headers: [
          [
            'Set-Cookie',
            'synthetic_auth=wrong; Domain=evil.example.invalid; Path=/',
          ],
          ['Set-Cookie', 'synthetic_auth=wrong; Path=/unrelated'],
          ['Set-Cookie', 'unknown=wrong; Path=/'],
        ],
      },
    ),
  );
  const refresh = createCookieRefresh(config, {
    fetch: fetcher,
    now: () => 1000,
  });
  expect(
    (await refresh(session, new AbortController().signal)).renewal?.cookies,
  ).toEqual(session.renewal.cookies);
  fetcher.mockResolvedValue(
    response(0, 'synthetic-old', 'synthetic_auth=; Max-Age=0; Path=/'),
  );
  expect(
    (await refresh(session, new AbortController().signal)).renewal?.cookies,
  ).toEqual([]);
});
it('过期 Cookie 不发送；官方拒绝与服务器/网络错误区分且不泄露原始内容', async () => {
  const fetcher = vi.fn().mockResolvedValue(response(11100));
  const refresh = createCookieRefresh(config, {
    fetch: fetcher,
    now: () => 1000,
  });
  await expect(
    refresh(
      {
        ...session,
        renewal: {
          ...session.renewal,
          cookies: [{ ...session.renewal.cookies[0], expiresAt: 1 }],
        },
      },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  expect(fetcher).not.toHaveBeenCalled();
  await expect(
    refresh(session, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  fetcher.mockResolvedValue(new Response('synthetic-secret', { status: 503 }));
  await expect(
    refresh(session, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'READ_FAILED', message: '作业读取失败' });
  fetcher.mockRejectedValue(new Error('synthetic-secret'));
  await expect(
    refresh(session, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'READ_FAILED', message: '作业读取失败' });
});
it('非法认证目的地拒绝，Cookie 值不能注入请求头', async () => {
  expect(() =>
    createCookieRefresh({ ...config, endpoint: 'http://auth.example.invalid' }),
  ).toThrow();
  const fetcher = vi.fn();
  const refresh = createCookieRefresh(config, { fetch: fetcher });
  await expect(
    refresh(
      {
        ...session,
        renewal: {
          ...session.renewal,
          cookies: [{ name: 'synthetic_auth', value: 'bad\r\nX: value' }],
        },
      },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'READ_FAILED' });
  expect(fetcher).not.toHaveBeenCalled();
});
