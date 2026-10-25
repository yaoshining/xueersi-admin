import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const drafts = sqliteTable('drafts', {
  id: text('id').primaryKey(),
  childId: text('child_id').notNull(),
  subject: text('subject').notNull(),
  date: text('date').notNull(),
  content: text('content').notNull(),
  targetMinutes: integer('target_minutes'),
  submissionRequirement: text('submission_requirement'),
});
export const syncJobs = sqliteTable('sync_jobs', {
  fingerprint: text('fingerprint').primaryKey(),
  id: text('id').notNull(),
  createdAt: integer('created_at').notNull(),
  status: text('status').notNull(),
  summary: text('summary').notNull(),
});
export const homeworkDeletions = sqliteTable('homework_deletions', {
  fingerprint: text('fingerprint').primaryKey(),
  status: text('status').notNull(),
  createdAt: integer('created_at').notNull(),
});
