# Proposal

## Why

已有独立后端只读验证，需要把研究原型转为可开源、可测试、可独立运行的项目基础。Web 管理端与浏览器扩展必须分别构建，真实账号材料不得进入仓库。

## What Changes

- 初始化 pnpm workspace：web、api、extension 三个应用与 contracts、domain、tal-adapter、db 共享包。
- 提供明确标记的合成作业演示、连接未建立的 API 状态及仅导航的扩展入口。
- 建立 SQLite 草稿存储基础、接口校验与服务端适配边界。
- 加入 OpenSpec、TDD、格式/类型/测试/构建检查、GitHub Actions、MIT 许可证和公开内容检查。

## Capabilities

### New Capabilities

- `workspace-foundation`: 三端独立构建、共享契约、初始化 API 和演示 Web。
- `draft-storage`: 草稿校验、SQLite 存储及重复标识保护。
- `public-release-quality`: 公开内容隔离、规格与自动化检查、TDD 记录。

### Modified Capabilities

无。

## Impact

新增应用、共享包、CI 与贡献规范。保留本机实验目录但忽略提交。真实账号登录、会话交接和官方读写适配保持后续变更范围。
