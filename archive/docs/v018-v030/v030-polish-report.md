# 边境守卫 v0.30 打磨 · 交付报告

> 日期：2026-11-16 · 分支：`codex/claude-gameplay-art-layout` · 依据：`docs/v030-handoff-plan.md`
> 可玩文件：**`Border-Guard-v0.29.html`**（入口文件名不变，单文件、离线、双击即玩）
> 进度快照：`docs/v030-polish-progress.md` · 逐包证据：`tests/artifacts/v030-polish/`
>
> **证据级别声明**：本轮全部操作者为 AI，浏览器证据来自无头 Chrome + CDP 模拟输入；
> 「自然试玩」指**只用真实点击/按键 + 游戏自身时钟、不改游戏状态**的完整对局（证据级 E1），
> **不是真人试玩**；触屏为 CDP 触屏模拟，**不是手机真机**；第 5 夜胜利页为**夹具**，已单独标注。

---

## 0. 交付摘要

| 工作包 | 内容 | 质量门 | 提交 |
|---|---|---|---|
| WP1 | 明亮卡通渲染、图标集、HUD 主题、事件横幅、光照能力检测修复 | PASS | `5320a02` / `0b9e024` |
| WP2 | 首日六步引导链、悬停放置预览、推荐布防格、破墙倒计时、失败诊断三字段 | PASS | `ee7f596` |
| WP3 | 小地图 PAL 化、胜利 HUD 金边玻璃、纯图形角标、徽章 ①b′ 晚绘、手机命令压缩 | **PASS**（本轮补取证） | `4f7cd0a` + `91169fe` |
| WP4 | 昼夜 1.5s 过渡、刷兵烟尘、三音效、圈墙受击 `ringHit` 火花、效果弱化一致性 | **PASS**（本轮实现） | `c04c7de` |
| WP5 | 完整三夜自然试玩、败局诊断与重置、回归、前后对比、本报告 | **PASS** | 本次提交 |

- **Node 回归**：计划 §4.1 六文件 **48/48**；有效基线八文件 **72/72**；`v027` 10/10、`v028` 6/6；`fail 0 / skipped 0 / todo 0`。
- **浏览器回归**：三条 runner 全 `OK`，`pageErrors=[]`、`afterCollapseSeconds ≈ 2.0 ≤ 5`、390×844 `siteFree 0.801 / dayFree 0.502 / overlap 0`。
- **性能**：40 敌夜晚 `nightMs 2.95`、白天 `dayMs 1.93`（改造前 3.66 / 2.40）；弱化粒子峰值 150 → 2（比值 0.013 ≤ 0.5）。
- **自然试玩**：最终一局完整打到**第 3 夜**（夜 1 击退 18、夜 2 击退 24、第 3 夜双路 32 兵后失守）；另跑 3 次未通关尝试与 1 次不布防败局。

---

## 1. 设计方向与不可违反的规则

**美术方向**：明亮的卡通中世纪边境聚落。饱和嫩绿草地、暖黄土路、亮蓝水面带浅沙岸；建筑带黑褐描边、2.5D 侧面与投影，城堡/箭塔蓝顶；UI 为深蓝板岩玻璃 + 金边、金色渐变按钮、带描边的亮色 SVG 图标。

**核心规则**（每次提交前自查，见计划 §0）：整圈城墙共享耐久、归零整圈倒塌；破墙后主城很快失守；居民真正走到建筑且到岗后仍可移动/召回/改派；资源地形不挡友军、开发后只显示生产建筑；顶栏只显示金币/材料/粮食/稀缺资源，天亮飘字 = `forecastIncome()`；**不得删断言、放宽阈值、改结果文件掩盖失败**。

**边界**：单文件离线可玩、入口文件名不变；`bg-scratch/` 不入库；仓库不留临时后门。原交接计划要求「不合并 `main`、不 push」，该约束已于 2026-11-16 由用户解除，v0.30 已推送并合并进 `main`（实际状态见 §10）。

---

## 2. 各工作包改动与取舍

