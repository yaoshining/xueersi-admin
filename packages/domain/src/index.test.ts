import { it, expect } from 'vitest';
import { businessDate } from './index';
it('北京时间跨日，不能按UTC截断', () =>
  expect(businessDate(new Date('2026-10-16T16:01:00Z'))).toBe('2026-10-17'));
it('北京午夜前日期不提前', () =>
  expect(businessDate(new Date('2026-10-16T15:59:59Z'))).toBe('2026-10-16'));
it('无效时间必须拒绝', () =>
  expect(() => businessDate(new Date('bad'))).toThrow());
