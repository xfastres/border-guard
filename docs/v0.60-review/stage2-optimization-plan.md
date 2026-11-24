# Border Guard v0.60｜阶段二优化与分批实施计划

> **基线状态**：阶段一模块化重构（Phase 0–7）已全部完成并经 7 组自动化套件 + Claude Opus 5.5 双端 73 检查点像素级页面验收通过（回归缺陷 0 项，单文件交付产物 `release/Border-Guard-v0.60.html`）。  
> **实施分支策略**：保持 `refactor/modular-v060-phase1` 作为纯净的「零行为差异阶段一重构里程碑」；阶段二实施时基于当前基线新建独立分支（建议 `feat/v061-stage2-polish`），每批单独提交并全量回归。  
> **红线延续**：冻结原版 `Border-Guard-v0.60.html`、`archive/baselines/Border-Guard-v0.60-before-modular.html`、`tests/artifacts/` 与历史版本永不覆盖删除；涉及玩法/数值/概率/经济/波次的条目需经明确授权后再修改（并同步维护 `balance/` 与对应测试基线）。

---

## 一、诊断总览（43 项已核实发现）

综合三路只读源码/数值审计（隐藏 Bug 与 RNG、玩法与平衡结构、性能/渲染/UI/工程）与 Claude Opus 5.5 真实双端视觉验收，共核实 **43 项**可落地改进：

| 维度 | P0 | P1 | P2 | 合计 | 核心聚焦 |
| --- | :---: | :---: | :---: | :---: | --- |
| **A. 隐藏 Bug 与边界缺陷** | 1 | 8 | 3 | **12** | W30 锁血期被祭司回血 +82.8 万、冰盾反击先胜后负、Meta 重试覆写新解锁、圣盾倒扣、W29 超时竞态 |
| **B. 性能与渲染瓶颈** | 0 | 4 | 2 | **6** | `tick` 内 DOM 几何读取与 HUD 回流、0.14s 粗粒度刷新、$O((P+S+Z)N)$ 弹体碰撞与高频 `filter` GC、动态 Canvas 未裁剪 |
| **C. UI 与交互体验** | 1 | 6 | 3 | **10** | 手机 `390×844` 战场仅剩 ~30% 且英雄压副栏、面板折叠互遮与重叠 Dock、桌面开战顶栏跳 34px、W30 血条遮灵印、转印成功报红 |
| **D. 玩法与数值平衡（需授权）** | 0 | 9 | 1 | **10** | W10 重锤 4 分支不可达、非火冰流派缺终局闭环、技能卡面偏差、W22/W29 难度悬崖、转印符高方差 vs 后期溢出、试炼印空承诺 |
| **E. 工程可维护性与门禁** | 0 | 1 | 4 | **5** | 视觉飘字与玩法共享 `game.rnd()`、大文件巨型函数拆分、JSDoc 状态契约、CSS token 整理、窄屏自动化回归门禁 |
| **总计** | **2** | **28** | **13** | **43** | — |

---

## 二、分批执行计划（Batch 1 → Batch 5）

### Batch 1｜高危 Bug 与状态安全清零（优先推荐 · 低风险高收益）

