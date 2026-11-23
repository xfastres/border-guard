# 《边境守卫》v0.60 30 波开发进度与阶段交接文档

---

## 阶段 1 · 30 波骨架与 W10（已完成）

### 1. 分支与提交
- **工作分支**：`feat/v060-30wave`（从计划基线 `docs/v060-development-plan` 提交 `02b1668f79bb96bfa7315792f65502158be9f254` 切出）
- **核对基线**：
  - 代码基线：`refactor/v052-balance-lab` (`8dfac5a651808d15d944d1ce2ea06796cc466bdd`) — `Border-Guard-v0.52.html` 与 `balance/v052-baseline.json` 保持未改动且测试 100% 通过。
  - 设计基线：`docs/v060-design-review` (`8d9789b2790d939d1c3d8f043c7a296006528609`)
  - 计划基线：`docs/v060-development-plan` (`02b1668f79bb96bfa7315792f65502158be9f254`)
- **阶段 1 变更文件清单**：
  - `Border-Guard-v0.60.html`：v0.60 正式离线单文件可玩入口（内嵌同步自 `balance/v060-baseline.json` 的 `BALANCE` 配置与 `window.BG60` 调试契约）。
  - `balance/v060-baseline.json`：v0.60 30 波受控阶段曲线、6 大首领排班、5 个可配置解锁节点（`unlockNodes`）与经济/材料掉落基线配置。
  - `scripts/sync-balance.cjs`：扩展支持同步与校验 v0.52（`Border-Guard-v0.52.html` + `balance/v052-lab.html`）与 v0.60（`Border-Guard-v0.60.html` + `balance/v060-baseline.json`）。
  - `tests/v060-stage1.test.cjs`：阶段 1 自动化验收测试套件（覆盖 30 波曲线、W1→W10→W11 突破流程、24 个 W10 分支实战状态钩子、节点解锁与旧渡劫清理、`BG60.loadTestPreset` 36 组矩阵及 W20/W29/W30 结算流）。
  - `docs/v0.60-review/30-wave-development-progress.md`：本交接文档。

---

### 2. 已实现规则与临时参数

#### 2.1 已落地的正式规则（阶段 1 范围）
1. **30 波主流程骨架（W1–W30）**：
   - `MAIN_WAVES = 30`，完整打通 W1–W30 准备（`prep`）→ 战斗（`wave`）→ 灵气收菜（`harvest`）→ 胜负结算（`won` / `lost`）循环。
   - 移除旧四次修为手动渡劫（不再在 `Lv.4/9/14/19` 锁级等待按 `[T]` 渡劫，彻底移除构装押注赌局）、移除 W20 提前通关与无尽模式入口（`enterEndlessMode`）。
   - 失败在任意波次（含 W20、W30）立即进入三维度结算摘要弹窗（① 通关结果、② 本局表现、③ 长期成长与资源结算预览）；击败 W30 终局首领触发 30 波通关胜利结算。
2. **30 波受控阶段缩放曲线**：
   - 替换旧版失控的双重指数膨胀，改为记录在 `balance/v060-baseline.json` 中的 17 段三阶段波形曲线：
     - `normalHpGrowth = 1.115`，`eliteHpGrowth = 1.11`，`lateHpGrowthStart = 16 (1.022)`，`lateHpGrowthSecondStart = 24 (1.032)`。
     - 精英数量阶梯：W2–W11 每波 1 精英，W12–W21 每波 2 精英，W22–W30 每波 3 精英。
     - 6 大首领排班（`bossByWave`）：W5 `boss1`（熔岩巨魔）、W10 `boss2`（暗影死灵王）、W15 `boss3`（毁灭泰坦）、W20 `boss4`（天劫魔尊）、W25 `boss5`（玄冥妖皇）、W30 `boss6`（深渊主宰）。
3. **可配置波次/突破解锁节点（`UNLOCK_NODES`）**：
   - 神通卡池、主灵印星级上限（`sealCap` 2★→5★）与辅灵印槽（`subCap` 0→2 槽）完全改读 `BALANCE.progression.unlockNodes`：
     - `w1_start`（W1+）：`sealCap: 2★`，`subCap: 0`，神通池 `['blades','firewave','nova','berserk']`
     - `w6_node`（W6+）：`sealCap: 3★`，`subCap: 1`，神通池解锁 `thunder`，组合技阶位 `comboTier: 1`
     - `w10_breakthrough`（W10+ 且完成 W10 突破）：`sealCap: 4★`，`subCap: 2`，神通池解锁 `stomp`，`comboTier: 2`，`dmgBonus: +12%`
     - `w16_node`（W16+ 且完成 W10 突破）：`sealCap: 5★`，`subCap: 2`，`dmgBonus: +25%`
     - `w20_breakthrough`（W20+ 且完成 W20 突破）：`sealCap: 5★`，`subCap: 2`，`dmgBonus: +60%`，`cdMult: 0.85`
4. **旧渡劫丹药下架与局内基础丹药整理**：
   - 彻底下架旧渡劫专属的 `护法丹` (`guard`) 与 `补天丹` (`mend`)，清理 `修为丹` (`xp`) 的旧渡劫说明。
   - 当前商店丹药池提供 `修为丹` (`xp`)、`回春丹` (`heal`)、`淬灵丹` (`temper`，提供 `+2` 锻材与生命恢复)。
5. **波间自由准备、自动开波暂停保护与 W29 战后 90 秒独立终局整备**：
   - 普通波间自由准备；当开启 `autoWave` 时，若 `hasPendingDecision()` 为真（存在待完成的 W10 突破、未关闭的升级/宝箱弹窗或地面未拾取宝箱），**真正暂停自动开波计时**（不再 8 秒后强行开波）。
   - W29 战后自动收起地面遗留宝箱并进入 `subPhase = 'w29_final_prep'`（`game.finalPrep = { active: true, timer: 90, duration: 90 }`），在战利品弹窗关闭后按真实时间倒计时 90 秒，支持玩家提前手动点击【开始第 30 波】或倒计时归零自动进入 W30。
6. **普通神通卡（隔级选卡）与 W10 首次大型突破**：
   - 普通升级：偶数级（`lv % 2 === 0`）弹出神通三选一，奇数级自动灵脉淬体加血上限与恢复。
   - W10 战后触发首次大型突破：
     - 第一步：玩家从已学会的神通中**指定 1 门主力神通**（`selectW10BreakthroughSkill(skillKey)`）。
     - 第二步：从该神通的 4 个分支池中**随机抽取 3 个形态分支三选一**（`pickW10BreakthroughBranch(branchKey)`）。
   - 全部 6 门神通共实现 24 个形态/机制分支（每门神通 4 个分支），全部复用跨阶段共享战斗状态字段：
     - **火系钩子（`fire_mark_detonate`）**：`e.fireMarkT`、`e.fireMarkStacks`、`applyFireMark()`、`triggerFireDetonation()`，统计记录于 `game.stats.fireMarksApplied` / `game.stats.fireDetonations`。
     - **冰系钩子（`frost_slow_shield`）**：`e.slowT`、`applyFrostSlow()`、`gainFrostShield()`、`triggerFrostPulse()`，统计记录于 `game.stats.frostSlowsApplied` / `game.stats.frostShieldGained`。
7. **调试契约 `window.BG60.loadTestPreset`**：
   - 支持 `{ wave, tier, build, materials, gold, seed }`（`tier`: `'weak' | 'standard' | 'strong'`，`build`: `'fire' | 'frost'`）。
   - W10 战前与 W20 战前预设严格使用**尚未完成本波突破**的状态；W11+ 预设包含已完成的 W10 分支；W21+ 预设包含已完成的 W20 突破占位状态。

