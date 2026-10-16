import { it, expect, vi, afterEach } from 'vitest';
import { DisconnectedTalAdapter } from './index';
afterEach(() => vi.unstubAllGlobals());
it('缺少会话时拒绝读取且不触发网络', async () => {
  const network = vi.fn();
  vi.stubGlobal('fetch', network);
  await expect(
    new DisconnectedTalAdapter().listHomework(),
  ).rejects.toMatchObject({ code: 'CONNECTION_REQUIRED' });
  expect(network).not.toHaveBeenCalled();
});
