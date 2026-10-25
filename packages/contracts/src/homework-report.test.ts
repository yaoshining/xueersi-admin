import { it, expect } from 'vitest';
import { HomeworkReportSchema } from './index';
it('区分附件类型、过期、不可用与空报告，拒绝非 HTTPS 地址', () => {
  const attachments = ['image', 'audio', 'video'].map((kind) => ({
    kind,
    state: 'available',
    url: `https://media.example.com/${kind}`,
  }));
  expect(HomeworkReportSchema.parse({ attachments }).attachments).toHaveLength(
    3,
  );
  for (const state of ['expired', 'unavailable'])
    expect(
      HomeworkReportSchema.safeParse({
        attachments: [{ kind: 'image', state }],
      }).success,
    ).toBe(true);
  expect(HomeworkReportSchema.parse({ attachments: [] }).attachments).toEqual(
    [],
  );
  for (const url of [
    'http://media.example.com/a',
    'javascript:alert(1)',
    'https://user:password@example.com/a',
  ])
    expect(
      HomeworkReportSchema.safeParse({
        attachments: [{ kind: 'image', state: 'available', url }],
      }).success,
    ).toBe(false);
});