#### 2.2 阶段 1 临时参数与后续阶段占位说明
- **普通材料（`game.materials`）**：阶段 1 已实现精英掉落（默认 `+1`）、首领掉落（默认 `+3`）、妖碑奖励（`+2`）与淬灵丹（`+2`）以及顶栏 `#matPill` 显示，供阶段 2 装备打造与词条重铸直接消费。
- **W20 第二次大型突破**：阶段 1 在 W20 通关后（及 `loadTestPreset` 的 W21+ 预设中）写入 `game.hero.breakthroughs.w20 = { wave: 20, completed: true, placeholder: true, stage: 'stage1_placeholder', ... }` 并激活 `w20_breakthrough` 节点属性；完整的“流派方向三选一 → 二级强化三选一”交互弹窗将在**阶段 3** 实现。
- **W20 / W30 Boss 固定机制 + 随机辅助机制**：阶段 1 在 `game.bossIntel` 中预留了 `w20Core`/`w20Aux` 与 `w30Core`/`w30Aux` 字段并在 W25/W30 接入了 `boss5`/`boss6` 基础战斗技能，完整的随机辅助词条池与 W29 情报面板展示将在**阶段 3** 深化。

---

### 3. 实测命令与结果

在 `/home/antigravity/xfastres/border-guard` 工作区下执行以下实测命令，全部 100% 通过：

```bash
node scripts/sync-balance.cjs --check
node --test tests/v052-balance-lab.test.cjs
node --test tests/v060-stage1.test.cjs
```

实测输出摘要：
- `node scripts/sync-balance.cjs --check`：
  - `PASS: embedded balance matches balance/v052-baseline.json`
  - `PASS: embedded balance matches balance/v060-baseline.json`
- `node --test tests/v052-balance-lab.test.cjs`：
  - `7 tests, 7 pass, 0 fail`（v0.52 基线与平衡实验室毫发无损）
- `node --test tests/v060-stage1.test.cjs`：
  - `5 tests, 5 pass, 0 fail`：
    1. `v0.60 config & embedded BALANCE are synced and configure 30-wave controlled scaling`（验证 30 波配置同步、W5/10/15/20/25/30 六大首领排班及受控缩放曲线）
    2. `W1 -> W10 normal progression, auto-wave decision pause, W10 breakthrough flow, and W11 observable combat state changes (Fire & Frost)`（验证隔级选卡无旧渡劫锁级、待选弹窗/突破时自动开波真正暂停、击败 W10 首领触发“指定已学神通 → 分支三选一”、进入 W11 后火系火标/引爆与冰系减速/冰盾产生可观察的实战投射物/法阵/状态变化）
    3. `Configurable unlock nodes (sealCap 2★->5★, subCap 0->2, skill pool) and removal of old tribulation/pills`（验证 5 个解锁节点的 `sealCap`/`subCap`/神通池开放，验证商店与丹药定义绝不出现 `护法丹`/`补天丹` 及旧渡劫接口）
    4. `BG60.loadTestPreset across W10/W11/W20/W21/W29/W30 (weak/standard/strong x fire/frost) and W20/W29/W30 settlement flows`（验证 36 组预设矩阵、W20 战败直接结算、W20 胜利进入 W21、W29 战后 90s 独立倒计时进入 W30、W30 击败 Boss 胜利三维度结算与失败结算）
    5. `All 24 W10 branches across all 6 skills execute in combat and establish their cross-stage state hooks`（逐一实测全部 6 门神通的 24 个 W10 分支在实战中建立 `fire_mark_detonate` 或 `frost_slow_shield` 状态）

---

### 4. 下一阶段（阶段 2 · 装备打造与重铸）起手入口

#### 4.1 阶段 2 关键接入点
1. **材料与金币字段**：直接读写 `game.materials` 与 `game.gold`（顶栏 `#matPill` 与详情面板已绑定 `game.materials`）。
2. **构装与跨阶段状态钩子联动**：
   - 火系装备词条可直接检测目标 `e.fireMarkT > 0` / `e.fireMarkStacks` 或调用 `applyFireMark(e, stacks, source, duration)` 与 `triggerFireDetonation(e, dmgMult, radius, skillKey)`（位于 `Border-Guard-v0.60.html` 的 `CROSS-STAGE COMBAT STATE HOOKS` 区块）。
   - 冰系装备词条可直接检测目标 `e.slowT > 0` / `e.freezeT > 0` 或领主 `game.hero.frostShieldActive` / `game.hero.shield > 0`，并调用 `applyFrostSlow(e, slow, duration, source)`、`gainFrostShield(amount, duration, maxShield)` 与 `triggerFrostPulse(radius, rawDmg, freezeDur)`。
3. **W10 突破凭据与分支查询**：
   - `game.hero.vouchers.w10` / `game.hero.vouchers.w20`（阶段 2 可用于高阶打造解锁或特殊突破装进阶条件）。
   - `game.hero.breakthroughs.w10` 与 `game.hero.w10Branch[skillKey]`。

#### 4.2 可直接复制的 `BG60.loadTestPreset` 调试调用示例

在浏览器控制台或自动化测试脚本中可直接调用：

```js
// 1. W10 战前（尚未完成 W10 突破，用于测试击败 W10 首领后触发首次大型突破）
window.BG60.loadTestPreset({ wave: 10, tier: 'standard', build: 'fire', materials: 12, gold: 180, seed: 2026 });

// 2. W11 战前（已完成 W10 火系突破【烙印穿云】，携带锻材与金币预算，供阶段 2 测试装备打造/重铸与火标引爆联动）
window.BG60.loadTestPreset({ wave: 11, tier: 'standard', build: 'fire', materials: 25, gold: 260, seed: 2026 });

// 3. W11 战前（已完成 W10 冰系突破【凛冬寒涡】，携带锻材与金币预算，供阶段 2 测试装备打造/重铸与减速冰盾联动）
window.BG60.loadTestPreset({ wave: 11, tier: 'standard', build: 'frost', materials: 25, gold: 260, seed: 2026 });

// 4. W20 战前（已完成 W10 突破、尚未完成 W20 突破，主印上限 5★、辅印 2 槽）
window.BG60.loadTestPreset({ wave: 20, tier: 'strong', build: 'fire', materials: 40, gold: 420, seed: 2026 });

// 5. W29 / W30 终局验证（包含 W10 突破与 W20 突破阶段 1 占位状态）
window.BG60.loadTestPreset({ wave: 29, tier: 'standard', build: 'frost', materials: 60, gold: 550, seed: 2026 });
window.BG60.loadTestPreset({ wave: 30, tier: 'strong', build: 'fire', materials: 80, gold: 700, seed: 2026 });
```

---

## 阶段 2 · 装备词条、联动和普通经济（已完成）

### 1. 分支、基线与变更文件
- **工作分支**：`feat/v060-30wave`
- **接手基线提交**：`a4b79d0`（阶段 1 交付提交）
- **未改动基线核对**：`Border-Guard-v0.52.html` 与 `balance/v052-baseline.json` 保持原样未动，`node --test tests/v052-balance-lab.test.cjs` 100% 通过。
- **阶段 2 变更文件清单**：
  - `balance/v060-baseline.json`：新增 `equipment` 完整配置块（`slotWeights` 50%/35%/15%、`sourceStages` 1–3 阶段倍率、`recycle` 按品质+来源阶段回收与 `paidGoldSellCapRatio` 防套利、`shopPricing` 阶段+同系递增/封顶/`sameElemResetByStage`、`materialEnhance` 5 档材料优化、`synergyCombat` 火冰双/三联动战斗参数）与 `economy.sealMasteryRouteCost`。
  - `Border-Guard-v0.60.html`：落地独立装备实例系统、12 条词条与互斥组、火系引爆与冰系护体双/三词条实战联动、常规商店装备上架与定价体系、出售/拆解防套利回收、普通材料优化（强化基础属性与已有词条数值档位）、3★ 同系灵印专精二选一、构筑面板/详情面板/宝箱/商店/背包可读性 UI、`BG60.loadTestPreset` 升级与 `exportBuildPreset`/`importBuildPreset` 序列化接口。
  - `tests/v060-stage2.test.cjs`：阶段 2 自动化验收测试套件（5 大场景全覆盖）。
  - `docs/v0.60-review/30-wave-development-progress.md`：本阶段交接文档。
