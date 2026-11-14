# 《边境守卫》v0.29 重构开发计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 执行者为用户指定的 Cursor；若该执行环境未提供此技能，直接遵循本文的任务顺序、先测后实现和阶段验收，无需安装额外插件。本文件交付的是计划，不是本轮代码实现。

**Goal:** 将自由拼墙原型重构为领地边界防御，先通过阵营导航、共享墙血、箭塔视线和居民到岗测试，再接入经营数值与 UI。

**Architecture:** 每圈城墙具有独立 ringId、领地格集合、血量、边段、塔位和城门；同一圈内各边段共享该圈血量，不同圈互相独立。塔资产记录所属 ringId，通过原子事务和版本号同步导航、射界及显示。

**规则更正：** 以用户最新纠正为准：一圈城墙是一座完整城墙，每圈各有独立血条。本文中的“共享墙血”仅指同一圈内部共享，绝不指全图共用。某圈被打破，只影响该圈墙、塔和施工。

**Tech Stack:** 沿用离线单 HTML、原生 JavaScript、Canvas；Node.js 22+ 的 `node:test` 和 VM 测试；浏览器验收沿用现有 CDP 方式。首版不引入打包器、服务端或游戏引擎迁移。

**Spec:** 本文件“1. 已冻结需求”承载用户本轮规则；“2. 实施约定”是本计划补齐的实现选择；“5. 数值框架”是待验证初值。

## Global Constraints

- 首先检查实际最新试玩文件。本次仓库只有 v0.26 及更早版本，没有 v0.27/v0.28；以 `Border-Guard-v0.26.html` 派生 `Border-Guard-v0.29.html`。若执行时已有更新版本，先比较规则与改动，再在交付记录写明实际基线。
- 保留历史 HTML、历史回归及其证据；新证据写入 `tests/artifacts/v029/`。不覆盖已有未提交改动，不为本计划创建虚构测试结果。
- Phase 1–3 通过逻辑测试后才进入 Phase 4 的 UI。允许必要的墙线、工作建筑、单位和读条的基础绘制及调试入口，不进行布局重做。
- 保留单文件双击离线可玩；按职责分区组织脚本，首版不拆成需要 HTTP 加载的 ES modules。
- 全部游戏时间使用模拟时间；暂停和卡牌弹窗停止移动、施工、预警和生产计时。
- 每个任务先增加失败用例，再实现，再运行所属测试；通过后仅暂存本任务文件并按仓库权限提交，提交受限时保留可审查 diff。用户另有提交要求时服从用户要求。

## Review Focus

1. 扩地把旧边界、城门或单位所在处吞入内部：原子重构、塔资产守恒、单位不被困住；由 P2-B 测试覆盖。
2. 同一模拟步内致命攻击和修复到时：先结算攻击及破墙，再修复，已经破墙不能被救活；由 P3-A 测试覆盖。
3. 寻路认为可走、连续移动却不能通过：点击、键盘、居民路线、敌军流场使用一致的阵营与边界规则；由 P1-A、P2-A 测试覆盖。
4. 工作位被占、建筑拆除或目标无路：居民不会瞬移或错误到岗，不重复产出；由 P1-B、P3-B 测试覆盖。
5. 射线擦角、移动目标躲入林后、投射物在墙破前发射：遮挡保守且伤害只结算一次；由 P1-C、P3-A 测试覆盖。

---

## 1. 已冻结需求

1. 森林、山脉对己方领主和居民通行无阻，对敌军阻挡；二者均遮挡普通箭塔视线。
2. 每圈城墙有独立血条；同圈所有边段共享该圈血量。该圈血量归零，仅该圈墙视觉与碰撞消失、该圈墙上已部署塔销毁；其他圈不受影响。
3. 塔只能部署到边界城墙格。扩地继承所属圈的当前墙血；吞入内部的旧塔转待部署，白天可免费迁至新墙。
4. 白天从主城面板按缺血量收费、一键瞬间修满；夜间一次持续 6 秒的紧急施工，每秒恢复血量，期间破墙立即失败。
5. 主城只能承受两次有效攻击。普通怪持续消耗；攻城怪高伤、慢速，出现前 8–12 秒预警。完整城墙存在时，己方只能经城门进出。
6. 资源点须建设对应生产建筑；完成后清除原自然地形图标；农民实际移动到建筑停靠格才能工作，修复卡死。
7. UI：顶部金币/木材/石料/人口/行动力/天数；左侧图例与小地图；右侧可呼出的主城面板及修墙；底部建造栏；中间三选一卡牌。

## 2. 实施约定：补齐规则的工程含义

以下是本计划建议，不冒充用户新增定案。Cursor 依此实现首版，并在交付记录列出。

