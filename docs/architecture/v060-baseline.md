# Border Guard v0.60｜重构前基线

- 记录日期：2026-11-24
- 源仓库：`xfastres/border-guard`
- 源分支：`feat/v060-30wave`
- 源提交：`98932a2918ed22f17ea176b4209de76b839160bc`
- 当前重构分支：`refactor/modular-v060-phase1`

## 原始游戏文件

| 项目 | 值 |
|---|---|
| 路径 | `Border-Guard-v0.60.html` |
| Git Blob SHA-1 | `46049dcc8ca119f79dcc7e8b6e482a797dd794e2` |
| SHA-256 | `74d186a5a36e96465f1aff331052e6e8fa3b2b01c1e864b8b53a8722bc78ee6c` |
| UTF-8 文件字节数 | 758,610 |
| 行数 | 17,042 |
| 顶层函数数 | 约 314 |
| CSS 区域 | 第 8–582 行 |
| JavaScript 区域 | 第 697–17,039 行 |

归档路径：`archive/baselines/Border-Guard-v0.60-before-modular.html`。该路径复用原始 Git Blob，不重新序列化或改写 HTML 字节。

## 数值基线

- 路径：`balance/v060-baseline.json`
- schemaVersion：1
- HTML 中存在 `BALANCE_CONFIG_START` / `BALANCE_CONFIG_END` 生成区间。
- 当前同步脚本：`scripts/sync-balance.cjs`。
- 本次 Phase 0/1 不修改 JSON、同步脚本或嵌入式 BALANCE 区间。

## 测试基线与限制

仓库当前包含 v0.60 Stage 1–6、审计和浏览器 E2E 测试。部分 Stage 测试通过正则提取 HTML 的内嵌 script，再用 VM 建立测试环境。

**本记录没有声称本次操作已运行原版完整测试套件。** 本次记录的是 GitHub 源码基线指纹；重构分支的构建门禁将在 Phase 1 提交后运行。原版测试必须在可运行 Node / Chrome 的环境中单独执行，并把实际结果附在交付记录中。

## 保护规则

- 原分支 `feat/v060-30wave` 不在本次操作中修改。
- 原始 `Border-Guard-v0.60.html` 不覆盖、不格式化、不拆分。
- 原始数值 JSON、现有测试和历史证据不删除。
- 模块化 Phase 1 输出只用于构建链路验证，不是可玩版本。
