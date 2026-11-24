# Border Guard v0.60｜依赖与拆分审计

- 审计日期：2026-11-24
- 审计基线：`feat/v060-30wave@98932a2918ed22f17ea176b4209de76b839160bc`
- 审计性质：只读静态盘点；没有修改游戏源码。
- 目的：为 Phase 2 的模块边界和迁移顺序提供依据。

## 1. 结构盘点

| 指标 | 结果 |
|---|---:|
| HTML 文件 | 1 个 |
| HTML 总行数 | 17,042 |
| 文件大小 | 758,610 bytes |
| 内嵌 JavaScript | 16,343 行 |
| 顶层函数声明 | 314 |
| 顶层 const / let / var 声明 | 85 |
| 主要代码区块注释 | 30 |
| 引用 `game` 状态对象的函数 | 225 / 314 |
| 直接访问 DOM / window / localStorage / RAF 的函数 | 23 |

当前结构的主要问题不是函数数量，而是大量函数共享同一个 IIFE / script 词法作用域。拆成 ES Modules 后，原先隐式共享的变量和函数不会自动可见。

## 2. 现有区块与目标模块

以下是按源文件主要区块统计的函数分布。区块名保留原源码术语；目标目录是建议归属，不表示已经迁移。

| 源码区块 | 函数数 | 目标模块 |
|---|---:|---|
| Constants & Game Data / W10 branch pool / Stage 2 affix pool | 2 个函数 + 静态数据 | `src/data/` |
| Stage 6 Meta Progression | 61 | `src/systems/meta/` |
| State & Helpers | 26 | `src/core/`、`src/systems/run/`（需逐项拆分） |
| Cross-stage Combat State Hooks | 15 | `src/systems/combat/`、`src/systems/progression/` 的共享接口 |
| Synergy, Combo & Stat Computation | 13 | `src/systems/hero/`、`src/systems/equipment/` |
| Shop Pricing / Recycle / Material Enhance | 13 | `src/systems/economy/`、`src/systems/equipment/` |
| W29 Final Prep Atomic Mutex / Shop Confirm | 5 | `src/systems/run/`、`src/systems/economy/` |
| Shop | 17 | `src/systems/economy/` |
| Wave Generation / Shrine | 19 | `src/systems/run/` |
| Hero Skills | 5 | `src/systems/hero/` |
| Main Seal / Sub-Seal Resonance | 30 | `src/systems/combat/`、`src/systems/hero/` |
| Simulation Tick | 1 | `src/app/game-loop.js` |
| VFX Helpers | 3 | `src/ui/vfx/` |
| Modals | 7 | `src/ui/modals/` |
| W10 Breakthrough | 5 | `src/systems/progression/` |
| W16–W30 / W20 Breakthrough | 32 | `src/systems/run/`、`src/systems/progression/`、`src/systems/combat/` |
| Destiny Gamble | 13 | `src/systems/progression/` |
| Affix Transfer | 7 | `src/systems/equipment/` |
| Destiny / Transfer Modals | 4 | `src/ui/modals/` |
| Rendering / Camera | 16 | `src/ui/canvas/` |
| UI Rendering | 13 | `src/ui/hud/` |
| Input Handling | 2 | `src/ui/input/` |
| Debug Contract | 3 | `src/debug/` |
| Main Loop | 2 | `src/app/game-loop.js` |

合计：314 个顶层函数。部分区块需要按职责再拆分，不能直接整段搬入单一目标文件。

## 3. 共享状态与副作用

### 3.1 运行时状态

当前核心共享变量包括：

- 主状态：`game`。
- 渲染状态：`cam`、`ctx`、`canvas`、`perfStats`。
- 输入状态：`keys`、`pointerDown`、`pointerScreen`、`pointerWorld`。
- 全局 UI 状态：`paused`、`toastTimer`、`flashTimer`、`compactHudMode`、`shopCardNodes`。
- 运行控制：`lastTs`、`_inMainLoopFrame`、`_monotonicClockOverride`。
- 业务临时状态：`lastShopKey`、`_inFireChainTransfer`、`_modalOfferSeq`、`_destinyBetInputVal`、`_transferUiState`。

其中 225 个函数直接引用 `game`。这说明不能把 `game` 简单复制到不同模块，也不能让 UI 和系统各自持有一份状态副本。

### 3.2 DOM 与浏览器 API

静态扫描识别到 23 个函数直接使用 `document`、`window`、`localStorage` 或 `requestAnimationFrame`，主要集中在：

- 存档：`getMetaStorage`、`loadMetaSave`。
- 技能说明：`getSkillBreakdown`。
- 弹窗渲染：`renderStarterModal`、`renderLevelUpModal`、`renderW10BreakthroughModal`、`renderW20PreselectModal`、`renderW20BreakthroughModal`、`renderPerkModal`、`renderChestModal`、`renderDestinyGambleModal`、`renderAffixTransferModal`。
- HUD：`syncOffsets`、`syncHudResponsiveMode`、`renderSealStrip`、`renderSkillStrip`、`renderShop`、`renderBag`、`renderInspector`。
- 相机、输入与主循环：`fitCamera`、`handleCanvasClick`、`setPaused`、`loop`。

因此 `systems` 层不能直接 import DOM 操作；存档浏览器适配和 UI 渲染要分别隔离。

## 4. 高耦合函数（优先作为迁移边界审查对象）