- **一圈外框：** 每圈对应自己的四连通领地，排除仅对角连接和封闭未占地孔洞；全图可有多个圈。扩地若产生孔洞，整笔拒绝并说明原因，不静默免费占地。首版不做两圈合并、嵌套或共边，发生冲突则拒绝扩地，避免暗中决定合并后的血量。水域仍阻挡双方；森林、山脉放行己方不等于水域放行。
- **墙沿格边、塔在格上：** 用领地格与外部格之间的单位边表示物理墙；与外框相邻的领地格为墙格候选。薄领地和凹角不靠整格墙碰撞处理，避免一格宽领地全变成实心障碍。
- **城门：** 首版每圈 1 个己方通行口、敌方仍不可穿越的门段。每次扩地按该圈原门位置优先保留，失效时在该圈新外框上选距原门最近的合法边，距离相同时按边 ID 排序；两侧需有合法站位、内侧连所属核心服务位、外侧连己方探索区域。没有合法门则拒绝扩地。未来同圈多门不在本轮范围。
- **完整墙与破墙：** 完整时只允许己方从门跨境；破墙后墙边和门段均不再阻挡单位，恢复地形及建筑本身碰撞。敌军仍不能穿林穿山。
- **迁塔：** 免费指不消耗资源与行动力；等级、稀缺升级资产、剩余冷却保留。每个墙格最多 1 塔；门内外通行格、生产建筑及停靠格不能被塔占用。新部署不能重置射击冷却。待部署塔不能攻击。
- **塔损毁：** 首版塔不设独立承伤血条，拆墙攻击扣所属 ringId 的血量；墙破仅销毁该圈所有已部署塔。其他圈的塔继续攻击。待部署塔保留所属 ringId，白天免费迁回该圈；首版不提供跨圈免费调拨。已发射箭矢可以继续飞行、正常受遮挡和单次命中规则约束。
- **建设时机：** 扩地、建生产建筑、迁塔均在白天；新建和升级按配置消耗行动，免费迁塔与修墙不消耗行动。现有 7 次白天行动先保留以便对照。
- **破墙后的白天维修：** 若领主最终清场存活到天亮，可按满额费用重建城墙；被毁塔不会恢复。夜间施工不能重建已经破掉的墙。
- **主城两击：** 用 2 次耐久计数，任何普通/攻城/BOSS 有效接触攻击扣 1，不以伤害倍率改变次数。首版两次有效命中之间至少相隔 1 秒的全局受击保护，防止同帧多敌直接结算败局；不是新增第三次容错。主城不接受旧版数值回血或增血卡。
- **范围边界：** 本轮不引入曲射塔、飞行兵、随机穿山怪。草地和道路对敌军可通行，树石阻挡；“逼迫走路”通过道路走廊与地图连通性实现，不把所有草地突然设为禁行。
- **外围营地：** 有围墙的营地独立登记一个 ringId，拥有自己的墙血和墙塔；没有围墙的营地不创建虚构血条。该圈破墙后敌军继续攻击该营地核心，沿用既有营地失守规则；主城“两击结束”只适用于主城本体。营地破墙不扣主城圈血量，也不直接触发主城败局。领地生产与营地产出不能重复结算同一资源点。
- **维修归属：** 每次修墙必须指定 ringId；一键修满当前选中圈，不顺带修复其他圈。六秒施工、费用、每夜次数按圈独立存储；“每圈每夜一次”是本计划补齐的初版建议。主城管理面板可切换目标圈，营地详情可调用同一修墙命令。

## 3. 当前实现与修改入口

以下行号为本次 v0.26 快照，执行时按函数名定位；仓库无 `.codegraph/`，本次未使用或创建索引。

| 现有入口 | 当前行为 | v0.29 工作 |
|---|---|---|
| `isSolidGround/tileSolid/canOccupy/findApproachPath`，约 451–568 | 树石阻挡所有单位；路径谓词未携带单位阵营 | 拆静态地形、建筑占位、跨边规则 |
| `repairMapConnectivity`，约 597 | 为旧共同可行走图清理树石 | 分己方服务位连通性与敌军道路到墙攻击位的验证 |
| `findResidentSlot/updateResidents`，约 951、1140 | 站位无合法项时回退实体中心或无效候选；静止态插值直接改坐标 | 可达工作位预约、统一真实移动、无路等待重试 |
| `makeGame/chooseSite/claim/createCamp`，约 1556、1680、1792、777 | 逐格 owned；没有按圈城防实体 | 增加 territories/wallRings，按 ringId 原子扩地与初始化门 |
| `BUILDS/build/repair/rework/salvage`，约 1280、1806 | 拼段墙、塔独立血量、修主城 | 自动墙、独立塔资产、集中修墙、完整费用迁移 |
| `calculateRoutes/moveEnemy`，约 2022、2531 | 以主城为源；可拆墙塔作为高代价格 | 按目标 ringId 寻外侧攻击位；该圈破墙后改为所属核心 |
| `towerRange/fireTowers/updateProjectiles`，约 2646、2337 | 范围筛选，无地形射线 | 距离 + LOS + 飞行段遮挡 |
| `forecastIncome/campYield/dawn`，约 2689、1224、2748 | owned 资源无需工人到岗便产出 | 生产建筑、到岗工时、账本闭合 |
| `advanceBattle/tickCampaign`，约 2806、2850 | 变步长战斗，主城浮点 HP | 固定子步、施工状态机、两次耐久 |

新增文件：`Border-Guard-v0.29.html`、`tests/helpers/v029-vm.cjs`、下文 5 个 `tests/v029-*.test.cjs`、`tests/v029-browser.cjs`、`tests/v029-balance.cjs`、`Border-Guard-v0.29-更新说明.md`。测试 helper 可借鉴现有 `tests/run-v026-model.cjs` 的最小 DOM/Canvas VM 启动方式，历史 runner 保持原状。

## 4. 数据结构与接口契约

以下为 JavaScript 对象结构说明，非要求迁移 TypeScript。运行态 Map/Set 若未来序列化，使用显式 encode/decode；本轮不承诺兼容旧版存档。

