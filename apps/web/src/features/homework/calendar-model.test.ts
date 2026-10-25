import { it, expect } from 'vitest';
import {
  monthDates,
  daySummary,
  monthSummary,
  shiftMonth,
} from './calendar-model';
import type { Homework } from '@xueersi/contracts';
const item = (date: string, status: 'pending' | 'completed'): Homework => ({
  id: date + status,
  date,
  status,
  content: '合成',
  subject: 'math',
});
it('自然月和闰年日期正确且月份切换不被月底溢出影响', () => {
  expect(monthDates('2024-02-29')).toHaveLength(29);
  expect(monthDates('2026-10-17')[0]).toBe('2026-10-01');
  expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-01');
  expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
});
it('空日不是全部完成，过去未完成才算遗漏，今日未来均待完成', () => {
  const tasks = [
    item('2026-10-15', 'completed'),
    item('2026-10-16', 'pending'),
    item('2026-10-16', 'completed'),
    item('2026-10-17', 'pending'),
    item('2026-10-18', 'pending'),
  ];
  expect(daySummary(tasks, '2026-10-14', '2026-10-17').state).toBe('empty');
  expect(daySummary(tasks, '2026-10-15', '2026-10-17').state).toBe('complete');
  expect(daySummary(tasks, '2026-10-16', '2026-10-17')).toMatchObject({
    state: 'missed',
    total: 2,
    completed: 1,
    pending: 1,
  });
  expect(daySummary(tasks, '2026-10-17', '2026-10-17').state).toBe('pending');
  expect(daySummary(tasks, '2026-10-18', '2026-10-17').state).toBe('pending');
  expect(monthSummary(tasks, '2026-10-17', '2026-10-17')).toEqual({
    total: 5,
    completed: 2,
    pending: 3,
    completeDays: 1,
    missedDays: 1,
  });
});
