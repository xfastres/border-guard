# 边境守卫 v0.30 打磨 · 交接执行计划

> 写给接手的 AI。照本文件逐步执行，每个工作包按「验收标准」自检通过后才进入下一包。
> 所有工作都在 `D:\Work\game\border-guard` 原目录、`codex/claude-gameplay-art-layout` 分支上完成。
> 不要克隆、不要建 worktree、不要另做演示页；不合并 `main`、不推送。

---

## 0. 目标与不可违反的规则

**目标**：把 `Border-Guard-v0.29.html`（入口文件名保持不变，单文件、离线、双击可玩）打磨成可公开展示的独立策略 Demo：第一眼好看，几分钟能看懂，打完第一夜还想继续玩。

**美术方向**（参考图）：明亮的卡通中世纪边境聚落。草地是饱和的嫩绿，道路是暖黄土色，水是亮蓝并带浅沙岸；建筑带黑褐描边、2.5D 侧面和投影，城堡和箭塔用蓝顶。UI 用深蓝板岩玻璃面板加金边，按钮是金色渐变，图标是带描边的亮色 SVG。

**核心规则（任何改动都不得破坏，每次提交前自查）**

| 规则 | 怎么自查 |
|---|---|
| 城墙整圈共享耐久，归零整圈倒塌 | `tests/v029-rings.test.cjs` 全绿；地图上只有一条圈耐久牌，没有逐段血条 |
| 破墙后主城很快失守 | `node tests/v029-rings-ui-browser.cjs` 输出 `afterCollapseSeconds` ≤ 5 |
| 居民真正走到对应建筑，到岗后仍可移动、召回、改派 | `tests/v029-workplaces.test.cjs` + `tests/v029-workplaces-browser.cjs` 全绿 |
| 资源地形不挡友军；开发后清掉旧自然图标，只显示对应生产建筑 | 同上（含绘制契约测试：`structure/nodeArt/drawFoliage` 函数名必须保留） |
| 资源、费用、收入与界面一致 | 顶栏只显示金币/材料/粮食/稀缺资源，不虚构木材、石料；天亮飘字数值 = `forecastIncome()` |
| 测试纪律 | 不得删断言、放宽阈值、改结果文件来掩盖失败；有意改规则要写进报告并附依据 |

---

## 1. 当前状态（交接时刻）

### 1.1 已提交

`cd4437a fix: unstick enemies misread as corner-cutting and soften ring wall hits`

- **QA-STALL-01 修复**：`cornerCutBlocked` 只在同时跨越列边界和行边界时才判为穿角。旧版下，敌人被分离力推离格心后，四个方向都走不了，原地卡死，天一直不亮（seed 7、单塔时卡了 225 秒）。
- **圈墙每击伤害参数化**：新增 `V029.wallHit = {normal:7, heavy:14, boss:30}`（旧值 12/22/35），通过 `wallBlow(e)` 读取。依据：seed 42/7 首夜单塔挂机，旧值 1/2 局失守，新值 0/2 局失守、圈墙剩 89/600；完全不设防依旧会失守。
- 新增 `tests/v030-flow.test.cjs`（在旧 HEAD 上是红的）。`tests/v029-rings.test.cjs` 第 209 行的致死夹具改成 `V029.wallHit.normal - .5`，不再写死 11.5。

### 1.2 未提交（都在 `Border-Guard-v0.29.html` 里，Node 回归 48/48 通过，**浏览器里还没验收**）

