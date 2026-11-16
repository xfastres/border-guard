# WP2 · 新玩家引导与「我现在该做什么」实现规格

> 文档类型：**实现规格 / 验收判定依据**（不是设计复述，也不是代码）
> 编写：design-strategist（文策渊） · 任务 WP2-UX-01 · 团队 `border-guard-v030-polish`
> 基线：`Border-Guard-v0.29.html` @ `5320a02`（engineering-lead 的光照修复可能使行号偏移 1–2 行，**一律以函数名定位**）
> 上游输入：`docs/v030-handoff-plan.md` §0 / §1.3 / §3 WP2 / §4.1 / §4.3 / §5
> 下游用途：engineering-lead 实现 WP2 的输入；quality-lead 逐条验收 §4.3 的判定依据
> 状态：**设计规格，含 5 项需用户拍板（§9）**。本轮不改游戏代码、不启动 Chrome/CDP、不提交、不 push。
> 前置：WP1 质量门未由主理人放行前，不得基于本规格开始实现。

---

## 0. 适用范围与非目标

### 0.1 WP2 范围内（7 项，对应计划 §3 WP2 第 1–7 条）

| # | 项目 | 主改动点 |
|---|---|---|
| 1 | 悬停预览 | `bindMapGestures()` 加 `pointermove` / `pointerleave`，写 `game.hoverTile` |
| 2 | 六步提示链 | `tutorialStep()` + `renderUI()` 给 `#mapHint` 加 `.next` |
| 3 | 推荐布防格 | 新增纯函数 `recommendedDefenseTiles()` + 在 `draw()` 内绘制金色虚线圈 |
| 4 | 生产建筑工人数徽章 | `structure()` 内追加绘制 |
| 5 | 居民详情可读化 | `inspect()` 居民分支的 `dest` 文案 |
| 6 | 城墙还能撑多久 | `damageWallRing()` 采样 + `updateBattleHud()` 估算与标红 |
| 7 | 失败原因 | `collapseWall()` 写 `game.ledger[day]` 三字段 + `failureDiagnosis()` 新分支 |

### 0.2 明确不在 WP2 范围（不得顺手改）

- 视觉层、主题 CSS、图标、事件横幅（WP1 未提交内容）、小地图配色、胜利 HUD（WP3）、昼夜过渡、音效、刷兵烟尘、圈墙受击火花、效果弱化（WP4）。
- `drawSelection()` / `drawGates()` / 居民脚下虚线圈 / 城墙选中虚线描边 / 箭塔射程圈：**§4.3 第 2 条已由既有代码实现**（见 §1.2 锚点），WP2 只取证、不改代码。
- 顶栏 ±N 浮字、天亮飘字与横幅、红色 toast（§4.3 第 5 条）：**既有实现 / WP1 事件表现**，WP2 只取证、不改代码。
- 敌人 AI、伤害数值（`V029.wallHit`）、`wallBlow()`、圈墙几何、`entrances()` 的方向算法、`canBuildAt()` 的合法性规则：**只读，不得修改**。
- 任何 `tests/` 下已有的断言阈值（§0「测试纪律」）。

### 0.3 术语约定

- 「**提示链**」＝ `tutorialStep()` 返回的六条固定文案之一，带 `.next` class（CSS L439–440 提供 `▶ ` 前缀）。
- 「**modes 文案**」＝ `renderUI()` L6569 的 `modes[game.mode]`（camp/claim/tower/wall 四种工具提示）。
- 「**让位**」＝ 提示链不写 `#mapHint`、且 `.next` 被移除，由优先级更高的文案独占该元素。
- 「**状态夹具**」＝ 用 `eval` / `fx/*.js` 直接改 `game` 状态得到的画面。按计划 §2 说明，**必须标注为非自然流程证据**，不能充当 WP5 自然试玩证据。

---

## 1. 状态字段与代码锚点（实现前必须对齐）

### 1.1 全局常量与状态（已核实）

| 字段 / 函数 | 位置 | 语义 | 规格中的用途 |
|---|---|---|---|
| `WIDTH=32, HEIGHT=20, CELL=46` | L2430 | 网格宽高、格像素 | 「该侧」半场分界 `WIDTH/2 = 16` |
| `at(x,y)` / `tileAt(x,y)` | L2670–2672 | 格索引 ↔ 格对象 | `game.hoverTile` 存的是**索引**，不是对象 |
| `game.day`, `game.phase` | L2807 | 夜号；`day`/`night`/`won`/`lost` | 提示链激活窗口 |
| `game.mode` | L2807 | `null` \| `camp` \| `claim` \| `tower` \| `wall` | 工具选中态，决定让位 |
| `game.castle` | L2816 | 城堡格对象 `null` 表示未建城 | S1 判定 |
| `game.cardPending` | L2823 / L2976 | 待选开局强化 | S2 判定 |
| `game.cardModal` | L2824 / L3299 | 三选一模态已打开（全屏遮罩、冻结时钟） | 让位门禁 |
| `game.sites`, `game.selected`, `game.panel`, `game.sawResource` | L2807–2808 | 城址、选中格索引、详情面板、见过资源 | 既有 `tutorialStep` 细分逻辑 |
| `game.tiles[]`：`t.owned` / `t.building` / `t.node?.developed` | — | 领地归属 / 建筑 / 资源是否已开发 | S3/S4/S5 |
| `game.productionBuildings` (`Map`) | L2819 / L1860 | `ensureProductionMaps()` 懒加载；`b.assignedResidentIds[]` | S4 工人数、徽章 N |
| `PRODUCTION_LABELS` | L2463 | `farm:农场, lumber:林场, quarry:采石场, mine:矿场` | 居民详情建筑名 |
| `NODE_NAMES` / `SITE_NAMES` / `BUILDS.tower.label` | L2454 / L2439 / L2460 | 资源点名 / 城址名 / 箭塔 | 居民详情兜底名 |
| `game.wallRings.get('home')` | L2818 / L970 | `ring.hp` / `maxHp=600` / `status` | DPS 估算、倒塌判定 |
| `entrances(day)` | L3345 | day1 返回**单元素**数组 `[westSide?west:east]`；gate 是边缘格（`x=0` 或 `x=31`） | S5 方向、推荐格 |
| `canBuildAt(t)` | L1710 | **不检查 `t.building`**，需调用方补 `&& !t.building` | 推荐格 |
| `game.fronts[0].gates` | L3412 | `= entrances(game.day)`，夜内实际入口 | 倒塌侧、`collapseSide` |
| `game.clock` | L2826 / L4205 | **夜内秒**，仅 `advanceBattle()` 累加 | DPS 采样时间戳、刚入夜判定 |
| `game.phaseElapsed` | L2812 / L4255 | 白天秒 | 不用于 DPS |
| `game.ledger[day]` / `freshNight()` / `openNight()` / `nightBook()` | L2693–2710 | 每夜账本；`nightBook()` 用 `game.ledgerDay \|\| game.day` | 失败诊断三字段 |
| `game.ledgerDay` | L2831 / L4139 / L4160 | `dawn()` 期间临时指向结算夜，随后置 `null` | 写入键必须与 `nightBook()` 一致 |
| `V029.wallHit = {normal:7,heavy:14,boss:30}` / `wallBlow(e)` | L743–747 | 圈墙每击伤害 | 只读；DPS 用净伤害 `dealt` |

### 1.2 渲染 / UI 锚点

| 位置 | 现状 | WP2 关系 |
|---|---|---|
| CSS `#mapHint.next` L439–440 | `color:#fff3c0`，`::before{content:"▶ ";color:var(--gold)}` | 文案里**不得再手写 `▶`**，避免双箭头 |
| CSS `.battle-stat.critical` L442–443 | `rgba(217,83,60,.55)` 底、`#fff` 字、`critPulse 1s` 动画 | 「约 N 秒破墙」标红的可验收样式 |
| HTML L608 / L610 | `<p id="mapHint">`、`<div id="battleHud" hidden><span id="battleText">` | 验收取 DOM 的根节点 |
| `renderUI()` L6569 | `modes[game.mode] \|\| (active?操作提示:失败提示)` | **第 1 顺位**赋值 |
| `renderUI()` L6616 | `const step=tutorialStep(); if(step&&!game.mode) mapHint.textContent=step;` | **第 2 顺位**覆盖 |
| `renderUI()` L6617 | `if(phase==='won') mapHint.textContent='拖动地图查看领地…';` | **第 3 顺位**（最高）覆盖 |
| `renderUI()` L6603–6612 | 失败分支的 `#primary .diagnosis` 复盘面板，列 `game.notes.slice(0,3)` | 失败诊断文案的落地位置（§5.6） |
| `renderUI()` L6601 | `goal.textContent += ' ' + nextRunHint()`，`nextRunHint()` 内调 `failureDiagnosis()` | 诊断文案的第二处出现位置 |
| `updateBattleHud()` L6649–6693 | 组 `stats` 数组 → `label` 字符串 → `battle.dataset.label` 变化时重建 `.battle-stat` span | 估算文案必须并入 `label`（§4.6 坑） |
| 主循环 L6984 | `if(now-lastHud>150){updateBattleHud();...}` | 已有 150 ms 节流，估算放 `updateBattleHud()` 即满足「实时更新」，**无需新增定时器** |
| `draw()` L5178–5179 | `drawGates(); drawToolPreview();` | 推荐格绘制插入点（§2.4） |
| `drawToolPreview()` L5095–5117 | L5110 读 `game.hoverTile`（索引），合法金框 / 非法红框加斜线 | 悬停预览落点 |
| `bindMapGestures()` L5549–5606 | 已有 `pointerdown` / `pointermove`（拖平移）/ `pointerup` / `pointercancel` / `blur` | 新增 hover 监听必须独立、不干扰 `mapGesture` |
| `screenToGrid()` L5462 | 返回 **tile 对象**或 `null` | 写 `game.hoverTile` 前转索引 |
| `inspect()` L5932；居民分支 L5946–5951 | `dest` 现为 `'移动至 x,y'` / `'目的地格 x,y'` / `'驻留野外'` / `'没有单独目的地'` | WP2-5 改 `dest` |
| `structure()` L4601 | 格内局部坐标（`x=30,y=35` 为中心区），`CELL=46` | 徽章右上角约 `(46,8)` |
| `drawSelection()` L5119 / `drawGates()` L5135 / L4776 / L4889–4908 | 四角金框、箭塔射程、居民脚下金色虚线圈、城墙选中金色虚线描边 | **§4.3 第 2 条已实现，WP2 不改** |
| `damageWallRing()` L995–1015 | `dealt = before - ring.hp`（已含归零截断），`if(dealt>0)` 分支 L1004 | DPS 唯一权威采样点 |
| `collapseWall()` L1017–1035 | 幂等；`ring.hp=0; ring.status='broken'` | 失败诊断写入点 |
| `failureDiagnosis()` L2637–2653 | 6 条既有分支 | 新增分支插在 `if(!game.castle)` 之后 |
| `finish(false)` L4193–4195 | 失败横幅副标题「右侧「败局复盘」说明了原因与下局建议」 | §4.3 第 7 条的横幅元素 |