| 编号 | 优先级 | 问题摘要 | 目标模块 | 授权要求 |
| --- | :---: | --- | --- | --- |
| **A1** | **P0** | W30 首领 80% 锁血期仍可被先锋祭司治疗回血（80% → 86%，单次 +828,000 HP） | `src/systems/combat/simulation.js` | 需确认锁血禁治与常规受治规则 |
| **A2** | **P1** | W30 同一次受击冰盾反击击杀 Boss 先判胜，随后继续扣血再判负导致胜负分裂 | `src/systems/hero/vitals.js`, `src/systems/run/lifecycle.js` | 纯修 Bug |
| **A3** | **P1** | Meta 保存失败后「重试保存」用旧快照覆写后续已成功落盘的解锁 | `src/systems/meta/rewards.js`, `src/systems/meta/loadout.js` | 纯修 Bug |
| **A4** | **P1** | `localStorage` 禁用/写错仍报成功；坏 JSON 数字 `NaN` 绕过余额校验；重置先删后写失档 | `src/app/bootstrap.js`, `src/systems/meta/persistence.js`, `src/systems/meta/loadout.js` | 纯修 Bug |
| **A5** | **P1** | 圣光共鸣（圣耀万法）与低上限冰盾刷新反向削减玩家已有护盾（实测 145 → 75） | `src/systems/combat/simulation.js`, `src/systems/combat/hooks.js` | 纯修 Bug |
| **A6** | **P1** | W29 越过截止点后下一 `tick` 前仍可扣款/提前开战；打开「帮助」(`intro`) 阻塞到时开战 | `src/systems/run/final-prep.js`, `src/systems/progression/destiny.js`, `src/systems/run/tick.js` | 纯修 Bug |
| **A7** | **P1** | 天命赌局与「道运昌隆」绕过当局活跃 Meta 装备包解锁池 | `src/systems/progression/destiny.js`, `src/systems/progression/rewards.js` | 纯修 Bug（遵循解锁规则） |
| **A8** | **P1** | W30 跨 80% 锁血阈值一击飘字显示未取整长小数（如 `9811.2368…!`） | `src/systems/combat/damage.js` | 纯修 Bug |
| **A9** | **P1** | 窗口失焦（`blur`）或触控中断（`pointercancel`）导致按键/拖拽状态卡死 | `src/ui/input/input.js` | 纯修 Bug |
| **A10** | **P2** | 过期灼烧遗留旧高 DPS 与末跳超扣；W20 玄冰护阵把满盾溢出值计入累计 | `src/systems/combat/simulation.js`, `src/systems/combat/damage.js`, `src/systems/combat/hooks.js` | 纯修 Bug |
| **A11** | **P2** | W30 战斗计时每步舍入累计飘移（60s→61.2s）；W29 时钟回退倒计时上跳 | `src/systems/run/tick.js`, `src/systems/run/final-prep.js` | 纯修 Bug |
| **A12** | **P2** | 调试预设与公开 API 5 处边界（残留 `starter` 遮罩、`nextTowerId=NaN`、写入正式 Meta、`nextOfferSeq` 冲突、`pickPerk` 满级叠血） | `src/debug/presets.js`, `src/core/state.js`, `src/systems/progression/rewards.js` | 纯修 Bug |

**验收门禁**：为 A1–A12 每项新增对应单元/集成回归用例；`npm run build`、`test:unit`、`test:integration`、`test:arch`、`test:modular-game`、`test:e2e:modular` 全绿。

---

### Batch 2｜双端高痛点 UI 与交互升级（体感提升最大）

