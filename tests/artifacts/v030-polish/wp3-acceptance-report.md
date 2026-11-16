# WP3 · 布局与多端 —— 收尾取证与质量门验收报告

> 日期：2026-11-16 · 分支 `codex/claude-gameplay-art-layout` · HEAD `4f7cd0a`
> 执行：主理人（工作室 SOP，实现已在 `4f7cd0a` 提交；本轮补取证与裁定）
> 依据：`docs/v030-handoff-plan.md` §WP3 / `tests/artifacts/v030-polish/wp3-visual-spec.md` §3.6 §4 §5 / `wp3-qa-plan.md` / `wp3-p7-ds-signoff.md`
> **证据标注**：本报告所有截图均为 `eval` / `fx/*.js` **状态夹具，非自然流程证据**（真实输入证据由 WP2 验收覆盖）。
> 输出目录：`tests/artifacts/v030-wp3-reshoot/`（P7 复拍）、`tests/artifacts/v030-polish/viewports/`（七视口）、`tests/artifacts/v030-polish/`（补图）。未覆盖任何 `v029-*` 旧证据。

---

## 0. 质量门结论

**WP3 质量门 = PASS。** 三条阻塞项全部关闭：

| 门禁 | 结论 | 依据 |
|---|---|---|
| §3.6 帧 A · 白天到岗帧（1440×900 + 390×844） | **PASS** | 👤 图标与徽章左缘未被实色作业气泡覆盖；徽章后绘、完整在上层 |
| §3.6 帧 B · 夜间 N=0 帧（①b′ 硬前提） | **PASS** | 灰色「空」在夜幕暗化后字形仍可辨，与 `rgba(84,90,96,.88)` 底可区分 → **不触发 ①a 回退** |
| §4 七视口 + 逐项判据 | **PASS** | 28 张截图 / 28 组结构化测量，全部自动判据 PASS；3 张关键视口目视复核通过 |

因此 P7 ①b′ 晚绘方案保持，**不需要**回退到 ①a、也不需要夜间配色分支授权（`wp3-p7-ds-signoff.md` §4.4 的回退路径不启用）。

---

## 1. §3.6 复拍（P7 门禁）

### 1.1 帧 A · 白天到岗帧

夹具 `bg-scratch/fx/day-scene.js`（仓库外，不入库）：真实输入 `clicktext 普通难度` 开局后开发四处资源并派工，等 3000 ms 让居民走到 dock。只读校验：`working=2`、`assigned=[1,1,0,0]`（1440）/ `working=2`（390）。

| 文件 | 目视结论 |
|---|---|
| `v030-wp3-reshoot/day-working-1440x900.png` + `-zoom.png` | 深色徽章「👤1」完整，绿色作业气泡位于其左侧；徽章覆盖气泡右缘（后绘生效），人物图标未被实色覆盖 |
| `v030-wp3-reshoot/day-working-390x844.png` + `-zoom.png` | 同上，手机视口放大后依然完整；同帧还能看到另一处 N=0 的灰「空」徽章 |

判据按 `wp3-p7-ds-signoff.md` §5.1：**FAIL 条件是「👤 图标或徽章左缘被实色气泡覆盖」，不是「徽章不可见」**。两视口均未见该覆盖 → PASS。

### 1.2 帧 B · 夜间 N=0 帧（①b′ 硬前提）

夹具 `bg-scratch/fx/wp3-night-n0.js`（仓库外）：关闭开局 dialog、`game.started=true`、`paused=false`，建城 + 开发四处资源、**不派工**、清空 `assignedResidentIds` 与 `dockReservations`，`startNight()` 后等 1200 ms。只读校验：`phase='night'`、`dialogOpen=false`、`allN0=true`、`working=0`、四处生产建筑 `visible=true`。

| 文件 | 目视结论 |
|---|---|
| `v030-wp3-reshoot/night-n0-1440x900.png` / `-zoom.png` / `-badge.png` | 整帧偏蓝暗（夜幕生效）；灰「空」8× 特写字形笔画清楚、白字与灰底可区分 |
| `v030-wp3-reshoot/night-n0-390x844.png` / `-zoom.png` / `-badge.png` | 同上，手机视口 8× 特写仍可读出「空」 |

