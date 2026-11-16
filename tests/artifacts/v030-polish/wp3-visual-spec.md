# WP3 · 视觉规格（预研，待 WP2 质量门放行后实现）

| 项 | 内容 |
|---|---|
| 工作包 | WP3-VIS-SPEC-01 · **只写视觉规格，不实现** |
| 角色 | 林绘澄（art-director）· 视觉方向负责人 |
| 团队 | `border-guard-v030-polish` |
| 输出 | `tests/artifacts/v030-polish/wp3-visual-spec.md`（本文件，**未提交**） |
| 依据 | `docs/v030-handoff-plan.md` §3 WP3 / §4.4 / §1.3 / §5；`wp1-visual-audit.md` 终版 §6.2 裁定 B、§6.3 剩余补图、§6.4 观察；`wp1-acceptance.json`；`wp2-ux-spec.md`（范围边界） |
| 状态 | **规格待审**。实现须等 WP2 质量门由主理人放行后才开始 |
| ⚠️ WP5 口径订正（2026-11-16，主理人） | 本文 §3.5 / §4.4 等处「8 文件基线 77/77 / ≥77 + WP3 新增」为 WP2 时期**静态 `test(` 声明统计**，非执行结果，现已作废。有效基线由实跑确定：八个 `*.test.cjs` = **72 项**（WP3 +3、WP4 +8），计划 §4.1 六文件 = **48 项**，`v027-balance` 10/10、`v028-priority` 6/6。判据以 `docs/v030-polish-report.md` 为准；**不得删断言/放宽阈值的纪律不变**。P7 最终拍板为 **①b′**（`drawProductionBadge(t)` 顶层晚绘），见 `wp3-p7-ds-signoff.md`。 |
| 边界 | 本轮**未**改游戏代码、**未**启动/操作 Chrome、**未**跑 `cdp.cjs`/`scenes.sh`、**未**自行截图、**未**提交、**未** push |

> ⚠️ **行号漂移警告（给实现者）**：本文件审读时 WP2 实现与 engineering-lead 的 `L5044` 能力检测修复正在改同一个 `Border-Guard-v0.29.html`，相对 WP1-ART-01 的行号已整体漂移约 **+114**（例：`PAL` 由 `L4345` → `L4459`，`structure()` 由 `L4601` → `L4715`，`drawMinimap()` 由 `L6983` → `L7161`，富/铁角标由 `L4663` → `L4777`）。**下表行号仅为本次快照，实现时一律以「函数名 + 代码锚点字符串」定位为准**，不要按数字硬找。

---

## 0. 范围与非目标（先划红线）

### 0.1 WP3 范围内（对应计划 §3 WP3 第 1–5 条）

| # | 项 | 本规格章节 |
|---|---|---|
| 1 | 7 视口逐一截图与布局检查 | §4 |
| 2 | `drawMinimap()` 改用 `PAL` 配色 | §1 |
| 3 | `#victoryCard` 及按钮套新主题 | §2 |
| 4 | 裁定 B 的可访问性小字改进（逐项裁定归属） | §3 |
| 5 | 手机端 ≤600px 可读性 / `#eventBanner` 不遮顶栏 | §4.3 |
| 6 | WP1 遗留 4 项留证补图的可执行方案 | §5 |
| 7 | 文档整理 + WP5 报告可直接粘贴文案 | §6 |

### 0.2 WP3 **不得触碰**（§7 逐条展开）

- §0 核心规则（整圈共享耐久、破墙失守、居民到岗、资源口径、测试纪律）；
- WP2 引导链（`tutorialStep()` / `#mapHint.next` / `hoverTile` / 推荐布防格 / 工人数徽章 / DPS 估算 / 失败诊断）；
- WP4 表现力与音效（昼夜过渡、刷兵烟尘、`AudioKit`、圈墙火花、效果弱化）。

### 0.3 与 WP2 规格的一致性确认

已读 `wp2-ux-spec.md` §0.2：其明确把「视觉层、主题 CSS、图标、事件横幅、**小地图配色**、**胜利 HUD（WP3）**、昼夜过渡、音效、刷兵烟尘、圈墙受击火花、效果弱化」列为 WP2 **非目标**。故本规格 §1/§2 与 WP2 无归属冲突。但 §3 的小字改进会与 WP2 **已实装**的工人数徽章同处 `structure()` 内，属实现层重叠，详见 §3.5 与 §8。

---

## 1. `drawMinimap()` 改用 `PAL` 的完整色值映射

### 1.1 现状（快照 `L7161–7228`）

`drawMinimap()` 目前硬编码一套暗色旧配色，与明亮新地图不一致（§1.3 已登记待办）：

| 用途 | 现值 | 位置 |
|---|---|---|
| 底 | `#142019` | `L7167` |
| 默认/未探明 | `#1d3328` | `L7171` |
| 水 | `#2d4f4c` | `L7172` |
| 路 | `#7a6f52` | `L7173` |
| 森林 | `#34553c` | `L7174` |
| 山地 | `#6a6e60` | `L7175` |
| 领地 | `#4d6a45` | `L7176` |
| 主城 | `#efc47e` | `L7181` |
| 城墙完整 | `#cfc8b0` | `L7188` |
| 城墙倒塌 | `#6a3a34` | `L7188` |
| 城门 | `#4a82a4` | `L7198` |
| 来袭入口/集结 | `#ed9a7c` | `L7208/7212` |
| 领主 | `#ffe9bd` | `L7218` |
| 视口框 | `#efc47e` | `L7225` |

另 CSS 有两处叠加：`L145 #miniMap{height:120px;background:#142019}` 与 `L465 #miniMap{border:1.5px solid var(--glass-line);background:#2f4a2a;height:126px}`，后者胜出；`<canvas id="miniMap" width="180" height="120">`（`L644`）。**绘图坐标系固定 180×120，与 CSS 显示高度 126px 不一致，存在轻微纵向拉伸**——规格见 §1.4。

### 1.2 目标色值映射（全部取自 `PAL`，快照 `L4459–4471`）

> 原则：**只读 `PAL`，不在 minimap 内硬编码任何 `#RRGGBB` 地形色**。计划 §3 WP3 第 3 条点名的四个值必须逐字对齐。

| 用途 | 计划指定 | 改后值（PAL 键） | 说明 |
|---|---|---|---|
| 草地（默认/未探明） | 草地 `#86b555` | `PAL.grass[1]` = `#86b555` | 计划点名值；与 `terrain()` 主导草色一致 |
| 水 | 水 `#4fa6c9` | `PAL.water` = `#4fa6c9` | 计划点名值 |
| 路 | 路 `#d8b77a` | `PAL.road` = `#d8b77a` | 计划点名值 |
| 领地加亮 | 「领地加亮」 | `PAL.grassOwned[1]` = `#9ac563` | 见 §1.3 加亮方式裁定 |
| 森林 | — | `PAL.leafDark` = `#2c6a2e` | 比草地明显更深，保持「深绿=树」语义 |
| 山地 | — | `PAL.stoneMid` = `#a99f88` | 灰岩色，与森林/草地区分 |
| 未探明 / 底 | — | `PAL.ink` 或自定义 `MINI_BG` | **裁定见 §1.5**：不直接用 `PAL.ink`（纯黑褐太重），建议 `#2f4a2a`（沿用 CSS 现值）作底 + 未探明格用 `PAL.grassDark` 压暗 |
| 主城 | — | `PAL.gold` = `#f2c14e` | 与地图金色系一致；视口框同色 |
| 城墙（浅石色） | 「城墙画浅石色」 | `PAL.stoneLight` = `#e9e1cc` | 计划点名「浅石色」，取最亮石色 |
| 城墙倒塌 | 「倒塌画红点」 | `PAL.red` = `#d9533c` | 计划点名红点，见 §1.6 |
| 城门 | — | `PAL.roofBlue` = `#3f74c4` | 蓝顶同色，与城墙浅石对比 |
| 来袭入口 / 集结 | — | `PAL.red`（点）+ `PAL.gold`（框） | 与 `drawGates()` 红色脉冲语义一致 |
| 领主 | — | `PAL.gold` | 与地环/主城金一致 |

**建议实现形态**（避免耦合，见 §1.3）：在 `drawMinimap()` 内部开头定义一张**局部映射表**，一次性从 `PAL` 取值，不在循环里散落 `PAL.xxx`：

```js
// 建议形态（示意，非最终代码；实现时以函数锚点为准）
const M = {
  bg:      '#2f4a2a',              // 画布底：沿用 CSS 现值，不属地形色
  unknown: PAL.grassDark,         // 未探明格
  grass:   PAL.grass[1],          // #86b555
  owned:   PAL.grassOwned[1],     // #9ac563 领地加亮
  water:   PAL.water,             // #4fa6c9
  road:    PAL.road,              // #d8b77a
  forest:  PAL.leafDark,          // #2c6a2e
  mountain:PAL.stoneMid,          // #a99f88
  castle:  PAL.gold,              // #f2c14e
  wall:    PAL.stoneLight,        // #e9e1cc
  broken:  PAL.red,               // #d9533c
  gate:    PAL.roofBlue,          // #3f74c4
  hero:    PAL.gold,
};
```

### 1.3 与地图主渲染层共用 `PAL` 时如何避免耦合（重点）

风险：`PAL` 是全局对象，若 minimap 直接在循环里读 `PAL.grass[i]`，一旦 `terrain()` 改用 `PAL.grass[Math.floor(v*len)]` 的多色抖动（`L4470` 附近），或后续包调整 `PAL` 键名，minimap 会跟着变或报错。

规格要求（三条）：

1. **单向只读、集中取值**：minimap 只在函数开头一次性把需要的 `PAL` 值抄进局部 `M` 表（如上），循环体只引用 `M.*`。此后 `PAL` 任何改动只影响 `M` 定义处，不扩散到绘制逻辑。
2. **不反向写入、不新增 PAL 键**：**禁止**为 minimap 往 `PAL` 里加 `PAL.minimapXxx` 之类的键——那会把 UI 专用色污染进地图调色板，也违背 §0「地图为视觉主体」。minimap 专属色（底、未探明压暗、视口框）留在 `M` 里用字面量或 `shadeHex(PAL.grass[1], -0.35)` 现算。
3. **语义映射而非索引映射**：草地用 `PAL.grass[1]`（计划点名的 `#86b555`）而不是 `PAL.grass[Math.floor(v*4)]`；minimap 是**语义缩略图**，不需要逐格抖动，用固定代表色更清晰、也更抗 `PAL` 结构变化。
4. **能力检测沿用 §5**：`mctx` 已做 `if(!mctx||typeof mctx.fillRect!=='function')return;`（`L7165`）。改配色**不得**引入 `createLinearGradient` / `createRadialGradient` / 离屏画布——测试 VM 的 canvas 是桩（§5），一旦用了渐变就必须像 `drawLighting()` 那样做能力检测；**本规格明确 minimap 全程只用 `fillRect`/`strokeRect`/`arc`/`beginPath` 基础 API**，不引入渐变，从源头规避。
5. **不缓存 `const g=ctx`**（§5）：minimap 用的是自己的 `mctx`，与全局 `ctx` 无关，**不要**把它改成全局 `ctx`（`cachedLayer` 会临时替换全局 `ctx`）。

### 1.4 7 视口下小地图尺寸变化的处理

现状：canvas 内部分辨率固定 `width=180 height=120`（HTML 属性 `L644`），CSS 用 `width:100%` + `height:126px`（`L465`）拉伸显示。存在两个问题：① 固定 180×120 与 CSS 宽高比在窄视口下不一致 → 图形被非等比拉伸；② 高 DPI 下模糊。

规格：

1. **保持坐标系用 `mw/mh`（`mini.width/height`）计算 `sx/sy`，不要改用 `getBoundingClientRect()`**——`bindMinimap()`（`L7229+`）的点击换算用的是 `r.width/r.height * WIDTH/HEIGHT`，两者不同步会导致点击定位偏移。若改内部分辨率，必须同步核对 `bindMinimap()` 的换算仍成立（它按 `r.width` 归一化，与内部分辨率无关，**安全**）。
2. **建议按显示尺寸与 DPR 重设内部分辨率**（在 `drawMinimap()` 开头，做能力检测后再写）：
   ```js
   const r = mini.getBoundingClientRect?.();
   const dpr = Math.min(2, window.devicePixelRatio || 1);
   const cw = Math.max(1, Math.round((r?.width  || mini.clientWidth  || 180) * dpr));
   const ch = Math.max(1, Math.round((r?.height || mini.clientHeight || 120) * dpr));
   if (mini.width !== cw || mini.height !== ch) { mini.width = cw; mini.height = ch; }
   ```
   然后 `sx = mw/WIDTH` 等照旧。**约束**：`getBoundingClientRect` 在测试 VM 桩里返回固定 1280×800（`tests/helpers/v029-vm.cjs`），故必须允许 `r` 为 undefined 时回退到 `mini.width/height`，且**不得因取不到 rect 抛错**。此项为**建议增强**，若实现者为降低风险选择「维持 180×120 不动、只在 CSS 里保证 `height` 与 `width` 等比」，也可接受——但必须在 WP5 报告注明「小地图存在非等比拉伸，属已知取舍」。
3. **折叠态约束不可破**：`v029-hud-occlusion-browser.cjs` 断言「折叠图例 `legendH ≤ 60`」「折叠小地图 `miniH ≤ 60`」（`L238–239`）。7 视口下**小地图折叠态高度必须 ≤ 60px**，展开态建议 ≤ 126px（现值）。改 CSS 时不得抬高折叠态高度，否则 runner 变红（且按测试纪律**不得改断言**）。
4. **窄屏/横屏断点**：现有断点 `@media(max-width:600px)`（`L548`）、`@media(orientation:landscape) and (max-height:470px)`（`L566`）。932×430 属横屏矮视口，需确认小地图在折叠态仍 ≤60、展开时不挤压底栏；390×844 竖屏展开态高度建议 ≤ 96px，避免吃掉地图视野。

### 1.5 未探明/底色的裁定

计划只点名了草地/水/路/领地/城墙/红点，未规定底色与未探明格。为保持「已探明明亮、未探明压暗」与地图 `drawFog()`（`L4630` 附近）语义一致，裁定：

- **画布底**用 `#2f4a2a`（沿用 CSS `L465` 现值，属 UI 底板色，非地形色，不进 `PAL`）；
- **未探明格**用 `shadeHex(PAL.grass[1], -0.35)` 或直接 `PAL.grassDark`（`#5f8c3b`）再叠一层暗化；**不得**沿用现在的 `#1d3328`（几乎黑，与新地图明亮基调冲突）；
- 计划 §3 WP3 第 2 条「迷雾边缘柔和」属 WP1 已实现层，minimap 只做「亮/暗二值」即可，不需要云团。

### 1.6 「倒塌画红点」的实现口径

现状 `L7188` 是把整圈 `strokeStyle` 换成暗红 `#6a3a34` 继续画线。计划原文「倒塌画红点」。裁定：**两者并存**——倒塌时圈线用 `PAL.red`（`#d9533c`）细线，并在每个 gate 或圈中点额外画 2px 红点（`arc`），使「破圈」在 180×120 的小尺寸下也能一眼看到；完整态用 `PAL.stoneLight` 浅石色线。这不改任何游戏逻辑，`ring.status==='broken'||ring.hp<=0` 判定保持原样。

### 1.7 验收判据

| 项 | 判据 |
|---|---|
| 色值 | `grep` 确认 `drawMinimap()` 内不再出现 `#142019/#1d3328/#2d4f4c/#7a6f52/#34553c/#6a6e60/#4d6a45/#efc47e/#cfc8b0/#6a3a34/#4a82a4/#ed9a7c/#ffe9bd` 这些旧地形色（底部 `#2f4a2a` 允许保留） |
| 计划点名值 | 草地 `#86b555`、水 `#4fa6c9`、路 `#d8b77a` 三处逐字命中；领地比草地更亮；城墙浅石；倒塌有红点 |
| 耦合 | `drawMinimap()` 内 `PAL.xxx` 只出现在开头 `M` 定义处；`PAL` 对象本身未被写入或新增键 |
| 回归 | `node --test` 全量（**当前 8 文件基线 77/77**，非 WP1 时的 48；判 `# pass ≥ 77 + 新增`、`# fail 0`）；`v029-hud-occlusion-browser.cjs` 折叠态 `miniH ≤ 60` 仍通过；`pageErrors=[]` |
| 截图 | 7 视口各 1 张（§4），小地图与地图主色一眼可辨为同一套 |

---

## 2. `#victoryCard` 与胜利 HUD 的新主题规格

### 2.1 现状（快照 `L338–367` CSS / `L695–712` DOM）

- 卡片：`#victoryCard{background:#161d19d4; border:1px solid #c4a36a; border-radius:12px; box-shadow:0 12px 40px #05080699; color:var(--text)}` —— **旧深绿底 + 暗金边**，未用 v0.30 板岩玻璃。
- 关联面板 `#victoryMenu/#victoryLegend/#victoryInspect`（`L358`）：`#1c2620f2` + `#c4a36a` 同款旧深绿。
- 按钮：`#victoryNew` 带 `class="gold"`（`L702`），会命中 v0.30 的 `button.gold`（`L384`，金色渐变 + `#fff0b8` 边 + 立体阴影），**这个已经自动是新主题了**；但 `#victoryDetail`/`#victoryReport` 是普通 `button`（`L377` 深蓝渐变），也与新主题一致。真正缺的是**容器与文字层级**。
- 变数陷阱：文件有**多套 `:root`**（`L9–10` 旧绿系 `--gold:#efc47e`、`L13–17` v0.26、`L370–375` v0.30 `--gold:#f2c14e` / `--glass:rgba(24,32,46,.86)` / `--glass-line:rgba(242,193,78,.55)` / `--text:#fbf6e8`）。**后定义覆盖前定义**，故 `var(--gold)` 在卡片里实际是 `#f2c14e`。但 `#victoryNights button[aria-selected]`（`L350`）用的是 `var(--accent)`（旧绿系 `#efc47e`），色相偏旧——规格要求统一改用 `--gold`/`--gold-line`。

### 2.2 目标规格（金边玻璃风，与 `.glass-panel`/`.side`/`.command-deck` 同族）

对照现有统一写法（`L430–434`）：
```css
.briefing,.glass-panel,.side,.command-deck,#alertBar,dialog,#pauseOverlay .card,#settingsMenu{
  background:var(--glass);border:1.5px solid var(--glass-line);
  box-shadow:0 10px 30px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.06);
  backdrop-filter:blur(6px);
}
```

**规格要求（逐条）**：