---

## 2. 六步提示链：带优先级与判定条件的状态机

### 2.1 全局约束（硬约束，违反即判 FAIL）

1. **唯一性**：`tutorialStep()` 用自上而下 `if / else if` 链，**首个命中即 `return`**，同一时刻只返回一条文案。禁止数组累加、字符串拼接、多条并列。
2. **单一真源**：提示链激活门禁、`.next` class 的增删、推荐格的显示条件，**必须共用同一组判定函数**，不得在 `tutorialStep()` 与 `draw()` 里各写一套，否则会出现「文案说该建塔但地图没有高亮」。
3. **激活窗口**：仅 `game.day === 1 && game.phase === 'day'` 且无让位条件（§2.5）。`day !== 1` 或 `phase !== 'day'` 一律返回 `null`。
4. **不可逆退出**：一旦 `day` 变为 2、入夜、胜利或失败，提示链**永久退出本局**；即使之后状态回退（第 2 天拆掉塔、再出现 `cardPending`）也不得重新激活。实现上靠 `game.day===1` 门禁自然保证，不得加「重新进入」逻辑。
5. **文案固定**：六条文案逐字按 §2.2 表；不含 `▶` 字符；不含虚构资源名（§7 第 5 条）。
6. **不阻塞、不自动建造**：提示链纯展示，不改 `game.actions`、不扣资源、不冻结时钟、不替玩家点击。

### 2.2 状态机表（优先级从高到低；编号即截图 `guide-*.png` 序号）

| 优先级 | 状态 | 触发条件（游戏内已有状态表达） | `#mapHint` 文案（逐字） | 地图高亮 | 退出条件 |
|---|---|---|---|---|---|
| **S1** | 未建城 | `!game.castle` | `从底部选 A 或 B 前往探路` | 既有 A/B 城址旗标（`draw()` L5164–5177，已探明转金色） | 建城成功（`game.castle` 非空） |
| **S2** | 卡牌待选 | `game.castle && game.cardPending === true` | `先选择一项开局强化` | 既有 `#alertBar` 成长提示 + `primary`「选择主城强化」按钮（L6123 / L6590） | `pickGrowthCard()` 置 `cardPending=false` |
| **S3** | 无开发 | `game.castle && !game.cardPending && !game.tiles.some(t => t.node?.developed)` | `点领地内带金色 + 的资源点，开发成生产建筑` | 开发模式下 `drawToolPreview()` 的合法资源点高亮（既有 `toolTileState()` L5085–5091） | 任一资源点 `node.developed === true` |
| **S4** | 有建筑但无工人 | `game.castle && !game.cardPending && developedTiles.length > 0 && totalWorkers === 0` | `点生产建筑，派遣居民去工作` | 徽章灰色「空」（WP2-4）+ 详情「派遣居民」按钮（既有 L6070） | `totalWorkers >= 1` |
| **S5** | 敌袭方向没有箭塔 | `game.castle && !game.cardPending && developedTiles.length > 0 && totalWorkers >= 1 && towersOnSide === 0` | `今夜敌军从西/东侧来：在该侧城墙内建 1–2 座箭塔`（西/东按 §2.3.5 取一字） | `drawGates()` 红色脉冲入口（既有）+ **新增**推荐格金色虚线圈（WP2-3） | `towersOnSide >= 1` |
| **S6** | 完成 | 上述全部前置条件已满足且未命中 S1–S5 | `准备好了可以提前入夜` | 无新增高亮（保留既有入口标） | `day!==1` / `phase!=='day'` / 让位 |

> 注：S1–S6 的「前置条件已满足」是**累积式**的（S4 隐含 S3 已通过，S5 隐含 S4 已通过），实现时用 `else if` 顺序天然保证，不要写成互相独立的 6 个 `if`。

### 2.3 各步判定条件的精确定义

#### 2.3.1 S1 · 未建城

```js
if (!game.castle) return '从底部选 A 或 B 前往探路';
```

- **与既有实现的关系（需拍板，见 §9-P1）**：现有 `tutorialStep()` L3242–3245 把「未探明城址 / 已探明未选 / 详情中确认」细分成三条文案。本规格**默认统一为计划给的这一条固定文案**，理由：WP2 验收要求「每一步 `#mapHint` 都恰好显示对应那条文案」，细分会让同一 S1 出现多种文本，无法逐条截图判定。
- 既有细分信息**不丢失**：仍由 `renderUI()` 的 `goalTitle/goalText`（L6577–6580）、`renderMarch()` 的 A/B 按钮（L5760）、详情面板（L5985–5990）承载。
- 边界：`game.started===false`（开局对话框期间）不额外门禁——`dialog` 覆盖时 `#mapHint` 不可见，且 `introDone` 已在对话框打开时置 `game.started=true`（L3223），加门禁无收益。

#### 2.3.2 S2 · 卡牌待选（含 S1/S2 同时成立的优先级）

```js
if (!game.castle) return S1;                       // 优先级 1，先判
if (game.cardPending === true) return S2;          // 优先级 2
```

- **S1 与 S2 同时成立时 S1 优先**（team-lead 提问 1）：`offerGrowthCards()` L2975 要求 `game.castle && game.phase==='day'`，正常流程不可能同时成立；但夹具、旧存档、异常时序可能造出 `!game.castle && cardPending===true`。此时引导**先建城**不会卡死（建城是拿卡的前置），而引导「先选强化」会指向一个打不开的目标。
- `cardPending` 也可由主城经验达标在第 2 天之后触发（`showCards()` L3290 的 blurb 明示）。**这些不在提示链内**（`day===1` 门禁），由 `#alertBar`（L6123）和 `primary` 按钮（L6590）承载，不得因此让提示链重新激活。
- **模态门禁**：`game.cardModal === true` 时整条提示链让位（§2.5），因为 `#cardOverlay` 是全屏遮罩且冻结时钟，此时 `#mapHint` 上的「下一步」不可操作，属于认知冲突。

#### 2.3.3 S3 · 无开发

```js
const hasDeveloped = game.tiles.some(t => t.node?.developed);
if (!hasDeveloped) return '点领地内带金色 + 的资源点，开发成生产建筑';
```

- **权威信号用 `t.node.developed`，不用 `game.productionBuildings.size`**：`develop()` L3063 置 `node.developed=true`，`unregisterProductionAt()` L1942 拆除时置回 `false`，二者与 Map 同步；但 `productionBuildings` 是**懒加载 Map**（`ensureProductionMaps()` L1860 只保证 `instanceof Map` 并新建空 Map，不重建内容），旧存档 / 夹具读到空 Map 会误判「无开发」。
- `game.sawResource` **不参与判定**（既有 L3238 用它，但它只表示「玩家见过资源」，与「是否已开发」无关，用它会让 S3 提前消失）。
- 「开发」仅指 `node.developed`；`claim()` 占领、`build()` 建塔/城墙都不算，避免玩家占一格地就跳过 S3。

#### 2.3.4 S4 · 有建筑但无工人（**裁定：全部生产建筑都 0 人**）

```js
ensureProductionMaps();
const developedTiles = game.tiles.filter(t =>
  t.node?.developed && t.building && isProductionBuilding(t.building));
const totalWorkers = developedTiles.reduce((n, t) => {
  const b = game.productionBuildings.get(t.building.productionId);
  return n + (b?.assignedResidentIds?.length || 0);
}, 0);
if (developedTiles.length > 0 && totalWorkers === 0) return S4;
```

- **裁定（team-lead 提问 2）**：「有建筑但无工人」＝**所有已开发生产建筑的派驻总人数为 0**，不是「任一建筑 0 人」。
- 理由：① 若按「任一 0 人」，玩家开发了 2 处资源却只派 1 人时会被持续催，且**永远无法到达 S6 完成态**（提示链卡死 = 认知过载 + 支柱漂移）；② `assignWorker()` 一次只派 1 人，「至少派 1 人」是最小可完成动作；③ §4.3 要求「唯一的 ▶ 下一步提示」，持续催促会与 S5/S6 争夺同一元素。
- 边界：`productionId` 缺失或 Map 无对应记录 → 该建筑按 0 人计（不抛错）；`b.active===false` 仍按现有 `assignedResidentIds` 计（不额外判定），避免与徽章口径不一致。
- **徽章（WP2-4）与 S4 共用 `developedTiles` / 工人数读取逻辑**，保证「灰色空徽章」与「提示去派工」同步出现。

#### 2.3.5 S5 · 敌袭方向没有箭塔（**裁定：仅 `entrances(day)[0]`；0 座即提示，1 座即完成**）

```js
const gate = entrances(game.day)[0];                    // day1 必为单元素
const side = gate.x < WIDTH / 2 ? 'west' : 'east';     // WIDTH/2 = 16
const onSide = t => side === 'west' ? t.x < WIDTH / 2 : t.x >= WIDTH / 2;
const towersOnSide = game.tiles.filter(t =>
  onSide(t) && t.owned && t.building?.type === 'tower').length;
if (towersOnSide === 0) return `今夜敌军从${side === 'west' ? '西' : '东'}侧来：在该侧城墙内建 1–2 座箭塔`;
```