```js
game.territories = new Map();        // ringId -> 该圈领地
const territory = {
  ringId: 'home',
  owned: new Set(),                 // tileId；替换多处可写 t.owned
  revision: 0
};
game.wallRings = new Map();          // ringId -> 独立的一圈墙
const wallRing = {
  id: 'home',
  ownerType: 'castle',              // castle | camp
  ownerId: 'castle',
  hp: 1000, maxHp: 1000, status: 'intact', // intact | broken
  revision: 0,
  edges: new Map(),                 // edgeId -> {ringId, insideTileId, outsideTileId, a, b}
  pads: new Set(),                  // 合法边界墙格 tileId；从 edges 派生
  gates: new Map(),                 // gateId -> {edgeId, insideDock, outsideDock}
  repair: {
    usedNightId: null,
    status: 'idle',                 // idle | building | completed | failed
    elapsed: 0, duration: 6,
    budgetHp: 0, appliedHp: 0,
    paid: {wood: 0, stone: 0}
  }
};
game.territories.set('home', territory);
game.wallRings.set('home', wallRing);
// 营地圈以 camp:<campId> 为 ID 另行创建，绝不复用 wallRing 对象或 repair 引用。
// 可从各 territory.owned 派生全图归属索引，但不能把独立圈的血量汇总成可扣血实体。
game.towers = new Map();            // towerId -> 下述对象，唯一实体登记处
// {id, ringId, type:'arrow', level, status:'deployed'|'pending'|'destroyed',
//  tileId:null|number, cooldownRemaining, invested:{gold,wood,stone,rare}}
// pending 没有 tileId；destroyed 无攻击/碰撞，保留用于账本归因。

game.productionBuildings = new Map();
// {id, kind:'farm'|'lumbermill'|'quarry'|'mine', tileId, sourceNodeId,
//  capacity:1, assignedResidentIds:[], docks:[tileId], active:true,
//  workSeconds:0, yieldRemainder:0}

// tile.node 改为保留资源来源元数据，不作为工作状态或产出真相：
// {id, kind, developedByBuildingId:null|id, remaining:null|number}
// tile.cover: 'none'|'forest'|'mountain'；底层 ground 保留 grass/road/water 等。
// 建资源建筑时 cover='none'；不能只隐藏贴图而保留隐形树石遮挡。

// 居民保留已有营地、伤员等字段，新增独立工作任务：
resident.work = {
  buildingId: null, dockTileId: null,
  state: 'idle',                    // idle | travel | working | blocked
  route: [], routeRevision: -1,
  noProgressSeconds: 0, retryIn: 0
};
game.dockReservations = new Map();  // dockTileId -> residentId
game.castleIntegrity = {hitsRemaining:2, lastHitAt:null};
game.revisions = {navigation:0, occlusion:0};
game.resources = {gold:20, wood:28, stone:18, food:8, rare:0};
// 人口由居民实体统计，行动力继续 game.actions；本轮不要复制第二套人口/行动库存。
```

### 4.1 不变量

- 只有 `damageWall/repairWallDay/stepNightRepair` 能改指定 ringId 的墙 HP；边段没有 hp。每圈 `status === 'broken'` 必须伴随该圈 hp=0；不同圈没有可写的共同墙血。
- 攻击、迁塔、扩地、维修和 UI 选择均显式携带 ringId；无效 ID 必须失败，不能默认回退主城圈。每圈独立保存 revision 与 repair，禁止共享可变对象引用。
- 边界是几何缓存，不是建筑资产；重建边界不能创建血量、塔或资源。
- 塔总数 = deployed + pending + destroyed；只有明确建造/销毁事件改变资产分类，迁移不创建新 ID。
- 可写地形、建筑和归属分别有唯一入口；`t.owned` 若保留，只可做只读兼容 getter。
- 建筑实体格不可站；至少有 1 个合法相邻停靠格。`findResidentSlot` 找不到时返回 null，禁止回退建筑中心。
- 工人进入 working 必须同时满足：目标建筑有效、持有该工作位预约、抵达误差 ≤0.085 格、位置可站。路线为空不代表到岗。

### 4.2 共享接口（均在 v0.29 HTML 内定义）