| 元素 | 改前 | 改后（规格） |
|---|---|---|
| `#victoryCard` 底/边 | `#161d19d4` / `1px #c4a36a` | `background:var(--glass)`；`border:1.5px solid var(--glass-line)`；`box-shadow:0 10px 30px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.06)`；`backdrop-filter:blur(6px)`；`border-radius:16px`（与 `.side` 一致） |
| `#victoryCard` 文字 | `color:var(--text)`（已对） | 保持 `var(--text)`；确认解析到 `#fbf6e8` 而非旧 `#f1ebd8` |
| `#victoryTitle` | `font-family:"Songti SC","SimSun",Georgia,serif; color:#f3d7a2`（宋体旧式） | 字体改 `system-ui` 族（与 `body`/`h2` 统一），`color:#ffe7a6`、`font-weight:900`、`text-shadow:0 2px 0 #2b1d08`（与 `.identity h1`/`.panel h3` 同款金字） |
| `#victoryHandle small`（「拖动」） | `#cbb98a` | `var(--muted)`（`#c3cbda`），或保留金调 `var(--gold)` 但降字号 |
| `#victoryNights button[aria-selected="true"]` | `var(--accent)`（旧绿金）+ `#3a3728` 底 | `border-color:var(--gold); color:#ffe7a6; background:rgba(242,193,78,.18)`（与 `.march .current` `L545` 同款） |
| `.victory-actions button` | `flex:1 1 96px;min-height:40px` | 保持尺寸；主按钮 `#victoryNew` 保持 `class="gold"`（已命中金色渐变 `L384`）；次按钮沿用 `button` 深蓝渐变（`L377`）即可。**不得**另写一套 `.victory-actions button{background:...}` 覆盖全局按钮主题 |
| `#victoryMenu/#victoryLegend/#victoryInspect` | `#1c2620f2` + `#c4a36a` | 同族：`background:var(--glass);border:1.5px solid var(--glass-line);backdrop-filter:blur(6px)`，`border-radius:12px` |
| `#victoryTip` | `#121815ee` + `#80694a` | `background:rgba(24,32,46,.94);border:1px solid var(--gold-line);color:#fff3d0`（与 `#toast` `L535` 同款） |
| `#victoryPanel` 分隔线 | `border-top:1px solid #3e4e42` | `var(--ui-line)`（`#4a5a76`） |
| 入场动画 | `victoryIn .35s`（`L365–367`，已有 `prefers-reduced-motion` 关闭） | **保持不动**；WP4 才管 reduced-motion 的 JS 侧（§7） |

**明确不要做的**：① 不要给 `#victoryCard` 加 `pointer-events` 改动（`L339` 已设 `auto`，`victoryHud` 是 `pointer-events:none` 容器）；② 不要改 `z-index`（`L338/340` 的 12/2 层级与拖动逻辑 `L6384/6665` 绑定）；③ 不要动 `position:fixed` 与 `overflow:auto`（小屏可滚动靠它）；④ 不要把 `max-height:calc(100dvh - 16px)` 改小。

### 2.3 胜利 HUD 在 390×844 / 932×430 的不遮挡判据

定位逻辑（`L6380–6405`）：`placeVictoryCard()`（示意名，锚点为 `card.style.left=spot.x+'px'` / `card.style.top=spot.y+'px'`）按 `getBoundingClientRect()` 把卡片放进可用区域，另有拖动 `L6665–6666`。规格判据（可量化，供 quality-lead 写进 runner 或人工核对）：

| 视口 | 判据 |
|---|---|
| **390×844**（竖屏 touch） | ① 卡片矩形完全在视口内：`left ≥ 8`、`top ≥ 8`、`right ≤ 382`、`bottom ≤ 836`（16px 边距）；② **不遮顶栏**：`card.top ≥ top.bottom + 4`（顶栏 `.top` 高度约 44–56px，以实测 `getBoundingClientRect()` 为准）；③ 卡片宽 ≤ `100vw - 16px`（已有 `min(400px, calc(100vw - 16px))`）；④ 三张 `.victory-actions button` 在 `flex-wrap` 下可能换行，**每个按钮的「选择/开始新一局」文字必须完整可见**，不被卡片下缘裁切（卡片 `overflow:auto` 可滚，但主按钮首屏应可见）；⑤ `#victoryGear`/`#victoryLegendBtn`（`top:10px; right:10px/64px`）不与顶栏资源条重叠——`body.victory` 已在 `L264` 隐藏这两个按钮，需确认该规则在 touch 下仍生效 |
| **932×430**（横屏矮视口 touch） | ① `max-height:calc(100dvh - 16px)=414px`，卡片实际高度 ≤ 414 且内部可滚；② **不遮主城**：主城位于地图视野中心，卡片默认落点应偏右或偏上，`card.left ≥ vw*0.5` 或 `card.top ≤ 8`（与 `L6384` 的 `maxX/maxY/minY` 夹取一致）；③ 卡片不覆盖底栏 `#commandDeck`（横屏底栏靠下），`card.bottom ≤ deck.top - 4` 或卡片与底栏分列左右；④ `#victoryPanel` 的 `max-height:38vh`（≈163px）内部可滚，不撑破卡片 |
| 通用 | ⑤ 横幅 `#eventBanner`（`top:72px`，横屏 `L573` 改 `52px`、手机 `L563` 改 `64px`）在胜利页**不应出现**（`game.phase==='won'` 时不触发世界事件）；若有残留，`z-index:9` 低于 `victoryHud` 的 12，不遮挡；⑥ `pageErrors=[]`；⑦ 拖动后卡片仍被夹在视口内（`L6665` 拖动 + `L6384` 夹取） |

> 计划 §3 WP3 第 2 条「横幅不挡住主城」主要针对**游戏进行中**的 `#eventBanner`；胜利页 HUD 属额外判据。两者都要在 7 视口截图里看。

### 2.4 验收判据

- CSS：`grep` 确认 `#victoryCard` 不再有 `#161d19d4` / `#c4a36a`；`var(--glass)`/`var(--glass-line)`/`var(--gold)` 命中；`var(--accent)` 在胜利 HUD 段内清零（改用 `--gold`）。
- 截图：390×844 与 932×430 各 1 张胜利页（可用夹具把 `game.day` 设为 5 触发胜利，**必须标注「状态夹具，非自然流程证据」**，与 `wp1-acceptance.json` 的 `fixturesNote` 一致）。
- 回归：`v029-rings-ui-browser.cjs` 与 `v029-hud-occlusion-browser.cjs` 全绿、`pageErrors=[]`；不得改断言。

---

## 3. 裁定 B 可访问性小字的落地方案（逐项改前/改后 + 影响面 + 归属）

> 依据：`wp1-visual-audit.md` §6.2 裁定 B——**9px/7px 文字不纳入 §4.4「轮廓」口径**（该条已判符合），但四类小字在 50% 与手机端不可读是**独立真实的可访问性缺陷**，建议归 WP3。本节给出可执行规格，并**明确哪些归本包、哪些只写进 WP5 剩余问题**。

### 3.0 归属裁定总表（先看结论）

| # | 项 | 归 WP3 实现？ | 理由 |
|---|---|---|---|
| 3.1 | 富/铁角标 9px 汉字 → 纯图形 | ✅ **归 WP3** | 纯绘制层、零逻辑、可截图验收、与 WP2 徽章分区可控 |
| 3.2 | 作业气泡底 `14*s→18*s` | ✅ **归 WP3** | 同上，单点尺寸调整 |
| 3.3 | 耐久牌数字 9→11px / 进度条为主 | ⚠️ **部分归 WP3**：仅「9→11px」归本包；「改以进度条为主」**只写 WP5 剩余问题** | 字号是低风险单行改动；改信息架构（进度条替代数字）会牵动 `L6855/6878` 的 HUD 文本与 `wall-inspect-vitals` 双血条语义，属设计取舍，需用户拍板 |
| 3.4 | 删除 7px 箭塔等级字 | ✅ **归 WP3**（**但需用户拍板**，见 §9） | 代码层零风险；但「等级」是玩家可感知信息，删除属**信息呈现决策**，不是纯技术改动 |
| 3.5 | 与 WP2 徽章的分区协调 | ✅ **归 WP3**（实现前必须做） | 同一 `structure()` 内叠加，不协调会重叠 |

**统一约束（四项共用）**：① 全部只改 `structure()` / `drawResident()` / `drawWallRings()` 内的**绘制语句**，不改任何状态字段、不改 `nodeArt`/`drawFoliage`/`structure` 的函数名与 `draw()` 中的按名调用（§5 契约 + WP2 规格 §7 第 4 条红线）；② 不引入渐变/离屏画布/文本测量（§5，测试 VM canvas 是桩，`measureText` 会报错）；③ 不改 `ctx` 缓存方式；④ 每改一项都要跑 `node --test` 全量与三条浏览器 runner，失败时**改实现或 CSS，不改断言**。

### 3.1 富/铁角标 → 纯图形

| 项 | 内容 |
|---|---|
| 改前 | `L4777`：`if(ore==='rich'\|\|ore==='iron'){rrect(x-26,y-26,16,12,4,'rgba(30,24,16,.8)');label(ore==='rich'?'富':'铁',x-18,y-20,9,tint);}` —— 16×12 深色牌 + **9px 汉字**，50% 下约 4.5px 不可读 |
| 改后 | 去掉 `label` 汉字，改为**高对比纯图形 + 放大底牌**：底牌 `rrect(x-27,y-28,20,16,5,'rgba(28,36,24,.9)',OUT,1.2)`；内部画一个 7×7 菱形（`rich`，填 `tint`=`#ffd257` 金色 + `OUT` 描边）或 8×8 方块（`iron`，填 `tint`=`#a9b9c4` 蓝灰 + `OUT` 描边）。**形状差异 + 颜色差异双编码**（色盲可辨） |
| tint 呼应 | 沿用 `L4767` 已有 `tint`（`iron:'#a9b9c4'` / `rich:'#ffd257'` / 其他 `'#f0c75a'`），不新增色值；图形用 `path()` + `OUT` 描边（与全局描边语言一致） |
| 可访问性 | 形状（菱形 vs 方块）+ 颜色（金 vs 蓝灰）双通道，优于单靠汉字；纯图形在 50% 下仍是一个可辨色块 |
| 影响代码位置 | `structure()` 的 `else if(b.type==='mine')` 分支，锚点 `if(ore==='rich'||ore==='iron')` |
| §0 核心规则 | **无影响**。只读 `t.node.kind` 与 `b`，不写任何状态；不改 `PRODUCTION_TYPES`（`L2503`）、不改 `YIELD`、不改收入 |
| 测试 | **无影响**。`tests/v029-workplaces.test.cjs` 的绘制契约只统计 `structure/nodeArt/drawFoliage` 是否被按名调用，不检查格内画了什么；无断言针对「富/铁」文字。建议 WP3 新增一条轻量断言：纯图形路径不调用 `label()` 传汉字（可选，非必须） |
| WP2 冲突 | ⚠️ 见 §3.5：位置 `(x-27,y-28)` = 格内 `(3,7)`，**左上**；WP2 徽章在 `(36,1)` **右上**，不重叠 |

### 3.2 作业气泡底 `14*s → 18*s`

