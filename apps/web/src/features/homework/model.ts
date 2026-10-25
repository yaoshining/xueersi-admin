import { DraftSchema, type Draft, type Homework } from '@xueersi/contracts';
export const subjects = {
  chinese: '语文',
  math: '数学',
  english: '英语',
  other: '其他',
};
export const children = [
  { value: 'demo-child-a', label: '示例孩子 A' },
  { value: 'demo-child-b', label: '示例孩子 B' },
];
export function businessToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function weekDates(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const monday = shiftDate(date, -((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
}
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(`${date}T12:00:00Z`));
}
export function visibleHomework(
  items: Homework[],
  date: string,
  child: string,
) {
  return child === 'demo-child-a'
    ? items.filter((item) => item.date === date)
    : [];
}
export type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export const DRAFT_KEY = 'xueban.drafts.v1';
export function readDrafts(storage: StoragePort): Draft[] {
  try {
    const raw = storage.getItem(DRAFT_KEY);
    return raw ? DraftSchema.array().parse(JSON.parse(raw)) : [];
  } catch {
    throw new Error('草稿数据无法读取，请保留本浏览器数据并稍后重试。');
  }
}
function writeDrafts(storage: StoragePort, drafts: Draft[]) {
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  } catch {
    throw new Error('无法保存草稿，请检查浏览器存储空间或隐私设置后重试。');
  }
}
export function saveDraft(storage: StoragePort, input: Draft) {
  const draft = DraftSchema.parse(input);
  const drafts = readDrafts(storage);
  const existing = drafts.findIndex((item) => item.id === draft.id);
  if (existing < 0) drafts.unshift(draft);
  else drafts[existing] = draft;
  writeDrafts(storage, drafts);
}
export function deleteDraft(storage: StoragePort, id: string) {
  writeDrafts(
    storage,
    readDrafts(storage).filter((item) => item.id !== id),
  );
}
