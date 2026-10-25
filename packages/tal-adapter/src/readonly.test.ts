import { createHash } from 'node:crypto';
import { it, expect, vi } from 'vitest';
import { ReadonlyTalAdapter, ReadFailure } from './index';
const session = {
  token: 'synthetic-secret',
  studentId: 'synthetic-student',
  sn: 'synthetic-device',
  deviceCode: 'synthetic-model',
};
const query = {
  childId:
    'child-' +
    createHash('sha256').update(session.studentId).digest('hex').slice(0, 24),
  date: '2026-10-17',
};
const result = {
  mode: 'real',
  items: [
    {
      id: 'synthetic-homework',
      date: query.date,
      subject: 'math',
      status: 'pending',
      content: '合成测试',
    },
  ],
};
it('配对一次性且限时，状态不泄露凭据', async () => {
  let now = 1000;
  const transport = vi.fn().mockResolvedValue(result);
  const adapter = new ReadonlyTalAdapter({
    transport,
    pairingKey: 'synthetic-pairing',
    now: () => now,
  });
  expect(() => adapter.accept('wrong', session)).toThrow();
  adapter.accept('synthetic-pairing', session);
  expect(() => adapter.accept('synthetic-pairing', session)).toThrow();
  expect(JSON.stringify(adapter.connection())).not.toContain(session.token);
  expect(JSON.stringify(adapter.connection())).not.toContain(session.sn);
  expect(adapter.connection().canWrite).toBe(false);
  expect(await adapter.listHomework(query)).toEqual(result);
  now += 15 * 60 * 1000;
  await expect(adapter.listHomework(query)).rejects.toThrow('尚未连接');
  expect(transport).toHaveBeenCalledTimes(1);
  const expired = new ReadonlyTalAdapter({
    transport,
    pairingKey: 'synthetic-pairing',
    now: () => now,
  });
  now += 5 * 60 * 1000;
  expect(() => expired.accept('synthetic-pairing', session)).toThrow();
});
it('上下文、日期、非法结构不触发伪成功', async () => {
  const transport = vi.fn().mockResolvedValue({ mode: 'demo', items: [] });
  const adapter = new ReadonlyTalAdapter({ transport, pairingKey: 'key' });
  adapter.accept('key', session);
  await expect(
    adapter.listHomework({ ...query, childId: 'other' }),
  ).rejects.toThrow();
  await expect(
    adapter.listHomework({ ...query, date: '2026-02-30' }),
  ).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
  await expect(adapter.listHomework(query)).rejects.toThrow('作业读取失败');
  transport.mockResolvedValue({
    ...result,
    items: [{ ...result.items[0], date: '2026-10-18' }],
  });
  await expect(adapter.listHomework(query)).rejects.toThrow();
});
it('上游异常脱敏、会话失效清除、断开后不读取', async () => {
  const transport = vi
    .fn()
    .mockRejectedValue(new Error('synthetic-secret response'));
  const adapter = new ReadonlyTalAdapter({ transport, pairingKey: 'key' });
  adapter.accept('key', session);
  await expect(adapter.listHomework(query)).rejects.toThrow(/^作业读取失败$/);
  transport.mockRejectedValue(new ReadFailure('SESSION_EXPIRED'));
  await expect(adapter.listHomework(query)).rejects.toThrow();
  expect(adapter.connection().canRead).toBe(false);
  adapter.disconnect();
  await expect(adapter.listHomework(query)).rejects.toThrow('尚未连接');
});
