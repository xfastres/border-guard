# 模块化重构执行记录｜Phase 2.1–2.2

更新日期：2026-11-24

## 当前基线

- 原始可玩基线：`feat/v060-30wave@98932a2918ed22f17ea176b4209de76b839160bc`
- 重构分支：`refactor/modular-v060-phase1`
- 原始 HTML 未修改，归档路径与原文件复用同一 Git Blob。
- 原始 BALANCE JSON 未修改。

## Phase 2.1｜HTML / CSS / JavaScript 分离

- [x] 原始 DOM 结构迁入 `index.html`，保留原有游戏界面节点。
- [x] 原始 CSS 迁入 `src/ui/styles/game.css`。
- [x] 原始 IIFE 迁入 `src/legacy/game.js`。
- [x] `src/main.js` 作为模块入口，加载 CSS 和游戏运行时。
- [x] `src/data/balance.js` 从 `balance/v060-baseline.json` 直接 import。
- [x] 保留 `window.BG60` 和 `window.BG52` 兼容接口。

## Phase 2.2｜静态数据模块拆分

- [x] `src/data/core-data.js`：基础常量、元素、灵印、技能、Perks、丹药、W10 分支。
- [x] `src/data/equipment-data.js`：套装、装备、词条、装备联动。
- [x] `src/data/progression-data.js`：精英词缀、W20/W30 池、敌人规格。
- [x] `src/data/destiny-data.js`：天命强化、特殊祝福、天命丹药。
- [x] `src/data/index.js`：统一数据导出。
- [x] 将上述常量从 `src/legacy/game.js` 移出，保留原名称和数据内容。
- [x] legacy 文件从 13,989 行降至 13,093 行（减少 896 行）。

## 验收结果

GitHub Actions Push run：`45330703256`，成功。
GitHub Actions Pull Request run：`45330709577`，成功。

- 原版 v0.60 回归：43 个 Node 测试项通过。
- 原版 Chrome E2E：6 个交互场景通过。
- 模块化版本 Chrome 启动：桌面 1440×900、手机 390×844 通过。
- 模块化版本 Chrome E2E：6 个交互场景通过。
- Vite 单文件构建通过。
- 构建产物：`release/Border-Guard-v0.60-modular-preview.html`，471,010 bytes。
- 产物检查：一个 HTML、一个内联脚本、无外部 JS/CSS 引用；页面包含原版 Canvas、HUD 和 BG60 API。

## 当前架构边界

**已完成文件拆分，但尚未完成业务逻辑模块化。**

- HTML、CSS 已独立。
- 静态数据已独立为 4 个领域文件。
- `src/legacy/game.js` 仍保留约 13,093 行运行时函数和状态，作为过渡桥接层。
- 现有 314 个函数尚未全部迁入 `systems/`、`ui/` 和 `core/`。
- 原版 43 个基线测试仍通过；模块化版本当前通过浏览器启动和 6 场景 E2E，尚未把所有 VM 测试改为直接 import 模块。

## 下一步｜Phase 2.3

1. 把纯函数 `mulberry32`、`dist`、`clamp` 等迁入 `core/`。
2. 将音频服务迁入 `ui/audio/`。
3. 建立唯一运行时状态 / context 所有权设计。
4. 在不改变 RNG 调用顺序的前提下逐步拆分系统函数。