| 编号 | 优先级 | 问题摘要 | 目标模块 | 授权要求 |
| --- | :---: | --- | --- | --- |
| **C1** | **P0** | 手机 `390×844` 顶栏+副栏+Dock 占屏 ~70%，战场仅余 ~255px 且英雄压副栏下缘 | `src/ui/styles/{topbar,subbar,dock,meta}.css`, `src/ui/canvas/camera.js`, `index.html` | 需视觉/交互验收 |
| **C2** | **P1** | 手机端 `.battle-hud:not(.collapsed)` 优先级覆写导致折叠键被「构筑总览」遮挡，三大面板与 Dock 重叠 60–138px | `src/ui/styles/{meta,hud}.css`, `src/ui/hud/hud-controller.js` | 需视觉验收 |
| **C3** | **P1** | 桌面 `1440×900` 开战插入 `#enemyPill` 致顶栏换行（50px→84px），全屏 HUD 上下跳动 34px | `src/ui/styles/topbar.css`, `index.html`, `src/ui/hud/hud-controller.js` | 需视觉验收 |
| **C4** | **P1** | W30 首领血条（固定 `y=108`）与方向箭头硬编码遮挡灵印条及血量数字 | `src/ui/canvas/draw-overlays.js` | 需视觉验收 |
| **C5** | **P1** | 词条转移成功后沿用刚清空的源槽立刻报红「源槽位为空」，Toast 被遮罩压暗 | `src/ui/modals/destiny-transfer-modals.js`, `src/ui/styles/feedback.css` | 纯体验修复 |
| **C6** | **P1** | 手机长弹窗缺吸底 `.modal-footer`；全局 `Tab` 拦截吞掉弹窗键盘焦点；折叠按钮缺 `aria-expanded` | `src/ui/styles/modals.css`, `src/ui/input/input.js`, `src/ui/modals/modal-manager.js`, `src/ui/hud/hud-controller.js` | 纯体验/无障碍 |
| **C7** | **P1** | Win10 环境 Unicode 15 表情（如离火羽扇 `🪭`）缺字显示为方块 | `src/data/equipment-data.js`, `src/ui/hud/dock-ui.js` | 纯体验修复 |
| **C8** | **P2** | 触控装备操作显式入口、手机 Dock 横向滚动提示、空背包一字一行、Toast 避让 Dock | `src/ui/hud/{dock-ui,inspector}.js`, `src/ui/styles/{dock,feedback}.css` | 纯体验修复 |
| **C9** | **P2** | W30 飘字重叠错位/短窗合并、W10 4 门神通改 2×2 网格、`<title>` 去除「（阶段 1）」 | `src/ui/canvas/draw-effects.js`, `src/ui/modals/progression-modals.js`, `index.html` | 纯体验修复 |
| **C10** | **P2** | 天命快捷押注补齐 `240` 双符档位与分档说明；W29 倒计时补缺口与到期提示 | `src/ui/modals/destiny-transfer-modals.js`, `src/ui/hud/battle-hud.js` | 纯体验（不改概率） |
| **E4** | **P2** | 统一 8 份 CSS 的 `--z-*` / `--safe-top` / `--safe-bottom` token 与响应式归属 | `src/ui/styles/*.css` | 需视觉验收 |
| **E5** | **P2** | 新增浏览器几何与交互门禁（390×844 零遮挡 + 可视高 ≥50%、1440px 零跳动、Tab 焦点） | `tests/modular-game-browser.test.cjs` 或新增布局回归测试 | 纯工程测试 |

**验收门禁**：新增双端视口几何零遮挡断言 + 真浏览器双端（1440×900 & 390×844）截图复验 + `npm run test:e2e:modular` 全通。

---

### Batch 3｜性能与渲染提速（纯工程 · 零玩法改动）

| 编号 | 优先级 | 问题摘要 | 目标模块 | 授权要求 |
| --- | :---: | --- | --- | --- |
| **B5** | **P2** | 先补真实帧时可观测性：用未截断 RAF 间隔计算真实 FPS 并记录 `tick`/Canvas/HUD 分段耗时 | `src/app/game-loop.js`, `src/debug/test-api.js` | 纯工程 |
| **B1** | **P1** | 消除 `tick` 每步 2 次 `getBoundingClientRect` 及 HUD 交替读写 / `offsetWidth` 同步布局回流 | `src/ui/canvas/camera.js`, `src/ui/hud/hud-controller.js` | 纯工程 |
| **B2** | **P1** | 细化 HUD 标量脏检查，折叠态短路派生计算，拆分高频数字区与静态操作按钮区 | `src/ui/hud/{hud-controller,battle-hud,build-hud,dock-ui}.js` | 纯工程 |
| **B3** | **P1** | 弹体×敌军碰撞增 AABB 早拒绝、保序线性扫描替换 `.filter().sort()[0]`、空数组短路与原地压缩 | `src/systems/combat/simulation.js`, `src/ui/vfx/vfx.js`, `src/systems/economy/ledger.js` | 纯工程 |
| **B4** | **P1** | 动态实体/弹体/区域/浮字增视口 AABB 裁剪；按 Profiling 评估静地板离屏缓存与毛玻璃开关 | `src/ui/canvas/{renderer,draw-arena,draw-entities,draw-effects}.js` | 需视觉验收 |
| **B6** | **P2** | Web Audio 增主总线限幅器（`DynamicsCompressorNode`）与全局并发声部上限 | `src/ui/audio/audio.js` | 需听感验收 |

**验收门禁**：在前后对比 `perf` 分段帧时与 Layout 次数；核心战斗逻辑零差异（同种子无头集成测试与全量单测全绿）。

---

### Batch 4｜玩法、流派与数值平衡精调（需逐项明确授权）

