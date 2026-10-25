/** 仅由用户授权后运行；输出目录必须位于已忽略的 work/。不打印凭据。 */
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadKeychainKey } from '../apps/api/src/keychain';
import { migrateSession } from '../apps/api/src/session-migration';
import { parseNasConfig } from '../apps/api/src/nas-security';
import { bundleNasTransport } from './nas-transport';
async function main() {
  const root = process.cwd();
  const output = resolve(process.argv[2] ?? '');
  const origin = process.argv[3];
  const cidr = process.argv[4];
  if (!output.startsWith(resolve(root, 'work') + '/') || existsSync(output))
    throw Error('需要新的 work/ 私有目录');
  const password = randomBytes(32).toString('base64url');
  const passwordHash = createHash('sha256').update(password).digest('hex');
  const nas = parseNasConfig({
    NAS_ORIGIN: origin,
    NAS_ALLOWED_CIDR: cidr,
    NAS_PASSWORD_HASH: passwordHash,
  });
  if (!nas) throw Error('缺少 NAS 配置');
  process.loadEnvFile(join(root, '.env.local'));
  const sourceSession = process.env.TAL_SESSION_FILE;
  const transport = process.env.TAL_READONLY_MODULE;
  if (!sourceSession || !transport) throw Error('本机连接配置不完整');
  process.umask(0o077);
  const bundle = join(output, 'project');
  for (const dir of [
    'build/app/apps/api/dist',
    'build/app/apps/web/dist',
    'private',
    'secrets',
    'data/vault',
    'config',
  ])
    mkdirSync(join(bundle, dir), { recursive: true, mode: 0o700 });
  const key = randomBytes(32);
  const oldKey = loadKeychainKey();
  try {
    migrateSession(
      sourceSession,
      oldKey,
      join(bundle, 'data/vault/session.enc'),
      key,
    );
    writeFileSync(join(bundle, 'secrets/session.key'), key, { mode: 0o600 });
  } finally {
    key.fill(0);
    oldKey.fill(0);
  }
  const apiRequire = createRequire(join(root, 'apps/api/package.json'));
  const { build } = apiRequire('esbuild');
  await bundleNasTransport(transport, join(bundle, 'private'), build);
  const dbRequire = createRequire(join(root, 'packages/db/package.json'));
  const Database = dbRequire('better-sqlite3');
  const db = new Database(
    resolve(process.env.DATABASE_PATH ?? 'data/drafts.sqlite'),
    { readonly: true, fileMustExist: true },
  );
  try {
    await db.backup(join(bundle, 'data/drafts.sqlite'));
  } finally {
    db.close();
  }
  for (const file of [
    'Dockerfile',
    'package.json',
    'package-lock.json',
    '.dockerignore',
    'healthcheck.mjs',
  ])
    cpSync(join(root, 'deploy/nas', file), join(bundle, 'build', file));
  cpSync(join(root, 'apps/api/dist'), join(bundle, 'build/app/apps/api/dist'), {
    recursive: true,
  });
  cpSync(join(root, 'apps/web/dist'), join(bundle, 'build/app/apps/web/dist'), {
    recursive: true,
  });
  // 证书 CA 私钥留在 Mac，不进入 NAS 项目或镜像构建上下文。
  const ip = new URL(nas.origin).hostname;
  const ca = join(output, 'offline-ca');
  mkdirSync(ca, { mode: 0o700 });
  const openssl = (args: string[]) =>
    execFileSync('openssl', args, { stdio: 'pipe' });
  openssl([
    'req',
    '-x509',
    '-newkey',
    'rsa:3072',
    '-nodes',
    '-keyout',
    join(ca, 'ca.key'),
    '-out',
    join(ca, 'ca.crt'),
    '-days',
    '3650',
    '-subj',
    '/CN=Xueersi Private LAN CA',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign',
  ]);
  openssl([
    'req',
    '-new',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    join(bundle, 'secrets/server.key'),
    '-out',
    join(ca, 'server.csr'),
    '-subj',
    '/CN=Xueersi LAN',
  ]);
  writeFileSync(
    join(ca, 'server.ext'),
    `subjectAltName=IP:${ip}\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`,
  );
  openssl([
    'x509',
    '-req',
    '-in',
    join(ca, 'server.csr'),
    '-CA',
    join(ca, 'ca.crt'),
    '-CAkey',
    join(ca, 'ca.key'),
    '-CAcreateserial',
    '-out',
    join(bundle, 'secrets/server.crt'),
    '-days',
    '365',
    '-sha256',
    '-extfile',
    join(ca, 'server.ext'),
  ]);
  cpSync(join(ca, 'ca.crt'), join(bundle, 'secrets/ca.crt'));
  cpSync(join(ca, 'ca.crt'), join(output, 'Xueersi-LAN-CA.crt'));
  writeFileSync(
    join(output, '管理登录.txt'),
    `地址：${nas.origin}\n账号：admin\n密码：${password}\n此文件仅保留在自己的设备，不上传到代码仓库。\n`,
    { mode: 0o600 },
  );
  let compose = readFileSync(
    join(root, 'deploy/nas/docker-compose.yaml'),
    'utf8',
  );
  compose = compose.replace('${NAS_BIND_IP:?set NAS_BIND_IP}', ip);
  writeFileSync(join(bundle, 'docker-compose.yaml'), compose);
  writeFileSync(
    join(bundle, 'config/runtime.env'),
    [
      'PORT=3000',
      'SERVE_WEB=true',
      `NAS_ORIGIN=${nas.origin}`,
      `NAS_ALLOWED_CIDR=${nas.cidr}`,
      `NAS_PASSWORD_HASH=${passwordHash}`,
      'DATABASE_PATH=/data/drafts.sqlite',
      'TAL_READONLY_MODULE=/private/transport.mjs',
      'TAL_SESSION_FILE=/data/vault/session.enc',
      'TAL_KEY_FILE=/run/secrets/session.key',
      'TLS_KEY_FILE=/run/secrets/server.key',
      'TLS_CERT_FILE=/run/secrets/server.crt',
    ].join('\n') + '\n',
    { mode: 0o600 },
  );
  chmodSync(join(bundle, 'data/drafts.sqlite'), 0o600);
  console.info('私有部署包已准备；未创建或启动 NAS 项目，未输出凭据。');
}
main().catch(() => {
  console.error(
    'NAS 部署包准备失败；私有输出不会回显，请检查本机配置与目标目录。',
  );
  process.exitCode = 1;
});
