# Design

## Context

仓库目前只有方案与本机研究材料。Node.js 已验证可独立读取，但公开初始化不得携带真实凭据、协议签名常量或账号数据。采用独立网页、API 和仅导航的扩展入口。

## Goals / Non-Goals

**Goals:** 三应用独立开发与构建；前后端共享 Zod；SQLite 草稿基础；手机可用的演示页；默认断开官方连接；pnpm、OpenSpec 和 CI 可复现；公开MIT仓库。

**Non-Goals:** 本次不实现学而思真实登录、交接、读写、上传；不部署到公网；不将演示任务称为真实数据；不发布扩展商店。

## Decisions

- pnpm workspace，Node 24 LTS；React 19 / Vite / shadcn(ui Base UI)，Fastify 5，WXT MV3（原生 TypeScript 弹窗）。
- 共享包以 TypeScript 源码出口供 Vite/tsx 消费，API 由 esbuild 打包为服务端 ESM；原生 SQLite 依赖外置。类型检查单独执行。
- Web 使用 React Router 与 TanStack Query；合成数据从独立 demo 路径读取，常规 homework 返回503且不发起外部请求。
- API 默认绑定127.0.0.1。生产可提供Web静态资源；SPA回退只作用于非API GET，API未找到保持404。
- 初期扩展无host_permissions、无content scripts，只通过用户点击打开本机管理端。后续会话交接以新OpenSpec变更实现。
- SQLite 使用better-sqlite3和版本化迁移；仅实现draft repository，不暴露未经认证的持久化写接口。
- TDD覆盖契约拒绝非法输入、缺失会话的请求边界、数据库持久化/重复ID、接口响应、演示标识及扩展导航白名单。
- 演示由虚构数据组成，CI无真实账号和官方请求；work与outputs均忽略提交，公开记录使用独立脱敏总结。

## Risks / Trade-offs

- better-sqlite3为原生模块，CI/本机需验证Node24安装与构建。
- 初始工程不含管理系统认证，所以服务仅本机开放；远程使用前必须实施认证/HTTPS。
- 关闭写权限不代表协议兼容；真实连接能力仍需后续规格和用户授权验收。