**（a）「该侧」定义（team-lead 提问 3）**
- 用 `entrances(game.day)[0]`，**不用两侧**：`entrances()` L3349 在 `day===1` 只返回 1 个入口；提示链本身只在 `day===1` 激活，取两侧会让文案与 `drawGates()`（L5137 白天也用 `entrances(game.day)`）画出的红色脉冲入口不一致。
- 「西/东」由 **gate 自身坐标**判定：`edgeGate(0,…)` 返回 `x=0`，`edgeGate(WIDTH-1,…)` 返回 `x=31`，故 `gate.x < 16` 即西。不要用 `game.castle.x` 二次推断（`westSide` 已在 `entrances()` 内算过一次，重复推断在城址贴近中线时会给出相反答案）。
- 「该侧」半场：`t.x < 16`（西）或 `t.x >= 16`（东），含等号归东，保证每格恰好属于一侧。
- 「**城墙内**」＝ `t.owned`：`createHomeWallRing()` L970–974 → `syncWallRingGeometry('home', t => !!t?.owned, …)`，**圈墙几何就是 owned 格集合**，这是权威判定，不要用 `ring.edges` / `insideTileId` 反推。
- 营地控制区（`campAt(t)?.controlled`）内、非 `owned` 的箭塔**不计入** `towersOnSide`：有意取舍，避免玩家把塔建在远离主城的位置却让提示消失；文案明确说「该侧城墙内」。

**（b）已建 1 座是否继续提示建第 2 座（裁定：不继续，进入 S6）**
- `towersOnSide === 0` 才显示 S5；`>= 1` 直接进入 S6。
- 理由：① 计划文案字面是「敌袭方向**没有**箭塔」；② §1.1 的平衡依据（seed 42/7、单塔挂机、`V029.wallHit` 新值 **0/2 失守、圈墙余 89/600**）证明 1 座已满足首夜生存；③ 必须保证 S6 可达；④ 推荐格仍圈 2 个（§2.4），鼓励但不强制；⑤ WP2 验收「按推荐格建 2 座塔后挂机」是质量门的**操作动作**，与提示阈值解耦，不受影响。
- **备选（需拍板 §9-P2）**：若主理人希望更保守，可改为 `towersOnSide < 2` 才显示 S5（即「必须建满 2 座才出现完成态」）。此改动会使 S6 更难到达，且与 §1.1 的 1 塔结论张力更大，本规格不推荐。

**（c）推荐布防格（WP2-3）——必须与 S5 共用纯函数**

```js
// 单一真源：tutorialStep() 与 draw() 都调用它
function recommendedDefenseTiles() {
  if (game.day !== 1 || game.phase !== 'day' || !game.castle || game.mode) return [];
  const gate = entrances(game.day)[0];
  const side = gate.x < WIDTH / 2 ? 'west' : 'east';
  const onSide = t => side === 'west' ? t.x < WIDTH / 2 : t.x >= WIDTH / 2;
  const towersOnSide = game.tiles.filter(t =>
    onSide(t) && t.owned && t.building?.type === 'tower').length;
  if (towersOnSide !== 0) return [];                 // 已布防，不再圈
  const gx = gate.x + .5, gy = gate.y + .5;
  return game.tiles
    .filter(t => t.owned && onSide(t) && canBuildAt(t) && !t.building)
    .map(t => ({ t, d: Math.hypot(t.x + .5 - gx, t.y + .5 - gy), key: at(t.x, t.y) }))
    .sort((a, b) => a.d - b.d || a.key - b.key)      // 距离升序；并列按格索引稳定排序
    .slice(0, 2)
    .map(x => x.t);
}
```

- `canBuildAt()` **不检查 `t.building`**（L1710–1715），`&& !t.building` 必须补（计划 §3 WP2 第 3 条已点名，此处再强调）。
- **刷新规则（team-lead 提问 4）**：每次 `draw()` **实时重算**，不缓存跨帧结果。
  - 入口变化：`entrances(game.day)` 每次调用都按 `game.castle` / `game.hero` 现算，day 或城址变化自动跟随；`startNight()` L3412 把 `main.gates = entrances(game.day)` 固化到 fronts，但提示链只在白天（`day===1`）激活，取 `entrances()` 即可，与夜间实际入口一致。
  - 建塔后：该格 `t.building` 非空 → 被 `!t.building` 过滤，推荐圈自动收缩；`towersOnSide` 变为 1 → 返回 `[]`，圈整体消失且 S5 让位给 S6。
  - 领地扩张 / 拆除：`t.owned` 与 `invalidateNavigation()` 既有机制生效，无需额外缓存键；**不得把推荐格结果写进 `cachedLayer('terrain', …)` 的缓存键**（§5 常见坑：地形缓存键是 `navigationRevision()|已占领格数|seed`，加绘制层不能改它）。
- **合法格不足 2 个（裁定）**：只画实际可用的 1 个或 0 个；**不跨侧补齐、不借用非法格、不降低 `canBuildAt()` 门槛、不自动建造**。0 个合法格时：S5 文案**仍按原样显示**（保证六条固定文案可截图验收），只是地图上没有金色虚线圈；`quality-lead` 对此情形的 PASS 条件是「文案正确 + 无非法高亮」，而不是「必须有 2 个圈」。
  - 可选增强（需拍板 §9-P3）：0 合法格时把文案降级为「该侧暂无可建格，先扩展领地」。本规格**默认不采用**，因为它会增加第 7 条文案，破坏「6 张截图对应 6 条固定文案」。
- **绘制契约**：新增 `drawRecommendedDefense()`，在 `draw()` 的 `drawToolPreview()`（L5179）**之后**调用；只对 `recommendedDefenseTiles()` 的结果画金色虚线圆角框（`ctx.setLineDash([6,5])`，`strokeStyle='rgba(255,224,138,.9)'`，`lineWidth=2`），**不填充实体、不写 `game` 状态**。
  - `game.mode !== null` 时返回 `[]`：选中任何工具后让位给 `drawToolPreview()` 的整体合法格高亮，避免两套高亮叠加（认知过载）。
  - 只在 `game.day===1 && game.phase==='day'` 绘制；夜间/胜利/失败不画。
  - 测试 VM 的 canvas 是桩（§5 常见坑）：新绘制只用 `strokeRect` / `setLineDash` / `beginPath` 这类基础 API，**不要调用 `createRadialGradient`、不要缓存 `const g=ctx`**（`ctx` 是 `let`，`cachedLayer()` 会临时替换）。

#### 2.3.6 S6 · 完成

- 判定：S1–S5 全部未命中（即 `game.castle && !cardPending && hasDeveloped && totalWorkers>=1 && towersOnSide>=1`）。
- 文案 `准备好了可以提前入夜`，`.next` 仍保留（它是提示链的完成态，仍是「唯一 ▶ 下一步提示」）。
- 不自动触发 `requestEarlyNight()`；玩家自行点「提前入夜」，保持用户掌舵。

### 2.4 让位规则与 `.next` class（覆盖顺序）

**`renderUI()` 的三段覆盖顺序（必须保持，不得调整）：**

| 顺位 | 位置 | 写入内容 | 条件 |
|---|---|---|---|
| 1 | L6569 | `modes[game.mode] \|\| '点地走路…' \|\| '在战役面板查看失败原因…'` | 每次 `renderUI()` 无条件写入 |
| 2 | L6616（改造后） | 提示链 `step` | `step` 非空（门禁已收进 `tutorialStep()`） |
| 3 | L6617 | `'拖动地图查看领地，点已探明的地点复盘。'` | `phase === 'won'`（最高，覆盖前两者） |

**推荐改造（单一真源，`tutorialStep()` 内部统一收口门禁）：**

```js
function tutorialStep() {
  if (game.day !== 1 || game.phase !== 'day') return null;   // 第 1 天之后 / 夜间 / 胜负 退出
  if (game.mode) return null;                                 // 选中工具让位给 L6569 modes
  if (game.cardModal) return null;                            // 三选一模态让位
  // ↓ 按 S1..S6 顺序 if / else if，首个命中即 return
  ...
}

// renderUI() 末尾替换现有 L6615-6617
const step = tutorialStep();
const guideActive = !!step;
if (guideActive) $('mapHint').textContent = step;
if (game.phase === 'won') $('mapHint').textContent = '拖动地图查看领地，点已探明的地点复盘。';
$('mapHint').classList.toggle('next', guideActive && game.phase !== 'won');
```

> **关键**：`.next` 必须在**每次** `renderUI()` 里显式 `toggle`（或 `remove` 后再 `add`），不能用「只在加的时候 add、不加时什么都不做」——否则从 day1 切到 day2、从白天切到夜间时，`▶` 会残留。L6617 的 won 覆盖必须同步把 `.next` 置 false（`guideActive && phase!=='won'` 已保证）。

**让位判定表（quality-lead 逐条可查）：**

| 情形 | `tutorialStep()` | `#mapHint` 实际文案 | `.next` | 说明 |
|---|---|---|---|---|
| day1 白天、无 mode、无模态 | S1–S6 之一 | 对应提示链文案 | **加** | 正常引导 |
| 选中工具（`game.mode` 非空） | `null` | L6569 的 `modes[game.mode]` | **移除** | 工具提示优先；`drawRecommendedDefense()` 同步返回 `[]` |
| 卡牌模态 `cardModal===true` | `null` | L6569 的操作提示 | **移除** | 全屏遮罩下不给出不可操作的「下一步」 |
| 入夜 `phase==='night'` | `null` | L6569 的操作提示 | **移除** | 提示链退出，夜间由 `#battleHud` 承担信息 |
| 胜利 `phase==='won'` | `null` | L6617 固定文案（覆盖顺位 3） | **移除** | 最高优先级覆盖 |
| 失败 `phase==='lost'` | `null` | L6569 的「在战役面板查看失败原因，或重新开局。」 | **移除** | 失败原因交给复盘面板（§5） |
| `day >= 2`（天亮后） | `null` | L6569 的操作提示 | **移除** | 不可逆退出；`cardPending` 由 alertBar/primary 承载 |
| 全局暂停 / 开局对话框 | 不额外门禁 | 提示链文案（遮罩下不可见） | 加 | 不判 `paused`：暂停遮罩覆盖，且 `renderUI()` 仍会跑；加门禁会让 `.next` 与文案不同步 |