| 项 | 内容 |
|---|---|
| 改前 | `L4929`：`const bubble=(txt,bg)=>{rrect(bx-7*s,by-7*s,14*s,13*s,4*s,bg,OUT,1.2);label(txt,bx,by-.5*s,9*s,'#fff');};` |
| 改后 | 底牌 `rrect(bx-9*s,by-8.5*s,18*s,17*s,5*s,bg,OUT,1.2)`；内部符号字号 `9*s → 11*s`（同步放大，避免「大牌小字」失衡）。**只改尺寸常量，不改 `bubble()` 的调用与 `txt` 内容**。⚠️ **前置条件**：本项不能孤立实施，必须与 §3.5 第 3 条的**锚点偏移/系数调整**一起做，否则放大会实色盖住 WP2 徽章（design-strategist 实装复核） |
| 相邻气泡不重叠 | 气泡锚点 `bx=pose.x*CELL+8*s`、`by=pose.y*CELL-22*s`（`L4928`），右上偏移固定；放大后需确认不与相邻格建筑/**WP2 徽章**碰撞。规格约束：**单个居民只画一个气泡**（if/else 链已保证互斥），故不会自重叠；跨居民碰撞属既有行为，不新增 |
| 与 WP2 徽章的遮挡（**DS 复核 + EL VM 实算，必做**） | EL 实算（收敛 `r.y=t.y+.5`）：气泡 **`x 23.77–34.50 / y 0.77–10.73`**、徽章 **`x 27.60–46.00 / y 0.77–12.27`** → 重叠 **`x 27.60–34.50 / y 0.77–10.73` ≈ 68.8 px²（徽章宽约 37%）**；`draw()` 先 `structure()` 后 sprites（`sort` 后 working 居民 y 更大），气泡实色 `bg` 后画会盖住 **`👤` 左半与徽章左圆角底**（`N` 数字因中心 `x=36.80` 在气泡右缘外大概率存活）。⚠️ **按坐标推算遮挡在现状 `14*s` 已存在、待 `exp-4-arrived.png` 实拍确认**；**水平无解**（10px 空隙 < 三种宽度）且**垂直也无解**（两者 `y0` 齐平、上移需整块出格）→ 上一版「上移 `by` 到 `-43*s`」**已否决**。解法见 §3.5 第 3 条与 §9 P7：① 绘制序晚绘 pass（首选，需跨包授权）／② 左移 + 角标联合收窄（§3.1 与 §3.2 必须成对实施）／③ 保守最小解遮挡；**不得改徽章本体**（§7 红线） |
| 影响代码位置 | `drawResident()` 内 `bubble` 定义与 `bx/by` 锚点，锚点 `const bubble=(txt,bg)=>` |
| §0 核心规则 | **无影响**；`drawResident()` 只读 `pose`（`getResidentPose()`），不改居民状态/寻路/派工 |
| 测试 | **无影响**；`tests/v029-workplaces*.cjs` 不检查气泡尺寸。WP2 规格 §6 第 4 条把「头顶状态气泡 + 工人数徽章」纳入同帧截图取证——**放大后若遮挡徽章反而判 FAIL**，故必须按 §3.6 复拍确认 |
| WP2 冲突 | 原稿写「无直接冲突」**不准确**：两者虽在不同函数，但同帧显示且坐标重叠、绘制有先后，属实质冲突（见 §3.5） |

### 3.3 耐久牌数字 9→11px（**仅字号归 WP3**）

| 项 | 内容 |
|---|---|
| 改前 | `L5080`：`label(Math.ceil(ring.hp)+' / '+ring.maxHp,sx+8,sy+4.5,9,'#fff7e0','700');` |
| 改后（WP3 范围） | 字号 `9 → 11`，同时把牌宽 `w=96`（`L5077` 附近）**仅当 11px 文字会溢出时**微调到 `w=104`，并把 `hpPips` 可用宽度 `w-28` 同步核对。**不改变信息架构**：仍是「🛡 图标 + 进度条 + 数字」三件套 |
| 不改（只写 WP5 剩余问题） | 「改以进度条为主、数字为辅」——这会涉及 `L6855`（`updateBattleHud()` 的 `wallText` 文本）、`L6878`（`#wallVital` 文本）与 `wall-inspect-vitals` 双血条的语义分工，属**信息呈现设计取舍**，需用户拍板，不在 WP3 实现 |
| 影响代码位置 | `drawWallRings()` 末尾「统一圈耐久牌」块，锚点 `label(Math.ceil(ring.hp)+' / '+ring.maxHp` |
| §0 核心规则 | ⚠️ **强相关但不改语义**：`ring.hp/ring.maxHp` 与「整圈共享耐久、归零整圈倒塌」直接绑定。规格明确**只读这两个值、只改字号**，不碰 `damageWallRing()`、`collapseWall`、`wallBlow()`、`V029.wallHit` 及任何伤害/倒塌逻辑；全圈仍只有一块牌（`for(const ring of game.wallRings.values())` 内，当前仅 `'home'` 一圈，见 WP1 §6.1 S7） |
| 测试 | ⚠️ `tests/v029-rings.test.cjs` 与 `tests/v029-rings-ui-browser.cjs` 断言耐久数值/破墙时序（`afterCollapseSeconds ≤ 5`），**不检查字号**；但实现后必须全量回归确认没误改数值读取。WP2 新增的 DPS 估算 Node 测试（`wp2-ux-spec.md` §4.5）也不受影响（它读 `wallDamageSamples`） |
| 受击闪白 | **不得顺手改**：`L4892` 的 `body=hitFlash?'#fff1c8':...` 是 WP1 裁定 A 已判定「符合契约」的行为，WP3 只改字号，不动闪白（见 §6.2） |

### 3.4 删除 7px 箭塔等级字（**需用户拍板**）

| 项 | 内容 |
|---|---|
| 改前 | `L4793`：`if(lv>=1)label(lv===2?'重':'Ⅱ',x-9,y-21,7,'#fff3d0');` —— 7px 小字，50% 下完全不可读 |
| 改后 | **直接删除该行**（`if(lv>=1)…` 整行）。理由：`L4787` 已用 `roof`/`roofD` 做 lv0 蓝 / lv1 红 / lv2 紫三色顶（`lv===2?'#6a5aa8':lv?PAL.roofRed:PAL.roofBlue`），`L4786` 的木台颜色也随 `lv` 变（`'#b88a4a'` vs `PAL.wood`），`L4792` 旗色随 `game.ranks.tower` 变——**等级已有三重视觉编码**，小字是冗余 |
| 可访问性收益 | 去掉一个永远读不清的 7px 元素，减少视觉噪声；颜色编码对色盲不友好，故**必须保留 `rework()` 的等级文案与详情面板「升级箭塔/改装重型塔」按钮**（`L6100` 附近）作为文字通道，否则色盲玩家无法确认等级 |
| 影响代码位置 | `structure()` 的 `else`（箭塔）分支，锚点 `if(lv>=1)label(lv===2?'重':'Ⅱ'` |
| §0 核心规则 | **无影响**；只读 `b.level`，不改 `rework()`（`L3183`）、`towerRange()`、伤害/费用 |
| 测试 | **无影响**；无断言检查等级小字。`tests/v029-rings.test.cjs` 检查箭塔数量/射程，不检查绘制文字 |
| 需拍板 | ⚠️ 删除「等级文字」属**信息呈现决策**（虽然有三重颜色编码兜底），请用户确认；若用户要求保留文字通道，退化方案：把 7px 改成 11px 并移到塔基空白处，或改为纯图形（Ⅰ/Ⅱ 用 1/2 个小方点表示） |

### 3.5 与 WP2 工人数徽章的分区协调（**实现前必须做，最高冲突风险**）

WP2 已实装（`L4796–4803`，锚点 `// WP2：生产建筑右上角工人数徽章`）：

```js
if(isProductionBuilding(b)){
  const n=productionWorkerCountAt(t);
  ctx.save();
  rrect(36,1,24,15,5,n>0?'rgba(28,42,26,.88)':'rgba(84,90,96,.88)',OUT,1.2);
  label(n>0?'👤'+n:'空',48,8.5,10,n>0?'#ffe9a8':'#cdd3d8','900');
  ctx.restore();
}
```

`structure()` 用 `inCell(t.x*CELL,t.y*CELL, ...)` + `ctx.scale(CELL/60)`，格内是 **60×60 逻辑坐标**，`x=30,y=35` 为中心。各方框占位：

| 元素 | 逻辑坐标 | 区域 |
|---|---|---|
| 富/铁角标（改前） | `rrect(x-26,y-26,16,12)` = `(4,9,16,12)` | **左上** (4–20, 9–21) |
| 富/铁角标（§3.1 改后） | `(3,7,20,16)` | **左上** (3–23, 7–23) |
| 箭塔等级字（将删） | `label(...,x-9,y-21,7)` = `(21,14)` | 中上偏左 |
| **WP2 工人数徽章** | `rrect(36,1,24,15)` | **右上** (36–60, 1–16) |
| 作业气泡 | `bx=pose.x*CELL+8*s`、`by=pose.y*CELL-22*s`（`L4928`），`rrect(bx-7*s,by-7*s,14*s,13*s)`；`s=CELL/60≈0.767` | **居民右上方**（世界像素坐标），非格内固定坐标 |

> ⚠️ **本小节第 3 条经 design-strategist 实装复核后已重写**（原稿把遮挡对象误判为左上富/铁角标，实际威胁的是**右上 WP2 徽章**）。以下为更正后的坐标推算，静态值仅供参考，最终以实拍为准。

**两种坐标系统一换算到「格左上起算的像素」**（`CELL≈46`，`s=CELL/60≈0.767`；居民工作位 `productionWorkPos()` 返回 `{x:t.x+.5, y:t.y+.58}`，`L1913–1917`）：

| 元素 | 原始坐标 | 换算后像素范围 | 备注 |
|---|---|---|---|
> 📐 **坐标口径以 engineering-lead 的 VM 实算为准**（seed 42、`assignWorker` + `updateResidents(.045)×900` 收敛，`getResidentPose()` 直接返回 `r.x/r.y`）：**收敛后 `r.y = t.y + .5`，不是 `productionWorkPos()` 的 `.58`**。此前 DS 与我按 `.58` 推算出的气泡 `y 4.44–14.41` 偏下；实算为下表。两套推算的「有重叠」结论一致，但**是否还能垂直上移**的结论相反，故必须以实算值为准。

| 元素 | 原始坐标 | **格左上起算像素（EL 实算，`CELL=46`, `s=0.7667`）** | 备注 |
|---|---|---|---|
| WP2 工人数徽章 | `rrect(36,1,24,15,5)` → `inCell` 的 `scale(CELL/60)` | **x 27.60–46.00, y 0.77–12.27**；文字中心 `label(48,8.5)` → 像素 **(36.80, 6.52)** | 右上，`structure()` 内先画 |
| 作业气泡（§3.2 改前 `14*s`） | `bx=pose.x*CELL+8*s`、`by=pose.y*CELL-22*s`，`rrect(bx-7*s,by-7*s,14*s,13*s)` | **x 23.77–34.50, y 0.77–10.73**（`bx≈29.13`） | 右上，`drawResident()` 内后画；**y0 已贴格顶边** |
| 作业气泡（§3.2 改后 `18*s`） | 同上、尺寸放大 | 约 **x 22–36, y 更低–更高** | 重叠区进一步扩大 |
| 富/铁图形角标（§3.1 设计） | `rrect(x-27,y-28,20,16)` = `(3,7,20,16)` 逻辑 | **x 2.30–17.63, y 5.37–17.63** | 左上；⚠️ 气泡若**左移**避开徽章会撞上它 |

**重叠区（EL 实算）**：`x 27.60–34.50 / y 0.77–10.73` = **6.90 × 9.97 ≈ 68.8 px²**，约占徽章宽 18.4px 的 **37%**。绘制序也经 EL 复核：`sprites` 里 `structure` 的 `y=t.y+1=4`、working 居民因 `dockTileId` 取 `y=dock.y+1.2=4.2`，`sort((a,b)=>a.y-b.y)` 后 **structure 先画、气泡后画**，实色 `bg`（`#3f8a3c`/`#3f74c4`/`#c4402f`）覆盖。**但不是整块抹掉**：文字中心 `x=36.80` 在气泡右缘 `34.50` 之外，`N` 数字大概率存活，被盖的是 **`👤` 图标左半与徽章左圆角底**——§3.6 的 FAIL 判据此按此改写。

> 🔴 **关键更正（DS 几何复核 + EL 实算，共同改变 P7 选项设计）**：
> **① 按坐标推算，遮挡是 WP2 实装后「既存」的，不是 WP3 放大引入的** —— 现状 `14*s` 的气泡已与徽章重叠；§3.2 放大只会扩大它。因此「放弃放大」**不是零冲突兜底**，**「解遮挡」是无论 P7 选哪个都必做的项**。
> ⚠️ **但本结论为静态坐标推算、未实拍，不宜写成「WP2 已 FAIL」**（DS 要求）。**待实拍确认的对象应收窄为「可辨程度」，而非「排序是否发生」**（DS 二次复核）：`draw()` `L5361` 建筑入 sprites 的键是 `y:t.y+1`、`L5366–5368` 作业居民是 `y=dock.y+1.2`、`L5375 sort((a,b)=>a.y-b.y)`、`L5376` 顺序执行 → **作业居民必然画在同格建筑之后，气泡稳定盖住徽章，这是确定的、不是 `getResidentPose()` 走动偏移造成的偶然**。仍待实拍的是：`label()` 文字基线 / emoji 实际墨迹 / `rrect` 圆角导致的**实际可辨程度**。**现状以 quality-lead 的 `exp-4-arrived.png`（居民到岗、作业中气泡 + `👤N` 徽章同帧）为准**；在拿到实拍前只记「推算存在遮挡、待实拍确认」。
> **② 水平方向几何上无解**：富/铁角标右界 `x 17.63` 与徽章左界 `x 27.60` 之间仅 ≈10px 空隙，而 `14*s/16*s/18*s` = 10.7/12.3/13.8px 三种都超出。
> **③ ⚠️ 垂直方向「在不把气泡整块移出本格的前提下」也无解**（DS 措辞收紧 + EL 实算）：气泡 `y0 = 0.77` **已贴格顶边**，与徽章 `y0 = 0.77` **顶边齐平**，小幅上移完全不分离；真要按 y 分离需上移 ≥10px → 气泡整块跑出本格、压到上一行（地图 `y=0` 行直接出画布）、与居民头顶脱节。**EL 否决的是这个代价，不是几何上不可能**；措辞保留这层限定，避免被读成绝对结论。**故 P7 候选里的「上移 `by` 越过格顶（`-43*s`）」予以否决**。
> **④ 只剩三类解法**：(a) 左移 / 缩小+左移（但需与富/铁角标联合收窄，见第 3 条）；(b) **改绘制序做晚绘 pass**（EL 新提，见第 3 条与 §9 P7）；(c) 放弃可访问性改善、只做最小解遮挡。

**结论（更正）**：改后的富/铁角标 (3–23, 7–23) 与 WP2 徽章 (36–60, 1–16) **不重叠，横向有 13 单位间隙**——这一条仍成立；**但按坐标推算作业气泡与 WP2 徽章存在既存重叠（待实拍确认）**，§3.2 的放大会加剧。规格要求：

1. **保持分区不变**：富/铁图形角标继续放左上，WP2 徽章保持右上，**WP3 不得移动、缩放、重绘或改写 WP2 徽章**（那是 WP2 交付物，§7）。
2. **绘制顺序**：WP2 徽章画在 `structure()` 末尾的 `if(isProductionBuilding(b))` 块，我改的富/铁角标在 `else if(b.type==='mine')` 分支内、位置更靠前。两者按现有顺序执行即可，**不要调整顺序**，避免触发 WP2 的绘制契约测试。另经 engineering-lead 核实：徽章有 `isProductionBuilding(b)` 门，**箭塔 else 分支的 7px 等级字 `(21,14)` 永远不会与徽章叠加**（tower 非生产建筑），真正相邻的是 mine 分支富/铁角标。
3. **⚠️ 气泡遮挡解法（按 EL 实算重写：垂直上移已否决，剩左移/绘制序两类）**：
   - **(a) 左移 `bx`（须与富/铁角标联合收窄，EL 新增交叉约束）**：要避开徽章左缘 `x=27.60`，气泡右缘须 ≤27.60 → **Δx ≥ 6.90px**，即把 `+8*s` 改成 `k*s` 且 **`k ≤ -1`**；取 `k=-2`（留 0.77px 间隙）时气泡为 **`x 16.10–26.83`**。但 §3.1 设计的富/铁角标为 `x 2.30–17.63 / y 5.37–17.63`，与左移后气泡在 **`x 16.10–17.63 / y 5.37–10.73` 仍约 1.5×5.4px 重叠** → **必须同时把角标右缘限制到设计 `x ≤ 21`（像素 ≤16.10）**，或把气泡再左移一点。**不能孤立改气泡，也不能孤立放大角标**——§3.1 与 §3.2 必须成对实施。
   - **(b) 改绘制序做晚绘 pass（EL 新提，最稳但需跨包授权；⚠️ 放置位置本身有冲突，须拆 ①a/①b 拍板）**：`draw()` 在 `for(const sp of sprites)sp.fn()`（`L5376`）**之后**依次是 `drawWallRings()` → `cachedLayer('fog', …)` → `drawSelection()` → `drawLighting(isNight)` → `drawCombatLayer()/drawDayFx()` → `drawVictoryMarks()`。只调 sprites 内部顺序挡不住后绘层：① 圈墙边缘格的徽章可能被 `drawWallRings()` 覆盖；② 夜间 `drawLighting()` 蓝暗幕 `rgba(14,24,56,.58)` 压暗灰色「空」徽章、`lighter` 暖火光叠亮。
     **EL 二次复核发现的放置冲突（必须在实现前拍板，否则会在两个目标间二选一却没裁定）**：
     - `structure()` 是**无可见性判断就入 sprites** 的（`if(t.building)sprites.push(...)`），未探明格建筑靠**后面的 `cachedLayer('fog')`** 盖住。若晚绘 pass 放在 `drawSelection()`/`drawLighting()` **之后（即在 fog 之后）**，未探明格生产建筑的徽章会**浮在迷雾之上 → 新回归**，必须补 `if(!t.visible)return;` 守卫才等价。
     - 若放在 `drawWallRings()` 与 `cachedLayer('fog')` **之间**，fog 自动生效无需守卫，但仍在 `drawLighting()` **之前**，白天暖光 `rgba(255,240,190,.10)` 与夜间蓝暗幕依旧会染/压暗徽章 → **夜景可读性问题未解**。
     - **①a（可读性优先，UX 侧倾向）**：晚绘 pass 放 `drawLighting()` 之后 + 显式 `t.visible` 守卫；一次性挡住气泡/圈墙/选中框/昼夜光幕四类后绘层。⚠️ **DS 上一轮曾提出 §4.4 反对**（夜间徽章不受暗幕、在冷蓝夜景上发亮），**本轮改从 UX/信息层级角度倾向 ①a**，三条理由见下方「美术口径三方意见」。徽章不再与建筑一起受光染色。
     - **①b（风格一致优先）**：晚绘 pass 放 `drawWallRings()` 之后、`cachedLayer('fog')` 之前；fog 自动生效、徽章仍随场景受光，但**夜景压暗问题保留**，需另议或由 ③ 兜底。
     - **①b′（DS 建议，折中插入点，待拍板）**：晚绘 pass 定在 **`drawSelection()` 之后、`drawLighting()` 之前**（L5380→L5381 之间）。理由：放 `L5376` 之后、`drawWallRings()`（L5378）之前会被圈墙盖住；放 `drawLighting()` 之后又破坏 night 一致性；取中间点则圈墙/选框已画完、fog 已过（**仍须 `t.visible` 守卫**）、徽章仍随场景受光。**须实拍确认徽章不破坏「圈墙始终可读」与四角金框**。
     - **三者共有的硬约束（DS 要求）**：① 晚绘范围**仅限徽章小矩形**（格内 `x 27.6–46 / y 0.77–12.27`），**不得扩大到整格/整圈**；② 不引入渐变 / `ctx.measureText` / 缓存 `const g=ctx`（§5，测试 VM canvas 桩）；③ 徽章内容与口径不变（`👤N` / 灰色「空」、`N=productionWorkerCountAt(t)`、与 S4 共用），`wp2-ux-spec.md` §6 第 4 条 PASS 判定无需改写；④ 瞬时 `drawCombatLayer()/drawDayFx()` 火花/飘字掠过属既有表现层，**判为可接受、不写进 FAIL 项**。
     - **❌ 否决「画两次」折中形态**（DS 明确否决我上一轮提的「仍在 `structure()` 内绘制 + `draw()` 晚绘阶段再次调用」）：`rrect` 底是 `rgba(...,.88)` 半透明、`label()` 文字也会重画 → 二次调用必然**双绘**，底色叠深、`👤N` 发虚/加粗。**必须二选一**：要么把 `L4796–4803` 徽章块**整体移出** `structure()`、由晚绘 pass 画一次；要么保留现状不动。**不接受任何形式的重复绘制**。
     - **🔒 强制项：`t.visible` 守卫必须覆盖所有晚绘路径**（DS 提出，规格定为强制）：`structure()` 自身无可见性判断、未探明格靠后置 `cachedLayer('fog')` 盖住；晚绘一旦放到 fog 之后，缺守卫就会在**未探明格显示工人数 = 信息泄露，比遮挡更严重**。故 ①a/①b′（fog 之后）必须加 `if(!t.visible)return;`，**且不得只覆盖 lighting 之后那一个分支**；EL 建议 **①b（fog 之前）也统一加**，三案共用一份实现、守卫可省但加上无害。
     - **🎨 美术口径三方意见（并列，待用户/主理人拍板，规格不单方推荐）**：
       | 方 | 倾向 | 理由 |
       |---|---|---|
       | **design-strategist（UX/信息层级）** | **①a** | ① 工人数徽章是**状态信息**，与 `#battleText` 胶囊、耐久牌、顶栏资源同属 HUD 信息层，本就不随场景光照染色；让徽章跟建筑受光反而与既有信息层不一致，「贴屏」代价已被大量不受光的 DOM 浮层（briefing / alertBar / eventBanner / questBar）消化。② §4.3 第 4 条与 `wp2-ux-spec.md` §6 第 4 条要求徽章「可读、与气泡同帧可辨」；①b 下夜间冷蓝暗幕会再压暗灰色「空」（`rgba(84,90,96,.88)` 底 + `#cdd3d8` 字），对比度可能不够，冲突 WP1 裁定 B 与 §4.4「夜晚单位/血条仍可分辨」。③ ①a 的硬前提是守卫覆盖所有晚绘路径（已列为强制项）。 |
       | **engineering-lead（实现自洽）** | **①b′** | 插在 `drawSelection()` 之后、`drawLighting()` 之前：既挡住气泡/圈墙/选中框几何遮挡，又保留 `drawLighting()` 白天暖光与夜间蓝暗幕染色，**正好避开 ①a 让徽章在冷蓝夜景上独自发亮、破坏 §4.4**。代价只剩「夜景压暗灰色『空』」，属**可读性而非绘制序问题，可作独立观察项登记、不阻塞 ①**；需实拍确认四角金框与徽章同帧不互压。 |
       | **art-director（我）** | **①b′ 作起点** | 与 EL 一致；但明确这是美术口径取舍，最终由用户/主理人拍板。 |
       - **折中方向（DS 提出，交主理人判断）**：若担心 ①a 与场景割裂，可按 `game.phase==='night'` 对徽章**底色/文字做局部色值微调**，而不是塞进 `drawLighting()` 之前让全局暗幕压 —— 可读性与风格一致兼得，且**不动光照管线**。若用户明确偏好「徽章随建筑受光」，①b 也可，但须补 **390×844 夜战实拍**确认灰色「空」仍可读。
       - **⚠️ DS 立场澄清（避免拍板材料读成「DS 既支持又反对 ①a」）**：DS 早前写的「①a 让徽章在冷蓝夜景上发亮、破坏 §4.4」是**对「未做缓解处理的 ①a」的风险提示，不是反对 ①a 本身**；后来「UX 倾向 ①a」是从信息层级支持其可读性优先。两者统一为：**①a 必须配「按 `game.phase==='night'` 对徽章底色/文字做局部色值微调」**，否则确有 §4.4 割裂风险。DS 接受把 ①a 从「优先」撤回、改为三候选并列，**不坚持原推荐**。
     - **✅ UX 侧可执行推荐路径（DS 给出，供拍板参考，仍由用户/主理人定）** —— 把三候选从抽象取舍变成「默认 / 回退 / 偏好」。🚫 **表内免责句（EL 建议，读表时第一眼可见）**：本表为**拍板前的建议排序，不构成执行授权**；EL 仅按 **team-lead 明确派单 + 书面授权范围**启动，**规格默认值不触发任何代码改动**。
       | 角色 | 方案 | 触发条件 / 硬前提 |
       |---|---|---|
       | **默认** | **①b′** | 同时满足「晚绘解遮挡」「不被 `drawWallRings()`/fog/selection 盖住」「仍受夜幕一致染色」，三者中最平衡。**硬前提：390×844 夜战实拍确认灰色「空」在暗幕下仍可读**。 |
       | **回退** | **①a + 夜间局部色值微调** | 若上述实拍判「不可读」→ 回退此路（可读性优先 + 缓解 §4.4 割裂）。⚠️ 夜间微调本身是**需另行拍板的可选项**，见下条。 |
       | **偏好** | **①b** | 仅当用户明确偏好「徽章随建筑受光」；**同样须补 390×844 夜战实拍**确认灰色「空」仍可读。 |
       三候选共同硬约束不变：`t.visible` 守卫覆盖所有晚绘路径、单次绘制不双绘、晚绘仅限徽章小矩形、不引入渐变 / `measureText` / 缓存 `ctx`、徽章内容与口径不变。
       🚫 **治理边界（EL 提出，必须写入）**：上表**仅为拍板前的建议排序，不是执行授权**。规格里的「默认值」≠ 授权；任何实现动作的触发条件**只有 team-lead 明确派单 + 书面授权范围**（与 DS 的 §3.2「有条件可修订但须 team-lead 授权」、§7 授权例外、EL「不 amend、派独立新提交」三条指向同一门槛）。**不得出现「规格写了默认就先做了」的越界**。
       ℹ️ **帮主理人减负（EL）**：`t.visible` 守卫已定为强制项、三案共用同一份 `drawProductionBadge(t)` 与同一批断言，**①a / ①b / ①b′ 的差异只是 `draw()` 里那一行插入位置**（`drawWallRings()` 后 / `cachedLayer('fog')` 前 / `drawSelection()` 后 / `drawLighting()` 后）；实现 diff、回归成本、测试改写量三者一致，**无工程风险差**。故「徽章是否与建筑同受光」是**纯美术 / UX 裁决**，不必以工程成本为由取舍。EL 记 DS 的 HUD 信息层论据为合理、不再为 ①b′ 争辩，拍板任一方案照做。
     - **⚠️ 内部一致性冲突（EL 指出；DS 补充「仅 ①a 条件性成立」）：夜间局部色值微调需单列、不得与共通实现混写**。
       **适用范围（DS 强调，避免与 §7 授权例外 / EL 实现自相矛盾）**：该冲突**只在拍板 ①a（或 ①a 作为回退被实际采用）时成立** —— 因为 ①a 在 `drawLighting()` 之后、不受夜幕影响，才有「冷蓝夜景上发亮 / 割裂」的 §4.4 风险需要补偿。若拍板 **①b′ 或 ①b**，徽章仍在 `drawLighting()` 之前、随场景一致染色，**完全不需要色值微调，与 EL「`inCell` 原样包装、`rrect`/`label` 一字符不改」的降险实现零冲突**。故**不得把该冲突与三案共通硬约束（守卫 / 单绘 / 小矩形 / 不引入渐变 / 内容口径不变）并列**，它是「仅 ①a 分支的附加项」。
       **冲突内容**：DS 的折中「按 `game.phase==='night'` 对徽章底色/文字做局部色值微调」与两处既有约束直接冲突：① 共通硬约束「**徽章内容与口径不变**」；② EL 降险方案「6 行原样 `inCell` 包装、**色值一字符不改**」。若真采用 ①a，须同时满足三条前置：
       1. 把该约束**显式改写**为「**文案与人数口径不变、允许夜间配色分支**」（按 `phase` 传入色值变量，不能沿用「色值一字符不改」）；
       2. **design-strategist 对约束改写无异议**（其已明确回复「无异议、接受升级为需独立授权的可选项」），但⚠️ **「DS 确认」≠ 授权**：DS 能确认的只是**设计 / 规格口径**（约束改写合理、不影响 WP2 判据），**把 §7 授权范围写宽仍归 team-lead 裁定**，规格不得写成「DS 已放行」。授权范围须额外包含「**允许徽章夜间配色分支**」（超出 §7 现有「整体移出 + 画一次」的范围），并按 §0 测试纪律在 WP5 报告写明依据；DS 仍未改 `wp2-ux-spec.md`（§3.2 修订与附录 A 都待授权）；
       3. EL 在 `drawProductionBadge()` 内加一个 `phase` 条件分支，**仍是单次绘制**、绘制序 / 计数断言不受影响；此时**不再用「6 行逐字原样包装」的降险捷径**（EL 明确）。若选 ①b′/①b 则**无此分支、保持零色值改动**。
       **约束改写的三条可验收细则（DS 提出，供 EL 实现 / QA 核对）**：
       - ① **「文案与人数口径不变」须具体化**：`👤N` / 灰色「空」两种形态、`N = productionWorkerCountAt(t)`、**与 S4 共用读取口径**——否则 QA 无法判定「口径不变」。
       - ② **夜间分支只改颜色参数**，**不得改 `rrect(36,1,24,15)` 的位置/尺寸或 `label(48,8.5,10)` 的坐标/字号**。整个几何结论（重叠 `x 27.60–34.50 / y 0.77–10.73`、顶边齐平 `y0=0.77`、`exp-4-arrived.png` 左缘判据、EL 的计数与绘制序断言）都基于这两个常量；**动位置或字号就要全部重算、三方刚收敛的口径会失效**。
       - ③ 分支**只在 `game.phase==='night'` 生效，白天仍走原色值** → 白天到岗帧 `exp-4-arrived.png` 的 FAIL 判据不受影响；单次绘制、绘制序下标断言、`t.visible` 守卫覆盖所有晚绘路径维持不变。QA 的夜战取证是 WP3 额外项、不改 WP2 判据（DS 与 QA 一致）。
       → 规格把它单列为「**需另行拍板的可选项（仅 ①a 分支）**」，**不并入三候选的共通实现**；未获上述三项前按「文案与人数口径不变、色值一字符不改」执行。
     **实现降险 + 实现侧确认（EL 两条）**：
     1. **原样包装、不换算坐标**：抽 `drawProductionBadge(t)` 时取 `b=t.building` → `if(!isProductionBuilding(b))return;` → **遍历 `game.tiles` 里 `t.building` 为生产建筑的格，不遍历 `game.productionBuildings` Map**（避免懒加载 / 旧存档记录不齐导致与 `structure()` 渲染集不一致）→ 人数仍走 `productionWorkerCountAt(t)`（内含 `ensureProductionMaps()`，口径与 WP2 完全一致）→ 用 `inCell(t.x*CELL,t.y*CELL,()=>{ rrect(36,1,24,15,5,…); label(48,8.5,10,…); })` 原样包住 `L4796–4803` 的 6 行，坐标/色值/字号一个字符不改；`structure()` 里那 6 行**整段删除**，绝不双绘；`structure`/`nodeArt`/`drawFoliage` 三个名字与 `draw()` 按名调用不动（§5 契约保持）。
     2. **绘制序 / 单绘断言可测、三案通用（⚠️ EL 实测修正：「只出现 1 次」会在多建筑态假红）**：VM 里把 `ctx.fillText` 换成记录器（Proxy 的 `set` 写进 target、`get` 优先返回），一次 `draw()` 后得到全部 `fillText` 文本序列。**EL 实测 4 座生产建筑（全 N=0）**：`totalFillTextCalls: 14`、`badgeTextCalls: ["空","空","空","空"]`（**4 次，不是 1 次**），同帧还有 `🛡`、`600 / 600`、`敌袭` 等其它文本。故规格断言口径改为：
        - **不双绘**：`badgeTextCalls.length === 可见生产建筑数`，该计数用 `for(const t of game.tiles) if(t.visible && isProductionBuilding(t.building)) 计数` 现算，**不写死 1**；**单建筑夹具下恰好 `=== 1`，须在测试注释写明该前提**（EL 精确文案），否则后来者会误把特例当通例；
        - **`visible` 守卫不泄露**：全部 `visible=false` → `=== 0`；混合态 → `=== 可见数`；
        - **绘制序（⚠️ EL 二次实测修正：必须取 min/max，否则基线假绿）**：精确断言 **`min(badgeIndices) > max(bubbleIndices)`**，语义是「**所有气泡都先于所有徽章**」，对应晚绘 pass（徽章在所有 sprites 之后）。**不能**写成「徽章文本下标晚于气泡文本下标」而不指明取哪个下标——EL 实测（seed 42、全可见 4 座生产建筑 + working 停 dock、基线）`fillText` 序列 `["🛡","600 / 600","敌袭","👤1","空","⚒","空","空", …]`：`firstBadgeIdx=3`、`bubbleIdx=5`、`lastBadgeIdx=7`；`👤1`(3)、`空`(4) 在气泡 `⚒`(5) **之前**，但 `空`(6)、`空`(7) 在气泡**之后**（`sprites.sort((a,b)=>a.y-b.y)` 下 y 大于居民的建筑本来就晚于气泡绘制）。实现者若用 `lastBadgeIdx` → `7 > 5` **基线假绿、口径 A 的红源失效**；用 `firstBadgeIdx` 或 min/max 才必失败。文本过滤用 `/^(👤\\d+|空)$/u` 与 `/^(⛏|🪓|⚒|→|!|休|\\?)$/u`；**只按调用序 + 文本过滤，不用坐标**（`inCell` 的 `save/scale/translate` 会让 raw args 失真，`x=48` 与 `x≈bx` 的坐标区分法不可靠）。该实测同时给出 `badgeCount=4 / productionCount=4` → **计数断言绿、绘制序断言红，`# fail 1` 成立**；
        - **钩子挂全局主 `ctx`**，不挂离屏 `g`——`cachedLayer()` 的 `finally{ctx=main}` 会恢复同一对象，EL 实测 `hookOnMainCtxSurvived:true`；只钩 `ctx.fillText` 即可（`label()` 的 `strokeText` 仅在传 `outline` 时出现，徽章调用未传 outline）。
        三案通用，拍板任一方案不用重写测试。**「先红后绿」的红源是绘制序下标断言**（DS/EL 确认：现状下计数断言仍绿，是绘制序先红），写成代码级证据与 `exp-4-arrived.png` 互为佐证；计数与 `visible` 守卫为护栏。EL 派单后按「先红后绿（绘制序为红源 / 计数与守卫为护栏）→ §4.1 全量 → 三条 runner 新目录 → 白天/夜间 + 到岗帧截图 → 提交」执行。
     **🧪 实现期 QA 核对四条（quality-lead 补，因上述断言会落地一个「新 Node 测试文件」；不改变 §3.6 判据）**：
     1. **§4.1 全量回归清单必须显式列出 8 个既有文件 + WP3 新文件名**（quality-lead 静态核对订正）：`48` 是 **WP1 交接时 6 文件基线**；此后 WP1-FIX-01 的 `tests/v030-lighting-capability.test.cjs` +5、WP2 的 `tests/v030-wp2.test.cjs` +24 → **当前 8 文件全量基线为 77/77**（`test(` 声明数：10+10+10+10+6+2+5+24=77，与 EL 报的 77/77 一致）。故执行 §4.1 时须**显式列出 8 个既有文件 + WP3 新文件**，判 **`# pass ≥ 77 + WP3 新增测试数`**、`# fail 0`；**沿用旧的 `48 + …` 会把门槛压低 29 条，属放宽阈值、违反 §0 测试纪律**。报告同时给出「8 文件基线 77」与「含 WP3 新增文件」两组实际数字；若实际 pass 低于 77，先查断言是否被删或测试文件漏列，**不得直接判绿**。
     2. **钩子挂主 `ctx` 须兼容 `ctx` 是 `let`**：`cachedLayer()` `L4509` 会临时把全局 `ctx` 换成离屏画布再 `finally` 还原；测试桩里**别把 `ctx` 缓存成局部 `const g=ctx`**，否则拿到错的上下文（交接计划 §5 第 2 条坑）。只钩 `fillText`、按调用序列记录。
     3. **「按下标判绘制序」不得破坏函数名契约**：`structure` / `nodeArt` / `drawFoliage` 必须仍是顶层 `function` 声明、且 `draw()` 里**按名字调用**（既有 `tests/v029-workplaces.test.cjs` 会整体替换它们统计调用）。晚绘 pass **若改成局部引用或把 `structure()` 包进新 helper，旧测试会假红**。
     4. **「先红后绿」红的性质必须正确（quality-lead 补，WP3 执行期判据）**：因红源是**绘制序下标断言**（现状计数断言仍绿），新 Node 测试的**红跑输出必须确认 `# fail ≥ 1` 且失败断言消息是「`min(badgeIndices) > max(bubbleIndices)`（所有气泡都先于所有徽章）」这类绘制序断言** —— **不是计数断言、不是 `ENOENT`/`EXC` 崩溃、也不是路径写错**；否则红跑无效、不能据此宣称「先红」。绿跑再确认三条断言（绘制序 / 计数 / `visible` 守卫）全绿。此判据不改变 §3.6 任何判据。
     - **✅ 已裁定：口径 A · 测试拆分；拒绝口径 B（quality-lead 裁定）**。起因：第 4 条与 DS 的**混合态夹具**（含「不可见 + N>0」格）同时使用时红跑会踩中「不是计数断言」排除项。**拒绝 B 的理由（QA）**：B 本质是**放宽一条 QA 验收判据**，与交接计划 §0「不得删断言、放宽阈值、改结果文件来掩盖失败」相悖并开坏先例；且同一 test 两条断言同时红时，**无法证明「仅靠绘制序修复就能转绿」**（计数断言可能因无关原因继续红，证据链不可归因），「至少 1 条来自绘制序」也弱化了「红的性质必须正确」护栏。A 让红跑**恰好 1 条失败、恰好是绘制序断言**，信号最干净且完全符合判据原文。
       - **📌 Baseline 事实（DS 要求单独登记，勿因测试拆分丢失）**：EL 实测（seed 42、4 座生产建筑、1 座 `visible=false`）：`totalProductionBuildings:4 / visibleCount:3 / badgeTextCalls:4 / countAssertionWouldFailOnBaseline:true`。**这不是夹具缺陷，而是现状「`structure()` 无可见性判断（`if(t.building)sprites.push(...)`）+ `cachedLayer('fog')` 仅视觉遮盖、`fillText` 仍发生」的代码级证据**，与 §3.5 强制项「未探明格显示工人数＝信息泄露」是同一件事的两面。
       - **口径 A 四条约束（QA 定，须写进实现 / 报告）**：
         1. **红/绿驱动 test**：**全可见**生产建筑 + `r.work.state==='working'` 停 dock 居民；**只**断言绘制序下标（「`min(badgeIndices) > max(bubbleIndices)`（所有气泡都先于所有徽章）」），另加 `bubbleCalls.length>0` / `badgeCalls.length>0` 两个前置。基线须 **`# fail 1` 且失败消息为绘制序断言**；绿跑该 test 通过。
         2. **`t.skip()` 必须条件性 / 特性探测式，禁止无条件跳过**（QA 本轮新增、EL 与前稿均未覆盖）：计数 + `t.visible` 守卫断言放独立 test，基线跳过可以（守卫是修复后才存在的语义），但**修复后最终 §4.1 全量回归中该 test 必须真正执行并通过**。计划 §4.1 PASS 阈值含 **`# skipped 0` / `# todo 0`**；无条件 `t.skip()` 会让最终绿跑 `# skipped 1` 踩线并留下永久不执行的死测试（QA 反模式）。建议按 `typeof drawProductionBadge === 'function'` 之类特性探测决定 skip（EL 实测基线返回 `'undefined'`、不抛异常），skip reason 写明「基线无守卫语义」。
            **DS 三条细则（QA 全盘采纳，与第 2 条是同一条的两面）**：
            - ① **基线 `t.skip()` 须显式且可见**：测试名标注「**baseline skip：待 P7 晚绘 pass 实现后启用**」、skip reason 写「基线无守卫语义」，**禁止静默跳过** —— 否则 WP5 报告会被误读成「断言被删」，直接踩 §0 红线。
            - ② **独立 test 绿跑必须真执行**：显式断言 `badgeTextCalls.length === visibleCount` 且 **`visible=false` 格不产生 `👤N`**；**不能两边都 skip**（与 QA「最终全量真跑」一致）。
            - ③ **混合态三格不因拆分缩减**：至少「**可见 + N>0**」「**可见 + N=0**」「**不可见 + N>0**」各一，覆盖 `👤N` / 灰色「空」两种文本形态与守卫对 N>0 的分支。
         3. **基线快照必须被证明真加载**：红跑用 `WP2_HTML_FILE=<相对仓库根路径>`（如 `../bg-scratch/wp2-pre.html`），**不是** `BORDER_HTML`；`path.join(ROOT,file)` 会拼坏绝对路径。EL 指出的失败形态是「注入错变量名 → 加载已修复 HTML → `0 fail 全绿`」，**看起来像绿跑而非崩溃、最危险**。故红跑除 `# fail 1` 外还须有**基线身份的正证据**（打印解析后的 `FILE` 路径，或断言 `typeof drawProductionBadge === 'undefined'`）；只有 `# fail 1` 不足以证明加载的是基线。
            **EL 建议、QA 采纳的「永不 skip 身份 test」（给红跑断言级正证据）**：加一条**永不 skip** 的 test，**红跑与绿跑两次都执行、都通过**：用 `typeof drawProductionBadge` 判定所加载 HTML 的身份（注入 `WP2_HTML_FILE=<基线快照>` 时 `=== 'undefined'`；默认/修复版时 `=== 'function'`）并打印解析后 `FILE`。这比只打印路径更硬：红跑的正证据是**断言级**而非仅靠日志；该 test 恒通过，**红跑仍是恰好 `# fail 1`**。
         4. **不得引用新增 `window.FW` 导出 / `drawProductionBadge`**：只用既有 `chooseSite/develop/addResident/assignWorker/updateResidents/draw/getResidentPose`；否则基线抛 `TypeError: ... is not a function`（QA 判据明确排除的崩溃，红跑无效）。另按既有第 2 条：只钩主 `ctx.fillText`、不缓存 `const g=ctx`、不破 `structure`/`nodeArt`/`drawFoliage` 按名调用契约。
       - **最终绿跑阈值**：§4.1 全量命令须**显式列出 8 个既有文件 + WP3 新 Node 测试文件**，判 **`# pass ≥ 77 + WP3 新增测试数`**（当前实测基线 77，见核对第 1 条）、**`# fail 0`、`# skipped 0`、`# todo 0`**；绿跑再确认绘制序 / 计数 / `visible` 守卫三条断言全绿。
         ⚠️ **红跑 / 绿跑的 skip 语义并列两行（DS 建议、QA 采纳，避免笼统写成一句 `# skipped 0`）**：
         - **基线红跑**：`# fail 1`，失败消息为 **`min(badgeIndices) > max(bubbleIndices)` 绘制序断言**，`# skipped 1`（条件跳过独立守卫 test）—— **合法且预期**。
         - **修复后最终全量绿跑**：`# fail 0`、`# skipped 0`、`# todo 0`、`# pass ≥ 77 + WP3 新增`。

         红跑判据仍是 `# fail 1` + 绘制序断言 + 基线身份正证据，**不要因为红跑里看到 skip 就判红跑无效**；执行期报告须**分别标注红跑 / 绿跑的 skip 含义**。
         **本裁定不改变 §3.6 的 FAIL 判据、触发窗口、待实拍限定、复拍门禁、唯一判定帧**；两帧分工、N=0 夜战夹具、条件项不进当前 WP2 清单一律不变。
     - **🔗 前提：口径 A 整套测试设计以「P7 拍板 ①a / ①b / ①b′」为前提（EL 发现，规格此前未写明）**。四条核心机制**全部依赖「新增顶层 `drawProductionBadge()` + 晚绘 pass」存在**：`min(badgeIndices) > max(bubbleIndices)`（晚绘后所有徽章才都晚于所有气泡）、条件性 `t.skip()` 探测 `typeof drawProductionBadge`、永不 skip 身份 test 的绿跑分支 `=== 'function'`、`t.visible` 守卫断言。若 team-lead 为「不动 WP2 代码」而按 §9 退到 **②（左移+角标收窄）/ ③（保守）**，则：
       - 无晚绘函数 → **身份 test 绿跑 `==='function'` 直接红**；
       - 无 `t.visible` 守卫语义 → **守卫 test 永久 skip**，最终绿跑 `# skipped 1` 踩阈值；
       - 绘制序不变（徽章仍在 `structure()` 内按 y 排序、跨越气泡两侧）→ **`min(badge)>max(bubble)` 永远红**，先红后绿不成立。
       → **②/③ 下整套口径 A 失效，不是改几行能救**。规格明确：「**本裁定以 P7 拍板 ① 系为前提；若拍 ②/③ 须另定红源并重新裁定**」。此项须作为 **P7 拍板输入**同步 team-lead。
     - **🧩 ②/③ 的条件性替代红源（EL 备、QA 原则同意；登记为「条件性备选」，⚠️ 不是已裁定）**：钩 `ctx.roundRect`/`rect` 取**气泡包围盒**（`rrect(bx-7s,by-7s,14s,13s)` 是世界像素坐标、**不经 `inCell`、raw args 可靠**），与已知徽章常量 `x 27.60–46.00 / y 0.77–12.27` 做**非重叠断言**：基线重叠 ≈68.8px² → 红；② 左移或 ③ 缩小后 → 绿。三条边界必须一并遵守：
       1. 「不用坐标」规则的放宽**仅限气泡侧**；徽章仍用常量 / 调用序，**不读 `inCell` 变换后的 raw args**（与该规则原意不冲突）。
       2. 启用等同**重新裁定红跑口径**，仍须满足红跑 `# fail 1` + 断言消息明确 + 基线身份正证据，以及最终绿跑 `# fail 0` / `# skipped 0` / `# todo 0` / `# pass ≥ 77 + WP3 新增`。
       3. **「守卫 test 不适用」而非「同步重写」（EL 细化、QA 采纳，比原约束更精确）**：②/③ **没有晚绘 pass**，`structure()` 仍在 sprites 循环、`cachedLayer('fog')` 照常后置视觉覆盖 → **未探明格不会浮出徽章、根本不存在信息泄露**。故 ②/③ 下：
          - **不保留** `=== 'function'` 身份断言；**不保留**「计数 + `t.visible` 守卫」独立 test（**无语义可断**）；**更不留永久 skip 死测试**；
          - 而是**另写一组测试**：几何非重叠红源 + 基线身份正证据（见下条路径级方案）。
          - ⚠️ **这不是删断言，而是该断言在 ②/③ 下无适用对象**；执行期报告须显式写明「**②/③ 不引入晚绘信息泄露风险，故守卫 test 不适用**」，避免被误读成违反 §0「不得删断言」红线。
       4. **②/③ 的身份 test 改用「路径级正证据」（EL 细化、QA 采纳）**：无 `drawProductionBadge` 可作特性探测，故注入 `WP2_HTML_FILE` 时断言 **`FILE === path.join(ROOT, process.env.WP2_HTML_FILE)` 且文件存在**、打印解析后绝对路径；绿跑断言 **`FILE === 'Border-Guard-v0.29.html'`（默认回退）且 `typeof drawProductionBadge === 'undefined'`**。红/绿两次都执行都通过、红跑仍恰好 `# fail 1`。这符合 QA 判据原文「打印解析后的 `FILE` 路径**或**断言 typeof」二选一。**① 系仍用 `typeof` 特性探测，两套按 P7 结果二选一、不混用**。
       **📌 登记纪律**：Baseline 事实 `countAssertionWouldFailOnBaseline:true`（4 次 / 3 格）**无论拍 ① 还是 ②/③ 都照旧单列**（现状 `structure()` 无可见性判断的代码级证据），但 **②/③ 下不构成「新引入的信息泄露」**；WP3 报告须把「现状既存代码级事实」与「②/③ 未引入新泄露」两件定性写清、别混为一谈。
       本备选由 team-lead 另行授权后方可采用，规格不预判、不替 QA 裁定。
     - **执行期防错（EL）与历史备注**：① 红/绿驱动 test 不得引用新增 `window.FW` 导出（已并入上条第 4 项）；② **路径写错的具体形态（历史备忘，现已消解）**：team-lead 原指令曾约定 `BORDER_HTML`，而代码读 `WP2_HTML_FILE`；若误按原指令注入会加载已修复 HTML 得 `0 fail 全绿`。**QA 计划 L359 已按实装订正为 `WP2_HTML_FILE=../bg-scratch/<相对路径>`**（helper 用 `path.join`、绝对路径会拼坏），故**当前不是阻塞项**；`WP2_HTML_FILE` 与 `BORDER_HTML` 是同一变量的两个名字、不是两处缺口。**是否补 `BORDER_HTML` 兼容一行由 team-lead 裁定**（QA 明确「这是 team-lead 的授权决定，不是我的」），EL 不擅自改、不 amend；规格不预判、也不再建议「把补丁并进授权范围」。
     **跨包授权约束**：`wp2-ux-spec.md` §3.2 现写「绘制位置：`structure()` 的 `inCell()` 回调内、所有建筑分支之后；不新建顶层绘制函数替换 `structure`」——抽新函数**不替换 `structure`**、§5 函数名契约不受影响；DS 已给结论「**有条件同意修订「绘制位置」一行，但必须 team-lead 授权，我仍不擅自改**」，且 `inCell` 原样包装降险**提高了他的接受度**，四个前置照旧（授权 + 独立新提交 + 保留三个按名调用 + 避免双绘），其余 §3.2 约束全部保留。故仍需 **team-lead 派独立新提交任务**（EL 明确不 amend、不擅自改）。
   - **排除 / 否决的解法**：① **垂直上移 `by`（`-43*s`）→ 已否决**（气泡 y0 与徽章 y0 齐平、需整块出格，见上方引用块③）；② 单独缩到 `16*s` → 仍超 10px 空隙；③ 把气泡改透明底 → 白字与徽章金字糊在一起；④ 改 WP2 徽章本体 → §7 红线。
   - **触发窗口（EL 实算，对 §3.6 复拍很关键）**：遮挡**只在 `r.work.state==='working'` 且居民停在 dock 格**时发生——`N=0`（灰色「空」）时该锚点没有气泡、徽章完整；`N>0` 但居民在途时气泡锚在居民当前位置、不在 dock，也不重叠。**故 FAIL 窗口恰好是 WP2 §6 第 4 条的「到岗」那张 `[R]` 截图**。
   - **只读裁切佐证的边界（quality-lead 复核修正我上一轮的过度引申）**：`D:/Work/game/bg-scratch/after/wp2-badge-occlusion-zoom2.png` 是 EL 的 2× 只读放大裁切、非自然流程证据。**仅上半「四建筑 0 人态、四个灰色『空』徽章清晰可辨」成立**；**下半「林场单工人态」的蓝绿小圆角块在该 2× 裁切里无法无歧义区分是 `👤1` 徽章还是作业气泡**（旁边还有「到岗」飘字与选框干扰）。故**该图既不能证实也不能否证遮挡，不得据此对 working 同帧下结论**；执行时用 `exp-4-arrived.png` 原帧 + 专门 ≥4× `zoom` 裁切判左缘覆盖。这正好印证「只读放大裁切不能替代 working 同帧复拍」的限定。
   - `getResidentPose()` 有走动动画偏移、`label()` 文字基线 / emoji 墨迹 / `rrect` 圆角都会改变实际重叠区，**坐标为静态推算，最终以 §3.6 复拍实拍为准**。
   - ⚠️ **无论 P7 选哪一项，「解遮挡」都是必做项**：按坐标推算遮挡在现状 `14*s` 已存在，不是放大引入的；「放弃放大」不等于「零冲突」。
4. **`ctx.save/restore` 纪律**：WP2 徽章已用 `ctx.save()/restore()` 包住。我改的富/铁图形也要用 `ctx.save()/restore()`（或只用 `path()` 不依赖全局状态），避免 `fillStyle/strokeStyle` 泄漏影响后续绘制。engineering-lead 已确认 `label()` 不依赖 `measureText`、`rrect()` 在 VM canvas 桩上是空操作不抛异常，WP2 的 24 条 Node 测试 + 三条 runner 全绿已覆盖。
5. **不要用 `const g=ctx`**、不要引入渐变（§5）。

### 3.6 验收判据（§3 全部）

| 项 | 判据 |
|---|---|
| 视觉 | 50% 缩放图（`extra/scale-50pct-*.png` 同款夹具重拍）里四类小字不再是「糊成色块的汉字」：富/铁变成可辨菱形/方块、气泡符号变大可辨、耐久数字可读、箭塔等级字消失但三色顶仍可辨 |
| 分区 | 矿场格左上图形角标与右上 WP2 徽章不重叠；截图放大确认 |
| **同帧复拍（design-strategist 要求，必做）** | **复拍 `wp2-ux-spec.md` §6 第 4 条**：派居民到生产建筑、到岗后截图，**1440×900 与 390×844 各 1 张**；同帧内 `👤N`（或灰色「空」）**与状态气泡均完整可辨、互不遮挡** → **遮挡判 FAIL**。因 `getResidentPose()` 有走动动画偏移，坐标推算不替代实拍；此复拍项同时是 WP3 是否破坏 WP2 验收证据的门禁。建议 quality-lead 把它登记为 **WP3 完成后的复拍项**（见 §10 第 7 步） |
| **FAIL 判据精确化（EL 实算 + QA 代码佐证）** | ⚠️ 判据写「**`👤` 图标或徽章左缘被实色气泡覆盖**」，**不要**写「徽章不可见」——实算下文字中心 `x=36.80` 在气泡右缘 `34.50` 之外，`N` 数字大概率存活，若写「徽章不可见」QA 会因「数字还在」而犹豫、把 FAIL 误放成 PASS。**quality-lead 补代码佐证**：`label()` `L4495` 是 `ctx.textAlign='center'; ctx.textBaseline='middle'`，故 `label('👤'+n,48,8.5,10)` 的中心虽在气泡右缘外，**字符串左半的 `👤` 会向左伸进气泡区** → 「按左缘判」比「徽章不可见」严谨。灰色「空」为汉字、墨迹更宽，同样按「徽章左缘被覆盖」判 |
| **待实拍限定（DS 要求）** | 上述「既存遮挡」是**坐标推算、未实拍**；`getResidentPose()` 走动动画偏移、`label()` 文字基线 / emoji 实际墨迹、`rrect` 圆角都会改变实际重叠区。**现状是否遮挡以 quality-lead 的 `exp-4-arrived.png` 为准**；在拿到实拍前规格只记「推算存在遮挡、待实拍确认」，**不写成「WP2 已 FAIL」** |
| **触发窗口** | 判 FAIL 只在 `r.work.state==='working'` 且居民停在 dock 格时；`N=0`（无气泡）或居民在途（气泡锚在居民当前位置）不重叠。故以 WP2 §6 第 4 条的**「到岗」那张 `[R]` 截图**为唯一判定帧 |
| 回归 | `node --test` 全量（**≥ 77 + WP3 新增**，0 失败；8 文件基线 77 见 §3.5 核对第 1 条）；三条浏览器 runner `OK`、`pageErrors=[]`；`git diff cd4437a -- tests/` 对已有断言只有新增 |
| 红线 | `structure`/`nodeArt`/`drawFoliage` 函数名与 `draw()` 按名调用不变；`ring.hp` 只读；WP2 徽章代码**默认零改动**——**仅当 team-lead 明确授权 P7 ①a/①b/①b′ 时，按 §7 第 2 条声明的授权范围例外**（整体移出 + 晚绘画一次、不双绘、DS 确认 §3.2 可修订、独立新提交、不得 amend） |

**⚠️ WP2 验收归属（两种口径并存，待 team-lead 裁定）**：`exp-4-arrived.png` 正是 `wp2-ux-spec.md` §6 第 4 条的取证图；**若实拍确认遮挡，WP2 验收现在就不达标**，影响的不只是 WP3 复拍。两位成员提出了不同定性，规格如实并列、不替主理人拍板：

| 口径 | 提出方 | 内容 | 依据 |
|---|---|---|---|
| **A · 条件 PASS / 归 WP3** | design-strategist（我支持） | 守住 §7 红线「WP2 徽章零改动」，把「解遮挡」**统一归 WP3 P7**，WP2 验收报告把 §6 第 4 条标「**条件 PASS / 待 WP3 修复后复拍**」，**不判 WP2 实现返工** | 否则会逼 engineering-lead 去改已列为红线的 WP2 代码；§10 第 7 步复拍门禁承接 |
| **B · 双重门禁 / WP2 当场判** | quality-lead（已写入其 `wp2-acceptance-plan.md` §8.2） | ① **前半**：WP2 验收当场就判，若双视口 FAIL 属 **WP2 质量门 FAIL**、须先回传 team-lead，**不能留到 WP3**；② **后半**：WP3 完成后仍复拍（验证 P7 未破坏 WP2 证据），排在 P7 定案之后、WP3 质量门之前 | 「放弃放大 ≠ 零冲突」意味着**基线本身就可能是坏的**，不能只当回归触发器 |

**两者不矛盾于「解遮挡归 WP3 P7」与「§3.6 复拍必做」，分歧只在 WP2 验收当场如何定性**（条件 PASS vs 质量门 FAIL）。规格不做裁定：请 team-lead 在「执行 WP2 验收」指令里明确采用哪一口径；quality-lead 已建议把 B 的前半写进该指令。**无论采 A 还是 B，§3.6 的 FAIL 判据、触发窗口、待实拍限定、§9 P7 的选项与 §10 第 7 步复拍门禁都不变**。

---

## 4. 7 视口截图清单与判定标准

### 4.1 视口清单（计划 §3 WP3 第 1 条，逐字）

| # | 视口 | 输入 | 场景 |
|---|---|---|---|
| V1 | 1440×900 | 鼠标 | 开局 / 白天 / 夜战 / 卡牌 |
| V2 | 1920×1080 | 鼠标 | 同上 |
| V3 | 1108×1195 | 鼠标 | 同上 |
| V4 | 886×956 | 鼠标 | 同上 |
| V5 | 1108×720 | 鼠标 | 同上 |
| V6 | 932×430 | **touch** | 同上 + 触控操作 |
| V7 | 390×844 | **touch** | 同上 + 触控操作 |

命令形态（交 quality-lead，**本规格不执行**）：`bash scenes.sh <OUT> <W> <H> [touch]`，输出统一到 `tests/artifacts/v030-polish/viewports/`；夹具图标注「状态夹具，非自然流程证据」。

**🌙 条件触发的额外夜战取证（quality-lead 补，仅当 P7 定案为 ①a 或启用「夜间局部色值微调」时；①b′ 的硬前提实拍也用本夹具）**：这些都是**夜景表现**，须另留**夜战截图**核对「徽章可读性」与「不压暗幕」，**不能用 `exp-4-arrived.png` 的白天到岗帧代替**；建议 1440×900 与 390×844 各 1 张、标注「状态夹具，非自然流程证据」。
- **⚠️ 夹具条件（EL 提出，最易与遮挡混淆的一点）**：取证人须用 **N=0 的生产建筑**（灰色「空」、`assignedResidentIds=[]`），**不要用已派工的到岗帧**。理由：`r.work.state==='working'` 且停 dock 时，实色气泡会先遮住徽章左缘，**暗幕压暗与气泡遮挡两个效应叠在一起，判「灰『空』是否仍可读」时无法归因**；N=0 格没有该锚点气泡（N>0 在途时气泡锚在居民当前位置、也不在 dock），可**单独量出 `drawLighting()` 夜幕对 `rgba(84,90,96,.88)` 底 + `#cdd3d8` 字的压暗程度**，正好对应「①b′ 硬前提是否成立 / ①a 夜间配色分支是否需要」。
- **两帧分工**：**白天到岗帧 `exp-4-arrived.png` 判气泡遮挡**（§3.6 唯一判定帧）；**夜间 N=0 帧判暗幕可读性**（本项）。两者互不替代。若 quality-lead 需要，EL 可提供只读 CDP 夹具配合，但须等 team-lead 派单或主理人明确要求。
  - ⚠️ **与 QA 计划 §6 L454 不冲突（quality-lead 复核）**：L454 写「`N=0`（灰色「空」）帧与 `N>0` 在途帧**不用于判此项**」，其中「**此项**」特指**气泡遮挡 FAIL 判据**（`👤` 图标或徽章左缘被实色气泡覆盖）；而本项的夜间 N=0 帧判的是**暗幕可读性**，是**另一个判定项**。两帧各自只服务一个判据。执行时须**在报告里分别标注帧用途**，避免把夜间 N=0 帧误当成遮挡判定帧、或反过来拿白天到岗帧去量夜幕压暗。
- **边界**：色值微调不改变「`👤` 图标或徽章左缘是否被实色气泡覆盖」的判定 → **不影响 WP2 的 §6 第 4 条判据，只增加 WP3 的取证清单项**。
  - ⚠️ **条件触发项不进当前清单（quality-lead 边界）**：本项属 **WP3 执行期清单**，**不在当前 WP2 验收的 6 张 `guide-*.png` / `exp-4-arrived.png` 双视口清单里**；只有当 **P7 拍板结果落在 ①a 或启用夜间局部色值微调、且 team-lead 明确派单后**才加进当次取证清单，避免执行时把「条件项」误当「必拍项」而多做或漏做。若 P7 定案为 ②/③ 且既不需 ①a 也不核验 ①b′ 硬前提，本项不触发。

### 4.2 逐视口判定标准（计划 §3 WP3 第 2 条 + `v029-hud-occlusion-browser.cjs` 阈值）

| 判据 | 量化标准 | 来源 |
|---|---|---|
| 无横向滚动条 | `document.documentElement.scrollWidth ≤ innerWidth + 1`；`body` 已有 `overflow:hidden`（`L11`），主要查是否有元素溢出触发横向滚动 | 计划 §3 WP3.2 |
| 顶栏资源不换行、不裁切 | `.stocks` 单行；每个 `.stock` 的 `getBoundingClientRect()` 完整在 `.top` 内；≤600px 下按 `L548` 已实现「资源只显示图标+数字」（`span{font-size:0}`） | 计划 §3 WP3.2 / WP3.5 |
| 底栏按钮文字不竖排 | `.cmd-btn` 宽度 ≥ 文字宽；`writing-mode` 非 vertical；`L567` 横屏矮视口已把 `.cmd-btn` 改 `flex-direction:row` 并隐藏 `small` | 计划 §3 WP3.2 |
| 详情面板与底栏不重叠 | `overlap = 0`（runner `L174` 附近采集）；`focusClear=true` | runner 断言 |
| 三卡并排且「选择」可见 | 3 张 `.growth-card` 同排、`card-go`（「选择」）按钮完整在卡内且可点击。⚠️ **runner 口径订正**：`hud` runner `L463` 与 `rings` runner `L239` 只对 `document.querySelector('#cardRow button')`（**首张卡**）做 `elementFromPoint` 命中；`rings` runner `L259` 的 `cardYs` 断言仅验证三张 y 差 `<28`（同排），**不对第 2/3 张做命中或视口内检测**。故 `cardsClickable=true` 只能读作「首卡命中 + 三卡同排」，**第 3 张是否被裁切只有截图能覆盖**（见 §5.4，该补图是唯一覆盖、非可选） | 计划 §3 WP3.2 / runner `L238–249, L259, L463` / quality-lead 复核 |
| 横幅不挡主城 | `#eventBanner` 矩形与主城屏幕矩形的**交集 ≤ 主城面积的 20%**，或横幅位于主城上方（`banner.bottom < castle.top`）。现 `top:72px` / 手机 `64px` / 横屏 `52px`，`min-width:min(360px,100%-24px)` | 计划 §3 WP3.2 / CSS `L517/563/573` |
| **浮层面板目视检查（runner 不兜底，必做）** | ⚠️ `measureOcclusion` `L129` 的 `blocked` 只含 `.briefing/.legend-panel/.minimap-panel/#commandDeck/#playSide`，**`#eventBanner`、`#victoryCard` 及任何新增浮层均不计入**。故：① `#eventBanner` 不遮顶栏（`banner.top ≥ top.bottom + 4`，§4.4）；② 胜利页 `#victoryCard` 在 390×844 / 932×430 不遮顶栏/主城/底栏（§2.3）；③ WP3 若新增或放大任何浮层面板，**须单独目视检查遮挡，不得因 runner 全绿而略过**（与 §5.4 第 3 张卡同口径） | quality-lead 复核 / §4.2.1 ⑦ |
| 选址底栏宽 | `< 520`（runner `L249`，实测 max 286） | runner |
| 折叠图例 / 小地图高 | `≤ 60`（runner `L238–239`） | runner |
| 详情空闲比 | `dayFree ≥ 0.45` 常规 / `≥ 0.48` 矮横屏（h≤430）；`siteFree ≥ 0.85` 桌面 / `≥ 0.80` 触屏 / `≥ 0.68` 矮横屏（runner `L322–325`） | runner |
| 932×430 特判 | `sideDock==='right'`、`insets.r > 100`、`insets.b ≤ deckOnlyB+2`、焦点在右栏左侧（runner `L312–318`） | runner |
| 390×844 特判 | `sideDock==='bottom'`（runner `L319–321`） | runner |
| 触控 | 932×430 与 390×844 用 `tiletap` 完成：短按移动、长按 400ms 打开详情、拖动平移、点卡牌选中 | 计划 WP3 验收 |

> **测试纪律**：以上阈值一律**不得改断言**。失败时改 CSS/实现（计划 §3 WP1 第 4 条与 §0 测试纪律）。

#### 4.2.1 ⚠️ 极窄余量预警（quality-lead WP1 实测，来源 `tests/artifacts/v030-hud/browser.json`）

WP1 实测值距离 runner 阈值极近，**WP3 任何新增按钮、padding、面板尺寸或字号上调，都可能让 390×844 直接触线**：

| 视口 | 指标 | WP1 实测 | 阈值 | 余量 | 风险 |
|---|---|---|---|---|---|
| **390×844** | `siteFree` | **0.801** | **0.80** | **0.001** | 🔴 **几乎零余量**，任何增高选址面板/底栏的操作都会破线 |
| 1108×720 | `siteFree` | 0.865 | 0.85 | 0.015 | 🟠 窄 |
| 390×844 | `dayFree` | 0.473 | 0.45 | 0.023 | 🟠 窄（且 932×430 用 0.48 阈值，更紧） |
| 全部 | `legendH` / `miniH` | 54 px | ≤ 60 | 6 px | 🟠 §1.4 改小地图尺寸时不得抬高折叠态 |
| 全部 | `deckWidth` | 286 / 274 | < 520 | 充裕 | 🟢 |

**⚠️ 先厘清余量的真实成因（quality-lead 二次复核更正）**：`v029-hud-occlusion-browser.cjs` `L129` 的 `measureOcclusion` 只把 **5 类元素**计入 32×32 网格的 `blocked`：

```js
document.querySelectorAll('.briefing,.legend-panel,.minimap-panel,#commandDeck,#playSide')
```

`#victoryCard` 与 `#eventBanner` **不在这个集合里**，因此**不参与 `siteFree`/`dayFree` 计算**。真正驱动 390×844 那 0.001 余量的是 `.briefing`（顶栏简报）、`#commandDeck`（底栏）、`#playSide`（详情面板）、`.legend-panel`、`.minimap-panel`。据此更正硬约束 ② 的定位并补两条：

**由此产生的 WP3 硬约束**（逐条）：

1. §3.2 作业气泡放大 `14*s→18*s` 是 canvas 内绘制，**不占 DOM 布局**，不影响上述比值——但仍需截图确认不遮挡 WP2 徽章（§3.5，且见 §9 P7 的几何无解结论）。
2. §2 victoryCard 改 `border-radius`/`box-shadow`/`backdrop-filter` **不改 `width`/`max-height`/`padding`**。**定位更正**：这条是**防御性约束**（避免胜利页自身被撑爆、保持与板岩玻璃风格一致的尺寸），**不是** 390×844 `siteFree` 0.001 余量的成因——`#victoryCard` 不进 `blocked` 集合。仍保留，但不要误以为改它会让 runner 变红。
3. §4.3 两条手机端处置（390 夜战 3 卡、第 4 按钮裁切）**不得通过「加高底栏」实现**——`siteFree`/`dayFree` 余量不足以吸收任何增高；只能走「等比压缩 / 横滑 / 文字换行 / 字号下调」这类**不增高**的方案。**这是最高杠杆的一条**（`#commandDeck` 在计数集合内）。
4. §1.4 小地图若改内部分辨率，`miniH` 折叠态 54px 必须保持 ≤60（`.minimap-panel` 在计数集合内）。
5. 每改一处 CSS 立刻跑 `v029-hud-occlusion-browser.cjs` 比对 6 视口的 `siteFree`/`dayFree`/`legendH`/`miniH`，**不要等 7 视口截图全部拍完才发现触线**。若红，**改 CSS 不改断言**（计划 §3 WP1 第 4 条）。
6. **（新增）别让 `.briefing` 顶栏简报或 `#playSide` 详情面板变大**——这两者也在 `blocked` 集合内，是余量的直接驱动项。§2 的 victoryCard 主题化不得顺带扩大简报/详情面板的尺寸或 padding；§4.3 处置不得把内容挪进详情面板来「腾空间」。
7. **（新增）⚠️ runner 覆盖盲区：浮层面板没有断言兜底**。`#eventBanner`、`#victoryCard` 及 WP3 若新增的其它浮层都不计入 `blocked`，**计划 §3 WP3 的「横幅不挡顶栏/主城」与「胜利 HUD 主题化」只能靠 7 视口截图 + 胜利页截图人工判定**。故 §4.2 判定表新增一行「浮层面板目视检查」（见下），**不得因 runner 全绿而略过**，与 §5.4 第 3 张卡的处理方式一致。

> 感谢 quality-lead 两次复核：§4.2 的量化与特判与 runner `L238–249 / L312–325` 逐条吻合，无需改判据；本预警表与上述 ⑥⑦ 为其补充的实测余量与覆盖盲区信息。

### 4.3 WP1 观察到的两条手机端问题的处置建议

来自 `wp1-acceptance.json` `observations` 与 `wp1-visual-audit.md` §6.4 #4：

| 问题 | 判定 | WP3 处置建议 |
|---|---|---|
| **390×844 夜战底部战斗栏只完整显示 2 张卡（桌面 3 张）** | 属 WP3 多端范围，**但不阻塞 WP1**（hud-occlusion runner 已通过）。⚠️ **口径订正**：runner 只证「首卡命中 + 三卡同排」，**未证第 2/3 张在视口内且可点**（见 §4.2），故本条仍是 WP3 需实拍确认的问题，不能因 runner 绿而略过 | ① 优先 CSS：在 `@media(max-width:600px)`（`L548`）给 `.command-bar`/战斗卡容器加 `overflow-x:auto` + `scroll-snap-type:x mandatory`，或把 3 张卡改为 `flex:1 1 0` 等比压缩 + 字号 `13→11px`、图标 `32→26px`（参照 `L548–556` 已有手机端缩放）；② **不得**删第 3 张卡或改成折叠菜单（会改变玩法可达性、触碰 §0 边界）；③ 验收：390×844 夜战截图里 3 张卡文字完整、可横滑或等比显示，「选择」/攻击按钮可点；④ 若 CSS 无法在 390px 内既保证 3 卡又保证文字可读，**登记为 WP5 剩余问题**并请用户拍板是否允许横滑 |
| **390×844 白天第 4 个命令按钮文字右侧略裁切**（`mobile-day-compare` AFTER 可见「农场 2 材料·点对点…」） | 同上，属 WP3 | ① CSS：`.cmd-btn small` 在 ≤600px 下 `white-space:normal; line-height:1.2; font-size:10px`（`L556` 现值 10px）并把 `.cmd-btn` 的 `min-width:72px`（`L553`）适度上调到 `76–80px`、或让 `.command-bar` 允许 `overflow-x:auto`；② 更稳妥：给 `.cmd-btn small` 加 `text-overflow:clip` 而非 `ellipsis`，并确认文字是「换行」不是「裁切」；③ 验收：4 个命令按钮首屏完整显示（计划 WP3.5「底栏一屏至少完整显示 4 个命令」），第 4 个 detail 文字不截断；④ 与 §3.2 气泡放大、§1.4 小地图折叠态一起在 390×844 截图里联合复核，避免改一处挤另一处 |

### 4.4 `#eventBanner` 不遮顶栏（WP3.5）

现 `L517` `top:72px`、手机 `L563` `top:64px`、横屏 `L573` `top:52px`。规格判据：7 视口下 `banner.top ≥ top.bottom + 4`；横屏矮视口（932×430）顶栏较矮，`top:52px` 需实测确认不压资源条；若压，改 `top` 到 `top.bottom + 8`（用 CSS 变量或媒体查询，**不要改成 JS 计算**，避免新增布局逻辑）。`bannerIn/bannerOut` 动画与 `prefers-reduced-motion` 规则属 WP4 范围，**WP3 不动**（§7）。

---

## 5. WP1 遗留 4 项留证补图的可执行方案

> 依据 `wp1-visual-audit.md` §6.3 剩余清单。这 4 项是**留证性补图**（代码层面均已齐备、判定倾向符合），不是修复项。全部使用 `fx/` 状态夹具，**必须标注「状态夹具，非自然流程证据」**（与 `wp1-acceptance.json` 的 `fixturesNote` 一致），不得计入 WP5 自然试玩证据。
>
> ⚠️ **例外：5.4 不是纯留证**。经 quality-lead 复核，runner 对卡牌只证「首卡命中 + 三卡同排」，**第 3 张是否在视口内且可点没有任何自动化覆盖**；现有 `cards-*.png` 又拍在 `cardIn` 动画中途（只见 2 张、第 2 张半透明）。故 5.4 是**唯一覆盖**，必须执行且须 `wait ≥700ms`；若等足动画仍缺第 3 张，则升级为真实缺陷工单，而非「留证不足」。

| # | 补图 | 夹具要求 | 拍摄要点 | 判定标准 | 标注 |
|---|---|---|---|---|---|
| 5.1 | **箭塔 lv1 红顶 / lv2 紫顶同框**（最好 lv0/1/2 三塔同屏） | `fx/day-scene.js` 类夹具：建 3 座塔，分别 `b.level=0/1/2`（或调用 `rework()`，锚点 `function rework(t)` 快照 `L3183`），`game.phase='day'`，相机对准三塔 | 三塔同框不裁切；蓝/红/紫三顶清晰；`L4787` 的 `roof/roofD` 与 `L4786` 木台颜色差异可见 | 三色互不混淆；`L4673` 逻辑（现 `L4787`）视觉实证；**注意 §3.4 若删除了 7px 等级字，本图应在删除前拍，或同时记录删除后「三色顶仍可辨」** | 状态夹具 |
| 5.2 | **倒塌后相机留在圈墙区域的碎石残段帧** | 夹具设 `ring.hp=0; ring.status='broken'`（走 `drawBrokenRing()`，锚点 `function drawBrokenRing`），**关键：把相机 `setCameraMode('manual')` 并 `centerOn` 圈墙中心**，不要跟随领主 | 相机对准原圈墙四边；碎石残段散布可见；无逐段血条；耐久牌消失；主城仍在 | `drawBrokenRing()` 的旋转石块可见；全圈无逐段血条；与 `combat-after-collapse.png`（相机已平移、拍不到墙）形成互补 | 状态夹具 |
| 5.3 | **交互四态**：合法格高亮 / 射程圆 / 蓝色虚线 / 四角选框 | **四张独立夹具（下称「第 1 / 2 / 3 / 4 张」，与 §5.3.1 的「方案 A/B/C/D」区分，避免编号撞车）**，且每张都须先按 §5.3.1 让 `guideStep() !== 'S5'`（否则 `drawRecommendedDefense()` 金色虚线框叠加）。**第 1 张**合法格高亮：`game.phase='day'` + `game.mode='tower'`（任一 `BUILDS` 键）→ `drawToolPreview()`；**第 2 张**射程圆：`game.selected` 指向箭塔 + `game.panel=true` → `drawSelection()`；**第 3 张**蓝色虚线：某居民 `r.order={kind:'move',tileId:...}`；**第 4 张**四角选框：选中普通地块。**第 2/3/4 张必须保持 `game.mode=null`**（`drawToolPreview()` 判 `!game.mode` 即返回，否则多出整体高亮）；**第 1 张必须 `phase==='day' && mode` 非空**。四张都设 `game.hoverTile=null`（实装存的是 `at(t.x,t.y)` 的 number 索引，判 `!=null`） | 每张只突出一种可视化，**但第 2 张射程圆允许四角金框同框**（`drawSelection()` 既画四角框又画射程圆，属既有实现，§4.3 第 2 条本就要求四者同框）。⚠️ **方案 A 在 day1 时 `drawGates()` 的红色脉冲入口仍在画面里**——第 2/3/4 张应把它**登记为既有背景**，不是「多画的状态」，不得据此判 FAIL（quality-lead 补注） | ⚠️ **`site-*.png` 的淡黄虚线方框是 `boundaries(showStarting)` 的 A/B 起始领地虚线，不是 `drawToolPreview` 的合法格高亮**，勿误判。合法格高亮应是多个格子的半透明金黄填充+金色实线框；射程是金色虚线圆；蓝色虚线是 `rgba(120,190,255,.9)`；四角选框是金色 L 形 | 状态夹具 |
| 5.4 | **卡牌第 3 张（唯一覆盖，非可选）** | 触发 `game.cardPending=true` + `game.cardChoices` 3 项（`L2978` 固定 `Array.from({length:3})` 抽 3 张；WP2 实现后行号漂移约 `L3422`，以锚点为准）。**等 `cardIn` 动画完全结束**：CSS `L498 animation:cardIn .38s` + `L500 .growth-card:nth-child(3){animation-delay:.14s}` → 第 3 张 **520 ms** 才结束，`@keyframes cardIn` 起态 `opacity:0; translateY(26px) scale(.9)`。故 **`wait ≥700ms`**（比 520 ms 留 180 ms 余量；§5 通用 150ms 不够，两个 runner 都在 `await frames()`≈32ms 后立刻截图、正值动画中途）。**另需拍弱化态**：「效果：弱化」/ `prefers-reduced-motion` 关闭动画时也留 1 张，避免弱化态被误判为缺卡 | 3 张 `.growth-card` 并排完整、每张「选择」按钮可见；**1440×900 与 390×844 各 1 张标准态 + 弱化态各 1 张**；标注每张的动画开/关 | 3 张卡齐全、`nth-child(3)` 位置不空白；⚠️ **本图是第 3 张是否在视口内且可点的唯一证据**——runner 仅证首卡 `elementFromPoint` 命中与三张 y 差 `<28` 同排（§4.2），不覆盖第 2/3 张命中与裁切。若等足 700ms 仍只有 2 张，则**不是截图问题**，另开工单查 `cardChoices`/`renderGrowthCards`，归 WP3 或 WP5 | 状态夹具 |

#### 5.3.1 ⚠️ 「关闭第 5 步提示链」的正确口径（原稿写法失效，经 design-strategist 实装复核重写）

**原稿错误**：写「让 `tutorialStep()` 返回空 / 关闭提示链」。实装里这**完全不影响**金虚线框——

- `renderUI()` 的 `guideActive` 是**局部 `const`**（`L6786 const guideActive=!!step`），夹具无法从外部赋值，且它只管 `#mapHint` 文案与 `.next` class；
- `tutorialStep()`（`L3333`）只是把 `guideStep()` 的 `'S1'..'S6'` **映射成文案**，不参与绘制；
- 金虚线框链路是 `drawRecommendedDefense()`（`L5222`）→ `recommendedDefenseTiles()`（`L3346`）→ **`guideStep() !== 'S5'` 即返回 `[]`**（`L3347`）。`guideStep()` 在 `L3322–3332`，返回 `'S5'` 的条件是：`game.day===1 && phase==='day' && !game.mode && !game.cardModal && !!game.castle && !cardPending && 有开发 && 有派工 && towersOnSide(defenseSide())===0`。

**命名约定（quality-lead 补注，消除编号撞车）**：关闭提示链的**做法**称「**方案 A / B / C / D**」；§5.3 的四张**截图**称「**第 1 / 2 / 3 / 4 张**」。两套编号互不复用。

**正确口径 = 让 `guideStep()` 不等于 `'S5'`。按优先级选一**（第 2/3/4 张用方案 A，第 1 张用方案 C）：

| 方案 | 做法 | 效果 | **`window.FW.guideStep()` 期望值** | 适用 |
|---|---|---|---|---|
| **A（首选）** | 在该敌袭侧 `owned` 格放 1 座塔，或令 `towersOnSide(defenseSide())>=1` | `guideStep()` → `'S6'`，推荐格返回 `[]`；`game.mode` 仍为 `null`，**不会引入 `drawToolPreview()` 整体高亮**。⚠️ **但 day 仍为 1，`drawGates()` 的红色脉冲入口照常绘制** → 第 2/3/4 张须把它登记为既有背景，不当成「多画的状态」 | **`'S6'`** | **第 2 / 3 / 4 张全部用这个** |
| B（次选） | `game.day=2`（保持 `phase='day'`） | 提示链整体退出（`L3323` 首行 `game.day!==1` 即 `return null`）。⚠️ **副作用**：`entrances(2)` 返回**两侧**入口，`drawGates()` 会画 2 个红脉冲，可能干扰四态判定 | **`null`** | 仅当 A 不可行时，截图需说明 |
| C（仅第 1 张） | `game.mode='tower'` | `guideStep()` 返回 `null`（`L3324` `game.mode||game.cardModal` 让位门禁） | **`null`** | **只用于第 1 张合法格高亮**——那张本来就要设 mode、提示链天然已关闭；第 2/3/4 张用它会多出整体高亮 |
| **D（禁止）** | 改 `guideStep()` / `tutorialStep()` / `recommendedDefenseTiles()` 源码，或给它们打临时桩 | 违反 §7 红线且污染回归 | — | — |

**⚠️ 断言期望值必须按方案区分（quality-lead 补注，最易误判的一处）**：`window.FW.guideStep()`（`L7332` 已导出 `guideStep,recommendedDefenseTiles,defenseSide,towersOnSide`）——**方案 A 期望 `'S6'`；方案 B / C 期望 `null`**。因为 `guideStep()` 首行 `game.day!==1||game.phase!=='day'` 与第三行 `game.mode||game.cardModal` 都直接返回 `null`，**若执行时一律断言 `'S6'`，方案 B/C 会被误判为失败**。正确断言写法是「`step !== 'S5'`」这一统一不变量，另按方案记录具体值备查。`window.FW` 是允许的测试钩子，不是临时后门。

**`game.hoverTile` 补充**（engineering-lead 复核）：空闲值是 `null`，有悬停时是 `at(x,y)` 的 **number 索引**（`L5724`）；`drawToolPreview()`（`L5231` 之后）判 `!=null`，置 `null` 即可。若 QA 要断言 `typeof==='number'`，**必须在真实移动鼠标之后取**，别在空闲态取。

**CDP 时序**（§5）：点击后 ≥150ms 读 DOM；切换视口后等 400ms（`cdp.cjs` 已内置）；永远用 `open`（新 tab）重进游戏，避免 `beforeunload` 卡死；`BORDER_ARTIFACTS=tests/artifacts/v030-polish/viewports/` 不要覆盖旧证据目录。

---

## 6. 文档整理项

### 6.1 `L4949` 注释订正（现快照 `L5071`）

| 项 | 内容 |
|---|---|
| 锚点 | `// 6) 统一圈耐久牌：置于圈上沿中点，避免压住主城`（`drawWallRings()` 内） |
| 改前 | 「置于圈**上沿**中点」 |
| 改后 | 「置于圈**下沿**中点，避免压住主城」 |
| 依据 | 代码用 `maxY=Math.max(maxY,e[0].y,e[1].y)`、`sy=maxY*CELL+20`（屏幕 y 向下增大 → 下沿），WP1 §6.1 S7 截图实证牌在圈下沿、不压主城；`wp1-visual-audit.md` §6.2 裁定 A 已确认代码行为正确、仅注释过时 |
| 风险 | **纯注释，零逻辑风险**；不碰 `drawWallRings()` 任何语句 |
| 归属 | ✅ 归 WP3（顺手做） |

### 6.2 可直接粘进 WP5 报告的一句设计说明

> **受击闪白（设计取舍）**：城墙受击时的闪白反馈作用于**整圈墙身**（含雉堞与拐角塔楼，由 `PAL.stone` 短时切为 `#fff1c8`，约 160 ms），表达「整圈共享耐久被击中」；**耐久牌保持常显**、不参与闪白，仅在耐久低于 35% 时把边框转为警示红 `#ff7a5a`，并独立承担 `hp/maxHp` 数值反馈。已由像素 A/B 取证（同一坐标 `[154,92]` 的 `[92,95,104,255]→[115,115,117,255]`，与夜间暗幕下 `#c9c0aa/#fff1c8` 理论值逐通道吻合）。此为实现与交接计划 §1.2 描述一致的**有意设计**，非缺陷、非待修项。

可另附一句（对应裁定 B）：

> **缩到 50% 的可读性边界（剩余问题）**：§4.4「轮廓缩到 50% 仍能分辨」只验收七类建筑的一级剪影，已实拍通过；9px 富/铁角标、9px 作业气泡、9px 耐久牌数字与 7px 箭塔等级字属信息标注层，不纳入该条口径。WP3 已将它们改为纯图形 / 放大 / 移除，但**手机真机与真人试玩未做**，标注类在极小屏下的最终可读性仍属未验证项。

---

## 7. WP3 明确不得触碰的范围（红线）

| # | 禁区 | 具体锚点 / 理由 |
|---|---|---|
| 1 | **§0 核心规则** | 整圈共享耐久与归零倒塌（`damageWallRing`/`collapseWall`/`V029.wallHit`）、破墙后主城很快失守（`afterCollapseSeconds ≤ 5`）、居民真正走到对应建筑且到岗后仍可移动/召回/改派、资源地形不挡友军且开发后清旧图标、资源/费用/收入与界面一致且顶栏只显示 4 种资源、`forecastIncome()` 与天亮飘字一致、**测试纪律（不得删断言、放宽阈值、改结果文件）**。§3 的耐久牌字号改动必须只读 `ring.hp/ring.maxHp` |
| 2 | **WP2 引导链与其全部交付物** | `tutorialStep()`（`L3333`）、六步文案、`#mapHint.next` 的 `classList.toggle`（`L6790`）、`hoverTile` 赋值（`L5724/5728`）、`recommendedDefenseTiles()`（`L3346`）与 `drawRecommendedDefense()`（`L5222`）、**生产建筑工人数徽章（`L4796–4803`，默认零改动）**、居民详情目的地文案、DPS 估算 `wallDamageSamples`、失败诊断 `ledger` 三字段、`guideStep` 门禁。WP2 质量门放行前不得改这些代码。**⚠️ 唯一例外（DS 指出本条与 §9 P7 ① 会自相矛盾，特此声明）**：经 **team-lead 明确授权 P7 ①a/①b/①b′** 时，允许在**授权范围内**把 `L4796–4803` 徽章块**整体移出** `structure()` 改由晚绘 pass **画一次**（不双绘、不替换 `structure`、不动按名调用、不引入渐变/`measureText`/`const g=ctx`），并由 design-strategist 确认 `wp2-ux-spec.md` §3.2 可修订 + team-lead 派独立新提交（不得 amend、不得删断言/放宽阈值）。除此之外一律零改动；按 §0 测试纪律，此有意改动须写进报告附依据 |
| 3 | **WP4 表现力与音效** | `drawLighting()` 昼夜过渡插值、`spawnEnemy` 刷兵烟尘（`L3584`）、`AudioKit` 新增音效、圈墙受击 `emitCombatEvent` 火花、**`prefers-reduced-motion` / `effectsWeak()` 弱化效果**（CSS `L334/367` 与 JS `L3616/6603`）、卡牌/横幅动画的强弱控制。`victoryCard.enter` 动画与其 reduced-motion 规则（`L365–367`）保持不动 |
| 4 | **绘制契约与 §5 技术契约** | `structure`/`nodeArt`/`drawFoliage` 函数名与 `draw()` 内按名调用；`let ctx` 不得改回 `const`、不得缓存 `const g=ctx`；`cachedLayer()` 能力检测；地形缓存失效键 `navigationRevision()\|已占领格数\|seed`；新绘制不引入未做能力检测的渐变/离屏画布 |
| 5 | **既有 WP1 视觉层结论** | `PAL`/`OUT`/`GLYPHS`/主题 CSS 的**色值与结构**只做 §1/§2 限定的引用与主题套用，不重做美术方向；受击闪白行为（裁定 A）不动；`drawMinimap()` 不引入渐变 |
| 6 | **流程与证据纪律** | 不合并 `main`、不推送、不克隆、不建 worktree；`bg-scratch/` 不入库；夹具图标注「状态夹具，非自然流程证据」；浏览器回归统一 `BORDER_ARTIFACTS=tests/artifacts/v030-<名称>`，不覆盖旧证据；提交信息末尾加 `Co-Authored-By`（计划 §3 通用要求） |

---

## 8. 与 WP2 改动最可能冲突的点（交给主理人/engineering-lead）

按风险从高到低：

1. **同一函数 `structure()` 内的叠加绘制**（最高）：WP2 徽章在 `structure()` 末尾 `if(isProductionBuilding(b))`（`L4796–4803`），我的 §3.1 富/铁图形角标在 `else if(b.type==='mine')` 分支内（`L4777`）、§3.4 删等级字在 `else` 箭塔分支（`L4793`）。三者共用 `inCell()` 的 60×60 逻辑坐标与全局 `ctx`。**要求**：WP3 实现必须在 WP2 质量门放行、代码冻结后进行；改动前重新 `grep` 定位（行号已漂移）；保持 §3.5 分区与绘制顺序；用 `ctx.save/restore`；不动 WP2 徽章一个字符。**engineering-lead 补充**：徽章有 `isProductionBuilding(b)` 门，箭塔 else 分支的 7px 等级字**永远不会被叠加徽章**（tower 非生产建筑），真正相邻的是 mine 分支富/铁角标；`label()` 不依赖 `measureText`、`rrect()` 在 VM 桩空操作不抛异常，WP2 的 24 条 Node 测试 + 三条 runner 全绿已覆盖。
   - ⚠️ **更严重的同帧遮挡在 `drawResident()` 与 `structure()` 之间**（DS 复核 + EL VM 实算，见 §3.5/§3.6）：作业气泡（右上、实色底、后画）与 WP2 徽章（右上、先画）像素重叠 **`x 27.60–34.50 / y 0.77–10.73 ≈ 68.8px²`**，盖住 `👤` 左半与徽章左圆角底。**按坐标推算为既存缺陷、待 `exp-4-arrived.png` 实拍确认**；必须按 §3.6 复拍 `wp2-ux-spec.md` §6 第 4 条（FAIL 判据：`👤` 图标或徽章左缘被实色气泡覆盖）。这是 WP3 最可能破坏 WP2 验收证据的一处。
   - ⚠️ **EL 另发现 sprites 之后的「后绘层」遮挡源**（清单此前遗漏）：`draw()` 在 `for(const sp of sprites)sp.fn()` 之后还有 `drawWallRings()` → `cachedLayer('fog')` → `drawSelection()` → `drawLighting()` → `drawCombatLayer()/drawDayFx()` → `drawVictoryMarks()`。**只调 sprites 内部顺序挡不住它们**：① 圈墙边缘格的生产建筑徽章可能被 `drawWallRings()` 覆盖；② 夜间 `drawLighting()` 蓝暗幕整体压暗灰色「空」徽章 + `lighter` 暖火光叠亮 → 夜景可读性另有问题。这也是 §9 P7 把「绘制序晚绘 pass」列为首选的原因（一次性挡住气泡/圈墙/选中框/昼夜光幕四类）。**EL 二次复核补**：`structure()` 无可见性判断就入 sprites、未探明格靠后置 `cachedLayer('fog')` 盖住 → 晚绘 pass 若放 fog 之后须补 `if(!t.visible)return;`，否则徽章浮在迷雾之上形成新回归；放 fog 之前则 fog 自动生效但夜景压暗未解。故 ① 必须拆 **①a（lighting 之后 + 守卫）/ ①b（wallRings 之后、fog 之前）** 拍板，详见 §3.5 第 3 条 (b) 与 §9 P7。
2. **WP2 的 `hoverTile` 与 WP3 交互补图**：四张夹具都要显式 `game.hoverTile=null`（实装 `L5724` 存 `at(t.x,t.y)` 的 **number 索引**，`drawToolPreview()` 判 `!=null`），否则多出悬停金框/红框被误判为「合法格高亮」。**第 2/3/4 张还必须保持 `game.mode=null`**（`L5232` 判 `!game.mode` 返回，否则多出整体高亮）；**第 1 张必须 `phase==='day' && mode` 非空**。若 QA 要断言 `typeof game.hoverTile==='number'`，须在真实移动鼠标后取。方案 A/B/C/D 与第 1/2/3/4 张的编号约定见 §5.3.1。
3. **WP2 的推荐布防格 `drawRecommendedDefense()`（原稿关闭方式失效，已重写）**：它在 `draw()` 里紧接 `drawToolPreview()` 之后画金色虚线框（`L5222`），与射程圆/四角框/高亮同属金色系。**「`guideActive=false` 或让 `tutorialStep()` 返回空」完全无效**——`guideActive` 是 `renderUI()` 局部 `const`（`L6786`）、`tutorialStep()` 只映射文案；链路是 `recommendedDefenseTiles()` 的 **`guideStep() !== 'S5'` 即返回 `[]`**（`L3347`）。正确口径按优先级：**方案 A** 在该敌袭侧放 1 座塔（或 `towersOnSide(defenseSide())>=1`）→ `guideStep()` 变 `'S6'`、`game.mode` 仍 null（但 day1 的红色脉冲入口仍在，属既有背景）；**方案 B** `game.day=2`（`entrances(2)` 会画 2 个红脉冲，可能干扰判定）；**方案 C** `game.mode='tower'` 仅用于 §5.3 **第 1 张**（那张本就要设 mode、提示链天然关闭）；**方案 D** 禁止改 `guideStep`/`tutorialStep`/`recommendedDefenseTiles` 源码或打临时桩。⚠️ `window.FW.guideStep()` 断言**期望值按方案区分**：A→`'S6'`、B/C→`null`，统一不变量是 `step !== 'S5'`，一律断言 `'S6'` 会误判 B/C。方案/截图编号约定见 §5.3.1。
4. **WP2 的 `#mapHint.next` 与 CSS**：WP2 已用 `classList.toggle('next', guideActive&&phase!=='won')`（`L6790`），`::before{content:"▶ "}` 由 CSS `L440` 提供。WP3 改 CSS 时不要动这两条；7 视口截图里「▶ 下一步提示」若出现，属 WP2 交付物，不算 WP3 布局缺陷。
5. **WP2 的 DPS 估算与耐久牌数字**：WP2 在 `updateBattleHud()`（`L6855`）加「约 N 秒破墙」胶囊，我 §3.3 在 `drawWallRings()`（`L5080`）改耐久牌字号。两者是不同 DOM/canvas 层、不冲突，但 7 视口截图里会同时出现，需确认夜间状态栏与圈下沿耐久牌不重叠。
6. **行号漂移**：WP1/WP2 规格与本报告引用的行号已整体 +114，且实现期间还会变。**所有定位以函数名与锚点字符串为准**。
7. **变量覆盖**：三套 `:root`（`L9–10` / `L13–17` / `L370–375`），`--gold`/`--glass`/`--text` 被 v0.30 覆盖，但 `--accent` 仍是旧绿系。§2 要求 `#victoryNights button[aria-selected]` 从 `var(--accent)` 改 `var(--gold)`；**不要**去改 `:root` 里 `--accent` 的定义（会被 WP1/WP2 其他元素用到，牵一发动全身）。

**engineering-lead 只读复核确认（ee7f596，WP2 未破坏 §5 契约）**：`let ctx` `L2470` 未改回 const；`cachedLayer('terrain')` 键仍 `navigationRevision()|已占领格数|seed`（`L5297`）、`fog` 键 `visible|navigationRevision()|seed`（`L5379`）；`createLinearGradient`/`createRadialGradient` 只出现在 `drawLighting()` 且三处能力检测全保留（白天 `L5167/5168`、离屏 `L5178`、warm `L5196`）；WP2 新增绘制只用 `strokeRect`/`setLineDash`/`save`/`restore`/`rrect`/`label`，无渐变/离屏/`measureText`/`const g=ctx`（唯一 `const main=ctx;ctx=g;` 是 `cachedLayer` `L4623` 既有合法切换）。**§1/§3 的 minimap 与小字改动只要守住同一组约束即可，`mctx` 保持局部、不碰全局 `ctx`。** 另 5 个行号（`PAL` L4459 / `structure` L4715 / `drawMinimap` L7161 / 富铁角标 L4777 / 注释「上沿」L5071）在 ee7f596 上逐个精确命中。

**测试夹具环境变量备忘（engineering-lead 澄清后定稿）**：`tests/v030-wp2.test.cjs` L10 注入 HTML 实际读 **`WP2_HTML_FILE`**（缺省回退仓库内文件）。**`BORDER_HTML` 不是另一处缺口，而是 team-lead 在 WP2-IMPL-01 补充指令里曾约定过的同一变量名字**；**`wp2-acceptance-plan.md` L359 已按实装核验订正为 `WP2_HTML_FILE`**，并写明「初稿的 `BORDER_HTML=D:/...` 两种写法都不可用，执行时不得照抄」→ 独立红绿复现按现代码即可跑通，**无需代码补丁、不必为此写宽授权范围**（撤销此前「并进同一新提交」的建议）。helper `tests/helpers/v029-vm.cjs` L7/L22 用 `path.join(ROOT, file)`，**绝对路径会被拼坏**，须传相对仓库根路径（如 `WP2_HTML_FILE=../bg-scratch/wp2-pre.html`）。仅当主理人仍坚持 `BORDER_HTML` 时才需一行别名兼容。写进 §10 基线步骤备忘。

---

## 9. 需要用户 / 主理人拍板项

| # | 事项 | 选项 | 我的建议 |
|---|---|---|---|
| P1 | **§3.4 删除 7px 箭塔等级字** | ① 直接删（等级靠蓝/红/紫顶 + 木台色 + 旗色三重编码）；② 保留但放大到 11px；③ 改纯图形（1/2 个方点） | **① 直接删**，前提保留 `rework()` 与详情面板「升级箭塔/改装重型塔」文字通道（色盲可访问性兜底）。属信息呈现决策，需用户确认 |
| P2 | **§3.3 耐久牌「改以进度条为主」** | ① WP3 只改字号 9→11px；② 连信息架构一起改成进度条主导 | **① 只改字号**。② 牵动 HUD 文本与详情双血条语义，属设计取舍，只写进 WP5 剩余问题 |
| P3 | **§4.3 390×844 夜战 3 张卡** | ① CSS 等比压缩 + 字号下调，保证 3 卡同屏；② 允许横向滚动 + scroll-snap；③ 登记 WP5 剩余问题 | **先试 ①**，若文字不可读再退 ②（需用户同意引入横滑），最坏 ③。⚠️ 受 §4.2.1 极窄余量约束：**三种方案都不允许增高底栏**（`siteFree` 余量 0.001）；且本条与 §5.4 卡牌补图联动——补图确认第 3 张确实在视口内后，才谈得上「3 卡同屏」 |
| P4 | **§1.4 minimap 内部分辨率** | ① 按 DPR + 显示尺寸重设 `mini.width/height`（更清晰，需核对 `bindMinimap()` 点击换算）；② 维持 180×120 不动，只在 CSS 保证等比 | **② 保守**（降低 §5 桩风险），把非等比拉伸写进 WP5 已知取舍；若用户要求清晰度再选 ① |
| P5 | **§1.5 未探明格底色** | ① `PAL.grassDark` 压暗；② 沿用 `#2f4a2a` 底 + 半透明暗罩 | **①**，与 `drawFog()` 语义一致且全走 `PAL` |
| P6 | **§2.2 `#victoryTitle` 字体** | ① 改 system-ui 金字（与全站统一）；② 保留宋体旧式（体现「战报」古典感） | **①**，§4.4 要求「所有按钮、面板、卡牌风格统一（金边玻璃风）」 |
> ⚠️ **解法演进注记（避免按旧口径执行）**：P7 共五版。v1「左移 `bx`」→ DS 证明会撞富/铁角标；v2「上移 `by` 到 `-43*s` 越过格顶」→ **EL 的 VM 实算证明「在不把气泡整块移出本格的前提下」垂直也无解，已否决**（否决的是代价，不是几何不可能）；v3「绘制序晚绘 pass 单一方案」→ EL 二次复核发现 fog/lighting 放置冲突；v4「①a/①b 拆分」→ **DS 复核指出 ①a 会让夜间徽章不受暗幕影响、在冷蓝夜景上发亮，破坏 §4.4，并补 ①b′ 折中插入点**；**v5（本表）= ①a / ①b / ①b′ 三候选并列待拍板 + ② + ③**。**跨文档引用现状（v5 更新）**：`wp2-acceptance-plan.md` §8.2 的「唯一不劣化解是上移 `by`」旧表述**已由 quality-lead 自行删除、并由 design-strategist 在 #20 完成收口**（L523 保留「垂直无解 / `-43*s` 否决」、L524 改为「解法以 `wp3-visual-spec.md` §9 P7 为准，本计划不复述方案编号」、坐标换 EL 实算 `y0=0.77`、两种归属口径登记为待裁定）。故**规格是 P7 的唯一真源**，计划不再随规格再版而过时；quality-lead 保留的兜底「实拍若发现水平偏移其实可行，回传 art-director 修订 §9 P7」仍然有效。所有几何均为静态推算。

| **P7（第五次重写：DS 几何 + EL VM 实算 + EL 放置冲突 + DS §3.2/§4.4 复核）** | **作业气泡与 WP2 工人数徽章的同帧遮挡如何解 + 是否放大** ⚠️ **前提**：按坐标推算遮挡在现状 `14*s` 已存在（**待 `exp-4-arrived.png` 实拍确认，不写成 WP2 已 FAIL**）；`14*s/16*s/18*s` 均超 ≈10px 空隙 → **在 ≥14*s 宽度下水平无解**（③ 的 `≤13*s` 属劣化解、非绝对无解）；EL 实算气泡 `y0=0.77` 与徽章 `y0=0.77` 齐平 → **垂直也无解，上一版「上移 `by` 到 `-43*s`」予以否决** | **① 绘制序晚绘 pass（EL 新提，最稳；⚠️ 放置位置本身有冲突，须再拆两个子选项拍板）**：把徽章抽成 `drawProductionBadge(t)` 做独立晚绘，不替换 `structure`、不破 §5 契约。**①a（可读性优先，UX 侧倾向）** 放 `drawLighting()` **之后** + 显式 `t.visible` 守卫（否则未探明格徽章浮在 `cachedLayer('fog')` 迷雾之上 → 新回归，且会**泄露未探明格工人数**）；一次挡住气泡/圈墙/选中框/昼夜光幕四类后绘层；⚠️ **代价**：徽章不再随场景受光染色，且**夜间不受暗幕影响、在冷蓝夜景上发亮**（DS 上一轮据此提 §4.4 反对，本轮从 HUD 信息层角度改倾向 ①a，见「美术口径三方意见」）。**①b（风格一致优先）** 放 `drawWallRings()` 之后、`cachedLayer('fog')` **之前**；fog 自动生效无需守卫、徽章仍受光，但夜景压暗问题保留、需另议或 ③ 兜底。**①b′（DS 建议的折中插入点）** 放 **`drawSelection()` 之后、`drawLighting()` 之前**（L5380→L5381 之间）：圈墙/选框已画完、fog 已过（仍须 `t.visible` 守卫）、徽章仍随场景受光；**须实拍确认不破坏「圈墙始终可读」与四角金框**。三者均可把现有 6 行**原样包一层 `inCell(t.x*CELL,t.y*CELL,()=>{…})`**、不换算坐标，diff 小。**EL 已确认实现形态**：`drawProductionBadge(t)` 取 `b=t.building` → `if(!isProductionBuilding(b))return;` → **只遍历 `game.tiles` 中 `t.building` 为生产建筑的格，不遍历 `game.productionBuildings` Map**（避免懒加载/旧存档记录不齐导致与 `structure()` 渲染集不一致）→ 人数仍走 `productionWorkerCountAt(t)`（内含 `ensureProductionMaps()`，口径与 WP2 一致）→ `structure()` 里那 6 行**整段删除**绝不双绘。**绘制序 + 单绘断言三案通用**（VM 里把主 `ctx.fillText` 换成记录器；断言 `badgeTextCalls.length === 可见生产建筑数`、全 `visible=false` 时 `===0`、`min(badgeIndices) > max(bubbleIndices)`（所有气泡都先于所有徽章）；**只按调用序 + 文本过滤、不用坐标**，因 `inCell` 的 `save/scale/translate` 让 raw args 失真。⚠️ **不写「只出现 1 次」**——EL 实测 4 座生产建筑同帧是 4 次徽章文本，写 1 会假红），拍板任一方案不用重写测试。**共通硬约束**：晚绘范围**仅限徽章小矩形**（格内 `x 27.6–46 / y 0.77–12.27`）、不得扩大到整格/整圈；不引入渐变/`measureText`/`const g=ctx`；徽章内容与口径不变；瞬时火花/飘字掠过属既有表现层、判可接受。**❌ 否决「画两次」折中**（DS）：半透明 `rrect` 底 + `label` 重画会双绘、底色叠深、`👤N` 发虚；必须把 `L4796–4803` **整体移出** `structure()` 由晚绘画一次，或保留现状不动。**② 左移 `bx` + 富/铁角标联合收窄**：`+8*s`→`k≤-1*s`（`k=-2` 气泡 `x16.10–26.83`），角标右缘限制到设计 `x≤21` 消除 1.5×5.4px 剩余重叠；§3.1/§3.2 必须成对实施。**③ 保守**：最小解遮挡、放弃放大（保留 `14*s`，50% 不可读写进 WP5）；另含几何劣化解「缩到 `≤13*s` + 中心 `x≈22.6`」，与改善可读性相悖、不推荐 | **三候选并列、不单方推荐；美术口径三方意见（待用户/主理人拍板）**：**DS（UX/信息层级）倾向 ①a** —— 徽章是状态信息、与 `#battleText`/耐久牌/顶栏同属 HUD 信息层，本就不随场景受光，且 ①b 夜间暗幕会再压暗灰色「空」（`rgba(84,90,96,.88)` 底 + `#cdd3d8` 字）致对比度不足、冲突裁定 B 与 §4.4；**EL（实现自洽）认同 ①b′** —— 既挡几何遮挡又保留白天暖光/夜间暗幕染色，正好避开 ①a 的冷蓝夜景发亮；**art-director 亦倾向 ①b′ 作起点**（与 EL 一致，但不替主理人定）。①b 最保守、夜景压暗未解。**请一并裁定「徽章是否与建筑同受光」**。🔒 **强制项（DS）**：`t.visible` 守卫必须覆盖**所有**晚绘路径，否则未探明格显示工人数 = 信息泄露，比遮挡更严重；EL 建议 ①b（fog 前）也统一加，三案共用一份实现。🎨 **折中方向（DS）**：若担心 ①a 与场景割裂，可按 `game.phase==='night'` 对徽章**底色/文字做局部色值微调**，不动光照管线；若用户明确偏好「随建筑受光」则选 ①b 并补 390×844 夜战实拍确认灰色「空」仍可读。**DS 立场澄清**：早前的 §4.4 风险提示针对「未做缓解的 ①a」，不是反对 ①a 本身，①a 必须配局部色值微调；他不坚持原「①a 优先」推荐。✅ **可执行路径（DS）**：**默认 ①b′**（硬前提 390×844 夜战实拍确认灰色「空」在暗幕下仍可读）→ 实拍判不可读则**回退 ①a + 夜间局部色值微调** → 用户明确偏好「随建筑受光」时选 **①b**（同样须补该实拍）。三候选共通硬约束不变。🚫 **该路径仅为建议排序、不是执行授权**（EL 治理项）：规格默认值 ≠ 授权，触发条件只有 team-lead 明确派单 + 书面授权范围，不得「规格写了默认就先做了」。ℹ️ 三案差异只是 `draw()` 里一行插入位置，实现/回归/测试成本一致、无工程风险差，故「徽章是否与建筑同受光」是**纯美术/UX 裁决**。⚠️ **夜间局部色值微调是「仅 ①a 分支」的需另行拍板可选项**（DS 强调条件性）：**①b′/①b 随场景一致染色、完全不需要它，与 EL「一字符不改」零冲突**，故不得与三案共通硬约束并列。仅 ①a 时它与「徽章内容与口径不变」「6 行原样色值一字符不改」冲突，若采用须改写约束为「允许夜间配色分支」+ **DS 对约束改写无异议（≠ 授权，授权范围仍由 team-lead 裁定）** + team-lead 授权范围额外包含该项 + EL 在 `drawProductionBadge()` 加 `phase` 分支（仍单次绘制、不再用 6 行逐字包装）；夜间分支**只改颜色、不动 `rrect(36,1,24,15)`/`label(48,8.5,10)` 几何常量**，详见 §3.5。EL 补充：①b′ 仅剩「夜景压暗灰色『空』」属**可读性观察项、不阻塞 ①**，须实拍确认四角金框与徽章同帧不互压。**跨包授权**（三者同需）：DS 已给结论「**§3.2 有条件可修订、但必须 team-lead 授权，我不擅自改**」——他实测 `L5355–5361` 的 `structure/nodeArt/drawFoliage` 都在 sprites 里按名调用、新增函数不动这三条、绘制契约测试不会红；只需把 §3.2「绘制位置」那行改成允许 A（现状 `structure()` 内末尾）/ B（晚绘 pass）两种实现，其 §7 红线第 4 条 / §8 #13 核心约束保留。故须 **team-lead 正式授权 + 派独立新提交任务**（EL 不 amend、不擅自改；拍板 ① 后他按「先红后绿新断言 → §4.1 全量 → 三条 runner 新目录 → 白天/夜间 + `exp-4-arrived.png` 同款到岗帧截图 → 提交」执行）。**「先红后绿」的红源是绘制序下标断言**（现状计数断言仍绿），计数与 `visible` 守卫为护栏；新 Node 测试文件须按 §3.5「实现期 QA 核对四条」显式加进 §4.1 全量清单；**红跑口径已由 quality-lead 裁定为「口径 A · 测试拆分」（拒绝放宽判据的口径 B）**：红跑 `# fail 1` 且断言须为 **`min(badgeIndices) > max(bubbleIndices)`**（用 `lastBadgeIdx` 会基线假绿）+ 基线身份正证据（永不 skip 的身份 test）；条件性 `t.skip()` 显式可见、在最终全量须真跑，混合态三格不缩减；**红跑 `# fail 1` + `# skipped 1` 合法预期 / 最终绿跑 `# fail 0` + `# skipped 0` + `# pass ≥ 77 + WP3 新增`**（当前 8 文件基线 77，非 48）。🔗 **该套测试设计仅在 P7 拍板 ① 系时成立；若拍 ②/③ 须另定几何非重叠红源并重新裁定**（守卫 test 不适用、身份 test 改路径级正证据、Baseline 事实照旧单列但不构成新泄露；详见 §3.5，作为 P7 拍板输入），详见 §3.5 与 §10 第 8 步。此属**有意改 WP2 实装**，按 §0 测试纪律须写进报告附依据、不得删断言/放宽阈值。若不愿动 WP2 代码，退 **②**（夜景/圈墙遮挡未解）；**③ 不是零冲突兜底**（遮挡仍须解）。⚠️ 三项都以 **§3.6 复拍 WP2 §6 第 4 条为必做门禁**（FAIL 判据：`👤` 图标或徽章左缘被实色气泡覆盖），归属分歧见 §3.6 末（**DS「条件 PASS / 归 WP3」vs QA「双重门禁 / WP2 当场判」，待 team-lead 裁定**）。坐标均为静态推算，最终以实拍为准 |

---

## 10. 实现顺序建议（WP2 质量门放行后）

1. 先跑一次基线：`node --test` 全量 + 三条浏览器 runner，记录数字与 `pageErrors=[]`。若需注入自定义 HTML 复跑，用 **`WP2_HTML_FILE=../bg-scratch/<相对路径>`**（QA 计划 L359 已按实装订正到该名、非 team-lead 原指令的 `BORDER_HTML`，helper 用 `path.join`、绝对路径会拼坏；无需代码补丁，见 §8 末）；
2. **零风险文档项**：§6.1 注释订正；
3. **纯 CSS**：§2 victoryCard 主题（先做，便于 §4 截图直接验证）；
4. **绘制层**：§1 minimap 配色（局部 `M` 表）→ §3.1/3.3/3.4 → **§3.2 气泡与 §3.1 角标必须按 §9 P7 拍板结果成对实施**（首选绘制序晚绘 pass、次选左移+角标联合收窄；**「上移 `by`」已否决**；按坐标推算遮挡是既存、水平垂直两轴都无解，不能孤立放大也不存在「不放大就零冲突」），按 §3.5 分区核对、逐项回归；若 P7 选 ① 还需先完成 §3.6 末的跨包授权（DS 确认 §3.2 + team-lead 派独立新提交）；
5. **多端 CSS**：§4.3 两条手机端问题。**每改一处 CSS 立刻跑 `v029-hud-occlusion-browser.cjs` 比对 6 视口 `siteFree`/`dayFree`/`legendH`/`miniH`**（§4.2.1 极窄余量预警：390×844 `siteFree` 余量仅 0.001），不要等截图拍完才发现触线；触线改 CSS 不改断言；
6. **取证**：§4 七视口截图 + §5 四项留证补图（夹具标注；**5.4 卡牌 `wait ≥700ms` + 弱化态各 1 张，为第 3 张唯一覆盖**；**5.3 四态先按 §5.3.1 选方案（第 2/3/4 张用方案 A、第 1 张用方案 C），统一断言 `guideStep()!=='S5'` 且按方案记录期望值：A→`'S6'`、B/C→`null`；第 2/3/4 张保持 `mode=null`、第 1 张设 mode**）；**若 P7 定案为 ①a 或启用夜间局部色值微调，另加 §4.1 的条件触发夜战截图（不可用白天到岗帧代替，不影响 WP2 判据）**；
7. **复拍 WP2 §6 第 4 条（双重门禁的后半，WP3 完成后必做）**：派居民到生产建筑、到岗后 **1440×900 与 390×844 各 1 张**，同帧 `👤N`/灰色「空」与状态气泡均完整可辨、互不遮挡 → **遮挡判 FAIL**，按 §3.6 精确判据（`👤` 图标或徽章左缘被实色气泡覆盖）。此步验证 P7 的修改未破坏 WP2 证据，排在 **P7 定案之后、WP3 质量门之前**。**前半门禁由 quality-lead 的 WP2 验收当场判覆盖**（若双视口判遮挡，按其 §8.2 属 WP2 质量门 FAIL、须先回传 team-lead）；两种口径的定性分歧见 §3.6 末，最终以 team-lead 在「执行 WP2 验收」指令里的裁定为准；
8. 全量回归（**≥ 77 + WP3 新增**，`0 失败`；三条 runner `OK`；`pageErrors=[]`）。**§4.1 全量命令须显式列出 8 个既有文件 + WP3 新 Node 测试文件**（当前实测基线 77 = 10+10+10+10+6+2+5+24；沿用旧 `48 + …` 会压低门槛 29 条、属放宽阈值），**按 §3.5 已裁定的「口径 A · 测试拆分」执行**（拒绝口径 B）：① 红跑＝全可见 + working 停 dock 夹具、只断言 **`min(badgeIndices) > max(bubbleIndices)`**（所有气泡先于所有徽章；⚠️ 用 `lastBadgeIdx` 会基线假绿，见 §3.5）+ `bubbleCalls/badgeCalls>0` 前置，须 **`# fail 1` 且失败消息为绘制序断言**，并附**基线身份正证据**（永不 skip 的身份 test：注入时 `typeof drawProductionBadge==='undefined'`、默认时 `==='function'` 并打印 `FILE`）；② 计数 + `t.visible` 守卫断言放独立 test、基线按**特性探测式条件 `t.skip()`**（禁止无条件 / 静默跳过，测试名与 reason 显式可见），**修复后最终全量中该 test 必须真跑并通过**，混合态三格不缩减；③ 只钩主 `ctx.fillText` 兼容 `let`、不缓存 `const g=ctx`、不破三个按名调用、不引用新增 `window.FW` 导出；④ **红跑 / 绿跑并列判据**：**基线红跑** `# fail 1`（失败消息为 `min/max` 绘制序断言）+ `# skipped 1`（条件跳过独立守卫 test，合法预期）+ 基线身份正证据；**修复后最终全量绿跑** `# pass ≥ 77 + WP3 新增`、`# fail 0`、`# skipped 0`、`# todo 0`，并确认绘制序 / 计数 / `visible` 守卫三条断言全绿。身份 test 红/绿两次都执行都通过（`typeof drawProductionBadge` 判定 HTML 身份并打印 `FILE`）。红跑用 `WP2_HTML_FILE=<相对仓库根路径>`（`path.join` 相对路径坑，见 §8 末）。**🔗 前提：本套口径 A 仅在 P7 拍板 ① 系时成立**；若拍 **②/③**，四条核心断言（min/max 绘制序、身份 test、`typeof` skip 探测、`t.visible` 守卫）全部失效，须按 §3.5「条件性备选」另定几何非重叠红源并**重新裁定**，不得照搬；此时**守卫 test 不适用（非删断言，报告须写明「②/③ 不引入晚绘信息泄露风险」）**、身份 test 改用**路径级正证据**（`FILE === path.join(ROOT, env)`），与 ① 系的 `typeof` 探测二选一不混用。不得只跑旧 6 文件、也不得沿用 `48 + …` 就宣称全绿；
9. 提交 `fix: responsive HUD polish, themed minimap and victory card`（末尾 `Co-Authored-By`），**不合并、不推送**；
10. 把 §6.2 两段文案与 §9 拍板结果交给 WP5 报告。

> 本文件为**规格**，不含任何已实现代码；实现须等 WP2 质量门由主理人放行。
