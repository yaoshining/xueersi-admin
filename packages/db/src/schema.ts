import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const drafts = sqliteTable('drafts', {
  id: text('id').primaryKey(),
  childId: text('child_id').notNull(),
  subject: text('subject').notNull(),
  date: text('date').notNull(),
  content: text('content').notNull(),
});
