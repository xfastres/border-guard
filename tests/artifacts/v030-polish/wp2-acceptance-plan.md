# WP2 · 验收用例计划（QA）

> 文档类型：**验收用例 / 待执行清单**，不是执行报告，不含任何实测结论。
>
> ⚠️ **WP5 口径订正（2026-11-16，主理人）**：本文 §3.4 的「8 文件基线 77/77」是 WP2 时期的**静态 `test(` 声明统计**，不是执行结果，现已作废。有效基线由实跑确定：`node --test` 八个 `*.test.cjs` = **72 项**（WP3 +3、WP4 +8），计划 §4.1 六文件 = **48 项**，`v027-balance` 10/10、`v028-priority` 6/6。下文所有 `77` / `≥77 + 新增` 一律按此订正；判据以 `docs/v030-polish-report.md` 与 `docs/v030-polish-progress.md` 为准。**测试纪律（不得删断言/放宽阈值）不变**。
> 编写：quality-lead（严守真） · 任务 WP2-QA-PLAN-01 · 团队 `border-guard-v030-polish`
> 状态：**本轮只做规划**。未启动/操作任何 Chrome、未跑 `cdp.cjs`、未执行任何测试、未做任何 git 写操作、未动 `vp.json`。
> 依据：`docs/v030-handoff-plan.md` §2 / §3 WP2 验收 / §4.1 / §4.2 / §4.3 / §5；`tests/artifacts/v030-polish/wp2-ux-spec.md`（design-strategist，651 行，§10 为验收项↔规格条款映射）。
> 基线：计划以 `cd4437a` 为断言比对基准；WP2 实现前的 HEAD 为 `0b9e024`（WP1-FIX-01 光照能力检测修复）。engineering-lead 的 WP2 实现提交后，**执行前必须重新核对 HEAD 与行号**（规格 §0 已声明行号可能偏移，一律以函数名定位）。
> 不提交本文件；由主理人在 WP2 收尾提交统一纳入。

---

## 0. 本轮已采信的裁定（主理人 / 用户拍板，验收时按此判定，不再复议）

| 编号 | 裁定 | 对验收的直接影响 |
|---|---|---|
| **P1** | 提示链统一为 **6 条固定文案**，去掉「未建城」3 条细分与 `MOBILE()` 分支 | 6 张 `guide-*.png` 一一对应 6 条；任何细分文案或触控变体判 FAIL |
| **P2** | 该侧 **建 1 座塔即进入 S6 完成态，0 座才提示 S5** | 第 5→6 步只需真实建 1 座塔；建 2 座仍必须是 S6，不得回退到 S5 |
| **P3** | 该侧合法格不足 2 个时 **只减少金色虚线圈数量，不改文案**；0 个合法格时 S5 文案原样 | 该场景 PASS 条件是「文案逐字正确 + 无非法格高亮」，**不是**「必须有 2 个圈」 |
| **P4** | 失败诊断 **两处都出现**（`goal` 段落的 `nextRunHint()` + `#primary .diagnosis` 复盘面板），**验收以 `#primary .diagnosis` 面板为准** | 只查 `goal` 段落不算通过；面板需有「败局诊断」首行 |
| **P5** | 「未建城 + 卡牌待选」异常同时成立时 **未建城（S1）优先** | 构造该异常态时 `#mapHint` 必须是 S1 文案且带 `.next` |

其余口径沿用规格：悬停仅限 mouse、推荐格取 `entrances(game.day)[0]` 最近 2 个合法格且只绘制不建造、徽章 `👤N`/灰色「空」、详情「建筑名 + 坐标」且「改派到…」按钮保留坐标、DPS 用最近 5 秒、低于 30 秒标红 `critical`、ledger 三字段「只增不改」、诊断模板逐字。

---

## 1. 六张 `guide-*.png` 的真实操作序列（最重要）

### 1.0 通用纪律（每一步都适用，违反即整条判 FAIL）

1. **只用真实输入**：动作一律用 `cdp.cjs` 的 `clicktext` / `clicksel` / `click` / `tile` / `tiletap` / `key` / `wait` / `shot`。
2. **禁止 `eval` 改状态**：`eval` 只允许**只读**用途——读 `#mapHint.textContent`、读 `classList`、读 `game.day/phase/mode/cardPending/cardModal`、枚举候选格坐标、调用纯函数（如 `entrances()` / `worldToScreen()` / `recommendedDefenseTiles()`）并仅返回数据。**任何赋值、任何会改变 `game` 的函数调用（如 `chooseSite()` / `develop()` / `assignWorker()` / `startNight()` / `pickGrowthCard()`）一律禁止**（WP5 自然试玩纪律同样适用于引导链验收）。
   - 区分口诀：**「`eval` 读，输入做」**。读坐标用 `eval`，点格子用 `tile`，点按钮用 `clicktext`。
   - 严格解释下若要求完全不出现 `eval`：则改为从截图目视确认文案（图像查看工具）、从截图目视定位资源/推荐格；但 `cdp.cjs` 的 `tile` / `clicktext` / `clicksel` 内部本就含只读 `Runtime.evaluate`，属工具实现，不算玩家输入改状态。
3. **等待真实时钟**：所有推进只用 `wait <ms>`；点击后 **≥150 ms** 再读 DOM；切换视口后 **≥400 ms**（`cdp.cjs` 已内置）。禁止 `eval` 快进时钟、禁止改 `game.phase/clock`。
4. **永远用 `open` 新 tab 进游戏**（`beforeunload` 会卡死）；每次重开一局必须是新的 `open`，不要刷新。
5. **每步三件套**：`wait` → 只读断言 `#mapHint` → `shot`。断言表达式模板（只读）：
   ```
   eval (()=>{const h=document.getElementById('mapHint');return {text:h.textContent,next:h.classList.contains('next'),arrowsInText:(h.textContent.match(/▶/g)||[]).length,phase:game.phase,day:game.day,mode:game.mode,cardPending:game.cardPending,cardModal:game.cardModal}})()
   ```
   期望：`text` 逐字等于第 1.1 表对应文案；`next === true`；`arrowsInText === 0`（箭头由 CSS `.next::before` 提供，恰好 1 个，不得手写 `▶` 造成双箭头）；`day===1 && phase==='day' && mode===null`。
6. **截图命名与路径**：`D:/Work/game/border-guard/tests/artifacts/v030-polish/guide-1.png` … `guide-6.png`。全部桌面 1440×900（非触控），除非第 6.3 节另行要求。
7. **失败即停**：某步文案不符，保留现场截图与控制台输出，回传主理人，不得改断言、不得放宽、不得用夹具绕过。

### 1.1 六步文案对照表（逐字，含全角标点与连接号）

| 步 | 状态 | `#mapHint` 期望文案（逐字） | `.next` |
|---|---|---|---|
| S1 `guide-1.png` | 未建城 | `从底部选 A 或 B 前往探路` | true |
| S2 `guide-2.png` | 卡牌待选 | `先选择一项开局强化` | true |
| S3 `guide-3.png` | 无开发 | `点领地内带金色 + 的资源点，开发成生产建筑` | true |
| S4 `guide-4.png` | 有建筑但无工人 | `点生产建筑，派遣居民去工作` | true |
| S5 `guide-5.png` | 敌袭方向没有箭塔 | `今夜敌军从西侧来：在该侧城墙内建 1–2 座箭塔` 或 `今夜敌军从东侧来：在该侧城墙内建 1–2 座箭塔` | true |
| S6 `guide-6.png` | 完成 | `准备好了可以提前入夜` | true |

> **易漏**：S5 的 `1–2` 是 **U+2013 短破折号 `–`**，不是 ASCII `-`；冒号是**全角 `：`**；「西/东」必须按本局 `entrances(game.day)[0]` 的 `gate.x < 16` 实际结果取字，**不得硬编码为「西」**。文案里不含 `▶`。

### 1.2 逐步操作序列（单条 `cdp.cjs` 命令链，用 ` ;; ` 分隔；参数整体加双引号）

**准备（不计入 6 张截图）**
```
open 1440 900
clicktext 普通难度
wait 600
```
- `open 1440 900` 新建 tab 并导航到 `file:///D:/Work/game/border-guard/Border-Guard-v0.29.html`，内置 1500 ms 等待。
- `clicktext 普通难度` 命中开局对话框按钮「普通难度 · 开始守卫」（detail「推荐第一次试玩」），点击后对话框关闭、`game.started=true`。输出应打印 `clicked [720,487.625,"普通难度 · 开始守卫推荐第一次试玩"]`（坐标随视口/版本可微调，以打印文本含「普通难度」为准）。
- 若输出 `NOTEXT 普通难度`：说明对话框未就绪，追加 `wait 800` 后重试；仍失败即回传阻塞。

---

#### S1 · `guide-1.png` · 未建城

| # | 命令 | 等待 | 预期 |
|---|---|---|---|
| 1 | `eval <1.0 只读断言>` | — | `text='从底部选 A 或 B 前往探路'`、`next=true`、`day=1`、`phase='day'`、`mode=null` |
| 2 | `shot D:/Work/game/border-guard/tests/artifacts/v030-polish/guide-1.png` | — | 图上底栏为「前往 A · 西岭台地 / 前往 B · 东溪盆地」，地图 A/B 旗标可见 |