### WP1 · 视觉与交互审计
替换渲染层：`PAL` 调色板、`hash2()` 稳定随机、`cachedLayer('terrain'|'fog')` 静态层缓存（`ctx` 由 `const` 改 `let`）、`castleArt()` 等 2.5D 建筑、领主/敌人/居民角色、整圈城墙（裂纹/雉堞/门楼/倒塌碎石）、`drawLighting()` 昼夜光孔、`drawToolPreview()` / `drawSelection()` / `drawGates()`；`GLYPHS` 加 `buildingGlyph()`；主题 CSS；`#eventBanner` + `showBanner()` / `worldFx()`，顶栏 `±N` 浮字、三选一卡牌插画圆、失败 toast 标红。
**取舍**：地形缓存让 `draw()` 从 7.8 ms 降到 3.3 ms（当时 1440×900 / 40 敌），代价是所有新绘制必须做渐变/离屏能力检测以兼容测试 VM 桩。

### WP2 · 真实输入引导与质量门
`tutorialStep()` 六步提示链（S1 选址 → S6 提前入夜）与 `recommendedDefenseTiles()` 共用 `guideStep()` 单一真源；`bindMapGestures()` 写 `game.hoverTile` 让悬停预览生效；`damageWallRing()` 采样 + `updateBattleHud()` 破墙倒计时；`collapseWall()` 把 `collapseAt / collapseSide / towersAtCollapse` 写进当夜账本，`failureDiagnosis()` 优先输出带倒塌字段的复盘。
**取舍**：引导只做「提示 + 地图高亮」，不代玩家操作、不改经济数值。首夜平衡矩阵 `idle-2t 0/2`。

### WP3 · 布局与多端（本轮补完取证）
小地图 `drawMinimap()` 全量 PAL 化；胜利 HUD 金边玻璃化；富/铁角标改纯图形双编码（菱形=富金 / 方块=铁蓝灰）；删除 7px 箭塔等级字（改由三色顶 + 木台色 + 旗色三重编码）；手机命令等比压缩。
**P7 拍板 ①b′**：工人数徽章从 `structure()` 抽成顶层 `drawProductionBadge(t)`，在 `drawSelection()` 之后、`drawLighting()` 之前晚绘一次，加 `t.visible` 守卫，坐标/色值/字号一字符不改。①a（画在光幕之上）会因夜间发亮被否；①b（fog 之前）夜景压暗问题未解。本轮实拍确认灰「空」在暗幕下仍可辨 → 硬前提成立，**不回退 ①a**。
**取舍**：P2 不改耐久牌信息架构（只放大字号）、P4 小地图维持 180×120、手机卡牌不引入横向滚动（改变可达性，未经用户同意不实施）。

### WP4 · 表现力与节奏（本轮实现）
`drawLighting()` 用 `game.clock / game.phaseElapsed` 在 1.5 秒内对 `globalAlpha` 插值（色标字面量与 `createLinearGradient` 调用次数逐字不动，守住既有断言）；`spawnEnemy()` 发 `worldFx('burst')` 烟尘；`AudioKit` 增 `build / dawn / collapse` 三音色（音符数组用 `ctx.currentTime + offset` 排程，禁用 `setTimeout`），`unlockAudio()` 关闭态不创建 AudioContext；圈墙受击用**新事件名 `ringHit`**（不复用 `structureHit`，避免污染 `v027-balance` 计数），火花 + 独立 500 ms 节流复用既有 `castle` 音色，**不新增第 4 个音效 kind**；`body.fx-weak` 关 CSS 动画、`worldFx('ring')` 加 `!weak`、`drawVictoryMarks()` 改用 `effectsWeak()`。
**取舍**：音频规格要求「恰好 3 个新音效」，圈墙受击因此复用音色而非新增 kind；弱化模式音频仍正常（音效只认 `settings.sound`）。

### WP5 · 试玩回归与交付（本轮）
详见 §5。另统一订正三份旧规格的「8 文件 77/77」静态统计口径（见 §9），同步 `wp2-ux-spec.md` §3.2 绘制位置到 ①b′，README「当前试玩文件」补 v0.30 说明。

---

## 3. 前后截图索引

完整逐组索引见 `tests/artifacts/v030-polish/compare/INDEX.md`（入库）；PNG 按仓库惯例留本地、不入库。

