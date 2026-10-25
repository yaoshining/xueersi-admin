# Design

## Context

详情工具已有完成报告读取和会话稳定性校验，但只映射 kind/state。后端报告通过适配器校验当前孩子和已完成状态。参见 proposal.md。

## Goals / Non-Goals

**Goals:** 在当前页面工具上下文内读取原始图片、音频；错误可区分，结果不含官方 URL、标识或凭据。

**Non-Goals:** 视频解析、自动评分引擎、云端语音转写、官方写入和附件长期存储。

## Decisions

- `get_homework` 为可用图片/音频生成随机 attachmentRef，绑定 taskRef、会话、序号与五分钟有效期；重复获取详情撤销该作业旧引用。
- `read_homework_attachment(contextRef, attachmentRef)` 只读一个附件，返回文本元信息及 MCP image/audio 内容块。业务 execute 返回经 schema 校验的 base64，以兼容测试与宿主序列化。无 URL 输入输出。
- 后端 POST `/api/v1/homework/attachment` 接收当前会话标识、孩子、日期、作业、序号和报告附件指纹；再次读取报告核对指纹，防止报告重排读错附件。前端指纹只在 controller 内部保存。
- 下载模块只读取报告给定的 HTTPS 443 地址，使用固定的公网 IPv4 DNS 解析结果建立 TLS 连接，禁止重定向、Cookie、Authorization 和代理转发；拒绝非公网地址，避免 SSRF 和 DNS 重绑定。不直接开放远程 URL。
- 每次最多 16 MiB、30 秒、最多两个并发下载；检查 MIME 与文件签名，不把 HTML/SVG 当作图片。请求中断和会话变化不返回内容。文件只在内存处理，响应 no-store。
- 不新增 UI 组件；沿用现有网页报告，WebMCP 在桌面和移动端、深浅主题下共享能力。

## Risks / Trade-offs

- [宿主不支持直接呈现音频] → 仍返回可解码的音频内容；实际听写能力和附件读取成功分别报告，不把自动转写当作正确性证明。
- [签名链接刷新或顺序变化] → 指纹不匹配返回安全错误，重新读取详情获取引用。
- [只提供 IPv6 或超大媒体] → 明确读取失败，保留网页查看路径；不降级到不受限下载。
- [模型误解附件内容] → 工具声明内容不可信；检查结论区分清楚、模糊和无法判断。

## Migration Plan

无需数据库迁移。测试后构建并重启本机服务，刷新页面重新注册工具；旧构建可回滚，已有草稿和会话不受影响。