- **试玩入口**：直接离线打开仓库根目录 `Border-Guard-v0.60.html`（或通过浏览器控制台 `window.BG60` 调试）。

---

### 2. 已实现规则（含评审推荐方案落地）

1. **独立装备实例系统（彻底替代旧版静态 ID 同名自动合星）**：
   - 每件装备为独立对象 `{ uid, baseKey, name, icon, elem, set, rarity, sourceStage, slotsCount, affixes, enhanceLv, paidGold, extractedCount, origin }`。
   - **品质与槽位数完全独立随机**：`rollGearSlotsCount` 按 1 槽 50% / 2 槽 35% / 3 槽 15% 独立抽样；出厂自动填满全部槽位。
   - **唯一性与互斥组校验**：`validateGearAffixes` 与 `rollGearAffixes` 严格阻止同件装备重复词条及冲突互斥组共存（如 `proc_style`: 紫电弧光/疾风迅影；`crit_stance`: 破军锐锋/磐石守御）。
   - **彻底移除旧版自动合星**：`findGearStackTarget` 固定返回 `null`，重复获取同名构装始终作为独立实例存入背包，绝不覆盖已有随机槽位与词条。
   - **来源阶段永久锁定**：`sourceStage` 在生成时按波次锁定（阶段 1=W1–W10、阶段 2=W11–W20、阶段 3=W21–W30）。

2. **两套完整跨阶段联动链路（与阶段 1 W10 状态钩子共用战斗状态）**：
   - **火系引爆链路**（共用 `e.fireMarkT` / `e.fireMarkStacks` / `applyFireMark` / `triggerFireDetonation`）：
     - 原始词条独立保留：`fire_brand`（炽炎烙印）、`fire_burst`（爆燃核心）、`fire_chain`（余烬连环）。
     - **双词条联动**（`fire_detonate_duo` 等同冲突组按优先级最高激活一个）：火系攻击/技能挂【火标】，命中已带【火标】敌人触发单次范围引爆。
     - **完整三词条联动**（`fire_detonate_trio`，严格**替代**原双联动，同一击绝不双算）：首次引爆后带防递归锁 `_inFireChainTransfer` 有限向邻近 3.2 格内带标敌人最多传递 2 次（伤害 0.78 衰减）；若周围无其他带标敌人（孤立精英/Boss），按评审推荐方案将剩余传递机会转为**有上限衰减聚焦引爆**（衰减系数 `0.55 / 0.35`，上限 `0.90×` 首次引爆伤害）。
   - **冰系护体链路**（共用 `e.slowT` / `applyFrostSlow` / `gainFrostShield` / `triggerFrostPulse`）：
     - 原始词条独立保留：`frost_chill`（寒霜侵骨）、`frost_ward`（凝冰护心）、`frost_nova_counter`（凛冬反震）。
     - **双词条联动**（`frost_aegis_duo` 等同冲突组按优先级最高激活一个）：命中已减速/冰冻敌人凝结短时【寒冰护盾】。
     - **完整三词条联动**（`frost_aegis_trio`，严格**替代**原双联动）：命中减速敌凝结更高额护盾；**护盾受击时触发冰环反制**（`shield_hit`）；按评审推荐方案，在走位避伤时可通过**有寒冰护盾状态下主动冲刺（Space/`castHeroDash`）**或**满盾刷新**主动触发一次带内置冷却（1.5s）的冰环反制（`dash_shield` / `full_shield_refresh`）。
   - **叠加边界**：单件同冲突组仅激活最高优先级双联动；完整三联动严格替代同链路双联动；跨 4 个装备栏同名联动全局仅生效一次，火系与冰系不同联动可并存；换装、卸下、替换、强化或重开立即重算。
   - **UI 可读性**：左侧构筑总览、属性详情 `[C]`、宝箱三选一、商店装备卡与背包悬浮均清晰展示品质、来源阶段、`+enhanceLv`、1/2/3 槽词条、**当前已激活的双/三联动**以及**“再配哪条词条可激活/升级为完整三联动”**提示。

3. **常规商店、价格递增、出售/拆解防套利、普通材料优化与 3★ 灵印专精路线**：
   - **商店装备上架与定价**：商店每轮固定至少 1 格（第 3 格保底 + 第 4 格概率）上架独立装备商品，低概率出现高稀有词条；定价按当前购买阶段递增 + 同系重复购买次数递增（每次 +18%）+ 按品质价格封顶（`common 64 / rare 104 / epic 156 / legend 220`），并提供可配置参数 `BALANCE.equipment.shopPricing.sameElemResetByStage`（默认 `false` 局内累计）。
   - **出售/拆解与防套利**：背包每件装备可自主选择**出售（得金币）**或**拆解（得普通材料 `game.materials`）**；收益严格按 `inst.rarity` 与 `inst.sourceStage` 计算，与 1/2/3 槽位和当前波次 `game.wave` 完全独立；商店购入装备（`paidGold > 0`）出售价强制 `<= Math.min(paidGold - 1, Math.floor(paidGold * 0.72))`，彻底杜绝买入→卖出套利及跨波囤货升值套利。
   - **普通材料优化（计划 L96 评审推荐方案）**：`enhanceGear` 消耗 `game.materials`（+1 至 +5 消耗 `2/3/5/7/10` 锻材），同步提升装备基础属性倍率（每级 +18%）与已有词条数值档位（`affix.tier = 1 + enhanceLv`），**严格保留原品质、来源阶段、槽位数及词条种类**（不加槽、不洗词条，词条转移留待阶段 4 天命转印）。
   - **同系灵印 3★ 分阶段进阶**：保留原有主/辅灵印共鸣与买空补货；主灵印达到 3★ 后在灵印阵盘开放**免费稳健进阶（0 金）vs 付费机制专精（35 金）**二选一（`chooseSealRoute`）。

---

### 3. 实测命令与对照数据（全部 100% 实测通过）

执行命令：
```bash
node scripts/sync-balance.cjs --check
node --test tests/v052-balance-lab.test.cjs
node --test tests/v060-stage1.test.cjs
node --test tests/v060-stage2.test.cjs
```

测试结果汇总：
- `sync-balance.cjs --check`：v0.52 与 v0.60 内嵌配置均 `PASS`。
- `tests/v052-balance-lab.test.cjs`：`7/7 pass`。
- `tests/v060-stage1.test.cjs`：`5/5 pass`。
- `tests/v060-stage2.test.cjs`：`5/5 pass`。

#### 3.1 独立槽位抽样实测（4000 样本，种子 `202602`）
- 1 槽：**49.20%**（目标 50%） · 2 槽：**35.50%**（目标 35%） · 3 槽：**15.30%**（目标 15%）；凡品与传说各 2000 样本独立收敛于同一分布。

#### 3.2 两套联动固定种子对照实测（W11，种子 `2026`，剔除 W10 分支与灵印干扰）
- **火系引爆链路（同基础装 `flame_fan`）**：
  | 场景与配置 | 总伤害 | 总引爆 | 双联动计数 | 三联动计数 | 群体传递 | 孤立聚焦 |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: |
  | 群怪(4带标兽人) · 单词条 `fire_brand` | 49 | 0 | 0 | 0 | 0 | 0 |
  | 群怪(4带标兽人) · 双联动 `fire_brand+fire_burst` | 799 | 1 | 1 | 0 | 0 | 0 |
  | 群怪(4带标兽人) · 完整三联动 `fire_brand+fire_burst+fire_chain` | 2317 | 3 | **0** | 1 | **2** | 0 |
  | 孤立Boss(`boss2`) · 双联动 | 249 | 1 | 1 | 0 | 0 | 0 |
  | 孤立Boss(`boss2`) · 完整三联动 | 680 | 1 | **0** | 1 | 0 | **1** |

