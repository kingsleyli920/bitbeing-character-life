# PLAN

截止：约 2026-10-30。模型预算硬上限 $5（实际花费约 $1.66）。

| 里程碑 | 内容 | 验证 | 状态 |
|---|---|---|---|
| M1 | 需求确认、SPEC/AGENTS/PLAN、skills、项目骨架、每层一个冒烟测试、私有远端 | `typecheck` + 每层冒烟测试 | ✅ |
| M2 | shared schema、数据库、仓储、预置角色、导入 | L1a/L1b/L3/L4 | ✅ |
| M3 | 生成流程跑通：上下文、OpenRouter + fixture、任务运行与提交、基础 UI | L1–L5 + 真实模型 3 段 | ✅ |
| M4 | 卷摘要、T1–T10、重启恢复、费用上限、反向验证 | L1b/L3 + 反向验证 | ✅ |
| M5 | 导入/导出/目录/时间线、视觉回归、L6 评测工具；按参考图重做单页工作台；角色卡补全 | L1–L5 + 视觉基线 + 真实评测 | ✅ |
| M6 | 101 段长测、走向 A/B、注入测试；发现长篇停滞 → prompt v3/v4；演示数据、截图、文档、PDF、干净环境复验 | `test:all` + 干净克隆 + 真实模型评测 | ✅ 2026-10-25 |

## 增强项（未做）

- 酒馆 PNG 角色卡（读取 `chara` tEXt 块）
- 生成时正文流式预览
- 一致性 / 节奏的“审稿”调用（见 ARCHITECTURE §8）

## 阻塞

无。

## 交接（2026-10-25）

- 分支：`main`（`1271e62` 起），已推送到私有仓库 `kingsleyli920/bitbeing-character-life`。工作分支 m1–m6 均已合并。
- 最近验证：`npm run test:all` 全部通过（Vitest 207 + Playwright 12，47 秒）；从 GitHub 重新克隆的干净目录复验通过；干净目录里真实模型生成一段成功。
- 评测证据：`docs/EVALUATION.md`、`docs/eval/`（v4 全文与报告；v2/v3 长测报告用于对比）。原始数据在 `eval/out/`（不入库，可用 `npm run eval -- <场景>` 复现）。
- 文档 PDF：`npm run docs:pdf` 生成 `docs/ARCHITECTURE.pdf`。
- 还需要负责人操作：录屏（步骤见 `docs/DEMO.md`）；如果要换 key，在 OpenRouter 后台为本项目单独建一把带额度上限的 key，然后替换 `.env.local`。
