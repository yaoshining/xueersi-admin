import { it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openDraftStore } from './index';
import { DraftSchema } from '@xueersi/contracts';
const draft = {
  id: 'synthetic-draft',
  childId: 'synthetic-child',
  subject: 'math' as const,
  date: '2026-10-17',
  content: '合成练习',
  targetMinutes: 20 as const,
  submissionRequirement: 'image' as const,
};
it('完整字段关闭重开、更新、删除', () => {
  const dir = mkdtempSync(join(tmpdir(), 'draft-crud-'));
  let store = openDraftStore(join(dir, 'drafts.db'));
  try {
    store.create(draft);
    store.close();
    store = openDraftStore(join(dir, 'drafts.db'));
    expect(store.list()).toEqual([draft]);
    expect(
      store.update({
        ...draft,
        targetMinutes: 0,
        submissionRequirement: 'none',
      }),
    ).toBe(true);
    expect(store.get(draft.id)?.targetMinutes).toBe(0);
    expect(store.update({ ...draft, id: 'missing' })).toBe(false);
    expect(store.remove(draft.id)).toBe(true);
    expect(store.list()).toEqual([]);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it('旧表升级保留内容和未设置含义', () => {
  const dir = mkdtempSync(join(tmpdir(), 'draft-migrate-'));
  const file = join(dir, 'drafts.db');
  const old = new Database(file);
  old.exec(
    readFileSync(
      new URL('../migrations/0000_keen_dazzler.sql', import.meta.url),
      'utf8',
    ),
  );
  old
    .prepare('INSERT INTO drafts VALUES (?, ?, ?, ?, ?)')
    .run('old', 'child', 'math', '2026-10-17', '合成旧草稿');
  // 模拟迁移前已部署的 Drizzle 记录。
  old.exec(
    'CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)',
  );
  old
    .prepare('INSERT INTO __drizzle_migrations (hash,created_at) VALUES (?,?)')
    .run('old', 1792173132887);
  old.close();
  const store = openDraftStore(file);
  try {
    expect(store.get('old')).toMatchObject({
      content: '合成旧草稿',
      targetMinutes: null,
      submissionRequirement: null,
    });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it('重复导入幂等、冲突整批回滚', () => {
  const store = openDraftStore(':memory:');
  try {
    store.importMany([draft]);
    store.importMany([draft]);
    expect(store.list()).toHaveLength(1);
    expect(() =>
      store.importMany([
        { ...draft, id: 'new' },
        { ...draft, content: '冲突' },
      ]),
    ).toThrow();
    expect(store.get('new')).toBeUndefined();
    expect(store.get(draft.id)).toEqual(draft);
  } finally {
    store.close();
  }
});
it('契约接受选项、拒绝非法选项、兼容旧草稿', () => {
  expect(DraftSchema.parse(draft)).toEqual(draft);
  expect(DraftSchema.safeParse({ ...draft, targetMinutes: -1 }).success).toBe(
    false,
  );
  expect(
    DraftSchema.safeParse({ ...draft, submissionRequirement: 'file' }).success,
  ).toBe(false);
});