- **冰系护体链路（同基础装 `frost_mirror`）**：
  | 配置 | 命中后护盾 | 累计获盾 | 双联动 | 三联动 | 受击冰环 | 有盾冲刺冰环 | 满盾刷新冰环 |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
  | 单词条 `frost_chill` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
  | 双联动 `frost_chill+frost_ward` | 14 | 34 | 1 | 0 | 0 | 0 | 0 |
  | 完整三联动 `frost_chill+frost_ward+frost_nova_counter` | 18 | 38 | **0** | 1 | **1** | **1** | **1** |

#### 3.3 经济与防套利实测摘要
- 灵品火装商店基价：Stage 1 = `42 金` → Stage 2 = `55 金` → Stage 3 = `69 金`；同系重复购买递增 +18%/次，封顶 `104 金`。
- 同品质同阶段 1/2/3 槽装备出售金币与拆解锻材完全一致；W2 购入装备推进至 W28 后回收收益零升值；商店购入装备立即出售严格亏损（`< paidGold`）。
- 普通材料强化 `enhanceGear` 后：`enhanceLv` 与 `affix.tier` 提升，`getHeroStats().dmgMult` 与词条数值同步上升，`rarity / sourceStage / slotsCount / affix.id[]` 100% 保持不变。

---

### 4. 下一阶段（阶段 3 · W16–W28 贯通）起手入口与可复制 `BG60` 调用

#### 4.1 阶段 3 可直接复用的装备、联动与经济接口
- 装备联动实时查询：`window.BG60.getActiveGearAffixSynergies()`（含 `hasFireDuo` / `hasFireTrio` / `hasFrostDuo` / `hasFrostTrio` / `active` / `hints`）。
- 构筑预设序列化导入/导出：`const snap = BG60.exportBuildPreset(); BG60.importBuildPreset(snap);`（供 W16→W28 跨波对照、W20 前后同一份装备对照及阶段 4/5 复用）。
- 普通材料与重抽消费：直接扣减 `BG60.game.materials`（已有精英/首领/妖碑/淬灵丹/装备拆解五条来源，以及 `enhanceGear` 常规消费出口）。
- 共享战斗状态钩子：W20 锁定方向基础效果与强化卡可直接扩展 `triggerFireDetonation`、`applyFireMark`、`gainFrostShield`、`triggerFrostPulse`，与 W10 分支和阶段 2 装备词条联动共用同一套状态与统计计数。

#### 4.2 阶段 3 可直接复制的 `BG60` 调试命令
```js
// 1. W11 战前 · 火系标准双联动 vs 强力三联动对照（含 W10 火系突破分支 + 阶段 2 独立联动装备）
window.BG60.loadTestPreset({ wave: 11, tier: 'standard', build: 'fire', materials: 20, gold: 240, seed: 2026 });
window.BG60.loadTestPreset({ wave: 11, tier: 'strong',   build: 'fire', materials: 25, gold: 300, seed: 2026 });

// 2. W11 战前 · 冰系标准双联动 vs 强力三联动对照（含 W10 冰系突破分支 + 阶段 2 独立联动装备）
window.BG60.loadTestPreset({ wave: 11, tier: 'standard', build: 'frost', materials: 20, gold: 240, seed: 2026 });
window.BG60.loadTestPreset({ wave: 11, tier: 'strong',   build: 'frost', materials: 25, gold: 300, seed: 2026 });

// 3. W16 预选起点 & W20 战前（未完成 W20 突破，用于阶段 3 验收 W16-W19 预选、W19 情报、W20 Boss 与战后材料重抽）
window.BG60.loadTestPreset({ wave: 16, tier: 'standard', build: 'fire',  materials: 16, gold: 320, seed: 2026 });
window.BG60.loadTestPreset({ wave: 20, tier: 'standard', build: 'fire',  materials: 0,  gold: 380, seed: 2026 }); // 零材料用例
window.BG60.loadTestPreset({ wave: 20, tier: 'standard', build: 'frost', materials: 12, gold: 380, seed: 2026 }); // 够重抽一次
window.BG60.loadTestPreset({ wave: 20, tier: 'strong',   build: 'fire',  materials: 40, gold: 460, seed: 2026 }); // 连续多次重抽

// 4. 装备强化、出售/拆解与构筑快照导入导出示例
window.BG60.enhanceGear({ location: 'equipped', idx: 0 });
const presetSnap = window.BG60.exportBuildPreset();
window.BG60.importBuildPreset(presetSnap);
```

---

## 阶段 3 · W16–W28 贯通（已完成）

### 1. 分支、基线与变更文件
- **工作分支**：`feat/v060-30wave`
- **接手基线提交**：`6269558`（阶段 2 交付提交）
- **未改动基线核对**：`Border-Guard-v0.52.html` 与 `balance/v052-baseline.json` 保持完全未动，`node --test tests/v052-balance-lab.test.cjs` 100% 通过。
- **阶段 3 变更文件清单**：
  - `balance/v060-baseline.json`：更新基线标识为 `v0.60/stage3-w16-w28-flow`；新增 `w20Breakthrough` 完整配置块（`preselectOpenWave: 16`、`bossIntelRevealWave: 19`、`groupSize: 2`、`rerollBaseCost: 4`、`rerollStep: 2`、`minPoolBuffer: 2`、`baseEffects`、`bossCore`、4 条公平可反制辅助机制 `bossAuxPool`）、`enemies.totem`（可击碎护盾图腾）、`wave.w21ShowcaseMix`、`wave.w22To24Themes`（3 套共享主威胁递进主题）、`wave.w25To28Pools`（W25–W28 每波 3 套独立候选敌群池）与 `wave.w28Omen`（终局预兆）。
  - `Border-Guard-v0.60.html`：落地 W16–W19 第二次突破方向预选面板与 UI 生效边界提示、W19 揭晓 W20 首领固定核心+随机公平辅助机制与实战执行、W20 开战锁定/失败即结算/胜利凭证保底与基础效果即时生效、W20 战后强化选卡与付费整组重抽（0 相邻重复 + $\ge 2K+2$ 容量红线防扣保护）、18 张带可观察战斗行为变化的 W20 强化卡（与 W10 分支和阶段 2 装备词条共享战斗状态钩子）、W21 强势释放、W22–W24 同主威胁组合递进、W25–W28 无战前剧透独立敌群抽取、W28 三段终局预兆演出、升级 `BG60.loadTestPreset`（W21+ 替换为真实 W20 数据，清除阶段 1 占位）与阶段 3 调试 API（`BG60.version = '0.60.0-stage3'`）。
  - `tests/v060-stage3.test.cjs`：阶段 3 自动化验收测试套件（5 大场景全覆盖）。
  - `tests/v060-stage1.test.cjs`：同步更新第 4 项用例中对 W21+ 预设 `breakthroughs.w20` 的断言，兼容阶段 3 真实 W20 数据（`placeholder: false`）。
  - `docs/v0.60-review/30-wave-development-progress.md`：追加本阶段完整交接文档。
- **试玩入口**：离线直接打开 `Border-Guard-v0.60.html`（控制台暴露 `window.BG60`）。

---

### 2. 已实现规则（阶段 3 全部要求落地）

