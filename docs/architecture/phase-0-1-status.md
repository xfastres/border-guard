# 模块化重构执行记录｜Phase 0–1

更新日期：2026-11-24

## 当前基线

- 原分支：`feat/v060-30wave`
- 原提交：`98932a2918ed22f17ea176b4209de76b839160bc`
- 重构分支：`refactor/modular-v060-phase1`
- 基线文件指纹、数值来源和保护规则见 [v060-baseline.md](./v060-baseline.md)。
- 原版 HTML 保留在根目录，并在 `archive/baselines/Border-Guard-v0.60-before-modular.html` 建立归档路径；两者复用同一 Git Blob。

## Phase 0｜完成

- [x] 记录源分支和提交。
- [x] 记录原版 HTML 的 Git Blob SHA、SHA-256、文件大小和行数。
- [x] 创建独立重构分支，不改原分支。
- [x] 归档原版 HTML，确认归档 Blob SHA 与根目录原件一致。

## Phase 1｜完成

- [x] 创建 Vite + ES Modules 工程入口。
- [x] 创建 app bootstrap 和基础样式。
- [x] 配置单文件 HTML 输出命名。
- [x] 增加构建产物检查脚本。
- [x] 增加 GitHub Actions 构建门禁。
- [x] 生成并提交 `package-lock.json`（lockfileVersion 3，49 个 package entries）。
- [x] CI 使用 `npm ci`，依赖版本可复现。
- [x] 单 HTML 构建通过：Vite 8.3.8；输出一个 3,661 字节 HTML；1 个内联 script；无外部 JS/CSS 引用。
- [x] 原版 v0.60 回归套件通过：37 + 5 + 1 = 43 个 Node 测试项，全部通过。
- [x] 原版 Stage 6 Chrome smoke test 通过：1440×900 和 390×844。
- [x] 原版真实 Chrome E2E 通过：6 个交互场景，0 个未捕获 JS 异常。
- [x] 模块化 shell 使用真实 Chrome 通过 `file://` 打开：桌面 1440×900、移动 390×844；bootstrap 执行，页面标记和非可玩提示均存在。
- [x] GitHub Actions 最终 Push run：`45328652574`，成功。
- [x] 构建产物 Artifact：`border-guard-modular-shell`，ID `14889779651`。

## 构建技术基线

- Node.js：22.12.0
- Vite：8.3.8
- vite-plugin-singlefile：2.3.4
- 开发：`npm run dev`
- 构建：`npm run build`
- 锁定安装：`npm ci`
- 原版回归：`npm run test:baseline`
- 模块化 shell 浏览器检查：`npm run test:modular-shell`
- 构建产物：`release/Border-Guard-v0.60-modular-shell.html`

## 明确未完成

- 尚未迁移任何 v0.60 游戏业务逻辑。
- 尚未把原版 HTML 的测试从“提取内嵌 script + VM”迁移为直接 import ES Modules。
- 尚未生成可玩的模块化游戏版本。
- `release/Border-Guard-v0.60-modular-shell.html` 是构建骨架验证页，不得当成可玩游戏发布。

## 当前发现的文档债务

原 `README.md` 与 `PROJECT_HANDOFF.md` 的顶部仍把 v0.32 描述为当前版本，与 v0.60 分支现状不一致。先记录，不在 Phase 1 顺带重写；在文档归档阶段统一校正并保留历史说明。
