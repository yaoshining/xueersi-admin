# Proposal

## Why

待归档变更分别记录了浏览器草稿、内存只读会话、持久会话、确认写入和 NAS 部署的演进。它们新增的能力有实现与测试证据，但早期能力的限制没有同步替换，直接归档会让当前主规格产生矛盾。

## What Changes

- 将全部已完成变更同步到主规格并归档，历史提案保留当时范围。
- 对齐当前工作台、草稿存储、只读模块、会话和续期的职责，不新增运行行为。
- 记录用户反馈的真机手机验收、规格与代码/测试映射、完整检查及公开审查结果。
- 更新 README 入口与验收边界，不把官方接受、真机反馈和自动化合成测试混为一谈。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-foundation`：默认状态依当前真实连接区分，演示始终显式。
- `homework-workbench`：草稿使用后端持久化，真实能力按实际连接状态显示。
- `local-draft-persistence`：草稿保存不写官方，独立确认同步不再永久禁用。
- `readonly-homework`：短期兼容模式和持久会话分离，读取路径没有官方作业写入。
- `local-session-lifecycle`：默认本机保管与已授权 NAS 迁移职责明确。
- `cookie-session-renewal`：续期只进行认证及只读重试，不扩大为作业写入。

## Impact

仅修改规格和公开文档。现有行为由既有单元、集成、端到端测试复核；不制造虚构 Red 记录，不操作真实作业或 NAS 配置。
