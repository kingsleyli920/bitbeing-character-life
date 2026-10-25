# Skills 来源与项目覆盖规则

以下 skills 于 2026-10-24 从本人上一个项目 cert-admin-console 的 `.claude/skills/` 复制。那份副本在 2026-10-20 已人工审查过（来源仓库、提交号与删减内容见下表），本次没有从网络重新下载，也没有执行其中任何脚本。复制后重新扫描：唯一的非 Markdown 文件是 `systematic-debugging/condition-based-waiting-example.ts`（示例代码，不执行）；`playwright-skill` 中命中 `curl`/`npx` 等关键词的位置都是文档里的代码示例。

| Skill | 原始来源 | 提交 | 保留内容 | 修改 |
|---|---|---|---|---|
| `test-driven-development` | obra/superpowers | `b739a8a` | SKILL.md、writing-good-tests.md | 无 |
| `systematic-debugging` | obra/superpowers | `b739a8a` | SKILL.md + 3 篇技巧 + example.ts | 删去 `find-polluter.sh` 等 |
| `verification-before-completion` | obra/superpowers | `b739a8a` | SKILL.md | 无 |
| `frontend-ui-engineering` | addyosmani/agent-skills | `aeac41d` | SKILL.md、references/accessibility-checklist.md | 引用路径改为本地 |
| `fastify-best-practices` | mcollina/skills `skills/fastify` | `c75d70d` | SKILL.md + 15 个规则文件 | 删去 websockets、http-proxy 等 |
| `playwright-skill` | testdino-hq/playwright-skill | `178d1cb` | SKILL.md + core/frontend/qa/ci 子集 | 索引裁剪为已安装的指南 |

未复制：`api-and-interface-design`、`code-review-and-quality`、`receiving-code-review`、`using-git-worktrees`、`user-stories`（本项目用不上，或已由 AGENTS.md 覆盖）。

## 项目覆盖规则（项目规则优先于 skill 文本）

1. **TDD 范围**：核心逻辑严格测试先行（SPEC §5 与 AGENTS「边界」所列）；UI 骨架和布局可以与实现同一提交补测试。
2. **Mock 自己的应用**：`playwright-skill` 建议不要 mock 自己的应用；本项目有意保留 `web-mock` 层（L2），`fullstack` 与 `visual` 层不 mock 后端，只用确定性 fixture 模型代替外部 AI。
3. **测试运行器**：`fastify-best-practices` 示例用 `node:test`；本项目用 Vitest + `fastify.inject()`。
4. **UI**：不使用组件库；纸书感阅读界面，样式见 SPEC §4.6，不照搬 skill 示例里的 Tailwind 类名。
5. **Playwright 版本**：固定 1.64.0，可以使用标注为 1.64 的 API；不得使用更新版本的 API。
6. **审查与合并**：主 Agent 亲自审查每个子 Agent 的 diff 并运行验证；子 Agent 不合并、不推送。worktree 由主 Agent 用 `git worktree add ../bitbeing-worktrees/<branch> -b <branch> main` 创建后交给子 Agent。
7. **不得增加审批停顿**：任何 skill 中“每一步等待人工确认”的流程不适用；需要停下的情况只按 AGENTS.md 处理。