| 组 | 改造前 | 改造后 |
|---|---|---|
| 开局（1440×900） | `compare/start-before.png`（源 `bg-scratch/before/`） | `compare/start-after.png`（源 `v030-wp5/01-day1-start.png`） |
| 白天 / 夜战（桌面） | `compare/desktop-{day,night}-before.png` | `compare/desktop-{day,night}-after.png` + `*-compare.png` 拼接 |
| 卡牌 | `compare/cards-before.png`（源 `v029-hud-occlusion/cards-1440x900.png`） | `compare/cards-after.png`（源 `v030-wp5/03-growth-cards.png`） |
| 白天 / 夜战（手机 390×844） | `compare/mobile-{day,night}-before.png` | `compare/mobile-{day,night}-after.png` + `*-compare.png` 拼接 |
| 昼夜过渡六连帧 | `v030-wp4/before-transition-1..6.png` | `v030-wp4/transition-1..6.png` |
| 七视口 + 触控 | — | `v030-polish/viewports/`（28 张 + 4 张触控） |
| WP3 门禁复拍 / 补图 | — | `v030-wp3-reshoot/`、`v030-polish/tower-three-roofs*.png`、`wall-collapse-rubble*.png` |

---

## 4. 测试命令与结果

### 4.1 Node（项目目录直接运行，产物 `tests/artifacts/v030-wp5/regression-*.txt`）

```sh
# 交接计划 §4.1 原文口径（6 文件）
node --test tests/v029-workplaces.test.cjs tests/v029-rings.test.cjs tests/v029-ui.test.cjs \
  tests/v027-balance.cjs tests/v028-priority.cjs tests/v030-flow.test.cjs
# → # tests 48 / # pass 48 / # fail 0 / # skipped 0 / # todo 0

# 有效基线（8 个 *.test.cjs，含 WP1-FIX/WP2/WP3/WP4 新增）
node --test tests/v029-workplaces.test.cjs tests/v029-rings.test.cjs tests/v029-ui.test.cjs \
  tests/v030-flow.test.cjs tests/v030-lighting-capability.test.cjs tests/v030-wp2.test.cjs \
  tests/v030-wp3-badge-order.test.cjs tests/v030-wp4.test.cjs
# → # tests 72 / # pass 72 / # fail 0 / # skipped 0 / # todo 0

node tests/v027-balance.cjs   # 10/10
node tests/v028-priority.cjs  # 6/6
```

> **口径订正**：计划 §4.1 的 `48` 是 WP1 交接时 6 文件历史基线；三份旧规格写的 `77/77` 是 WP2 时期 `test(` 声明的**静态统计**，均非执行结果。有效基线由实跑确定为 **8 文件 72 项**。已在 `wp2-acceptance-plan.md` / `wp2-ux-spec.md` / `wp3-visual-spec.md` 头部加「WP5 口径订正」块，原文保留供溯源。`git diff cd4437a -- tests/` 对既有断言只有新增。

### 4.2 浏览器（产物 `tests/artifacts/v030-wp5-{hud,work,rings}/`）

```sh
BORDER_ARTIFACTS=tests/artifacts/v030-wp5-hud   node tests/v029-hud-occlusion-browser.cjs
BORDER_ARTIFACTS=tests/artifacts/v030-wp5-work  node tests/v029-workplaces-browser.cjs
BORDER_ARTIFACTS=tests/artifacts/v030-wp5-rings node tests/v029-rings-ui-browser.cjs
```

三条均 `OK`；六视口 `siteFree 0.801`、`dayFree 0.502`、`overlap 0`；`afterCollapseSeconds ≈ 2.0`；所有视口 `pageErrors = []`。

### 4.3 专项验收

| 项 | 结果 | 证据 |
|---|---|---|
| WP3 P7 复拍 | 两视口 `👤1` 徽章完整在上层、左缘无气泡遮挡；夜间灰「空」在暗幕下可辨 | `wp3-acceptance-report.md` / `v030-wp3-reshoot/` |
| WP3 七视口 | 28 张截图 + 28 组结构化测量全 PASS | `viewports/measurements.jsonl`、`criteria-result.txt` |
| WP3 触控 | 390×844 / 932×430 短按移动、长按 400 ms 详情、拖动平移、第 3 张卡真实点选 | `viewports/touch-*.png` |
| WP4 红绿 | 新测试 8 项：基线 7 fail → 实现 8/8 | `v030-wp4/red.txt`、`green.txt` |
| WP4 过渡 | 亮度 93.9→82.0→70.4→59.7→59.4（改造前恒定 59.3–59.4） | `v030-wp4/transition.log`、`before-*.log` |
| WP4 性能 / 弱化 | `nightMs 2.95 / dayMs 1.93`；峰值 150 / 2 | `v030-wp4/perf.log`、`weak-peak.log` |
| §4.4 五组前后对比 | 已补齐开局 / 白天 / 夜战 / 卡牌 / 手机（实为 6 组） | `compare/INDEX.md` |

