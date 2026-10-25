import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { durationOptions, requirementOptions } from '../homework/drafts';
import { subjects } from '../homework/model';
import type { AgentController } from './controller';
const labels = {
  awaiting_confirmation: '等待你本人确认',
  sending: '正在提交，请勿重复操作',
  accepted: '官方已接受，请核对学习机或刷新列表',
  failed: '官方拒绝，本次未完成',
  unknown: '结果不确定，请核对官方记录，不要重复提交',
  cancelled: '已取消',
  expired: '预览已过期，请在会话重新生成',
  invalidated: '连接或内容已变化，请重新生成预览',
};
export function AgentReview({
  controller,
  status,
}: {
  controller: AgentController;
  status: string;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const action = controller.view();
  return (
    <section aria-label="会话操作" className="flex flex-col gap-5">
      <header className="page-heading">
        <div>
          <h1>会话操作</h1>
          <p>查询和草稿可在会话完成，真实提交与删除由你在此确认。</p>
        </div>
      </header>
      <p role="status">
        {status === 'ready'
          ? '会话工具已就绪'
          : status === 'checking'
            ? '正在检查会话工具…'
            : status === 'unsupported'
              ? '当前浏览器不支持会话工具，可继续使用普通网页。'
              : '会话工具注册失败，请刷新页面重试。'}
      </p>
      {!action ? (
        <Card>
          <CardHeader>
            <CardTitle>暂无待确认操作</CardTitle>
            <CardDescription>
              在会话中要求查询作业、保存草稿或生成操作预览。预览不会自动提交。
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {action.kind === 'sync' ? '提交作业预览' : '删除作业预览'}
            </CardTitle>
            <CardDescription>{labels[action.status]}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <dl className="grid grid-cols-2 gap-4">
              {[
                ['孩子', action.summary.child],
                ['设备', action.summary.device],
                ['日期', action.summary.date],
                ['学科', subjects[action.summary.subject]],
                [
                  '目标时长',
                  durationOptions.find(
                    (o) => o.value === String(action.summary.targetMinutes),
                  )?.label ?? '未提供',
                ],
                [
                  '提交要求',
                  requirementOptions.find(
                    (o) => o.value === action.summary.submissionRequirement,
                  )?.label ?? '未提供',
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="whitespace-pre-wrap break-words rounded-lg bg-muted p-4">
              {action.summary.content}
            </p>
            <p className="text-sm text-muted-foreground">
              {action.kind === 'delete'
                ? '删除后不可恢复。'
                : '确认后会创建真实作业。'}
              请你本人核对并点击；会话助手不会代为确认。
            </p>
          </CardContent>
          {action.status === 'awaiting_confirmation' && (
            <CardFooter className="flex flex-wrap gap-3">
              <Button
                size="touch"
                variant={action.kind === 'delete' ? 'destructive' : 'default'}
                onClick={() => void controller.confirmFromPage()}
              >
                {action.kind === 'delete' ? '确认永久删除' : '确认提交这条作业'}
              </Button>
              <Button
                size="touch"
                variant="outline"
                onClick={() => void controller.cancelFromPage()}
              >
                取消本次操作
              </Button>
            </CardFooter>
          )}
        </Card>
      )}
    </section>
  );
}
