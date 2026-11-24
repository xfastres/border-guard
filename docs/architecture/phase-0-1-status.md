# 模块化重构执行记录｜Phase 0–1

更新日期：2026-11-24

## 当前基线

- 原分支：`feat/v060-30wave`
- 原提交：`98932a2918ed22f17ea176b4209de76b839160bc`
- 重构分支：`refactor/modular-v060-phase1`
- 原版 HTML、Blob SHA、SHA-256 和文件规模见 [v060-baseline.md](./v060-baseline.md)。
- 原版文件保存在根目录，并通过 `archive/baselines/Border-Guard-v0.60-before-modular.html` 保留同一 Git Blob 的归档入口。

## Phase 0

- [x] 记录源分支和提交。
- [x] 记录原版 HTML 的 Git Blob SHA、SHA-256、文件大小和行数。
- [x] 创建独立重构分支。
- [x] 在归档路径保留原版 HTML，不改写原始内容。

## Phase 1

- [x] 创建 Vite + ES Modules 工程入口。
- [x] 创建 app bootstrap 和基础样式。
- [x] 配置单文件 HTML 输出命名。
- [x] 增加构建产物检查脚本。
- [x] 增加 GitHub Actions 构建门禁。
- [ ] 等待 GitHub Actions 实际构建结果。
- [ ] 下载并检查 CI 生成的单文件构建产物。
- [ ] 在本地 Chrome 中通过 `file://` 打开验证。

## 明确未完成

- 尚未迁移任何 v0.60 游戏业务逻辑。
- 尚未运行 v0.60 原版完整测试套件。
- 尚未生成可玩的模块化游戏版本。
- `release/Border-Guard-v0.60-modular-shell.html` 是构建骨架验证页，不得当成可玩游戏发布。

## 当前发现的文档债务

原 `README.md` 与 `PROJECT_HANDOFF.md` 的顶部仍把 v0.32 描述为当前版本，与 v0.60 分支现状不一致。先记录，不在 Phase 1 顺带重写；在文档归档阶段统一校正并保留历史说明。
