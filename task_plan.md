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

