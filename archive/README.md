# Border Guard 历史版本与文档归档目录（`archive/`）

为保持仓库根目录整洁清晰，历史版本（v0.16–v0.52）的离线 HTML 与迭代文档均以 `git mv` 完整归档于此目录，**未删除任何历史文件或测试证据**。

## 目录结构

- **`archive/baselines/`**：v0.60 模块化重构前的只读备份基线（`Border-Guard-v0.60-before-modular.html`，与根目录冻结原版 `Border-Guard-v0.60.html` 字节逐一相同，SHA-1 `46049dcc8ca119f79dcc7e8b6e482a797dd794e2`）。
- **`archive/versions/`**：历史独立离线试玩版本 `Border-Guard-v0.17.html` … `Border-Guard-v0.52.html` 及 `Border-Guard-v0.52-改动讲解.html`（共 19 份，均可直接双击离线打开）。
- **`archive/docs/`**：历史版本的更新说明、评审稿、设计草案与路线图（原根目录 `Border-Guard-*.md` 共 28 份），以及子目录 `archive/docs/v018-v030/`（原 `docs/` 根目录下的 v0.18–v0.30 阶段性验收与方案报告 14 份）。

## 仍在根目录保留的核心文件

- **`Border-Guard-v0.60.html`**：v0.60 冻结原版黄金基线（被 `test:baseline`、`test:arch`、`test:parity` 与 CI 引用，保持原位字节不变）。
- **模块化源码与配置**：`src/`、`balance/`、`index.html`、`vite.config.js`、`package.json`、`scripts/`、`tests/`。
- **活跃文档**：`README.md`、`AGENTS.md`、`PROJECT_HANDOFF.md`、`task_plan.md`、`progress.md`、`findings.md`，以及 `docs/architecture/`、`docs/v0.60-review/`（含阶段二优化计划 `stage2-optimization-plan.md`）。
