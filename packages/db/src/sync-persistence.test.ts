import { it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDraftStore } from './index';
it('崩溃遗留 sending 重启后成为 unknown 并保留防重', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-test-')),
    path = join(dir, 'test.sqlite');
  try {
    let store = openDraftStore(path);
    const summary = {
      draft: {
        id: 'test',
        childId: 'test-child',
        subject: 'math' as const,
        date: '2026-10-17',
        content: '合成',
        targetMinutes: 0 as const,
        submissionRequirement: 'none' as const,
      },
      child: '测试孩子',
      device: '测试设备',
      typeLabel: '数学 · 其他',
    };
    expect(
      store.claimSync('fingerprint', {
        id: 'job',
        createdAt: 1,
        status: 'sending',
        summary,
      }),
    ).toBe(true);
    store.close();
    store = openDraftStore(path);
    expect(store.syncBlocked('fingerprint')).toBe(true);
    expect(store.syncRecords()[0].status).toBe('unknown');
    expect(
      store.claimSync('fingerprint', {
        id: 'job2',
        createdAt: 2,
        status: 'sending',
        summary,
      }),
    ).toBe(false);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('历史 accepted 快照在重启后归入已同步，修改版恢复为待同步', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-library-')),
    path = join(dir, 'test.sqlite');
  const draft = {
    id: 'test-draft',
    childId: 'test-child',
    subject: 'math' as const,
    date: '2026-10-19',
    content: '合成作业',
    targetMinutes: 15 as const,
    submissionRequirement: 'image' as const,
  };
  try {
    let store = openDraftStore(path);
    store.create(draft);
    store.claimSync('synthetic-fingerprint', {
      id: 'test-job',
      createdAt: 1,
      status: 'accepted',
      summary: {
        draft,
        child: '合成孩子',
        device: '合成设备',
        typeLabel: '数学 · 其他',
      },
    });
    store.close();
    store = openDraftStore(path);
    expect(store.list()).toEqual([]);
    expect(store.get(draft.id)).toEqual(draft);
    expect(store.syncRecords()[0].summary.draft).toEqual(draft);
    store.update({ ...draft, content: '修改后的合成作业' });
    expect(store.list()).toHaveLength(1);
    store.remove(draft.id);
    expect(store.syncRecords()).toHaveLength(1);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