1. **W16–W19 方向预选与 W19 首领情报**：
   - **W16 备战期开放预选**：顶栏/底栏开放【W20 突破预选】入口，提供 3 套带明确基础行为变化的方向：
     - `fire_chain_surge`（【聚焰连爆】）：火标引爆时牵引周围敌人并保底获得 1 次邻近连爆传递；无邻近目标时转为孤立聚焦补爆。
     - `frost_bastion_counter`（【凛冬反制】）：寒冰护盾上限 +35，持盾期间周期释放寒霜光环，且解锁“持盾受击”与“持盾冲刺（不受击走位）”双路径主动冰环反制。
     - `breaker_momentum`（【破阵蓄势】）：冲刺后强化下一次神通/普攻，迸发环形破阵震波并附带易伤与减速。
   - **W16–W19 自由切换 + 无提前生效**：预选弹窗与 HUD 明确标注“**击败 W20 首领拿到突破凭证后，已锁定方向的基础效果才会生效**”；战前调整不会激活任何战斗效果。
   - **W19 揭晓 W20 Boss 情报**：进入 W19 备战期立即公布 `boss4`（天劫魔尊）的固定核心机制（天劫震击 + 天火领域）与本局随机抽取的公平辅助机制（从 4 套公平池抽取：`oppression_ring` 领域压迫环、`shield_totem` 召唤可击碎护盾图腾、`chase_barrage` 周期追击弹幕、`charged_shockwave` 蓄力十字震荡波；**严禁**按命中频次反伤、永久禁近战或元素免疫，全部具备可读预警与走位/转火窗口，并在 W20 实战中完整执行）。

2. **W20 锁方向开战、失败即结算、凭证保底与付费整组重抽**：
   - **开战锁定**：点击开始 W20 时，若尚未选定预选方向则弹出方向选择确认框阻止开战；选定后开战立即锁定 `w20State.locked = true`，W20 战斗中方向基础效果仍未生效（按未完成第二次突破标定）。
   - **失败即结算**：W20 战败立即进入 `phase = 'lost'` 结算弹窗，无第二次挑战机会。
   - **胜利凭证保底 + 基础效果立即生效**：击败 W20 首领 100% 授予 `hero.vouchers.w20 = true`，**即便 `game.materials === 0` 也当场生效已锁定方向的基础行为效果**（`baseEffectActive = true`），并自动挂起 `pendingBreakthrough = 'w20'`（自动开波暂停保护同步生效）弹出战后强化选卡。
   - **付费整组重抽与容量红线**：
     - 参数全部外置在 `balance/v060-baseline.json` 的 `w20Breakthrough`：`groupSize (K) = 2`、`rerollBaseCost = 4`、`rerollStep = 2`（费用序列 `4 → 6 → 8 → 10 → 12 ...`，按钮实时标明下一次价格）。
     - **零材料玩家**：可直接免费从首组 K 张卡中任选 1 张进入 W21。
     - **相邻 0 重复 & 有效候选池 $\ge 2K+2$ 红线**：每个锁定方向在排除不适用/已拥有/互斥卡后均拥有 **8 张有效候选卡**（5 张方向专属 + 3 张相容共用，严格 $\ge 2K+2 = 6$），确保连续重抽自然覆盖多种组合而不来回机械切换；若未来误配导致有效池 $< 2K+2$，代码拒绝扣材料并完整保留当前候选与余额。

3. **W21 强势释放、W22–W24 同主威胁递进、W25–W28 无剧透独立抽取与 W28 终局预兆**：
   - **W21 强势释放**：专用 `w21ShowcaseMix` 队列与中段血量窗口，让火系挂标→牵引连爆与冰系减速→叠盾→主动冰环在进场即刻直观呈现，所有 W10/装备/W20 状态跨波连续保留。
   - **W22–W24 同主威胁组合递进**：按本局种子从 3 套主题（`mobile_rush` 高机动突进压迫 / `flame_siege` 持续火圈与重甲推进 / `arcane_crossfire` 远程齐射与法阵封锁）抽取一套，W22→W23→W24 共享同一 `primaryThreat`，通过敌人搭配组合逐波加压（`pressureLevel: 1 → 2 → 3`，逐步用高压组合替换炮灰史莱姆）。
   - **W25–W28 独立抽取且严禁战前剧透**：W25–W28 每波各自配置 3 套风格不同的敌群池，仅在 `startWave()` 开战时独立抽取并揭晓（允许相邻波次重复 `primaryThreat`；W25 同时保留 `boss5` 玄冥妖皇）；备战期 HUD、顶栏与按钮严禁出现任何未开战普通敌群名称剧透。
   - **W28 终局预兆**：W28 开战横幅、中段风暴节点与通关进入 W29 备战期三处触发明确的终局预兆演出与 HUD 徽记，衔接阶段 4 的 W29 终局情报与 90 秒最终整备。

---

### 3. 实测命令与定量对照数据（全部 100% 实测通过）

执行全量回归命令：
```bash
node scripts/sync-balance.cjs --check
node --test tests/v052-balance-lab.test.cjs
node --test tests/v060-stage1.test.cjs
node --test tests/v060-stage2.test.cjs
node --test tests/v060-stage3.test.cjs
```
结果摘要：
- `sync-balance.cjs --check`：v0.52 与 v0.60 内嵌 `BALANCE` 均 `PASS`
- `tests/v052-balance-lab.test.cjs`：`7/7 pass`
- `tests/v060-stage1.test.cjs`：`5/5 pass`
- `tests/v060-stage2.test.cjs`：`5/5 pass`
- `tests/v060-stage3.test.cjs`：`5/5 pass`

#### 3.1 两套构筑“W10 → 常见 1–2 槽装备 → W20”跨阶段战斗行为对照实测（种子 `2026`，仅携带 2 槽常见双联动装备，不含 3 槽三联动与灵印干扰）

- **火系链路**：W10【烙印穿云 (`fw_brand_pierce`)】挂火标 → 2 槽常见装备【离火羽扇 (`fire_brand + fire_burst`)】双联动单次引爆 → W20 零材料基础效果【聚焰连爆】解锁牵引聚怪 + 1 次连爆传递（孤立目标转聚焦补爆） → W20 强化卡【超新星连爆 (`w20_fire_supernova_chain`)】追加 +2 次传递并在传递点留下灼地熔岩 / 【孤焰裁决 (`w20_fire_isolated_exec`)】在孤立 Boss 处附加 3.5s 易伤与双倍聚焦爆发：

  | 波次与遭遇 | 阶段配置 | 总伤害 | 引爆次数 | 群体传递 | 孤立聚焦 | 聚怪牵引 | 熔岩残阵 | 易伤(s) |
  | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
  | W21 群怪(4带标兽人) | W20 突破前 | 1211 | 1 | 0 | 0 | 0 | 0 | 0 |
  | W21 群怪(4带标兽人) | W20 零材料基础效果 | 2363 | 2 | **1** | 0 | **1** | 0 | 0 |
  | W21 群怪(4带标兽人) | W20 +【超新星连爆】 | 3821 | 4 | **3** | 0 | **1** | **3** | 0 |
  | W23 群怪(4带标兽人) | W20 突破前 → 基础 → 超新星 | 1241 → 2423 → 3917 | 1 → 2 → 4 | 0 → 1 → 3 | 0 | 0 → 1 → 1 | 0 → 0 → 3 | 0 |
  | W26 群怪(4带标兽人) | W20 突破前 → 基础 → 超新星 | 1343 → 2594 → 4369 | 1 → 2 → 4 | 0 → 1 → 3 | 0 | 0 → 1 → 1 | 0 → 0 → 3 | 0 |
  | W21 孤立首领(`boss4`) | W20 突破前 | 445 | 1 | 0 | 0 | 0 | 0 | 0 |
  | W21 孤立首领(`boss4`) | W20 零材料基础效果 | 674 | 1 | 0 | **1** | 0 | 0 | 0 |
  | W21 孤立首领(`boss4`) | W20 +【孤焰裁决】 | 1336 | 1 | 0 | **1** | 0 | 0 | **3.5** |

