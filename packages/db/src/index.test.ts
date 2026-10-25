import { afterEach, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDraftStore } from './index';
const directories: string[] = [];
afterEach(() => {
  for (const p of directories.splice(0))
    rmSync(p, { recursive: true, force: true });
});
const draft = {
  targetMinutes: null,
  submissionRequirement: null,
  id: 'draft-example',
  childId: 'child-example',
  subject: 'math' as const,
  date: '2026-10-17',
  content: '合成测试内容',
};
it('关闭重开后草稿仍在', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xes-test-'));
  directories.push(dir);
  const file = join(dir, 'drafts.sqlite');
  const first = openDraftStore(file);
  first.create(draft);
  first.close();
  const second = openDraftStore(file);
  try {
    expect(second.get(draft.id)).toEqual(draft);
  } finally {
    second.close();
  }
});
it('重复ID不覆盖已有内容', () => {
  const db = openDraftStore(':memory:');
  try {
    db.create(draft);
    expect(() => db.create({ ...draft, content: '不应覆盖' })).toThrow();
    expect(db.get(draft.id)).toEqual(draft);
  } finally {
    db.close();
  }
});
it('存储层同样拒绝非法输入', () => {
  const db = openDraftStore(':memory:');
  try {
    expect(() => db.create({ ...draft, content: '' })).toThrow();
    expect(db.get(draft.id)).toBeUndefined();
  } finally {
    db.close();
  }
});