---

## 5. 自然试玩记录（逐步「看到了什么」）

### 5.1 方法与边界
驱动脚本在仓库外 `bg-scratch/wp5-playthrough.cjs` 与 `wp5-fail-reset.cjs`。**状态变更只通过真实鼠标点击 / 键盘按键与游戏自身时钟**；`eval` 仅用于只读观测和把世界坐标换算成屏幕坐标。浏览器层面用 `Emulation.setEmulatedMedia` 把 `prefers-reduced-motion` 设为 `no-preference`（headless Chrome 默认报 `reduce`，会让标准模式也被弱化——这是**环境偏差修正，不是游戏状态注入**）。全程 `pageErrors = []`。

### 5.2 最终一局：第 1 天 → 第 3 夜（`v030-wp5/playthrough.txt`，截图 `01`–`15`）
1. **开局**：点「普通难度 · 开始守卫」。看到明亮嫩绿草地、亮蓝水面、金边玻璃顶栏 `14 金 / 30 材料 / 4 粮`，面板标题「探路 · 选择城址」，`#mapHint` 显示 **▶ 从底部选 A 或 B 前往探路**，地图上 A / B 两个金色框。
2. **选址建城**：点「前往 A · 西岭台地」→ 领主真实走到 `(5.5, 4.6)`、城址探明 → 按钮变「查看 A」→ 点「在此建立城堡」。看到横幅「城堡落成 · 整圈城墙已立起 · 开发周边资源，入夜前在敌袭方向建箭塔」，整圈城墙出现、耐久 600，提示切到「先选择一项开局强化」。
3. **选卡**：三张金边玻璃卡并排（卡面随机，含插画圆与「选择」按钮），标题「选择一项强化」；按防御优先选一张。提示切到「点领地内带金色 + 的资源点，开发成生产建筑」。
4. **开发 2 处资源**：点资源格 → 详情出现「开发资源点 2 材料 · 1 行动」→ 两处建成（如林场 + 农场 / 采石场），行动 `7 → 5`。看到旧自然图标被生产建筑替换。
5. **居民到岗与三动作**：点「派遣居民 1」→ 等真实 3.2 秒，居民走到建筑、`work:'working'`、建筑右上角出现 `👤1`。点居民所在位置 → 面板出现「移动 / 调回城堡 / 改派到林场 5,6 / 改派到农场 3,5」；点「移动」再点地图 `(5,5)` → `work` 变 `idle`；点「调回城堡」→ 回城待命；点「改派到林场 5,6」→ `work:'working'`、`building:'prod-1'`。**到岗后仍可移动/召回/改派，核心规则成立**。
6. **布防**：`#mapHint`「今夜敌军从西侧来：在该侧城墙内建 1–2 座箭塔」，推荐格 `(3,4)/(3,3)` 有金色虚线圈。本局为验证多夜循环，改用**一西一东**：西侧按推荐建 `(3,4)`，东侧建次日入口 `(31,4)` 最近的合法格 `(7,4)`，共 2 塔，行动 `5 → 3`、材料 `26 → 6`、金币 `14 → 6`。提示切到「准备好了可以提前入夜」。
7. **提前入夜**：点「提前入夜」，3 秒后横幅「第 1 夜敌军从西侧来袭 · 计划 18 名 · 守住城墙」，夜幕在 1.5 秒内由亮转冷蓝，主城仍有暖光。
8. **夜战操作**：点地图让领主出击到西侧 `(1,4)`，点「领主攻击」聚焦画布后**真实按空格 4 次**，期间击杀数增至 4；23.2 秒点「号令齐射」，本局因身边无敌返回 toast「领主周围 4 格内没有敌人，号令留到接敌时」（次数保留）。**号令命中成功**在 attempt1/2/3 中已取证：`号令齐射：领主周围 4 格内 1 名敌军受到 16 点伤害`、`rallyCharges 0`。
9. **天亮第 2 日**：约 65.7 秒天亮，击退 18 名，圈墙 `600 → 362`。横幅「天亮了 · 第 2 日击退 18 名敌军 · 收获 3 材料 · 3 粮食」；每个产出点飘出 `+3 粮食` / `+3 材料`，顶栏 delta `+1 / +3 / +3`（`+1` 为击杀金币），与 `forecastIncome() = {material:3, food:3}` 一致。截图 `10-dawn2-banner-and-income.png`。
10. **第 2 天 → 第 2 夜**：点主城格打开详情 →「修满城墙 5 材料」→ 墙回 600、材料 `9 → 4`；提前入夜。横幅「第 2 夜敌军从东侧来袭 · 计划 24 名」。19.2 秒时墙 474、kills 23；「夜间抢修城墙」因材料 `4 < 6` 置灰。**81.9 秒天亮第 3 日**，击退 24 名，`kills 42`，但墙只剩 **12**。
11. **第 3 天**：修墙需 `12` 材料、当日只有 `7` → 按钮置灰，无法补救；带 12 HP 提前入夜。横幅「第 3 夜敌军从西侧、东侧来袭 · 计划 32 名」。
12. **第 3 夜失守**：19.2 秒墙归零，横幅「城墙倒塌！整圈城墙已失效，主城即将失守 · 立刻回城接敌或急修」；61.1 秒 `phase='lost'`、`kills 57`。截图 `13`/`14`，日志 `FINAL`。**满足「至少打到第 3 夜」，且完整经历双路夜战与破墙。**

