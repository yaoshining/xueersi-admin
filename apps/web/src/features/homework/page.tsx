import { useAgentTools } from '../agent/use-agent';
import { AgentReview } from '../agent/review';
import { TaskCalendar } from './calendar';
import { CalendarDays } from 'lucide-react';
import { SyncPage } from './sync';
import { BatchSyncPage } from './batch-sync';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router';
import {
  BusinessDateSchema,
  ConnectionSchema,
  HealthSchema,
  HomeworkResponseSchema,
  RealHomeworkResponseSchema,
  SuccessSchema,
} from '@xueersi/contracts';
import {
  ClipboardList,
  FileText,
  RefreshCw,
  Users,
  Settings,
  Sun,
  Moon,
  Tablet,
  Ellipsis,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { ThemeControl, useTheme } from '@/components/workbench/theme-provider';
import {
  Brand,
  Choice,
  MotionContent,
  StatePanel,
} from '@/components/workbench/shared';
import { getJson, mutateJson } from '@/lib/api';
import { cn } from '@/lib/utils';
import { businessToday, children, visibleHomework } from './model';
import { Schedule } from './schedule';
import { DraftList, DraftEditor } from './drafts';
const navigation = [
  { path: '/', label: '作业安排', short: '作业', icon: ClipboardList },
  { path: '/calendar', label: '任务总览', short: '总览', icon: CalendarDays },
  { path: '/drafts', label: '作业草稿', short: '草稿', icon: FileText },
  { path: '/sync', label: '同步记录', short: '同步', icon: RefreshCw },
  { path: '/family', label: '家庭与设备', short: '家庭', icon: Users },
  { path: '/assistant', label: '会话操作', short: '会话', icon: ClipboardList },
  { path: '/settings', label: '设置', short: '更多', icon: Settings },
];
export function HomeworkPage() {
  const location = useLocation();
  const agent = useAgentTools();
  const queryClient = useQueryClient();
  const [disconnectError, setDisconnectError] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);
  const [params, setParams] = useSearchParams();
  const today = businessToday();
  const date = BusinessDateSchema.safeParse(params.get('date')).success
    ? params.get('date')!
    : today;
  const demo = params.get('demo') === '1';
  const taskMatch = /^\/homework\/([^/]+)$/.exec(location.pathname);
  const editMatch = /^\/drafts\/([^/]+)\/edit$/.exec(location.pathname);
  const detail = !!taskMatch;
  const isSchedule = location.pathname === '/' || detail;
  const { resolved, setPreference } = useTheme();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => getJson('/api/v1/health', HealthSchema),
  });
  const connection = useQuery({
    queryKey: ['connection'],
    queryFn: () => getJson('/api/v1/connection', ConnectionSchema),
    refetchInterval: 30000,
  });
  const connected =
    connection.data?.status === 'connected' ? connection.data : null;
  const childOptions = demo
    ? children
    : connected
      ? [connected.child]
      : [{ value: 'unconnected', label: '请先连接孩子' }];
  const child = childOptions.some((item) => item.value === params.get('child'))
    ? params.get('child')!
    : childOptions[0].value;
  const demoHomework = useQuery({
    queryKey: ['demo-homework', today],
    queryFn: () => getJson('/api/v1/demo/homework', HomeworkResponseSchema),
    enabled: demo,
  });
  const realHomework = useQuery({
    queryKey: ['real-homework', connected?.sessionId, child, date],
    queryFn: () =>
      getJson(
        `/api/v1/homework?${new URLSearchParams({ childId: child, date })}`,
        RealHomeworkResponseSchema,
        65000,
      ),
    enabled: !demo && !!connected && isSchedule,
    gcTime: 0,
    retry: false,
  });
  const refetchConnection = connection.refetch;
  useEffect(() => {
    if (realHomework.isError) void refetchConnection();
  }, [realHomework.errorUpdatedAt, realHomework.isError, refetchConnection]);
  useEffect(() => {
    if (connection.data?.status === 'disconnected')
      queryClient.removeQueries({ queryKey: ['real-homework'] });
  }, [connection.data?.status, queryClient]);
  const expired =
    connection.data?.status === 'disconnected' &&
    connection.data.reason === 'session-expired';
  const homework = demo ? demoHomework : realHomework;
  const items = homework.isError
    ? []
    : demo
      ? visibleHomework(demoHomework.data?.items ?? [], date, child)
      : connected
        ? (realHomework.data?.items ?? [])
        : [];
  function query(change: Record<string, string> = {}) {
    const next = new URLSearchParams(params);
    next.set('date', date);
    next.set('child', child);
    for (const [key, value] of Object.entries(change)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return next;
  }
  function href(path: string) {
    const next = query();
    next.delete('draft');
    return `${path}?${next}`;
  }
  const navActive = (path: string) =>
    path === '/' ? isSchedule : location.pathname.startsWith(path);
  const setDemo = (value: boolean) =>
    setParams(query({ demo: value ? '1' : '' }));
  return (
    <div className={cn('app-shell', detail && 'show-mobile-detail')}>
      <a href="#main-content" className="skip-link">
        跳到主要内容
      </a>
      <aside className="desktop-sidebar">
        <Brand />
        <nav aria-label="主导航">
          {navigation.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={href(path)}
              className={cn('sidebar-link', navActive(path) && 'active')}
              aria-current={navActive(path) ? 'page' : undefined}
            >
              <Icon aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ThemeControl />
          <p>非官方 · 本地家庭工作台</p>
        </div>
      </aside>
      <div className="app-body">
        <header className="mobile-brand">
          <Brand />
          <Button
            variant="ghost"
            size="icon-touch"
            aria-label={
              resolved === 'dark' ? '切换为浅色主题' : '切换为深色主题'
            }
            onClick={() =>
              setPreference(resolved === 'dark' ? 'light' : 'dark')
            }
          >
            {resolved === 'dark' ? <Moon /> : <Sun />}
          </Button>
        </header>
        <header className="context-bar">
          <div className="context-field">
            <span>当前孩子</span>
            <Choice
              label="当前孩子"
              icon={Users}
              value={child}
              options={childOptions}
              onChange={(value) => setParams(query({ child: value }))}
            />
          </div>
          <div className="context-field">
            <span>目标学习机</span>
            <Choice
              label="目标学习机"
              icon={Tablet}
              value={
                !demo && connected
                  ? connected.device.value
                  : demo
                    ? 'example-t6'
                    : 'unconnected-device'
              }
              options={
                !demo && connected
                  ? [connected.device]
                  : demo
                    ? [{ value: 'example-t6', label: 'T6 国际版（示例）' }]
                    : [{ value: 'unconnected-device', label: '请先连接学习机' }]
              }
              onChange={() => {}}
            />
          </div>
          <span className="connection-state">
            {connection.isPending
              ? '正在读取连接状态'
              : connection.isError
                ? '连接状态读取失败'
                : connected
                  ? connected.canWrite
                    ? '账号已连接 · 提交需确认'
                    : '账号已连接 · 仅可读取'
                  : expired
                    ? '登录已失效，请重新登录官网并连接本机'
                    : '尚未连接学而思账号'}
          </span>
        </header>
        <main id="main-content" className="workspace" tabIndex={-1}>
          <div className="mode-bar">
            <div>
              {demo ? (
                <span>演示模式 · 全部内容均为合成数据</span>
              ) : (
                <span>
                  {connected
                    ? connected.canWrite
                      ? '真实账号 · 提交需确认'
                      : '真实作业 · 只读'
                    : '本地工作台 · 示例孩子与设备'}
                </span>
              )}
            </div>
            {demo && (
              <Button
                variant="ghost"
                size="touch"
                onClick={() => setDemo(false)}
              >
                退出演示
              </Button>
            )}
            <span className="health-state" role="status">
              {health.isPending
                ? '正在检查本机服务'
                : health.isError
                  ? '本机服务不可用'
                  : '本机服务正常'}
            </span>
          </div>
          <MotionContent identity={location.pathname}>
            {isSchedule ? (
              <Schedule
                context={
                  connected
                    ? {
                        childId: child,
                        sessionId: connected.sessionId,
                        canDelete: connected.canWrite,
                      }
                    : undefined
                }
                items={items}
                date={date}
                setDate={(value) => setParams(query({ date: value }))}
                href={href}
                taskId={taskMatch?.[1]}
                demo={demo}
                connected={!!connected}
                setDemo={setDemo}
                pending={homework.isPending && (demo || !!connected)}
                error={homework.isError}
                retry={() => void homework.refetch()}
              />
            ) : location.pathname === '/assistant' ? (
              <AgentReview
                controller={agent.controller}
                status={agent.status}
              />
            ) : location.pathname === '/calendar' ? (
              <TaskCalendar
                date={date}
                setDate={(value) => setParams(query({ date: value }))}
                child={child}
                sessionId={connected?.sessionId}
                demo={demo}
              />
            ) : location.pathname === '/drafts' ? (
              <DraftList
                key={`${child}:${demo}:${connected?.sessionId}`}
                href={href}
                child={connected?.child.value}
                childLabel={connected?.child.label}
                demo={demo}
              />
            ) : location.pathname === '/drafts/new' || editMatch ? (
              <DraftEditor
                key={location.pathname}
                href={href}
                id={editMatch?.[1]}
                date={date}
                child={child}
                childOptions={childOptions}
              />
            ) : location.pathname === '/sync/batch' ? (
              <BatchSyncPage key={location.search} href={href} demo={demo} />
            ) : location.pathname === '/sync' ? (
              <SyncPage key={location.search} href={href} demo={demo} />
            ) : location.pathname === '/family' ? (
              <>
                <header className="page-heading">
                  <div>
                    <h1>家庭与设备</h1>
                    <p>确认孩子与目标学习机。</p>
                  </div>
                </header>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {connected
                        ? connected.canWrite
                          ? '已连接 · 提交需确认'
                          : '已授权只读连接'
                        : '账号尚未接入'}
                    </CardTitle>
                    <CardDescription>
                      {connected
                        ? '本次会话授权的孩子和学习机。未读取完整家庭资料。'
                        : demo
                          ? '当前为合成示例。'
                          : '连接官网账号后可显示已授权的孩子和学习机。'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {childOptions.map((item) => (
                      <div key={item.value} className="family-row">
                        <Users aria-hidden="true" />
                        <span>{item.label}</span>
                        <Badge variant="secondary">
                          {!demo && connected
                            ? connected.canWrite
                              ? '提交需确认'
                              : '只读'
                            : demo
                              ? '合成示例'
                              : '未连接'}
                        </Badge>
                      </div>
                    ))}
                    <div className="family-row">
                      <Tablet aria-hidden="true" />
                      <span>
                        {!demo && connected
                          ? connected.device.label
                          : demo
                            ? 'T6 国际版（示例）'
                            : '请先连接学习机'}
                      </span>
                      <Badge variant="outline">
                        {connected
                          ? connected.canWrite
                            ? '已连接 · 提交需确认'
                            : '只读连接'
                          : '未连接'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : location.pathname === '/settings' ? (
              <>
                <header className="page-heading">
                  <div>
                    <h1>设置</h1>
                    <p>让工作台更适合你的日常习惯。</p>
                  </div>
                </header>
                <Card>
                  <CardHeader>
                    <CardTitle>外观主题</CardTitle>
                    <CardDescription>
                      选择浅色、深色，或跟随设备系统。
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ThemeControl />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>本地数据与连接</CardTitle>
                    <CardDescription>
                      草稿保存在此 Mac 的本机数据库；主题偏好保存在浏览器。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <Link className="text-link" to={href('/family')}>
                      查看家庭与设备
                    </Link>
                    <p>非学而思官方产品 · 创建真实作业前须逐条预览并确认。</p>
                    <p>
                      {connected?.persistence === 'encrypted'
                        ? '本机加密保存 · 重启自动恢复'
                        : '尚无本机持久会话'}
                    </p>
                    {connected && (
                      <>
                        <p>
                          {connected.verification === 'verified'
                            ? '会话已通过作业读取验证'
                            : '会话已恢复，等待下一次读取验证'}
                        </p>
                        <p>
                          {connected.renewal === 'automatic'
                            ? '使用时自动续期 · 失效后提示重新登录'
                            : '官方会话失效时需重新登录'}
                        </p>
                        <p className="text-muted-foreground">
                          {connected.persistence === 'encrypted'
                            ? '令牌及已授权的续期 Cookie 加密保存在本机，密钥由系统钥匙串管理。关闭页面或重启服务无需重新交接；断开连接会删除这些凭据。'
                            : '当前为临时内存模式，15 分钟后或服务重启需重新连接。'}
                        </p>
                      </>
                    )}
                    {expired && (
                      <p role="status">登录已失效，请重新登录官网并连接本机</p>
                    )}
                    {!connected && (
                      <p>
                        在 Chrome
                        官网完成本人登录，读取并选择孩子和设备，然后点击验证器的“连接学伴本机后端”。无需手工生成配对文件。
                      </p>
                    )}
                    {disconnectError && <p role="alert">{disconnectError}</p>}
                    {connected && (
                      <Button
                        size="touch"
                        variant="outline"
                        disabled={disconnecting}
                        onClick={async () => {
                          setDisconnecting(true);
                          setDisconnectError('');
                          try {
                            await mutateJson(
                              '/api/v1/session',
                              'DELETE',
                              SuccessSchema,
                            );
                            await queryClient.cancelQueries({
                              queryKey: ['real-homework'],
                            });
                            queryClient.removeQueries({
                              queryKey: ['real-homework'],
                            });
                            await connection.refetch();
                          } catch {
                            setDisconnectError(
                              '无法删除本机会话，请检查服务后重试',
                            );
                          } finally {
                            setDisconnecting(false);
                          }
                        }}
                      >
                        {disconnecting ? '正在删除会话…' : '断开并删除本机会话'}
                      </Button>
                    )}
                    <Button
                      size="touch"
                      variant="outline"
                      onClick={() => void connection.refetch()}
                    >
                      刷新连接状态
                    </Button>
                  </CardContent>
                </Card>
              </>
            ) : (
              <StatePanel
                title="页面不存在"
                description="这个地址没有对应的页面。"
              >
                <Button
                  variant="outline"
                  size="touch"
                  render={<Link to={href('/')} />}
                >
                  <ArrowLeft data-icon="inline-start" />
                  返回作业首页
                </Button>
              </StatePanel>
            )}
          </MotionContent>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="移动主导航">
        {navigation
          .filter((item) => item.path !== '/family')
          .map(({ path, short, icon: Icon }) => (
            <Link
              key={path}
              className={cn(navActive(path) && 'active')}
              to={href(path)}
              aria-current={navActive(path) ? 'page' : undefined}
            >
              {path === '/settings' ? (
                <Ellipsis aria-hidden="true" />
              ) : (
                <Icon aria-hidden="true" />
              )}
              <span>{short}</span>
            </Link>
          ))}
      </nav>
    </div>
  );
}
