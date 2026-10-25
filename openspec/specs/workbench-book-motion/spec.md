# workbench-book-motion Specification

## Purpose

为工作台提供布局稳定、尊重减少动态效果的立体翻页插图，并在 GPU 不可用时保持完整可见；通过动画暂停和资源清理避免装饰层阻碍作业管理及触摸操作。

## Requirements

### Requirement: 标题内稳定的小书位置

工作台 SHALL 把装饰小书放入标题组，并将操作按钮独立布局，在桌面、移动端及深浅主题中保持可见且不遮挡交互。

#### Scenario: 移动端标题和操作

- **WHEN** 用户在 375px 宽视口打开作业安排
- **THEN** 小书与标题同行，主操作另行排列且页面没有横向溢出

### Requirement: 真正翻页及渲染回退

小书 SHALL 使用 useGSAP 管理翻页立体变换，并在支持 WebGPU 时加载 Shaders 视觉层；无 WebGPU 时仍显示完整小书和 GSAP 动效。

#### Scenario: 正常动态效果

- **WHEN** 页面可见且用户未要求减少动态效果
- **THEN** 书页变换随时间变化，布局边界保持稳定

#### Scenario: 可访问性和资源释放

- **WHEN** 用户要求减少动态效果或页面不可见
- **THEN** 动画暂停，减少动态效果时保留静态小书且不创建 GPU 渲染层，卸载后清理动画与监听