### 5.3 三次未通关尝试（保留为平衡证据，`v030-wp5/attempt1..3/`）
| 尝试 | 策略 | 结果 |
|---|---|---|
| attempt1 | 首日按推荐只在西侧建 2 塔，天亮不修墙、不补防 | 第 2 夜东侧来袭 **25 秒**破墙（460→0），kills 18 |
| attempt2 | 第 2 天补东侧塔 `(7,4)`（共 3 塔），不修墙 | 第 2 夜撑到 **79.2 秒**、kills 39，仍破墙 |
| attempt3 | 选防御卡 + 修满墙 + 拆一座西塔换材料 | 拆塔削弱火力，**48.6 秒**失守 |

三次都如实记录，未删改判定。最终改为「首日一西一东 + 每天只修墙、不拆塔、不额外花材料」才打到第 3 夜。

### 5.4 不布防败局与诊断（`v030-wp5/fail-reset.txt`，截图 `20`–`22`）
普通难度 → 建城（**不建任何塔**）→ 提前入夜。第 1 夜 **23.2 秒**失守、击杀 0、圈墙 0。失败页 `.diagnosis` 全文：
> 「第 1 夜 21 秒城墙倒塌（敌军从 **西** 侧集中拆墙），当时箭塔 **0 座**。下局在该侧城墙内放 2 座箭塔，入夜前修满城墙。」

账本 `collapseBooks = [{night:1, at:21, side:'west', towers:0}]`，`failureDiagnosis()` 与页面文本逐字一致。**三字段齐全、建议可执行**，验证 WP2 失败诊断价值。

### 5.5 「开始新一局」状态完全重置（截图 `23`）
点失败页「开始新一局」后，与**同一会话里全新开局的快照逐字段比对**（排除自然推进的 `elapsed`）：`diff = []`，16 项判据全 `true`——`day 1 / phase day / 无城堡 / 敌人 0 / 击杀 0 / finished false / result null / notes 0 / 墙环 0 / 塔 0 / 已开发 0 / 资源 14·30·4 / 领主满血 / 无对话框 / 提示与标题回到探路`。
> 口径说明：`makeGame()` 初始化时就会建 **1 条当夜账本**，所以 `ledgerKeys === 1` 是初始态而非残留；首版曾误判为「应为 0」，已改为与全新开局比对。

