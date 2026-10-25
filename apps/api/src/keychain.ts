import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
type SecurityRunner = (
  args: string[],
  input?: string,
) => { status: number | null; stdout: string };
const runSecurity: SecurityRunner = (args, input) => {
  const result = spawnSync('/usr/bin/security', args, {
    input,
    encoding: 'utf8',
    timeout: 15000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return { status: result.status, stdout: result.stdout ?? '' };
};
/** 不输出 security 的原始返回，不把密钥放入命令参数或环境变量。 */
export function loadKeychainKey(
  run: SecurityRunner = runSecurity,
  platform: string = process.platform,
): Buffer {
  if (platform !== 'darwin') throw new Error('持久会话目前需要 macOS 钥匙串');
  const keychain = join(homedir(), 'Library/Keychains/login.keychain-db');
  const args = [
    'find-generic-password',
    '-a',
    'local-session',
    '-s',
    'com.xueersi-admin.session-v1',
    '-w',
    keychain,
  ];
  try {
    let result = run(args);
    if (result.status === 44) {
      const key = randomBytes(32).toString('hex');
      // security 的交互模式接收命令，路径需按其双引号语法转义。
      const quoted = keychain.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
      const created = run(
        ['-i'],
        `add-generic-password -a local-session -s com.xueersi-admin.session-v1 -w "${key}" "${quoted}"\n`,
      );
      if (created.status !== 0) throw Error();
      result = run(args);
    }
    const value = result.stdout.trim();
    if (result.status !== 0 || !/^[a-f0-9]{64}$/.test(value)) throw Error();
    return Buffer.from(value, 'hex');
  } catch {
    throw new Error('本机钥匙串不可用，请解锁钥匙串后重新启动');
  }
}
