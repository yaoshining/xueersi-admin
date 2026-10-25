## MODIFIED Requirements

### Requirement: 演示数据可识别

Web SHALL 支持响应式界面，只有显式进入演示模式才展示合成作业，并显示演示标识；健康状态反映实际本机API状态。

#### Scenario: 打开首页

- **WHEN** 用户在没有有效会话时访问默认首页
- **THEN** 页面显示未连接状态及演示入口，不把样例作业当作真实作业

#### Scenario: 进入演示

- **WHEN** 用户点击演示入口
- **THEN** 页面从独立演示API获得合成列表，并清晰显示演示模式
