# 贡献约定

文档、Issue、PR 和提交说明优先使用中文。代码标识使用清晰的英文。

## OpenSpec SDD

新功能或行为变化先创建变更：

```sh
pnpm exec openspec new change <change-name>
pnpm exec openspec status --change <change-name>
```

按 CLI 指示完成 proposal、design、specs 和 tasks；规格使用 Requirement / Scenario / SHALL / WHEN / THEN 结构，正文中文。提交代码前运行 `pnpm spec:validate`。开发完成后核对每个场景、更新任务，按 OpenSpec 工作流归档并同步正式规格。不要仅凭文档齐全就标记实现完成。

## TDD

1. 编写描述可观察业务行为的失败测试，运行并确认失败原因正确。
2. 实现最小可用行为，运行测试至通过。
3. 重构并执行相关回归，记录命令、Red / Green 结果和未覆盖边界。

使用 Vitest / Fastify inject 测试领域与 API；数据库测试使用临时目录；Playwright 验证桌面和移动视口。测试不得读取本机真实会话、拨打官方写接口或修改学习机作业。新协议适配器必须使用合成样例、注入网络实现。

## 提交前

```sh
pnpm check
pnpm test:e2e
# 只暂存已经逐项审阅的代码和公开文档
pnpm check:public
```

检查暂存区差异。不得提交个人信息、邀请链接、令牌、APK、抓包、截图、真实作业或完整官方响应。错误日志同样只保留规则名称和非敏感元数据；不要把敏感匹配值复制到 Issue。PR 说明包含规格关联、行为变化、测试证据和已知限制。

shadcn 组件由 CLI 管理，遵守 `components.json` 的 base、路径及主题。业务界面使用语义化颜色、可访问的标题和真实错误/加载状态；演示数据只能在用户明确进入演示模式后出现。