- **冰系链路**：W10【凛冬寒涡 (`nv_seeking_vortex`)】持续施加减速 → 2 槽常见装备【寒冰护镜 (`frost_chill + frost_ward`)】命中减速敌凝结寒冰护盾 → W20 零材料基础效果【凛冬反制】提升护盾上限并直接解锁“持盾冲刺（无受击主动走位）”与“持盾受击”双路径冰环 → W20 强化卡【极寒闪环 (`w20_frost_dash_ring`)】将主动冲刺冰环冷却压至 `0.75s` 并在落点留冰径 / 【盈盾星爆 (`w20_frost_overflow_nova`)】在满盾刷新时（无需受击）迸发主动冰环并齐射 6 枚追踪冰枪：

  | 波次(W21 / W24 / W27 一致复现) | 盾上限 | 主动冲刺冰环 | 受击冰环 | 满盾刷新冰环 | 冲刺冰环 CD | 落点冰径 | 满盾齐射冰枪 |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
  | W20 突破前（2 槽双联动） | 128 | 0 | 0 | 0 | — | 0 | 0 |
  | W20 零材料基础效果【凛冬反制】 | **163** | **1** | **1** | 0 | 1.50s | 0 | 0 |
  | W20 +【极寒闪环】 | **163** | **1** | **1** | 0 | **0.75s** | **1** | 0 |
  | W20 +【盈盾星爆】 | **163** | **1** | **1** | **1** | 1.50s | 0 | **6** |

#### 3.2 W20 有效池容量、付费重抽序列与 W22–W28 敌群抽样实测
- **有效候选池容量**（初始未选卡状态，`K = 2`，红线 $2K+2 = 6$）：`fire_chain_surge` = **8 张**、`frost_bastion_counter` = **8 张**、`breaker_momentum` = **8 张**（全部满足 $\ge 6$）。
- **连续付费整组重抽实测**（种子 `202603`，初始锻材 `60`，火系方向）：
  - 首组（0 锻材，余 60）：`[w20_fire_isolated_exec, w20_shared_tactical_surge]`
  - 第 1 次重抽（付 4，余 56）：`[w20_shared_boss_breaker, w20_fire_supernova_chain]`（与首组 0 重复）
  - 第 2 次重抽（付 6，余 50）：`[w20_fire_dash_detonator, w20_fire_mark_vortex]`（与第 1 组 0 重复）
  - 第 3 次重抽（付 8，余 42）：`[w20_fire_ember_barrage, w20_shared_boss_breaker]`（与第 2 组 0 重复）
  - 第 4 次重抽（付 10，余 32）：`[w20_fire_dash_detonator, w20_fire_mark_vortex]`（与第 3 组 0 重复）
  - 第 5 次重抽（付 12，余 20）：`[w20_shared_elemental_echo, w20_fire_isolated_exec]`（与第 4 组 0 重复）
  - 6 组中共出现 **5 套** 互不相同的双卡组合，无相邻重复与机械双组来回切换。
- **W22–W24 同主威胁递进实测**（种子 `202604`）：共享 `flame_siege`（持续火圈与重甲推进）→ W22 `初阶试探 · 重甲前推+祭司火圈`（压力 1）→ W23 `组合升压 · 重甲火圈+毒爆双重封地`（压力 2）→ W24 `高压合围 · 重甲双祭司+影狼侧袭`（压力 3）。
- **W25–W28 多种子独立抽取实测**（备战期 UI 0 剧透，开战后揭晓）：
  - 种子 `9037`：W25 `影狼狂潮突袭群(mobile_rush)` → W26 `炽地重甲合围阵(flame_siege)` → W27 `妖火祭坛封锁群(flame_siege)`（相邻允许同威胁）→ W28 `终局前锋·疾影破阵群(mobile_rush)`
  - 种子 `9074`：W25 `影狼狂潮突袭群(mobile_rush)` → W26 `煞毒自爆突进群(mobile_rush)` → W27 `游猎弹幕绞杀群(arcane_crossfire)` → W28 `终局前锋·裂隙弹幕群(arcane_crossfire)`
  - 种子 `9111`：W25 `星穹弹幕齐射群(arcane_crossfire)` → W26 `双排巫师火力网(arcane_crossfire)` → W27 `妖火祭坛封锁群(flame_siege)` → W28 `终局前锋·裂隙弹幕群(arcane_crossfire)`

#### 3.3 W16 → W28 连续贯通通关后（W29 备战起点）真实状态快照（种子 `202605`，初始 300 金 / 14 锻材，W20 重抽 1 次消耗 4 锻材）
- **火系贯通终态（W29 备战）**：`lv: 13`、`gold: 1392`、`materials: 10`、`w10: fw_brand_pierce`、`w20: fire_chain_surge + w20_fire_isolated_exec`（`vouchers.w20 = true`）、W20 Boss 辅助 `charged_shockwave`、W28 终局预兆已完结（`omenClear = true`）、装备 `[离火羽扇(S2/+1/2槽:fire_brand+fire_burst), 熔核魔石(S2/+0/1槽:fury_crit), 狂暴战斧(S2/+0/1槽:vamp_siphon)]`（已激活 `fire_detonate_duo`）。
- **冰系贯通终态（W29 备战）**：`lv: 13`、`gold: 1392`、`materials: 10`、`w10: nv_seeking_vortex`、`w20: frost_bastion_counter + w20_frost_overflow_nova`（`vouchers.w20 = true`）、W20 Boss 辅助 `charged_shockwave`、W28 终局预兆已完结（`omenClear = true`）、装备 `[寒冰护镜(S2/+1/2槽:frost_chill+frost_ward), 极寒宝珠(S2/+0/1槽:iron_bastion), 引灵玉佩(S2/+0/1槽:wind_tempest)]`（已激活 `frost_aegis_duo`）。

---

### 4. 下一阶段（阶段 4 · W29–W30 终局整备、天命转印与终局首领）起手入口与可复制 `BG60` 调用

#### 4.1 阶段 4 可直接复用的阶段 3 接口与字段
- **W20 完整突破状态与凭证**：`game.hero.vouchers.w20`、`game.hero.breakthroughs.w20`（含真实 `directionKey` / `enhancementKey` / `baseEffectActive` / `placeholder: false`）、`BG60.getW20ActiveState()`、`BG60.hasW20Direction(dirKey)`、`BG60.hasW20Enhancement(enhKey)`。
- **W28 终局预兆与 W29 90 秒整备钩子**：`BG60.getEndgameOmenState()`、`game.finalPrep`（`active / timer / duration`）、`game.bossIntel`（可直接扩展 W29 揭晓 W30 `boss6` 固定核心 + 公平随机辅助机制）。
- **W16–W28 完整调试接口**：`BG60.selectW20PreselectDirection`、`BG60.getW20BossIntel`、`BG60.rerollW20Enhancements`、`BG60.pickW20Enhancement`、`BG60.getWaveEncounterInfo`、`BG60.getW22To24Theme`、`BG60.getW25To28Pool`。

#### 4.2 阶段 4 可直接复制的 `BG60` 调试命令
```js
// 1. W19 备战（已开放 W20 方向预选并已公布 W20 Boss 固定+随机辅助机制）
window.BG60.loadTestPreset({ wave: 19, tier: 'standard', build: 'fire',  materials: 16, gold: 340, seed: 2026 });

// 2. W20 战前（未完成 W20 突破、预选待锁定，验证 0 材料凭证保底与付费整组重抽）
window.BG60.loadTestPreset({ wave: 20, tier: 'standard', build: 'fire',  materials: 0,  gold: 380, seed: 2026 });
window.BG60.loadTestPreset({ wave: 20, tier: 'strong',   build: 'frost', materials: 36, gold: 460, seed: 2026 });

// 3. W21 / W25 / W28（已装配真实 W20 锁定方向 + W20 强化卡，可直接试玩 W21 强势体验、W25-28 独立抽取与 W28 终局预兆）
window.BG60.loadTestPreset({ wave: 21, tier: 'standard', build: 'fire',  materials: 18, gold: 420, seed: 2026 });
window.BG60.loadTestPreset({ wave: 28, tier: 'standard', build: 'frost', materials: 26, gold: 620, seed: 2026 });

// 4. W29 / W30 阶段 4 起手入口（真实 W10 + 阶段 2 装备 + 真实 W20 突破，携带终局整备资金与锻材）
window.BG60.loadTestPreset({ wave: 29, tier: 'standard', build: 'fire',  materials: 28, gold: 760, seed: 2026 });
window.BG60.loadTestPreset({ wave: 29, tier: 'strong',   build: 'frost', materials: 42, gold: 980, seed: 2026 });
window.BG60.loadTestPreset({ wave: 30, tier: 'standard', build: 'fire',  materials: 30, gold: 800, seed: 2026 });
```

