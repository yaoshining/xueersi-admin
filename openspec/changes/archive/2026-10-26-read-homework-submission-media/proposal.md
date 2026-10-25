# Proposal

## Why

现有 WebMCP 只能返回完成报告的附件类型，检查图片和音频还需要逐个打开网页。家长需要在会话中直接读取已提交附件并检查作业。

## What Changes

- 详情返回临时附件引用，新增只读 `read_homework_attachment` 工具，返回图片或音频内容。
- 本机后端按当前会话、孩子、作业和附件序号读取官方报告中的媒体；不接受任意 URL，不把签名地址或凭据交给模型。
- 限制文件大小、类型、超时及网络目标，拒绝过期、未知附件和上下文变化；不落盘缓存。
- 保留网页最终提交和删除确认，自动测试只使用合成附件。

## Capabilities

### New Capabilities

- `homework-submission-media`: 已完成作业的图片、音频只读访问与本机媒体传输。

### Modified Capabilities

无。现有 WebMCP 变更尚未归档，本次扩展其附件类型摘要，继续遵守不返回附件 URL 的约束。

## Impact

影响 contracts、Fastify API、WebMCP controller 和合成单元/E2E 测试。无需改变官方协议、手机系统、认证存储或写入路径；不引入云端识别服务。
