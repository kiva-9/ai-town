# 文档索引 · Documentation

[项目首页](../README.md) · [English overview](../README.en.md)

当前文档面向已包含混合 NPC 和中文体验的 `main` 分支。优先从运行指南开始，历史上游部署说明单独保留。

## 运行与配置

- [中文运行指南](GETTING_STARTED.zh-CN.md)：本地 Mock、语言切换、真实 API、数据保护。
- [English setup guide](GETTING_STARTED.md): local Mock, providers, security and operation.
- [环境变量示例](../.env.example)：区分前端 URL 与服务端配置，不含真实凭证。
- [Decisions API](DECISIONS_API.md)：请求与响应验证、重试、价格和预算边界。

## 实现与设计

- [世界引擎架构](../ARCHITECTURE.md)：原版模拟引擎、数据、输入和客户端。
- [混合 NPC 架构](HYBRID_ARCHITECTURE.md)：策略、队列、执行确认、关系与兼容性。
- [上游审计](UPSTREAM_AUDIT.md)：基线与修改范围。
- [中文本地化审计](LOCALIZATION_AUDIT.zh-CN.md)：界面、NPC 生成语言与资料保留。

## 测试与证据

- [实际验收](VALIDATION.md)：已验证、未验证及环境限制。
- [图形验收](GRAPHICAL_QA.zh-CN.md)：实际操作记录、截图与移动端/输入法边界。
- [可复现实验方法](EVALUATION.md)与[样例结果](evaluation-results/evaluation.md)。
- 原始验收数据：[运行时](runtime-validation.json)、[中文运行时](chinese-runtime-validation.json)、[字形覆盖](chinese-font-validation.json)。

验收报告是指定日期和条件下的记录。CI 离线通过不等于真实 API 可用，也不证明生产部署或自然语言质量。

## CI 与可选部署参考

唯一的 GitHub workflow 是
[Hybrid NPC checks](../.github/workflows/hybrid-npc.yml)。它执行 Jest、编辑器测试、构建、lint 和离线实验，产物仅为实验报告，不进行部署或真实 API 调用。

[上游历史 README](UPSTREAM_README.md)保留了 Docker、自托管、LLM 提供商、Windows、Fly.io/Vercel 等说明与完整署名。仓库中的
[Docker Compose](../docker-compose.yml)、[Fly.io](../fly/README.md) 和
[Vercel 配置](../vercel.json)仍是可选参考；本版本未做公共生产部署验收。不要将历史 wipe 命令当作升级步骤。

上游 Demo 不是本增强版的在线实例；本次文档整理没有启用任何部署服务。