1. **新渲染层**：替换了原来从 `function rect(` 到 `/* v0.20：地图相机只平移 #mapWorld` 之间的全部代码。
   - `PAL` 调色板、`hash2()`（按格坐标取稳定随机数，不消耗 `game.rnd()`）、`OUT` 描边色。
   - 地形：嫩绿草地带草叶和小花，圆角土路，水面带沙岸；水波由 `waterShimmer()` 单独绘制。
   - **静态层缓存** `cachedLayer('terrain'|'fog', key, paint)`：渲染时把全局 `ctx` 临时切到离屏画布（所以 `ctx` 由 `const` 改成了 `let`）。实测 1440×900、40 个敌人的夜晚，`draw()` 从 7.8 ms 降到 3.3 ms，白天 1.7 ms。
   - 建筑：`castleArt()` 是三塔蓝顶主城带飘旗；农场是红顶谷仓加风车加麦田；林场是木屋、原木堆和斧子；采石场是岩坑、石块和吊架；矿场是山体、矿口支架、矿车和矿点，富矿/铁矿另有角标；箭塔是石基蓝顶，升级后换成红顶或紫顶。
   - 角色：领主（金色地环、蓝披风、头盔、挥剑动画），敌人（绿皮掠夺者，重甲和首领带冠），居民（按职业区分衣色和工具，腿部有走动动画，头顶状态气泡：⛏/🪓 表示作业中，→ 在途，! 待缴，休，? 受阻），民兵。
   - 整圈城墙：先画投影、描边、墙身和高光，再画雉堞、按耐久出现的裂纹、拐角塔楼、竖立的门楼。全圈只有一块耐久牌，放在圈下沿，受击时闪白；倒塌后画碎石残段。
   - 光照 `drawLighting()`：白天叠暖光；夜晚是蓝色暗幕，主城、领主、箭塔和营地处开光孔并叠暖色火光。
   - 交互可视化：`drawToolPreview()` 在选中工具时高亮所有合法地块；`drawSelection()` 画四角选框，选中箭塔时显示射程；`drawGates()` 用红色脉冲标出今夜敌袭入口；居民手动移动时画蓝色虚线指向目标。
2. **图标**：`GLYPHS` 表加上 `buildingGlyph(kind,size)`，覆盖建筑、资源、卡牌、战斗和支援，全部是内联 SVG。
3. **主题 CSS**：追加在 `</style>` 前，以 `/* ===== v0.30 界面主题` 开头。
4. **事件表现**：
   - 新增 DOM `#eventBanner`，以及 `showBanner(title,sub,tone)` 和 `worldFx(kind,x,y,text,color)` 两个函数。
   - 已接入：建城、开发、建塔、占地、入夜、天亮收获（每个产出点飘字）、居民到岗、整圈倒塌（横幅加震屏）、胜利/失败。
   - 白天也会推进 `updateEffects`，飘字不会卡住。
   - 顶栏资源变化时出现 `+N/-N` 浮字（`.stock .delta`）。
   - 三选一卡牌加了插画圆、三种色调和入场动画，以及标题「选择一项强化」和说明 `#cardSub`。
   - `toast()` 遇到失败类文案时自动标红（`.bad`）。

### 1.3 已知待办（截图和代码审读中发现，尚未处理）

- `drawToolPreview()` 读 `game.hoverTile`，但**还没有代码给它赋值**，鼠标悬停预览目前不生效。
- `#mapHint.next` 的样式已经写了，但 `renderUI()` 还没加这个 class。
- 小地图 `drawMinimap()` 仍用旧配色，和新地图不一致。
- 胜利 HUD（`#victoryCard` 等）还是旧样式。
- 首夜没有任何布防时 16~23 秒就失守，这是设计使然，但新玩家并不知道必须建塔，需要引导（见 WP2）。

---

## 2. 工具（已在本机，仓库外）

