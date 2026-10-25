import {
  CalendarTask,
  ExpandedCalendarDay,
  orderedDayTasks,
} from './calendar-preview';
import { useRef, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  RefreshCw,
} from 'lucide-react';
import { RealHomeworkResponseSchema, type Homework } from '@xueersi/contracts';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/workbench/shared';
import { getJson } from '@/lib/api';
import { businessToday } from './model';
import {
  monthDates,
  shiftMonth,
  daySummary,
  monthSummary,
} from './calendar-model';
const labels = {
  empty: '无任务',
  complete: '全部完成',
  missed: '有遗漏',
  pending: '待完成',
};
export function TaskCalendar({
  date,
  setDate,
  child,
  sessionId,
  demo,
}: {
  date: string;
  setDate: (value: string) => void;
  child: string;
  sessionId?: string;
  demo: boolean;
}) {
  const today = businessToday(),
    dates = monthDates(date),
    start = dates[0],
    end = dates[dates.length - 1];
  const root = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState<{
    day: string;
    context: string;
  } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const context = JSON.stringify([sessionId, child, demo, start]);
  const expandedDay = expanded?.context === context ? expanded.day : undefined;
  function changeDate(value: string) {
    setExpanded(null);
    setDate(value);
  }
  function closeExpanded() {
    setExpanded(null);
    if (trigger.current?.isConnected) trigger.current.focus();
  }
  function openDay(day: string, button: HTMLButtonElement) {
    trigger.current = button;
    setExpanded({ day, context });
  }

  const [fullscreen, setFullscreen] = useState(false),
    [fullscreenError, setFullscreenError] = useState('');
  useEffect(() => {
    const changed = () =>
      setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const data = useQuery({
    queryKey: [
      'real-homework',
      'calendar',
      demo ? 'demo' : sessionId,
      child,
      start,
      end,
    ],
    queryFn: async () => {
      if (demo) {
        const make = (
          day: number,
          status: 'pending' | 'completed',
        ): Homework => ({
          id: `demo-${day}-${status}`,
          date: dates[Math.min(day, dates.length - 1)],
          subject: 'math',
          content: '合成月历任务',
          status,
        });
        return {
          items: [
            make(3, 'completed'),
            make(6, 'completed'),
            make(6, 'pending'),
            make(15, 'pending'),
            make(18, 'completed'),
          ],
        };
      }
      return getJson(
        `/api/v1/homework?${new URLSearchParams({ childId: child, date: start, endDate: end })}`,
        RealHomeworkResponseSchema,
        65000,
      );
    },
    enabled: demo || !!sessionId,
    retry: false,
    gcTime: 0,
  });
  const ready = (demo || !!sessionId) && data.isSuccess && !data.isError;
  const items = ready ? data.data.items : [],
    summary = monthSummary(items, date, today);
  const leading = (new Date(`${start}T00:00:00Z`).getUTCDay() + 6) % 7;
  async function toggleFullscreen() {
    try {
      setFullscreenError('');
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root.current?.requestFullscreen)
        await root.current.requestFullscreen();
      else setFullscreenError('当前浏览器不支持全屏，请使用本页月历总览。');
    } catch {
      setFullscreenError('未能进入全屏，请使用本页月历总览。');
    }
  }
  return (
    <section ref={root} className="task-calendar" aria-label="任务总览" data-ui>
      <header className="calendar-page-heading">
        <div>
          <h1>任务总览</h1>
          <p className="text-muted-foreground">按月核对安排，及时发现遗漏。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="touch"
            onClick={() => void data.refetch()}
            disabled={data.isFetching || (!demo && !sessionId)}
          >
            <RefreshCw data-icon="inline-start" />
            刷新
          </Button>
          <Button
            variant="outline"
            size="touch"
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? (
              <Minimize data-icon="inline-start" />
            ) : (
              <Maximize data-icon="inline-start" />
            )}
            {fullscreen ? '退出全屏' : '全屏总览'}
          </Button>
        </div>
      </header>
      {fullscreenError && <p role="status">{fullscreenError}</p>}
      <div className="calendar-month-toolbar">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-touch"
            aria-label="上个月"
            onClick={() => changeDate(shiftMonth(date, -1))}
          >
            <ChevronLeft />
          </Button>
          <h2>
            {date.slice(0, 4)} 年 {Number(date.slice(5, 7))} 月
          </h2>
          <Button
            variant="ghost"
            size="icon-touch"
            aria-label="下个月"
            onClick={() => changeDate(shiftMonth(date, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        <Button
          variant="outline"
          size="touch"
          onClick={() => changeDate(today)}
        >
          本月
        </Button>
      </div>
      {!demo && !sessionId ? (
        <StatePanel
          title="连接账号后查看整月安排"
          description="请先在账号设置中连接孩子与学习机。"
        >
          <Button render={<Link to="/settings" />}>前往设置</Button>
        </StatePanel>
      ) : data.isPending ? (
        <p role="status">正在读取整月作业…</p>
      ) : data.isError ? (
        <StatePanel
          title="本月作业读取失败"
          description="统计暂不可用，不代表本月没有任务。"
        >
          <Button onClick={() => void data.refetch()}>重新读取本月</Button>
        </StatePanel>
      ) : (
        <>
          <div className="calendar-overview" aria-label="本月统计">
            <dl className="calendar-summary">
              {[
                ['任务总数', summary.total],
                ['已完成', summary.completed],
                ['全部完成天数', summary.completeDays],
                ['有遗漏天数', summary.missedDays],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {summary.total > 0 ? (
              <div className="calendar-progress">
                <progress
                  aria-label="本月作业完成进度"
                  value={summary.completed}
                  max={summary.total}
                  aria-valuetext={`已完成 ${summary.completed} / ${summary.total} 项（${Math.round((summary.completed / summary.total) * 100)}%）`}
                />
                <span>
                  {Math.round((summary.completed / summary.total) * 100)}%
                  已完成
                </span>
              </div>
            ) : (
              <p className="calendar-empty-month">本月暂无任务</p>
            )}
          </div>
          <div className="calendar-legend">
            <span data-state="complete">全部完成</span>
            <span data-state="missed">有遗漏（过去日期）</span>
            <span data-state="pending">待完成</span>
            <span>无任务</span>
          </div>
          {expandedDay && (
            <ExpandedCalendarDay
              key={`${context}-${expandedDay}`}
              date={expandedDay}
              items={orderedDayTasks(items, expandedDay)}
              child={child}
              demo={demo}
              today={today}
              onClose={closeExpanded}
            />
          )}
          <div className="month-grid" aria-label="月度任务日历">
            <div className="month-weekdays">
              {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
                <span key={d}>周{d}</span>
              ))}
            </div>
            <div className="month-days">
              {Array.from({ length: leading }, (_, i) => (
                <div
                  key={`blank-${i}`}
                  className="month-blank"
                  aria-hidden="true"
                />
              ))}
              {dates.map((day) => {
                const d = daySummary(items, day, today),
                  label = labels[d.state];
                const params = new URLSearchParams({
                  date: day,
                  child,
                  ...(demo ? { demo: '1' } : {}),
                });
                const tasks = orderedDayTasks(items, day);
                return (
                  <article
                    key={day}
                    className="month-day"
                    data-state={d.state}
                    data-today={day === today ? true : undefined}
                  >
                    <Link
                      to={`/?${params}`}
                      className="month-date-link"
                      aria-label={`${day}，${label}，共 ${d.total} 项，已完成 ${d.completed} 项，未完成 ${d.pending} 项`}
                      aria-current={day === today ? 'date' : undefined}
                    >
                      <span className="month-day-number">
                        <span className="month-date-value">
                          {Number(day.slice(8))}
                        </span>
                        {day === today && <small>今天</small>}
                      </span>
                    </Link>
                    <div className="month-day-summary">
                      <span className="month-day-state">{label}</span>
                      {d.total > 0 && (
                        <small>
                          {d.completed}/{d.total} 完成
                        </small>
                      )}
                    </div>
                    {d.total > 0 && (
                      <>
                        <ul
                          className="calendar-day-tasks"
                          data-single={tasks.length === 1 ? true : undefined}
                        >
                          {tasks.slice(0, 3).map((item) => (
                            <li key={item.id}>
                              <CalendarTask
                                item={item}
                                child={child}
                                demo={demo}
                                today={today}
                              />
                            </li>
                          ))}
                        </ul>
                        {tasks.length > 3 && (
                          <Button
                            className="calendar-more calendar-more-desktop"
                            variant="ghost"
                            size="sm"
                            aria-label={`展开 ${day} 的全部 ${tasks.length} 项任务，另有 ${tasks.length - 3} 项`}
                            aria-expanded={expandedDay === day}
                            aria-controls="calendar-expanded-day"
                            onClick={(event) =>
                              openDay(day, event.currentTarget)
                            }
                          >
                            +{tasks.length - 3} 项
                          </Button>
                        )}
                        {tasks.length > 1 && (
                          <Button
                            className="calendar-more calendar-more-mobile"
                            variant="outline"
                            size="sm"
                            aria-label={`展开 ${day} 的全部 ${tasks.length} 项任务`}
                            aria-expanded={expandedDay === day}
                            aria-controls="calendar-expanded-day"
                            onClick={(event) =>
                              openDay(day, event.currentTarget)
                            }
                          >
                            +{tasks.length}
                          </Button>
                        )}
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            点击数量展开当天任务，点击任务查看详情。遗漏指过去日期仍未完成；统计以官方当前返回记录为准。
          </p>
        </>
      )}
    </section>
  );
}