| 接口 | 输出与责任 |
|---|---|
| `movementProfile(actor)` | `'ally'` 或 `'enemy'`；居民/领主/敌军创建时明确阵营，禁止按对象是否有 hp 猜测 |
| `canStand(actor, position, snapshot?)` | 地形、建筑、地图范围及单位脚底圆是否合法；脚底圆也不能与阻挡该阵营的墙边相交 |
| `canTraverse(actor, from, to, snapshot?)` | 整段脚底圆扫掠是否合法，包含跨墙/门边，支持路径中心与连续小步，不能只检查中心线交叉 |
| `findPathFor(actor, fromTileId, toTileId, snapshot?)` | `{ok:true, points}` 或 `{ok:false, reason}`，BFS 四邻步长共用 canTraverse |
| `hasLineOfSight(from, to)` | supercover 网格射线；任何穿过的森林/山脉阻挡，擦格角两侧都检查 |
| `buildBoundary(owned)` | `{edges,pads,gateCandidates,perimeter}`，pads 此处仅为几何候选，preview/部署时再按 cover、门与实体过滤；不修改游戏状态 |
| `previewExpansion(ringId, tileId)` | `{ok,reason?,ringId,snapshot?,deltaPerimeter?,pendingTowerIds?,gateMoves?}`，只重构该圈 |
| `commitExpansion(preview)` | 校验 revision 未变，原子扣费和提交；过期预览拒绝，无副作用 |
| `damageWall(ringId, amount, sourceId, edgeId)` | 校验 edge 属于该圈，只扣该圈血；归零立即调用一次 collapseWall(ringId) |
| `collapseWall(ringId)` | 仅移除该圈碰撞/视觉、销毁该圈 deployed 塔、终止该圈施工；使相关导航缓存失效，幂等 |
| `deployPendingTower(ringId, towerId, tileId)` | 白天、该圈完整、该圈合法空 pad、塔归属匹配才成功；费用与行动消耗为零 |
| `repairWallDay(ringId)` | 白天原子校验余额、扣费、修满指定圈，可重建该圈 broken 墙但不恢复塔 |
| `startNightRepair(ringId)` | 指定圈夜间完整且未满、该圈该夜未使用、资源够才启动；只更新该圈 usedNightId |
| `stepNightRepair(ringId, dt)` | 只对指定圈持续回血并截断至 6 秒；该圈破墙优先，取消后无后续回血 |
| `damageCastle(sourceId, simulationTime)` | 主城圈完整时拒绝外敌接触伤害；主城圈破墙后按有效命中扣 1，0 时败局；营地圈状态不代替主城圈状态 |
| `assignWorker(residentId, buildingId)` | 预约可达 dock 后进入 travel；失败不假到岗、不收费 |
| `stepWorker(resident, dt)` | 统一真实碰撞移动、到岗验证、受阻重试与工作计时 |
| `developProduction(tileId, kind)` | 验证类型、费用、可达 dock、非塔门占位；原子清 cover 并建实体 |
| `settleProductionAtDawn(cycleId)` | 按实际工时结算，cycleId 去重，产出与维护入账 |

所有写接口返回 `{ok:true,...}` 或 `{ok:false,reason}`；无效调用不扣资源、不耗次数、不消耗随机数。

## 5. 数值重构框架：先参数化，再用同种子对照

### 5.1 墙血与周长

```text
Hmax[r] = baseHp[r] × (1 + 0.25 × 该圈城防科技等级)
H_after_expansion[r] = H_before_expansion[r]
P[r] = 该圈外框单位边段数量（包括城门边）
塔密度[r] = 该圈已部署塔数 / P[r]
```

主城圈 baseHp 初值为 1000；其他圈独立配置，本次不从效果图读取数值定案。扩地只影响指定圈，不自动提高该圈 Hmax；科技升上限时首版也不免费补当前血。周长风险由该圈射界稀释、更多可接敌边和出城距离产生，首版不再附加按 P 线性扣血、按 P 自动加兵或按 P 重复收维修费。

初版箭塔射程 2.75 格，普通升级主要增伤，射程上限 3 格；伤害/攻击间隔先沿用基础 11/0.72 秒，墙体系稳定后再调。森林/山脉 LOS 必须真实生效；强口袋阵应有收益，攻城单位提供可预告的压力，不增加穿山例外。

### 5.2 维修费用与施工

```text
missing = Hmax[ringId] - H[ringId]
白天木材 = ceil(missing / 100 × 2)
白天石料 = ceil(missing / 100 × 1)
```

满血费用为零，不消耗行动。1000 血完全重建需 20 木/10 石；缺 400 血需 8 木/4 石。实际恢复量和扣费分别记账。

```text
夜间 repairBudget = min(0.25 × Hmax, 启动时 missing)
夜间费用 = ceil(1.5 × repairBudget / 100 × 各材料系数)
每秒修复 = repairBudget / 6
本步修复 = min(每秒修复 × 有效施工步长, Hmax - H)
```

上述 Hmax、missing、预算与费用都针对指定 ringId。以 1000 血圈为例，满额 250 血施工费用为 8 木/4 石，6 秒平均 41.667 血/秒；持续敌军净伤超过此值仍可能打穿。启动一次扣清；该圈中途破墙不退费，停止未来回血，已实际恢复的血不回滚，其他圈施工继续；到满血仍占用原 6 秒时间窗，溢出量丢失，期间再受伤可继续按原速恢复。暂停和卡牌选择不推进施工，刷新 UI 不影响状态。每圈每夜次数只在新 nightId 改变后恢复，不能靠重开面板、加固科技或扩地重置。

### 5.3 主城与敌人

| 参数 | 普通怪 | 攻城怪 |
|---|---:|---:|
| 对墙伤害/攻击间隔 | 5 / 1 秒 | 35 / 2.5 秒 |
| 移速 | 1.2 格/秒 | 0.6 格/秒 |
| 预警提前量 | 保留常规波次情报 | 固定 10 秒（落在 8–12 秒需求内） |
| 重击前摇 | 常规攻击表现 | 2 秒，包含在 2.5 秒攻击周期内 |
| 对主城命中 | 扣 1 次耐久 | 扣 1 次耐久 |

敌军 front 保存 targetRingId 与 targetCoreId。目标圈完整时，以该圈外侧可达攻击位为目标；每单位边段首版 1 个近战攻击位，后排排队，不允许几十只重叠同帧出手。不同边段可同时攻击，因此扩地会增加潜在接敌面。某圈破墙后，攻击该圈的敌军改为该圈核心，其他战线继续攻击各自圈。BOSS 同样走带 ringId 的墙血接口，重击数值单独配置，不能沿用旧主城伤害分支绕墙。警戒承压与维修成本分别按圈统计，再汇总全局经济。