目录 `D:\Work\game\bg-scratch\`（勿提交进仓库）：

| 文件 | 用途 |
|---|---|
| `cdp.cjs` | CDP 驱动，多个命令用 ` ;; ` 分隔。`open W H [touch]` 每次新建空白 tab 并关掉旧页（规避 beforeunload 卡死），视口写入 `vp.json` 跨调用保持；`clicktext 文本`、`clicksel CSS选择器`、`click x y`、`tile gx gy`（真实鼠标点格心）、`tiletap gx gy [ms]`（真实触控，长按传 400）、`key K`、`wait ms`、`eval 表达式`、`evalfile 路径`、`shot 名称或路径`、`zoom 文件 x y w h 倍率` |
| `scenes.sh OUT W H [touch]` | 依次截开局、白天夹具、夜晚夹具三张图 |
| `fx/day-scene.js` / `fx/night.js` / `fx/perf.js` | **状态夹具**（截图和性能专用，非自然流程证据，报告里必须标注） |
| `sim/matrix.cjs <html> <day>` | 首夜平衡矩阵（2 个种子 × 塔数 × 挂机或参战），可用环境变量 `WH='{normal:7,heavy:14,boss:30}'` 临时覆盖 |
| `before/` | 改造前截图（1440×900、390×844 的 start/day/night），用于前后对比 |

启动常驻无头 Chrome（后台运行）：

```sh
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --no-first-run --remote-debugging-port=9333 --user-data-dir=D:/Work/game/bg-scratch/profile about:blank
```

注意：

- Git Bash 下不要用 `pkill`；也不要按命令行关键字批量结束进程，这会把自己的 shell 也杀掉。
- `cdp.cjs` 的参数要整体加双引号。
- 浏览器回归统一设 `BORDER_ARTIFACTS=tests/artifacts/v030-<名称>`，不要覆盖旧证据目录。

---

## 3. 工作包

每个工作包结束都要：跑 §4.1 的 Node 回归，看至少一张实际截图，再提交一次。提交信息末尾加 `Co-Authored-By` 行。

### WP1 · 验收并提交视觉层（先做）

1. 启动 Chrome。依次执行 `bash scenes.sh D:/Work/game/bg-scratch/after 1440 900` 和 `... 390 844 touch`，逐张查看截图。
2. 用 `zoom` 放大主城区域（例如 `zoom 文件 40 100 480 420 2`），逐项核对：
   - 四种生产建筑轮廓互不相同，且没有一个被画成箭塔；
   - 开发后的格子上没有残留树、石或麦田图标；
   - 工人显示在对应建筑格内，头顶有作业气泡；
   - 整圈城墙闭合，门楼竖直，耐久牌在圈下沿，没有压住主城；
   - 迷雾边缘柔和，已探明区域明亮。
3. 打开开发者控制台日志：`cdp.cjs` 输出里出现 `EXC` 或 `CONSOLE error` 就修。
4. 重点检查新 CSS 是否破坏布局，必须跑：`node tests/v029-hud-occlusion-browser.cjs`。可能触线的断言：选址底栏宽 < 520、折叠图例和小地图高度 ≤ 60、详情空闲比 ≥ 0.45（矮横屏 ≥ 0.48）、三卡可命中。**失败时改 CSS，不改断言。**
5. 提交：`feat: bright cartoon renderer, icon set, HUD theme and event banners`。

**WP1 验收**

- [ ] Node 回归全绿（§4.1）
- [ ] 三个 v029 浏览器 runner 全部 OK，`pageErrors=[]`
- [ ] 性能：在 1440×900 白天夹具下执行 `evalfile fx/perf.js`，`nightMs ≤ 8`、`dayMs ≤ 4`
- [ ] 前后对比图各 2 张（桌面、手机），保存到 `tests/artifacts/v030-polish/compare/`

### WP2 · 新玩家引导与「我现在该做什么」

按以下顺序实现，每项都要有真实操作截图。

1. **悬停预览**：在 `bindMapGestures()` 的 `board` 上加 `pointermove`（仅限 `pointerType==='mouse'`），用 `screenToGrid` 算出格子，写入 `game.hoverTile=at(x,y)`；`pointerleave` 时置 null。验收：选中「箭塔」后，鼠标悬停在合法格显示金框，非法格显示红框加斜线。
2. **下一步提示链**：扩展 `tutorialStep()`，让第 1 天按以下顺序给出唯一提示，并在 `renderUI` 里给 `#mapHint` 加 `.next` class：
   1. 未建城：「从底部选 A 或 B 前往探路」
   2. 卡牌待选：「先选择一项开局强化」
   3. 无开发：「点领地内带金色 + 的资源点，开发成生产建筑」
   4. 有建筑但无工人：「点生产建筑，派遣居民去工作」
   5. 敌袭方向没有箭塔：「今夜敌军从西/东侧来：在该侧城墙内建 1–2 座箭塔」
   6. 完成：「准备好了可以提前入夜」
