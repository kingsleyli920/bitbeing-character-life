# 角色人生（bitbeing-character-life）

BitBeing 面试作业任务 1「角色生活模拟」。导入一张角色卡，系统按章节连续写出这个角色的生活。读者可以设置「故事走向」，从下一章起影响剧情；已写好的章节不会被改写。

- 需求、规则、数据模型、接口、测试计划：[docs/SPEC.md](docs/SPEC.md)
- 评测方法与实际结果（多角色、101 章、走向对比）：[docs/EVALUATION.md](docs/EVALUATION.md)
- **技术方案与架构（Agent、后端、前端、上下文记忆）**：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，PDF 版 [docs/ARCHITECTURE.pdf](docs/ARCHITECTURE.pdf)
- **演示录屏**：[docs/media/demo.mp4](docs/media/demo.mp4)（真实模型，带字幕）；演示脚本与面试说明：[docs/DEMO.md](docs/DEMO.md)、[docs/INTERVIEW.md](docs/INTERVIEW.md)
- 进度与交接：[PLAN.md](PLAN.md)；开发规则：[AGENTS.md](AGENTS.md)

## 交付物一览

| 要求 | 在哪里 |
|---|---|
| 源码、锁文件、环境变量示例、示例角色 | 本仓库；`package-lock.json`；`.env.example`；5 个预置角色在 `server/src/presets/`，导入示例在导入对话框的「填入示例」 |
| 干净环境按 README 启动 | 下面第 1 节；复验记录见 EVALUATION §10 |
| 可操作的页面 | `npm run dev`（真实模型）或 `npm run demo`（带真实生成的演示数据） |
| 测试命令与结果 | 第 3 节；运行记录（提交、用时、通过情况）见 EVALUATION §10 |
| 多角色、101 段、走向控制的评测与代表性段落 | [docs/EVALUATION.md](docs/EVALUATION.md)，全文在 [docs/eval/](docs/eval/) |
| 截图与录屏 | [docs/images/](docs/images/)、[docs/media/demo.mp4](docs/media/demo.mp4) |
| 3–5 分钟演示脚本 | [docs/DEMO.md](docs/DEMO.md) |
| 面试说明 | [docs/INTERVIEW.md](docs/INTERVIEW.md)；完整技术方案 [docs/ARCHITECTURE.pdf](docs/ARCHITECTURE.pdf) |

## 1. 启动

需要 **Node 24**（`.nvmrc`）。不需要数据库服务；数据存在本地 SQLite 文件里，首次启动自动建表并写入 5 个预置角色。

```sh
nvm use 24              # 或用任意方式切到 Node 24
npm ci
cp .env.example .env.local
# 编辑 .env.local，填入 OPENROUTER_API_KEY=sk-or-...
npm run dev             # 打开 http://127.0.0.1:5210
```

- 没有 key 也能体验界面和流程：`npm run dev:fixture`。此时使用确定性假模型，页面右上角显示「Fixture 模式」，正文是测试文本，不是 AI 生成。
- 单端口运行构建版：`npm start`（先构建前端，再由后端在 http://127.0.0.1:3210 同时提供页面和接口）。
- 版本不对时，启动脚本会提示需要 Node 24。
- npm 11 安装时会提示 `esbuild`、`msw` 的安装脚本未被批准（`install-scripts`），可以忽略：项目不依赖这两个脚本，测试和运行都已在干净目录里验证过。

### 配置（`.env.local`，只在服务端读取）

| 变量 | 默认 | 说明 |
|---|---|---|
| `OPENROUTER_API_KEY` | — | 必填（真实模型）。不会发给前端，也不会写进日志 |
| `STORY_MODEL` | `anthropic/claude-haiku-5.5` | 也可用 `deepseek/deepseek-v4-pro` |
| `BUDGET_USD_CAP` | `10` | 本地累计费用上限（美元），达到后不再调用模型 |
| `CONSISTENCY_CHECK` | `on` | 每段保存前用模型检查一次前后矛盾（每段多一次低价调用，约多 5–8 秒）；`off` 关闭 |
| `PORT` / `WEB_PORT` / `DB_PATH` | 3210 / 5210 / `data/dev.db` | 同时跑多份时改成不同的值 |