### 2.5 悬停预览（WP2-1）与提示链的交互

- 在 `bindMapGestures()` 的 `board` 上**新增独立** `pointermove` / `pointerleave` 监听：
  - `pointermove`：仅当 `e.pointerType === 'mouse'`（**触控不触发**），`const t = screenToGrid(e.clientX, e.clientY)`，写 `game.hoverTile = t ? at(t.x, t.y) : null`。
  - `pointerleave`：`game.hoverTile = null`（同样建议按 `pointerType==='mouse'` 过滤，避免多指触控提前清空）。
  - 入夜 / 天亮 / 胜负 / `cancelMapGesture()` 时把 `game.hoverTile` 置 `null`，避免跨阶段残留金框。
- 与既有 `mapGesture` 的关系：新增监听**不得** `preventDefault()`、不得改 `mapGesture`、不得覆盖 L5572 的拖动平移分支；拖动平移时悬停框跟着移动是可接受的（不判 FAIL）。
- `game.hoverTile` 存**索引**（L5110 `game.tiles[game.hoverTile]`），`screenToGrid()` 返回**对象**——这是最容易踩的类型坑（§8-1）。
- 选中工具后悬停预览才生效（`drawToolPreview()` L5096 已判 `!game.mode`）；与提示链让位规则一致：有 mode 时预览接管，无 mode 时提示链接管。
- 合法/非法判定沿用既有 `toolTileState()`（L5092：`canBuildAt(t) && !t.building` → `'ok'`），**不得另写一套**，保证「整体高亮」与「悬停金框/红框斜线」口径一致。

---

## 3. 边界情况总表（team-lead 六问 + 补充）

| # | 边界 | **裁定** | 理由 | 可验收判定 |
|---|---|---|---|---|
| B1 | 卡牌待选与未建城同时成立 | **未建城（S1）优先** | 建城是 `offerGrowthCards()` 的前置；引导选卡会指向打不开的目标 | 构造 `!castle && cardPending===true` → `#mapHint` 必须是 S1 文案且带 `.next` |
| B2 | 「有建筑但无工人」＝全部 0 人还是任一 0 人 | **全部生产建筑派驻总人数 = 0**（`totalWorkers===0`） | 保证 S6 可达、避免重复催促与认知过载 | 开发 2 处、只派 1 人 → 提示应为 S5/S6，**不得**再显示 S4 |
| B3 | 「该侧」定义 | **`entrances(game.day)[0]` 单入口**；`gate.x<16` → 西；半场 `t.x<16` / `>=16`；「城墙内」＝ `t.owned` | 与 `drawGates()` 白天红色脉冲入口一致；圈墙几何本身就是 owned 格 | 提示里的「西/东」必须与地图上 `drawGates()` 脉冲入口所在边缘一致 |
| B4 | 已建 1 座是否继续提示第 2 座 | **不继续**（`towersOnSide>=1` → S6）；推荐格仍圈 2 个 | 字面「没有箭塔」；§1.1 单塔挂机 0/2 失守；S6 可达 | 该侧建 1 座 → `#mapHint` 变为 S6；建 2 座 → 仍为 S6 |
| B5 | 推荐格刷新 | **每帧 `draw()` 重算，不缓存**；入口变化跟随 `entrances()`；建塔后自动排除 | 状态驱动，避免陈旧高亮 | 建第 1 座塔的同一帧，推荐圈收缩且只剩未建格；建塔数达 1 时圈消失 |
| B6 | 合法格不足 2 个 | 只画实际可用数（0/1）；**不跨侧、不越界、不自动建造**；0 个时 S5 文案不变 | 保证六条固定文案可截图验收；不引入非法操作 | 构造该侧 0 合法格 → 文案仍为 S5，画面无金色虚线圈、无非法格高亮 |
| B7 | 居民详情目的地是空地 / 建筑尚未建成 | 见 §3.1 名称解析表；统一 `前往 <名称>（x,y）`；坐标为整数格坐标；无 `undefined` / `NaN` / 空括号 | 可读性 + 不臆造建筑 | 逐分支截图（§3.1） |

### 3.1 居民详情目的地文案（WP2-5）完整规格

`inspect()` 居民分支 L5946–5949 现为：

```js
const dest = r.order?.kind==='move' && game.tiles[r.order.tileId]
  ? '移动至 '+...x+','+...y
  : r.targetTile ? '目的地格 '+r.targetTile.x+','+r.targetTile.y
  : r.postedAt ? '驻留野外' : '没有单独目的地';
```

**改造**：抽出 `destinationLabel(tile)`，把两条带坐标的分支统一成 `前往 <名称>（x,y）`；`驻留野外` / `没有单独目的地` **原样保留**；`r.targetTile` 是 tile 对象（L2017 / L2161 等处赋值），`r.order.tileId` 是索引，需分别转成 tile 对象后再查表。

| 目标格 `t` 的状态（按此顺序判定） | `<名称>` | 后缀 | 完整示例 |
|---|---|---|---|
| `t == null` 或 `!Number.isFinite(t.x)` / `!Number.isFinite(t.y)` | — | — | `目的地不明`（兜底，不出现 `undefined`/`NaN`） |
| `t.building?.type === 'castle'` | `主城` | — | `前往 主城（12,9）` |
| `isProductionBuilding(t.building)` | `PRODUCTION_LABELS[t.building.type]` | — | `前往 林场（5,6）` |
| `t.building?.type === 'tower'` | `BUILDS.tower.label`（`箭塔`） | — | `前往 箭塔（14,8）` |
| `t.building?.type === 'wall'` | `城墙` | — | `前往 城墙（14,10）` |
| `campCore(t)` 命中 | `campName(c)`（`营地 N`，L1655） | — | `前往 营地 2（20,7）` |
| `t.node && !t.node.developed`（**建筑尚未建成 / 只是资源点**） | `NODE_NAMES[t.node.kind]` | ` · 待开发` | `前往 林场（5,6） · 待开发` |
| `t.site !== undefined && !game.castle` | `SITE_NAMES[t.site]` | — | `前往 西岭台地（8,5）` |
| 其它（空地、水面、迷雾格、已探明空地） | `空地` | — | `前往 空地（5,6）` |

- **「建筑尚未建成」的兜底语义**：目标格只有 `node` 且 `developed===false` 时，**不得**写成已建成的生产建筑名（会误导玩家以为已有建筑可派工）；用 `NODE_NAMES` + ` · 待开发` 明确状态。`NODE_NAMES.wood === '林场'` 与 `PRODUCTION_LABELS.lumber === '林场'` 同字，靠后缀区分，不引入新词表。
- **目的地是空地**（team-lead 提问 5）：`前往 空地（x,y）`，保留坐标，玩家仍能定位；不得省略括号、不得写成「无目的地」。
- **「改派到…」按钮（L5972）保持现状不改**：现有 `label+' '+tile.x+','+tile.y`（如 `改派到林场 5,6`）已含坐标，计划明确要求「保留坐标」。
- 不得改 `assignWorker()` / `recallHomeResident()` / `game.residentCommand` 的任何逻辑（§7 第 3 条红线）。

### 3.2 生产建筑工人数徽章（WP2-4）边界

| 情形 | 绘制 |
|---|---|
| `isProductionBuilding(t.building)` 且 `assignedResidentIds.length = N > 0` | 右上角 `👤N` |
| `N === 0` | 右上角灰色「空」 |
| `t.building.productionId` 缺失 / `productionBuildings` 无该 id（旧存档、懒加载空 Map） | 先调 `ensureProductionMaps()`；仍取不到 → 按 `N=0` 画「空」，**不得抛异常** |
| `b.active === false` | 按实际 `assignedResidentIds` 画；不额外加「停」字样（避免与 S4 口径分叉） |
| `castle` / `wall` / `tower` / 无建筑 | **不画** |
| 格内坐标 | 局部 `(≈46, ≈8)`（右上角，`CELL=46`）；用固定尺寸圆角底 + `fillText`，**不依赖 `ctx.measureText`**（测试 VM canvas 是桩） |
| 绘制位置 | `structure()` 的 `inCell()` 回调内、所有建筑分支**之后**；不新建顶层绘制函数替换 `structure`（§5 函数名契约） |

### 3.3 补充边界（非 team-lead 六问，但实现必须处理）

| 边界 | 处理 |
|---|---|
| `game.actions === 0`（本日行动用完） | 提示链仍显示（不阻塞、不置灰文案），但玩家点了也不能建；不得因此跳过 S3/S5 |
| 玩家在详情面板里（`game.panel===true`，`game.selected` 指向城址） | S1 文案不变（不恢复既有「在详情中确认建城」子文案，见 §9-P1） |
| 首夜提前入夜（`game.earlyNightAt`） | 倒计时期间仍是 `phase==='day'`，S6 继续显示；入夜后退出 |
| 多夜多次倒塌 | 诊断取**有记录的最大 day**（§5.4） |
| 旧存档 / 无 `game.ledger` / 某夜缺 `book` | `failureDiagnosis()` 用 `Object.values(game.ledger \|\| {})` 既已兼容（L2639）；新分支必须同样容错（§5.3） |
| `entrances()` 返回空 / `gate` 为 `null` | `recommendedDefenseTiles()` 返回 `[]`，S5 退化为不指定方向的文案（不得 `undefined`）；文案里的西/东用 `game.castle.x < WIDTH/2` 兜底 |
| 触控设备（无 `pointerType==='mouse'`） | 悬停预览不生效（计划明确「仅限 mouse」）；提示链文案把「点」换成计划给定的固定文案即可，**不得**在提示链里加 `MOBILE()` 分支导致文案不固定（既有 L3239 有 `MOBILE()` 分支，本规格默认去掉，见 §9-P1） |

