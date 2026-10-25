import { it, expect } from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  statSync,
  chmodSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { EncryptedSessionVault } from './session-vault';
const session = {
  token: 'synthetic-credential',
  studentId: 'synthetic-student',
  sn: 'synthetic-sn',
  deviceCode: 'synthetic-model',
};
it('加密保存重开、不可见明文、权限及清除', () => {
  const dir = mkdtempSync(join(tmpdir(), 'session-test-'));
  const key = randomBytes(32);
  try {
    const path = join(dir, 'vault', 'session.enc');
    const a = new EncryptedSessionVault(path, key);
    a.save(session);
    expect(readFileSync(path, 'utf8')).not.toContain(session.token);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(new EncryptedSessionVault(path, key).load()).toEqual(session);
    a.clear();
    expect(a.load()).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('拒绝篡改、错误密钥、宽权限及符号链接', () => {
  const dir = mkdtempSync(join(tmpdir(), 'session-test-'));
  const key = randomBytes(32);
  try {
    const path = join(dir, 'vault', 'session.enc');
    const a = new EncryptedSessionVault(path, key);
    a.save(session);
    expect(() =>
      new EncryptedSessionVault(path, randomBytes(32)).load(),
    ).toThrow('本机会话');
    chmodSync(path, 0o644);
    expect(() => a.load()).toThrow('本机会话');
    chmodSync(path, 0o600);
    writeFileSync(path, 'broken');
    expect(() => a.load()).toThrow('本机会话');
    a.clear();
    symlinkSync(join(dir, 'other'), path);
    expect(() => a.save(session)).toThrow('本机会话');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('API 正常关闭恢复真实模式，DELETE 后重启不恢复', async () => {
  const { buildApp } = await import('./app');
  const { ReadonlyTalAdapter } = await import('@xueersi/tal-adapter');
  const dir = mkdtempSync(join(tmpdir(), 'session-api-'));
  const key = randomBytes(32);
  const path = join(dir, 'vault', 'session.enc');
  const transport = async () => ({ mode: 'real', items: [] });
  try {
    const adapter = new ReadonlyTalAdapter({
      transport,
      vault: new EncryptedSessionVault(path, key),
      pairingKey: 'synthetic-key',
    });
    const app = await buildApp({ adapter });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/session',
          headers: { 'x-local-request': '1', 'x-pairing-key': 'synthetic-key' },
          payload: {
            ...session,
            childName: '合成孩子',
            deviceName: '合成设备',
          },
        })
      ).statusCode,
    ).toBe(200);
    await app.close();
    const restored = new ReadonlyTalAdapter({
      transport,
      vault: new EncryptedSessionVault(path, key),
    });
    const reopened = await buildApp({ adapter: restored });
    try {
      const state = (await reopened.inject('/api/v1/connection')).json();
      expect(state.child.label).toBe('合成孩子');
      expect(
        (
          await reopened.inject(
            '/api/v1/homework?' +
              new URLSearchParams({
                childId: state.child.value,
                date: '2026-10-17',
              }),
          )
        ).json(),
      ).toEqual({ mode: 'real', items: [] });
      expect(
        (
          await reopened.inject({
            method: 'DELETE',
            url: '/api/v1/session',
            headers: { 'x-local-request': '1' },
          })
        ).statusCode,
      ).toBe(200);
    } finally {
      await reopened.close();
    }
    expect(new EncryptedSessionVault(path, key).load()).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('Cookie 与令牌一起加密保存，拒绝注入与重复名称且保留旧快照', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cookie-vault-'));
  const key = randomBytes(32);
  try {
    const path = join(dir, 'vault', 'session.enc');
    const vault = new EncryptedSessionVault(path, key);
    const withCookie = {
      ...session,
      renewal: {
        deviceId: 'synthetic-auth-device',
        cookies: [{ name: 'synthetic_auth', value: 'synthetic-cookie-secret' }],
        nextCheckAt: 1000,
      },
    };
    vault.save(withCookie);
    expect(new EncryptedSessionVault(path, key).load()).toEqual(withCookie);
    expect(readFileSync(path, 'utf8')).not.toContain('synthetic-cookie-secret');
    for (const cookies of [
      [{ name: 'synthetic_auth', value: 'bad\r\nHeader:x' }],
      [...withCookie.renewal.cookies, ...withCookie.renewal.cookies],
    ]) {
      expect(() =>
        vault.save({
          ...withCookie,
          renewal: { ...withCookie.renewal, cookies },
        }),
      ).toThrow();
      expect(vault.load()).toEqual(withCookie);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('密文超出恢复容量时拒绝覆盖原快照', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vault-size-'));
  try {
    const vault = new EncryptedSessionVault(
      join(dir, 'vault', 'session.enc'),
      randomBytes(32),
    );
    vault.save(session);
    expect(() =>
      vault.save({
        ...session,
        token: '测'.repeat(8192),
        renewal: {
          deviceId: 'synthetic-auth-device',
          cookies: [{ name: 'synthetic_auth', value: 'x'.repeat(4096) }],
          nextCheckAt: 0,
        },
      }),
    ).toThrow('本机会话保存失败');
    expect(vault.load()).toEqual(session);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
