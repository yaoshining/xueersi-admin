import { it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
import { downloadMedia } from './homework-media';
it('网络只固定已验证公网 IP，不跟随重定向、不发送会话头', async () => {
  const signal = new AbortController().signal;
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  mocks.request.mockImplementation((_url, options, cb) => {
    expect(options.headers).toEqual({
      Accept: 'image/*',
      'Accept-Encoding': 'identity',
    });
    expect(options.agent).toBe(false);
    const done = vi.fn();
    options.lookup('media.example.invalid', { all: true }, done);
    expect(done).toHaveBeenCalledWith(null, [
      { address: '8.8.8.8', family: 4 },
    ]);
    const req = new EventEmitter() as EventEmitter & { end(): void };
    req.end = () =>
      cb(
        Object.assign(Readable.from([Buffer.from('89504e470d0a1a0a', 'hex')]), {
          statusCode: 200,
          headers: { 'content-type': 'image/png' },
        }),
      );
    return req;
  });
  expect(
    (
      await downloadMedia(
        'https://media.example.invalid/synthetic.png',
        'image',
        signal,
      )
    ).byteLength,
  ).toBe(8);
  mocks.request.mockClear();
  for (const address of ['127.0.0.1', '192.168.1.1', '169.254.169.254']) {
    mocks.lookup.mockResolvedValue([{ address, family: 4 }]);
    await expect(
      downloadMedia(
        'https://media.example.invalid/synthetic.png',
        'image',
        signal,
      ),
    ).rejects.toThrow();
  }
  for (const url of [
    'http://media.example.invalid/a',
    'https://user:pass@media.example.invalid/a',
    'https://media.example.invalid:444/a',
  ])
    await expect(downloadMedia(url, 'image', signal)).rejects.toThrow();
  expect(mocks.request).not.toHaveBeenCalled();
});

it('DNS 解析尚未完成时也可以及时取消', async () => {
  mocks.request.mockClear();
  let finish!: (value: unknown) => void;
  mocks.lookup.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const abort = new AbortController();
  const pending = downloadMedia(
    'https://media.example.invalid/a',
    'image',
    abort.signal,
  );
  abort.abort();
  const result = await Promise.race([
    pending.then(
      () => 'resolved',
      () => 'cancelled',
    ),
    new Promise((resolve) => setTimeout(() => resolve('stuck'), 50)),
  ]);
  finish([{ address: '8.8.8.8', family: 4 }]);
  await pending.catch(() => {});
  expect(result).toBe('cancelled');
  expect(mocks.request).not.toHaveBeenCalled();
});