---

## 阶段 4 · 天命赌局、转印和终局精修（已完成）

### 1. 分支、基线与变更文件
- **工作分支**：`feat/v060-30wave`
- **接手基线提交**：`bfd2d3e`（阶段 3 交付提交）
- **未改动基线核对**：`Border-Guard-v0.52.html` 与 `balance/v052-baseline.json` 保持完全未动，`node --test tests/v052-balance-lab.test.cjs` 100% 通过。
- **阶段 4 变更文件清单**：
  - `balance/v060-baseline.json`：更新基线标识为 `v0.60/stage4-destiny-transfer-endgame`；新增 `progression.initialTransferTokens` 与 `progression.bagCapacity (12)`；`equipment.materialEnhance` 扩展至 `+6` 精修上限（`[2, 3, 5, 7, 10, 14]`）；新增 `destinyGamble`（`minBet: 30`、`emptyTribulationChance: 0.22`、`categoryWeights` 严格四类各 `0.25`、`allowDuplicateCategories: true`、`preciousThresholds` 稀有 `60` / 转印符 `100` / 史诗&天命专属 `120` / 传说 `220`、`qualityChanceByBetBand`、`transferTokenYieldByBet`、`sealEssenceBonusByRarity`）、`affixTransfer`（转印符与金币费用）及 `endgameRefinement`（W21–W29 精英/首领/血碑/过波锻材倾斜与高稀有词条权重加成）。
  - `Border-Guard-v0.60.html`：同步内嵌 `BALANCE`；落地【🎲 天命赌局】完整系统与弹窗、8 条带真实战斗钩子的天命专属强化（`DESTINY_ENHANCEMENTS`）、独立安全领奖路径（`grantGearSafely` / `grantSealSafely` + `game.rewardStash` 满溢暂存，绝不覆盖/卖掉在用 5★ 主灵印）、【✨ 词条转移台】零副作用预览/取消与单次原子提交（`previewAffixTransfer` / `cancelAffixTransferPreview` / `commitAffixTransfer`）、W21–W29 终局精修掉落与过波锻材倾斜、W29 90 秒整备期间打开赌局/转移台不暂停倒计时及超时自动清草稿/安全自动领奖收尾、顶栏 `#tokenPill` 与次栏 `#destinyBtn`/`#transferBtn` 入口、`BG60` 升级至 `0.60.0-stage4`（含 `loadTestPreset` 支持 `transferTokens` 初始化与显式覆盖、`export/importBuildPreset` `v4` 序列化）。
  - `tests/v060-stage4.test.cjs`：阶段 4 自动化验收测试套件（5 大场景全覆盖）。
  - `tests/v060-stage3.test.cjs`：兼容版本号断言调整为匹配 `0.60.0-stage[3-9]`。
  - `docs/v0.60-review/30-wave-development-progress.md`：追加本阶段完整交接文档。
- **试玩入口**：直接离线打开仓库根目录 `Border-Guard-v0.60.html`（控制台暴露 `window.BG60`）。

---

### 2. 已实现规则（阶段 4 全部要求落地）

1. **天命赌局系统（Destiny Gamble）**：
   - **自由押注与单次原子扣款**：`rollDestinyGamble(betAmount)` 在备战期接受任意 `bet >= minBet (30)` 且 `bet <= game.gold` 的押注；确认后单次原子扣款并立即完成开奖，不可无痛撤回。低于最低门槛、余额不足、战斗中或存在未领取 `pendingOffer` 时直接拒绝、零扣款。
   - **空劫与珍贵门槛严格隔离**：空劫概率配置为 `22%`（触发空劫时仅扣合法押注、`pendingOffer = null`、不生成候选、不发奖）。低押注严格按 `preciousThresholds` 拦截：`< 60` 仅凡品、`< 100` 绝不出转印符、`< 120` 绝不出史诗与天命专属强化、`< 220` 绝不出传说。
   - **严格 4×25% 顶层权重与无稀有度保底**：中奖生成 3 件随机候选，`seal / gear / pill / special` 严格各占 `25%` 权重（支持 `allowDuplicateCategories` 配置开关）；品质纯按押注档位概率分布，**无稀有度保底**。
   - **转印物资与 8 条天命专属强化隔离**：
     - **天命转印符（`game.transferTokens`）** 置于 `special` 类别子池内部（与另外 2 件候选三选一取舍），普通商店与普通装备/灵印拆解绝不提供稳定获取。
     - **8 条天命专属强化（`DESTINY_ENHANCEMENTS`）** 仅由天命赌局产出（绝不进普通商店或升级池），具备非重复持有与 3 组显式互斥约束（`destiny_offense`、`destiny_defense`、`destiny_mobility`），并全部接入共享实战状态钩子：`destiny_ember_echo`（火标引爆补挂火标+下爆增伤）、`destiny_glacial_aegis`（冰盾上限+40与冰环反制回盾加速）、`destiny_phantom_stride`（冲刺减CD+路径火标/冰缓+暴击）、`destiny_fate_breaker`（首领/精英增伤+暴击易伤爆发）、`destiny_aegis_bulwark`（最大生命+90/减伤10%+每8s自动凝结32冰盾）、`destiny_resonance_crown`（神通伤害/暴伤与主印冷却）、`destiny_overdrive_nova`（超载减CD+星陨震爆+45冰盾）、`destiny_golden_temper`（每件≥+2构装增伤/攻速+入场赠4锻材）。
   - **已满级/不可用同类别替换**：主辅灵印全满星时自动替换为同类别可用项【灵印淬魂晶 (`seal_essence`)】永久增幅主印伤害；已拥有或互斥阻断的天命专属强化自动替换为同类别可用专属强化或转印符/特殊礼盒。
   - **已开奖未领取状态与严格幂等安全领奖**：
     - 状态结构：`game.destiny.pendingOffer = { offerId, bet, wave, choices: [...], claimed: false, claimedChoiceIndex: null, claimedAtWave: null }`。
     - 统一领取入口：`claimDestinyReward(choiceIndex)` 领奖前立即原子置 `offer.claimed = true` 并登记 `claimedOfferIds`，重复点击或重放同一 `offerId` 绝不重复发奖。
     - 安全领奖路径：`grantGearSafely` 与 `grantSealSafely` 彻底独立于旧商店 `buyShopItem`，**绝不自动折价卖掉或覆盖在用 5★ 主灵印**；装备/无法吸收的异系灵印在背包有空时入 `game.bag`，满溢（`>= 12`）时安全入 `game.rewardStash`（可在属性面板取出）。

2. **词条转移台（Affix Transfer Workbench）**：
   - 支持已穿戴 4 槽构装与背包构装直接互转，**无需先卸下主力装备**。
   - **零副作用预览与取消**：`previewAffixTransfer({ source, sourceSlot, target, targetSlot })` 计算源/目标/领主全局双/三联动变化与费用并存入 `game.transferDraft`；`cancelAffixTransferPreview()` 仅清空草稿，转印符、金币、装备与联动 100% 不变。
   - **一次性原子提交**：`commitAffixTransfer` 在提交瞬间重新校验 7 项条件（源/目标非同件、源槽非空、目标槽合法、排除目标被覆盖槽后无同名词条与互斥组冲突、转印符与金币余额充足），全部通过后原子扣费、源槽置 `null`（保留原装备、`extractedCount++`）、写入目标槽位并实时重算源/目标/全局联动与最大生命；任意失败零扣费、零状态变更。
   - **防套利验证**：沿用 Stage 2 的 `rarity + sourceStage` 回收口径与 `paidGoldSellCapRatio = 0.72` 上界，叠加转印金币（`28/45/68 + 18覆盖`）与天命转印符成本，买入→转印→出售/拆解空壳在全阶段、全品质下均严格负收益，无套利循环。

