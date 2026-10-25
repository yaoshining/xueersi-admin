# Design

## Context

动机见 proposal。Figma 文件 hjLuzBac3FcipoX1ajyvFB 的 8:2–8:7 是六张可编辑 v3 页面；已读取桌面、深色移动、浅色详情设计上下文和截图。现有 React 19 / Vite / Tailwind 4 / Base UI shadcn 保持不变；后端仅提供只读演示和未连接状态。

## Goals / Non-Goals

**Goals:** 建立可扩展响应式工作台、可靠主题与可操作的本地草稿流程；保留所有已有安全边界。

**Non-Goals:** 官方登录与写入、图片识别、远端部署、扩展改版、运行中 Shader。这些不属于本次六张 Figma 页面落地。

## Decisions

- 布局：桌面 224px 侧栏、88px 上下文栏、32px 工作区留白；宽屏双栏详情 336px，1024px 以下移动导航与整页详情。小屏 20px 留白、44px 触控目标，正文可滚动而导航固定，适配安全区。
- 路由：React Router 使用路径区分安排、草稿、同步、家庭设备、设置、详情；日期/孩子/演示参数保留在 URL，返回不会丢筛选；详情刷新可恢复，未知任务显示空态。
- 演示：默认断开不加载样例；用户明确进入后请求现有 demo API。示例孩子 A 使用该列表，B 为空；不得替换真实失败响应为演示成功。日期采用上海业务日，不硬编码设计稿日期。
- 草稿：本轮以版本化 localStorage 保存用户主动输入，经既有 DraftSchema 校验；提示“仅此浏览器保存、未发送”。存储不可用或损坏明确提示且不覆盖已有损坏数据。此选择不新增 API 与真实账号写入，后续可替换 repository 接口为本机后端。提供编辑及单条删除；同步按钮禁用并解释原因。
- 主题：浅色、深色、系统三态；语义色采用 Figma 变量；页面启动时先设置主题，matchMedia 监听系统变更、卸载清理，存储失败降级内存偏好。
- 组件：复用 Button/Card/Badge/Alert/Empty/Skeleton/Separator，CLI 补齐 Select/ToggleGroup/Field/Input/Textarea。Button 仅增加 touch 与 icon-touch 尺寸，保持旧尺寸行为。Lucide 原生图标与 Figma 一致，小书页使用下载后的本地 SVG。
- 动效：useGSAP 限定作用域、清理上下文，220ms 内容进入，reduce 模式不运行位移动画，业务状态不依赖动画结束。
- TDD：先测试业务日、筛选、草稿存储失败与主题解析，再写实现；端到端先编写 v3 验收并确认旧页面失败，再实现页面。保留原有默认断开、显式演示与服务失败测试含义。

## Risks / Trade-offs

- 浏览器草稿不能跨设备共享 → 明示保存位置，数据层独立，为后续后端存储留接入点。
- Figma 未画空态/错误态 → 使用现有 shadcn 语义组件补齐，沿用 v3 token 和间距。
- 首屏需明确进入演示，与 Figma 有少量状态文案差异 → 真实性优先，演示进入后复现六张视觉结构。
- 非首页入口尚无真实业务数据 → 显示未接入说明与可返回路径，避免空按钮或伪成功。

## Migration Plan

无数据库变更。旧首页替换为工作台；主题和草稿使用独立版本化键，不读取旧凭据。可回退前端提交，保留本地草稿数据。验收包括 pnpm check、pnpm test:e2e、pnpm check:public 及桌面/移动双主题截图检查。
