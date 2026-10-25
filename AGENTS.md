# AGENTS.md — 在本仓库工作的规则

先读本文件，再读 `docs/SPEC.md` 中与任务相关的章节。SPEC 是业务规则、接口契约和测试计划的唯一来源；任务说明与 SPEC 冲突时，停下来报告，不要猜。

## 环境（每个 shell 命令）

```sh
source ~/.nvm/nvm.sh && nvm use 24 >/dev/null   # 系统默认 Node 是 v26；本项目用 24（.nvmrc）
```

- 不全局安装任何东西，不改 nvm 别名、shell 配置或 brew。
- 依赖版本精确固定（`.npmrc`：`save-exact`，`before=2026-10-10`）。新增依赖先写进 SPEC §4.1。
- 并行工作（多个 worktree）时，各自设置 `PORT`、`WEB_PORT`、`DB_PATH`。

## 命令

| 用途 | 命令 |
|---|---|
| 安装 | `npm ci` |
| 开发（server :3210 + web :5210） | `npm run dev` |
| 离线开发（假模型） | `npm run dev:fixture` |
| 类型检查 | `npm run typecheck` |
| 快速测试 | `npm run test:be:unit` / `test:be:ft` / `test:fe:unit` / `test:fe:ft` / `test:e2e:api` / `test:contract` |
| Playwright | `npm run test:e2e:web` / `test:e2e:ui` / `test:visual` |
| 全部 | `npm run test:all` |
| 真实模型评测（花钱） | `npm run eval -- <scenario> [--max-calls N] [--max-cost USD]` |

先跑快速测试，全过后才跑 Playwright。

## 不变量（违反即为阻塞级问题）

1. 故事数据的 SQL 都带 `story_id = ?`；仓储函数第一个参数是 `storyId`。跨故事访问返回 **404**。
2. SQL 全部参数化。
3. 任务去重靠 `INSERT` + `UNIQUE(story_id, request_id)` 抢占，不能先查后插。
4. 章节、状态、记忆、性格变化、走向说明在**同一事务**写入；提交前检查任务仍为 `running`、故事版本与目标章号匹配（SPEC T3）。出错显式 `ROLLBACK`。
5. 模型输出必须经过 `shared/src/draft.ts` 的 zod 校验和服务端硬校验后才能落库。
6. 角色卡和走向只能出现在 prompt 的数据区；故事模型不提供任何工具。
7. API key 只在服务端从环境变量读取；不进前端、日志、截图、提交。
8. npm 脚本跨平台：不写 `FOO=bar cmd`，默认值放在代码里。
9. `shared/` 的 schema（接口契约）只由主 Agent 修改。
10. 每个数据视图都有加载、空、错误状态。

## 边界

- **必须**：只改任务范围内的文件；新增行为都写测试；运行测试命令并在报告里贴出输出。
- **测试先行**（核心逻辑）：`shared/`、上下文组装、记忆合并、输出校验、任务运行与提交、角色卡导入。UI 可与实现同一提交补测试。
- **修 bug**：先复现、定位原因，再修改。不能用跳过测试或放宽断言掩盖问题。
- **禁止**：提交到 `main`（子 Agent）、推送、强推、更新视觉基线（`--update-snapshots`）、跳过或削弱失败的测试、在 fixture 结果上声称“真实模型通过”。
- **真实模型调用**会花钱：只有 L6 评测和主 Agent 手动验证可以调用；单测、功能测试、Playwright 一律用假模型。

## 提交

- Conventional Commits：`feat(server): …`、`test(shared): …`、`fix(web): …`、`docs: …`、`chore: …`。
- 一个提交一个逻辑变化，尽量 ≲300 行（锁文件、截图除外）。按层拆分：schema → 仓储/服务 → 路由 → UI。
- 里程碑在 `m<N>-<topic>` 分支开发，主 Agent 验证后合并到 `main` 并推送到私有远端。

## Skills

| 任务 | Skills（`.claude/skills/`） |
|---|---|
| 后端 | `fastify-best-practices`、`test-driven-development` |
| 前端 | `frontend-ui-engineering`、`test-driven-development` |
| 测试 | `playwright-skill`、`test-driven-development` |
| 修 bug | `systematic-debugging` |
| 报告完成前 | `verification-before-completion` |

来源与项目覆盖规则见 `.claude/SKILLS_PROVENANCE.md`，项目规则优先于 skill 文本。

## 交接

换会话或上下文不足前，在 `PLAN.md` 末尾「交接」一节写：当前分支、改动、已跑测试及结果、未完成事项、下一步、证据位置。恢复时先检查实际代码和运行状态，不只相信交接摘要。
