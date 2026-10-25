# draft-storage Specification

## Purpose

为后续每日作业编辑提供本地服务端草稿基础，通过统一的数据校验、版本化SQLite迁移和可测试的存储接口保存内容，保证外部标识精度并在重复保存时避免无意覆盖。

## Requirements

### Requirement: 草稿输入校验

草稿 SHALL 使用字符串标识、真实日历日期、明确科目及非空内容；业务日期按北京时间计算。

#### Scenario: 拒绝不合法输入

- **WHEN** 输入数字孩子标识、不存在的日期或空内容
- **THEN** 校验失败，不进入存储流程

#### Scenario: 北京日期边界

- **WHEN** UTC仍为前一天而北京时间已到次日
- **THEN** 默认作业日期为北京当天日期

### Requirement: 持久化与防覆盖

草稿 repository SHALL 通过版本化迁移建立SQLite表并保存有效草稿，重复ID不得覆盖原记录。

#### Scenario: 重启后读取

- **WHEN** 保存草稿、关闭数据库并重新打开相同文件
- **THEN** 原草稿内容与字符串标识保持一致

#### Scenario: 重复ID

- **WHEN** 尝试用已有ID创建另一份草稿
- **THEN** 明确报错并保留原草稿
