import { describe, expect, it } from 'vitest';
import {
  businessToday,
  weekDates,
  shiftDate,
  visibleHomework,
  readDrafts,
  saveDraft,
  deleteDraft,
  type StoragePort,
} from './model';
import { parseTheme, resolvedTheme } from '../../lib/theme';
const draft = {
  targetMinutes: null,
  submissionRequirement: null,
  id: 'synthetic-draft',
  childId: 'demo-child-a',
  subject: 'chinese' as const,
  date: '2026-10-17',
  content: '合成草稿内容',
};
function memory(): StoragePort {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
describe('日期与任务隔离', () => {
  it('以上海日期跨越 UTC 午夜并正确跨月生成周', () => {
    expect(businessToday(new Date('2026-10-16T16:01:00Z'))).toBe('2026-10-17');
    expect(weekDates('2026-11-01')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('不同日期和孩子不能看到旧条件下的任务', () => {
    const items = [
      {
        id: 'example',
        date: '2026-10-17',
        subject: 'math' as const,
        content: '合成任务',
        status: 'pending' as const,
      },
    ];
    expect(visibleHomework(items, '2026-10-17', 'demo-child-a')).toHaveLength(
      1,
    );
    expect(visibleHomework(items, '2026-10-16', 'demo-child-a')).toEqual([]);
    expect(visibleHomework(items, '2026-10-17', 'demo-child-b')).toEqual([]);
  });
});
describe('本浏览器草稿', () => {
  it('保存、编辑、重读与按 ID 删除', () => {
    const storage = memory();
    saveDraft(storage, draft);
    saveDraft(storage, { ...draft, content: '更新后的合成内容' });
    expect(readDrafts(storage)).toEqual([
      { ...draft, content: '更新后的合成内容' },
    ]);
    deleteDraft(storage, draft.id);
    expect(readDrafts(storage)).toEqual([]);
  });
  it('拒绝空正文与无效日历日期', () => {
    expect(() => saveDraft(memory(), { ...draft, content: '  ' })).toThrow();
    expect(() =>
      saveDraft(memory(), { ...draft, date: '2026-02-30' }),
    ).toThrow();
  });
  it('损坏存储不能被静默覆盖，写入失败不能伪装成功', () => {
    let wrote = false;
    const corrupt = {
      getItem: () => '{bad',
      setItem: () => {
        wrote = true;
      },
    };
    expect(() => saveDraft(corrupt, draft)).toThrow('草稿数据无法读取');
    expect(wrote).toBe(false);
    expect(() =>
      saveDraft(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error('quota');
          },
        },
        draft,
      ),
    ).toThrow('无法保存');
  });
});
describe('主题偏好', () => {
  it('无效值回退系统，显式选择不受系统影响', () => {
    expect(parseTheme('invalid')).toBe('system');
    expect(parseTheme(null)).toBe('system');
    expect(resolvedTheme('dark', false)).toBe('dark');
    expect(resolvedTheme('light', true)).toBe('light');
    expect(resolvedTheme('system', true)).toBe('dark');
  });
});
