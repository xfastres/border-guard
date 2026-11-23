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
