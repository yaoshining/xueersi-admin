import { expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { openDraftStore } from '@xueersi/db';
import { businessDate } from '@xueersi/domain';
import { PrecheckFailure } from '@xueersi/tal-adapter';
import { registerSync } from './sync';

it('单条和批量 API 只透传受信分类，任意异常字段不能泄露', async () => {
  const app = Fastify(),
    store = openDraftStore(':memory:');
  store.create({
    id: 'synthetic',
    childId: 'child',
    subject: 'chinese',
    date: businessDate(new Date()),
    content: '合成练习',
    targetMinutes: 0,
    submissionRequirement: 'image',
  });
  const prepareDraft = vi.fn(async () => {
    throw new PrecheckFailure('SYNC_PRECHECK_CONFIG_FAILED');
  });
  registerSync(app, store, {
    connection: () => ({
      status: 'connected',
      sessionId: 'synthetic',
      child: { value: 'child', label: '测试孩子' },
      device: { value: 'device', label: '测试设备' },
    }),
    prepareDraft,
  });
  try {
    for (const [url, payload] of [
      ['/api/v1/sync/preview', { draftId: 'synthetic' }],
      ['/api/v1/sync/batch/preview', { draftIds: ['synthetic'] }],
    ] as const) {
      const r = await app.inject({ method: 'POST', url, payload });
      expect(r.statusCode).toBe(409);
      expect(r.json()).toEqual({
        error: { code: 'SYNC_PRECHECK_CONFIG_FAILED' },
      });
    }
    prepareDraft.mockRejectedValueOnce(
      Object.assign(new Error('synthetic-secret'), {
        code: 'synthetic-private-code',
      }),
    );
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/preview',
      payload: { draftId: 'synthetic' },
    });
    expect(r.json()).toEqual({ error: { code: 'SYNC_PRECHECK_FAILED' } });
    expect(store.syncRecords()).toHaveLength(0);
  } finally {
    await app.close();
    store.close();
  }
});
