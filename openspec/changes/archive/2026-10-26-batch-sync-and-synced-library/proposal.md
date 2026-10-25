# Proposal

## Why

已成功同步的草稿仍出现在待办列表，容易重复操作；多条作业需要反复打开确认页，增加每日整理成本。

## What Changes

- 默认只展示待同步草稿，提供独立「已同步」列表，显示原始正文、日期、时长、提交要求与目标。
- 支持当前孩子草稿多选、全选（每批最多 20 条）、统一预览与一次网页确认。
- 批次逐条发送，失败或不确定时停止后续发送，逐条展示结果，不自动重试。
- 保持单条同步、官方接受与真机接收的证据区分、本机凭据与确认边界。

## Capabilities

### New Capabilities

- `batch-draft-sync`: 草稿分类、批量预览、统一确认与部分结果恢复。

### Modified Capabilities

无已归档规范。沿用在途 confirmed-draft-sync 的票据、完整摘要和持久防重要求；单条确认仍保留，新增受同等约束的批次确认。

## Impact

影响 packages/contracts、packages/db、apps/api 同步服务及 apps/web 草稿列表和同步页面。复用 sync_jobs 历史记录，无需删除草稿或数据库迁移，无新增官方域名或凭据权限。
