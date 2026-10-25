import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq, desc } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import {
  DraftSchema,
  DraftImportSchema,
  type Draft,
  SyncRecordSchema,
  type SyncRecord,
} from '@xueersi/contracts';
import { drafts, syncJobs, homeworkDeletions } from './schema';
export function draftVersion(draft: Draft) {
  return createHash('sha256')
    .update(JSON.stringify(DraftSchema.parse(draft)))
    .digest('hex');
}
export class DraftConflictError extends Error {
  constructor() {
    super('草稿冲突，已有内容未被覆盖');
  }
}
export function openDraftStore(
  path: string,
  migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url)),
) {
  const sqlite = new Database(path);
  const db = drizzle(sqlite);
  try {
    sqlite.pragma('journal_mode = WAL');
    migrate(db, { migrationsFolder });
  } catch (error) {
    sqlite.close();
    throw error;
  }
  function get(id: string): Draft | undefined {
    const row = db.select().from(drafts).where(eq(drafts.id, id)).get();
    return row ? DraftSchema.parse(row) : undefined;
  }
  function create(input: Draft) {
    const value = DraftSchema.parse(input);
    if (get(value.id)) throw new DraftConflictError();
    db.insert(drafts).values(value).run();
  }
  return {
    create,
    saveAgentDraft(input: Draft, expectedVersion?: string) {
      const value = DraftSchema.parse(input);
      return sqlite.transaction(() => {
        const current = get(value.id);
        if (current && current.childId !== value.childId)
          throw new DraftConflictError();
        if (expectedVersion !== undefined) {
          if (!current || draftVersion(current) !== expectedVersion)
            throw new DraftConflictError();
          db.update(drafts).set(value).where(eq(drafts.id, value.id)).run();
        } else if (current) {
          if (draftVersion(current) !== draftVersion(value))
            throw new DraftConflictError();
        } else create(value);
        return { draft: value, version: draftVersion(value) };
      })();
    },
    deletionBlocked(fingerprint: string) {
      const row = db
        .select()
        .from(homeworkDeletions)
        .where(eq(homeworkDeletions.fingerprint, fingerprint))
        .get();
      return !!row && row.status !== 'failed';
    },
    claimDeletion(fingerprint: string) {
      return sqlite.transaction(() => {
        const row = db
          .select()
          .from(homeworkDeletions)
          .where(eq(homeworkDeletions.fingerprint, fingerprint))
          .get();
        if (row && row.status !== 'failed') return false;
        const values = {
          fingerprint,
          status: 'sending',
          createdAt: Date.now(),
        };
        db.insert(homeworkDeletions)
          .values(values)
          .onConflictDoUpdate({
            target: homeworkDeletions.fingerprint,
            set: values,
          })
          .run();
        return true;
      })();
    },
    finishDeletion(
      fingerprint: string,
      status: 'accepted' | 'failed' | 'unknown',
    ) {
      db.update(homeworkDeletions)
        .set({ status })
        .where(eq(homeworkDeletions.fingerprint, fingerprint))
        .run();
    },
    syncBlocked(fingerprint: string) {
      const row = db
        .select()
        .from(syncJobs)
        .where(eq(syncJobs.fingerprint, fingerprint))
        .get();
      return !!row && row.status !== 'failed';
    },
    claimSync(fingerprint: string, record: SyncRecord) {
      return sqlite.transaction(() => {
        const row = db
          .select()
          .from(syncJobs)
          .where(eq(syncJobs.fingerprint, fingerprint))
          .get();
        if (row && row.status !== 'failed') return false;
        const values = {
          fingerprint,
          ...record,
          summary: JSON.stringify(record.summary),
        };
        db.insert(syncJobs)
          .values(values)
          .onConflictDoUpdate({ target: syncJobs.fingerprint, set: values })
          .run();
        return true;
      })();
    },
    finishSync(id: string, status: SyncRecord['status']) {
      db.update(syncJobs).set({ status }).where(eq(syncJobs.id, id)).run();
    },
    syncRecords(): SyncRecord[] {
      return db
        .select()
        .from(syncJobs)
        .orderBy(desc(syncJobs.createdAt))
        .all()
        .map((row) =>
          SyncRecordSchema.parse({
            id: row.id,
            createdAt: row.createdAt,
            status: row.status === 'sending' ? 'unknown' : row.status,
            summary: JSON.parse(row.summary),
          }),
        );
    },
    get,
    list(): Draft[] {
      // 从现有不可变同步快照归类，兼容旧记录且保留修改后的新版本。
      const accepted = new Set(
        db
          .select()
          .from(syncJobs)
          .where(eq(syncJobs.status, 'accepted'))
          .all()
          .map((row) =>
            draftVersion(
              SyncRecordSchema.parse({
                id: row.id,
                createdAt: row.createdAt,
                status: row.status,
                summary: JSON.parse(row.summary),
              }).summary.draft,
            ),
          ),
      );
      return db
        .select()
        .from(drafts)
        .orderBy(desc(drafts.date), drafts.id)
        .all()
        .map((row) => DraftSchema.parse(row))
        .filter((draft) => !accepted.has(draftVersion(draft)));
    },
    update(input: Draft) {
      const value = DraftSchema.parse(input);
      return (
        db.update(drafts).set(value).where(eq(drafts.id, value.id)).run()
          .changes > 0
      );
    },
    remove(id: string) {
      return db.delete(drafts).where(eq(drafts.id, id)).run().changes > 0;
    },
    importMany(input: Draft[]) {
      const { items } = DraftImportSchema.parse({ items: input });
      sqlite.transaction(() => {
        for (const item of items) {
          const previous = get(item.id);
          if (previous && JSON.stringify(previous) !== JSON.stringify(item))
            throw new DraftConflictError();
          if (!previous) create(item);
        }
      })();
    },
    close() {
      sqlite.close();
    },
  };
}
