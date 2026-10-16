import { z } from 'zod';

export const SubjectSchema = z.enum(['chinese', 'math', 'english', 'other']);
export const BusinessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, '日期必须是有效的日历日期');
export const DraftSchema = z.strictObject({
  id: z.string().min(1),
  childId: z.string().min(1),
  subject: SubjectSchema,
  date: BusinessDateSchema,
  content: z.string().trim().min(1).max(5000),
});
export type Draft = z.infer<typeof DraftSchema>;
export const HomeworkSchema = z.strictObject({
  id: z.string(),
  subject: SubjectSchema,
  content: z.string(),
  date: BusinessDateSchema,
  status: z.enum(['pending', 'completed']),
});
export const HomeworkResponseSchema = z.strictObject({
  mode: z.literal('demo'),
  items: z.array(HomeworkSchema),
});
export type Homework = z.infer<typeof HomeworkSchema>;
export const ConnectionSchema = z.strictObject({
  status: z.literal('disconnected'),
  canRead: z.literal(false),
  canWrite: z.literal(false),
});
export const HealthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('xueersi-admin'),
});
