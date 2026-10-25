import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, mutateJson } from '@/lib/api';
import { Link, useNavigate } from 'react-router';
import {
  DraftSchema,
  DraftListSchema,
  SuccessSchema,
  SyncRecordsSchema,
  type SyncRecord,
  type Draft,
} from '@xueersi/contracts';
import { ArrowLeft, FileText, Plus, Trash2 } from 'lucide-react';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
  FieldDescription,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Choice, StatePanel } from '@/components/workbench/shared';
import { children, dateLabel, readDrafts, subjects } from './model';
function loadLegacyDrafts() {
  try {
    return { items: readDrafts(localStorage), error: '' };
  } catch (error) {
    return {
      items: [] as Draft[],
      error: error instanceof Error ? error.message : '草稿数据无法读取',
    };
  }
}
export const durationOptions = [
  { value: 'unset', label: '未设置' },
  { value: '0', label: '不限' },
  ...[10, 15, 20, 30, 40, 50, 60].map((value) => ({
    value: String(value),
    label: `${value} 分钟`,
  })),
];
export const requirementOptions = [
  { value: 'unset', label: '未设置' },
  { value: 'none', label: '不限' },
  { value: 'image', label: '图片' },
  { value: 'audio', label: '音频' },
  { value: 'video', label: '视频' },
  { value: 'audio-or-video', label: '音频或视频' },
];
function useDrafts() {
  return useQuery({
    queryKey: ['drafts'],
    queryFn: () => getJson('/api/v1/drafts', DraftListSchema),
    staleTime: 0,
    refetchInterval: 5000,
  });
}
export function DraftList({
  href,
  child,
  childLabel,
  demo = false,
}: {
  href: (path: string) => string;
  child?: string;
  childLabel?: string;
  demo?: boolean;
}) {
  const navigate = useNavigate();
  const [view, setView] = useState('pending');
  const [selection, setSelection] = useState<string[]>([]);
  const records = useQuery({
    queryKey: ['sync-records'],
    queryFn: () => getJson('/api/v1/sync/records', SyncRecordsSchema),
    enabled: !demo,
    refetchInterval: 5000,
    staleTime: 0,
  });
  const synced = (demo ? [] : (records.data?.items ?? [])).filter(
    (r) =>
      r.status === 'accepted' && (!child || r.summary.draft.childId === child),
  );
  function state(draft: Draft) {
    return (demo ? [] : (records.data?.items ?? [])).find(
      (r) =>
        JSON.stringify(DraftSchema.parse(r.summary.draft)) ===
          JSON.stringify(DraftSchema.parse(draft)) && r.status !== 'failed',
    )?.status;
  }
  const query = useDrafts();
  const [legacy] = useState(loadLegacyDrafts);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(false);
  const loaded = {
    items: (query.data?.items ?? []).filter(
      (d) => (!child || d.childId === child) && state(d) !== 'accepted',
    ),
    error: actionError || (query.isError ? '草稿读取失败，请检查本机服务' : ''),
  };
  const eligible = loaded.items.filter((d) => !state(d)).map((d) => d.id);
  const selected = selection.filter((id) => eligible.includes(id));
  const canSelect =
    !demo && records.isSuccess && !records.isError && !query.isError && !busy;
  function batch() {
    if (!canSelect || !selected.length) return;
    const url = new URL(href('/sync/batch'), window.location.origin);
    url.searchParams.delete('draft');
    selected.forEach((id) => url.searchParams.append('draft', id));
    navigate(url.pathname + url.search);
  }
  const [confirm, setConfirm] = useState<string | null>(null);
  async function remove(id: string) {
    setBusy(true);
    setActionError('');
    try {
      await mutateJson(
        `/api/v1/drafts/${encodeURIComponent(id)}`,
        'DELETE',
        SuccessSchema,
      );
      await query.refetch();
      setConfirm(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '无法删除草稿');
    } finally {
      setBusy(false);
    }
  }
  async function importLegacy() {
    setBusy(true);
    setActionError('');
    try {
      await mutateJson('/api/v1/drafts/import', 'POST', SuccessSchema, {
        items: legacy.items,
      });
      await query.refetch();
      setImported(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '无法导入草稿');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>作业草稿</h1>
          <p>先整理，再确认。草稿保存在本机服务。</p>
        </div>
        <Button size="touch" render={<Link to={href('/drafts/new')} />}>
          <Plus data-icon="inline-start" />
          新建草稿
        </Button>
      </header>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <ToggleGroup
          aria-label="作业列表分类"
          value={[view]}
          onValueChange={(values) => {
            if (values[0]) {
              setView(String(values[0]));
              setSelection([]);
            }
          }}
          variant="outline"
        >
          <ToggleGroupItem className="min-h-11 px-4" value="pending">
            待同步（{loaded.items.length}）
          </ToggleGroupItem>
          <ToggleGroupItem className="min-h-11 px-4" value="synced">
            已同步（{synced.length}）
          </ToggleGroupItem>
        </ToggleGroup>
        {view === 'pending' && (
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="批量操作"
          >
            <Button
              variant="outline"
              size="touch"
              disabled={!canSelect || !eligible.length}
              onClick={() =>
                setSelection(selected.length ? [] : eligible.slice(0, 20))
              }
            >
              {selected.length ? '取消全选' : '全选可同步草稿'}
            </Button>
            <Button
              size="touch"
              disabled={!canSelect || !selected.length}
              onClick={batch}
            >
              批量同步（{selected.length}）
            </Button>
          </div>
        )}
      </div>
      {view === 'pending' && (
        <p className="page-note mb-5">
          每批最多 20 条，核对全部内容后一次确认。待核对的作业不能重复同步。
        </p>
      )}
      {!demo && records.isError && (
        <Alert variant="destructive">
          <AlertTitle>同步状态读取失败，暂时不能同步，请重新加载。</AlertTitle>
          <Button
            variant="outline"
            size="touch"
            onClick={() => void records.refetch()}
          >
            重新读取同步状态
          </Button>
        </Alert>
      )}
      {view === 'synced' ? (
        <section aria-label="已同步作业">
          {records.isPending && !demo ? (
            <p role="status">正在读取已同步作业…</p>
          ) : records.isError && !demo ? null : synced.length ? (
            <div className="draft-grid">
              {synced.map((record) => (
                <SyncedDraft key={record.id} record={record} />
              ))}
            </div>
          ) : (
            <StatePanel
              title="暂无已同步作业"
              description={
                demo
                  ? '演示模式不显示真实同步记录。'
                  : '成功提交的作业会保留在这里，学习机接收情况仍需核对。'
              }
            />
          )}
        </section>
      ) : (
        <>
          {(legacy.items.length > 0 || legacy.error) && (
            <Alert>
              <AlertTitle>
                {legacy.error ||
                  (imported
                    ? '已导入，浏览器原件仍保留作为备份'
                    : `发现 ${legacy.items.length} 条浏览器旧草稿`)}
              </AlertTitle>
              {!legacy.error && !imported && (
                <Button
                  size="touch"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void importLegacy()}
                >
                  导入到本机后端
                </Button>
              )}
            </Alert>
          )}
          {query.isPending && <p role="status">正在读取草稿…</p>}
          {loaded.error && (
            <Alert variant="destructive">
              <AlertTitle>{loaded.error}</AlertTitle>
              <Button
                size="touch"
                variant="outline"
                onClick={() => {
                  setActionError('');
                  void query.refetch();
                }}
              >
                重新加载
              </Button>
            </Alert>
          )}
          {!query.isPending && !loaded.error && loaded.items.length === 0 ? (
            <Card>
              <CardContent>
                <StatePanel
                  title="还没有草稿"
                  description="把微信群里的作业内容整理成草稿，核对孩子、科目与日期。"
                />
              </CardContent>
            </Card>
          ) : (
            <div className="draft-grid">
              {loaded.items.map((draft) => (
                <Card key={draft.id}>
                  <CardHeader>
                    <CardTitle>
                      <h2 className="flex items-center gap-2">
                        <FileText aria-hidden="true" />
                        {subjects[draft.subject]}作业
                      </h2>
                    </CardTitle>
                    <CardDescription>
                      {children.find((child) => child.value === draft.childId)
                        ?.label ??
                        childLabel ??
                        '已保存的孩子'}{' '}
                      · {dateLabel(draft.date)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="task-content whitespace-pre-wrap">
                      {draft.content}
                    </p>
                    <p className="page-note">
                      目标时长：
                      {
                        durationOptions.find(
                          (item) =>
                            item.value ===
                            String(draft.targetMinutes ?? 'unset'),
                        )?.label
                      }{' '}
                      · 提交要求：
                      {
                        requirementOptions.find(
                          (item) =>
                            item.value ===
                            (draft.submissionRequirement ?? 'unset'),
                        )?.label
                      }
                    </p>
                    <Badge variant="secondary" className="mt-4">
                      {state(draft)
                        ? '待核对 · 请在学习机核对，勿重复提交'
                        : '待同步 · 本机草稿'}
                    </Badge>
                  </CardContent>
                  <CardFooter className="flex-wrap gap-2">
                    <Toggle
                      aria-label="选择草稿"
                      variant="outline"
                      className="min-h-11 px-4"
                      pressed={selected.includes(draft.id)}
                      disabled={
                        !canSelect ||
                        !!state(draft) ||
                        (!selected.includes(draft.id) && selected.length >= 20)
                      }
                      onPressedChange={(pressed) =>
                        setSelection((ids) =>
                          pressed
                            ? [...ids, draft.id]
                            : ids.filter((id) => id !== draft.id),
                        )
                      }
                    >
                      {selected.includes(draft.id) ? '已选择' : '选择'}
                    </Toggle>
                    <Button
                      variant="outline"
                      size="touch"
                      render={
                        <Link
                          to={href(
                            `/drafts/${encodeURIComponent(draft.id)}/edit`,
                          )}
                        />
                      }
                    >
                      编辑草稿
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-touch"
                      aria-label="删除草稿"
                      onClick={() => setConfirm(draft.id)}
                    >
                      <Trash2 />
                    </Button>
                    {!state(draft) && (
                      <Button
                        size="touch"
                        disabled={busy || (!demo && !records.isSuccess)}
                        render={
                          <Link
                            to={
                              href('/sync') +
                              '&draft=' +
                              encodeURIComponent(draft.id)
                            }
                          />
                        }
                      >
                        同步到学习机
                      </Button>
                    )}
                    {confirm === draft.id && (
                      <div
                        className="delete-confirm"
                        role="group"
                        aria-label="删除确认"
                      >
                        <p>确定删除此草稿？此操作不可撤销。</p>
                        <Button
                          variant="destructive"
                          size="touch"
                          disabled={busy}
                          onClick={() => void remove(draft.id)}
                        >
                          确认删除
                        </Button>
                        <Button
                          variant="outline"
                          size="touch"
                          onClick={() => setConfirm(null)}
                        >
                          取消
                        </Button>
                      </div>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
          <p className="page-note">
            草稿由此 Mac 的本机服务保存，提交结果请查看同步记录。
          </p>
        </>
      )}
    </>
  );
}
function SyncedDraft({ record }: { record: SyncRecord }) {
  const draft = record.summary.draft;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{subjects[draft.subject]}作业</CardTitle>
        <CardDescription>
          {record.summary.child} · {dateLabel(draft.date)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="task-content whitespace-pre-wrap break-words">
          {draft.content}
        </p>
        <p className="page-note">
          目标时长：
          {
            durationOptions.find(
              (o) => o.value === String(draft.targetMinutes ?? 'unset'),
            )?.label
          }{' '}
          · 提交要求：
          {
            requirementOptions.find(
              (o) => o.value === (draft.submissionRequirement ?? 'unset'),
            )?.label
          }
        </p>
        <Badge variant="secondary">已同步 · 官方已接受</Badge>
        <p className="text-sm text-muted-foreground">
          {record.summary.device} ·{' '}
          {new Date(record.createdAt).toLocaleString('zh-CN')}
          <br />
          学习机接收情况待核对
        </p>
      </CardContent>
    </Card>
  );
}
function DraftEditorForm({
  href,
  id,
  date,
  child,
  loaded,
  childOptions,
}: {
  href: (path: string) => string;
  id?: string;
  date: string;
  child: string;
  loaded: { items: Draft[]; error: string };
  childOptions: { value: string; label: string }[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const existing = id ? loaded.items.find((item) => item.id === id) : undefined;
  const [values, setValues] = useState<Draft>(
    () =>
      existing ?? {
        id: crypto.randomUUID(),
        childId: child,
        subject: 'chinese',
        date,
        content: '',
        targetMinutes: 0,
        submissionRequirement: 'none',
      },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
    setSaveError('');
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = DraftSchema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        next[field] =
          field === 'content'
            ? values.content.trim()
              ? '作业内容不能超过 5000 字'
              : '请输入作业内容'
            : field === 'date'
              ? '请选择有效日期'
              : '请选择有效选项';
      }
      setErrors(next);
      return;
    }
    setSaving(true);
    try {
      await mutateJson(
        id ? `/api/v1/drafts/${encodeURIComponent(id)}` : '/api/v1/drafts',
        id ? 'PUT' : 'POST',
        DraftSchema,
        parsed.data,
      );
      await queryClient.invalidateQueries({ queryKey: ['drafts'] });
      navigate(href('/drafts'));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '无法保存草稿');
      setSaving(false);
    }
  }
  if (loaded.error || (id && !existing))
    return (
      <StatePanel
        title={loaded.error || '未找到此草稿'}
        description="请返回草稿列表检查。"
      >
        <Button size="touch" render={<Link to={href('/drafts')} />}>
          返回草稿列表
        </Button>
      </StatePanel>
    );
  return (
    <>
      <header className="page-heading">
        <div>
          <Button
            variant="ghost"
            size="touch"
            render={<Link to={href('/drafts')} />}
          >
            <ArrowLeft data-icon="inline-start" />
            返回草稿
          </Button>
          <h1>{id ? '编辑作业草稿' : '整理今天的作业'}</h1>
          <p>把群消息整理清楚，确认后保存。</p>
        </div>
      </header>
      <Card className="draft-editor">
        <CardHeader>
          <CardTitle>作业内容</CardTitle>
          <CardDescription>保存在本机服务，不会发送到学习机。</CardDescription>
        </CardHeader>
        <CardContent>
          <form id="draft-form" onSubmit={submit} noValidate>
            <FieldGroup>
              <Field data-invalid={!!errors.childId}>
                <FieldLabel htmlFor="draft-child">孩子</FieldLabel>
                <Choice
                  id="draft-child"
                  label="草稿孩子"
                  value={values.childId}
                  onChange={(value) => update('childId', value)}
                  options={
                    childOptions.some((item) => item.value === values.childId)
                      ? childOptions
                      : [
                          {
                            value: values.childId,
                            label: '已保存的孩子（未连接）',
                          },
                          ...childOptions,
                        ]
                  }
                />
              </Field>
              <Field data-invalid={!!errors.subject}>
                <FieldLabel htmlFor="draft-subject">科目</FieldLabel>
                <Choice
                  id="draft-subject"
                  label="科目"
                  value={values.subject}
                  onChange={(value) =>
                    update('subject', value as Draft['subject'])
                  }
                  options={Object.entries(subjects).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
              </Field>
              <Field data-invalid={!!errors.date}>
                <FieldLabel htmlFor="draft-date">作业日期</FieldLabel>
                <Input
                  id="draft-date"
                  type="date"
                  value={values.date}
                  onChange={(event) => update('date', event.target.value)}
                  aria-invalid={!!errors.date}
                  aria-describedby={errors.date ? 'date-error' : undefined}
                />
                {errors.date && (
                  <FieldError id="date-error">{errors.date}</FieldError>
                )}
              </Field>
              <Field data-invalid={!!errors.content}>
                <FieldLabel htmlFor="draft-content">作业内容</FieldLabel>
                <Textarea
                  id="draft-content"
                  rows={7}
                  value={values.content}
                  placeholder="例如：阅读一篇短文，记录三个新词。"
                  onChange={(event) => update('content', event.target.value)}
                  aria-invalid={!!errors.content}
                  aria-describedby={
                    errors.content ? 'content-error' : 'content-help'
                  }
                />
                <FieldDescription id="content-help">
                  同步最多 300 字；草稿可暂存 5000 字 · {values.content.length}{' '}
                  / 5000 字
                </FieldDescription>
                {errors.content && (
                  <FieldError id="content-error">{errors.content}</FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="draft-duration">完成目标时长</FieldLabel>
                <Choice
                  id="draft-duration"
                  label="完成目标时长"
                  value={String(values.targetMinutes ?? 'unset')}
                  onChange={(value) =>
                    update(
                      'targetMinutes',
                      value === 'unset'
                        ? null
                        : (Number(value) as Draft['targetMinutes']),
                    )
                  }
                  options={durationOptions}
                />
                <FieldDescription>为这项作业设定计划用时。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="draft-requirement">
                  作业提交要求
                </FieldLabel>
                <Choice
                  id="draft-requirement"
                  label="作业提交要求"
                  value={values.submissionRequirement ?? 'unset'}
                  onChange={(value) =>
                    update(
                      'submissionRequirement',
                      value === 'unset'
                        ? null
                        : (value as Draft['submissionRequirement']),
                    )
                  }
                  options={requirementOptions}
                />
                <FieldDescription>
                  记录孩子完成作业时需要提交的形式。
                </FieldDescription>
              </Field>
              {saveError && (
                <Alert variant="destructive">
                  <AlertTitle>{saveError}</AlertTitle>
                </Alert>
              )}
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="flex-wrap gap-3">
          <Button
            size="touch"
            type="submit"
            form="draft-form"
            disabled={saving}
          >
            {saving ? '正在保存…' : '保存草稿'}
          </Button>
          <Button
            variant="outline"
            size="touch"
            render={<Link to={href('/drafts')} />}
          >
            取消
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}

export function DraftEditor(props: {
  href: (path: string) => string;
  id?: string;
  date: string;
  child: string;
  childOptions?: { value: string; label: string }[];
}) {
  const query = useDrafts();
  if (query.isPending) return <p role="status">正在读取草稿…</p>;
  if (query.isError)
    return (
      <StatePanel title="草稿读取失败" description="请确认本机服务已启动。">
        <Button size="touch" onClick={() => void query.refetch()}>
          重新加载
        </Button>
      </StatePanel>
    );
  return (
    <DraftEditorForm
      {...props}
      childOptions={props.childOptions ?? children}
      loaded={{ items: query.data.items, error: '' }}
    />
  );
}