```text
预计警戒后生存时间 ≈ 0.3 × Hmax / 警戒场景的有效拆墙DPS
```

普通难度初测以 30% 墙血后仍有约 6–10 秒可反应为目标，并单独统计攻城爆发。不是给墙加隐藏无敌，也不能只靠平均 DPS 掩盖同帧重击。敌军数量首先按夜次增长，不按玩家扩地面积再加一层自动惩罚。

### 5.4 资源、工时和回本

原型只有 `material`，本轮按用途拆成 wood/stone。一次性替换所有建筑、升级、维修、营地、事件、拆除、奖励、战报和账本费用；禁止 wood/stone 与可花费 material 双轨运行。food 与 rare 保留用于既有维护和战略升级，不因顶栏只列指定字段而删除。本轮领地工人不新增例行维护，先验证到岗生产；营地沿用既有维护规则，不叠收第二份维护，也不新增欠费系统。

| 新建内容 | 木 | 石 | 金 | 满员每周期产出（初测） |
|---|---:|---:|---:|---|
| 农场 | 6 | 2 | 4 | 12 食物 |
| 林场 | 8 | 2 | 4 | 12 木 |
| 采石场 | 6 | 4 | 4 | 10 石 |
| 金矿场 | 8 | 4 | 4 | 10 金 |
| 普通箭塔 | 12 | 6 | 4 | 战力，无资源产出 |
| 富资源点对应建筑 | 沿用对应建筑费用 | — | — | 富木 20 木 / 富石 18 石 / 富金 18 金 |
| 相邻扩地 1 格 | 0 | 0 | 4 | 土地本身不凭空产出 |

富资源类型只配置地图实际存在的资源；不强制新增富木内容。木/石生产、至少一条基础食物来源和主城门路径必须在开局附近可可靠获得。人口初版沿用开局 2 人，人口上限 4，由一个 `populationCap` 配置提供。初始资源见数据结构，需通过首夜可行性验证，不能凭表宣称平衡。

```text
q = min(1, 本周期真实working秒数 / 60)
gross = 资源点满员产量 × q
普通领地工人新增维护 = 0（本轮初值；营地维护按既有规则）
```

每建筑容量先为 1；在途、blocked、伤员、无工人均不积累工时。采用周期累计工时而非结算瞬间工人数；产出的小数余量留在建筑，不用逐帧取整吞资源。每周期 q 上限 1，故无限拖延清场不能无限生产；终局直接结束不补发普通天亮收益。具体结算次数继续由战役规则给出，不能假设五夜就有五次收获。

回本按资源向量计算。仅平衡分析时用显式影子价格转换，游戏内不提供任意资源兑换：

```text
K = Σ(影子价格[r] × 新增资源成本[r])
  = 占地 + 建筑 + 必要新增防御 + 可计价的劳动力机会成本
N = Σ(影子价格[r] × (新增产出 - 新增维护 - 预计新增维修)[r])
回本周期 = K / N（N > 0；否则标为无法靠经济回本）
剩余价值 = 一次性真实收益 + 剩余收获次数 × N - K
```

初测暂用木/石/金/食物的影子价格都为 1，只是比较标尺。例：两格扩地 8 金 + 林场 8 木/2 石/4 金，总计 22；满周期产 12 木，新增维修预计 2 木/1 石，净值 9，回本约 2.44 周期。若还必须补一座塔，总成本增至 44，回本约 4.89 周期，此时应通过富矿、多个生产点共用塔、或更紧凑路线改善，不能假装同样值得。

目标：普通资源区在无需独占新塔时 2–3 周期回本；新增完整防线的富资源区 2–3 周期回本；接近终局时允许纯经济扩地失去吸引力，让升级材料与战术射界接手价值。初版不自动发“扩地奖励”，若后续加入一次性开发收益，必须计入 K 且仅首次触发。

## 6. 给 Cursor 的分阶段执行任务

阶段依赖为 Phase 1 → Phase 2 → Phase 3 → Phase 4。每阶段通过后报告文件、命令、通过项与未解决项；有失败先定位，不通过删怪、传送工人、忽略碰撞或替换截图来过关。

### Phase 1：阵营寻路、居民停靠、地形射线（先完成这一阶段）

**文件：** 创建 v0.29 HTML、`tests/helpers/v029-vm.cjs`、`tests/v029-navigation.test.cjs`。本阶段测试可在内存构造墙边/门段，不依赖 Phase 2 的自动边界生成。

**产出接口：** `movementProfile/canStand/canTraverse/findPathFor/hasLineOfSight/assignWorker/stepWorker`；新地形 cover 与工作位预约结构。

#### P1-A · 拆分导航和真实移动