**口径说明（如实标注）**：徽章受 `drawLighting()` 夜幕一致染色；由于 `t.visible` 守卫，徽章只出现在已探明区（该区恰好受主城/箭塔光孔照明，相对较亮），这就是实际可见徽章的全部场景。按 `wp3-p7-ds-signoff.md` §4.2「**可辨即可、不追求发亮**，颜色略暗/饱和略降不判 FAIL」，判定 **PASS**。

> 纠错记录：首轮 390 夜帧被开局简报 dialog 遮挡、且放大图连错标签页（拍到白天帧）。已在夹具中显式 `dialog.close()` 并重拍，上表为修正后的最终证据；作废的中间帧已覆盖，不另存。

---

## 2. §4 七视口截图与判据

### 2.1 取证规模

驱动 `bg-scratch/wp3-viewports.sh` + `cdp.cjs`（每个视口两次 `open`，同一标签页内 `site → day → night` 连拍，cards 单独开页）：

| 视口 | touch | 产出 |
|---|---|---|
| 1440×900 / 1920×1080 / 1108×1195 / 886×956 / 1108×720 | 否 | 各 `site/day/night/cards` 4 张 |
| 932×430 / 390×844 | 是 | 同上，文件名后缀 `-touch` |

共 **28 张标准截图**，另有触控验收 5 张（见 §4）、`raw-site-*.log` / `raw-cards-*.log` 原始输出、`measurements.jsonl`（28 行，每行含 `fixture:true` 与「状态夹具，非自然流程证据」标注）、`criteria-result.txt` 判据结果。

### 2.2 自动判据（`wp3-qa-plan.md` §1.5）

汇总脚本 `bg-scratch/wp3-collect.cjs` 逐行核对，**全部 PASS**：

| 判据 | 实测 |
|---|---|
| 无横向滚动 `docSW ≤ iw+1` | 7/7 视口全部相等（390/844、932/430、1440/900 等） |
| 顶栏资源单行、无裁切 | `rows=1`、`overflow=0`，28/28 场景 |
| 底栏文字不竖排 | `writingModes=['horizontal-tb']`，28/28 |
| 详情面板与底栏不重叠 | `deckSideOverlap=0`，28/28 |
| 横幅不遮顶栏 | `hidden=true` 或 `overlap=0`，28/28 |
| 折叠图例 / 小地图高 ≤60 | `legendH=54`、`miniH=54`，28/28 |
| 三卡同排 + 第 3 张在视口内可点 | 7/7 视口：`n=3`、`ySpread=6`、`inView=true`、`hit=true`、`opacity=['1','1','1']` |

> `sideDock` 字段在本版 `camera.insets` 上读不到（返回 `null`），932×430 / 390×844 的 `sideDock` 特判由既有 `v029-hud-occlusion-browser.cjs`（`v030-wp3-hud-occlusion` 目录）覆盖，本轮未重复取值。**此项不作为本轮新证据**，如实登记。

### 2.3 目视复核（runner 盲区）

| 截图 | 结论 |
|---|---|
| `viewports/cards-390x844-touch.png` | 三张卡完整并排，第 3 张「工匠值夜」及「选择」按钮全在屏内；顶栏资源单行；无横滑、无竖排 |
| `viewports/day-932x430-touch.png` | 顶栏单行、底栏 7 个按钮横排完整、详情与底栏不重叠；「城堡落成」横幅未遮主城 |
| `viewports/night-390x844-touch.png` | 夜间状态面板、底栏战斗/支援卡一屏可读；横幅未遮顶栏 |

**两条目视观察项（不判 FAIL，顺延 WP5 报告登记）**：
1. 932×430 白天帧中，左上「展开图例 / 展开小地图」折叠按钮与简报面板文字有视觉叠压（紧凑布局下的既存层级关系）。
2. 390×844 入夜帧中，「第 1 夜」横幅短时盖住简报面板上半部（横幅 2.3 s 后自动收起，且不遮顶栏、不遮主城）。

两者均为瞬时/紧凑布局的 UI 层级表现，不影响自动判据，也不属于 WP3 改动引入的回归。

---

## 3. 触控验收（WP3 验收清单）

