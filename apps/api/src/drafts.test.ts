import { it, expect } from 'vitest';
import { buildApp } from './app';
const headers = {
  host: '127.0.0.1:3107',
  origin: 'http://127.0.0.1:3107',
  'x-local-request': '1',
};
const draft = {
  id: 'synthetic-draft',
  childId: 'synthetic-child',
  subject: 'math',
  date: '2026-10-17',
  content: '合成作业',
  targetMinutes: 15,
  submissionRequirement: 'audio',
};
it('本机草稿 CRUD 与明确冲突/缺失/校验错误', async () => {
  const app = await buildApp();
  try {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/drafts',
          headers,
          payload: draft,
        })
      ).statusCode,
    ).toBe(201);
    expect((await app.inject('/api/v1/drafts')).json().items).toEqual([draft]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/drafts',
          headers,
          payload: draft,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/drafts/synthetic-draft',
          headers,
          payload: { ...draft, targetMinutes: 30 },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject('/api/v1/drafts/synthetic-draft')).json().targetMinutes,
    ).toBe(30);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/drafts/missing',
          headers,
          payload: { ...draft, id: 'missing' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/drafts',
          headers,
          payload: { ...draft, content: '' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/api/v1/drafts/synthetic-draft',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject('/api/v1/drafts')).json().items).toEqual([]);
  } finally {
    await app.close();
  }
});
it('外部 Host、跨站来源和缺少自定义写入头被拒绝', async () => {
  const app = await buildApp();
  try {
    for (const bad of [
      { host: 'evil.example' },
      { ...headers, origin: 'https://evil.example' },
      { host: '127.0.0.1:3107', origin: 'null' },
      { host: '127.0.0.1:3107' },
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/drafts',
            headers: bad,
            payload: draft,
          })
        ).statusCode,
      ).toBe(403);
    expect(
      (
        await app.inject({
          url: '/api/v1/drafts',
          headers: { ...headers, origin: 'https://evil.example' },
        })
      ).statusCode,
    ).toBe(403);
  } finally {
    await app.close();
  }
});
it('浏览器旧草稿导入保留冲突且不泄漏原文', async () => {
  const app = await buildApp();
  try {
    const call = (items: unknown[]) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/drafts/import',
        headers,
        payload: { items },
      });
    expect((await call([draft])).statusCode).toBe(200);
    expect((await call([draft])).statusCode).toBe(200);
    const conflict = await call([{ ...draft, content: '禁止泄漏的合成冲突' }]);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.body).not.toContain('禁止泄漏');
  } finally {
    await app.close();
  }
});