---

## 4. 「城墙还能撑多久」（WP2-6）

### 4.1 输入与数据源（唯一权威）

| 变量 | 单位 | 来源 | 说明 |
|---|---|---|---|
| `now` | 秒 | `game.clock` | **夜内秒**，仅 `advanceBattle()` L4205 在 `phase==='night'` 时累加；不得用 `performance.now()`（暂停 / 卡牌模态会冻结业务时钟，用墙钟会错位） |
| `W` | 秒 | 常量 `5` | 滑动窗口「最近 5 秒」 |
| `s.t` | 秒 | 采样时 `game.clock` | 伤害发生时刻 |
| `s.dmg` | 点（耐久） | `damageWallRing()` L1003 的 `dealt = before - ring.hp` | **净伤害**，已含 `Math.max(0, …)` 归零截断；只记 `ringId === 'home'` |
| `ring.hp` | 点 | `game.wallRings.get('home').hp` | 实时当前耐久（含夜修回血） |
| `ring.maxHp` | 点 | 600（`V029.wallRingHp`） | 仅用于既有文本 |
| `ring.status` | — | `'intact'` / `'broken'` | 倒塌后不估算 |

**采样写入点**：`damageWallRing()` 的 `if (dealt > 0)` 分支（L1004）内追加：

```js
if (ringId === 'home' && dealt > 0) {
  if (!Array.isArray(game.wallDamageSamples)) game.wallDamageSamples = [];
  game.wallDamageSamples.push({ t: game.clock, dmg: dealt });
  // 滑动裁剪：只保留最近 W 秒，防止数组无限增长
  game.wallDamageSamples = game.wallDamageSamples.filter(s => s.t > game.clock - W);
}
```

- **不得**采样 `wallBlow(e)` 的返回值（那是「意图伤害」，hp 归零时会高估）；**不得**在 `damageWallRing()` 入口采样（`amount=0` / `status==='broken'` 早退会重复计数）。
- 夜修回血走 `stepNightRepair()`（L4223），**不经过 `damageWallRing()`**，天然不会被记成负样本，无需额外过滤。
- `startNight()` / `dawn()` / `newRun()` 时把 `game.wallDamageSamples` 重置为 `[]`，避免跨夜 / 跨局残留。

### 4.2 公式（变量与单位齐全）

```
valid      = wallDamageSamples.filter(s => s.t > now - W && s.t <= now
                                        && Number.isFinite(s.dmg) && s.dmg > 0)   // 条
dmgSum     = Σ valid[i].dmg                                    // 点
DPS        = dmgSum / W                                       // 点/秒（分母固定 5，不按实际经过时间缩放）
remainingHp= Math.max(0, ring.hp)                            // 点
seconds    = DPS > 0 ? remainingHp / DPS : Infinity         // 秒
N          = Math.max(1, Math.ceil(seconds))                 // 秒，用于展示的整数
```

> **分母固定为 5 的理由**：刚入夜 `game.clock < 5` 时整条估算不显示（§4.3），因此不存在「窗口未满却按实际经过秒数放大 DPS」的场景；固定分母让公式可预测、可写 Node 单测，且不会因为首击时间抖动产生忽高忽低的秒数。

### 4.3 显示规则表（零伤害 / 数据不足 / 修复回升 / 倒塌 / 白天）

| 情形 | 判定条件 | `#battleText` 城墙项 | 估算标红 |
|---|---|---|---|
| 白天 / 非夜间 | `game.phase !== 'night'` | 不追加任何估算（`updateBattleHud()` L6667 已 `if(!night)return`） | 无 |
| 未建城 / 无 ring | `!game.castle` 或 `!ring` | 既有 L6676–6680 不 push 城墙项 | 无 |
| 已倒塌 | `ring.status === 'broken' \|\| ring.hp <= 0` | 既有 `城墙 破`（L6679），可追加 ` · 已倒塌`；**不显示「约 N 秒破墙」** | 该项 `critical=true`（既有 L6679 已含 broken） |
| **刚入夜 / 数据不足** | `game.clock < 5` | **不追加估算文案**（即使窗口内已有伤害样本） | 不因估算标红；既有低耐久 `critical`（L6679 `hp<maxHp*.35`）仍保留 |
| **零伤害** | `dmgSum === 0`（停刷后清场、敌人被清空、塔把敌人拦在墙外） | **不追加估算文案**，不显示「约 ∞ 秒」 | 不因估算标红 |
| **城墙修复导致 hp 回升** | 夜修 `stepNightRepair()` 使 `ring.hp` 增大 | 秒数按实时 `ring.hp` 重算 → **只增大或不变，不得减小**；回升后 `seconds >= 30` 时移除追加文案与估算标红 | 按新 `seconds` 重新判定 |
| 估算 ≥ 30 秒 | `seconds >= 30` | **不追加**估算文案（信息降噪；计划只要求低于 30 秒标红） | 无 |
| **估算 < 30 秒** | `seconds < 30 && DPS > 0 && ring.status !== 'broken'` | `城墙 ${Math.ceil(ring.hp)}/${ring.maxHp} · 约 ${N} 秒破墙` | **该 `.battle-stat` 加 `critical`** |

> **修复回升的关键口径**：样本只记**伤害**（`dealt`），回血不进样本；`remainingHp` 取**实时** `ring.hp`。因此修墙后 DPS 不变、分子变大 → 秒数变大，符合直觉（修墙确实争取了时间）。禁止用「窗口内 hp 净变化」当 DPS——那会在回血帧算出负 DPS 或 `NaN`。

### 4.4 低于 30 秒的文案格式与 `critical` 可验收判定

- **文本格式**（逐字）：`城墙 <hp>/<maxHp> · 约 <N> 秒破墙`
  - `<hp>` = `Math.ceil(ring.hp)`，`<maxHp>` = `ring.maxHp`；与既有 L6679 的 `Math.ceil` 口径一致。
  - `<N>` = `Math.max(1, Math.ceil(seconds))`，且 `1 ≤ N ≤ 29`。
  - 「约 N 秒破墙」追加在**城墙状态之后**（同一 span 内，用 ` · ` 分隔），不新增独立 span（保持「同一时刻状态栏信息不膨胀」）。
- **样式判定**：`#battleText` 内存在 `<span class="battle-stat critical">`，其 `textContent` **同时**包含「城墙」与「约 N 秒破墙」；CSS L442 生效后，该胶囊为红底 `rgba(217,83,60,.55)`、白字、`critPulse 1s` 脉冲动画。
- **PASS 条件**（截图 + DOM 双取证）：
  1. `#wallVital` / 耐久牌数值与 `ring.hp` 一致（实时更新，150 ms 节流 L6984 已足够）；
  2. 出现且仅出现一个带 `critical` 的城墙胶囊，文本含「约 N 秒破墙」，N 为 1–29 的整数；
  3. `seconds >= 30` 或零伤害或刚入夜时，该胶囊不含「约 N 秒破墙」且不因估算标红；
  4. 修复回血后 N 不减小（可用连续两张截图 + DOM 文本比对）。

### 4.5 纯函数抽取与 Node 测试契约（工程实现建议）

- 把估算抽成**不依赖 DOM 的纯函数**，例如：
  `estimateWallBreach(ringHp, ringStatus, samples, now, W = 5) -> { dps, seconds, N, show: boolean, critical: boolean, text: string }`
  `updateBattleHud()` 只负责把 `text` 并入 `label`、把 `critical` 并入 `stats` 元组。
- **Node 测试（先红后绿）** 必须覆盖至少 4 组固定序列（计划 §3 WP2 验收第 3 条）：
  1. 固定序列 `[{t:5.1,dmg:7},{t:6.0,dmg:7}]`、`now=10`、`hp=100` → 窗口为 `(5, 10]`，`dmgSum=14`、`DPS=2.8` 点/秒、`seconds≈35.71`、`N=36`、`show===false`；再单独断言**窗口边界**：把首条改成 `t=5.0`（等于 `now - W`，严格 `>` 故不计入）→ `dmgSum=7`、`DPS=1.4`、`N=72`。`DPS` / `seconds` / `N` 都要精确相等，不能只断言「有值」；
  2. 零伤害 `[]` → `show===false`；
  3. `now < 5` → `show===false`（数据不足）；
  4. 含回血场景：`hp` 由 100 升到 200、样本不变 → `seconds` 加倍且 `critical` 按新值重判。
  5. 边界：`t === now - W` 的样本**不计入**（用严格 `>`，与 §4.2 公式一致），避免窗口边界抖动。
- 测试**只能新增**，不得改 `tests/v029-*.test.cjs` / `tests/v030-flow.test.cjs` 的既有断言（§7 第 6 条）。

### 4.6 实现注意

- `updateBattleHud()` L6685 用 `battle.dataset.label !== label` **短路**：只有 `label` 字符串变化才重建 `.battle-stat` span。估算文案必须**并入 `label`**，否则会出现「文本没更新」；同时 `critical` 必须随 `stats` 一起重算，否则会出现「文本更新了但红色 class 没跟上」。
- 不要新增定时器：主循环 L6984 已有 150 ms 节流调用 `updateBattleHud()`，满足 §4.3「实时更新」。
- `refreshCastleWallVitals()`（L6695）在 `updateBattleHud()` 内被调用两次（L6666 / L6693），估算逻辑不要重复执行或重复写 DOM。

---

## 5. 「失败原因」（WP2-7）

### 5.1 三字段定义

| 字段 | 类型 / 单位 | 写入值 | 来源 |
|---|---|---|---|
| `collapseAt` | `Number`，**秒（夜内）**，整数 | `Math.max(1, Math.ceil(game.clock))` | 倒塌瞬间 `game.clock`；文案「第 N 夜 X 秒」的 X |
| `collapseSide` | `'west' \| 'east' \| null` | 由倒塌当夜**主入口**的 x 判定（`x < WIDTH/2` → `'west'`，否则 `'east'`） | 优先 `game.fronts?.[0]?.gates?.[0]`（夜内实际入口）→ 否则 `entrances(game.day)[0]` → 否则按 `game.castle?.x` 兜底 → 都拿不到写 `null` |
| `towersAtCollapse` | `Number`，**座** | `game.tiles.filter(t => t.building?.type === 'tower').length` | 倒塌**瞬间**现存箭塔总数（含升级塔；与既有 `failureDiagnosis()` L2646 的 `towers` 口径一致），不是失败时的塔数 |

