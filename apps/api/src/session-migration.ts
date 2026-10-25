import { existsSync } from 'node:fs';
import { EncryptedSessionVault } from './session-vault';
/** 调用者负责用户授权和 SSH 交付；明文仅驻留进程内，不打印。 */
export function migrateSession(
  sourcePath: string,
  sourceKey: Buffer,
  destinationPath: string,
  destinationKey: Buffer,
) {
  if (existsSync(destinationPath))
    throw new Error('目标保险箱已存在，拒绝覆盖');
  const source = new EncryptedSessionVault(sourcePath, sourceKey);
  const session = source.load();
  if (!session) throw new Error('源保险箱没有可迁移会话');
  const target = new EncryptedSessionVault(destinationPath, destinationKey);
  target.save(session);
  if (!target.load()) throw new Error('目标保险箱恢复失败');
}
