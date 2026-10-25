# Proposal

## Why

本机服务依赖临时进程和 macOS 钥匙串，不能在 Mac 关闭后为家庭提供服务。用户已明确授权把凭据加密迁移到自有 NAS，仅限局域网，并要求通过绿联 Docker 项目维护。

## What Changes

- 增加显式 NAS 模式、HTTPS、管理入口认证、精确 Host/Origin 与来源网段限制；默认本机模式不变。
- 支持 Linux 文件密钥保险箱，迁移时重新加密；会话、草稿和同步记录持久保存。
- 提供最小 Docker 镜像、Compose、绿联项目导入步骤、备份恢复与只读验收。
- NAS 模式不开放浏览器跨站凭据交接；官方重新登录后通过受控 SSH 再迁移会话。已有 Cookie 续期继续运行。
- 保留 WebMCP 查询、草稿和预览；真实提交与删除必须由用户在网页确认。
- 按用户后续选择，增加显式 `NAS_AUTH_MODE=lan` 免登录模式，解决内置浏览器原生登录框无法停留的问题；保留 HTTPS、网段、Host、Origin 和写入头校验，默认仍为密码模式。
- 修复外部聊天或导航网站链接被误报 `ORIGIN_DENIED`：允许受限的顶层只读页面导航，API、嵌入和跨站写入继续隔离。

## Capabilities

### New Capabilities

- `nas-deployment`: 经认证的局域网服务、加密迁移与绿联项目生命周期。

### Modified Capabilities

无。现有本机能力保持兼容，NAS 是显式启用模式。

## Impact

Fastify 启动和请求边界、密钥加载、部署与迁移脚本、合成安全测试。沿用 Node 24、React、SQLite、原有 UI；不改手机、不发布公网、不提交任何真实作业作验收。
