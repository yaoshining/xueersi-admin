import { it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDraftStore } from './index';
it('删除在发送前持久占位，进程重启后阻止重放，明确失败允许重新确认', () => {
  const dir = mkdtempSync(join(tmpdir(), 'delete-test-')),
    path = join(dir, 'test.sqlite');
  try {
    let store = openDraftStore(path);
    expect(store.claimDeletion('synthetic')).toBe(true);
    store.close();
    store = openDraftStore(path);
    expect(store.deletionBlocked('synthetic')).toBe(true);
    expect(store.claimDeletion('synthetic')).toBe(false);
    store.finishDeletion('synthetic', 'failed');
    expect(store.claimDeletion('synthetic')).toBe(true);
    store.finishDeletion('synthetic', 'unknown');
    store.close();
    store = openDraftStore(path);
    expect(store.claimDeletion('synthetic')).toBe(false);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
