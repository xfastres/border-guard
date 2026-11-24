# 当前任务 · v0.60 阶段一模块化重构（分支 `refactor/modular-v060-phase1`）

> 历史 v0.16–v0.26 任务记录完整保留在下方；当前有效任务状态以本节为准。

| 阶段 | 范围与产出 | 状态 | 实测门禁 |
| --- | --- | --- | --- |
| Phase 0–2.3 | Vite 单文件壳层、`index.html`、8 份 CSS、`src/data/*`、`src/core/{rng,math,terrain}`、`src/ui/audio` | 已完成 | 单文件构建 + 原版基线通过 |
| Phase 2.4a–2.4b | Windows 跨平台 Chrome 适配、`tests/parity`、`tests/unit/architecture-guard`、`RuntimeContext` + `Ports`、`state-queries` | 已完成 | 14 unit + 3 arch + parity + baseline |
| Phase 3.1–3.11 | 全部 7 大业务子域（`meta`/`equipment`/`economy`/`progression`/`hero`/`combat`/`run`）与 `core/state.js` 迁出 | 已完成 | 275 unit + 3 arch + parity + E2E + 43 baseline |
| Phase 4.1–4.4 | `ui/{vfx,feedback,canvas,shared,modals,hud,input}`、`debug/{presets,test-api}`、`app/{game-loop,bootstrap}`，彻底删除 `src/legacy/game.js` | 已完成 | 298 unit + 3 arch + parity + E2E + 43 baseline |
| Phase 5 | 零 DOM `headless-w1-to-w30.test.mjs`（12 用例）、`test:parity` 三种子与清理加固、`package.json` `test:all`、CI 工作流升级 | 已完成 | `npm run build` + `npm run test:all` 七组全绿 |
| Phase 6 | 刷新 `AGENTS.md`、`README.md`、`PROJECT_HANDOFF.md`、`task_plan.md`、`progress.md`（保留历史记录） | 已完成 | 文档与仓库现状核对一致 |
| Phase 7 | 构建产物切换至 `release/Border-Guard-v0.60.html`、双向 `localStorage` Meta 存档兼容校验与阶段一最终验收 | 已完成 | `npm run build` + `npm run test:all` 七组全绿（含 `test:parity` 2/2） |
| 归档与整理 | 将 v0.17–v0.52 历史 HTML（19 份）与历史文档（42 份）无损 `git mv` 至 `archive/versions/` 与 `archive/docs/`，并建立 `archive/README.md` | 已完成 | `sync-balance --check` + `npm run test:all` 全绿 |
| 阶段二规划 | 三路只读源码/数值审计 + Claude Opus 5.5 双端 73 点页面视觉验收（0 回归），输出 `docs/v0.60-review/stage2-optimization-plan.md`（Batch 1–5 / 43 项） | 计划已落盘，待选批实施 | — |

---

# 历史任务 · v0.26 全局体验迭代

| 批次 | 实施 | 已执行的检查 | 待执行 |
| --- | --- | --- | --- |
| 布局与信息架构 | 棋盘、HUD、简报、详情、命令分区和响应式规则 | 脚本语法、棋盘几何与世界坐标往返、独立源码复核 | 13 视口截图、溢出、手点覆盖和地图可用面积 |
| 交互与易用性 | 首日城址入口、工具优先级、鼠标／触屏分派、暂停与键盘焦点 | Node 输入契约、既有路径与居民测试 | 真实多指、拖动、键盘与连续操作 |
| 视觉和反馈 | 库存、领主与战斗标记，实时支援，胜败反馈 | 既有战斗与体验钩子，独立复核 | 真机视觉、性能、音效和动画观感 |
| 玩法审查与交付 | 独立 v0.26、更新说明、审查报告、测试脚本与证据 | 同种子六组模拟一致、分夜账本与历史文件校验 | 真人首局、建筑与营地策略比较 |

浏览器启动错误记入 `tests/artifacts/v026-browser-status.json`。验收入口为 `node tests/run-v026-checks.cjs`，通过后检查截图与原生操作记录。

---

# Task Plan: 当前任务 — v0.25 建城后移动阻断修复

> 历史 v0.16–v0.20 阶段记录保留在下方；当前有效任务状态以本节为准。

## 当前目标
修复领主在候选城址上确认建城后可能被城堡实体困住的问题，并覆盖「移动目标仍指向城址时先建城」的情况。

## 当前状态
- 根因：chooseSite() 将目标地块变成实体城堡前，没有检查领主脚底占位，也没有处理指向城址的路线。
- 修复：新增 v0.25，重叠时移到最近合法相邻服务格；未抵达而目标指向城址时改道；远处建城保持原位置。
- 已新增：tests/hero-spawn-v025.js 与 tests/run-v025-checks.cjs。
- 待执行：在 Windows 项目环境运行完整 Chrome runner，确认 v0.24 回归与 v0.25 新增用例通过。
- 本次没有真人试玩或手机真机测试。

## 完成标准
1. A/B 两个城址上站在城址中心建城后，领主均处于合法可站位置。
2. 详情面板打开时 WASD 能产生实际位移。
3. 尚在路上时先建城，路径会改到城堡外侧。
4. 远处建城不传送领主。
5. v0.24 战斗、手势、相机、HUD、经济和五夜回归无变化。
6. 运行 node tests/run-v025-checks.cjs Border-Guard-v0.25.html 并保存真实结果。

---

## 历史任务记录


## Goal
对照两份文档检查 v0.16，区分规则变化、实现偏差与玩家体验风险，交付有证据的中文审查报告。

## Next Step
v0.20 三项边界已修并通过回归。下一步只在真机上复核。

## Current Phase
Phase 6

## Phases

### Phase 1: 读取规则与实现
**Status:** complete

### Phase 6: 浏览器验证与体验分析
**Status:** complete

### Phase 3: 撰写审查报告
**Status:** complete

### Phase 4: v0.17 设计与回归测试
**Status:** complete

### Phase 5: v0.17 实现与代码审查
**Status:** complete

### Phase 6: v0.17 浏览器验证与交付
**Status:** complete

## Decisions Made
- 仅审查，不修改游戏；文档内审计指令作为资料。
- 当前没有可调用 CodeGraph 工具，直接读取已指定 HTML。
- 证据分为界面观察、受控运行、源码与待试玩判断。

## Errors Encountered
- 批量读取输出过长，后续改为限定范围读取。




### Phase 7: Cursor执行v0.18胜利HUD
**Status:** complete

### Phase 8: 独立验收Cursor交付与反馈修正
**Status:** complete


### Phase 9: v0.19参考图布局与移动手势
**Status:** complete

### Phase 10: v0.19回归、代码审查与交付
**Status:** complete

### Phase 11: 核对v0.19平移入口并建立v0.20副本
**Status:** complete

### Phase 12: 地图世界层相机、坐标与手势接入
**Status:** complete

### Phase 13: HUD/居中/点击/手势回归并交付
**Status:** complete

### Phase 14: 修正缩窗结算卡、背景拖图和浮点格线
**Status:** complete