**推进到 S2（真实输入）**
```
clicktext 前往 A
wait 2500
clicktext 查看 A
wait 400
clicktext 在此建立城堡
wait 500
```
- `clicktext 前往 A` → `setDestination()` 令领主走向 A 城址 `(5,4)`；`DEMO.walkSpeed=3.5` 格/秒，起点 `(8.5,5.5)`，直线约 3.6 格，**2500 ms 足够**。`scout()` 在领主靠近时把城址格 `visible=true`。
- 若 `clicktext 查看 A` 打印 `NOTEXT`：说明 A 仍未探明，追加 `wait 1500` 再试；最多 2 次。按钮文案会在 `tile.visible` 后由「前往 A · 西岭台地」变为「查看 A · 西岭台地」。
- `clicktext 查看 A` → 打开城址详情（`openInspector`），面板出现金色按钮「在此建立城堡」。
- `clicktext 在此建立城堡` → `chooseSite(0)`：建城、生成整圈城墙、`offerGrowthCards()` 置 `game.cardPending=true`、`starterCardsOffered=true`。**注意：卡牌浮层此时不会自动打开**（`showCards()` 需玩家点「选择强化 / 选择主城强化」），因此 `cardModal===false`，正是 S2 的可截图窗口。
- 输出应见横幅「城堡落成」。

---

#### S2 · `guide-2.png` · 卡牌待选

| # | 命令 | 等待 | 预期 |
|---|---|---|---|
| 1 | `eval <1.0 只读断言>` | — | `text='先选择一项开局强化'`、`.next=true`、`cardPending=true`、**`cardModal=false`** |
| 2 | `shot .../guide-2.png` | — | 顶栏 `#alertBar`「主城成长 · 强化可选」+ 金色「选择强化」按钮；`primary`「选择主城强化」按钮 |

> **⚠ 本链最易漏验点**：`guide-2` **必须在点「选择强化」之前截**。一旦 `showCards()` 打开 `#cardOverlay`，`game.cardModal=true`，按规格 §2.4 让位表 `tutorialStep()` 返回 `null`、`#mapHint` 变成 modes/操作提示、`.next` 被移除——这是**预期让位而非缺陷**，但会把 S2 窗口错过。顺带留一张 `guide-2-modal.png`（非 6 张之一）记录「模态期间 `.next=false`」的让位证据。

**推进到 S3（真实输入）**
```
clicktext 选择强化
wait 400
clicksel #cardRow button
wait 500
```
- `clicktext 选择强化` 命中 `#alertBar` 按钮（或改用 `clicktext 选择主城强化` 命中 `primary` 按钮）→ `showCards()`，`cardModal=true`，`#cardRow` 生成 3 张卡。
- `clicksel #cardRow button` 点第 1 张卡（每张卡含「选择」字样）→ `pickGrowthCard()` 置 `cardPending=false`、`endCardModal()` 置 `cardModal=false`。**任意一张卡均可**（「工匠值夜」会 +120 墙耐久，不影响提示链）。
- 确认浮层已关闭（只读 `eval`：`document.getElementById('cardOverlay').hidden === true`）。

---

#### S3 · `guide-3.png` · 无开发

| # | 命令 | 等待 | 预期 |
|---|---|---|---|
| 1 | `eval <1.0 只读断言>` | — | `text='点领地内带金色 + 的资源点，开发成生产建筑'`、`next=true`、`cardPending=false`、`cardModal=false` |
| 2 | `shot .../guide-3.png` | — | 领地内资源点带金色 `+` 标记；S3 目标有高亮 |

**推进到 S4（真实输入）** — 需要开发一个资源点
```
eval (()=>{const out=[];for(const t of game.tiles){if(t.owned&&t.node&&!t.node.developed&&t.visible){const p=worldToScreen((t.x+.5)*CELL,(t.y+.5)*CELL);const hit=document.elementFromPoint(p.x,p.y);out.push({x:t.x,y:t.y,kind:t.node.kind,sx:Math.round(p.x),sy:Math.round(p.y),hit:hit&&(hit.id||hit.tagName)})}}return out.slice(0,8)})()
```
- 这是**只读枚举**：返回 owned / 已探明 / 未开发资源点的格坐标、屏幕坐标、该点 DOM 命中元素。
- 从返回值挑一个 `hit` 为 `map` / `board` / `mapWorld`（未被 HUD 面板遮挡）的候选，记下 `<x> <y>`。
- 若返回空数组：用 `tile <附近空地格>` 让领主再走一小段以 `scout()` 揭示更多格（`tile` 是真实点击），`wait 1500` 后重新枚举；最多 2 次。仍无候选即回传阻塞（不得用夹具补 `visible`）。
```
tile <x> <y>
wait 400
eval (()=>({panel:!!game.panel,hasDevelop:[...document.querySelectorAll('button')].some(b=>b.textContent.includes('开发资源点'))}))()
clicktext 开发资源点
wait 700
```
- `tile <x> <y>` 为**真实鼠标点格心**；命令输出 `tile x y -> sx sy hit=...`，`hit` 必须是地图元素，若命中面板则换候选。
- 点资源点会打开详情面板（既有 v029-ui 第 8 条「资源贴边点击时打开详情」已保证），面板内有「开发资源点」按钮；只读断言 `hasDevelop===true` 后再点。
- `clicktext 开发资源点` → `develop(t)`：`clearTileCover` 清旧自然图标、`t.node.developed=true`、生成对应生产建筑、扣 2 材料与 1 次白天行动。初始资源 `gold:14, material:30, actions:7`，足够。
- 等待 700 ms 让 `structure()` / 徽章 / `tutorialStep()` 刷新。

---

#### S4 · `guide-4.png` · 有建筑但无工人

| # | 命令 | 等待 | 预期 |
|---|---|---|---|
| 1 | `eval <1.0 只读断言>` | — | `text='点生产建筑，派遣居民去工作'`、`next=true` |
| 2 | `shot .../guide-4.png` | — | 该生产建筑右上角为**灰色「空」徽章**（N=0），与提示一致 |

**推进到 S5（真实输入）**
```
tile <x> <y>
wait 400
eval (()=>({panel:!!game.panel,dispatch:[...document.querySelectorAll('button')].filter(b=>b.textContent.includes('派遣居民')).map(b=>b.textContent)}))()
clicktext 派遣居民
wait 2500
```
- 再点同一个已开发格 `<x> <y>`（现在是生产建筑）→ 详情面板列出「派遣居民 1 / 派遣居民 2」按钮（初始 2 名居民）。
- `clicktext 派遣居民` 点第一个 → `assignWorker()`，`assignedResidentIds` 立刻 +1 → `totalWorkers>=1`，S4 退出。
- `wait 2500` 让居民**真实走到**建筑格（不是夹具瞬移），用于后续「工人在格内 + 作业气泡」取证；`DEMO.dispatchSpeed=6`。
- 只读确认：`eval (()=>({workers:[...game.productionBuildings.values()].map(b=>b.assignedResidentIds.length),residents:game.residents.map(r=>({id:r.id,state:r.work&&r.work.state}))})())`。

> **注意 P2/规格 §2.3.4**：S4 的判定是「**所有**已开发生产建筑的派驻总人数 = 0」。本序列只开发 1 处、派 1 人，必然进入 S5；若执行时误开发了多处，仍需确认只派 1 人即可离开 S4（B2 边界）。

---

#### S5 · `guide-5.png` · 敌袭方向没有箭塔

**先只读查询方向与推荐格（不写状态）**
```
eval (()=>{const g=entrances(game.day)[0];const side=g.x<WIDTH/2?'west':'east';const rec=typeof recommendedDefenseTiles==='function'?recommendedDefenseTiles().map(t=>[t.x,t.y]):null;return {gate:g&&[g.x,g.y],side,recommended:rec,towersOnSide:game.tiles.filter(t=>t.building&&t.building.type==='tower').length}})()
```
- 记录 `side` 用于确定 S5 期望文案的「西/东」字；记录 `recommended` 的 2 个（或 1/0 个）格坐标，供下一步真实点击。
- `recommendedDefenseTiles()` 是规格要求新增的**纯函数**（§2.3.5），调用它只读、不改状态；若实现未暴露该函数，则退化为只读表达式自算：`game.tiles.filter(t=>t.owned&&onSide(t)&&canBuildAt(t)&&!t.building)` 并按到 `gate` 距离排序取前 2。

| # | 命令 | 等待 | 预期 |
|---|---|---|---|
| 1 | `eval <1.0 只读断言>` | — | `text` = `今夜敌军从<西|东>侧来：在该侧城墙内建 1–2 座箭塔`（与上面 `side` 一致）、`next=true`、`mode=null` |
| 2 | `shot .../guide-5.png` | — | 地图上有**金色虚线圈**圈住推荐格（P3：数量按实际合法格 0/1/2 个），且与 `drawGates()` 红色脉冲入口**同侧** |
| 3 | `zoom .../guide-5-zoom.png <x> <y> <w> <h> 2` | — | 放大推荐格与入口，确认圈为虚线、不填充、不压主城 |

> **⚠ 第二个最易漏验点**：`guide-5` **必须在选中「箭塔」工具之前截**。`game.mode !== null` 时 `tutorialStep()` 返回 `null`（让位给 `modes[game.mode]`）、`.next` 移除，且 `recommendedDefenseTiles()` 返回 `[]`（金色虚线圈消失）。一旦先点了工具再截图，S5 就永久错过。

**推进到 S6（真实输入，按 P2 建 1 座即进 S6；同时满足「按推荐格建 2 座」）**
```
clicktext 箭塔
wait 250
eval (()=>({mode:game.mode,next:document.getElementById('mapHint').classList.contains('next'),hint:document.getElementById('mapHint').textContent}))()
tile <rec1x> <rec1y>
wait 400
tile <rec2x> <rec2y>
wait 400
key Escape
wait 400
```
- `clicktext 箭塔` 命中命令栏 `BUILDS.tower.label`（"箭塔"，detail「10 材料 · 4 金币」）；输出 `clicked [...]` 文本须含「箭塔」。若同时有「升级箭塔」等按钮干扰，改用 `clicksel '#commandBar button[data-group="build"]'`（`BUILDS` 首项即箭塔）。
- 选中工具后只读断言应为 `mode='tower'`、`next=false`、`hint` 为 `modes.tower` 工具提示（**这是预期让位，不判 FAIL**）。留 `guide-5-toolmode.png` 作为让位证据。
- `tile <rec1x> <rec1y>` 与 `tile <rec2x> <rec2y>` 用**真实鼠标**点两个推荐格（初始 `material:30, gold:14`，开发扣 2 材料后剩 28 / 14；两座塔共需 20 材料 + 8 金币 + 2 次行动，余量充足）。第 2 个点完后金色虚线圈应已消失（`towersOnSide>=1`），但格仍合法可点。
- **`key Escape`** → 既有 L6872 `game.mode=null; sync();` 退出工具态（也可用 `clicksel '#cancelTool'`）。**必须退出工具态**，否则 `.next` 仍为 false，S6 不成立。
- 若 `recommended` 只有 1 个或 0 个（P3 场景）：只点实际可用的合法格；0 个时**不建塔**，改用只读表达式另找一个该侧 `canBuildAt(t)&&!t.building` 的格（若确实 0 个，则记录「文案正确 + 无非法高亮」并回传主理人，判 PASS 但不建塔；此时需说明 S6 无法自然到达，另开一局或由主理人裁定）。

