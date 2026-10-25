import type { Homework } from '@xueersi/contracts';
export function monthDates(date: string) {
  const year = Number(date.slice(0, 4)),
    month = Number(date.slice(5, 7));
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from(
    { length },
    (_, i) => `${date.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`,
  );
}
export function shiftMonth(date: string, delta: number) {
  return new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1 + delta, 1),
  )
    .toISOString()
    .slice(0, 10);
}
export function daySummary(items: Homework[], date: string, today: string) {
  const tasks = items.filter((item) => item.date === date),
    total = tasks.length,
    completed = tasks.filter((item) => item.status === 'completed').length,
    pending = total - completed;
  const state: 'empty' | 'complete' | 'missed' | 'pending' =
    total === 0
      ? 'empty'
      : pending === 0
        ? 'complete'
        : date < today
          ? 'missed'
          : 'pending';
  return { total, completed, pending, state };
}
export function monthSummary(items: Homework[], month: string, today: string) {
  const days = monthDates(month).map((date) => daySummary(items, date, today));
  return {
    total: days.reduce((n, d) => n + d.total, 0),
    completed: days.reduce((n, d) => n + d.completed, 0),
    pending: days.reduce((n, d) => n + d.pending, 0),
    completeDays: days.filter((d) => d.state === 'complete').length,
    missedDays: days.filter((d) => d.state === 'missed').length,
  };
}