3. **W21–W29 终局精修经济闭环（R30-04）**：
   - W21–W29 保留装备掉落并提升商店/宝箱高稀有词条概率与第二构装槽几率，同时逐段提升普通材料产出（精英 `1→2→3` 锻材、首领 `3→6` 锻材、血碑 `2→4` 锻材、过波精修补贴 W21–24 `+1` / W25–27 `+2` / W28–29 `+3`），叠加 `+6` 材料精修上限（单件满强化需 `41` 锻材，4 槽共 `164` 锻材），确保常规经营（0 赌局）与赌局+转印双路线在 W28–W29 均具备清晰、持续的资源消费出口。

---

### 3. 实测命令与定量验证数据（全部 100% 实测通过）

执行全量回归命令：
```bash
node scripts/sync-balance.cjs --check
node --test tests/v052-balance-lab.test.cjs
node --test tests/v060-stage1.test.cjs
node --test tests/v060-stage2.test.cjs
node --test tests/v060-stage3.test.cjs
node --test tests/v060-stage4.test.cjs
```
结果汇总：
- `sync-balance.cjs --check`：v0.52 与 v0.60 内嵌 `BALANCE` 均 `PASS`
- `tests/v052-balance-lab.test.cjs`：`7/7 pass`
- `tests/v060-stage1.test.cjs`：`5/5 pass`
- `tests/v060-stage2.test.cjs`：`5/5 pass`
- `tests/v060-stage3.test.cjs`：`5/5 pass`
- `tests/v060-stage4.test.cjs`：`5/5 pass`（总计 **27/27 pass, 0 fail**）

#### 3.1 天命赌局大样本统计实测（种子 `4003`，押注 `260 金`，`1600` 次开奖）
- **空劫触发率**：**21.56%**（配置 `22%`），空劫时均只扣合法押注、零发奖、零 `pendingOffer`。
- **顶层四类权重收敛**（`3765` 件中奖候选）：灵印 **23.96%** · 构装 **25.76%** · 丹药 **25.82%** · 特殊强化 **24.46%**（严格收敛于各 `25%`）。
- **品质分布（无稀有度保底）**：凡品 `284` · 稀有 `904` · 史诗 `1463` · 传说 `1114`；特殊强化子池产出转印符 `371` 次、天命专属强化 `550` 次。
- **低押注隔离大样本**（`bet = 40` 与 `bet = 80` 各 `1200` 候选，共 `2400` 候选）：史诗 `0`、传说 `0`、天命专属强化 `0`、转印符 `0`。

#### 3.2 W21 → W29 双路线后期经济实测对比
| 路线与种子 | 到达波次 | 天命赌局(空劫) | 词条转移 | 天命专属强化 | 核心联动 | 4 槽强化档位 | W28–W29 有效强化次数 | 伤害倍率变化 | W29 备战余额 |
| --- | :---: | :---: | :---: | --- | --- | --- | :---: | :---: | --- |
| 常规经营路线（0 赌局 · 种子 `4031`） | W29 | 0 (0) | 0 | 无 | 火系双联动 | `[+6,+6,+6,+6]` | **3 次** | `3.92× → 4.75×` | `699金 / 24锻材 / 0符` |
| 赌局+转印路线（种子 `4032`） | W29 | 9 (4) | 1 | 天命·踏虚步法 | **火系完整三联动** | `[+6,+6,+6,+5]` | **2 次** | `3.96× → 4.70×` | `278金 / 13锻材 / 1符` |

---

### 4. 下一阶段（阶段 5 · W29 最终整备与 W30）起手入口与可复制 `BG60` 调用

#### 4.1 阶段 5 可直接复用的阶段 4 核心接口与状态
- **单次结账与已开奖未领取状态**：
  - 查询：`BG60.getPendingDestinyOffer()` / `BG60.game.destiny.pendingOffer`（`{ offerId, bet, wave, choices[3], claimed }`）
  - 统一幂等领奖：`BG60.claimDestinyReward(choiceIndex)`
  - W29 超时自动领奖：`BG60.autoClaimPendingDestinyReward()`（已在 `tick()` 的 W29 90s 倒计时归零路径接通：清空 `game.transferDraft` → 自动随机领一件并走独立安全路径 → 关闭备战弹窗 → 进入 W30）
- **安全领奖与暂存箱**：`BG60.grantGearSafely(inst)`、`BG60.grantSealSafely(kind, star, opts)`、`BG60.claimRewardStashItem(idx)`、`BG60.game.rewardStash`（绝不覆盖/卖掉 5★ 主灵印）。
- **词条转移原子接口**：`BG60.previewAffixTransfer(params)`、`BG60.cancelAffixTransferPreview()`、`BG60.commitAffixTransfer(params)`、`BG60.game.transferDraft`。
- **W29 非阻塞倒计时**：`tick()` 中已放行 `destiny_gamble` 与 `affix_transfer` 弹窗不暂停 W29 90s 真实倒计时；阶段 5 可直接在此基础上补全商店购物确认、查看详情、快速连点与 W29 波末遗留宝箱/升级先结清后再启动倒计时的全边界验收。

#### 4.2 阶段 5 可直接复制的 `BG60` 调试命令
```js
// 1. W29 标准/强势起手（含真实 W10 + 阶段 2 装备 + 真实 W20 突破 + 阶段 4 转印符与预算）
window.BG60.loadTestPreset({ wave: 29, tier: 'standard', build: 'fire',  materials: 28, gold: 800, transferTokens: 3, seed: 2026 });
window.BG60.loadTestPreset({ wave: 29, tier: 'strong',   build: 'frost', materials: 42, gold: 980, transferTokens: 4, seed: 2026 });

// 2. 复现 W29 90s 整备期赌赢未领 + 转移草稿未提交 + 超时自动安全收尾
window.BG60.loadTestPreset({ wave: 29, tier: 'strong', build: 'fire', gold: 900, transferTokens: 3, seed: 4044 });
window.BG60.enterW29FinalPrep(90);
window.BG60.openDestinyGambleModal();
window.BG60.rollDestinyGamble(150);
window.BG60.getPendingDestinyOffer(); // 查看未领取三选一
window.BG60.autoClaimPendingDestinyReward(); // 超时单次幂等安全领奖

// 3. 词条转移台预览 / 取消 / 原子提交
window.BG60.openAffixTransferModal();
window.BG60.previewAffixTransfer({ source: { location: 'bag', idx: 0 }, sourceSlot: 0, target: { location: 'equipped', idx: 0 }, targetSlot: 2 });
window.BG60.cancelAffixTransferPreview(); // 零副作用取消
window.BG60.commitAffixTransfer({ source: { location: 'bag', idx: 0 }, sourceSlot: 0, target: { location: 'equipped', idx: 0 }, targetSlot: 2 });

// 4. W30 偏弱 / 标准 / 强势三档 Boss 标定起手
window.BG60.loadTestPreset({ wave: 30, tier: 'weak',     build: 'fire',  materials: 16, gold: 420, transferTokens: 1, seed: 2026 });
window.BG60.loadTestPreset({ wave: 30, tier: 'standard', build: 'fire',  materials: 30, gold: 760, transferTokens: 2, seed: 2026 });
window.BG60.loadTestPreset({ wave: 30, tier: 'strong',   build: 'frost', materials: 48, gold: 1050, transferTokens: 4, seed: 2026 });
```