---

#### S6 · `guide-6.png` · 完成 → 提前入夜

| # | 命令 | 等待 | 预期 |
|---|---|---|---|
| 1 | `eval <1.0 只读断言>` | — | `text='准备好了可以提前入夜'`、`next=true`、`mode=null`、`day=1`、`phase='day'` |
| 2 | `shot .../guide-6.png` | — | 无新增高亮，保留 `drawGates()` 入口标；底栏「提前入夜」按钮可见 |
| 3 | `clicktext 提前入夜` | `wait 3500` | `DEMO.earlyNightCountdown=3` 秒；`wait 3500` 后 `phase==='night'` |
| 4 | `eval <1.0 只读断言>` | — | `phase='night'`、`next=false`、hint 为夜间操作提示（提示链不可逆退出） |
| 5 | `shot .../guide-night-transition.png` | — | 非 6 张之一；记录「入夜后 `.next` 已移除」 |

- 已建城时 `clicktext 提前入夜` 不会弹「首日尚未建城」确认框（该框只在 `game.day===1&&!game.castle` 出现），直接 `arm()`。
- 第 4/5 步是**不可逆退出**的关键证据：入夜后提示链永久退出；天亮到 day2 后同样 `next=false`（可在 WP5 自然试玩补证）。

### 1.3 让位规则的补证（穿插在 6 张之外，但必须留痕）

| 情形 | 触发方式（真实输入） | 期望 `next` | 证据名 |
|---|---|---|---|
| 选中工具 | `clicktext 箭塔` | false，hint = `modes.tower` | `guide-5-toolmode.png` |
| 卡牌模态 | `clicktext 选择强化` | false | `guide-2-modal.png` |
| 入夜 | `clicktext 提前入夜` + `wait 3500` | false | `guide-night-transition.png` |
| 胜利 / 失败 / day2 | 由 WP5 自然试玩覆盖 | false | WP5 报告 |

---

## 2. 悬停预览验收（§3 WP2 第 1 条 / §4.3 第 3 条）

### 2.0 执行前必须解决的 harness 前置（**否则无法验**）

`D:/Work/game/bg-scratch/cdp.cjs` 现有命令为 `open / size / evalfile / eval / click / rclick / clicksel / clicktext / tile / tiletap / tap / key / wait / zoom / shot`，**没有「只移动鼠标不按下」的命令**；而悬停预览必须触发 `pointermove`（`pointerType==='mouse'`），`click` / `tile` 都会附带 `mousePressed`/`mouseReleased`，会真的建塔或走路，不能用于悬停。

**执行阶段在 `bg-scratch/cdp.cjs`（仓库外工具，非游戏代码、非仓库文件）新增一个 `move x y` 分支**（与 `click` 并列，只发 `mouseMoved`）：
```js
} else if (cmd === 'move') {
  const [x, y] = a.map(Number);
  await c.send('Input.dispatchMouseEvent', {type:'mouseMoved', x, y});
  await delay(150);
}
```
- 这是**测试驱动工具的扩展**，不改游戏代码、不改断言、不改仓库文件；执行前需在报告中登记该改动及原因。
- 若不允许改 `cdp.cjs`，退路是单独写一个 `bg-scratch/hover.cjs`，直接用 CDP `Input.dispatchMouseEvent({type:'mouseMoved'})` 发真实鼠标移动（仍不是 `eval` 改状态）。二选一，**不得**用页面内 `dispatchEvent(new PointerEvent(...))` 冒充真实鼠标（不满足「真实输入」且 `isTrusted=false`）。

**状态更新（WP2-QA-PLAN-01 后续，主理人裁定后）**：主理人已**批准**此项仓库外工具增强。已按边界执行完毕，**仅新增 `move x y` 分支**、其余命令行为与所有等待时长/断言逐字节未变：
- 备份：`D:/Work/game/bg-scratch/cdp.cjs.bak`（改前与 `cdp.cjs` 逐字节一致，8853 B）。
- 改动：`diff -u cdp.cjs.bak cdp.cjs` 唯一 hunk 为 `@@ -64,6 +64,11 @@`，新增 5 行（`move` 分支 + 1 行注释）；改后 9128 B；`node --check cdp.cjs` 语法通过（纯解析，不执行文件、不启动浏览器、非测试）。
- 只发 `Input.dispatchMouseEvent {type:'mouseMoved'}`（真实可信鼠标移动，`isTrusted=true`），**不**发 press/release；`move` 分支自带 150 ms 等待，命令链中另按 §2.1 `wait 250` 再读 DOM。
- 两文件均在 `bg-scratch/`（仓库外），**不入库**；`cdp.cjs` / `cdp.cjs.bak` 均不得放进仓库。
- 需在 **WP5 报告「测试工具增强」一栏**如实标注：非游戏改动、不入库、用途为悬停预览验收。
- 本轮操作**未按**执行阶段处理：未启动 9333、未执行任何浏览器操作、未跑测试、未做任何 git 写操作。

### 2.1 操作步骤（桌面 1440×900，`open 1440 900`，非触控）

```
open 1440 900
clicktext 普通难度
wait 600
clicktext 前往 A
wait 2500
clicktext 查看 A
wait 400
clicktext 在此建立城堡
wait 500
clicktext 选择强化
wait 400
clicksel #cardRow button
wait 500
clicktext 箭塔
wait 250
```
（建城到选卡可复用 §1.2 同一链；**不要**重开一局用夹具，保持真实输入。）

**只读挑格**：
```
eval (()=>{const legal=[],illegal=[];for(const t of game.tiles){const p=worldToScreen((t.x+.5)*CELL,(t.y+.5)*CELL);if(p.x<8||p.x>1432||p.y<8||p.y>892)continue;const hit=document.elementFromPoint(p.x,p.y);if(!hit||!['map','board','mapWorld'].includes(hit.id||hit.tagName))continue;const ok=toolTileState(t)==='ok';(ok?legal:illegal).push({x:t.x,y:t.y,sx:Math.round(p.x),sy:Math.round(p.y),kind:ok?'legal':'illegal',reason:t.node?'node':t.building?'building':t.ground})}return {legal:legal.slice(0,6),illegal:illegal.slice(0,6)}})()
```
- `toolTileState(t)` 是既有纯函数（§2.5 要求复用，不得另写口径）：`canBuildAt(t) && !t.building` → `'ok'`；含资源点 `t.node` / 已有建筑 / 水面 / 道路的格为非法。
- 挑一个 `legal` 与一个 `illegal`，记录 `<sx,sy>` 与 `<gx,gy>`。

| # | 命令 | 等待 | 预期 | 截图 |
|---|---|---|---|---|
| 1 | `move <legal.sx> <legal.sy>` | `wait 250` | 只读 `eval (()=>({hover:game.hoverTile,expected:at(<gx>,<gy>),mode:game.mode})())` → `hover === expected`（**索引，不是对象**），且 `typeof hover==='number'` | `hover-legal.png` |
| 2 | `zoom .../hover-legal-zoom.png <sx-70> <sy-70> 140 140 3` | — | 该格 **金框 `#fff3a0`、无斜线**；所有合法格整体金色高亮 | — |
| 3 | `move <illegal.sx> <illegal.sy>` | `wait 250` | `hover === at(<gx>,<gy>)` | `hover-illegal.png` |
| 4 | `zoom .../hover-illegal-zoom.png <sx-70> <sy-70> 140 140 3` | — | 该格 **红框 `#ff7a5a` + 左上到右下斜线**（`drawToolPreview()` L5119） | — |
| 5 | `move <board 外一点，如 720 20>` | `wait 250` | `game.hoverTile === null`（`pointerleave` 生效）；只读确认后 `shot` | `hover-leave.png` |
| 6 | `key Escape` | `wait 200` | `game.mode===null`，悬停框消失（`drawToolPreview` 首行 `if(!game.mode)return`） | `hover-after-escape.png` |

**PASS 判定**
1. 合法格金框、非法格红框加斜线，二者分界与 `toolTileState()` 一致；
2. `game.hoverTile` 为**索引**且等于 `at(gx,gy)`（规格 §8-1 头号坑）；
3. 移出 `board` 后 `hoverTile===null`，`hover-leave.png` 无残留框；
4. 所有合法格整体高亮可见（不是只有悬停格）；
5. **触控不触发**：另开 `open 390 844 touch` 后用 `tiletap gx gy` 短按，确认不产生悬停框（计划明确「仅限 mouse」）——此条留 `hover-touch-negative.png`，属 WP3 多端范围，可顺带核；
6. 拖动平移不被新监听破坏（`bindMapGestures()` 既有 `pointermove` 拖平移 L5576 仍生效）——留一段操作记录。

**截图路径统一**：`D:/Work/game/border-guard/tests/artifacts/v030-polish/hover-*.png`。

---

## 3. 新增 Node 测试的验收检查点与「先红后绿」证据核法

### 3.1 应存在的两类新测试（只增不改）