3. **推荐布防格**：第 5 步提示出现时，在地图上用金色虚线圈出离今夜入口（`entrances(game.day)[0]`）最近的 2 个合法箭塔格（`canBuildAt(t)&&!t.building`）。这只是绘制，不自动建造。
4. **生产建筑工人数徽章**：在 `structure()` 中，生产建筑右上角画「👤N」（`productionBuildings.get(id).assignedResidentIds.length`）；N=0 时画灰色「空」，提示可以派工。
5. **居民详情可读化**：`inspect()` 居民分支中，把「目的地格 x,y」改成「前往 林场（5,6）」这种「建筑名 + 坐标」的写法；「改派到…」按钮保留坐标。
6. **城墙还能撑多久**：夜间在 `updateBattleHud()` 里，用最近 5 秒圈墙伤害估算 `剩余 hp ÷ DPS`。估算值低于 30 秒时，在城墙状态后追加「约 N 秒破墙」并标红（`critical`）。新增一条 Node 测试：喂入固定伤害序列，验证估算值正确。
7. **失败原因**：`failureDiagnosis()` 在圈墙倒塌过时优先给出：「第 N 夜 X 秒城墙倒塌（敌军从 西/东 侧集中拆墙），当时箭塔 K 座。下局在该侧城墙内放 2 座箭塔，入夜前修满城墙。」所需数据由 `collapseWall` 写入 `game.ledger[day]`（新增 `collapseAt`、`collapseSide`、`towersAtCollapse` 字段，只增不改）。

**WP2 验收**

- [ ] 用真实鼠标从开局走到第 1 夜：每一步 `#mapHint` 都恰好显示上面对应那条文案（截图 6 张，`tests/artifacts/v030-polish/guide-*.png`）
- [ ] 按推荐格建 2 座塔后挂机，首夜不失守（seed 42 和 7 在 VM 中复现：`sim/matrix.cjs` 的 `idle-2t` 为 0/2 失败）
- [ ] 新增的 Node 测试（DPS 估算、失败诊断含倒塌字段）先红后绿
- [ ] 提交：`feat: guided first day, hover placement preview and wall time-to-breach`

### WP3 · 布局与多端

1. 对 7 个视口逐一跑 `scenes.sh`：1440×900、1920×1080、1108×1195、886×956、1108×720、932×430（touch）、390×844（touch）。
2. 逐张检查：没有横向滚动条；顶栏资源不换行、不裁切；底栏按钮文字不竖排；详情面板与底栏不重叠；三张卡并排且「选择」按钮可见；横幅不挡住主城。
3. 小地图配色：`drawMinimap()` 改用 `PAL`（草地 `#86b555`、水 `#4fa6c9`、路 `#d8b77a`、领地加亮），城墙画浅石色，倒塌画红点。
4. 胜利 HUD：`#victoryCard` 及其按钮套用新主题（玻璃底、金边、金色主按钮）。
5. 手机端（≤600px）：资源只显示图标加数字（已由 CSS 实现），底栏一屏至少完整显示 4 个命令；`#eventBanner` 不得遮住顶栏。

**WP3 验收**

- [ ] 7 视口截图保存到 `tests/artifacts/v030-polish/viewports/`，逐张通过上面的清单
- [ ] `v029-hud-occlusion-browser.cjs`、`v029-rings-ui-browser.cjs` 全绿
- [ ] 932×430 和 390×844 用触控（`tiletap`）完成：短按移动、长按 400 ms 打开详情、拖动平移、点卡牌选中
- [ ] 提交：`fix: responsive HUD polish, themed minimap and victory card`

### WP4 · 表现力与节奏

