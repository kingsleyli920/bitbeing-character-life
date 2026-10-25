# 角色人生（bitbeing-character-life）

BitBeing 面试作业任务 1「角色生活模拟」：导入角色卡，按章节连续生成这个角色的生活故事，并可以用「故事走向」影响后续发展。

> 开发中。当前进度见 [PLAN.md](PLAN.md)，需求与规则见 [docs/SPEC.md](docs/SPEC.md)。

## 快速开始

需要 Node 24（见 `.nvmrc`）。

```sh
nvm use 24
npm ci
cp .env.example .env.local   # 填入 OPENROUTER_API_KEY
npm run dev                  # http://127.0.0.1:5210
```

没有 key 时可以用确定性假模型离线体验：`npm run dev:fixture`（页面会显示「Fixture 模式」，内容不是 AI 生成）。

## 测试

```sh
npm run typecheck
npm run test:fast      # Vitest：后端单元/功能/E2E、契约、前端单元/功能
npx playwright install chromium
npx playwright test    # 前端 E2E（mock 后端）与全栈 E2E
npm run test:all       # 以上全部
```

测试分层见 [docs/SPEC.md §5](docs/SPEC.md#5-测试)。