| 类别 | 建议文件（以 engineering-lead 实际命名为准） | 必须覆盖 |
|---|---|---|
| A · DPS 估算 | `tests/v030-wall-breach.test.cjs`（或等价名） | 规格 §4.5 的 5 组固定序列 |
| B · 失败诊断 | `tests/v030-collapse-diagnosis.test.cjs`（或等价名） | 规格 §5.2 / §5.3 / §5.4 的三字段与降级 |

> 已知仓库已有 `tests/v030-lighting-capability.test.cjs`（WP1-FIX-01 产物），属既有回归，不计入 WP2 新增数。执行前用 `ls tests/v030-*` 核对实际新增文件清单。

### 3.2 A 类逐条检查点（固定伤害序列，不能只断言「有值」）

| # | 输入 | 期望（精确相等） | 依据 |
|---|---|---|---|
| A1 | `samples=[{t:5.1,dmg:7},{t:6.0,dmg:7}]`, `now=10`, `hp=100`, `W=5` | 窗口 `(5,10]`；`dmgSum=14`；`DPS=2.8`；`seconds≈35.714`；`N=36`；`show=false`（≥30 秒不显示） | 规格 §4.5-1 |
| A2 | 同 A1 但首条改为 `t=5.0` | 严格 `>` 使等于 `now-W` 的样本**不计入**：`dmgSum=7`、`DPS=1.4`、`N=72` | 规格 §4.5-1 / §4.5-5 |
| A3 | `samples=[]` | `show=false`、不出现「约 ∞ 秒」、不标红 | §4.3 零伤害 |
| A4 | `now<5`（如 `now=3`） | `show=false`（数据不足），即使窗口内有样本 | §4.3 刚入夜 |
| A5 | 样本不变、`hp` 100→200 | `seconds` 加倍且 `critical` 按新值重判；**N 不减小** | §4.3 修墙回升 |
| A6 | `ring.status==='broken'` 或 `hp<=0` | 不显示「约 N 秒破墙」 | §4.3 已倒塌 |
| A7 | `phase!=='night'` | 不追加任何估算 | §4.3 白天 |

- 断言必须精确到数值（`assert.equal(dps, 2.8)` / `assert.equal(N, 36)`），**不接受** `assert.ok(result)` 这类弱断言。
- 数据源口径核：`damageWallRing()` 的 `dealt = before - ring.hp`（净伤害、含归零截断）、采样放在 `if(dealt>0)` 内、只记 `ringId==='home'`、时间戳用 `game.clock`（夜内秒，**不是** `performance.now()`）、夜修回血不进样本（规格 §4.1 / §8-7/8）。
- 低血文案格式逐字：`城墙 <hp>/<maxHp> · 约 <N> 秒破墙`，`1 ≤ N ≤ 29`，且 `.battle-stat.critical` 同时含「城墙」与「约 N 秒破墙」；估算文案必须并入 `battle.dataset.label`（否则 L6685 短路不刷新，规格 §4.6 / §8-9）。

### 3.3 B 类逐条检查点（失败诊断）

| # | 检查点 | 期望 |
|---|---|---|
| B1 | `collapseWall('home')` 写 `game.ledger[day]` | 三字段 `collapseAt`（整数秒 ≥1）、`collapseSide`（`'west'`/`'east'`/`null`）、`towersAtCollapse`（倒塌瞬间现存箭塔数，含升级塔） |
| B2 | 「只增不改」 | 同一夜二次调用不覆盖；不删改 `freshNight()` 既有字段；`freshNight()` 若预置三字段只能是 `null`（不能是 `0`/`'west'`，否则 `Number.isFinite(0)` 会误判）；写入用 `openNight()` 而非 `nightBook()`（`phase==='lost'` 时后者返回 `null`，规格 §8-6） |
| B3 | 完整模板逐字 | `第 {N} 夜 {X} 秒城墙倒塌（敌军从 {西|东} 侧集中拆墙），当时箭塔 {K} 座。下局在该侧城墙内放 2 座箭塔，入夜前修满城墙。`；`{N}` 取 **ledger key** 而非 `game.day` |
| B4 | 缺 `collapseSide` | 省略方向从句，用「敌袭侧」泛指，**不出现 `undefined`/`NaN`** |
| B5 | 缺 `towersAtCollapse` | 省略塔数从句，方向从句保留 |
| B6 | 只有 `collapseAt` | 只保留时间与建议 |
| B7 | 三字段全缺 / 无 ledger / 旧存档 | 完全走既有 6 条分支，不出现新模板、不抛异常 |
| B8 | `collapseAt` 为 `NaN` / 字符串 | 视为缺失；`sort` 不抛异常 |
| B9 | 多夜多次倒塌 | 取 `collapseAt` 有效且 **key 最大** 的那夜 |
| B10 | 营地围墙倒塌（`ringId!=='home'`） | **不写**三字段，避免误诊 |
| B11 | 显示位置（P4） | `#primary .diagnosis` 面板内出现「败局诊断」首行；`goal` 段落经 `nextRunHint()` 也出现同一句（两处都在）；**验收以面板为准** |
| B12 | 重置 | 点「开始新一局」后 `game.ledger` 重新初始化，`collapse*` 不残留（WP5 第 1.5 步） |

### 3.4 「先红后绿」证据如何核（QA 判定方法）

1. **红**：新测试文件必须能在 **WP2 实现前** 的 HTML 上跑出 `fail ≥ 1`。
   - 推荐做法：engineering-lead 提交前保存一次红跑输出；或 QA 在执行阶段自行复现——把实现前版本导出到仓库外只读快照：
     ```
     git show 0b9e024:Border-Guard-v0.29.html > D:/Work/game/bg-scratch/wp2-pre.html
     cd D:/Work/game/border-guard
     WP2_HTML_FILE=../bg-scratch/wp2-pre.html node --test tests/v030-wp2.test.cjs
     ```
     （`git show` 是**只读**；输出文件在 `bg-scratch/`，不入库。）

     **⚠ 环境变量名与路径写法订正（已按实装核验，覆盖本段初稿）**：实际新增测试为 `tests/v030-wp2.test.cjs`，其注入变量是 **`WP2_HTML_FILE`**（L10 `const FILE = process.env.WP2_HTML_FILE || 'Border-Guard-v0.29.html';`），**不是** `BORDER_HTML`。且 `tests/helpers/v029-vm.cjs` L7/L22 用 `path.join(ROOT, file)` 读文件（`ROOT` = 仓库根），**传绝对路径会被拼坏**，必须传**相对仓库根的路径**（如 `../bg-scratch/wp2-pre.html`）。上面已按此改写。初稿的 `BORDER_HTML=D:/...` 两种写法都不可用，执行时不得照抄。
     - 本段结论仍成立：红跑必须可独立复现；**红的性质必须是断言不满足**（如估算值不符 / 诊断缺三字段），不是语法错误、模块缺失、`EXC` 崩溃或路径写错导致的 `ENOENT`——后者极易与真红混淆，须在输出里确认是 `# fail ≥1` + 具体断言消息，而不是 `ERR`/`EVAL-ERR`。
     - 绿跑用同一命令去掉 `WP2_HTML_FILE`（默认读工作树 `Border-Guard-v0.29.html`）。engineering-lead 已向 team-lead 报绝对路径拼坏待修；在修复落地前一律用相对路径，并把它作为「已知 harness 限制」登记进 WP5 报告。
   - **红的性质必须正确**：是断言不满足（如 `estimateWallBreach is not defined` 或数值不符 / 诊断缺三字段），**不是**语法错误、模块缺失、`EXC` 崩溃、或测试文件本身写错。红跑输出里要能看到 `# fail 1`（或更多）与对应断言消息。
2. **绿**：同一命令在 WP2 实现后的工作树上跑 → `# fail 0`、全部 `ok`。
3. **证据留存**：两次完整 stdout + 退出码，保存为 `tests/artifacts/v030-polish/wp2-red.txt` 与 `wp2-green.txt`（或等价命名），记录各自对应的 HTML 版本（commit hash / 快照路径）与时间戳。
4. **不删断言**：`git diff cd4437a -- tests/` 与 `git diff 0b9e024 -- tests/` 两份输出中，对**既有**断言只能新增，不得删除、不得放宽阈值、不得改结果文件。新增测试不得覆盖旧证据目录（§0 测试纪律）。
5. **回归总量**：§4.1 全量命令（见 §4.1「基线数字订正」）的 **`# pass ≥ 77 + 新增测试数`**、`# fail 0`。`48` 是 WP1 交接时 6 文件历史基线，沿用属放宽阈值、违反 §0。

---

## 4. `sim/matrix.cjs` 首夜平衡矩阵（§3 WP2 验收第 2 条）

**命令**（在 `D:/Work/game/bg-scratch/` 或仓库根执行，脚本内用绝对路径 require）：
```
node D:/Work/game/bg-scratch/sim/matrix.cjs Border-Guard-v0.29.html 1
```
- 第 2 参数是 HTML 文件名（默认 `Border-Guard-v0.29.html`），第 3 参数是 `day`（默认 `1`）。
- 脚本固定 `seeds=[42,7]`，配置 5 组：`idle-0t` / `fight-0t` / `idle-1t` / `fight-1t` / `idle-2t`；每格输出 `fail <n>/2` 与 `out/ring/collapse/castle`。

**PASS 阈值**
- **`idle-2t` 必须为 `fail 0/2`**（两 seed 都 `ok`，首夜不失守）——这是 WP2 验收硬指标。
- 同时确认平衡未被引导链破坏：`idle-0t` 仍会失守（不布防依旧会输，§1.1 设计使然）；`idle-1t` 应为 `0/2`（§1.1 单塔挂机 0/2 失守、圈墙余 89/600）。若这三组相对 WP1 基线发生反转，判 FAIL 并回传（不得改数值掩盖）。
- `day1` 的塔位由脚本内 `spots=[[3,4],[3,5],[3,3],[4,2]]`（西）给出；WP2 **不得**改 `V029.wallHit` / `wallBlow()` / 敌人 AI / 圈墙几何，故矩阵结果应只受「引导/高亮」零影响。