`cdp.cjs` 新增 `drag x1 y1 x2 y2 [steps]` 分支（仓库外工具，真实 `touchStart/touchMove/touchEnd`），两视口全部用真实触控事件，**未用 eval 改状态**：

| 动作 | 390×844 | 932×430 |
|---|---|---|
| 短按移动 `tiletap 6 6` | `heroGoalTile={x:6,y:6}`、`goalLen=2` | `goal=true`、`goalLen=2` |
| 长按 400 ms 打开详情 | `panel=true`、`selected=198`、`sheetOpen=true` | `panel=true`、`selected=198` |
| 拖动平移 | `camera.tx -93→-168`、`ty 0→-80`、`mode=manual` | `camera.tx 0→-112`、`ty 0→-90`、`mode=manual` |
| 点第 3 张卡选中 | `cardPending:false`、`cardModal:false`、`overlayHidden:true`、`cardCount:0` | —（卡牌布局由 cards 七视口覆盖） |

证据：`viewports/touch-longpress-{390x844,932x430}.png`、`touch-pan-{390x844,932x430}.png`、`touch-card3-selected-390x844.png`。

---

## 4. §5 四项留证补图（WP1 遗留）

| 项 | 证据 | 结论 |
|---|---|---|
| 5.1 箭塔三色顶 | `tower-three-roofs.png` + `-zoom.png`（夹具 `wp3-towers.js`，同排放 level 0/1/2） | 蓝 / 红 / 紫三色尖顶清晰可辨，木台与旗色亦有差异 |
| 5.2 倒塌碎石相机 | `wall-collapse-rubble.png` + `-zoom.png`（夹具 `wp3-collapse.js`，`damageWallRing('home',99999)` → `status=broken`、`dealt=600`） | 完整闭合城墙消失，沿原矩形边界散落灰色碎石残段；相机对准主城（已二次修正） |
| 5.3 交互三态 | 沿用 WP2 既有真实输入证据 `guide-5-toolmode.png`（工具态）、`hover-legal.png` / `hover-legal-zoom.png`（合法金框）、`hover-illegal.png` / `hover-illegal-zoom.png`（非法红框+斜线） | WP3 只改绘制主题与徽章晚绘，未改工具态；三态证据仍有效，本轮不重复摆拍 |
| 5.4 卡牌第 3 张 | `viewports/cards-*.png`（7 视口，尤其 `cards-390x844-touch.png`）+ `measurements.jsonl` 的 `hit=true` + `touch-card3-selected-390x844.png` | runner 只验首卡命中，第 3 张的「在视口内 + 可点 + 真实选中生效」由本轮补齐 |

---

## 5. 顺延 WP5 的事项（如实登记）

- 三份旧规格文档（`wp2-acceptance-plan.md`、`wp2-ux-spec.md`、`wp3-visual-spec.md`）仍写「8 文件 77/77」；**有效基线口径为 7 个 `*.test.cjs` / 64 项**（WP3 新增 3 项后）。本轮按 `wp3-qa-plan.md` §0.2 不改旧文档，WP5 统一订正。
- `wp2-ux-spec.md` §3.2「绘制位置」一行仍是 `structure()` 内绘制，与 ①b′ 实现不一致；`wp3-p7-ds-signoff.md` §3.2 已给出替换文本，待 WP5 同步（本轮不扩大授权）。
- §2.3 两条目视观察项、`sideDock` 特判未重复取值。
- **手机真机、真人试玩、音效真人试听均未做**，不得替玩家宣称体验结论。
- 390×844 `siteFree` 余量 0.001 的窄阈值风险仍在，后续任何增高面板/底栏的改动须每步跑 `v029-hud-occlusion-browser.cjs`（输出到新的 `v030-*` 目录）。

---

## 6. 本轮边界自检

- [x] 未改 `Border-Guard-v0.29.html`（WP3 实现已在 `4f7cd0a`，本轮纯取证）
- [x] 未改任何既有测试与断言；未跑 `node --test`（WP3 代码未变，64/64 由 `4f7cd0a` 记录）
- [x] 未覆盖 `tests/artifacts/v029-*`；新证据全部落 `v030-*`
- [x] 未提交、未 push、未合并 main、未建 worktree
- [x] 所有夹具/驱动脚本留在仓库外 `D:/Work/game/bg-scratch/`，不入库
