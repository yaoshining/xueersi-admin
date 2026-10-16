# 项目协作约定

- 默认使用中文沟通、文档、Issue、PR 和提交说明。
- 使用 Node 24、pnpm workspace，遵守 apps / packages 边界；不更改全局运行时。
- 行为变更先写 OpenSpec proposal / design / specs / tasks，再采用 Red → Green → Refactor。规范不等于已实现，勾选任务必须有证据。
- 运行相关测试及 `pnpm check`；页面变更运行 `pnpm test:e2e`。不得降低门槛来掩盖失败。
- 公共代码和测试只用合成数据。禁止读取、打印或提交真实令牌、家庭资料、截图、APK、抓包、私人报告和协议私密常量。
- 私有资料留在已忽略的 work / outputs / data。提交前检查暂存区并运行 `pnpm check:public`，扫描不能代替人工审阅。
- 不把真实官方写入放进自动测试。新增域名、会话持久化、远程交接及真机写入按具体授权单独处理。
- shadcn 组件遵守 components.json，优先复用；组件更新先查看差异，保留可访问结构及语义化主题。