- `startNight()` L3412 已把 `main.gates = entrances(game.day)` 写入 fronts，正常情况下 `fronts[0].gates[0]` 与 `entrances(day)[0]` 一致；保留两级兜底是为了让「测试夹具直接调 `collapseWall('home')`」也能得到确定方向。
- 写入**仅对 `ringId === 'home'`**（主城圈墙）；营地围墙倒塌（`ringId !== 'home'`）不写，避免误诊。

### 5.2 写入时机与「只增不改」兼容规则

**写入位置**：`collapseWall(ringId)` 内，`ring.hp=0; ring.status='broken';` 之后、L1026 `invalidateNavigation()` 之前（或在幂等早退 L1020 之后）。

```js
if (ringId === 'home') {
  const day = game.ledgerDay || game.day;       // 与 nightBook() L2708 的键保持一致
  const book = openNight(day);                  // ★ 不能用 nightBook()，见 §8-6
  if (book.collapseAt == null) {               // 只增不改：首次倒塌写入，之后不覆盖
    book.collapseAt = Math.max(1, Math.ceil(game.clock));
    book.collapseSide = resolveCollapseSide();
    book.towersAtCollapse = game.tiles.filter(t => t.building?.type === 'tower').length;
  }
}
```

**「只增不改」五条规则（逐条可验收）：**

1. **只写一次**：以 `book.collapseAt == null` 为门；同一夜二次调用 `collapseWall()`（幂等早退 L1020、或修复后再倒）**不覆盖**已有三字段。诊断要复盘「第一次崩的那一刻」，不是最后一次。
2. **不删不改既有字段**：不得修改 / 删除 `freshNight()` 已有字段（`castleDamage` / `castleRepair` / `buildingsLost` / `campsLost` / `hurt` / `dead` / `gates` / `planned` / `budget` …），也不得替换整个 `book` 对象。
3. **新增字段初始化要兼容**：`freshNight()` L2693 若要预置三字段，只能置 `null`（不得置 `0` / `'west'` / 具体数字，否则会被误判为「已倒塌」）；`openNight()` 对已存在的旧 `book` 不得补写默认值（`openNight()` L2701–2704 本来就是 `if(!game.ledger[day])` 才建，符合「只增」）。
4. **旧存档 / 缺字段降级**：v0.29 及更早的存档、或任何缺三字段的 `book`，`failureDiagnosis()` 必须走既有 6 条分支链（L2647–2652），**不得**输出 `undefined 夜` / `NaN 秒` / `undefined 侧` / 抛异常。
5. **写入不依赖结算状态**：`openNight(day)` 在 `phase==='lost'` 时仍可用（`nightBook()` 会返回 `null`，L2707）；`finish(false)` 发生在城墙倒塌之后，所以写入通常发生在 `lost` 之前，但规格要求即使已 `lost` 也能写入，避免夹具/边沿时序丢数据。

### 5.3 诊断分支优先级与逐字段降级

`failureDiagnosis()` 新分支插在 `if (!game.castle) return …`（L2638）**之后**、既有 `if (buildingsLost > 0)`（L2647）**之前**：

```js
const books = Object.entries(game.ledger || {});
const collapses = books
  .filter(([, b]) => b && Number.isFinite(b.collapseAt))
  .sort((a, b) => Number(a[0]) - Number(b[0]));       // 按夜号升序
const last = collapses[collapses.length - 1];         // 多夜多次倒塌 → 取最近一次
if (last) {
  const [night, b] = last;
  const side = b.collapseSide === 'west' ? '西' : b.collapseSide === 'east' ? '东' : null;
  const towers = Number.isFinite(b.towersAtCollapse) ? b.towersAtCollapse : null;
  ...
}
```

**逐字段降级表（§4.3「我为什么失败」逐条验收依据）：**

| 可用字段 | 输出文案 | 缺什么、怎么降 |
|---|---|---|
| 三字段齐全 | 完整模板（§5.4） | — |
| 缺 `collapseSide`（或为 `null` / 非法值） | 省略方向从句：`第 N 夜 X 秒城墙倒塌，当时箭塔 K 座。下局在敌袭侧城墙内放 2 座箭塔，入夜前修满城墙。` | 不写「undefined 侧」；用「敌袭侧」泛指 |
| 缺 `towersAtCollapse` | 省略塔数：`第 N 夜 X 秒城墙倒塌（敌军从 西 侧集中拆墙）。下局在该侧城墙内放 2 座箭塔，入夜前修满城墙。` | 不写「NaN 座」 |
| 只有 `collapseAt` | 只保留时间与建议：`第 N 夜 X 秒城墙倒塌。下局在敌袭侧城墙内放 2 座箭塔，入夜前修满城墙。` | 方向、塔数都省略 |
| 三字段全缺 / 无 ledger | **完全走既有 6 条分支**（L2647–2652），不出现新模板 | 旧存档兼容 |
| `collapseAt` 非有限数（`NaN` / 字符串） | 视为缺失，走既有分支 | 不得参与 `sort` 产生异常 |

> 「哪一夜」取 `Number(night)`（ledger 的 key），**不是** `game.day`（失败时 `game.day` 可能已递增）。`dawn()` L4139 设 `game.ledgerDay=finished`、L4160 置 `null`，因此 ledger 的 key 就是夜号。

### 5.4 完整文案模板（逐字）

```
第 {N} 夜 {X} 秒城墙倒塌（敌军从 {西|东} 侧集中拆墙），当时箭塔 {K} 座。下局在该侧城墙内放 2 座箭塔，入夜前修满城墙。
```

- `{N}` = ledger key（夜号，整数）；`{X}` = `book.collapseAt`（整数秒）；`{西|东}` = `collapseSide` 映射；`{K}` = `towersAtCollapse`（座）。
- 「在该侧」的「该侧」必须与 `collapseSide` 一致；降级为「敌袭侧」时同步替换（避免指代悬空）。
- 不得出现虚构资源名（§7 第 5 条）；「修满城墙」「2 座箭塔」与既有 `repairWallDay()` / `BUILDS.tower` 能力一致，不承诺做不到的操作。

### 5.5 显示位置（计划未写清，需拍板 §9-P4）

现状有**两处**承载诊断：

1. `renderUI()` L6601：`goal.textContent += ' ' + nextRunHint()`，`nextRunHint()` 内调 `failureDiagnosis()` → 诊断出现在「战役目标」段落末尾。
2. `renderUI()` L6603–6612：`#primary .diagnosis` 复盘面板，列 `game.notes.slice(0,3)`，caption「本局发生了什么」。`finish(false)` L4193 会 `note()` 一条；`showBanner()` L4194–4195 的副标题已指向「右侧「败局复盘」」。

**默认裁定**：在复盘面板 `#primary .diagnosis` 内**新增一条带 caption「败局诊断」的首行**，内容为 `failureDiagnosis()`（完整模板），`game.notes` 三条仍保留在其后；`goal` 段落里由 `nextRunHint()` 带出的同一句**保留**（既有行为，不改）。理由：§4.3 明确「失败横幅**加复盘面板**，诊断写明…」，只放在 goal 里玩家容易漏看；重复出现不冲突，且面板是「复盘」语义焦点。**验收以复盘面板为准**（§6 第 7 条）。
**备选**：把 `failureDiagnosis()` 从 `nextRunHint()` 移除，只在面板显示一次（更干净，但会改动既有 `nextRunHint()` 行为，超出 WP2 最小改动）。

### 5.6 §4.3「我为什么失败」逐条验收（本条单独细化）

| 子项 | 玩家操作 | 预期可见元素 | PASS 条件 |
|---|---|---|---|
| 7-a 横幅 | 真实流程败局（`finish(false)`） | `#eventBanner` 红色 danger 横幅「城堡失守」，副标题「右侧「败局复盘」说明了原因与下局建议」 | 横幅可见且未被顶栏遮挡 |
| 7-b 复盘面板 | 同上 | `#primary .diagnosis` 面板 + caption | 面板存在且 caption「本局发生了什么」/「败局诊断」可见 |
| 7-c 哪一夜 | 同上 | 诊断句含「第 N 夜」 | N 等于 ledger 中 `collapseAt` 有效且最大的 key，整数、非 `undefined` |
| 7-d 几秒 | 同上 | 诊断句含「X 秒」 | X = `book.collapseAt`，整数 ≥ 1，非 `NaN` |
| 7-e 哪个方向 | 同上 | 诊断句含「西 / 东 侧」 | 与 `collapseSide` 一致；缺字段时降级为「敌袭侧」且**不出现** `undefined` |
| 7-f 当时几座塔 | 同上 | 诊断句含「箭塔 K 座」 | K = 倒塌瞬间塔数（不是失败时）；缺字段时整句省略 |
| 7-g 下局怎么做 | 同上 | 诊断句含「放 2 座箭塔」「入夜前修满城墙」 | 建议可执行，不虚构资源 |
| 7-h 旧存档降级 | 载入缺三字段的账本（Node 夹具或 fixture） | 既有 6 条诊断分支之一 | 不抛异常、无 `undefined`/`NaN`、无新模板 |
| 7-i 重置 | 点「开始新一局」 | 新局开局画面 | `game.ledger` 重新初始化，`collapse*` 不残留（WP5 第 1.5 步） |

---

## 6. §4.3 体验清单 7 条 → 可截图验收判定标准

**统一证据约定**

