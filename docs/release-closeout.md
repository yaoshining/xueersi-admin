# 规格与公开发布收尾

日期：2026-10-26。本次将已实现的历史变更归档，并让主规格反映当前行为。没有修改 NAS 配置、提交或删除真实作业。

## 变更与证据映射

以下 12 项历史变更的 proposal、design、specs、tasks 均完整，任务均完成。具体 Red/Green 与当时验收结果保留在档案和已有验证文档中；本次不补造失败记录。

| 历史变更                           | 当前实现                                      | 行为测试或验收证据                                                                                                                                           |
| ---------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bootstrap-monorepo`               | 三应用 workspace、契约、领域日期、SQLite 基础 | `apps/api/src/app.test.ts`、`packages/contracts/src/index.test.ts`、`packages/db/src/index.test.ts`、`docs/testing.md`                                       |
| `implement-v3-homework-frontend`   | 工作台、响应式导航、主题、详情及草稿          | `tests/e2e/home.spec.ts`、`appearance.spec.ts`、`apps/web/src/features/homework/model.test.ts`                                                               |
| `persist-drafts-and-read-homework` | 草稿 CRUD/导入、官方只读接入、完整选项        | `apps/api/src/drafts.test.ts`、`readonly.test.ts`、`tests/e2e/backend-drafts.spec.ts`、`readonly.spec.ts`                                                    |
| `retain-local-session`             | 加密保险箱、钥匙串、名称及会话生命周期        | `apps/api/src/session-vault.test.ts`、`keychain.test.ts`、`packages/tal-adapter/src/lifecycle.test.ts`、`tests/e2e/session.spec.ts`                          |
| `animate-workbench-book`           | 标题内立体翻页、GSAP、可选 Shader 及回退      | `tests/e2e/book-motion.spec.ts`、`appearance.spec.ts`                                                                                                        |
| `enable-cookie-session-renewal`    | 受限 Cookie 交接、轮换、并发续期及失败退避    | `apps/api/src/cookie-handoff.test.ts`、`packages/tal-adapter/src/cookie-refresh.test.ts`、`cookie-lifecycle.test.ts`、`docs/session-renewal-verification.md` |
| `sync-drafts-with-confirmation`    | 完整预览、确认、防重、报告及删除              | `apps/api/src/sync.test.ts`、`homework-delete.test.ts`、`tests/e2e/sync.spec.ts`、`report-delete.spec.ts`、`docs/draft-sync-verification.md`                 |
| `calendar-task-overview`           | 月历摘要、手机聚合、进度、全屏滚动            | `apps/web/src/features/homework/calendar-model.test.ts`、`tests/e2e/calendar.spec.ts`、`calendar-preview.spec.ts`、`docs/calendar-design-review.md`          |
| `enable-webmcp-task-tools`         | 工具注册、查询、幂等草稿及预览                | `apps/web/src/features/agent/controller.test.ts`、`register.test.ts`、`apps/api/src/agent-drafts.test.ts`、`tests/e2e/webmcp.spec.ts`                        |
| `batch-sync-and-synced-library`    | 待同步/已同步分类、统一预览与逐条防重         | `apps/api/src/batch-sync.test.ts`、`packages/db/src/sync-persistence.test.ts`、`tests/e2e/batch-sync.spec.ts`                                                |
| `read-homework-submission-media`   | WebMCP 图片与音频内容读取                     | `apps/api/src/homework-media.test.ts`、`media-network.test.ts`、`packages/contracts/src/media.test.ts`、`docs/webmcp-media-verification.md`                  |
| `deploy-private-nas`               | HTTPS、访问模式、独立密钥、迁移及 Compose     | `apps/api/src/nas-security.test.ts`、`nas-https.test.ts`、`file-key.test.ts`、`scripts/nas-transport.test.ts`、`docs/nas-deployment-verification.md`         |

## 主规格与归档顺序

18 个历史能力使用不同路径，没有同路径增量冲突。逐项检查任务及代码后，先按依赖顺序合并 ADDED 要求，再移入 `openspec/changes/archive/2026-10-26-*`；各次移动前检查目标不存在，移动后核验未嵌套。

`reconcile-current-specifications` 是本次新增的文档收尾变更：对 6 个能力的历史限制做显式 MODIFIED，保留未提及要求和全部原场景；修正 3 处 Purpose 的阶段性描述。它不新增产品行为，使用现有行为测试回归，不伪造新 Red。当前能力以 `openspec/specs/` 为准，历史提案继续表达当时范围。

具体对齐：浏览器草稿改为服务端保存、默认页面反映恢复会话、内存模式与加密持久模式分开、默认本机保管与已授权 NAS 迁移分开、读取及续期的只读限制不再否定独立的用户确认写入。

## 本次质量检查

- `pnpm check`：格式、lint、全部工作区类型、42 个测试文件中的 142 项测试、严格规格校验及三端构建通过。
- `pnpm test:e2e`：100 项通过、2 项按设备类型跳过；跳过项分别为手机上的桌面详情关闭按钮、桌面上的手机快捷主题按钮，不是未执行全部 WebGPU 验收。
- 初次完整检查在 HTTPS 合成集成测试监听回环端口时被沙箱以 `EPERM` 拒绝；获得正常本机测试执行权限后同一门槛通过，没有修改或跳过该测试。
- 规格合并初次严格校验指出两处新 Purpose 少于 50 字，已补充用途描述后通过，没有降低严格校验门槛。
- Git 索引公开扫描 294 个文件通过，`git diff --cached --check` 通过。额外独立检查的凭据样式均为合成测试占位；内网地址均是示例网段/拒绝测试，不包含实际部署地址。
- 构建保留现有 Shader 懒加载资源体积提示；不作为检查失败，也未调整体积告警阈值。

## 真实验收边界

- 单条首单经过具体授权发送，官方回读正确；T6 显示及 15 分钟/图片要求依据用户实机反馈，不由自动测试替代。
- NAS HTTPS、重启恢复、官方只读查询及网页 WebMCP 查询/草稿已实测。用户在归档前回复“手机已验证正常”，确认手机访问页面及查看作业正常；这是用户本人反馈，未扩展为上传、手机 WebMCP 或真实删除验收。
- 续期已验证关闭官网后独立换取、Cookie 轮换及重启读取。官方自然拒绝旧令牌后的恢复尚未观察，不承诺永久免登录。
- 批量真实写入、真实删除与真实视频报告仍保留各自验收边界；自动化的最终写入均使用合成运输。规格归档不额外授权这些操作。

## 公开审查

拟发布文件只包含公共工程、合成数据、SVG 及脱敏结论。厂商私有运输、验证器、真实会话/Cookie/密钥、手机/作业截图、录音、SQLite、证书、APK 与私人分析继续留在被忽略目录。新增本地设计技能作为工具依赖保留在工作区，不随产品源码发布；已跟踪的 OpenSpec 技能保留原许可声明。

已人工审阅源代码与测试数据边界、公开文档及部署打包路径，并对 Git 索引执行扫描。凭据仅通过运行时配置加载，私有运输不进入镜像构建上下文；自动扫描不构成完整的安全审计保证。