**WH 环境变量用法（仅诊断/对照，不作为验收结果）**
```
WH='{normal:7,heavy:14,boss:30}' node D:/Work/game/bg-scratch/sim/matrix.cjs Border-Guard-v0.29.html 1
```
- 脚本 L21：`if(process.env.WH) V029.wallHit=<WH 值>`（实现为 `V029.wallHit=${process.env.WH||'null'}`，仅当 `WH` 非空时注入）。**不加 `WH` 时使用 HTML 内既定值**（`normal:7,heavy:14,boss:30`）。
- 用途：验证「旧值 12/22/35 → 新值 7/14/30」的敏感性；例如 `WH='{normal:12,heavy:22,boss:35}'` 对照首夜失守率。
- **纪律**：`WH` 只用于**对照实验**，正式验收结果必须来自**不带 WH** 的命令输出；报告里须标注哪次用了覆盖值。禁止用 WH 把 `idle-2t` 调成 `0/2` 来冒充通过。

- 输出留存：`tests/artifacts/v030-polish/wp2-matrix.txt`（含不带 WH 的原始 stdout）。
- 复现性：同命令跑 2 次，结果应一致（脚本用固定 seed，无随机源）；若不一致即 flaky，需隔离并回传。

---

## 5. §4.1 / §4.2 命令清单、`BORDER_ARTIFACTS` 新目录名与 PASS 阈值

### 5.1 §4.1 Node 全量回归

```
cd D:/Work/game/border-guard
node --test tests/v029-workplaces.test.cjs tests/v029-rings.test.cjs tests/v029-ui.test.cjs tests/v027-balance.cjs tests/v028-priority.cjs tests/v030-flow.test.cjs
```
- **PASS 阈值（现行基线，见下方订正）**：**`# pass ≥ 77 + 新增测试数`**、`# fail 0`、`# cancelled 0`、`# skipped 0`、`# todo 0`。
- 新增测试文件（§3）也应纳入一条**全量**命令，须显式列出 8 个既有文件 + 新增文件；报告里同时给出「8 文件基线 77」与「含新增文件」两组数字。
- **⚠ 基线数字订正（覆盖本段初稿的 `48 + WP2 新增`，两处旧值已就地改正）**：`48` 是 WP1 交接时的 6 文件基线；此后 WP1-FIX-01 的 `tests/v030-lighting-capability.test.cjs` +5、WP2 的 `tests/v030-wp2.test.cjs` +24，**当前 8 文件全量基线为 77/77**（静态统计 `test(` 声明数，非执行结果：10+10+10+10+6+2+5+24=77）。故 WP3 执行 §4.1 时：
  - 全量命令须**显式列出 8 个既有文件**（上面 6 个 + `v030-lighting-capability.test.cjs` + `v030-wp2.test.cjs`）**再加 WP3 新测试文件**；不得只列 6 个老文件。
  - PASS 阈值按 **`# pass ≥ 77 + WP3 新增测试数`** 判，并核 `# fail 0` / `# cancelled 0` / `# skipped 0` / `# todo 0`；沿用旧的 `48 + …` 会把门槛压低 29 条，属**放宽阈值**，违反 §0 测试纪律。
  - 报告同时给出「8 文件基线 77」与「含 WP3 新增文件」两组实际数字；若实际 pass 数低于 77，先查是否有断言被删或测试文件漏列，**不得**直接判绿。
- 断言纪律：`git diff cd4437a -- tests/` 与 `git diff 0b9e024 -- tests/` 对已有断言**只新增、不删除、不放宽**。

### 5.2 §4.2 浏览器回归（**新目录名，避免覆盖已提交证据**）

已存在且已随 `5320a02` 提交/或由 WP1-FIX-01 产出的目录：`v030-hud`、`v030-work`、`v030-rings`、`v030-polish`、`v030-baseline`、`v030-fix-hud`、`v030-fix-rings`、`v030-fix-work`。WP2 一律用 **`v030-wp2-*` 前缀**：

```
BORDER_ARTIFACTS=tests/artifacts/v030-wp2-hud   node tests/v029-hud-occlusion-browser.cjs
BORDER_ARTIFACTS=tests/artifacts/v030-wp2-work  node tests/v029-workplaces-browser.cjs
BORDER_ARTIFACTS=tests/artifacts/v030-wp2-rings node tests/v029-rings-ui-browser.cjs
```
- **PASS 阈值**：三条都打印 `OK`、退出码 0；`afterCollapseSeconds ≤ 5`；三份 `browser.json` 内**所有** `pageErrors` 数组为空、`failure` 字段不存在；`cdp.cjs`/runner 输出中无 `EXC` / `CONSOLE error`。
- hud-occlusion 可能触线的既有断言（**失败时改 CSS/实现，不改断言**）：选址底栏宽 `< 520`、折叠图例与小地图高度 `≤ 60`、详情空闲比 `≥ 0.45`（矮横屏 `≥ 0.48`）、三卡可命中。
- 若 WP2 新增了浏览器 runner（如引导链 runner），另设 `BORDER_ARTIFACTS=tests/artifacts/v030-wp2-guide`，同样不覆盖旧目录。

### 5.3 提交前统一自查（计划 §3 开头 / §4.5）

```
node --test <§4.1 全量命令>
# 看至少一张实际截图（本工作包至少看 guide-1.png 与 guide-6.png）
grep -n "__wallHit\|window.__" Border-Guard-v0.29.html
```
- `grep` 应无结果（`window.FW` 测试钩子除外，L7117 附近，行号以实际为准）。
- 提交信息：`feat: guided first day, hover placement preview and wall time-to-breach`，末尾加 `Co-Authored-By` 行；**不 push、不合并 main、不切分支**。
- 本工作包不提交 `tests/artifacts/v030-baseline/` 与临时文件；`bg-scratch/` 不入库。

### 5.4 执行阶段的浏览器启动（**本轮未执行，仅登记**）

> 环境说明：9333 常驻 Chrome 在 WP1-FIX-01 期间已不可用（engineering-lead 用私有端口自测）。**验收执行阶段由 quality-lead 按交接计划 §2 重新启动 9333 常驻 Chrome**；本规划轮一律不启动、不操作浏览器，也不动 `vp.json`。

```
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --no-first-run --remote-debugging-port=9333 --user-data-dir=D:/Work/game/bg-scratch/profile about:blank
```
- 后台常驻启动后 `curl -s http://localhost:9333/json/version` 确认就绪。
- 坑（计划 §2 / §5）：Git Bash 下**不要 `pkill`**、不要按命令行关键字批量杀进程；`cdp.cjs` 参数整体加双引号；点击后 ≥150 ms 再读 DOM；切视口后 ≥400 ms；**永远 `open` 新 tab**（beforeunload 会卡死）；CDP 单例，执行期由 quality-lead 独占。

---

## 6. §4.3 体验清单 7 条 → 逐条证据类型

> 统一约定：`[R]` = 必须真实输入（clicktext/clicksel/click/tile/tiletap/key/wait）；`[F]` = 允许状态夹具，但**必须标注「状态夹具，非自然流程证据」**；`[N]` = Node 单测；`[D]` = 只读 DOM/状态断言。所有截图路径在 `D:/Work/game/border-guard/tests/artifacts/v030-polish/` 下，除非另注。