- 截图目录：`tests/artifacts/v030-polish/guide-*.png`（六步 6 张）与 `tests/artifacts/v030-polish/` 下其他命名文件；每张附操作记录（点击/触摸了什么、等待了多久）。
- 浏览器回归统一 `BORDER_ARTIFACTS=tests/artifacts/v030-<名称>`，不覆盖旧证据。
- **真实输入标记**：`[R]`＝必须用真实鼠标 / 触控完成（对应 `cdp.cjs` 的 `clicktext` / `clicksel` / `click` / `tile` / `tiletap` / `key` / `wait`），**禁止 `eval` 改状态**；`[F]`＝允许状态夹具，但必须在证据里标注「状态夹具，非自然流程证据」；`[N]`＝Node 单测，无截图。
- **WP5 自然试玩红线**（计划 §3 WP5 第 1 条）：自然试玩全程禁止 `eval` 改状态，只用真实输入 + 等真实时钟。下表标 `[R]` 的条目在 WP5 报告中必须有对应的自然流程记录；WP2 阶段性取证可用 `[F]`，但**不得**冒充自然试玩。

| # | 玩家的问题 | 玩家操作 | 预期可见元素 | **PASS 判定条件** | 证据 |
|---|---|---|---|---|---|
| 1 | 我现在该做什么？ | `[R]` 开局 → 前往 A → 查看 → 建城 → 选卡 → 开发 1 处 → 派 1 名居民 → 在该侧建 1 座塔（真实鼠标点格心，等真实时钟） | 六步各一张 `#mapHint`，唯一 `▶` 提示；S3 目标资源点高亮、S5 推荐格金色虚线圈 | ① 每一步 `#mapHint.textContent` **逐字等于** §2.2 对应文案；② 每步 `classList.contains('next') === true` 且 `::before` 只出现 **1 个** `▶`；③ 同一步内不出现第二条提示、不残留上一步文案；④ S5 时目标格有金色虚线圈且与 `drawGates()` 红色入口同侧；⑤ day2 / 入夜 / 胜利 / 失败时 `.next` 全部移除 | `[R]` 6 张 `guide-*.png`，**必须真实鼠标**，禁止 eval 改状态 |
| 2 | 选中了什么？ | `[R]` 点选箭塔、点选城墙、点选居民（详情打开） | 四角金框；箭塔射程虚线圆；居民脚下金色虚线圈；城墙选中金色虚线描边 | 四者各自可见且互不遮挡。**全部为既有实现**（`drawSelection()` L5119 / L4776 / L4889–4908 / L5129），**WP2 不改代码**；quality-lead 只取证 | `[R]` 3 张截图；若判 FAIL 应另开工单，**不在 WP2 修** |
| 3 | 在哪里可以建造？ | `[R]` 选中「箭塔」工具 → **真实鼠标**悬停合法格、再悬停非法格 | 所有合法格整体金色高亮；悬停合法格金框；非法格红框加斜线 | ① 合法格整体高亮（`drawToolPreview()` 既有）；② `game.hoverTile` 为**索引**且等于悬停格 `at(x,y)`；③ 金框 / 红框斜线分界与 `toolTileState()` 一致；④ 移出 `board` 后悬停框消失；⑤ 触控设备不触发悬停（计划明确仅限 mouse） | `[R]` 2 张截图，**必须真实鼠标 `pointermove`**；`tiletap` 不产生悬停 |
| 4 | 居民去了哪里？ | `[R]` 派居民去林场 → 在途时点开居民详情 → 到岗后再点开 | 头顶状态气泡（⛏/→/作业中）；移动目标蓝色虚线；生产建筑右上角工人数徽章；详情「前往 林场（5,6）」 | ① 徽章 `👤N`（N>0）或灰色「空」（N=0）与实际 `assignedResidentIds.length` 一致；② 详情 `dest` 逐字符合 §3.1（含括号与整数坐标，无 `undefined`/`NaN`）；③ 「改派到…」按钮仍带坐标；④ 目的地是空地时显示「前往 空地（x,y）」；⑤ 到岗后仍可移动/召回/改派（§7 第 3 条红线） | `[R]` 至少 3 张（在途 / 到岗 / 空地兜底）；兜底分支可用 `[F]` 但需标注 |
| 5 | 资源为什么变化？ | `[R]` 天亮、点一次买不起的操作 | 顶栏 ±N 浮字；天亮每个产出点飘字 + 汇总横幅；失败操作红色 toast | 顶栏只显示金币/材料/粮食/稀缺资源；天亮飘字数值 = `forecastIncome()`；失败 toast 带 `.bad` 标红且说明原因。**既有 / WP1 内容，WP2 不改代码** | `[R]` 取证；若判 FAIL 不在 WP2 修 |
| 6 | 城墙还能撑多久？ | `[R]` 真实流程入夜 → 等真实时钟 → 观察 `#battleText`；低血场景 | 圈墙耐久牌 + 夜间状态栏实时更新；`seconds<30` 时出现红色胶囊「约 N 秒破墙」 | ① 耐久牌 / `#wallVital` 与 `ring.hp` 一致且随受击下降、随夜修回升；② `seconds<30` 时同一 `.battle-stat.critical` 同时含「城墙」与「约 N 秒破墙」，`1≤N≤29`，CSS L442 红底脉冲可见；③ 零伤害 / 入夜 <5 秒 / 已倒塌 / 白天**不显示**估算且**不因估算标红**；④ 修墙后 N 不减小 | `[R]` 自然流程记录（WP5）；低血临界截图允许 `[F]` 但**必须标注「状态夹具」**且不得计入自然试玩证据；公式正确性由 `[N]` 新增 Node 测试覆盖（§4.5） |
| 7 | 我为什么失败？ | `[R]` 新一局**故意不布防** → 等真实时钟到失败 → 看复盘面板 → 点「开始新一局」 | 失败横幅 + 复盘面板；诊断含哪夜、几秒、哪个方向、当时几座塔、下局怎么做；重置后状态全新 | 按 §5.6 的 7-a … 7-i **逐子项**判定；旧存档缺字段时降级不出现 `undefined`/`NaN` | `[R]` 失败页 1 张 + 重置后 1 张（WP5 第 1.5 步，**禁止 eval**）；字段降级由 `[N]` Node 测试覆盖 |

**额外一致性检查（贯穿 7 条）**：每张截图都要确认 `#mapHint` 的 `.next` 状态符合 §2.4 让位表；选中工具时提示链让位给 modes 文案；胜利页 L6617 文案覆盖且 `.next` 移除。

---

## 7. WP2 不得触碰的 §0 核心规则（逐条红线）

| # | §0 规则 | WP2 改动的潜在冲突点 | **禁止事项** | 自查命令 / 依据 |
|---|---|---|---|---|
| 1 | **城墙整圈共享耐久，归零整圈倒塌** | DPS 估算读 `ring.hp`；`collapseWall()` 新增 ledger 写入 | 不得给圈墙分段血条；不得改 `ring.hp=0` / `status='broken'` 的整圈语义；不得让估算写入任何战斗状态；`collapseWall()` 新增代码不得放在幂等早退之前改变行为 | `node --test tests/v029-rings.test.cjs`；地图上只有一条圈耐久牌（L6679 / L6700） |
| 2 | **破墙后主城很快失守** | 提示链、推荐格、失败诊断都不参与战斗循环 | 不得改敌人 AI、`wallBlow()`、`V029.wallHit`、`calculateRoutes()`、攻击站位；不得因为加提示而延长/缩短倒塌后流程 | `node tests/v029-rings-ui-browser.cjs` → `afterCollapseSeconds ≤ 5` |
| 3 | **居民真正走到对应建筑，到岗后仍可移动、召回、改派** | `inspect()` 居民分支改 `dest` 文案；徽章读 `assignedResidentIds` | **只改字符串**，不得改 `assignWorker()` / `recallHomeResident()` / `clearResidentWork()` / `game.residentCommand` / `r.targetTile` 的赋值与寻路；「改派到…」按钮保留坐标与行为 | `node --test tests/v029-workplaces.test.cjs`；`node tests/v029-workplaces-browser.cjs` |
| 4 | **资源地形不挡友军；开发后清掉旧自然图标，只显示对应生产建筑** | `structure()` 追加徽章；`recommendedDefenseTiles()` 新增绘制 | 徽章只是叠加文字，不得改动 `structure` / `nodeArt` / `drawFoliage` 的**函数名与 `draw()` 中的按名调用**（§5 常见坑）；不得重新画树/石/麦田图标；不得改 `canStand()` / `enemyPassable()` | `node --test tests/v029-workplaces.test.cjs`（含绘制契约：`structure/nodeArt/drawFoliage` 必须保留） |
| 5 | **资源、费用、收入与界面一致；顶栏只显示金币/材料/粮食/稀缺资源** | 新增 7 类文案（六步提示、方向、秒数、诊断、徽章、详情） | 不得出现「木材 / 石料 / 石头」等虚构资源名；用既有 `RESOURCE_LABELS`（`金币/材料/粮食/稀缺资源`）；天亮飘字仍等于 `forecastIncome()`（WP2 不碰它）；不得往顶栏加第 5 种资源 | 全文 `grep` 新增文案；`node --test tests/v027-balance.cjs` |
| 6 | **测试纪律：不得删断言、放宽阈值、改结果文件** | 新增 2 类 Node 测试（DPS 估算、失败诊断含倒塌字段） | 只能**新增**测试文件 / 新增断言；`git diff cd4437a -- tests/` 对已有断言只能新增；新增浏览器 runner 不得覆盖旧证据目录；失败时改实现或 CSS，**不改断言** | §4.1 全量回归（**8 文件**）：`node --test tests/v029-workplaces.test.cjs tests/v029-rings.test.cjs tests/v029-ui.test.cjs tests/v027-balance.cjs tests/v028-priority.cjs tests/v030-flow.test.cjs tests/v030-lighting-capability.test.cjs tests/v030-wp2.test.cjs`（**当前基线 77/77**：10+10+10+10+6+2+5+24，其中 +5 为 WP1-FIX-01、+24 为 WP2 新增；完成后 `# pass ≥ 77 + 新增测试数`、`# fail 0`、`# skipped 0`、`# todo 0`）。⚠ 交接计划 §4.1 的旧值 `48` 是 WP1 交接时的 **6 文件历史基线**，沿用会把门槛压低 29 条、属**放宽阈值**，正违反本条红线；订正依据见 `wp2-acceptance-plan.md` §3.4 L407–410。§4.2 三条浏览器 runner 全 `OK`、`pageErrors=[]` |

