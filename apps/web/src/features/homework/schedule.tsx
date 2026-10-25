import { HomeworkActions, type HomeworkContext } from './report-and-delete';
import { requirementOptions } from './drafts';
import { BookScene } from '@/components/workbench/book-scene';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import type { Homework } from '@xueersi/contracts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  CardAction,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { StatePanel, SyncStatus } from '@/components/workbench/shared';
import { cn } from '@/lib/utils';
import {
  businessToday,
  dateLabel,
  shiftDate,
  subjects,
  weekDates,
} from './model';

function DetailCard({
  item,
  back,
  close,
  demo,
  context,
  onDeleted,
}: {
  item: Homework;
  back: string;
  close: () => void;
  demo: boolean;
  context?: HomeworkContext;
  onDeleted: () => void;
}) {
  const title =
    item.subject === 'chinese' ? '阅读作业' : `${subjects[item.subject]}作业`;
  return (
    <section aria-label="作业详情" className="detail-region">
      <div className="mobile-detail-heading">
        <Button
          variant="ghost"
          size="icon-touch"
          render={<Link to={back} />}
          aria-label="返回作业列表"
        >
          <ArrowLeft />
        </Button>
        <span>作业详情</span>
      </div>
      <div className="mobile-detail-title">
        <h1>{title}</h1>
        <div className="flex gap-2">
          <Badge variant="secondary">{subjects[item.subject]}</Badge>
          <Badge variant="outline">
            {item.status === 'completed' ? '已完成' : '待完成'}
          </Badge>
        </div>
      </div>
      <Card className="task-detail-card">
        <CardHeader>
          <CardTitle>
            <h2 className="detail-heading">
              <BookOpen aria-hidden="true" />
              {title}
            </h2>
          </CardTitle>
          <CardAction className="desktop-detail-close">
            <Button
              variant="ghost"
              size="icon-touch"
              aria-label="关闭详情"
              onClick={close}
            >
              <X />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="detail-body">
          <Separator />
          <dl>
            {[
              ['科目', subjects[item.subject]],
              ['日期', dateLabel(item.date)],
              ['状态', item.status === 'completed' ? '已完成' : '待完成'],
              [
                '目标时长',
                item.targetMinutes == null
                  ? '未提供或暂不支持'
                  : item.targetMinutes === 0
                    ? '不限'
                    : `${item.targetMinutes} 分钟`,
              ],
              [
                '提交要求',
                requirementOptions.find(
                  (option) => option.value === item.submissionRequirement,
                )?.label ?? '未提供或暂不支持',
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <Separator />
          <div>
            <p className="detail-caption">内容</p>
            <p className="task-content">{item.content}</p>
            {demo && item.id === 'demo-reading' && (
              <p className="detail-requirement">
                要求：认真阅读短文，找出三个不熟悉的词语，写下词义并用自己的话造句。
              </p>
            )}
          </div>
          {!demo && context && (
            <HomeworkActions
              key={`${context.sessionId}-${item.id}-${item.date}`}
              item={item}
              context={context}
              onDeleted={onDeleted}
            />
          )}
        </CardContent>
        <CardFooter>
          <span className="detail-caption">来源</span>
          <span>
            {demo
              ? '合成示例 · 由家长整理'
              : context?.canDelete
                ? '官方作业 · 操作需确认'
                : '官方作业 · 只读'}
          </span>
        </CardFooter>
      </Card>
      <div className="mobile-detail-footer">
        {demo && <SyncStatus />}
        <p>
          {demo
            ? '合成示例'
            : context?.canDelete
              ? '官方作业 · 操作需确认'
              : '官方作业 · 只读'}{' '}
          · {dateLabel(item.date)}
        </p>
      </div>
    </section>
  );
}
export function Schedule({
  items,
  date,
  setDate,
  href,
  taskId,
  demo,
  setDemo,
  connected,
  pending,
  error,
  retry,
  context,
}: {
  items: Homework[];
  date: string;
  setDate: (value: string) => void;
  href: (path: string) => string;
  taskId?: string;
  demo: boolean;
  setDemo: (value: boolean) => void;
  connected: boolean;
  pending: boolean;
  error: boolean;
  retry: () => void;
  context?: HomeworkContext;
}) {
  const [closed, setClosed] = useState(false);
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();
  const active = taskId
    ? items.find((item) => item.id === taskId)
    : closed
      ? undefined
      : items[0];
  const listLink = href('/');
  return (
    <>
      {notice && (
        <p role="status" className="px-4 py-3">
          {notice}
        </p>
      )}
      <div className="schedule-list">
        <header className="page-heading schedule-heading">
          <div className="schedule-title">
            <div>
              <h1>作业安排</h1>
              <p>{dateLabel(date)}</p>
            </div>
            <BookScene />
          </div>
          <div className="schedule-actions">
            <Button
              size="touch"
              render={<Link to={href('/drafts/new')} />}
              className="create-button"
            >
              <Plus data-icon="inline-start" />
              整理今天的作业
            </Button>
            {!demo && connected && (
              <Button
                size="icon-touch"
                variant="outline"
                aria-label="刷新作业"
                onClick={retry}
                disabled={pending}
              >
                <RefreshCw />
              </Button>
            )}
          </div>
        </header>
        <div className={cn('schedule-columns', !active && 'without-detail')}>
          <div className="schedule-primary">
            <div className="calendar-panel">
              <div className="calendar-toolbar">
                <span>
                  {date.slice(0, 4)} 年 {Number(date.slice(5, 7))} 月
                </span>
                <div>
                  <Button
                    variant="ghost"
                    size="icon-touch"
                    aria-label="上一周"
                    onClick={() => setDate(shiftDate(date, -7))}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="ghost"
                    size="touch"
                    onClick={() => setDate(businessToday())}
                  >
                    今天
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-touch"
                    aria-label="下一周"
                    onClick={() => setDate(shiftDate(date, 7))}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
              <ToggleGroup
                value={[date]}
                onValueChange={(values) => {
                  if (values[0]) setDate(values[0]);
                }}
                className="week-strip"
                aria-label="作业日期"
              >
                {weekDates(date).map((day, i) => (
                  <ToggleGroupItem
                    key={day}
                    value={day}
                    aria-label={dateLabel(day)}
                  >
                    <span>{Number(day.slice(8))}</span>
                    <small>
                      {
                        [
                          '周一',
                          '周二',
                          '周三',
                          '周四',
                          '周五',
                          '周六',
                          '周日',
                        ][i]
                      }
                    </small>
                    <i aria-hidden="true" />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <Card className="homework-card">
              <CardHeader className="sr-only">
                <CardTitle>每日作业</CardTitle>
              </CardHeader>
              {!demo && !connected ? (
                <CardContent>
                  <StatePanel
                    title="先看看每天的安排"
                    description="连接账号后，可在这里查看孩子的作业。也可以先用合成数据体验工作台。"
                  >
                    <Button size="touch" onClick={() => setDemo(true)}>
                      查看演示作业
                    </Button>
                  </StatePanel>
                </CardContent>
              ) : pending ? (
                <CardContent
                  aria-label="正在加载作业"
                  className="flex flex-col gap-4"
                >
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              ) : error ? (
                <CardContent>
                  <StatePanel
                    title={demo ? '演示数据加载失败' : '真实作业读取失败'}
                    description={
                      demo
                        ? '请确认本机服务已启动，然后重试。'
                        : '请重试；若会话已失效，请在官网重新登录并交接本机服务。'
                    }
                  >
                    <Button variant="outline" size="touch" onClick={retry}>
                      重新加载
                    </Button>
                  </StatePanel>
                </CardContent>
              ) : items.length === 0 ? (
                <CardContent>
                  <StatePanel
                    title="这一天还没有作业"
                    description="换个日期或孩子看看，也可以整理一份新的草稿。"
                  />
                </CardContent>
              ) : (
                <CardContent className="task-groups">
                  {(['pending', 'completed'] as const).map((status, index) => (
                    <section
                      key={status}
                      className="task-group"
                      aria-label={
                        status === 'pending' ? '待完成作业' : '已完成作业'
                      }
                    >
                      {index > 0 && <Separator />}
                      <h2>
                        {status === 'pending' ? '待完成' : '已完成'}
                        <Badge variant="secondary">
                          {
                            items.filter((item) => item.status === status)
                              .length
                          }
                        </Badge>
                      </h2>
                      <ul>
                        {items
                          .filter((item) => item.status === status)
                          .map((item) => (
                            <li key={item.id}>
                              <Link
                                className={cn(
                                  'task-row',
                                  item.status === 'completed' && 'completed',
                                )}
                                to={href(
                                  `/homework/${encodeURIComponent(item.id)}`,
                                )}
                                aria-label={`查看作业：${item.content}`}
                                aria-current={
                                  taskId === item.id ? 'true' : undefined
                                }
                                onClick={() => setClosed(false)}
                              >
                                {item.status === 'completed' ? (
                                  <CircleCheck
                                    className="task-state-icon"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Clock
                                    className="task-state-icon"
                                    aria-hidden="true"
                                  />
                                )}
                                <div className="task-row-content">
                                  <div>
                                    <Badge variant="secondary">
                                      {subjects[item.subject]}
                                    </Badge>
                                    <p>{item.content}</p>
                                  </div>
                                  <small>
                                    {item.status === 'completed'
                                      ? '已完成'
                                      : '待完成'}
                                  </small>
                                </div>
                                <ChevronRight
                                  className="task-arrow"
                                  aria-hidden="true"
                                />
                              </Link>
                            </li>
                          ))}
                      </ul>
                    </section>
                  ))}
                </CardContent>
              )}
              <CardFooter className="schedule-sync">
                {demo ? (
                  <SyncStatus />
                ) : (
                  <span className="text-sm text-muted-foreground">
                    官方作业列表 · 以当前回读结果为准
                  </span>
                )}
                <Button
                  variant="outline"
                  size="touch"
                  render={<Link to={href('/sync')} />}
                >
                  查看记录
                </Button>
              </CardFooter>
            </Card>
          </div>
          {active && (
            <div className="desktop-detail">
              <DetailCard
                context={context}
                onDeleted={() => {
                  setNotice('作业已删除，官方列表回读确认已移除。');
                  setClosed(true);
                  navigate(listLink, { replace: true });
                }}
                item={active}
                demo={demo}
                back={listLink}
                close={() => {
                  setClosed(true);
                  navigate(listLink, { replace: true });
                }}
              />
              {taskId && (
                <Link className="desktop-back" to={listLink}>
                  返回作业列表
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
      {taskId && (
        <div className="mobile-detail">
          {active ? (
            <DetailCard
              demo={demo}
              context={context}
              onDeleted={() => {
                setNotice('作业已删除，官方列表回读确认已移除。');
                setClosed(true);
                navigate(listLink, { replace: true });
              }}
              item={active}
              back={listLink}
              close={() => {}}
            />
          ) : (
            <>
              <Button
                variant="ghost"
                size="touch"
                render={<Link to={listLink} />}
              >
                返回作业列表
              </Button>
              <StatePanel
                title={
                  pending
                    ? '正在加载作业'
                    : error
                      ? demo
                        ? '演示数据加载失败'
                        : '真实作业读取失败'
                      : '未找到这条作业'
                }
                description="请返回列表重新选择日期与孩子。"
              />
            </>
          )}
        </div>
      )}
    </>
  );
}
