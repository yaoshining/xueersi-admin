import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { parseNasConfig } from './nas-security';
const password = 'synthetic-random-admin-password-for-tests';
const nas = {
  origin: 'https://192.168.50.9:19473',
  cidr: '192.168.50.0/24',
  passwordHash: createHash('sha256').update(password).digest('hex'),
};
const authorization =
  'Basic ' + Buffer.from('admin:' + password).toString('base64');
const headers = {
  host: '192.168.50.9:19473',
  authorization,
  origin: nas.origin,
  'x-local-request': '1',
};
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const webRoots: string[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const dir of webRoots.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
async function create() {
  const app = await buildApp({ nas });
  apps.push(app);
  return app;
}
describe('NAS 认证和来源隔离', () => {
  it.each(['lan', 'password'] as const)(
    '外站顶层链接可进入 %s 模式的前端页面，不能访问 API 或跨站写入',
    async (authMode) => {
      const webRoot = mkdtempSync(join(tmpdir(), 'synthetic-nas-nav-'));
      webRoots.push(webRoot);
      writeFileSync(
        join(webRoot, 'index.html'),
        '<!doctype html><title>synthetic-shell</title>',
      );
      const app = await buildApp({ nas: { ...nas, authMode }, webRoot });
      apps.push(app);
      const navigation = {
        host: headers.host,
        ...(authMode === 'password' ? { authorization } : {}),
        accept: 'text/html',
        origin: 'https://synthetic-portal.example',
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'document',
        'sec-fetch-user': '?1',
      };
      for (const url of [
        '/',
        '/calendar',
        '/family',
        '/homework/synthetic-homework-id?date=2026-01-02',
        '/assistant?date=2026-01-02',
        '/settings',
        '/drafts',
        '/drafts/new',
        '/drafts/synthetic-id/edit',
        '/sync',
        '/sync/batch?draft=synthetic-id',
      ]) {
        const r = await app.inject({
          url,
          headers: navigation,
          remoteAddress: '192.168.50.2',
        });
        expect(r.statusCode, url).toBe(200);
        expect(r.headers['content-type']).toContain('text/html');
        expect(r.body).toContain('synthetic-shell');
        expect(r.headers['access-control-allow-origin']).toBeUndefined();
      }
      expect(
        (
          await app.inject({
            method: 'HEAD',
            url: '/',
            headers: navigation,
            remoteAddress: '192.168.50.2',
          })
        ).statusCode,
      ).toBe(200);
      const deny = [
        { url: '/api/v1/drafts' },
        { url: '/api/v1/connection' },
        { url: '/api/v1/health?probe=cross-site' },
        { url: '/api/v1/homework?date=2026-01-02' },
        { url: '/api/v1/drafts', method: 'OPTIONS' as const },
        { url: '/api/v1/drafts', method: 'POST' as const },
        { url: '/api/v1/sync/confirm', method: 'POST' as const },
        { url: '/api/v1/homework/delete/confirm', method: 'POST' as const },
        { url: '/api/v1/session', method: 'DELETE' as const },
        { url: '/drafts', method: 'POST' as const },
        {
          url: '/',
          headers: {
            ...navigation,
            'sec-fetch-mode': 'cors',
            'sec-fetch-dest': 'empty',
          },
        },
        { url: '/', headers: { ...navigation, 'sec-fetch-dest': 'iframe' } },
        {
          url: '/',
          headers: {
            ...navigation,
            'sec-fetch-dest': 'image',
            'sec-fetch-mode': 'no-cors',
          },
        },
        { url: '/assets/synthetic.js' },
        {
          url: '/',
          headers: { ...navigation, host: 'synthetic-evil.example' },
        },
        { url: '/', remoteAddress: '203.0.113.8' },
      ];
      for (const attempt of deny) {
        const r = await app.inject({
          headers: { ...navigation, 'x-local-request': '1' },
          remoteAddress: '192.168.50.2',
          ...attempt,
        });
        expect(r.statusCode, `${attempt.method ?? 'GET'} ${attempt.url}`).toBe(
          403,
        );
      }
      if (authMode === 'password') {
        const withoutPassword = { ...navigation };
        delete withoutPassword.authorization;
        expect(
          (
            await app.inject({
              url: '/',
              headers: withoutPassword,
              remoteAddress: '192.168.50.2',
            })
          ).statusCode,
        ).toBe(401);
      }
    },
  );
  it('显式 LAN 模式免登录保存草稿，不返回 Basic 挑战且继续拦截跨站与网段伪造', async () => {
    const app = await buildApp({ nas: { ...nas, authMode: 'lan' } });
    apps.push(app);
    const lanHeaders = {
      host: headers.host,
      origin: nas.origin,
      'x-local-request': '1',
    };
    const draft = {
      id: 'synthetic-lan-draft',
      childId: 'synthetic-child',
      date: '2026-01-02',
      subject: 'math',
      content: '合成免登录草稿',
      targetMinutes: 15,
      submissionRequirement: 'image',
    };
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/drafts',
      headers: lanHeaders,
      remoteAddress: '192.168.50.2',
      payload: draft,
    });
    expect(created.statusCode).toBe(201);
    expect(created.headers['www-authenticate']).toBeUndefined();
    const listed = await app.inject({
      url: '/api/v1/drafts',
      headers: { host: headers.host },
      remoteAddress: '192.168.50.2',
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toEqual([draft]);
    for (const [extra, remoteAddress] of [
      [{ origin: 'https://evil.example' }, '192.168.50.2'],
      [{ 'sec-fetch-site': 'cross-site' }, '192.168.50.2'],
      [{ host: 'evil.example' }, '192.168.50.2'],
      [{ 'x-forwarded-for': '192.168.50.2' }, '203.0.113.8'],
      [{ 'x-local-request': '' }, '192.168.50.2'],
    ] as const) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/drafts',
        headers: { ...lanHeaders, ...extra },
        remoteAddress,
        payload: draft,
      });
      expect(r.statusCode).toBe(403);
      expect(r.headers['www-authenticate']).toBeUndefined();
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/session/renewal',
          headers: lanHeaders,
          remoteAddress: '192.168.50.2',
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  });
  it('免登录必须显式启用，未知模式与默认密码缺失均拒绝启动', () => {
    const env = { NAS_ORIGIN: nas.origin, NAS_ALLOWED_CIDR: nas.cidr };
    expect(parseNasConfig({ ...env, NAS_AUTH_MODE: 'lan' })).toMatchObject({
      authMode: 'lan',
      origin: nas.origin,
    });
    expect(() => parseNasConfig(env)).toThrow();
    expect(() =>
      parseNasConfig({
        ...env,
        NAS_AUTH_MODE: 'none',
        NAS_PASSWORD_HASH: nas.passwordHash,
      }),
    ).toThrow();
    expect(() => parseNasConfig({ NAS_AUTH_MODE: 'lan' })).toThrow();
  });
  it('未认证页面和 API 不泄露内容', async () => {
    const app = await create();
    for (const url of [
      '/',
      '/api/v1/drafts',
      '/api/v1/connection',
      '/api/v1/health',
    ]) {
      const r = await app.inject({
        url,
        headers: { host: headers.host },
        remoteAddress: '192.168.50.2',
      });
      expect(r.statusCode).toBe(401);
      expect(r.headers['www-authenticate']).toContain('Basic');
    }
  });
  it('认证后可读取和保存草稿，但跨站写入、错误 Host 与远程地址被拒绝', async () => {
    const app = await create();
    expect(
      (
        await app.inject({
          url: '/api/v1/drafts',
          headers,
          remoteAddress: '192.168.50.2',
        })
      ).statusCode,
    ).toBe(200);
    for (const [override, remoteAddress] of [
      [{ origin: 'https://evil.example' }, '192.168.50.2'],
      [{ host: 'evil.example' }, '192.168.50.2'],
      [{ 'x-forwarded-for': '192.168.50.2' }, '203.0.113.8'],
    ] as const) {
      expect(
        (
          await app.inject({
            url: '/api/v1/drafts',
            headers: { ...headers, ...override },
            remoteAddress,
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/session/renewal',
          headers,
          remoteAddress: '192.168.50.2',
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  });
  it('不接受转发头绕过网段，失败登录有限流', async () => {
    const app = await create();
    for (let i = 0; i < 10; i++)
      expect(
        (
          await app.inject({
            url: '/',
            headers: { host: headers.host, authorization: 'Basic invalid' },
            remoteAddress: '192.168.50.2',
          })
        ).statusCode,
      ).toBe(401);
    expect(
      (
        await app.inject({
          url: '/',
          headers: { host: headers.host },
          remoteAddress: '192.168.50.2',
        })
      ).statusCode,
    ).toBe(429);
    expect(
      (
        await app.inject({
          url: '/api/v1/health',
          headers: { host: headers.host },
          remoteAddress: '127.0.0.1',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          url: '/api/v1/drafts',
          headers: { host: headers.host },
          remoteAddress: '127.0.0.1',
        })
      ).statusCode,
    ).toBe(401);
  });
  it('错误配置不能无认证启动', () => {
    expect(parseNasConfig({})).toBeUndefined();
    for (const origin of [
      'http://192.168.50.9',
      'https://example.com',
      'https://8.8.8.8',
      'https://user:pass@192.168.50.9',
      'https://192.168.50.9/path',
    ])
      expect(() => parseNasConfig({ NAS_ORIGIN: origin })).toThrow();
    expect(() =>
      parseNasConfig({
        NAS_ORIGIN: nas.origin,
        NAS_ALLOWED_CIDR: '0.0.0.0/0',
        NAS_PASSWORD_HASH: nas.passwordHash,
      }),
    ).toThrow();
    expect(
      parseNasConfig({
        NAS_ORIGIN: nas.origin,
        NAS_ALLOWED_CIDR: nas.cidr,
        NAS_PASSWORD_HASH: nas.passwordHash,
      }),
    ).toEqual(nas);
  });
});
