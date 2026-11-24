# 模块化重构执行记录｜Phase 2.1–2.3

更新日期：2026-11-24

## 当前基线

- 原始可玩基线：`feat/v060-30wave@98932a2918ed22f17ea176b4209de76b839160bc`
- 重构分支：`refactor/modular-v060-phase1`
- 原始 HTML 未修改，归档路径与原文件复用同一 Git Blob。
- 原始 BALANCE JSON 未修改。

## Phase 2.1｜HTML / CSS / JavaScript 分离

- [x] 原始 DOM 结构迁入 `index.html`，保留原有游戏界面节点。
- [x] 原始 CSS 从 HTML 独立出来。
- [x] CSS 再按区域拆分：`base`、`topbar`、`subbar`、`hud`、`dock`、`feedback`、`modals`、`meta`。
- [x] 原始 IIFE 迁入 `src/legacy/game.js`，暂时保留原运行时。
- [x] `src/main.js` 作为模块入口，加载样式和游戏运行时。
- [x] `window.BG60` 和 `window.BG52` 兼容接口保留。

## Phase 2.2｜静态数据模块拆分

- [x] `src/data/core-data.js`：基础常量、元素、灵印、技能、Perks、丹药、W10 分支。
- [x] `src/data/equipment-data.js`：套装、装备、词条、装备联动。
- [x] `src/data/progression-data.js`：精英词缀、W20/W30 池、敌人规格。
- [x] `src/data/destiny-data.js`：天命强化、特殊祝福、天命丹药。
- [x] `src/data/balance.js`：唯一数值来源 JSON 的模块入口。
- [x] `src/data/index.js`：统一数据导出。
- [x] 静态数据从 legacy 移出，保留原名称和内容。

## Phase 2.3｜Core 与 UI 服务拆分

- [x] `src/core/rng.js`：原 `mulberry32` 算法原样迁移。
- [x] `src/core/math.js`：`dist`、`clamp`、`xpForLevel`。
- [x] `src/core/terrain.js`：`buildTerrainProps`，通过 import 使用原 RNG 和地图常量。
- [x] `src/ui/audio/audio.js`：原 `AudioKit` 服务。
- [x] CSS 进一步拆分为 8 个职责文件。
- [x] legacy 文件从 13,093 行降至 13,032 行。

## 验收结果

GitHub Actions Push run：`45331528961`，成功。
GitHub Actions Pull Request run：`45331537470`，成功。

- 原版 v0.60 回归：43 个 Node 测试项通过。
- 原版 Chrome E2E：6 个交互场景通过。
- 模块化版本 Chrome 启动：桌面 1440×900、手机 390×844 通过。
- 模块化版本 Chrome E2E：6 个交互场景通过。
- Vite 单文件构建通过。
- 构建产物：`release/Border-Guard-v0.60-modular-preview.html`，470,990 bytes。
- 构建产物 SHA-256：`9537701df2e2b950d8e2332d643b6221f65a2a13f1e100f32b5699ff5deaa6ee`。
- Artifact：`border-guard-modular-game-preview`，ID `14892042266`。
- 产物检查：一个 HTML、一个内联脚本、无外部 JS/CSS 引用；保留原 Canvas、HUD 和 BG60 API。

## 当前架构边界

**源码已经分成多个领域文件，但业务逻辑仍未全部完成模块化。**

- HTML、CSS 已独立，CSS 按界面区域拆分。
- 静态数据已独立为 4 个领域文件。
- RNG、数学、地形纯函数和音频服务已迁移。
- `src/legacy/game.js` 仍保留约 13,032 行运行时状态、战斗、经济、成长、存档、UI 编排函数。
- 现有 314 个函数尚未全部迁入 `systems/`、`ui/` 和 `core/`。
- 原版 43 个基线测试继续通过；模块化版本通过 Chrome 启动与 6 场景 E2E，VM 测试尚未迁为直接 import 模块。

## 下一步｜Phase 2.4

1. 明确 `game`、`cam`、输入、Meta 存档等共享状态的唯一所有权。
2. 设计 runtime context / system composition，避免模块互相读取隐式全局变量。
3. 先拆 Meta persistence 的存储边界，再拆装备、经济和战斗系统。
4. 保持 RNG 算法及调用顺序不变。
