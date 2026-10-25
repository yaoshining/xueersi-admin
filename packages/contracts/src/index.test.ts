import { describe, it, expect } from 'vitest';
import { DraftSchema, HomeworkResponseSchema } from './index';
const draft = {
  targetMinutes: null,
  submissionRequirement: null,
  id: 'draft-example',
  childId: 'child-example',
  subject: 'math',
  date: '2026-10-17',
  content: '完成示例练习',
};
describe('草稿契约', () => {
  it('保留不透明字符串标识', () =>
    expect(DraftSchema.parse(draft)).toEqual(draft));
  it.each([
    { childId: 123 },
    { date: '2026-02-30' },
    { date: '2026-13-01' },
    { content: '  ' },
    { subject: 'unknown' },
  ])('拒绝非法输入 %j', (patch) =>
    expect(DraftSchema.safeParse({ ...draft, ...patch }).success).toBe(false),
  );
  it('拒绝意外令牌字段', () =>
    expect(
      DraftSchema.safeParse({ ...draft, token: 'synthetic-secret' }).success,
    ).toBe(false));
  it('演示响应必须有明确模式', () =>
    expect(HomeworkResponseSchema.safeParse({ items: [] }).success).toBe(
      false,
    ));
});
