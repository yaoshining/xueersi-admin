import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { CircleCheck, Clock, X } from 'lucide-react';
import type { Homework } from '@xueersi/contracts';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from '@/components/ui/card';
import { subjects, dateLabel } from './model';
export function orderedDayTasks(items: Homework[], date: string) {
  return items
    .filter((item) => item.date === date)
    .sort(
      (a, b) =>
        Number(a.status === 'completed') - Number(b.status === 'completed'),
    );
}
export function CalendarTask({
  item,
  child,
  demo,
  today,
  expanded = false,
}: {
  item: Homework;
  child: string;
  demo: boolean;
  today: string;
  expanded?: boolean;
}) {
  const state =
    item.status === 'completed'
      ? 'complete'
      : item.date < today
        ? 'missed'
        : 'pending';
  const status = {
    complete: '已完成',
    missed: '未完成 · 遗漏',
    pending: '待完成',
  }[state];
  const params = new URLSearchParams({
    date: item.date,
    child,
    ...(demo ? { demo: '1' } : {}),
  });
  return (
    <Link
      to={`/homework/${encodeURIComponent(item.id)}?${params}`}
      className={
        expanded ? 'calendar-task calendar-task-expanded' : 'calendar-task'
      }
      data-state={state}
      aria-label={`查看作业：${item.content}`}
      aria-description={`${subjects[item.subject]}，${status}`}
    >
      <span className="calendar-task-meta">
        <span>{subjects[item.subject]}</span>
        <span className="calendar-task-status">
          {state === 'complete' ? (
            <CircleCheck aria-hidden="true" />
          ) : (
            <Clock aria-hidden="true" />
          )}
          <span>{status}</span>
        </span>
      </span>
      <span className="calendar-task-content">{item.content}</span>
    </Link>
  );
}
export function ExpandedCalendarDay({
  date,
  items,
  child,
  demo,
  today,
  onClose,
}: {
  date: string;
  items: Homework[];
  child: string;
  demo: boolean;
  today: string;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  return (
    <section
      id="calendar-expanded-day"
      aria-label={`${date} 的全部任务`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>
            <h3 ref={heading} tabIndex={-1}>
              {dateLabel(date)}
            </h3>
          </CardTitle>
          <CardDescription>
            共 {items.length} 项 ·{' '}
            {items.filter((item) => item.status === 'completed').length}{' '}
            项已完成
          </CardDescription>
          <CardAction>
            <Button
              variant="ghost"
              size="icon-touch"
              aria-label="关闭当天任务"
              onClick={onClose}
            >
              <X />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ul className="calendar-expanded-tasks">
            {items.map((item) => (
              <li key={item.id}>
                <CalendarTask
                  item={item}
                  child={child}
                  demo={demo}
                  today={today}
                  expanded
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
