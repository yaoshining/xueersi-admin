# workspace-foundation Specification

## Purpose

提供学而思家长管理系统的公开工程基础，使网页、API和浏览器扩展能够独立运行和构建，同时通过共享契约保持数据一致，使用明确标记的合成数据演示页面并避免暗中调用真实账号。

## Requirements

### Requirement: 独立应用及统一检查

系统 SHALL 通过 pnpm workspace 管理 web、api、extension 三个独立应用，并提供根目录统一的类型、格式、测试和构建命令。

#### Scenario: 干净环境构建

- **WHEN** 在 Node 24 上按锁文件安装依赖并运行统一检查
- **THEN** 三个应用分别产出Web静态文件、API程序与MV3扩展构建，且检查成功

### Requirement: 无会话时不访问官方接口

API SHALL 在默认未连接状态返回可识别的连接错误，且不发送学而思网络请求。

#### Scenario: 未连接读取作业

- **WHEN** 客户端请求真实作业列表但未建立会话
- **THEN** 返回503及 CONNECTION_REQUIRED 错误，不返回令牌也不尝试外部请求

### Requirement: 演示数据可识别

Web SHALL 支持响应式界面，只有显式进入演示模式才展示合成作业，并显示演示标识；健康状态反映实际本机API状态。

#### Scenario: 打开首页

- **WHEN** 用户在没有有效会话时访问默认首页
- **THEN** 页面显示未连接状态及演示入口，不把样例作业当作真实作业

#### Scenario: 进入演示

- **WHEN** 用户点击演示入口
- **THEN** 页面从独立演示API获得合成列表，并清晰显示演示模式

### Requirement: 扩展最小权限

扩展 SHALL 独立构建，仅在用户点击时打开固定本机管理端，初始版本不读取网站会话或申请网站访问权限。

#### Scenario: 检查扩展产物

- **WHEN** 构建MV3扩展并查看manifest
- **THEN** 不含host_permissions、cookies、content_scripts和会话后台，仅提供操作入口
