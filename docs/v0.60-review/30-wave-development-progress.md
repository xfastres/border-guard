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

