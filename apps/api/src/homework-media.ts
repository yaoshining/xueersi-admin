import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIPv4 } from 'node:net';
import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import {
  MediaContentSchema,
  MediaReadSchema,
  type MediaContent,
} from '@xueersi/contracts';
import type { ReadonlyTalAdapter } from '@xueersi/tal-adapter';
const MAX_BYTES = 16 * 1024 * 1024;
class MediaError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export type MediaReader = (
  url: string,
  kind: 'image' | 'audio',
  signal: AbortSignal,
) => Promise<MediaContent>;
export function isPublicIPv4(address: string) {
  if (!isIPv4(address)) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export function decodeMedia(
  bytes: Buffer,
  kind: 'image' | 'audio',
  declared: string,
): MediaContent {
  const start = bytes.subarray(0, 16),
    text = start.toString('ascii');
  let mimeType = '';
  if (kind === 'image') {
    if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
      mimeType = 'image/jpeg';
    else if (
      bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    )
      mimeType = 'image/png';
    else if (/^GIF8[79]a/.test(text)) mimeType = 'image/gif';
    else if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP')
      mimeType = 'image/webp';
  } else {
    if (text.startsWith('RIFF') && text.slice(8, 12) === 'WAVE')
      mimeType = 'audio/wav';
    else if (text.startsWith('#!AMR')) mimeType = 'audio/amr';
    else if (text.startsWith('OggS')) mimeType = 'audio/ogg';
    else if (
      text.startsWith('ID3') ||
      (bytes[0] === 255 &&
        (bytes[1] & 0xe0) === 0xe0 &&
        (bytes[1] & 0x06) !== 0)
    )
      mimeType = 'audio/mpeg';
    else if (bytes[0] === 255 && (bytes[1] & 0xf6) === 0xf0)
      mimeType = 'audio/aac';
    else if (text.slice(4, 8) === 'ftyp') mimeType = 'audio/mp4';
    else if (bytes.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')))
      mimeType = 'audio/webm';
  }
  const header = declared.split(';')[0].trim().toLowerCase();
  const alias: Record<string, string> = {
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'audio/x-m4a': 'audio/mp4',
    'audio/mp3': 'audio/mpeg',
  };
  if (
    !mimeType ||
    (header &&
      header !== 'application/octet-stream' &&
      (alias[header] ?? header) !== mimeType)
  )
    throw new MediaError('MEDIA_UNSUPPORTED');
  if (!bytes.length || bytes.length > MAX_BYTES)
    throw new MediaError('MEDIA_TOO_LARGE');
  return MediaContentSchema.parse({
    kind,
    mimeType,
    byteLength: bytes.length,
    data: bytes.toString('base64'),
  });
}
export async function readMediaResponse(
  response: Response,
  kind: 'image' | 'audio',
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel();
    throw new MediaError('MEDIA_UNAVAILABLE');
  }
  const length = Number(response.headers.get('content-length') ?? 0);
  if (!Number.isFinite(length) || length < 0 || length > MAX_BYTES) {
    await response.body.cancel();
    throw new MediaError('MEDIA_TOO_LARGE');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const result = await reader.read();
      signal.throwIfAborted();
      if (result.done) break;
      size += result.value.length;
      if (size > MAX_BYTES) throw new MediaError('MEDIA_TOO_LARGE');
      chunks.push(result.value);
    }
    return decodeMedia(
      Buffer.concat(chunks),
      kind,
      response.headers.get('content-type') ?? '',
    );
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export const downloadMedia: MediaReader = async (rawUrl, kind, signal) => {
  const url = new URL(rawUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  )
    throw new MediaError('MEDIA_TARGET_DENIED');
  signal.throwIfAborted();
  const addresses = await new Promise<Awaited<ReturnType<typeof lookup>>[]>(
    (resolve, reject) => {
      const abort = () => reject(new MediaError('MEDIA_CANCELLED'));
      signal.addEventListener('abort', abort, { once: true });
      void lookup(url.hostname, { family: 4, all: true })
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', abort));
    },
  );
  signal.throwIfAborted();
  if (!addresses.length || addresses.some((x) => !isPublicIPv4(x.address)))
    throw new MediaError('MEDIA_TARGET_DENIED');
  // 将已验证的解析结果固定到 socket，TLS 仍验证原始主机名；不跟随重定向。
  const response = await new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'GET',
        signal,
        agent: false,
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [addresses[0]]);
          else callback(null, addresses[0].address, 4);
        },
        headers: { Accept: kind + '/*', 'Accept-Encoding': 'identity' },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.destroy();
          reject(new MediaError('MEDIA_UNAVAILABLE'));
          return;
        }
        const headers = new Headers();
        for (const key of ['content-type', 'content-length'])
          if (res.headers[key]) headers.set(key, String(res.headers[key]));
        resolve(
          new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, {
            status: 200,
            headers,
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
  return readMediaResponse(response, kind, signal);
};
export function registerHomeworkMedia(
  app: FastifyInstance,
  adapter: ReadonlyTalAdapter,
  reader: MediaReader = downloadMedia,
) {
  let active = 0;
  app.post(
    '/api/v1/homework/attachment',
    { bodyLimit: 2048 },
    async (request, reply) => {
      if (active >= 2)
        return reply.code(429).send({ error: { code: 'MEDIA_BUSY' } });
      const parsed = MediaReadSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ error: { code: 'INVALID_MEDIA_QUERY' } });
      active++;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      timeout.unref();
      const abort = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };
      reply.raw.on('close', abort);
      try {
        const q = parsed.data;
        const stable = () => {
          const c = adapter.connection();
          controller.signal.throwIfAborted();
          if (
            c.status !== 'connected' ||
            !c.canRead ||
            c.sessionId !== q.sessionId ||
            c.child.value !== q.childId
          )
            throw new MediaError('MEDIA_CONTEXT_CHANGED');
        };
        stable();
        const report = await adapter.report({
          childId: q.childId,
          date: q.date,
          id: q.id,
        });
        stable();
        const file = report.attachments[q.index];
        if (!file || file.state !== 'available' || file.kind === 'video')
          throw new MediaError('MEDIA_UNAVAILABLE');
        if (
          createHash('sha256').update(JSON.stringify(file)).digest('hex') !==
          q.fingerprint
        )
          throw new MediaError('MEDIA_CHANGED');
        const result = MediaContentSchema.parse(
          await reader(file.url, file.kind, controller.signal),
        );
        stable();
        if (result.kind !== file.kind)
          throw new MediaError('MEDIA_UNSUPPORTED');
        return result;
      } catch (error) {
        return reply.code(503).send({
          error: {
            code: controller.signal.aborted
              ? 'MEDIA_CANCELLED'
              : error instanceof MediaError
                ? error.code
                : 'MEDIA_UNAVAILABLE',
          },
        });
      } finally {
        active--;
        clearTimeout(timeout);
        reply.raw.off('close', abort);
      }
    },
  );
}
