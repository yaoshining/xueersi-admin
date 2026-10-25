import { it, expect } from 'vitest';
import { MediaContentSchema } from './index';
it('大附件可解析，超限、错误编码和长度不一致均拒绝', () => {
  const data = Buffer.alloc(16 * 1024 * 1024, 42).toString('base64');
  const media = {
    kind: 'image',
    mimeType: 'image/png',
    byteLength: 16 * 1024 * 1024,
    data,
  };
  expect(MediaContentSchema.parse(media).data).toBe(data);
  for (const patch of [
    { byteLength: 1 },
    { data: 'abc' },
    { data: '<html>' },
    { mimeType: 'audio/wav' },
    { byteLength: 16777217 },
  ])
    expect(MediaContentSchema.safeParse({ ...media, ...patch }).success).toBe(
      false,
    );
});
