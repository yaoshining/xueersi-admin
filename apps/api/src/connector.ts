import { loadFileKey } from './file-key';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ReadFailure,
  createCookieRefresh,
  ReadonlyTalAdapter,
  type ReadTransport,
  type RefreshTransport,
  type DraftWriter,
  type ReportTransport,
} from '@xueersi/tal-adapter';
import { EncryptedSessionVault } from './session-vault';
import { loadKeychainKey } from './keychain';
/** 私有运输模块不随公共源码发布；模块路径不接受 HTTP 输入。 */
export async function loadLocalConnector(
  modulePath?: string,
  pairingFile?: string,
  sessionFile?: string,
  keyFile?: string,
) {
  if (!modulePath && !pairingFile && !sessionFile)
    return new ReadonlyTalAdapter();
  if (
    !modulePath ||
    !isAbsolute(modulePath) ||
    (pairingFile && !isAbsolute(pairingFile)) ||
    (sessionFile && !isAbsolute(sessionFile))
  )
    throw new Error('只读连接配置不完整');
  try {
    const key = pairingFile
      ? readFileSync(pairingFile, 'utf8').trim()
      : undefined;
    if (key && !/^[a-f0-9]{64}$/.test(key)) throw Error();
    const module = (await import(pathToFileURL(modulePath).href)) as {
      createReportTransport?: () => ReportTransport;
      createWriter?: () => DraftWriter;
      createTransport?: (error: typeof ReadFailure) => ReadTransport;
      createRefresh?: (
        error: typeof ReadFailure,
        factory: typeof createCookieRefresh,
      ) => RefreshTransport;
    };
    if (typeof module.createTransport !== 'function') throw Error();
    const transport = module.createTransport(ReadFailure);
    if (typeof transport !== 'function') throw Error();
    const refresh = module.createRefresh?.(ReadFailure, createCookieRefresh);
    if (refresh !== undefined && typeof refresh !== 'function') throw Error();
    let vault: EncryptedSessionVault | undefined;
    if (sessionFile) {
      const encryptionKey = keyFile ? loadFileKey(keyFile) : loadKeychainKey();
      try {
        vault = new EncryptedSessionVault(sessionFile, encryptionKey);
      } finally {
        encryptionKey.fill(0);
      }
    }
    return new ReadonlyTalAdapter({
      transport,
      report: module.createReportTransport?.(),
      writer: module.createWriter?.(),
      refresh,
      pairingKey: key,
      vault,
    });
  } catch {
    throw new Error(
      '本机只读连接加载失败，请检查私有配置、会话文件和已解锁的钥匙串',
    );
  }
}
