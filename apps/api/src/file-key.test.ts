import {
  mkdtempSync,
  writeFileSync,
  chmodSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { loadFileKey } from './file-key';
import { EncryptedSessionVault } from './session-vault';
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
it('独立文件密钥重启可解密，旧密钥不能读取', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nas-key-'));
  dirs.push(dir);
  const path = join(dir, 'key');
  writeFileSync(path, Buffer.alloc(32, 7), { mode: 0o600 });
  const key = loadFileKey(path);
  expect(key).toHaveLength(32);
  const vault = new EncryptedSessionVault(
    join(dir, 'vault', 'session.enc'),
    key,
  );
  vault.save({
    token: 'synthetic-token',
    studentId: 'synthetic-child',
    sn: 'synthetic-device',
    deviceCode: 'synthetic-code',
  });
  expect(
    new EncryptedSessionVault(
      join(dir, 'vault', 'session.enc'),
      loadFileKey(path),
    ).load()?.token,
  ).toBe('synthetic-token');
  expect(() =>
    new EncryptedSessionVault(
      join(dir, 'vault', 'session.enc'),
      Buffer.alloc(32, 8),
    ).load(),
  ).toThrow();
});
it('拒绝宽松权限、符号链接、缺失和错误长度密钥', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nas-key-'));
  dirs.push(dir);
  const path = join(dir, 'key');
  expect(() => loadFileKey(path)).toThrow();
  writeFileSync(path, Buffer.alloc(32), { mode: 0o644 });
  expect(() => loadFileKey(path)).toThrow();
  chmodSync(path, 0o600);
  const link = join(dir, 'link');
  symlinkSync(path, link);
  expect(() => loadFileKey(link)).toThrow();
  writeFileSync(path, 'short');
  expect(() => loadFileKey(path)).toThrow();
});

it('迁移重新加密并保留源，目标存在时禁止覆盖', async () => {
  const { migrateSession } = await import('./session-migration');
  const dir = mkdtempSync(join(tmpdir(), 'nas-migrate-'));
  dirs.push(dir);
  const source = join(dir, 'source', 'session.enc'),
    target = join(dir, 'target', 'session.enc');
  const oldKey = Buffer.alloc(32, 1),
    newKey = Buffer.alloc(32, 2);
  new EncryptedSessionVault(source, oldKey).save({
    token: 'synthetic-token',
    studentId: 'synthetic-child',
    sn: 'synthetic-device',
    deviceCode: 'synthetic-code',
  });
  migrateSession(source, oldKey, target, newKey);
  expect(new EncryptedSessionVault(target, newKey).load()).toEqual(
    new EncryptedSessionVault(source, oldKey).load(),
  );
  expect(() => new EncryptedSessionVault(target, oldKey).load()).toThrow();
  expect(() => migrateSession(source, oldKey, target, newKey)).toThrow(
    '目标保险箱已存在',
  );
});