- [ ] Action 1：从实际基线派生 v0.29；增加 VM 启动 helper，测试只加载 v0.29，支持固定 seed、模拟时间与独立状态。
- [ ] Action 2：先写失败用例：同一森林/山脉格己方可站可穿、敌军不可站不可穿；水域双方阻挡；同一墙边双方阻挡、门边只放己方；对角不穿角。
- [ ] Action 3：实现 cover 与 ground 分离，以及三层谓词（地形、建筑、跨边）。修改 `canOccupy/moveWithCollision/findApproachPath` 的调用链，全部显式携带 actor；移除依赖默认 walkable 的隐式阵营推断。四邻寻路与连续小步必须使用同一 canTraverse。
- [ ] Action 4：重写连通性校验：己方验证主城服务位→门→资源 dock；敌军验证出生入口→合法外墙攻击位。生成修复只能确定性开道路，不准因己方要过森林就清掉森林，不消耗卡牌 RNG。
- [ ] Action 5：运行 `node --test tests/v029-navigation.test.cjs`，P1-A 用例通过；验证 dt=0.016/0.05/0.2 不穿墙或穿山。

#### P1-B · 修居民到岗与卡死

- [ ] Action 1：先写失败用例：实体中心不可作工作位；null 路径不能算到岗；两个工人不预约同一个独占 dock；站位变化不能直接插值穿墙；一秒无进展进入 blocked；道路恢复后自动重试。
- [ ] Action 2：`findResidentSlot` 返回合法位或 null，删除“没有候选就用建筑中心”和“无合法位仍返回首项”的回退。槽位预约前验证可达，拆除/调岗/死亡时释放。
- [ ] Action 3：travel 与站位调整统一走 `stepWorker`→`moveWithCollision`；原静止态的直接 x/y 插值改为导航移动。居民更新优先处理 dead/受伤恢复/护送/既有营地在途任务，再处理 work，最后处理 home 站位；有 work 的居民不能再执行旧 home 插值。assignWorker 仅接受可工作且无营地任务的居民，受伤/召回/死亡时取消工作与预约。
- [ ] Action 4：连续 1 秒无位移进入 blocked，每 0.8 秒或 navigation revision 改变后重算；无路时原地合法等待、零产出。建筑删除时取消任务并释放预约，回到合法待命状态。
- [ ] Action 5：增加工作位到达误差 ≤0.085、工时仅 working 积累、路径失效后不提前收费的断言；运行本阶段测试全部通过。不得宣称这已完成真人环境 Bug 根因验证，浏览器还需 Phase 4 复验。

#### P1-C · 箭塔 LOS 与箭矢遮挡

- [ ] Action 1：先写直线遮挡、斜线擦角、距离内但隔山、无障碍、移除 cover 后恢复射线的失败用例。
- [ ] Action 2：实现 supercover 射线；森林/山脉阻挡，透明草地/道路不阻挡。箭塔源点所在 pad 首版限定无 cover、无水的格。探索迷雾的 visible 不可代替 LOS。
- [ ] Action 3：`fireTowers` 同时筛选存活、范围和 LOS；普通箭矢的视觉弧线不豁免地形。每个飞行子步检查上一点→下一点扫掠段，撞到 cover 即销毁且不伤敌，防低帧率穿山。
- [ ] Action 4：测试移动目标躲入林后、射线缓存失效、同一箭不重复结算。运行 `node --test tests/v029-navigation.test.cjs` 全部通过后记录 Phase 1 交付。

### Phase 2：领地外框、城门、共享墙血与塔资产

**文件：** 修改 v0.29 HTML；创建 `tests/v029-boundary.test.cjs`。

**消费接口：** Phase 1 的阵营导航与射线。**产出接口：** `buildBoundary/previewExpansion/commitExpansion/damageWall/collapseWall/deployPendingTower`。

#### P2-A · 生成外框并接入碰撞

- [ ] Action 1：先测 1 格领地周长=4、2×2 领地周长=8、L 形正确、对角不连通及封闭孔洞被拒绝；地图边缘不越界。
- [ ] Action 2：实现外部 flood-fill，提取“已占格→外部未占格/地图外”的边；edgeId 使用规范化端点 ID，不能依赖遍历顺序。派生可部署 pad，过滤门通行格、cover、水、实体和预约 dock。
- [ ] Action 3：建城时初始化共享墙血与合法门，城堡/居民在合法内侧服务位生成。删除玩家自由拼 wall 的模型入口，用 canTraverse 检查脚底圆沿连续运动段与阻挡边的扫掠，不让塔所在整格承担墙碰撞；门净宽必须容纳己方脚底直径。
- [ ] Action 4：完整墙时，`calculateRoutes` 从可达的外侧攻击位生成敌军流场；自然障碍不可作为可拆墙。每边 1 攻击位、后排排队；禁止通过城堡半径判定隔墙打主城。
- [ ] Action 5：验证己方点击/键盘/居民仅经门跨境，敌军不能跟着穿门；墙破后可跨任意已消失墙边。运行 `node --test tests/v029-boundary.test.cjs`。

#### P2-B · 原子扩地与待部署塔

- [ ] Action 1：先测扩地不改 hp/maxHp；旧塔变内部后保留 ID/等级/冷却/投入；仍在合法边界的塔保持部署；失败扩地不扣费不挪塔。
- [ ] Action 2：preview 构造候选领地、边界、门、pad、塔状态；验证旧门保留或确定性移动。若单位位置被候选墙/塔碰撞切入、把活敌圈入领地，或主城、现存工作位失去己方门路径，拒绝该次扩地；不瞬移救场。敌军出生点校验为领地外且到至少一个外墙攻击位可达。
- [ ] Action 3：commit 检查预览 revision、资源与白天状态，再一次提交 owned/边界/门/塔，并递增导航和遮挡版本。所有校验通过前不扣费，不用“先改 game 再尝试回滚”。
- [ ] Action 4：部署 pending 塔需完整墙与白天，保留 ID 与冷却，不耗资源或行动；占用 pad 冲突、门通道、夜间、过期预览都返回明确失败原因。
- [ ] Action 5：测试重复部署不能复制塔、反复扩地资产守恒、城门重定位可达、在途居民重算路线。运行边界和导航两个测试文件全部通过。

