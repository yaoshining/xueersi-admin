# Proposal

## Why

工作台当前 GSAP 仅用于页面进入，小书仍为静态 SVG；真实模式新增刷新按钮后，小书与标题分离，移动端也受按钮排序影响。需要交付真正运行的小书动效与稳定位置。

## What Changes

- 小书归入作业标题组，主操作与刷新独立排列，桌面移动及深浅主题一致。
- 用 useGSAP 管理翻页和轻微立体转动、生命周期清理；接入本地 Shaders WebGPU 视觉层，不连接外部设计账号。
- 减少动态效果、WebGPU 不可用、离屏或后台页面时提供静态回退或暂停，不妨碍作业操作。

## Capabilities

### New Capabilities

- `workbench-book-motion`：小书定位、实际动效及性能可访问性回退。

### Modified Capabilities

无已归档能力。

## Impact

Web 标题组件、CSS、可选本地 shaders 依赖及端到端测试；不修改账号会话或作业接口。
