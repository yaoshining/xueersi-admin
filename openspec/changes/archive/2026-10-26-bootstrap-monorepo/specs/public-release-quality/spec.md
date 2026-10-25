# Spec Delta

## Purpose

为公开协作建立可追踪的规格、测试与发布检查，使功能变更在实现前具备可验证场景，并确保研究过程中产生的私密材料不被提交，公开示例仅包含合成数据及必要的技术结论。

## ADDED Requirements

### Requirement: 规格驱动与测试驱动

项目 MUST 记录OpenSpec proposal、design、specs和tasks，行为实现前先运行失败测试，再实现并通过对应回归。

#### Scenario: 初始化变更验收

- **WHEN** 初始化完成
- **THEN** 能查到对应场景、红绿测试记录及通过的规格校验

### Requirement: 公开内容隔离

仓库 MUST 忽略本地实验、账号截图、APK、环境密钥、数据库及上传文件，并对待发布文件执行敏感内容检查。

#### Scenario: 本地研究文件存在

- **WHEN** 工作目录仍保留私有研究材料
- **THEN** git跟踪文件和公开提交均不包含这些材料

### Requirement: 自动化质量检查

CI SHALL 对推送和PR执行锁文件安装、OpenSpec验证、格式、lint、类型、测试、构建及合成数据端到端测试，不需要真实账号。

#### Scenario: 不提供官方凭据

- **WHEN** CI没有任何学而思令牌
- **THEN** 全部初始化质量检查可以完成