### 5.6 胜利页（**夹具，非自然试玩**；截图 `24` / `25`）
新标签页普通难度开局后，用夹具 `game.day = 5; sync()` 与 `finish(true)` 触发：`#march` 夜次页签显示 1–4 夜 `done`、第 5 格「首领」`boss + current`；胜利页 `phase='won'`、`#victoryCard` 可见、标题「你守住了边境」、横幅「边境守住了！」。**第 5 夜自然通关（含首领战）本轮未做**，不得据此宣称五夜可通关。

---

## 6. 平衡依据与本轮试玩发现

### 6.1 交接时的数字（计划 §1.1）
- `V029.wallHit = {normal:7, heavy:14, boss:30}`（旧值 12/22/35）。依据：seed 42/7 首夜单塔挂机，旧值 **1/2 局失守**，新值 **0/2 局失守**、圈墙剩 89/600；完全不设防依旧失守。
- QA-STALL-01 修复：`cornerCutBlocked` 只在同时跨越行列边界时判穿角，避免敌人卡死导致天不亮。
- 显式波次表 `NIGHT_PLAN`：夜 1 `18 兵 / stop 75s / cap 10`、夜 2 `24 兵 / stop 80s / cap 14`、夜 3 `32 兵 / stop 90s / cap 18`（双路）、夜 4 40、夜 5 48。
- 白天首日 120 s、之后 90 s，每天 7 次行动；「提前入夜」3 秒倒计时可取消。主城 50 HP、圈墙 600 HP。
- 箭塔射程 `2.35 + level*0.25 + ranks*0.16` 格；日修墙成本 `ceil(missing/600 * 12)`（下限 1 材料）；夜间抢修 6 材料 / 6 秒。

### 6.2 本轮自然试玩暴露的三条真实现象（**观察，不改规则**）
1. **单侧布防与每日换边不兼容**：塔射程仅 2.35 格，夜 1 从西侧、夜 2 从东侧、夜 3 双路。首日引导只说「在敌袭侧建 1–2 座箭塔」，玩家照做后第 2 夜 25 秒破墙。补东侧塔后能撑到 79.2 秒（接近 80 秒天亮），但最终采用「首日一西一东 + 每天修墙」才进入第 3 夜。**这是引导文案与实际节奏的口径缺口，不是代码缺陷**。
2. **修墙成本与材料产出错配**：第 3 天墙剩 12 → 日修需 12 材料，而当日只有 7（天亮 +3 材料、夜间抢修需 6 也付不起），按钮置灰，玩家无法补救，只能带 12 HP 入夜并 19.2 秒倒塌。
3. **地图/卡牌随机性显著影响可达夜数**：4 局中资源点类型（产材料 vs 产粮/金）与三选一卡面均随机，材料预算在 0–12 之间波动；同一策略在不同种子下结果差异大。`makeGame()` 无玩家可见种子输入，无法做严格同种子对照。

### 6.3 建议（交用户拍板，本轮不实施）
- S5/S6 引导补一句「敌袭方向每天会变，建议在两侧各留 1 座塔，并预留材料在入夜前修满城墙」；
- 或调整 `dayRepairFullCost` / 天亮材料产出，避免第 3 天出现「想修也修不起」；
- 二者都属**规则改动**，按测试纪律须写进报告并另开任务，本轮仅记录。

---

## 7. 体验清单逐条对应（§4.3）

| 玩家的问题 | 本轮证据 | 判定 |
|---|---|---|
| 我现在该做什么？ | `v030-polish/guide-1..6.png` 六步 ▶ 提示 + `v030-wp5/01-day1-start.png`；推荐格金圈 `06-s5-recommend.png` | PASS |
| 选中了什么？ | `guide-5-toolmode.png` 四角金框 / 箭塔射程；WP1 视觉审计；`07-two-towers-and-guide.png` | PASS |
| 在哪里可以建造？ | `wp2-hover-preview.png`、`hover-legal.png` / `hover-illegal.png`（金框 vs 红框斜线） | PASS |
| 居民去了哪里？ | `v030-wp5/05-resident-arrived.png`、`v030-wp3-reshoot/day-working-*.png` 徽章；详情「前往 林场（5,6）」 | PASS |
| 资源为什么变化？ | `10-dawn2-banner-and-income.png` + `DAWN2-CHECK`：`forecastIncome()` 与飘字 / delta 一致；失败 toast 标红 | PASS |
| 城墙还能撑多久？ | WP2 runner 耐久牌 / 夜间状态栏；`13-night3-begin.png`、`14-night3-fighting.png` 倒塌横幅 | PASS |
| 我为什么失败？ | `22-failure-diagnosis.png` + `LOST-STATE`（第 1 夜 21 秒 / 西侧 / 塔 0 座 / 下局建议） | PASS |