| 编号 | 优先级 | 问题摘要 | 涉及范围 | 成本 |
| --- | :---: | --- | --- | :---: |
| **D1** | **P1** | 解锁 W10「重锤震地」4 条不可达分支；按技能缓存首次 3 抽 4 分支防返回免费重抽 | `balance/v060-baseline.json`, `src/systems/progression/w10.js`, `src/ui/modals/progression-modals.js` | 低中 |
| **D3** | **P1** | 补齐技能分支卡面与实装偏差（裂空剑阵剑气环、千鸟雷网引爆范围、血怒吸血文案） | `src/systems/hero/skills.js`, `src/data/core-data.js` | 低中 |
| **D6** | **P1** | W20 重抽先验余额防白耗 RNG；记录近期落选牌防第 3 组抽回首组；明示推荐依据 | `src/systems/progression/w20.js` | 低中 |
| **D10** | **P2** | 实装 110 碎片「试炼印」承诺的两枚专属徽记与结算展示；重估 3 点「天命观星」性价比 | `src/systems/meta/*`, `src/ui/modals/intro-end-modals.js` | 中 |
| **D5** | **P1** | 统一 W23/W27 血碑发材口径；首枚转印符加可见保底/高价定向口；天命三选一去重；评估旧强化拆解返材 | `src/systems/combat/damage.js`, `src/systems/progression/destiny.js`, `src/systems/economy/pricing.js` | 中 |
| **D4** | **P1** | 平滑 W22（+46.9% 跃升与 2× 主题总血量跨度）与 W29 过渡梯度 | `balance/v060-baseline.json`, `src/systems/run/waves.js` | 中 |
| **D7** | **P1** | 借 W29 战前情报前置成型清单与供体预览，缓解 90s 实时操作密度压力 | `src/systems/run/final-prep.js`, `src/ui/modals/*` | 中 |
| **D9** | **P1** | 局外 Meta 扩展包支持开局按包自由开关，并明示防稀释替换项 | `src/systems/meta/loadout.js`, `src/ui/modals/meta-modal.js` | 中 |
| **D2 + D8** | **P1** | 修补风印孤立目标收益，为雷/血/风/圣补齐单体与 W20 终局闭环，并按同预算压测校准 W30 血量与 4 辅助 | `src/data/*`, `src/systems/combat/*`, `balance/v060-baseline.json` | 高 |

---

### Batch 5｜长期工程演进（按需）

| 编号 | 优先级 | 问题摘要 | 目标模块 | 成本 |
| --- | :---: | --- | --- | :---: |
| **E1** | **P1** | 拆出独立视觉随机流 `vfxRnd` 与纯自增 UID，彻底消除飘字队列满不满反噬玩法 `game.rnd()` 的隐蔽耦合（注：会改变旧种子历史抽样序列，需同步确认 parity 策略） | `src/core/state.js`, `src/systems/combat/damage.js`, `src/systems/equipment/instance.js`, `src/ui/vfx/vfx.js` | 中 |
| **E2** | **P2** | 二次精拆 7 个巨型文件/函数（`simulation.js` 1,055 行、`skills.js` 981 行、`damage.js` 764 行、`destiny.js` 693 行、`presets.js` 454 行、`inspector.js` 392 行） | 对应子域拆分 | 中高 |
| **E3** | **P2** | 为 `game`（71 字段）与 `hero`（63 字段）补充 JSDoc `@typedef` 与子域写入边界契约 | `src/core/state.js`, `src/core/runtime-context.js`, `src/app/bootstrap.js` | 中 |

---

## 三、确认清单（开动阶段二代码前勾选）

- [ ] **实施批次 / 编号**：请指定先执行的批次（推荐顺序：`Batch 1 → Batch 2 → Batch 3 → Batch 4 选定项 → Batch 5`）或直接列编号。
- [ ] **A1 规则确认**：W30 首领锁血期是否严格禁治？非锁血期是否允许祭司治疗（或设上限）？
- [ ] **D 系列玩法/数值授权**：确认本轮允许调整的 `D1–D10` 编号。
- [ ] **E1 旧种子兼容策略**：是否接受隔离视觉 `vfxRnd` 带来的旧种子抽样序列更新？