1. **昼夜过渡**：入夜后前 1.5 秒，夜幕 alpha 从 0 线性升到 0.58；天亮后 1.5 秒内暖光淡入。实现方式：在 `drawLighting` 里按 `game.clock`（夜）或 `game.phaseElapsed`（日）插值。
2. **刷兵烟尘**：在 `spawnEnemy` 末尾调用 `worldFx('burst', from.x+.5, from.y+.5, '', '#c9b48a')`。
3. **音效**：给 `AudioKit` 增加 `build`（上扬三角波）、`dawn`（两音上行）、`collapse`（低频方波，0.4 秒），分别在建成、天亮、倒塌时播放。音效开关仍然有效。
4. **城墙受击**：`structureHit` 之外，圈墙受击也要发 `emitCombatEvent({kind:'structureHit',…})` 以产生火花和音效（不改伤害）。注意 `tests/v027-balance.cjs` 会统计 `structureHit` 事件数；若因此变红，要确认它统计的场景里没有圈墙，否则改用新的事件名 `ringHit`。
5. **弱化效果**：菜单「效果：弱化」以及 `prefers-reduced-motion` 打开时，新加的粒子、震屏、卡牌和横幅动画都要关闭或减弱（CSS 已有 reduced-motion 规则；JS 侧走 `effectsWeak()`）。

**WP4 验收**

- [ ] 用 `screencast` 或连续 6 张、间隔 250 ms 的截图证明昼夜过渡平滑
- [ ] 性能仍满足 WP1 的阈值
- [ ] 效果弱化后，40 敌夜晚 `game.effects.length` 峰值 ≤ 标准模式的一半
- [ ] 提交：`feat: day-night transitions, spawn dust, new sounds and ring hit sparks`

### WP5 · 完整自然试玩、回归与报告

1. **自然试玩**（禁止 `eval` 改状态，只用 `clicktext`、`tile`、`key` 这类真实输入，等真实时钟）：
   1. 普通难度开局 → 前往 A → 查看 → 建城 → 选卡
   2. 开发 2 处资源 → 派居民 1 去林场 → 居民到岗后点它「移动」到别处 → 「调回城堡」→ 再「改派」到另一建筑
   3. 在敌袭侧建 2 座箭塔 → 提前入夜 → 夜战中领主出击、按空格攻击、使用一次号令
   4. 天亮后检查：横幅、每个产出点的飘字、顶栏 delta 与 `forecastIncome()` 一致
   5. 至少打到第 3 夜；再开一局故意不布防，确认失败页的诊断里有倒塌信息 → 点「开始新一局」，确认状态完全重置
   6. 胜利路径：允许用夹具把 `game.day` 设为 5 来验证胜利页和 HUD，但必须在报告里标注是夹具
2. 跑 §4.1 和 §4.2 的全部命令，记录数字。
3. 写 `docs/v030-polish-report.md`，内容包括：设计方向、各工作包的改动与取舍、前后截图索引、测试命令和结果、自然试玩记录（逐步写看到了什么）、平衡依据（§1.1 的数字）、剩余问题和未验证项（真机未测、真人未测）。
4. 在 README「当前试玩文件」一节补一句 v0.30 打磨说明（入口文件名不变）。
5. 提交：`docs: v0.30 polish report, playthrough evidence and README`。

---

## 4. 最终验收标准（全部满足才算完成）

### 4.1 Node 回归（项目目录直接运行）

```sh
node --test tests/v029-workplaces.test.cjs tests/v029-rings.test.cjs tests/v029-ui.test.cjs tests/v027-balance.cjs tests/v028-priority.cjs tests/v030-flow.test.cjs
```

- 交接时为 **48/48**；完成后应 ≥ 48 + 新增测试数，**0 失败**。
- `git diff cd4437a -- tests/` 中，对已有断言只能新增，不能删除或放宽。

### 4.2 浏览器回归

