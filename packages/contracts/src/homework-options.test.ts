import { it, expect } from 'vitest';
import { HomeworkSchema } from './index';
const item = {
  id: 'synthetic',
  subject: 'math',
  date: '2026-10-17',
  content: '合成作业',
  status: 'pending',
};
it('官方回读保留目标时长和提交要求，旧响应不会被当成不限', () => {
  expect(
    HomeworkSchema.parse({
      ...item,
      targetMinutes: 15,
      submissionRequirement: 'image',
    }),
  ).toMatchObject({ targetMinutes: 15, submissionRequirement: 'image' });
  expect(
    HomeworkSchema.parse({
      ...item,
      targetMinutes: 90,
      submissionRequirement: 'audio-or-video',
    }).targetMinutes,
  ).toBe(90);
  expect(HomeworkSchema.parse(item).targetMinutes).toBeUndefined();
  expect(
    HomeworkSchema.parse({
      ...item,
      targetMinutes: null,
      submissionRequirement: null,
    }),
  ).toMatchObject({ targetMinutes: null, submissionRequirement: null });
  expect(HomeworkSchema.safeParse({ ...item, targetMinutes: -1 }).success).toBe(
    false,
  );
});
