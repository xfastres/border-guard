# 整圈城墙与参考图 UI 报告

**分支:** `codex/fix-resident-workplaces`  
**基线:** `6f09d54`  
**范围:** 居民岗位修复（含 Codex 验收修补）+ 整圈城墙 + 参考图风格 UI。

## 本轮默认值（已告知用户）

| 项 | 值 |
|---|---|
| 主城耐久 | **50 / 50** |
| 主城圈墙 | **600 / 600** 共享 HP |
| 白天修满 | 按缺血比例，满额 12 材料，最少 1，不耗行动 |
| 夜间抢修 | 6 材料、持续 6 秒、每圈每夜一次；破墙中断 |
| 资源栏 | 仍为金币 / **材料** / 粮食（不伪造木材·石料分栏） |

旧重构稿「两击主城」**不适用**本轮。

## 验收修补（Codex 发现）

- `recallHomeResident(id)` 与营地 `recallResident(r,c)` 已拆开；居民详情「调回」走按钮点击回归。
- 生产停靠改为**建筑格内工作平台**；生产建筑对己方可进入，工人站在该建筑可见作业区。

## 整圈模型

- 建城生成 `wallRings.home` 闭合边与城门；己方过门、敌方挡门。
- `moveEnemy` 真实拆墙扣共享 HP；完整墙外不能打主城；归零当步 `collapseWall`，碰撞解除，残敌继续攻主城。
- 扩地重算几何、保留血量/上限；已移除逐格 `BUILDS.wall` 入口。

## UI

- 地图铺满视口叠层：左图例+小地图、右详情玻璃面板、底建造栏、中央三选一卡牌。
- 顶栏：金币/材料/粮食 + 人口 + 行动 + 日时钟；主城面板区分城墙/主城。
- 主城蓝顶、连续墙与城门自绘；四类生产建筑保持专属绘制。

## 命令与结果

```text
node --test tests/v029-workplaces.test.cjs tests/v029-rings.test.cjs tests/v029-ui.test.cjs
→ 18/18 pass

node tests/v027-balance.cjs → 10/10
node tests/v028-priority.cjs → （交付时复跑）

node tests/v029-rings-ui-browser.cjs
→ 四视口截图 + 闭环 + 战斗夹具 OK
```

## 战斗夹具实测（破墙后至主城失守）

| 字段 | 值 |
|---|---|
| seed | 42 |
| 敌人 | 12 × normal |
| 墙起始 | 80 HP（完整圈几何） |
| 主城起始 | 50 HP |
| 布防 | 无塔 |
| 模式 | 真实 `moveEnemy` 循环，dt=0.05 |
| 破墙后→失守 | **约 6.60 秒**（落在 5–10 秒调试目标内） |

未伪造倒塌时间，未传送敌人。

## 截图

目录：`tests/artifacts/v029-rings-ui/`

- `day-*/castle-*`：1440×900、1920×1080、932×430、390×844（**7/7 行动**）
- `desktop-work-inside-building.png`：工人在建筑内
- `desktop-cards.png`：三选一
- `combat-after-collapse.png` / `touch-closed-panel.png`
- `browser.json`

## 剩余限制

- 营地独立围墙圈未全面产品化（主城圈已闭环）。
- 材料未拆 wood/stone；天亮产出仍走旧 `developed` 结算。
- 参考图部分装饰/升级文案未照搬（避免假资源与假加成）。
- headless 触控偶发需 evaluate 回退关闭面板/跳过卡牌。
