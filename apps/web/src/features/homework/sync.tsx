import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import {
  SyncPreviewSchema,
  SyncRecordSchema,
  SyncRecordsSchema,
  SuccessSchema,
  type SyncPreview,
  type SyncRecord,
  type SyncSummary,
} from '@xueersi/contracts';
import { getJson } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { durationOptions, requirementOptions } from './drafts';
const messages: Record<string, string> = {
  DRAFT_MISSING: '草稿已不存在，请返回列表。',
  TARGET_MISMATCH: '草稿孩子与当前授权孩子不一致，请核对账号和草稿。',
  INVALID_SYNC_DRAFT:
    '请检查草稿：内容最多 300 字、日期为今天至未来 30 天，并设置时长和提交要求。',
  DUPLICATE_SYNC: '相同作业已有发送记录，请先在学习机核对，系统不会重复发送。',
  STALE_PREVIEW: '草稿、目标或会话已变化，请重新预览。',
  INVALID_CONFIRMATION: '本次确认已失效，请重新预览。',
  SYNC_NOT_CONFIGURED: '本机尚未配置作业同步，未发送作业。',
  SYNC_PRECHECK_READ_FAILED: '预检时无法读取作业，请检查账号连接；未发送作业。',
  SYNC_PRECHECK_CONFIG_FAILED:
    '预检时无法获取作业或设备配置；未发送作业，请稍后重新预览。',
  SYNC_PRECHECK_TIMEOUT: '提交前检查超时，未发送作业，请重新预览。',
  SYNC_PRECHECK_SESSION_CHANGED:
    '预检期间账号或目标发生变化，未发送作业，请重新预览。',
  SYNC_PRECHECK_FAILED: '提交前检查未通过，请核对账号连接、设备和作业配置。',
  INVALID_BATCH: '请选择 1–20 条不同的草稿。',
  TOO_MANY_PREVIEWS: '预览过多，请稍后再试。',
};
export async function syncRequest<T>(
  path: string,
  method: 'POST' | 'DELETE',
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  try {
    const response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Local-Request': '1' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(90000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        messages[result.error?.code] ?? '请求未完成，请查看同步记录。',
      );
    return schema.parse(result);
  } catch (error) {
    if (
      error instanceof Error &&
      Object.values(messages).includes(error.message)
    )
      throw error;
    throw new Error('连接中断，请先查看同步记录并核对学习机，不要重复提交。', {
      cause: error,
    });
  }
}
export const statusLabels = {
  sending: '发送中，请勿重复提交',
  accepted: '官方已接受，学习机接收情况待核对',
  failed: '官方拒绝，可检查后重新预览',
  unknown: '结果不确定，请在学习机核对，勿重复提交',
};
export function Summary({ summary }: { summary: SyncSummary }) {
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          ['孩子', summary.child],
          ['目标学习机', summary.device],
          ['学科 / 作业类型', summary.typeLabel],
          ['作业日期', summary.draft.date],
          [
            '目标时长',
            durationOptions.find(
              (o) => o.value === String(summary.draft.targetMinutes),
            )?.label,
          ],
          [
            '提交要求',
            requirementOptions.find(
              (o) => o.value === summary.draft.submissionRequirement,
            )?.label,
          ],
        ].map(([key, value]) => (
          <div key={key}>
            <dt className="text-sm text-muted-foreground">{key}</dt>
            <dd className="mt-1 break-words font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="text-sm text-muted-foreground">完整作业内容</p>
        <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-muted p-4">
          {summary.draft.content}
        </p>
      </div>
    </div>
  );
}
export function SyncPage({
  href,
  demo,
}: {
  href: (path: string) => string;
  demo: boolean;
}) {
  const [params] = useSearchParams(),
    draftId = params.get('draft');
  const [preview, setPreview] = useState<SyncPreview | null>(null),
    [result, setResult] = useState<SyncRecord | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const records = useQuery({
    queryKey: ['sync-records'],
    queryFn: () => getJson('/api/v1/sync/records', SyncRecordsSchema),
    enabled: !demo,
    refetchInterval: 5000,
  });
  async function generate() {
    if (!draftId || demo) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setPreview(
        await syncRequest('/api/v1/sync/preview', 'POST', SyncPreviewSchema, {
          draftId,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!preview) return;
    setBusy(true);
    try {
      await syncRequest(
        '/api/v1/sync/preview/' + encodeURIComponent(preview.ticketId),
        'DELETE',
        SuccessSchema,
      );
      setPreview(null);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview || demo) return;
    setBusy(true);
    setError('');
    const current = preview;
    setPreview(null);
    try {
      setResult(
        await syncRequest('/api/v1/sync/confirm', 'POST', SyncRecordSchema, {
          ticketId: current.ticketId,
          secret: current.secret,
          confirmed: true,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      void records.refetch();
    }
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>同步作业</h1>
          <p>先核对完整内容，确认后发送到所选学习机。</p>
        </div>
        <Button
          variant="outline"
          size="touch"
          render={<Link to={href('/drafts')} />}
        >
          查看作业草稿
        </Button>
      </header>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}
      {draftId && (
        <Card>
          <CardHeader>
            <CardTitle>{preview ? '提交前确认' : '作业同步'}</CardTitle>
            <CardDescription>
              {demo
                ? '演示模式不会发送真实作业。'
                : '每次确认只提交一条；正文上限 300 字，作业类型采用当前学科的「其他」。'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preview ? (
              <>
                <Summary summary={preview.summary} />
                <p className="page-note">
                  预览于{' '}
                  {new Date(preview.expiresAt).toLocaleTimeString('zh-CN')}{' '}
                  失效。确认后将创建真实作业，本页不提供撤销。
                </p>
              </>
            ) : result ? (
              <div role="status">
                <Badge variant="secondary">{statusLabels[result.status]}</Badge>
                <div className="mt-5">
                  <Summary summary={result.summary} />
                </div>
              </div>
            ) : (
              <p>
                {busy
                  ? '正在处理，请勿重复操作…'
                  : '点击生成预览，核对孩子、设备及所有作业选项。'}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex-wrap gap-3">
            {preview ? (
              <>
                <Button
                  size="touch"
                  disabled={busy || demo}
                  onClick={() => void confirm()}
                >
                  确认提交这条作业
                </Button>
                <Button
                  variant="outline"
                  size="touch"
                  disabled={busy}
                  onClick={() => void cancel()}
                >
                  取消本次提交
                </Button>
              </>
            ) : (
              !result && (
                <Button
                  size="touch"
                  disabled={busy || demo}
                  onClick={() => void generate()}
                >
                  生成提交预览
                </Button>
              )
            )}
          </CardFooter>
        </Card>
      )}
      <section aria-label="同步记录" className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">同步记录</h2>
        {demo ? (
          <p>演示模式不显示真实同步记录。</p>
        ) : records.isError ? (
          <Alert variant="destructive">
            <AlertTitle>同步记录读取失败，请检查本机服务后刷新。</AlertTitle>
          </Alert>
        ) : records.isPending ? (
          <p role="status">正在读取记录…</p>
        ) : !records.data.items.length ? (
          <p className="text-muted-foreground">
            还没有真实同步记录。可从草稿列表选择一条作业预览。
          </p>
        ) : (
          records.data.items.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <CardTitle>{statusLabels[item.status]}</CardTitle>
                <CardDescription>
                  {new Date(item.createdAt).toLocaleString('zh-CN')} ·{' '}
                  {item.summary.child} · {item.summary.device}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap break-words">
                  {item.summary.draft.content}
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </>
  );
}
