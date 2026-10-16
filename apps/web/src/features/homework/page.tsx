import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  ArrowUpRight,
  Plus,
  FlaskConical,
  Link2,
  CircleCheck,
  Circle,
  Leaf,
  RefreshCw,
  Monitor,
  ShieldCheck,
} from 'lucide-react';
import {
  ConnectionSchema,
  HealthSchema,
  HomeworkResponseSchema,
  type Homework,
} from '@xueersi/contracts';
import { getJson } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

const subjects = {
  chinese: '语文',
  math: '数学',
  english: '英语',
  other: '其他',
};
function HomeworkRow({ item }: { item: Homework }) {
  const done = item.status === 'completed';
  return (
    <li className="flex items-start gap-4 py-5">
      <div className="mt-0.5 text-primary" aria-hidden="true">
        {done ? (
          <CircleCheck className="size-5" />
        ) : (
          <Circle className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{subjects[item.subject]}</Badge>
          <span className="text-xs text-muted-foreground">{item.date}</span>
        </div>
        <p className="text-sm leading-7 sm:text-base">{item.content}</p>
      </div>
      <Badge variant={done ? 'default' : 'outline'}>
        {done ? '已完成' : '待完成'}
      </Badge>
    </li>
  );
}
export function HomeworkPage() {
  const [demo, setDemo] = useState(false);
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => getJson('/api/v1/health', HealthSchema),
  });
  const connection = useQuery({
    queryKey: ['connection'],
    queryFn: () => getJson('/api/v1/connection', ConnectionSchema),
  });
  const homework = useQuery({
    queryKey: ['demo-homework'],
    queryFn: () => getJson('/api/v1/demo/homework', HomeworkResponseSchema),
    enabled: demo,
  });
  const date = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5 sm:px-8">
          <a className="flex items-center gap-3" href="/" aria-label="学伴首页">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Leaf className="size-6" aria-hidden="true" />
            </span>
            <span className="flex flex-col">
              <span className="text-lg font-semibold tracking-wider">学伴</span>
              <span className="text-[10px] tracking-[0.16em] text-muted-foreground">
                每天，陪伴成长
              </span>
            </span>
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:block">
              家庭作业工作台
            </span>
            <Badge variant="outline">非官方 · 开发中</Badge>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 sm:py-12">
        <section
          className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end"
          aria-labelledby="welcome"
        >
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium tracking-widest text-primary">
              {date} · 北京时间
            </p>
            <h1
              id="welcome"
              className="max-w-xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"
            >
              把每天的作业，安排清楚。
            </h1>
            <p className="text-sm leading-7 text-muted-foreground">
              少一些反复查找，多一些从容陪伴。从一份清晰的作业清单开始。
            </p>
          </div>
          <Button size="lg" disabled>
            <Plus data-icon="inline-start" />
            布置新作业
          </Button>
        </section>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section
            className="flex min-w-0 flex-col gap-5"
            aria-label="作业清单"
          >
            {demo && (
              <Alert>
                <FlaskConical />
                <AlertTitle>演示模式 · 全部内容均为合成数据</AlertTitle>
                <AlertDescription>
                  这里的作业仅用于体验界面，不会同步到学习机。
                </AlertDescription>
              </Alert>
            )}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>
                    <h2>{demo ? '示例作业' : '今日作业'}</h2>
                  </CardTitle>
                  <Badge variant="secondary">
                    {demo && homework.data
                      ? `${homework.data.items.length} 项`
                      : '待连接'}
                  </Badge>
                </div>
                <CardDescription>
                  {demo
                    ? '体验按科目查看作业与完成状态。'
                    : '连接账号后，在这里查看孩子的每日安排。'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!demo ? (
                  <Empty className="min-h-72">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <BookOpen />
                      </EmptyMedia>
                      <EmptyTitle>给今日安排留一个位置</EmptyTitle>
                      <EmptyDescription>
                        账号连接功能正在开发中。你可以先查看演示，熟悉未来的作业清单。
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button variant="outline" onClick={() => setDemo(true)}>
                        查看演示作业
                        <ArrowUpRight data-icon="inline-end" />
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : homework.isPending ? (
                  <div
                    className="flex flex-col gap-5 py-6"
                    aria-label="正在加载演示作业"
                  >
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : homework.isError ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>演示数据加载失败</EmptyTitle>
                      <EmptyDescription>
                        请确认本机服务已启动，然后重试。
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button
                        variant="outline"
                        onClick={() => void homework.refetch()}
                      >
                        <RefreshCw data-icon="inline-start" />
                        重新加载
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : (
                  <ul className="divide-y">
                    {homework.data.items.map((item) => (
                      <HomeworkRow key={item.id} item={item} />
                    ))}
                  </ul>
                )}
              </CardContent>
              <CardFooter className="justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {demo
                    ? '合成示例 · 不关联任何真实孩子'
                    : '真实作业将在完成账号接入后开放'}
                </p>
                {demo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDemo(false)}
                  >
                    退出演示
                  </Button>
                )}
              </CardFooter>
            </Card>
            <p className="flex items-center gap-2 text-xs leading-6 text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0" />
              你的家庭信息不会出现在演示数据中。
            </p>
          </section>
          <aside className="flex flex-col gap-6" aria-label="连接与使用说明">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="flex items-center gap-2">
                    <Link2 className="size-4" />
                    账号连接
                  </h2>
                </CardTitle>
                <CardDescription>连接一次，集中管理每日安排。</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {connection.isPending ? (
                  <Skeleton className="h-6 w-40" />
                ) : (
                  <p className="text-sm font-medium">
                    {connection.isError
                      ? '连接状态读取失败'
                      : '尚未连接学而思账号'}
                  </p>
                )}
                <p className="text-sm leading-7 text-muted-foreground">
                  当前版本支持界面演示。账号连接与真实作业同步将逐步开放。
                </p>
                <Button variant="outline" disabled className="w-full">
                  连接账号（开发中）
                </Button>
              </CardContent>
              <CardFooter>
                <span
                  role="status"
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <Monitor className="size-3.5" />
                  {health.isPending
                    ? '正在检查本机服务'
                    : health.isError
                      ? '本机服务不可用'
                      : '本机服务正常'}
                </span>
              </CardFooter>
            </Card>
            <div className="flex flex-col gap-4 px-1">
              <p className="text-xs font-medium tracking-widest text-muted-foreground">
                从整理到完成
              </p>
              <ol className="flex flex-col gap-5">
                {[
                  ['01', '整理每日作业', '把群消息整理成清晰的任务。'],
                  ['02', '检查后再同步', '确认孩子、科目和日期。'],
                  ['03', '了解完成情况', '在同一处查看学习进度。'],
                ].map(([num, title, description]) => (
                  <li key={num} className="flex gap-3">
                    <span className="pt-0.5 text-xs font-medium text-primary">
                      {num}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{title}</p>
                      <p className="mt-1 text-xs leading-6 text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted-foreground">
                以上为后续功能规划。
              </p>
            </div>
          </aside>
        </div>
        <Separator />
        <footer className="flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
          <p>学伴 · 一个家庭作业管理开源项目</p>
          <p>本机运行 · 非学而思官方产品</p>
        </footer>
      </main>
    </div>
  );
}