#### P2-C · 全圈破墙的原子事件

- [ ] Action 1：先测两个不同边段承伤合并同一 hp；一次致命攻击令所有墙边在该子步失效；deployed 塔全 destroyed、pending 保留。
- [ ] Action 2：把旧 `block.hp -= blow` 全部接入 damageWall；collapseWall 幂等，销毁塔只计一次损失，不修改已发箭矢。同步使全部敌军路线重算指向主城；普通怪、攻城怪、BOSS 均走这条调用链。
- [ ] Action 3：测试重复 collapse 无重复奖励/损失，旧 tile.building 不残留可攻击塔或墙碰撞，破墙后无复活射击。运行导航与边界测试全过，提交 Phase 2。

### Phase 3：六秒施工、两击主城、真实生产与数值迁移

**文件：** 修改 v0.29 HTML；创建 `tests/v029-combat.test.cjs`、`tests/v029-economy.test.cjs`、`tests/v029-balance.cjs`。

**消费接口：** Phase 1–2。**产出接口：** `repairWallDay/startNightRepair/stepNightRepair/damageCastle/developProduction/settleProductionAtDawn`。

#### P3-A · 修墙状态机与攻城预警

- [ ] Action 1：先测缺 400 血白天扣 8 木/4 石并满血；材料不足无副作用；夜间一次、持续恰好 6 秒、暂停不走；破墙后停止回血且不退费。
- [ ] Action 2：按第 5 节实现维修报价、开工原子扣费、夜间 usedNightId。施工与领主移动无绑定，是主城工程，领主走位不打断。
- [ ] Action 3：战斗用 0.05 秒固定模拟子步与 accumulator。每子步先结算已到时投射物/敌方攻击，立即处理墙破与败局，再执行仍有效的施工回血。真实帧较大时累积处理，不把整个长帧先回血；暂停时不积累待补模拟时间。
- [ ] Action 4：主城改两次耐久；旧 `castleHp/castleMax` 的伤害、维修、升级和卡牌全部迁移到新语义。原增主城血的卡改为明确的城防科技（增墙上限、不给当前血），在文案和测试中同步；首版全局主城受击间隔 1 秒。
- [ ] Action 5：攻城怪从波次 schedule 提前 10 秒产生固定预警事件，UI 在 Phase 4 展示。预警只发一次、不消耗额外 RNG；若开局第一只攻城怪不足 10 秒预告，将其排程后移至至少第 10 秒，而非出生后补预警。
- [ ] Action 6：测试致命攻击与第 6 秒同刻、单个长帧跨完整施工、两怪同帧打主城、墙完整时隔墙伤害被拒绝、旧箭矢在墙破后仍至多命中一次。运行 `node --test tests/v029-combat.test.cjs` 全过。

#### P3-B · 开发建筑与工作工时结算

- [ ] Action 1：先测资源类型匹配、至少一个可达 dock、工人不在岗零产出、空路线零产出、同一资源点只建一次且不与营地重复计入。
- [ ] Action 2：用 developProduction 替代只设 node.developed 的实现；在一笔事务中支付 wood/stone/gold、创建建筑、清除原 cover、保留资源 node 元数据、更新导航和遮挡版本。资源点若位于当前墙 pad，先拒绝开发并提示扩地使其成为内部生产位，避免占用墙塔/门。
- [ ] Action 3：整合 Phase 1 工作任务；按 60 秒真实工作计满一周期，dawn 按 cycleId 仅结算一次，产出小数余量进入账本，营地维护沿用原规则且不重复扣款。无效或已拆建筑不产出，终局不伪造收获。
- [ ] Action 4：将旧 material 的每个来源/支出迁入唯一 v029 balance 配置，逐项检查 repair/build/rework/salvage/camp/events/contracts/rewards/cards/reporting。拆除回收按 invested 的分类比例计算、默认普通资源 40%，防止 wood/stone 来回套利；稀缺回收沿用实际既有规则并明确记录。
- [ ] Action 5：测试半周期 30 秒得到 50% 毛产出、两次 dawn 去重、营地维护不重复扣款、拆建筑释放预约、清 cover 后箭塔射线恢复且建筑自身仍不可站、物资不足开发不改地形。运行 `node --test tests/v029-economy.test.cjs` 全过。

#### P3-C · 先验证经济循环，再开放 UI 改造

- [ ] Action 1：创建无浏览器同种子模拟，至少 seeds 7/42/99，分别测试缩城、紧凑扩张、狭长抢矿、口袋阵四种脚本策略。输出相同初始资源、夜次、建造投入及每路敌军配置；不是只比较最终胜负。
- [ ] Action 2：记录 P、塔数/密度、墙损/修复、警戒到破墙时间、工作位受阻秒数、资源净流量、回本预测与实际收获次数；产物仅写 v029 目录。
- [ ] Action 3：对确定性不变量设断言（账本闭合、同种子同脚本同结果、无非法穿越、无永久无路残敌）。若策略长期无优势或首夜不可行，报告具体指标并调整配置，不能删除待部署/施工/LOS 来凑胜率。
- [ ] Action 4：运行 `node tests/v029-balance.cjs`。报告 12 组模拟，明确脚本决策有偏、不等于真人平衡结论；全部底层断言通过且首夜有合法可行建设路径后才进入 Phase 4。

