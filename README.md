# 学伴 · 学而思家长端管理系统

面向每日作业的非官方、自托管管理工具。目标是通过独立网页整理、查看并同步作业到学习机，无需常驻模拟器。项目与学而思无隶属或官方合作关系。

**当前为工程初始化版本。** 已有响应式网页、Node API、浏览器扩展骨架、SQLite 草稿仓储和自动化质量检查。网页默认未连接，点击“查看演示作业”才展示合成数据。目前不能连接真实账号或上传作业，扩展也不会读取网站会话。

## 技术栈与结构

pnpm monorepo、Node.js 24、TypeScript strict、React 19 / Vite / shadcn/ui（Base UI）、Tailwind CSS 4、TanStack Query、Fastify 5、SQLite / Drizzle、WXT（Manifest V3）。React Router、React Hook Form、Zod 用于后续页面及表单扩展。

```text
apps/
  web/            响应式管理端
  api/            本机 HTTP API 与静态页面服务
  extension/      浏览器扩展，独立构建
packages/
  contracts/      Zod 数据契约
  domain/         独立业务规则
  tal-adapter/    官方接入边界；当前为明确断开状态
  db/             草稿仓储与版本化 SQL 迁移
openspec/         SDD 规格、提案、设计和任务
scripts/          公开内容检查
tests/e2e/       桌面及移动视口测试
```

详细边界见 [架构说明](docs/architecture.md)。

## 本机运行

需要 Node **24.22.0**（见 `.node-version`）和 pnpm **11.15.0**。SQLite 预编译模块下载不可用时需要本机 C++ 工具链。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 `http://127.0.0.1:5173`，Vite 将 `/api` 代理到 `127.0.0.1:3000`。在单一端口运行构建产物：

```sh
pnpm build
pnpm start
```

打开 `http://127.0.0.1:3000`。当前服务固定监听本机地址，尚无管理端身份验证；其他设备访问和远程部署将在独立规格中实现。

### 浏览器扩展

```sh
pnpm dev:extension
# 或构建全部项目后手动加载 apps/extension/.output/chrome-mv3
```

在 Chrome 扩展管理页开启开发者模式，选择“加载已解压的扩展程序”。扩展按钮只打开本机 `3000` 端口，需先运行 `pnpm start`。生产清单无网站权限、Cookie 权限、内容脚本或后台脚本；开发时 WXT 可能注入开发工具，不应将开发包发布。

### 当前 API

| 地址                        | 行为                                      |
| --------------------------- | ----------------------------------------- |
| `GET /api/v1/health`        | 本机服务健康状态                          |
| `GET /api/v1/connection`    | 未连接、不可读、不可写                    |
| `GET /api/v1/homework`      | `503 CONNECTION_REQUIRED`，不访问官方服务 |
| `GET /api/v1/demo/homework` | 明确标记 `demo` 的三条合成作业            |

草稿仓储已有增查和持久化测试，尚未暴露 HTTP 写接口或编辑页面。数据库字段中的孩子标识使用字符串；业务日期为 `Asia/Shanghai`。

## 规格与质量

使用 **OpenSpec SDD + TDD**：先提案和可验收场景，再写失败测试，实现最小通过，最后重构和回归。初始化变更在 `openspec/changes/bootstrap-monorepo/`，工作流指令位于 `.agents/skills/`。

```sh
pnpm check                  # 格式、lint、类型、测试、规格和三端构建
pnpm exec playwright install chromium
pnpm test:e2e               # 启动构建后的服务，桌面和移动视口验收
pnpm check:public           # 检查 Git 索引中的公开内容
```

参阅 [贡献约定](CONTRIBUTING.md)、[测试记录](docs/testing.md) 和 [安全与数据边界](SECURITY.md)。CI 只使用合成数据，不需要真实账号。

## 后续里程碑

1. 本系统登录和安全会话交接，接入只读作业列表。
2. 群消息整理、草稿编辑与提交预览。
3. 文字作业单条同步、重复提交保护和结果核对。
4. 图片附件与真机接收验证、多端访问和部署。

先前探索支持后端独立读取的方向；真实账号协议尚未迁入此仓库。会话续期、创建作业和图片上传不能据此视为已完成。

## 开源与隐私

采用 [MIT License](LICENSE)。公开仓库只包含原创工程代码、开源组件和合成示例；不包含 APK、厂商反编译源码、协议私密常量或私人响应。`work/`、`outputs/`、`data/`、本机环境配置、证书和数据库均禁止提交。自动扫描不能替代人工审阅。