静态函数名引用扫描得到以下高扇出候选。引用扫描可能包含注释或字符串，数字用于发现风险，不作为精确调用图。

| 函数 | 引用的其他顶层函数数（候选） | 主要跨域职责 |
|---|---:|---|
| `renderInspector` | 32 | 装备、商店、灵印、背包、遥测、UI |
| `dealDamage` | 26 | 伤害、词条、羁绊、突破、天命、Boss、弹体、VFX |
| `castHeroDash` | 28 | 英雄、战斗、W20、天命、坐标、渲染 |
| `updateHero` | 24 | 英雄、技能、装备、战斗状态 |
| `tick` | 22 | 波次、刷怪、英雄、弹体、敌人、结算、相机 |
| `onEnemyKilled` | 22 | 掉落、经济、材料、治疗、战斗、波次完成 |
| `completeWaveClear` | 21 | 经济、经验、商店、遥测、W20/W29/W30、UI |
| `buyShopItem` | 20 | 商店、经济、装备、背包、英雄经验、UI |
| `renderAllUI` | 19 | HUD、商店、背包、Inspector、Meta |
| `startWave` | 18 | 波次、Meta 锁定、W20/W30、弹窗、商店确认 |

### 必须特别处理的边界

1. `renderInspector` 不只是展示：它引用多个装备、出售、拆解、领取和强化动作。重构时要把“生成视图”与“执行动作”分开。
2. `renderLeftHud` 存在 `unequipGear`、`openW20PreselectModal` 等动作入口，不能把它当成纯渲染模块。
3. `completeWaveClear`、`onEnemyKilled`、`startWave` 是跨系统流程编排，不应塞进单一战斗或 UI 文件。
4. `dealDamage` 同时触发多种被动、状态、掉落链和 Boss 阶段，必须先定义 combat event / effect 的边界。
5. `openNextModal` 是弹窗路由器，适合独立的 Modal Manager，但具体业务选择仍由对应系统负责。

## 5. 随机数边界

当前随机数至少有两种来源：

- 局内主随机流：`makeGame(seed)` 创建 `game.rnd`，大量波次、商店、掉落、战斗、技能和奖励逻辑会消耗它。
- `Math.random`：既作为部分 API 的 fallback，也出现在随机装备 ID、随机候选、屏幕震动和绘制细节中。

静态扫描中，约 26 个函数引用 `game.rnd`，约 14 个函数出现 `Math.random`（包含 fallback 默认参数，不等于全部在正常局内都会走 Math.random）。

**重构约束：**
- 不改变随机算法。
- 不改变随机数调用的先后顺序。
- 不把纯视觉抖动随机数随意接入或移出主随机流。
- 不为了“更干净”把所有随机调用统一替换成一个新 RNG。
- 同种子测试必须在每个迁移阶段持续通过。

## 6. 测试 API 与兼容面

启动区将约 100 个函数、状态访问器、常量和数据集合暴露到 `window.BG60`，并设置 `window.BG52 = window.BG60`。

这意味着 `window.BG60` 是现有测试和调试使用的兼容接口，不是可以在拆分时顺手删除的临时代码。

迁移要求：

1. 先把测试 API 从业务实现中独立出来。
2. 保留原有公开方法名和参数行为。
3. 后续若要缩减 API，必须另开兼容性决策，不混入模块化重构。

## 7. 建议迁移顺序

### Step A｜静态数据先行
优先把纯静态定义迁到 `src/data/`：

- 元素、解锁节点、境界、灵印、技能、Perks、丹药。
- 装备、套装、词条、词条联动。
- W10/W20/W30 突破和 Boss 辅助池。
- 敌人规格和天命奖励定义。

迁移前要确认常量之间的依赖顺序；数据文件不读取 DOM、不读写 `game`。

### Step B｜Core 与运行时上下文
先明确唯一状态所有权，再拆：

- `game` 的创建和替换。
- `cam`、输入状态和计时状态的归属。
- RNG 的创建和传递。
- UI 与业务系统调用接口。

不要直接建立一个装满所有函数的 `global.js`。

### Step C｜低耦合业务模块
优先拆纯计算和相对独立的模块：

- Meta 存档序列化 / schema migration。
- 装备实例规范化、词条合法性、装备描述。
- 商店价格和材料计算。
- 资源流水与遥测纯计算。

### Step D｜跨系统流程
再拆：

- Wave lifecycle / W29 prep / W30 final.
- Combat / damage / status effects / Boss.
- Hero / skill / seal / synergy.
- Destiny / breakthrough / reward settlement.

### Step E｜UI
最后拆：

- Canvas / Camera / Draw。
- HUD / Inspector / Shop / Bag。
- Modal Manager。
- Keyboard / Pointer / Touch。
- Audio / VFX。

## 8. 本次审计结论

**当前不适合直接把 314 个函数按文件夹批量剪切。** 最主要的阻塞是共享状态和跨系统调用，不是文件夹尚未创建。

Phase 2 下一步应先完成：
1. 纯数据常量清单和相互依赖清单。
2. `game` / `cam` / 输入 / UI 状态所有权表。
3. RNG 消耗点清单和不可改变的测试约束。
4. `window.BG60` 兼容 API 清单。
5. 选定 context / system composition 方案。

完成以上内容后，才开始第一批真实代码迁移。当前报告不声称已经完成 AST 级调用图；高扇出数据是基于源码函数区块的静态名称引用扫描，迁移前仍需逐项复核。
