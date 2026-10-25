import { expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { ReadonlyTalAdapter } from '@xueersi/tal-adapter';
import { buildApp } from './app';
import {
  isPublicIPv4,
  decodeMedia,
  readMediaResponse,
  type MediaReader,
} from './homework-media';
it('下载地址阻断所有本机、私网、保留地址', () => {
  for (const ip of [
    '127.0.0.1',
    '0.0.0.0',
    '10.1.2.3',
    '172.16.1.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '192.0.0.1',
    '198.18.0.1',
    '224.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
  ])
    expect(isPublicIPv4(ip)).toBe(false);
  expect(isPublicIPv4('8.8.8.8')).toBe(true);
});
it('图片音频签名校验拒绝伪装和不支持文件', () => {
  expect(
    decodeMedia(Buffer.from('89504e470d0a1a0a', 'hex'), 'image', 'image/png')
      .mimeType,
  ).toBe('image/png');
  expect(
    decodeMedia(Buffer.from('RIFF0000WAVEfmt '), 'audio', 'audio/wav').mimeType,
  ).toBe('audio/wav');
  for (const body of ['<html>private</html>', '<svg></svg>'])
    expect(() =>
      decodeMedia(Buffer.from(body), 'image', 'image/png'),
    ).toThrow();
  expect(() =>
    decodeMedia(Buffer.from('RIFF0000WAVE'), 'image', 'image/png'),
  ).toThrow();
});
it('响应拒绝重定向、长度超限、流式超限和取消', async () => {
  for (const response of [
    new Response(null, { status: 302 }),
    new Response('x', { headers: { 'content-length': '16777217' } }),
    new Response(new Uint8Array(16777217)),
  ]) {
    await expect(
      readMediaResponse(response, 'image', new AbortController().signal),
    ).rejects.toThrow();
  }
  const abort = new AbortController();
  abort.abort();
  await expect(
    readMediaResponse(new Response('x'), 'image', abort.signal),
  ).rejects.toThrow();
});
it('路由仅读取所属已完成附件，校验指纹和会话，不转发凭据', async () => {
  const attachment = {
    kind: 'image',
    state: 'available',
    url: 'https://media.example.invalid/synthetic.png?signature=private',
  };
  const adapter = new ReadonlyTalAdapter({
    pairingKey: 'key',
    transport: async () => ({
      mode: 'real',
      items: [
        {
          id: 'synthetic-task',
          subject: 'math',
          content: '合成',
          date: '2026-10-19',
          status: 'completed',
        },
      ],
    }),
    report: async () => ({ attachments: [attachment] }),
  });
  adapter.accept('key', {
    token: 'synthetic-private-token',
    studentId: 'student',
    sn: 'device',
    deviceCode: 'model',
  });
  const c = adapter.connection();
  if (c.status !== 'connected') throw Error();
  const mediaReader = vi.fn<MediaReader>(async () => ({
    kind: 'image',
    mimeType: 'image/png',
    byteLength: 8,
    data: 'iVBORw0KGgo=',
  }));
  const app = await buildApp({ adapter, mediaReader });
  const headers = { host: 'localhost', 'x-local-request': '1' };
  const payload = {
    id: 'synthetic-task',
    childId: c.child.value,
    date: '2026-10-19',
    sessionId: c.sessionId,
    index: 0,
    fingerprint: createHash('sha256')
      .update(JSON.stringify(attachment))
      .digest('hex'),
  };
  try {
    for (const patch of [
      { index: -1 },
      { index: 1 },
      { childId: 'other' },
      { sessionId: 'other' },
      { fingerprint: 'a'.repeat(64) },
      { url: 'https://example.invalid' },
    ]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/homework/attachment',
            headers,
            payload: { ...payload, ...patch },
          })
        ).statusCode,
      ).not.toBe(200);
    }
    expect(mediaReader).not.toHaveBeenCalled();
    for (const h of [
      { host: 'localhost' },
      { ...headers, origin: 'https://example.invalid' },
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/homework/attachment',
            headers: h,
            payload,
          })
        ).statusCode,
      ).toBe(403);
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/homework/attachment',
      headers,
      payload,
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().mimeType).toBe('image/png');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body).not.toContain('private');
    expect(mediaReader.mock.calls[0]).toHaveLength(3);
    mediaReader.mockImplementation(async () => {
      adapter.disconnect();
      return {
        kind: 'image',
        mimeType: 'image/png',
        byteLength: 8,
        data: 'iVBORw0KGgo=',
      };
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/homework/attachment',
          headers,
          payload,
        })
      ).statusCode,
    ).not.toBe(200);
  } finally {
    await app.close();
  }
});

it('下载流取消后终止，不能返回已经收到的部分内容', async () => {
  const abort = new AbortController();
  let received!: () => void;
  const started = new Promise<void>((resolve) => {
    received = resolve;
  });
  const cancelled = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Buffer.from('89504e470d0a1a0a', 'hex'));
      received();
    },
    cancel: cancelled,
  });
  const pending = readMediaResponse(
    new Response(stream, { headers: { 'content-type': 'image/png' } }),
    'image',
    abort.signal,
  );
  await started;
  abort.abort();
  await expect(pending).rejects.toThrow();
  expect(cancelled).toHaveBeenCalled();
});
