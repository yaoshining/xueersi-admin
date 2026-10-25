import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  BatchSyncPreviewSchema,
  BatchSyncResultSchema,
  SuccessSchema,
  type BatchSyncResult,
} from '@xueersi/contracts';
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
import { Summary, statusLabels, syncRequest } from './sync';
export function BatchSyncPage({
  href,
  demo,
}: {
  href: (path: string) => string;
  demo: boolean;
}) {
  const [params] = useSearchParams();
  const ids = params.getAll('draft');
  const navigate = useNavigate();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [consumed, setConsumed] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BatchSyncResult | null>(null);
  // 每次进入页面生成新票据；不缓存确认密钥，也不自动重试预览或提交。
  const [pageId] = useState(() => crypto.randomUUID());
  const preview = useQuery({
    queryKey: ['batch-preview', pageId],
    queryFn: () =>
      syncRequest(
        '/api/v1/sync/batch/preview',
        'POST',
        BatchSyncPreviewSchema,
        { draftIds: ids },
      ),
    enabled: !demo,
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  async function cancel() {
    if (!preview.data || busy) return;
    setBusy(true);
    try {
      await syncRequest(
        '/api/v1/sync/batch/preview/' +
          encodeURIComponent(preview.data.ticketId),
        'DELETE',
        SuccessSchema,
      );
      navigate(href('/drafts'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview.data || busy || consumed || demo) return;
    setConsumed(true);
    setBusy(true);
    setError('');
    try {
      const { ticketId, secret } = preview.data;
      setResult(
        await syncRequest(
          '/api/v1/sync/batch/confirm',
          'POST',
          BatchSyncResultSchema,
          { ticketId, secret, confirmed: true },
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      void client.invalidateQueries({ queryKey: ['drafts'] });
      void client.invalidateQueries({ queryKey: ['sync-records'] });
      void client.invalidateQueries({ queryKey: ['real-homework'] });
    }
  }
  const counts = (status: string) =>
    result?.items.filter((i) => i.status === status).length ?? 0;
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>批量同步作业</h1>
          <p>核对所选作业，一次确认后逐条发送。</p>
        </div>
        <Button
          variant="outline"
          size="touch"
          render={<Link to={href('/drafts')} />}
        >
          返回草稿列表
        </Button>
      </header>
      {demo ? (
        <p>演示模式不会发送真实作业。</p>
      ) : (
        <>
          {(error || preview.isError) && (
            <Alert variant="destructive">
              <AlertTitle>{error || preview.error?.message}</AlertTitle>
              <p className="mt-2">
                请先查看同步记录。已接受或结果不确定的作业不会自动重发。
              </p>
              <Button
                variant="outline"
                size="touch"
                render={<Link to={href('/sync')} />}
              >
                查看同步记录
              </Button>
            </Alert>
          )}
          {preview.isPending && (
            <p role="status">正在检查全部作业并生成预览…</p>
          )}
          {busy && (
            <p role="status">
              正在处理，请勿重复操作。逐条结果会保存在同步记录中。
            </p>
          )}
          {result && (
            <Alert>
              <AlertTitle>批量同步结果</AlertTitle>
              <p role="status" className="mt-2">
                已接受 {counts('accepted')} 条 · 待核对 {counts('unknown')} 条 ·
                失败 {counts('failed')} 条 · 未发送 {counts('not_sent')} 条
              </p>
              <p className="mt-2">
                官方接受不等于学习机已接收。遇到失败或不确定结果已停止后续发送。
              </p>
            </Alert>
          )}
          {preview.data && (
            <div className="mt-6 flex flex-col gap-5">
              {preview.data.summaries.map((summary, index) => {
                const item = result?.items.find(
                  (i) => i.draftId === summary.draft.id,
                );
                return (
                  <Card key={summary.draft.id}>
                    <CardHeader>
                      <CardTitle>
                        作业 {index + 1} / {preview.data.summaries.length}
                      </CardTitle>
                      {item && (
                        <CardDescription>
                          <Badge variant="secondary">
                            {item.status === 'not_sent'
                              ? '未发送 · 需要重新预览确认'
                              : statusLabels[item.status]}
                          </Badge>
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <Summary summary={summary} />
                    </CardContent>
                  </Card>
                );
              })}
              {!consumed && (
                <Card>
                  <CardHeader>
                    <CardTitle>确认本次批量同步</CardTitle>
                    <CardDescription>
                      预览于{' '}
                      {new Date(preview.data.expiresAt).toLocaleTimeString(
                        'zh-CN',
                      )}{' '}
                      失效。确认后将创建真实作业，已发送条目无法在本页撤销。
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="flex-wrap gap-3">
                    <Button
                      size="touch"
                      disabled={busy}
                      onClick={() => void confirm()}
                    >
                      确认同步这 {preview.data.summaries.length} 条作业
                    </Button>
                    <Button
                      size="touch"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void cancel()}
                    >
                      取消批量同步
                    </Button>
                  </CardFooter>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