| # | §4.3 玩家问题 | 合格表现 | 证据类型与文件 | PASS 判定要点 |
|---|---|---|---|---|
| 1 | 我现在该做什么？ | 第 1 天每阶段唯一 `▶` 下一步提示；目标在地图上有高亮 | `[R]` 6 张 `guide-1..6.png` + `[D]` 每步只读断言 + `guide-5-zoom.png`（推荐格）+ `guide-5-toolmode.png` / `guide-2-modal.png` / `guide-night-transition.png`（让位） | 六条文案逐字一致；每步 `next=true` 且 `text` 内 0 个 `▶`（箭头仅由 CSS 提供 1 个）；同一步不残留上一步文案；S5 金色虚线圈与红色入口同侧；入夜/day2/won/lost 时 `next=false`（后三条由 WP5 补） |
| 2 | 选中了什么？ | 四角金框、箭塔射程、居民脚下虚线光圈、城墙选中金色虚线描边 | `[R]` 3 张 `exp-2-selection-tower.png` / `exp-2-selection-resident.png` / `exp-2-selection-wall.png`（点选箭塔 / 居民 / 城墙） | 四者各自可见且互不遮挡；**全部为既有实现**（`drawSelection()` / L5129 / L4776 / L4889–4908），WP2 不改代码；若 FAIL 另开工单，不在 WP2 修 |
| 3 | 在哪里可以建造？ | 选中工具后所有合法格整体高亮；悬停格金框（合法）/ 红框加斜线（非法） | `[R]` `hover-legal.png` / `hover-legal-zoom.png` / `hover-illegal.png` / `hover-illegal-zoom.png` / `hover-leave.png` + `[D]` `game.hoverTile` 索引断言 + `hover-touch-negative.png`（触控不触发） | 见 §2.1 六条；`cdp.cjs` 需先补 `move` 命令（§2.0） |
| 4 | 居民去了哪里？ | 状态气泡、移动目标蓝色虚线、工人数徽章、详情「前往 某建筑（坐标）」 | `[R]` 至少 3 张：`exp-4-transit.png`（在途点开居民详情）、`exp-4-arrived.png`（到岗后点开）、`exp-4-empty-ground.png`（目标为空地，兜底）；**`exp-4-arrived.png` 必须 1440×900 与 390×844 各 1 张**（见 §8.2 遮挡门禁）；`[F]` 兜底分支可用夹具但须标注 | 徽章 `👤N`（N>0）或灰色「空」（N=0）与 `assignedResidentIds.length` 一致；**唯一判定帧 = `exp-4-arrived.png` 中「居民到岗且 `r.work.state==='working'`」的同帧**：若 **`👤` 图标或徽章左缘被实色气泡覆盖即判 FAIL**，**不得因 `N` 数字仍可见而放宽为 PASS**（`label()` 用 `textAlign='center'`，字符串中心 `x≈36.8px` 虽在气泡右缘 `34.5px` 之外，但左半的 `👤` 会伸进气泡区；灰色「空」为汉字、墨迹更宽，同样按左缘判）。此系**代码几何推算的既存缺陷、待实拍确认**，拿到实拍前**不得写「WP2 已 FAIL」**（§8.2）；`N=0`（灰色「空」）帧与 `N>0` 在途帧**不用于判此项**；详情 `dest` 逐字符合规格 §3.1（含全角括号、整数坐标、无 `undefined`/`NaN`）；「改派到…」按钮仍带坐标；到岗后仍可移动/召回/改派（§0 红线，靠 `v029-workplaces` runner 兜底） |
| 5 | 资源为什么变化？ | 顶栏 `±N` 浮字；天亮每建筑飘字 + 汇总横幅；失败操作红色 toast | `[R]` `exp-5-dawn.png`（等真实天亮）+ `exp-5-fail-toast.png`（点一次买不起的操作） | 顶栏只显示金币/材料/粮食/稀缺资源（不虚构木材/石料）；天亮飘字数值 = `forecastIncome()`（只读比对）；失败 toast 带 `.bad` 标红且说明原因；**既有 / WP1 内容，WP2 不改代码** |
| 6 | 城墙还能撑多久？ | 耐久牌与夜间状态栏实时更新；低于 30 秒显示「约 N 秒破墙」并标红 | `[R]` 自然流程记录（WP5 报告：真实入夜 → 等真实时钟 → 观察 `#battleText`）；`[F]` 低血临界截图 `exp-6-critical.png`（**必须标注「状态夹具，非自然流程证据」**，不得计入自然试玩）；`[N]` §3.2 A1–A7 | 耐久牌 / `#wallVital` 与 `ring.hp` 一致，随受击下降、随夜修回升；`seconds<30` 时同一 `.battle-stat.critical` 同时含「城墙」与「约 N 秒破墙」且 `1≤N≤29`；零伤害 / 入夜 <5 秒 / 已倒塌 / 白天不显示且不因估算标红；修墙后 N 不减小；公式正确性由 Node 测试覆盖 |
| 7 | 我为什么失败？ | 失败横幅 + 复盘面板；诊断含哪夜/几秒/哪个方向/当时几座塔/下局怎么做 | `[R]` `exp-7-failure.png`（新一局故意不布防 → 等真实时钟失败）+ `exp-7-reset.png`（点「开始新一局」）；`[N]` §3.3 B1–B12 字段降级 | 按规格 §5.6 的 7-a…7-i 逐子项判定；**验收以 `#primary .diagnosis` 面板为准**（P4，两处都出现）；诊断不出现 `undefined`/`NaN`，含「放 2 座箭塔」「入夜前修满城墙」；旧存档缺字段走既有 6 条分支；重置后 `collapse*` 不残留 |

**贯穿 7 条的一致性检查**：每张截图都要确认 `#mapHint` 的 `.next` 状态符合规格 §2.4 让位表；选中工具时让位给 `modes` 文案且 `.next=false`；胜利页 L6617 文案覆盖且 `.next=false`。

---

## 7. 「状态夹具证据」与「必须真实输入的证据」分界

| 类别 | 定义 | 允许范围 | 标注要求 | 本计划中的具体项 |
|---|---|---|---|---|
| **必须真实输入 `[R]`** | 只用 `clicktext` / `clicksel` / `click` / `tile` / `tiletap` / `key` / `wait` 推进；等真实时钟；配合**只读** `eval` 断言 | 引导链 6 步、悬停预览、选中态、居民详情、天亮/失败/重置、失败横幅 | 操作记录须写明「点了什么文案/哪个格坐标、等待多久」 | `guide-1..6.png` 全套、`hover-*.png`、`exp-2-*.png`、`exp-4-*.png`、`exp-5-*.png`、`exp-7-*.png`、WP5 自然试玩全程 |
| **只读断言 `[D]`** | `eval` 仅读取 DOM / `game` 字段 / 调纯函数返回数据；**零赋值、零状态变更** | 每次截图前的文案与 `.next` 核对、候选格坐标枚举、`entrances()` / `recommendedDefenseTiles()` / `worldToScreen()` / `toolTileState()` 查询 | 报告中注明「只读」 | §1.0 断言模板、§2.1 挑格表达式、§3.4 版本核对 |
| **状态夹具 `[F]`** | 用 `eval` / `fx/*.js` **直接改 `game` 状态**构造画面 | 仅限：低血临界 `seconds<30` 帧、旧存档缺三字段降级、B1/B2/B5/P5 异常态构造、S9 碎石相机、箭塔 lv1/lv2 同框 | **每张图 / 每段记录必须逐字标注「状态夹具，非自然流程证据」**，且**不得计入 WP5 自然试玩证据** | `exp-6-critical.png`、Node 夹具（B4–B12）、§8 的 4 项留证（若用夹具） |
| **Node 单测 `[N]`** | `node --test`，无浏览器截图 | DPS 公式、诊断字段降级、绘制契约 | 输出文件 + 退出码 + 先红后绿两段日志 | §3 全节、`wp2-red.txt` / `wp2-green.txt` |

**红线复述**（计划 §3 WP5 第 1 条 / 规格 §6 统一证据约定）：自然试玩全程**禁止 `eval` 改状态**，只用真实输入 + 等真实时钟。WP2 阶段性取证允许 `[F]`，但不得冒充自然试玩；尤其 `guide-*.png` 六张**必须是 `[R]`**，任何一张用夹具构造状态即整条 WP2 验收判 FAIL。

**`BORDER_ARTIFACTS` / 截图目录纪律**：全部新证据用 `v030-wp2-*` 或 `tests/artifacts/v030-polish/` 下的新命名，不覆盖 `v030-hud` / `v030-work` / `v030-rings` / `v030-fix-*` 等已有证据目录；`bg-scratch/` 不入库。

---

## 8. WP1 遗留、需在 WP2/WP3 顺带核的 4 项留证缺图（**本轮不执行**）

以下 4 项在 `wp1-acceptance.json` 的 `unverified` / art-director 的 S1–S12 清单中登记为未覆盖或需二次确认；本轮只登记，不启动浏览器、不截图。建议在 WP2 或 WP3 的浏览器会话里顺带补拍（可用 `[F]` 夹具，但须标注）。

| # | 缺图 | 建议证据路径 | 建议做法 | PASS 判据 |
|---|---|---|---|---|
| 1 | **箭塔 lv0 / lv1 / lv2 三色顶同框**（S3） | `tests/artifacts/v030-polish/extra/tower-levels-3up.png` | `[F]` 用夹具把同屏 3 座塔分别设 `level=0/1/2`，`paused=true` + `draw()` 固定画面；100% 与 50% 各一张 | 蓝顶 `#3f74c4` / 红顶 `#c4573f` / 紫顶 `#6a5aa8` 三者同框且可分辨；lv≥1 有 7px「Ⅱ / 重」小字（50% 下允许不可读，按 art-director 判定） |
| 2 | **倒塌碎石相机**（S9 的独立视角） | `tests/artifacts/v030-polish/extra/collapse-rubble-camera.png` | WP1 已由 `tests/artifacts/v030-rings/combat-after-collapse.png` 覆盖 S9 两项判据，但那是失守终局 + 复盘面板遮挡。**补一张相机对准原墙线的碎石特写**（`[F]` 夹具触发 `collapseWall('home')` 后 `centerOnHero()` / `snapCameraToPoint()`，`zoom` 放大） | 旋转灰色石块残段（`drawBrokenRing` L4871–4884）清晰可辨，与圆润天然 rock 装饰区分；无逐段血条、无圈耐久牌；不出现 `undefined` 文案 |
| 3 | **交互三态**（S10） | `tests/artifacts/v030-polish/extra/interaction-states.png`（建议 3–4 张：`sel-tower.png` / `sel-resident.png` / `sel-wall.png` / `gates.png`） | `[R]` 真实点选箭塔（四角金框 + 射程虚线圆）、居民（脚下虚线圈 + 蓝色移动虚线）、城墙（金色虚线描边）、白天 `drawGates()` 红色脉冲入口；或 `[F]` 夹具固定并标注 | 四类可视化各自可见、互不遮挡；与规格 §1.2 既有实现一致；若 FAIL 另开工单，不在 WP2 修 |
| 4 | **卡牌第 3 张**（手机端） | `tests/artifacts/v030-polish/extra/cards-third-mobile.png` | WP1 观察到 `390x844` 夜战底部战斗栏仅完整显示 2 张卡（桌面 3 张），白天第 4 个命令按钮文字右侧略裁切。在 `open 390 844 touch` 下重看**三选一卡牌**与**夜战三张战斗卡**，100% 与放大各一张 | 三张卡并排且第 3 张「选择」按钮可见可命中（既有 `v029-hud-occlusion-browser.cjs` / `v029-rings-ui-browser.cjs` 的 cards 断言已覆盖部分）；夜战三张卡完整可读；属 WP3 多端范围 |

> 补拍时若用 `fx/` 夹具，一律在文件名旁与报告中标注「状态夹具，非自然流程证据」。本轮不执行任何一项。

### 8.1 与 art-director `wp3-visual-spec.md` §5 的对齐（信息同步，未执行）

art-director 已把上述 4 项的补图方案写入 `tests/artifacts/v030-polish/wp3-visual-spec.md` §5（纯规格、未实现）。执行阶段以规格 §5 为准，本计划 §8 表格作为索引。对齐后的执行要点与 QA 复核结论：