```sh
BORDER_ARTIFACTS=tests/artifacts/v030-hud     node tests/v029-hud-occlusion-browser.cjs
BORDER_ARTIFACTS=tests/artifacts/v030-work    node tests/v029-workplaces-browser.cjs
BORDER_ARTIFACTS=tests/artifacts/v030-rings   node tests/v029-rings-ui-browser.cjs
```

- 三条都输出 `OK`；`afterCollapseSeconds ≤ 5`；`pageErrors` 为空。

### 4.3 体验清单（每条都要对应一张截图或一段操作记录）

| 玩家的问题 | 合格表现 |
|---|---|
| 我现在该做什么？ | 第 1 天每个阶段 `#mapHint` 都有唯一的 ▶ 下一步提示；要用的目标在地图上有高亮 |
| 选中了什么？ | 地块有四角金框，箭塔显示射程，居民脚下有虚线光圈，城墙选中时金色虚线描边 |
| 在哪里可以建造？ | 选中工具后所有合法格整体高亮，悬停格分金框（合法）和红框加斜线（非法） |
| 居民去了哪里？ | 头顶状态气泡、移动目标的蓝色虚线；生产建筑上显示工人数徽章；详情里写明「前往 某建筑（坐标）」 |
| 资源为什么变化？ | 顶栏 ±N 浮字；天亮时每个建筑上飘出产量，并有横幅汇总；失败的操作给出红色 toast 说明原因 |
| 城墙还能撑多久？ | 圈墙耐久牌和夜间状态栏实时更新；低于 30 秒时显示「约 N 秒破墙」并标红 |
| 我为什么失败？ | 失败横幅加复盘面板，诊断写明哪夜、几秒、哪个方向破墙，以及当时有几座塔、下局怎么做 |

### 4.4 视觉清单

- [ ] 四种生产建筑、箭塔、主城、营地轮廓各不相同，缩到 50% 仍能分辨
- [ ] 白天明亮、夜晚冷蓝，并且有可见的暖色光源
- [ ] 40 个敌人时，单位和血条仍可分辨，帧耗时达标
- [ ] 所有按钮、面板、卡牌风格统一（金边玻璃风）
- [ ] 前后对比：`before/`（旧）对 `tests/artifacts/v030-polish/compare/`（新），至少包含开局、白天、夜战、卡牌、手机五组

### 4.5 提交与交付

- 预期 5 个左右的清晰提交（WP1–WP5），全部在 `codex/claude-gameplay-art-layout` 分支；**不合并、不推送**。
- 仓库里不得残留临时后门（`grep -n "__wallHit\|window.__" Border-Guard-v0.29.html` 应无结果，`window.FW` 测试钩子除外）。
- 不提交 `tests/artifacts/v030-baseline/`（改造前基线）以外的临时文件；`bg-scratch/` 不入库。
- 交付说明包括：可玩文件、前后截图、测试命令和结果、自然试玩记录、设计取舍、剩余问题（至少列出「未做手机真机」和「未做真人试玩」）。

---

## 5. 常见坑

- **测试 VM 的 canvas 是桩**：`createRadialGradient` 等会返回空函数。新加的绘制只要用到渐变或离屏画布，都要像 `drawLighting` / `cachedLayer` 那样做能力检测后再用。
- **`ctx` 是 `let`**：`cachedLayer` 会临时替换它。新的绘制函数要用全局 `ctx`，不要在别处缓存 `const g=ctx`。
- **地形缓存的失效键**：`navigationRevision()|已占领格数|seed`。如果新增会改变地形外观的操作（例如拆除后恢复草地），必须调用 `invalidateNavigation()`，否则画面不会刷新。
- **函数名契约**：`structure`、`nodeArt`、`drawFoliage` 会被测试整体替换来统计调用，`draw()` 里必须按名字调用它们，不要改成局部引用。
- **CDP 时序**：点击后至少等 150 ms 再读 DOM；切换视口后等 400 ms（`cdp.cjs` 已内置）。
- **beforeunload**：开局后刷新会弹出确认框，导致页面卡住。永远用 `open`（新 tab）重新进入游戏。
