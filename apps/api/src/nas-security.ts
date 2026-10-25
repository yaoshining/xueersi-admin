import { createHash, timingSafeEqual } from 'node:crypto';
import { BlockList, isIP } from 'node:net';
import type { FastifyReply, FastifyRequest } from 'fastify';
export interface NasConfig {
  origin: string;
  cidr: string;
  passwordHash: string;
  authMode?: 'password' | 'lan';
}
function privateIp(ip: string) {
  if (isIP(ip) !== 4) return false;
  const parts = ip.split('.').map(Number);
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}
export function parseNasConfig(env: NodeJS.ProcessEnv): NasConfig | undefined {
  if (!env.NAS_ORIGIN) {
    if (env.NAS_ALLOWED_CIDR || env.NAS_PASSWORD_HASH || env.NAS_AUTH_MODE)
      throw new Error('NAS 配置不完整');
    return undefined;
  }
  try {
    const u = new URL(env.NAS_ORIGIN);
    const cidr = env.NAS_ALLOWED_CIDR ?? '';
    const [ip, bits, ...extra] = cidr.split('/');
    const prefix = Number(bits);
    const passwordHash = env.NAS_PASSWORD_HASH ?? '';
    const authMode = env.NAS_AUTH_MODE ?? 'password';
    if (
      u.protocol !== 'https:' ||
      u.origin !== env.NAS_ORIGIN ||
      !privateIp(u.hostname) ||
      !privateIp(ip) ||
      !/^\d+$/.test(bits ?? '') ||
      prefix < 24 ||
      prefix > 32 ||
      extra.length ||
      !['password', 'lan'].includes(authMode) ||
      (authMode === 'password' && !/^[a-f0-9]{64}$/.test(passwordHash))
    )
      throw Error();
    const net = new BlockList();
    net.addSubnet(ip, prefix, 'ipv4');
    if (!net.check(u.hostname, 'ipv4')) throw Error();
    return {
      origin: u.origin,
      cidr,
      passwordHash,
      ...(authMode === 'lan' ? { authMode: 'lan' as const } : {}),
    };
  } catch {
    throw new Error(
      'NAS 需要精确 HTTPS 局域网地址、/24 至 /32 网段和有效访问模式；密码模式须有管理密码摘要',
    );
  }
}
function isFrontendNavigation(request: FastifyRequest) {
  if (
    !['GET', 'HEAD'].includes(request.method) ||
    request.headers['sec-fetch-mode'] !== 'navigate' ||
    request.headers['sec-fetch-dest'] !== 'document'
  )
    return false;
  const path = request.url.split('?', 1)[0];
  // 只允许前端入口页，API 和静态资源不因伪装导航而获得跨站访问。
  return (
    path === '/' ||
    /^\/(?:calendar|family|assistant|settings|homework\/[^/]+|drafts(?:\/(?:new|[^/]+\/edit))?|sync(?:\/batch)?)\/?$/.test(
      path,
    )
  );
}
export function nasGuard(config: NasConfig) {
  parseNasConfig({
    NAS_ORIGIN: config.origin,
    NAS_ALLOWED_CIDR: config.cidr,
    NAS_PASSWORD_HASH: config.passwordHash,
    NAS_AUTH_MODE: config.authMode,
  });
  const host = new URL(config.origin).host;
  const [subnet, prefix] = config.cidr.split('/');
  const net = new BlockList();
  net.addSubnet(subnet, Number(prefix), 'ipv4');
  const expected = Buffer.from(config.passwordHash, 'hex');
  const attempts = new Map<string, { count: number; until: number }>();
  return async (request: FastifyRequest, reply: FastifyReply) => {
    reply
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Frame-Options', 'DENY')
      .header('Referrer-Policy', 'no-referrer');
    const address = request.ip.replace(/^::ffff:/, '');
    const loopback = address === '127.0.0.1' || address === '::1';
    if (
      request.headers.host !== host ||
      (!loopback && !net.check(address, 'ipv4'))
    )
      return reply.code(403).send({ error: { code: 'LAN_ONLY' } });
    if (
      loopback &&
      request.url === '/api/v1/health' &&
      request.method === 'GET'
    )
      return;
    if (config.authMode !== 'lan') {
      const now = Date.now();
      for (const [ip, state] of attempts)
        if (state.until <= now) attempts.delete(ip);
      const state = attempts.get(address);
      if (state && state.count >= 10)
        return reply
          .code(429)
          .header('Retry-After', '60')
          .send({ error: { code: 'LOGIN_RATE_LIMIT' } });
      const raw = request.headers.authorization ?? '';
      const decoded =
        raw.startsWith('Basic ') && raw.length < 1024
          ? Buffer.from(raw.slice(6), 'base64').toString('utf8')
          : '';
      const valid =
        decoded.startsWith('admin:') &&
        timingSafeEqual(
          createHash('sha256').update(decoded.slice(6)).digest(),
          expected,
        );
      if (!valid) {
        if (attempts.size >= 1024) attempts.clear();
        attempts.set(address, {
          count: (state?.count ?? 0) + 1,
          until: state?.until ?? now + 60000,
        });
        return reply
          .code(401)
          .header(
            'WWW-Authenticate',
            'Basic realm="Xueersi NAS", charset="UTF-8"',
          )
          .send({ error: { code: 'LOGIN_REQUIRED' } });
      }
      attempts.delete(address);
    }
    if (
      !isFrontendNavigation(request) &&
      ((request.headers.origin && request.headers.origin !== config.origin) ||
        request.headers['sec-fetch-site'] === 'cross-site')
    )
      return reply.code(403).send({ error: { code: 'ORIGIN_DENIED' } });
    // NAS 凭据更新只能由已授权 SSH 迁移完成，不对扩展/网页开放跨站交接。
    if (
      request.url.startsWith('/api/v1/session') &&
      request.method !== 'GET' &&
      request.method !== 'DELETE'
    )
      return reply.code(403).send({ error: { code: 'NAS_HANDOFF_DISABLED' } });
    if (
      request.url.startsWith('/api/') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      request.headers['x-local-request'] !== '1'
    )
      return reply.code(403).send({ error: { code: 'LOCAL_HEADER_REQUIRED' } });
  };
}