- **§4 七视口判据已逐条核对，与本仓库 runner 完全一致、无出入**：`legendH/miniH ≤ 60`、`deckWidth < 520`、`dayFree ≥ 0.45`（矮横屏 `0.48`）、`siteFree ≥ 0.85` / 触屏 `0.80` / 矮横屏 `0.68`、932×430 与 390×844 特判。runner 源码位置：`tests/v029-hud-occlusion-browser.cjs` L238–249、L312–325。
- **极窄余量预警（WP1 实测，WP3 改 CSS 前必看）**：`390x844` 的 `siteFree=0.801` 对阈值 `0.80` **仅余 0.001**；`1108x720` 的 `siteFree=0.865` 对 `0.85` 仅余 `0.015`；`390x844` 的 `dayFree=0.473` 对 `0.45` 余 `0.023`；`legendH/miniH=54` 对 `≤60` 余 6 px。任何新增按钮/padding/面板尺寸都可能触线，**失败时改 CSS 不改断言**。
- **「runner 报三卡可命中」需更正口径**：hud runner L463 与 rings runner L239 都只对 `document.querySelector('#cardRow button')`（**首张卡**）做 `elementFromPoint` 命中；rings runner L259 另有 `cardYs` 全三张 y 差 `<28`（三卡并排）断言，但**不**对第 2/3 张做命中或视口内检测。故第 3 张卡是否被裁切，只有截图证据能覆盖。
- **「卡牌第 3 张」动画假设已由代码+截图证实**：CSS `animation:cardIn .38s` + `.growth-card:nth-child(3){animation-delay:.14s}` → 第 3 张在 **520 ms** 才完成；两个 runner 都在 `await frames()`（2 rAF ≈32 ms）后立刻 `screenshot('cards-...')`，正值动画中途。实测 `tests/artifacts/v030-hud/cards-390x844.png` 只显示 2 张、第 2 张半透明。故采纳规格建议 **`wait ≥700 ms` 再截**（比 520 ms 留 180 ms 余量），1440×900 与 390×844 各一张；等足仍只有 2 张才另开工单。
- **交互四态：⚠ 本节初稿的「关闭提示链」写法作废，按规格 §5.3.1 重写（已按实装核验）**。初稿让 `tutorialStep()` 返回空 / `guideActive=false` **完全无效**：`guideActive` 是 `renderUI()` 局部 `const`，`tutorialStep()` 只把 `guideStep()` 的 S1–S6 映射成文案；金虚线框链路是 `drawRecommendedDefense()` → `recommendedDefenseTiles()`，而后者 L3347 `if(guideStep()!=='S5')return []`。**正确门禁 = 让 `guideStep() !== 'S5'`**：
  - **命名约定（避免编号冲突）**：下面「方案 A/B/C/D」指**让 `guideStep()!=='S5'` 的四种手段**；「第 1/2/3/4 张」指**四张截图**（第 1 张 合法格高亮 / 第 2 张 射程圆 / 第 3 张 蓝色移动虚线 / 第 4 张 四角选框）。两者编号互不通用。
  - **方案 A（首选）**：在该敌袭侧 `owned` 格放 1 座塔（`towersOnSide(defenseSide())>=1`）→ `guideStep()` 变 `'S6'`、推荐格 `[]`、`game.mode` 仍 `null`。**第 2 / 3 / 4 张三态统一用方案 A**。
  - **方案 B（次选）**：`game.day=2`（`guideStep()` 因 `day!==1` 返回 `null`）；但 `entrances(2)` 返回两侧入口、`drawGates()` 画 2 个红脉冲会干扰判定。
  - **方案 C**：`game.mode='tower'` → `guideStep()` 因 `game.mode` 返回 `null`；**只用于第 1 张「合法格高亮」**（该张本就要设 mode，提示链天然关闭）。
  - **方案 D（禁止）**：改 `guideStep` / `tutorialStep` / `recommendedDefenseTiles` 源码或打临时桩。可用 `window.FW.guideStep()`（`FW` 已导出 `guideStep,recommendedDefenseTiles,defenseSide,towersOnSide`）只读断言已退出 S5。**期望值因方案而异**：方案 A → `'S6'`；方案 B / C → `null`；不要一律断言 `'S6'`。
  - **四张截图的共同条件**：四张都设 `game.hoverTile=null`（实装 L5724 写入的是 `at(t.x,t.y)` 的 **number 索引**，判定用 `!=null`；若要断言 `typeof hoverTile==='number'`，必须在**真实 `move` 鼠标之后**取）；**第 2 / 3 / 4 张必须保持 `game.mode=null`**（`drawToolPreview()` 首行 `if(!game.mode)return`，否则多出整体高亮）；**第 1 张必须 `phase==='day' && mode` 非空**。
  - **第 2 张（射程圆）判据已放宽**：`drawSelection()` 会同时画四角金框与射程圆（既有实现，§4.3 第 2 条本就要求同框），允许四角框同框，**不得误判为多画**。其余三张仍「各只突出一种」。
  - **QA 补充**：方案 A 在 day1 时 `drawGates()` 的红色脉冲入口仍在画面里，第 2/3/4 张应把它登记为「既有背景」而非额外状态，避免与「只突出一种」冲突；`site-*.png` 的淡黄虚线方框来自 `boundaries(showStarting)` 的 A/B 起始领地，**不是** `drawToolPreview()` 合法格高亮，别误判。
- **倒塌碎石相机**：现有 `combat-after-collapse.png` 相机已平移、圈墙不在取景内；须 `setCameraMode('manual')` + `snapCameraToPoint()` 对准圈墙中心，不跟随领主；判定旋转石块可见、无逐段血条、耐久牌消失。
- **箭塔三色顶**：WP3 待拍板 P1 若删除 7px 等级字，需「删除前拍」或同时记录「删后三色顶仍可辨」。
- 行号会随 WP2/WP3 实现漂移，**一律以函数名 / CSS 选择器定位**（规格 §0 与计划 §0 已声明）。

- **QA 补充：遮挡比值的覆盖盲区（执行 WP3 时必须靠截图补）**。`v029-hud-occlusion-browser.cjs` L129 的 `measureOcclusion` 只把 `.briefing, .legend-panel, .minimap-panel, #commandDeck, #playSide` 这 5 类元素计入 32×32 网格的 `blocked`。因此：① `#victoryCard` 与 `#eventBanner` **不参与** `siteFree/dayFree` 计算——art-director 的硬约束 ②（victoryCard 不改尺寸）属防御性约束，但**不是** `390×844` 0.001 余量的成因；真正驱动该比值的是 `.briefing` / `#commandDeck` / `#playSide` / `.legend-panel` / `.minimap-panel`，故硬约束 ③（不加高底栏）与 ④（小地图 ≤60）才是高杠杆项。② 计划 §3 WP3 的「`#eventBanner` 不得遮住顶栏」与「胜利 HUD 主题化」**不在 runner 断言覆盖内**，只能靠 7 视口截图与胜利页截图人工判定；WP3 若新增其它浮层面板，runner 同样不会计入，须在截图清单里显式加一条「新增面板遮挡」检查。此条已同步 art-director 与 team-lead；**art-director 已决定写入规格**（`wp3-visual-spec.md` §4.2.1「先厘清余量的真实成因」、硬约束新增 ⑥ 别让 `.briefing`/`#playSide` 变大、⑦ + §4.2 判定表新增「浮层面板目视检查（runner 不兜底，必做）」一行），规格与我的 §8.1 判定完全一致，两条路径同结论。`#victoryCard` 不改尺寸保留为**防御性约束**，明确不是 0.001 余量的成因。

### 8.2 新增「WP3 完成后复拍门禁」（规格 §3.6 / §10 第 7 步，已按实装核验）

design-strategist 发现、art-director 写进规格的**遮挡风险**，其**验收归属措辞存在两种待主理人裁定的口径**（见下方「⚠ 验收措辞待主理人裁定」与「双重时序」）：QA 的「双重门禁（WP2 验收当场 + WP3 完成后复拍）」与 DS 的「条件 PASS / 待 WP3 修复后复拍、解遮挡归 WP3 P7」。**两种口径下，WP3 完成后的复拍均为必做、不得跳过**；实拍结果只记事实，最终措辞由 team-lead 裁定，本计划不擅自定性。

> **⚠ 定性升级（design-strategist 二次几何复核，art-director 已同步）**：这**不是** WP3 放大气泡才会引入的风险；按代码几何推算是 **WP2 实装后的既存缺陷**——当前气泡宽度已是 `14*s`（`rrect(bx-7*s,by-7*s,14*s,13*s,4*s,...)`），坐标重叠在现状即存在。**但「是否形成可见遮挡」尚未实拍确认**（`getResidentPose()` 走动动画偏移、`label()` 文字基线/emoji 墨迹、`rrect` 圆角都会改变实际重叠区），**在拿到 `exp-4-arrived.png` 前只记「推算存在遮挡、待实拍确认」，不得写成「WP2 已 FAIL」**。因此「P7 选择放弃放大」**不等于零冲突**，无论 P7 拍板选哪个都必须解决遮挡；§3.6 复拍门禁为**必做**，且 WP2 验收阶段即取该判定帧。