**每次 WP2 提交前的统一自查**（计划 §3 开头）：跑 §4.1 Node 回归 → 看至少一张实际截图 → 提交信息末尾加 `Co-Authored-By` 行。仓库中不得残留临时后门（`grep -n "__wallHit\|window.__" Border-Guard-v0.29.html` 应无结果，`window.FW` 除外）。

---

## 8. engineering-lead 实现时最容易踩的坑（按风险排序）

| # | 坑 | 后果 | 规避 |
|---|---|---|---|
| 1 | **`game.hoverTile` 存索引，不是对象**：`screenToGrid()` 返回 tile 对象，L5110 用 `game.tiles[game.hoverTile]` | 悬停预览完全不生效或画到错格 | 写入前 `at(t.x, t.y)`；`pointerleave` 置 `null`（不是 `undefined`，L5110 判 `!=null`） |
| 2 | **新增 `pointermove` 干扰既有 `mapGesture`**（L5572 拖动平移） | 平移失效、长按详情误触发 | 独立监听、不 `preventDefault()`、不改 `mapGesture`；仅 `pointerType==='mouse'` |
| 3 | **`.next` 只 add 不 remove** | day2 / 夜间 / 胜利页残留 `▶`，截图判 FAIL | 每次 `renderUI()` 用 `classList.toggle('next', guideActive && phase!=='won')` |
| 4 | **提示链与推荐格各写一套判定** | 文案说「西侧建塔」但圈画在东侧；或圈消失而文案还在 | 共用 `recommendedDefenseTiles()`（§2.3.5）；`tutorialStep()` 与 `draw()` 都调它 |
| 5 | **`canBuildAt()` 不检查 `t.building`**（L1710–1715） | 推荐格圈到已有建筑 / 提示建塔却无合法格 | 必须补 `&& !t.building` |
| 6 | **`collapseWall()` 用 `nightBook()` 写 ledger** | `nightBook()` L2707 在 `phase==='lost'` 返回 `null`，倒塌数据丢失、诊断永远走旧分支 | 改用 `openNight()`，日夜键沿用 §5.2 中与 `nightBook()` 相同的写法，但不走 `lost` 早退 |
| 7 | **DPS 采样放在 `damageWallRing()` 入口或采 `wallBlow()` 返回值** | hp 归零时高估伤害、零伤害帧重复计数、夜修回血被算成负 DPS | 只在 L1004 `if(dealt>0)` 内采 `dealt`；只记 `ringId==='home'` |
| 8 | **DPS 时间戳用 `performance.now()`** | 暂停 / 卡牌模态冻结业务时钟时窗口错乱，秒数跳变 | 用 `game.clock`（夜内秒，L4205） |
| 9 | **估算文案没并入 `battle.dataset.label`** | L6685 短路导致文本不刷新；或文本刷新了但 `.critical` class 没跟上 | 把 ` · 约 N 秒破墙` 拼进 `label`，`critical` 随 `stats` 一起重算 |
| 10 | **`productionBuildings` 是懒加载 Map**（`ensureProductionMaps()` L1860 只保证 `instanceof Map`，不重建内容） | 旧存档 / 夹具读空 Map → S3 误判「无开发」、徽章全画「空」 | S3 用 `t.node.developed`（权威）；S4 / 徽章读 Map 前调 `ensureProductionMaps()`，取不到按 0 人兜底 |
| 11 | **诊断三字段用 `freshNight()` 预置为 `0` / `'west'`** | `Number.isFinite(0)` 为真 → 每局都被误判「城墙倒塌过」 | 预置只能是 `null`；判定用 `Number.isFinite(b.collapseAt) && b.collapseAt != null` |
| 12 | **`ctx` 是 `let`；测试 VM canvas 是桩**（§5 常见坑） | `cachedLayer()` 临时替换 `ctx` 后缓存引用失效；`createRadialGradient` / `measureText` 在 Node 测试里报错 | 新绘制用全局 `ctx`、不缓存 `const g=ctx`；徽章用固定尺寸 + `fillText`，不依赖渐变 / 文本测量 |
| 13 | **改 `structure` / `nodeArt` / `drawFoliage` 的调用方式** | 绘制契约测试整体替换这三个函数名统计调用，改名或局部引用会红 | 徽章画在 `structure()` 内部末尾；`draw()` 仍按名字调用三者 |
| 14 | **推荐格绘制写进 `cachedLayer('terrain')` 的缓存键** | 缓存键是 `navigationRevision()\|已占领格数\|seed`，加入动态层会导致画面不刷新或缓存错乱 | 推荐格在 `draw()` 的 `drawToolPreview()` 之后独立绘制，不进静态缓存 |
| 15 | **`entrances()` 在 `game.castle===null` 时用 `game.hero` 位置**（L3346–3348） | S5 在无城时算出方向并画圈，与「未建城」提示冲突 | `recommendedDefenseTiles()` 首行判 `!game.castle` 返回 `[]`；S5 本身在 S1 之后，天然不会命中 |
| 16 | **改了 `tutorialStep()` 却忘了 L6616 的 `!game.mode`** | 选中工具时提示链覆盖 modes 文案，玩家看不到「点领地空地放置箭塔」 | 按 §2.4 把门禁统一收进 `tutorialStep()`，或保留 L6616 原条件，二选一，不得两处都漏 |
| 17 | **六条文案里手写了 `▶`** | CSS `::before` 再加一个 → 出现双箭头，截图判 FAIL | 文案纯文本，箭头交给 `.next::before` |
| 18 | **诊断文案只改 `goal` 段落、没进复盘面板** | §4.3 第 7 条「失败横幅加复盘面板」判 FAIL | 按 §5.5 在 `#primary .diagnosis` 加「败局诊断」首行 |

---

## 9. 与计划原文的分歧 / 需用户拍板项

> 以下 5 项本规格已给出**默认裁决**，engineering-lead 可据此实现；但属于对计划原文的细化或偏离，建议由主理人/用户确认后定稿。用户始终掌舵。

| # | 议题 | 本规格默认裁决 | 备选方案 | 影响面 | 建议 |
|---|---|---|---|---|---|
| **P1** | 计划 §3 WP2 第 2 条给了 6 条固定文案，但既有 `tutorialStep()` L3242–3245 把「未建城」细分成 3 条（未探明 / 已探明未选 / 详情确认），且 L3239 有 `MOBILE()` 分支 | **统一为 6 条固定文案**，去掉细分与 `MOBILE()` 分支；细分信息仍由 `goalText` / A-B 按钮 / 详情面板承载 | 保留细分作为 S1 的子状态（会增加 3+ 条文案，六张截图验收需改成 8+ 张） | 验收截图数量、文案一致性、触控文案 | **建议采用默认**：可截图验收性最强，且与「唯一提示」不冲突 |
| **P2** | 计划文案「建 1–2 座箭塔」，但没说已建 1 座后是否还提示 | **`towersOnSide >= 1` 即进入 S6**（0 座才提示） | 改为 `< 2` 才提示，必须建满 2 座才出现完成态 | S6 可达性、与 §1.1「单塔挂机 0/2 失守」的一致性 | **建议采用默认**；若希望强化「双塔」教学再切备选 |
| **P3** | 该侧合法格不足 2 个时是否改文案 | **不改文案，只减少圈数**（0 个则不画） | 0 合法格时把文案降级为「该侧暂无可建格，先扩展领地」 | 会引入第 7 条文案，破坏「6 步 ↔ 6 张截图」 | **建议采用默认**；降级文案可留到 v0.31 |
| **P4** | 失败诊断文案落在哪：`goal` 段落（既有 `nextRunHint()`）还是复盘面板 | **两处都出现，验收以 `#primary .diagnosis` 面板为准**（面板新增「败局诊断」首行） | 从 `nextRunHint()` 移除，只在面板显示一次 | 是否改动既有 `nextRunHint()` 行为、是否出现重复文本 | **建议采用默认**：最小改动且满足 §4.3「复盘面板」字面要求；若嫌重复可切备选 |
| **P5** | 「未建城 + 卡牌待选」异常同时成立时的优先级（计划未提） | **S1 未建城优先** | S2 选卡优先 | 仅影响异常/夹具场景 | **建议采用默认**：不会指向打不开的目标 |

**其余与计划一致、无分歧**：悬停仅限 mouse、推荐格用 `entrances(day)[0]` 最近 2 个合法格且只绘制不建造、徽章 `👤N` / 灰色「空」、详情「建筑名 + 坐标」且改派按钮保留坐标、DPS 用最近 5 秒、低于 30 秒标红 `critical`、ledger 三字段「只增不改」、诊断模板逐字按计划。

---

## 10. WP2 验收项 ↔ 本规格条款映射

| 计划 §3 WP2 验收 | 本规格条款 |
|---|---|
| 真实鼠标从开局走到第 1 夜，每步 `#mapHint` 恰好对应文案，6 张 `guide-*.png` | §2.2 状态机表、§2.4 让位表、§6 第 1 条 |
| 按推荐格建 2 座塔后挂机首夜不失守（`sim/matrix.cjs` 的 `idle-2t` 为 0/2 失败） | §2.3.5（推荐格计算与阈值）、§7 第 1/2 条红线（不改伤害与 AI） |
| 新增 Node 测试（DPS 估算、失败诊断含倒塌字段）先红后绿 | §4.5（纯函数 + 5 组固定序列）、§5.3（逐字段降级）、§7 第 6 条（只增不改） |
| 提交 `feat: guided first day, hover placement preview and wall time-to-breach` | §7 统一自查（Node 全量 8 文件 77+ / 浏览器 3 runner / 实际截图 / `Co-Authored-By`） |
| §4.3 体验清单 7 条 | §6 全表 + §5.6 第 7 条逐子项 |

---

*本文件为设计规格，不含任何游戏代码改动；产出后由主理人统一纳入版本管理。*
