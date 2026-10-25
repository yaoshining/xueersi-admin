import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  mkdirSync,
  lstatSync,
  readFileSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SessionHandoffSchema, type SessionHandoff } from '@xueersi/contracts';
import type { SessionVault } from '@xueersi/tal-adapter';
const aad = Buffer.from('xueersi-admin-session-v1');
function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}
export class EncryptedSessionVault implements SessionVault {
  #path: string;
  #key: Buffer;
  constructor(path: string, key: Buffer) {
    if (key.length !== 32) throw new Error('本机会话密钥不可用');
    this.#path = resolve(path);
    this.#key = Buffer.from(key);
    mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
    this.#check();
  }
  #check() {
    try {
      const dir = lstatSync(dirname(this.#path));
      if (!dir.isDirectory() || dir.isSymbolicLink() || dir.mode & 0o077)
        throw Error();
      try {
        const file = lstatSync(this.#path);
        if (
          !file.isFile() ||
          file.isSymbolicLink() ||
          file.mode & 0o077 ||
          file.size > 32768
        )
          throw Error();
      } catch (e) {
        if (!missing(e)) throw e;
      }
    } catch {
      throw new Error('本机会话文件权限或路径不安全');
    }
  }
  load(): SessionHandoff | null {
    try {
      this.#check();
      let raw: string;
      try {
        raw = readFileSync(this.#path, 'utf8');
      } catch (e) {
        if (missing(e)) return null;
        throw e;
      }
      const envelope = JSON.parse(raw);
      if (envelope.version !== 1) throw Error();
      const iv = Buffer.from(envelope.iv, 'base64');
      const tag = Buffer.from(envelope.tag, 'base64');
      if (iv.length !== 12 || tag.length !== 16) throw Error();
      const decipher = createDecipheriv('aes-256-gcm', this.#key, iv);
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([
        decipher.update(Buffer.from(envelope.data, 'base64')),
        decipher.final(),
      ]);
      try {
        return SessionHandoffSchema.parse(JSON.parse(plain.toString('utf8')));
      } finally {
        plain.fill(0);
      }
    } catch {
      throw new Error('本机会话无法解密或校验，请重新连接');
    }
  }
  save(session: SessionHandoff) {
    const temporary =
      this.#path + '.' + randomBytes(8).toString('hex') + '.tmp';
    try {
      this.#check();
      const parsed = SessionHandoffSchema.parse(session);
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', this.#key, iv);
      cipher.setAAD(aad);
      const plain = Buffer.from(JSON.stringify(parsed));
      let encrypted: Buffer;
      try {
        encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
      } finally {
        plain.fill(0);
      }
      const body = JSON.stringify({
        version: 1,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: encrypted.toString('base64'),
      });
      if (Buffer.byteLength(body, 'utf8') > 32768) throw Error();
      const fd = openSync(temporary, 'wx', 0o600);
      try {
        writeFileSync(fd, body);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, this.#path);
    } catch {
      try {
        unlinkSync(temporary);
      } catch {
        /* 临时文件只有密文，保留原保存失败语义。 */
      }
      throw new Error('本机会话保存失败');
    }
  }
  clear() {
    try {
      this.#check();
      try {
        unlinkSync(this.#path);
      } catch (e) {
        if (!missing(e)) throw e;
      }
    } catch {
      throw new Error('本机会话清除失败');
    }
  }
}
