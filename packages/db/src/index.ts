import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { DraftSchema, type Draft } from '@xueersi/contracts';
import { drafts } from './schema';

export function openDraftStore(path: string) {
  const sqlite = new Database(path);
  const db = drizzle(sqlite);
  try {
    sqlite.pragma('journal_mode = WAL');
    migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL('../migrations', import.meta.url),
      ),
    });
  } catch (error) {
    sqlite.close();
    throw error;
  }
  return {
    create(input: Draft) {
      db.insert(drafts).values(DraftSchema.parse(input)).run();
    },
    get(id: string): Draft | undefined {
      const row = db.select().from(drafts).where(eq(drafts.id, id)).get();
      return row ? DraftSchema.parse(row) : undefined;
    },
    close() {
      sqlite.close();
    },
  };
}
