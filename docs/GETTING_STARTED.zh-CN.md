# AI 小镇增强版：运行指南

这是 AI Town 的非官方增强版本，保留原版像素地图、移动、碰撞、对话和向量记忆。首次创建世界会生成 12 位居民。已有居民只添加中文译名和资料译文，不会创建另一套中文角色；所有底层 ID 保持不变。

## 无 API Key 的完整本地体验

需要 Node.js 20/22、npm，以及允许运行本地 Convex 后端的电脑。

```sh
git clone https://github.com/kiva-9/ai-town.git
cd ai-town
git checkout feature/hybrid-npc-intelligence
npm ci
```

第一个终端启动官方 Convex 本地后端，无需注册云账号：

```sh
CI=1 CONVEX_AGENT_MODE=anonymous npx convex dev
```

等待函数部署就绪，保持此终端运行。在第二个终端配置并启动：

```sh
npx convex env set NPC_DECISION_MODE mock
npx convex env set NPC_DIALOGUE_MOCK true
npx convex env set NPC_LANGUAGE zh-CN
npx convex env set NPC_ALLOW_MODE_CONTROL true
npx convex run init '{"numAgents":12}'
npm run dev:frontend
```

打开 Vite 输出的地址，通常是 http://localhost:5173/ai-town/ 。点击居民即可查看人格、目标、情绪状态、关系、重要事件和最近决策。模拟对话有明确的“【模拟对话】”标记，不会产生 OpenAI 费用。

本地 Convex 自动生成的 `.env.local` 需要包含正确的 `VITE_CONVEX_URL`。服务器密钥绝不能使用 `VITE_` 前缀，也不能提交 Git。

## 中文和英文

- 界面默认简体中文，可在页面切换英文，并记住当前浏览器的选择。
- 地图和精灵编辑器也提供语言切换，保存字段、地图 ID 和快捷键含义不变。
- NPC 新对话、摘要、反思和记忆检索默认使用中文。要改成英文，在服务器设置 `NPC_LANGUAGE=en`。
- 浏览器界面语言与全世界 NPC 的生成语言分别控制，避免一个访客切换语言就改掉所有居民。
- 人设以原文为准，只做翻译；自定义资料不会被强行替换。旧的自然语言聊天/记忆保留原文，不批量改写历史数据库。
- 中文使用系统可用的 Noto Sans CJK、苹方、微软雅黑等字体回退，保留原有像素边框和美术资源。已适配长句换行、手机宽度与中文输入法：选字时按回车不会误发消息。

## 三种策略

- **经典（Classic）**：尽量忠实使用原版行为。
- **混合（Hybrid）**：传统效用算法生成合法候选，再由 Decisions API 作结构化选择；失败时安全回退。
- **模拟（Mock）**：固定种子、可复现的离线策略。

策略切换不删除世界。服务器 `NPC_DECISION_ENABLED=false` 是决策功能的总开关。没有 Key 时 Hybrid 自动回退 Mock。

`NPC_ALLOW_MODE_CONTROL=true` 只适合可信的本地环境。上游应用默认无身份认证，公开部署应关闭它，或者先添加仅所有者可用的认证逻辑。

## 接入真实 API

1. 先保持 `NPC_DIALOGUE_MOCK=true`，只验证结构化决策，避免把完整聊天费用混入。
2. 通过 Convex 环境变量页面或安全的本地命令输入服务器 `OPENAI_API_KEY`，不要在聊天、Git 或截图中公开。
3. 对照[官方 Decisions 文档](https://developers.openai.com/api/docs/guides/decisions)核实价格，填写 `.env.example` 中四项 Token 单价。留空或无效价格不会发起请求。
4. 默认模型为 `DECISIONS_MODEL=gpt-6-luna`。配置请求频率、并发与日预算，再切到 Hybrid。
5. 查看面板中的真实返回概率、Token、延迟和执行结果。Mock/传统回退不会伪装成真实 API 成功。

费用上限采用保守预约金额进行请求准入，不是供应商保证的硬性账单上限。建议同时配置 OpenAI 项目预算。暂停世界会阻止新决策，但已经发出的请求无法撤销费用。

要启用真正的自然语言对话和向量记忆，请按原版 README 配置 LLM/embedding，再关闭 `NPC_DIALOGUE_MOCK`。如果 Ollama 负责聊天、OpenAI 只负责 Decisions，应显式设置 `LLM_PROVIDER=ollama`。如使用原版 OpenAI 聊天，初始化向量数据前先按上游要求配置 embedding 维数，不要直接修改已有向量库。

## 测试和复现实验

```sh
npm test -- --runInBand
npm run build
npm run lint
npm run evaluate:npcs -- --seed 42 --steps 120 --out evaluation-output
```

实验输出 JSON 和 Markdown，固定初始状态与事件序列。没有真实 API 时 Hybrid 明确标注为传统回退，不会据此宣称自然程度优于原版。

真实接口冒烟测试需单独设置 `NPC_LIVE_SMOKE=1`、私有服务器密钥和已核实的单价，再运行 `npm run smoke:decisions`。它不在 CI 中自动执行。

## 暂停和数据安全

```sh
npx convex run testing:stop
npx convex run testing:resume
```

不要使用 wipe 命令清理想保留的世界。旧世界会延迟补齐新状态，`init` 不替换已有居民。本地数据库、生成的开发凭证和 `.env.local` 均已被 Git 忽略。

详细限制和实际验收见 [VALIDATION.md](VALIDATION.md)；英文指南见 [GETTING_STARTED.md](GETTING_STARTED.md)。
