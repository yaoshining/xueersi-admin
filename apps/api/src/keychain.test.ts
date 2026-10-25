import { it, expect, vi } from 'vitest';
import { loadKeychainKey } from './keychain';
it('已有钥匙串密钥复用，不创建第二份', () => {
  const run = vi
    .fn()
    .mockReturnValue({ status: 0, stdout: 'a'.repeat(64) + '\n' });
  expect(loadKeychainKey(run, 'darwin').length).toBe(32);
  expect(run).toHaveBeenCalledTimes(1);
});
it('首次创建仅经标准输入传密钥，重新读取确认成功', () => {
  const run = vi
    .fn()
    .mockReturnValueOnce({ status: 44, stdout: '' })
    .mockReturnValueOnce({ status: 0, stdout: '' })
    .mockReturnValueOnce({ status: 0, stdout: 'b'.repeat(64) });
  expect(loadKeychainKey(run, 'darwin').length).toBe(32);
  const create = run.mock.calls[1];
  expect(create[0]).toEqual(['-i']);
  expect(create[1]).toContain('add-generic-password');
  expect(create[1]).not.toContain(' -A ');
});
it('拒绝错误与非 macOS，不退回明文密钥', () => {
  const run = vi
    .fn()
    .mockReturnValue({ status: 1, stdout: 'synthetic-secret-error' });
  expect(() => loadKeychainKey(run, 'darwin')).toThrow(/^本机钥匙串不可用/);
  expect(() => loadKeychainKey(run, 'linux')).toThrow('macOS');
  expect(run).toHaveBeenCalledTimes(1);
});
