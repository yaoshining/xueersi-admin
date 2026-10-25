import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DeletePreviewSchema,
  DeleteResultSchema,
  HomeworkReportSchema,
  RealHomeworkResponseSchema,
  type Homework,
  type DeletePreview,
  type HomeworkReport,
} from '@xueersi/contracts';
import { Button } from '@/components/ui/button';
import { getJson } from '@/lib/api';
import { requirementOptions } from './drafts';
export type HomeworkContext = {
  childId: string;
  sessionId: string;
  canDelete: boolean;
};
async function deletionRequest(path: string, body: unknown) {
  const r = await fetch(`/api/v1/homework/delete/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Local-Request': '1' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok)
    throw Error(
      '作业状态可能已变化，或存在待核对的删除记录。请刷新列表后核对。',
    );
  return r.json();
}
function Attachment({
  item,
  index,
}: {
  item: HomeworkReport['attachments'][number];
  index: number;
}) {
  const [failed, setFailed] = useState(false);
  const name =
    { image: '图片', audio: '音频', video: '视频' }[item.kind] +
    ' ' +
    (index + 1);
  if (item.state !== 'available')
    return (
      <p>
        {name}：{item.state === 'expired' ? '附件已过期' : '附件暂不支持查看'}
      </p>
    );
  if (failed)
    return <p role="status">{name}加载失败，链接可能已过期，请刷新报告。</p>;
  return (
    <figure className="flex flex-col gap-2 min-w-0">
      <figcaption className="text-sm text-muted-foreground">{name}</figcaption>
      {item.kind === 'image' ? (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`查看${name}原图`}
        >
          <img
            src={item.url}
            alt={`孩子提交的${name}`}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setFailed(true)}
            className="w-full max-h-80 rounded-lg object-contain bg-muted"
          />
        </a>
      ) : item.kind === 'audio' ? (
        <audio
          aria-label={name}
          controls
          preload="none"
          src={item.url}
          onError={() => setFailed(true)}
          className="w-full max-w-full"
        />
      ) : (
        <video
          aria-label={name}
          controls
          playsInline
          preload="none"
          src={item.url}
          onError={() => setFailed(true)}
          className="w-full max-h-80 rounded-lg"
        />
      )}
    </figure>
  );
}
export function HomeworkActions({
  item,
  context,
  onDeleted,
}: {
  item: Homework;
  context: HomeworkContext;
  onDeleted: () => void;
}) {
  const [preview, setPreview] = useState<DeletePreview | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [outcome, setOutcome] = useState(false);
  const client = useQueryClient();
  const params = new URLSearchParams({
    id: item.id,
    childId: context.childId,
    date: item.date,
  });
  const report = useQuery({
    queryKey: ['homework-report', context.sessionId, item.id, item.date],
    queryFn: () =>
      getJson(`/api/v1/homework/report?${params}`, HomeworkReportSchema, 90000),
    enabled: item.status === 'completed',
    retry: false,
    gcTime: 0,
  });
  async function prepare() {
    setBusy(true);
    setMessage('');
    try {
      setPreview(
        DeletePreviewSchema.parse(
          await deletionRequest('preview', Object.fromEntries(params)),
        ),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '无法准备删除');
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview || busy) return;
    setBusy(true);
    setMessage('');
    const p = preview;
    setPreview(null);
    setOutcome(true);
    try {
      const result = DeleteResultSchema.parse(
        await deletionRequest('confirm', {
          ticketId: p.ticketId,
          secret: p.secret,
          confirmed: true,
        }),
      );
      if (result.status === 'accepted') {
        setMessage('官方已接受删除，正在回读核对…');
        try {
          const list = await getJson(
            `/api/v1/homework?${new URLSearchParams({ childId: context.childId, date: item.date })}`,
            RealHomeworkResponseSchema,
            90000,
          );
          if (list.items.some((x) => x.id === item.id)) {
            setMessage('官方已接受删除，列表仍有此作业，请稍后刷新核对。');
          } else {
            await client.invalidateQueries({ queryKey: ['real-homework'] });
            onDeleted();
          }
        } catch {
          setMessage('官方已接受删除，暂未完成回读，请刷新列表核对。');
        }
      } else
        setMessage(
          result.status === 'unknown'
            ? '删除结果待核对，请刷新官方列表；不要重复删除。'
            : '官方拒绝删除，作业仍保留。',
        );
    } catch {
      setMessage('未能确认删除结果，请刷新列表核对；不要重复删除。');
    } finally {
      setBusy(false);
    }
  }
  function cancel() {
    if (preview)
      void fetch(
        `/api/v1/homework/delete/preview/${encodeURIComponent(preview.ticketId)}`,
        { method: 'DELETE', headers: { 'X-Local-Request': '1' } },
      ).catch(() => {});
    setPreview(null);
  }
  return (
    <div className="flex flex-col gap-4">
      {item.status === 'completed' && (
        <section aria-label="孩子提交的内容" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">孩子提交的内容</h3>
            <Button
              variant="outline"
              size="sm"
              disabled={report.isFetching}
              onClick={() => void report.refetch()}
            >
              刷新报告
            </Button>
          </div>
          {report.isPending ? (
            <p role="status">正在读取完成报告…</p>
          ) : report.isError ? (
            <p role="alert">完成报告读取失败，请刷新报告重试。</p>
          ) : report.data.attachments.length === 0 ? (
            <p className="text-muted-foreground">暂无提交附件</p>
          ) : (
            report.data.attachments.map((file, i) => (
              <Attachment
                key={`${report.dataUpdatedAt}-${i}`}
                item={file}
                index={i}
              />
            ))
          )}
        </section>
      )}
      {item.status === 'pending' &&
        context.canDelete &&
        !outcome &&
        !preview && (
          <Button
            variant="destructive"
            size="touch"
            disabled={busy}
            onClick={() => void prepare()}
          >
            {busy ? '正在核对…' : '删除这条作业'}
          </Button>
        )}
      {preview && (
        <section
          aria-label="确认删除作业"
          className="rounded-xl border border-destructive/40 p-4 flex flex-col gap-4"
        >
          <h3 className="font-medium">确认删除这条作业？</h3>
          <p className="text-sm text-muted-foreground">
            删除后不可恢复，请核对孩子、设备和作业内容。
          </p>
          <dl className="flex flex-col gap-2 text-sm">
            <div>
              <dt>孩子 / 设备</dt>
              <dd>
                {preview.summary.child} · {preview.summary.device}
              </dd>
            </div>
            <div>
              <dt>日期</dt>
              <dd>{preview.summary.item.date}</dd>
            </div>
            <div>
              <dt>作业内容</dt>
              <dd className="whitespace-pre-wrap break-words">
                {preview.summary.item.content}
              </dd>
            </div>
            <div>
              <dt>目标时长 / 提交要求</dt>
              <dd>
                {preview.summary.item.targetMinutes == null
                  ? '未提供'
                  : preview.summary.item.targetMinutes === 0
                    ? '不限'
                    : `${preview.summary.item.targetMinutes} 分钟`}{' '}
                ·{' '}
                {requirementOptions.find(
                  (o) => o.value === preview.summary.item.submissionRequirement,
                )?.label ?? '未提供'}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="touch"
              onClick={cancel}
              disabled={busy}
            >
              取消删除
            </Button>
            <Button
              variant="destructive"
              size="touch"
              disabled={busy}
              onClick={() => void confirm()}
            >
              确认永久删除
            </Button>
          </div>
        </section>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
