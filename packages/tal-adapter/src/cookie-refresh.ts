import {
  CookieRenewalSchema,
  SessionHandoffSchema,
  type CookieRenewal,
} from '@xueersi/contracts';
import { ReadFailure, type RefreshTransport } from './index';
/** 仅启动时私有配置可设置认证地址，HTTP 请求不提供此配置。 */
export function createCookieRefresh(
  config: {
    endpoint: string;
    headers: Record<string, string>;
    rejectedCodes: number[];
  },
  dependencies: { fetch?: typeof fetch; now?: () => number } = {},
): RefreshTransport {
  const url = new URL(config.endpoint);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new Error('认证目标配置无效');
  const endpoint = url.href,
    baseHeaders = { ...config.headers },
    rejected = new Set(config.rejectedCodes);
  const request = dependencies.fetch ?? fetch,
    now = dependencies.now ?? Date.now;
  return async (input, signal) => {
    try {
      const session = SessionHandoffSchema.parse(input);
      const auth = session.renewal;
      if (!auth) throw new ReadFailure('SESSION_EXPIRED');
      const stamp = now();
      const cookies = auth.cookies.filter(
        (c) => c.expiresAt === undefined || c.expiresAt > stamp,
      );
      if (!cookies.length) throw new ReadFailure('SESSION_EXPIRED');
      const response = await request(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: {
          ...baseHeaders,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'd-id': auth.deviceId,
          Cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '),
        },
        body: '',
      });
      if (response.status === 401) throw new ReadFailure('SESSION_EXPIRED');
      if (!response.ok) throw new ReadFailure();
      // 防止异常服务端响应消耗无限内存，也不将原始响应写日志。
      const reader = response.body?.getReader();
      if (!reader) throw new ReadFailure();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 32768) {
            await reader.cancel();
            throw new ReadFailure();
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (rejected.has(body.errcode)) throw new ReadFailure('SESSION_EXPIRED');
      if (body.errcode !== 0) throw new ReadFailure();
      const updated = updateCookies(
        cookies,
        response.headers.getSetCookie(),
        url,
        stamp,
      );
      const renewal = CookieRenewalSchema.parse({
        ...auth,
        cookies: updated,
        nextCheckAt: stamp + 300000,
      });
      const next = SessionHandoffSchema.parse({
        ...session,
        token: body.data?.tal_token,
        renewal,
      });
      if (signal.aborted) throw new ReadFailure();
      return { token: next.token, renewal };
    } catch (error) {
      if (error instanceof ReadFailure) throw error;
      throw new ReadFailure();
    }
  };
}
function updateCookies(
  cookies: CookieRenewal['cookies'],
  headers: string[],
  url: URL,
  now: number,
) {
  const jar = new Map(cookies.map((c) => [c.name, { ...c }]));
  const allowed = new Set(jar.keys());
  for (const raw of headers) {
    const [pair, ...attributes] = raw.split(';');
    const equal = pair.indexOf('=');
    if (equal < 1) continue;
    const name = pair.slice(0, equal).trim(),
      value = pair.slice(equal + 1).trim();
    if (!allowed.has(name)) continue;
    const attrs = new Map(
      attributes.map((a) => {
        const index = a.indexOf('=');
        return index < 0
          ? [a.trim().toLowerCase(), '']
          : [a.slice(0, index).trim().toLowerCase(), a.slice(index + 1).trim()];
      }),
    );
    const domain = attrs.get('domain')?.replace(/^\./, '').toLowerCase();
    if (
      domain &&
      !(url.hostname === domain || url.hostname.endsWith('.' + domain))
    )
      continue;
    const path =
      attrs.get('path') ??
      url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
    if (
      !path.startsWith('/') ||
      !(
        url.pathname === path ||
        (url.pathname.startsWith(path) &&
          (path.endsWith('/') || url.pathname[path.length] === '/'))
      )
    )
      continue;
    let expiresAt: number | undefined;
    const maxAge = attrs.get('max-age');
    if (maxAge !== undefined && /^-?\d+$/.test(maxAge)) {
      const seconds = Number(maxAge);
      expiresAt =
        seconds <= 0
          ? 0
          : Math.min(Number.MAX_SAFE_INTEGER, now + seconds * 1000);
    } else if (attrs.has('expires')) {
      const parsed = Date.parse(attrs.get('expires')!);
      if (Number.isFinite(parsed)) expiresAt = Math.max(0, parsed);
    }
    if (!value || (expiresAt !== undefined && expiresAt <= now))
      jar.delete(name);
    else
      jar.set(name, {
        name,
        value,
        ...(expiresAt === undefined ? {} : { expiresAt }),
      });
  }
  return [...jar.values()];
}