其余配置（超时、重试次数、上下文预算、并发）见 [SPEC §4.5](docs/SPEC.md#45-配置serversrcconfigts-集中读取envlocal-用-processloadenvfile-加载默认值写在代码里)。

## 2. 怎么用

页面布局按作业文档的参考交互：左边「角色卡信息」，右边「角色生活故事」。

1. 左栏顶部切换角色（5 个预置角色 + 你导入的角色）。「导入角色」支持粘贴一段描述、自定义 JSON、酒馆（SillyTavern）角色卡 JSON，每种格式都有「填入示例」，校验错误逐字段显示；目前**不支持** PNG 图片卡。导入后系统会在后台补全设定，[推理]/[想象] 标出哪些是推断出来的（鼠标悬停可看依据）。
2. 右栏底部「点击开始生成」写第一段，之后「点击继续生成」。生成一段通常需要 20–60 秒（写作、校验、一致性检查，发现矛盾会自动重写），会显示进度；失败时说明原因、可以重试，已有段落不受影响。
3. 右上角「故事走向」：输入一句方向，例如「更悲惨一点」「更多的感情故事」「让 TA 遇到一次事业挫折，但不要突然改变性格」。新走向从下一段开始生效，可以随时清除；每段底部可以展开「本段走向」，查看模型如何落实。
4. 左栏「记忆」：人物、未解决的承诺和线索、重要事件、性格变化、卷摘要。每条都标了来源段落，点击可以跳回原文。
5. 「更多」：目录跳转、导出全文 Markdown、开始同一角色的新故事、切换到其他故事。

## 3. 测试

```sh
npm run typecheck
npm run test:fast            # Vitest：后端单元/功能/E2E、契约、前端单元/功能
npx playwright install chromium
npx playwright test          # 前端 E2E（mock 后端）、全栈 E2E、视觉回归
npm run test:all             # 以上全部（密钥扫描 → typecheck → Vitest → Playwright）
npm run check:secrets        # 单独扫描：已跟踪/暂存的文件里有没有 API key 或本机路径
```

API key 只放在 `.env.local`（已被 `.gitignore` 忽略）。`npm run check:secrets` 会扫描所有提交的文件（包括 `demo/demo.db`、PDF 这类二进制文件），同时检查有没有本机用户目录路径；执行一次 `git config core.hooksPath .githooks` 后，每次 commit 前都会自动扫描，发现 key 就拒绝提交。

| 层 | 脚本 | 内容 |
|---|---|---|
| L1a 后端单元 | `test:be:unit` | 上下文预算、角色卡解析、输出校验、OpenRouter 错误分类 |
| L1b 后端功能 | `test:be:ft` | 任务去重/并发/过期结果/重试/重启/事务回滚/费用上限（T1–T10），101 章上下文 |
| L1c/L1d 前端 | `test:fe:unit` / `test:fe:ft` | 双击只发一次、网络重试同 requestId、各状态、导入、走向 |
| L2 前端 E2E | `test:e2e:web` | 真实浏览器 + mock 后端：重试、刷新不重发、手机布局 |
| L3 后端 E2E | `test:e2e:api` | 真实进程：强杀重启、101 章（fixture）、持久化 |
| L4 契约 | `test:contract` | 前端 api client 对真实后端，所有响应用共享 schema 校验 |
| L5 全栈 + 视觉 | `test:e2e:ui` / `test:visual` | 真实前后端与数据库（fixture 模型）+ 截图基线 |

视觉基线在 macOS 上生成（文件名带 `-darwin`），其他系统第一次运行会提示缺少基线。

最近一次完整运行结果见 [docs/EVALUATION.md](docs/EVALUATION.md#10-测试运行记录)。

### 真实模型评测（花钱，不在 `test:all` 里）

```sh
npm run eval -- smoke              # 1 个角色 3 章
npm run eval -- multi              # 5 个角色各 8 章
npm run eval -- direction          # 同一历史分 3 个走向分支
npm run eval -- long               # 101 章 + 中途强杀重启
npm run eval -- injection          # 角色卡/走向里的注入文字
npm run eval -- long --fixture     # 不花钱，只验证流程
npm run eval:audit -- eval/out/long/app.db   # 离线审计：生活面分类 + 前后矛盾 + 星期连续性，可对比不同版本
```

每个场景有自己的数据库和费用上限（`--max-cost`），可以断点续跑；用 `--max-calls N` 限制本次调用次数，`--fresh` 重新开始。结果在 `eval/out/<场景>/`（报告 `report.json`、全文 `*.md`、服务日志）。

## 4. 架构

```
web (React + Vite)  ──HTTP──>  server (Fastify)  ──>  SQLite (node:sqlite)
      │                           │
      └──── shared (zod schema：接口契约、角色卡、模型输出) ────┘
                                  │
                                  └──>  OpenRouter（Claude Haiku 5.5，结构化 JSON 输出）
```

- `shared/`：前后端共用的 zod schema。请求、响应、模型输出在边界都做运行时校验。
- `server/`：路由层很薄。核心逻辑在 `services/`：
  - `context-builder`：按预算组装上下文；
  - `generation`：任务运行、重试（把上次被拒的原因告诉模型）、事务提交；
  - `consistency`：保存前的一致性检查；
  - `memory-apply`：记忆合并；
  - `arc-summary`：卷摘要。
  - 模型接入在 `model/`（OpenRouter + fixture）。
- `web/`：单页工作台（左「角色卡信息」、右「角色生活故事」）、导入对话框、走向弹出框；react-query 负责请求与轮询。
- 一次生成 = 一次写作调用 + 一次一致性检查。写作调用返回 JSON：正文、日期、生活面、摘要、状态、记忆增删、性格变化、走向说明。服务端校验通过、一致性检查没有发现明确矛盾后，在**一个事务**里写入全部内容；有矛盾就带着矛盾原文重写。

上下文与记忆的设计、可靠性规则详见 [SPEC §2–§3](docs/SPEC.md#2-故事生成与记忆)，设计取舍见 [docs/INTERVIEW.md](docs/INTERVIEW.md)。

## 5. 已知限制

- 只支持 OpenRouter（OpenAI 兼容的 Chat Completions）一种真实模型接入；结构化输出是否被严格遵守取决于上游服务商，所以服务端一定会再校验，不合格就重试。
- 生成任务在服务进程内执行，同一个数据库文件只能由一个服务进程使用。进程被强杀时，进行中的那次模型调用不会记入费用统计。
- 不支持酒馆 PNG 角色卡、编辑已导入的角色卡、改写或删除单章。
- 视觉基线只在 macOS 上生成。
- 故事质量（真实模型评测，详见 EVALUATION §0、§4）：101 段里仍有约 12 处前后矛盾，多是钱和物品的账；“追查旧事”仍是占比最大的主线（47%）；时间跳跃偏机械，多为两周一跳。
- 一段要 20–60 秒，没有流式显示正文。
- token 预算是按字符估算的（中文每字 1 token），不是精确计数。
