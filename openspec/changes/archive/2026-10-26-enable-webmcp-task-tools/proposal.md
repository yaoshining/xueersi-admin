# Proposal

## Why

家长希望直接在会话查询作业、保存草稿和准备任务操作，减少逐项点击。真实提交和删除仍必须由本人在网页确认，凭据保持本机保管。

## What Changes

- 增加页面 WebMCP 查询、草稿创建/修改及同步/删除预览工具；不注册最终写入工具。
- 增加本机草稿幂等创建和快照版本更新接口，复用 SQLite 草稿存储。
- 增加会话操作确认页，预览密钥仅保存在页面闭包，返回模型的结果不含凭据和官方原始标识。
- 支持注册能力检测、路由生命周期、取消、过期和上下文失效；不支持的浏览器继续使用普通网页。

## Capabilities

### New Capabilities

- `webmcp-task-tools`: 页面工具、数据最小化、本机草稿并发及本人网页确认。

### Modified Capabilities

无。

## Impact

apps/web 会话工具和确认页，apps/api 草稿接口，packages/contracts 工具输入结构，packages/db 原子草稿更新。无新增外部服务、凭据存储、真实自动写入或跨域权限。