### Phase 4：接 UI、真实浏览器验收与交付

**文件：** 修改 v0.29 HTML；创建 `tests/v029-ui.test.cjs`、`tests/v029-browser.cjs`、v0.29 更新说明；最后更新 README 当前入口。

#### P4-A · 在既有命令接口上组装 UI

- [ ] Action 1：先写 UI 契约用例：指定顶栏字段存在、主城面板修墙命令绑定正确、夜间按钮状态取自 wall.repair、底栏 pending 数取自 towers、卡牌仍为三选一。
- [ ] Action 2：顶栏按“金币/木材/石料/人口/行动力/天数”；食物与 rare 在资源详情可查，消费前能看见余额/缺口，不以旧 material 代替新资源。
- [ ] Action 3：左侧图例明确区分“敌军不可通行/遮挡箭塔”与“己方可穿”，小地图绘制领地、完整墙、门、预警方向。破墙后下一帧即消失墙视觉。
- [ ] Action 4：右侧呼出主城面板显示共享墙 hp/max、白天修满报价、夜间材料费/6 秒进度/每夜次数/失败原因；破墙后主城显示 2/2、1/2 次耐久。按钮只调用模型接口，不在 onclick 内扣血扣资源或重置计时。
- [ ] Action 5：底栏为扩地、建生产建筑、新建塔、部署待部署塔；扩地预览显示 ΔP、迁塔数与门变化；去除拼段建墙入口。中间卡牌复用暂停逻辑，选择后继续原施工剩余时间。
- [ ] Action 6：运行 `node --test tests/v029-ui.test.cjs`；模型和视图读写分离，不用 DOM 文本反向充当游戏状态。

#### P4-B · 真实输入与闭环验证

- [ ] Action 1：用浏览器实际走完“建城→建生产建筑→派工经门到岗→产出→扩地→旧塔待部署→迁塔→夜间预警→6 秒修墙”。测试在可见 DOM 状态变化后再断言，不复用旧脚本点击后立刻读 DOM 的时序缺陷。
- [ ] Action 2：构造并观察破墙场景，断言下一模拟步全墙消失/已部署塔销毁、敌军重新寻路、主城两次有效命中结束；另测天亮重建墙不复活塔。
- [ ] Action 3：至少验收 1440×900、1920×1080、932×430、390×844，记录浏览器 pageErrors、布局溢出、命令实际生效及卡牌暂停。截图/JSON 写 `tests/artifacts/v029/`；runner 失败必须非零退出。
- [ ] Action 4：运行以下完整检查（新文件需由对应阶段实现）：

```powershell
node --test tests/v029-navigation.test.cjs tests/v029-boundary.test.cjs tests/v029-combat.test.cjs tests/v029-economy.test.cjs tests/v029-ui.test.cjs
node tests/v029-balance.cjs
$env:CHROME_BIN='C:/Program Files/Google/Chrome/Application/chrome.exe'
node tests/v029-browser.cjs
```

- [ ] Action 5：更新 README 和 v0.29 更新说明，区分自动化、AI 浏览器操作与真人试玩；附配置变化、已知问题、实际运行命令和失败项。不要求 v0.29 与 v0.26 战役结果逐值一致，旧测试中“树石阻挡己方/独立墙血/资源自动生产”等断言属于被替换规则，保留旧文件并为 v0.29 建对应新断言。

## 7. 最终验收清单

- [ ] 己方可穿树石且只经完整城墙的门；敌军不能穿树石和完整门墙。
- [ ] 普通箭塔在射程内也不能隔森林/山脉攻击，箭矢不会低帧率穿透。
- [ ] 任何墙边承伤扣同一血条；破墙原子移除全圈视觉/碰撞并毁已部署塔。
- [ ] 扩地不回血、不增墙上限、不复制塔；待部署免费迁移且保留升级和冷却。
- [ ] 白天按缺血精确付费补满；夜间一次、真实持续 6 秒，破墙优先于回血。
- [ ] 主城两次有效接触命中败局，BOSS 不绕开墙或修改此次数。
- [ ] 开发资源必须有建筑、清除原 cover；农民真实经门抵达预约 dock 才工作。
- [ ] 无路居民原地等待并恢复重试，领地生产按真实工时结算，既有营地维护无重复，账本闭合。
- [ ] UI 全部调用模型命令，暂停/卡牌/重开不会刷新施工次数或复制资产。
- [ ] 单 HTML 离线运行，新增验收证据完整，历史版本和用户已有改动保留。

## 8. 首轮修改优先级

P0：阵营路径与碰撞一致 → 居民真实停靠 → LOS → 边界/城门 → 共享墙血/塔迁移。

P1：施工与两击主城 → 生产工时与 wood/stone 迁移 → 同种子经济和战斗压力验证。

P2：UI 布局与反馈 → 浏览器自然输入 → 真人试玩。若 P0/P1 未通过，Cursor 停留在所属阶段修复，不提前用 UI 展示代替底层完成。
