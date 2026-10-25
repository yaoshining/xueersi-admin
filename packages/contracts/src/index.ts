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
export const TargetMinutesSchema = z.union([
  z.literal(0),
  z.literal(10),
  z.literal(15),
  z.literal(20),
  z.literal(30),
  z.literal(40),
  z.literal(50),
  z.literal(60),
]);
export const SubmissionRequirementSchema = z.enum([
  'none',
  'image',
  'audio',
  'video',
  'audio-or-video',
]);
export const DraftSchema = z.strictObject({
  id: z.string().min(1).max(128),
  childId: z.string().min(1).max(128),
  subject: SubjectSchema,
  date: BusinessDateSchema,
  content: z.string().trim().min(1).max(5000),
  targetMinutes: TargetMinutesSchema.nullable().default(null),
  submissionRequirement: SubmissionRequirementSchema.nullable().default(null),
});
export const DraftListSchema = z.strictObject({ items: z.array(DraftSchema) });
export const DraftImportSchema = z.strictObject({
  items: z.array(DraftSchema).max(1000),
});
export const SuccessSchema = z.strictObject({ ok: z.literal(true) });
export type Draft = z.infer<typeof DraftSchema>;
export const HomeworkSchema = z.strictObject({
  id: z.string(),
  subject: SubjectSchema,
  content: z.string(),
  date: BusinessDateSchema,
  status: z.enum(['pending', 'completed']),
  targetMinutes: z.number().int().nonnegative().nullable().optional(),
  submissionRequirement: SubmissionRequirementSchema.nullable().optional(),
});
export const HomeworkResponseSchema = z.strictObject({
  mode: z.literal('demo'),
  items: z.array(HomeworkSchema),
});
export type Homework = z.infer<typeof HomeworkSchema>;
export const RealHomeworkResponseSchema = z.strictObject({
  mode: z.literal('real'),
  items: z.array(HomeworkSchema).max(1000),
});
export const ReadQuerySchema = z
  .strictObject({
    childId: z.string().min(1).max(128),
    date: BusinessDateSchema,
    endDate: BusinessDateSchema.optional(),
  })
  .refine(
    (q) =>
      !q.endDate ||
      (q.endDate >= q.date &&
        (Date.parse(q.endDate) - Date.parse(q.date)) / 86400000 < 42),
  );
const ContextIdentifierSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const ContextNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (value) =>
      ![...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127),
  );
export const AuthCookieSchema = z.strictObject({
  name: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  value: z
    .string()
    .max(4096)
    .regex(/^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/),
  expiresAt: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
});
export const CookieRenewalSchema = z.strictObject({
  deviceId: ContextIdentifierSchema,
  cookies: z
    .array(AuthCookieSchema)
    .max(16)
    .refine(
      (items) =>
        new Set(items.map((c) => c.name)).size === items.length &&
        items.reduce(
          (size, c) => size + c.name.length + c.value.length + 3,
          0,
        ) <= 8192,
    ),
  nextCheckAt: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .default(0),
});
export type CookieRenewal = z.infer<typeof CookieRenewalSchema>;
export const SessionHandoffSchema = z.strictObject({
  token: z
    .string()
    .min(1)
    .max(8192)
    .regex(/^[^\r\n]+$/),
  studentId: ContextIdentifierSchema,
  sn: ContextIdentifierSchema,
  deviceCode: ContextIdentifierSchema,
  renewal: CookieRenewalSchema.optional(),
  childName: ContextNameSchema.optional(),
  deviceName: ContextNameSchema.optional(),
});
export type SessionHandoff = z.infer<typeof SessionHandoffSchema>;
export const ConnectionSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('disconnected'),
    reason: z.enum(['session-expired']).optional(),
    canRead: z.literal(false),
    canWrite: z.literal(false),
  }),
  z.strictObject({
    status: z.literal('connected'),
    canRead: z.literal(true),
    canWrite: z.boolean().default(false),
    sessionId: z.string(),
    persistence: z.enum(['memory', 'encrypted']).default('memory'),
    verification: z.enum(['pending', 'verified']).default('pending'),
    renewal: z.enum(['automatic', 'login-required']).default('login-required'),
    child: z.strictObject({
      value: z.string().min(1).max(128),
      label: z.string(),
    }),
    device: z.strictObject({
      value: z.string().min(1).max(128),
      label: z.string(),
    }),
  }),
]);
export type Connection = z.infer<typeof ConnectionSchema>;
export const HealthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('xueersi-admin'),
});

export const SyncSummarySchema = z.strictObject({
  draft: DraftSchema,
  child: z.string(),
  device: z.string(),
  typeLabel: z.string(),
});
export const SyncPreviewSchema = z.strictObject({
  ticketId: z.string(),
  secret: z.string(),
  expiresAt: z.number(),
  summary: SyncSummarySchema,
});
export const SyncRecordSchema = z.strictObject({
  id: z.string(),
  createdAt: z.number(),
  status: z.enum(['sending', 'accepted', 'failed', 'unknown']),
  summary: SyncSummarySchema,
});
export const SyncRecordsSchema = z.strictObject({
  items: z.array(SyncRecordSchema),
});
export type SyncSummary = z.infer<typeof SyncSummarySchema>;
export type SyncPreview = z.infer<typeof SyncPreviewSchema>;
export type SyncRecord = z.infer<typeof SyncRecordSchema>;

