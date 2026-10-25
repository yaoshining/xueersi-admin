import { it, expect } from 'vitest';
import { buildApp } from './app';
import { draftVersion } from '@xueersi/db';
import { ReadonlyTalAdapter } from '@xueersi/tal-adapter';
const headers = { host: '127.0.0.1:3107', 'x-local-request': '1' };
it('会话草稿幂等创建，旧快照和不同内容重放拒绝，目标与请求头再校验', async () => {
  const adapter = new ReadonlyTalAdapter({
    transport: async () => ({ mode: 'real', items: [] }),
  });
  adapter.accept(adapter.issuePairing(), {
    token: 'synthetic-token',
    studentId: 'synthetic-student',
    sn: 'synthetic-device',
    deviceCode: 'synthetic-model',
  });
  const c = adapter.connection();
  if (c.status !== 'connected') throw Error('fixture');
  const app = await buildApp({ adapter });
  const draft = {
    id: 'agent-synthetic-request',
    childId: c.child.value,
    date: '2026-10-17',
    subject: 'math' as const,
    content: '合成草稿',
    targetMinutes: 15 as const,
    submissionRequirement: 'image' as const,
  };
  const call = (
    body: Record<string, unknown>,
    h: Record<string, string> = headers,
  ) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/agent/drafts',
      headers: h,
      payload: body,
    });
  try {
    const first = await call({ draft });
    expect(first.statusCode).toBe(200);
    expect((await call({ draft })).json()).toEqual(first.json());
    expect(
      (await call({ draft: { ...draft, content: '不同内容' } })).statusCode,
    ).toBe(409);
    const edited = await call({
      draft: { ...draft, content: '修改后' },
      expectedVersion: first.json().version,
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().version).not.toBe(first.json().version);
    expect(
      (await call({ draft, expectedVersion: first.json().version })).statusCode,
    ).toBe(409);
    expect(
      (await call({ draft: { ...draft, id: 'wrong', childId: 'other-child' } }))
        .statusCode,
    ).toBe(403);
    expect((await call({ draft, confirmed: true })).statusCode).toBe(400);
    expect((await call({ draft }, { host: '127.0.0.1:3107' })).statusCode).toBe(
      403,
    );
    expect((await app.inject('/api/v1/drafts')).json().items).toHaveLength(1);
    const other = { ...draft, id: 'other-draft', childId: 'other-child' };
    await app.inject({
      method: 'POST',
      url: '/api/v1/drafts',
      headers,
      payload: other,
    });
    expect(
      (
        await call({
          draft: { ...other, childId: c.child.value },
          expectedVersion: draftVersion(other),
        })
      ).statusCode,
    ).toBe(409);
  } finally {
    await app.close();
  }
});