## 8. 视觉清单（§4.4）
四类生产建筑、箭塔、主城、营地轮廓区分且缩到 50% 可辨（WP1 视觉审计 + `v030-polish/tower-three-roofs-zoom.png` 蓝/红/紫三色顶）；白天明亮嫩绿、夜晚冷蓝且主城/领主/箭塔有暖光（`compare/*-night-after.png`、`v030-wp4/transition-5.png`）；40 敌夜晚单位与血条可辨、`nightMs 2.95 / dayMs 1.93` 达标；按钮/面板/卡牌统一金边玻璃风（`viewports/cards-*.png`）；前后对比六组齐备（`compare/INDEX.md`）。

---

## 9. 剩余问题与未验证项

- **未做真人试玩**：首次游玩的玩家能否在无人提示下完成建城、开发与首夜布防，本轮操作者均为 AI。
- **未做手机真机**：触摸延迟、帧率、小屏密集战斗可读性；触屏证据仅是 CDP 模拟。
- **未做音效真人试听**：`build / dawn / collapse` 三音色与 `collapse` 低频 130→65 Hz 在小喇叭上的可闻性未验证，不得宣称听感合格。
- **第 5 夜自然通关未做**：胜利页 / 分夜复盘 HUD 仅由夹具触发（§5.6），首领战与五夜循环的自然流程仍待验证。
- **第 3 夜失守的材料缺口**（§6.2-2）与**引导只提单侧**（§6.2-1）待用户拍板是否调整规则。
- **WP3 顺延的两条目视观察项**：932×430 折叠按钮与开局简报短时叠压、390×844 入夜横幅短时盖住简报；均不判 FAIL，未修。
- **文档口径**：三份旧规格（`wp2-acceptance-plan.md`、`wp2-ux-spec.md`、`wp3-visual-spec.md`）已加「WP5 口径订正」块声明 `77/77` 作废、有效基线 72；`wp2-ux-spec.md` §0.1 / §3.2 / §7 已同步到 ①b′。原文数字保留供溯源。
- **证据文件**：本轮新增的 WP3/WP4/WP5 取证 PNG 与 `browser.json` 按仓库惯例留本地未入库；`compare/` 的前后对比图（WP1/WP2 的 12 张 + 交付时补齐的开局/卡牌 4 张）随 `INDEX.md` 一并入库。其余入库的是文档、测量 JSONL、红绿日志、回归文本与测试代码。仓库 `.gitignore` 忽略 `*.log`，故试玩日志以**同源 `.txt` 入库**（`v030-wp5/playthrough.txt`、`fail-reset.txt`、`attempt1..3/playthrough.txt`、`regression-*.txt`），本地 `.log` 为逐字副本；`v030-wp4/*.log`（亮度/性能/弱化曲线）仅留本地，其结论已写进 `wp4-acceptance-report.md`。`bg-scratch/` 全程不入库。

---

## 10. 提交与交付状态

**已推送并合并进 `main`（2026-11-16）**。WP1–WP5 共 **8 个提交**在 `codex/claude-gameplay-art-layout` 分支完成（`cd4437a` … `f4a6230`），已 push 到 `origin/codex/claude-gameplay-art-layout`；随后由 merge commit `21d89f2 Merge v0.30 polish (WP1–WP5) into main` 合并进 `main` 并 push 到 `origin/main`。本次交付状态同步提交同时应用到两条分支，因此两个远端分支的树内容一致。

原交接计划中的「不合并 `main`、不 push」是**开发期约束**，由用户在 WP1–WP5 全部验收通过后解除；计划正文保留原文并加「交付后状态更新」块供溯源。

`grep -n "__wallHit\|window.__" Border-Guard-v0.29.html` 无结果（`window.FW` 测试钩子除外）；入口文件名不变；PNG 证据按仓库惯例留本地。