export const BatchSyncRequestSchema = z.strictObject({
  draftIds: z
    .array(z.string().min(1).max(128))
    .min(1)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length),
});
export const SyncConfirmationSchema = z.strictObject({
  ticketId: z.string().min(1).max(128),
  secret: z.string().min(1).max(128),
  confirmed: z.literal(true),
});
export const BatchSyncPreviewSchema = z.strictObject({
  ticketId: z.string(),
  secret: z.string(),
  expiresAt: z.number(),
  summaries: z.array(SyncSummarySchema).min(1).max(20),
});
export const BatchSyncResultSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      draftId: z.string(),
      status: z.enum(['accepted', 'failed', 'unknown', 'not_sent']),
      record: SyncRecordSchema.optional(),
      code: z.string().optional(),
    }),
  ),
});
export type BatchSyncPreview = z.infer<typeof BatchSyncPreviewSchema>;
export type BatchSyncResult = z.infer<typeof BatchSyncResultSchema>;

const MediaKindSchema = z.enum(['image', 'audio', 'video']);
export const HomeworkAttachmentSchema = z.discriminatedUnion('state', [
  z.strictObject({
    kind: MediaKindSchema,
    state: z.literal('available'),
    url: z.url().refine((value) => {
      const u = new URL(value);
      return u.protocol === 'https:' && !u.username && !u.password;
    }),
  }),
  z.strictObject({ kind: MediaKindSchema, state: z.literal('expired') }),
  z.strictObject({ kind: MediaKindSchema, state: z.literal('unavailable') }),
]);
export const HomeworkReportSchema = z.strictObject({
  attachments: z.array(HomeworkAttachmentSchema).max(100),
});
export type HomeworkReport = z.infer<typeof HomeworkReportSchema>;
export const DeleteQuerySchema = z.strictObject({
  childId: z.string().min(1).max(128),
  date: BusinessDateSchema,
  id: z.string().min(1).max(128),
});
export type DeleteQuery = z.infer<typeof DeleteQuerySchema>;
export const MediaReadSchema = DeleteQuerySchema.extend({
  sessionId: z.string().min(1).max(128),
  index: z.number().int().min(0).max(99),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export const MediaContentSchema = z
  .strictObject({
    kind: z.enum(['image', 'audio']),
    mimeType: z.enum([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'audio/wav',
      'audio/mpeg',
      'audio/mp4',
      'audio/aac',
      'audio/amr',
      'audio/ogg',
      'audio/webm',
    ]),
    byteLength: z
      .number()
      .int()
      .positive()
      .max(16 * 1024 * 1024),
    data: z
      .string()
      .max(22369624)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  })
  .refine(
    (x) =>
      x.mimeType.startsWith(x.kind + '/') &&
      x.data.length > 0 &&
      x.data.length % 4 === 0 &&
      (x.data.length / 4) * 3 -
        (x.data.endsWith('==') ? 2 : x.data.endsWith('=') ? 1 : 0) ===
        x.byteLength,
  );
export type MediaContent = z.infer<typeof MediaContentSchema>;
export const DeletePreviewSchema = z.strictObject({
  ticketId: z.string(),
  secret: z.string(),
  expiresAt: z.number(),
  summary: z.strictObject({
    item: HomeworkSchema,
    child: z.string(),
    device: z.string(),
  }),
});
export type DeletePreview = z.infer<typeof DeletePreviewSchema>;
export const DeleteResultSchema = z.strictObject({
  status: z.enum(['accepted', 'failed', 'unknown']),
});

const ref = z.string().min(1).max(128);
const context = { contextRef: ref };
const paging = {
  offset: z.number().int().min(0).max(1000).default(0),
  limit: z.number().int().min(1).max(20).default(10),
};
const fields = {
  date: BusinessDateSchema,
  subject: SubjectSchema,
  content: z.string().trim().min(1).max(5000),
  targetMinutes: TargetMinutesSchema,
  submissionRequirement: SubmissionRequirementSchema,
};
export const AgentInputSchemas = {
  get_task_context: z.strictObject({}),
  list_homework: z
    .strictObject({
      ...context,
      date: BusinessDateSchema,
      endDate: BusinessDateSchema.optional(),
      ...paging,
    })
    .refine(
      (q) =>
        !q.endDate ||
        (q.endDate >= q.date &&
          (Date.parse(q.endDate) - Date.parse(q.date)) / 86400000 < 42),
    ),
  get_homework: z.strictObject({ ...context, taskRef: ref }),
  read_homework_attachment: z.strictObject({ ...context, attachmentRef: ref }),
  get_calendar_summary: z.strictObject({
    ...context,
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  }),
  list_drafts: z.strictObject({ ...context, ...paging }),
  create_draft: z.strictObject({
    ...context,
    requestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    ...fields,
  }),
  update_draft: z.strictObject({
    ...context,
    draftId: ref,
    expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
    ...fields,
  }),
  preview_task_action: z.discriminatedUnion('kind', [
    z.strictObject({ ...context, kind: z.literal('sync'), draftId: ref }),
    z.strictObject({ ...context, kind: z.literal('delete'), taskRef: ref }),
  ]),
  get_action_status: z.strictObject({ ...context, actionRef: ref }),
  cancel_task_action: z.strictObject({ ...context, actionRef: ref }),
};
export type AgentToolName = keyof typeof AgentInputSchemas;
export const AgentDraftWriteSchema = z.strictObject({
  draft: DraftSchema,
  expectedVersion: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export const AgentDraftResultSchema = z.strictObject({
  draft: DraftSchema,
  version: z.string(),
});
export const AgentDraftListSchema = z.strictObject({
  items: z.array(AgentDraftResultSchema),
});