- **冲突事实（已只读核对代码 + engineering-lead VM 实算）**：`CELL=46` → `s=CELL/60≈0.7667`；EL 用 seed 42 收敛实测居民 `r.y=t.y+.5`（**不是** `productionWorkPos()` 工作平台位的 `.58`）。作业气泡 `drawResident()` `bx=pose.x*CELL+8*s, by=pose.y*CELL-22*s`（L4928）→ 格左上起算 `x 23.77–34.50 / y 0.77–10.73`；WP2 工人数徽章 `structure()` 内 `rrect(36,1,24,15,5,...)` + `label(n>0?'👤'+n:'空',48,8.5,10,...)`（L4799–4801，`inCell` 60 单位制 ×`CELL/60`）→ `x 27.60–46.00 / y 0.77–12.27`。**重叠区 `x 27.60–34.50 / y 0.77–10.73` ≈ 68.8 px²（徽章宽度被盖约 37%），且两者顶边齐平 `y0=0.77`**。绘制顺序：`structure()` 入 sprites 键 `y:t.y+1`（L5361）、作业居民键 `y=dock.y+1.2`（L5368）、L5375 按 y 排序、L5376 顺序执行 → **作业居民必然画在同格建筑之后**，气泡不透明底后画会实色盖住 `👤N`；这是排序规则决定的**稳定**既存现象，不是 `getResidentPose()` 走动偏移造成的偶然。WP3 若放大到 `16*s/18*s` 只会更严重；但 **14*s 现状已重叠**。
- **几何结论（DS 已独立复算、与 EL VM 实算一致，执行时以实拍为准）——注意 P7 已二次改写**：
  - 水平：空隙来自**富/铁角标右边界 `x17.6` 与徽章左边界 `x27.6` 之间仅 ≈10 px**，而 `14*s/16*s/18*s ≈ 10.7/12.3/13.8 px` 三种宽度都超出 → **在「不劣化现状宽度」前提下水平无解**；缩到 `≤13*s` + 中心移到 `x≈22.6` 的纯水平解存在但「比现状还小、与可读性目标相悖、不推荐」。
  - 垂直：**上一版「上移 `by` 到约 `-43*s`」已被 EL 用 seed 42 VM 实算否决**——实算 `r.y=t.y+.5` 时气泡 `y0=0.77` 与徽章 `y0=0.77` **顶边齐平**，垂直方向也无解（且上移会让气泡画进上一格，需额外查与上一格建筑/单位/耐久牌/城墙/迷雾及画布上沿裁切的冲突）。
  - **解法以 `wp3-visual-spec.md` §9 P7 为准（本计划不复述方案编号，避免规格更新时计划又过时）**：几何结论只保留三条——**在 ≥14*s 宽度下水平无解；在「不把气泡整块移出本格」的前提下垂直亦无解；「上移 `by` 到 `-43*s`」方案已被 EL VM 实算否决**。P7 的具体选项（含晚绘 pass 的插入点变体 ①a/①b、左移 + 角标联合收窄、保守最小解遮挡）及其取舍一律由规格 §9 定义。若拍板晚绘 pass，仍需 **DS 有条件同意修订 `wp2-ux-spec.md` §3.2「绘制位置」一行**（team-lead 授权 + 派独立新提交 + 保留 `structure`/`nodeArt`/`drawFoliage` 按名调用 + **避免双绘**），且「lighting 之后」类变体必须给**所有**晚绘路径加 `t.visible` 守卫（`structure()` 本身不做可见性判断，否则未探明格徽章会浮在迷雾之上，属信息泄露）。**所有方案都以 §3.6 复拍为必做门禁**；不再保留 `-43*s` 为「唯一解」的旧表述，也不把「放弃放大」当作零冲突兜底。若执行实拍发现某个水平偏移其实可行，回传 art-director 修订 §9 P7 解法条款。
- **复拍对象 / 唯一判定帧**：`wp2-ux-spec.md` §6 第 4 条「生产建筑工人数徽章」的验收证据。**派居民到生产建筑、等到岗后截图，1440×900 与 390×844 各 1 张**（`exp-4-arrived.png`）。**触发窗口（决定拍哪张）**：遮挡只在 `r.work.state==='working'` **且居民停在 dock 格**时发生——`N=0`（灰色「空」）该锚点无气泡、徽章完整；`N>0` 但**在途**时气泡锚在居民当前位置而非 `productionWorkPos()` dock，不重叠。故 **只有「到岗 / 作业中」这张 `[R]` 帧是判定帧**，`exp-4-transit.png` / `exp-4-empty-ground.png` 一律不用于判此项。已只读核代码：`getResidentPose()` 直接返回 `x:r.x,y:r.y`；`productionWorkPos()` / `dockWorldPos()` 的 `{x:t.x+.5,y:t.y+.58}` 只是 **dock 平台位定义**，不是绘制所用坐标。**几何结论一律以 EL seed 42 收敛实测 `r.y=t.y+.5` 为准**，故气泡锚 `by=pose.y*CELL-22*s` 按 `.5` 计（`y0=0.77`，与徽章顶边齐平）；`.58` 仅作 dock 定义说明、**不得用于算重叠区**——此修正已同步到上方「冲突事实」，全文不再有 `y 4.5–14.4` 旧值。
- **FAIL 判据（已精确化，最易误判处）**：判据**不是**「徽章不可见」，而是 **`👤` 图标或徽章左缘被实色气泡覆盖** → FAIL。理由：`label(n>0?'👤'+n:'空',48,8.5,10,...)` 的中心像素约 `(36.80, 6.52)` 在气泡右缘 `34.50` 之外，`N` 数字大概率存活；若按「徽章不可见」判，QA 会因「数字还在」把 FAIL 误放成 PASS。我已只读核 `label()` 实现：`ctx.textAlign='center'; ctx.textBaseline='middle'`，字符串左半的 `👤` 确实会向左伸进气泡区；灰色「空」为汉字、墨迹更宽，同样按徽章左缘判。
- **PASS 判据**：`👤` 图标与徽章左缘**均完整可见、未被实色气泡覆盖**，且 `👤N`/「空」与 `assignedResidentIds.length` 一致；任一视口判覆盖即 FAIL，回传 team-lead 与 art-director 升级为缺陷条款。
- **待实拍限定 / 只读佐证**：静态坐标推算**不能替代截图**（`getResidentPose()` 走动动画偏移 `bob`/`work`、`label()` 文字基线与 emoji 墨迹、`rrect` 圆角都会改变实际重叠区）；在拿到 `exp-4-arrived.png` 前**只记「推算存在遮挡、待实拍确认」**。`paused=true` + `draw()` 固定一帧可作 `[F]` 夹具但须标注「状态夹具，非自然流程证据」，不得计入自然试玩。engineering-lead 已存只读放大裁切 `D:/Work/game/bg-scratch/after/wp2-badge-occlusion-zoom2.png`（上：四建筑 0 人态四个灰色「空」徽章清晰；下：林场单工人态），**标注为只读放大裁切、非自然流程证据，不能替代 working 同帧复拍**——我按此标注查看过：上半 4 个灰色徽章可辨，下半木屋上方有一个蓝绿小圆角块，在该 2x 裁切里**无法无歧义地区分是 `👤1` 徽章还是作业气泡**，因此它既不能证实也不能否证遮挡，正好印证「不能替代」的限定。执行时用 `exp-4-arrived.png` 原帧 + 专门 `zoom`（≥4x）判左缘覆盖。
- **⚠ 验收措辞待主理人裁定，不得提前改**：design-strategist 提出「若实拍确认遮挡，WP2 §6 第 4 条标**『条件 PASS / 待 WP3 修复后复拍』**而非判 WP2 返工」，规格已写入并标为**待 team-lead 裁定**。这与我此前回传的「判 FAIL 属 WP2 质量门范围、须先回传主理人」存在措辞冲突。**在 team-lead 裁定前，我的 WP2 验收报告不预先采用任何一侧**：只记录实拍事实（是否覆盖）+ 两种候选措辞，交由主理人选定；若裁定为「条件 PASS」，报告按条件 PASS 写并注明「待 WP3 修复后复拍」。
- **时序与门禁（口径无关，两种归属下完全一致）**：无论采 **A（DS：条件 PASS / 解遮挡归 WP3 P7）** 还是 **B（QA：双重门禁 / WP2 当场判）**，以下五项**都不变**：① 唯一判定帧（`r.work.state==='working'` 到岗同帧，`exp-4-arrived.png` 1440×900 与 390×844 各 1 张）；② FAIL 判据（`👤` 图标或徽章左缘被实色气泡覆盖）；③ 待实拍限定（不写成「WP2 已 FAIL」）；④ §9 P7 选项以 `wp3-visual-spec.md` 为准；⑤ **WP3 完成后的复拍门禁**（排在 WP3 实现与 7 视口截图之后、**P7 定案之后**、WP3 质量门判定之前，规格 §10 第 7 步承接）。差别**仅在于 WP2 验收报告里实拍结果的措辞**，该项由 **team-lead 裁定**（见上一条），本计划不擅自定性；实拍结果只记事实并回传主理人。art-director 已请 team-lead 点头把跨包门禁补进 `wp2-ux-spec.md` 附录（按边界未改他人文档）；执行不依赖附录是否落地。
- **harness 备注**：`tests/v030-wp2.test.cjs` 用 `WP2_HTML_FILE`（相对路径，见 §3.4 订正）；§9 拍板项现为 P1–P7，P7 结论会决定气泡最终尺寸，复拍须在 P7 定案**之后**做。

本轮只登记信息，**未执行任何补图、未启动浏览器、未跑测试、未做 git 写操作**；执行须等主理人放行 WP2 质量门并发出 WP3 验收指令。

---

## 9. 本轮自查（证明未越界）

- [x] 未启动 / 操作任何 Chrome；未跑 `cdp.cjs`；未动 `vp.json`。
- [x] 未执行任何 `node --test` / 浏览器 runner / `sim/matrix.cjs` / `scenes.sh`。
- [x] 未做任何 git 写操作（无 add / commit / push / reset / rebase / amend / stash / checkout）；只做了 read-only 的 `git log -1` 与文件读取。
- [x] 未改 `Border-Guard-v0.29.html`、未改任何 `tests/` 断言、未改他人文件。
- [x] 唯一产出：本文件 `tests/artifacts/v030-polish/wp2-acceptance-plan.md`（未提交）。

---

*本文件为验收用例计划，不含实测结论；执行阶段完成后由 quality-lead 另出验收报告，并由主理人裁定 WP2 质量门。*
