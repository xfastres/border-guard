# WP2 验收报告（quality-lead · 严守真）

> 团队 `border-guard-v030-polish` · 依据 `docs/v030-handoff-plan.md` §2/§3/§4 与 `wp2-acceptance-plan.md`
> 测试提交基线：`ee7f596`（WP2 实现已提交，本报告只做验收，不改游戏代码）
> 方法纪律：**只用真实输入**（`clicktext`/`clicksel`/`tile`/`key`/`wait`/`move`）+ **只读 `eval` 断言**；不 `eval` 改状态、不等快进时钟、每次新 `open` 进游戏。
> 本轮产出均为未提交证据文件，统一放 `tests/artifacts/v030-polish/`，仓库外驱动脚本在 `D:/Work/game/bg-scratch/`（不入库）。

---

## 1. 质量门判定

**结论：WP2 功能验收 PASS；其中 1 项（生产建筑工人数徽章 / 作业气泡遮挡）为既存渲染缺陷，按 design-strategist 口径标记为「条件 PASS / 待 WP3 P7 修复后复拍」，不阻塞 WP2。**

| 验收项 | 结果 | 证据 |
|---|---|---|
| 六步引导文案逐字正确、每步 `next=true`、文案内 0 个手写 `▶` | PASS | `guide-1..6.png` + 每步只读断言 |
| S5 金色虚线推荐格与红色入口同侧（西） | PASS | `guide-5.png` + `guide-5-zoom.png`（推荐 `[3,4],[3,3]`） |
| 工具态 / 卡牌模态 / 入夜 让位（`.next` 移除或视觉让位） | PASS* | `guide-5-toolmode.png`、`guide-2-modal.png`、`guide-night-transition.png` |
| 悬停预览：合法格金框、非法格红框+斜线 | PASS | `hover-legal*.png`、`hover-illegal*.png`、`hover-illegal-building-zoom.png` |
| 失败诊断三字段 + 逐字模板（Node） | PASS | `tests/v030-wp2.test.cjs`（24 项） |
| 破墙估算 DPS 公式（Node） | PASS | `tests/v030-wp2.test.cjs` |
| Node 全量回归 | PASS | **61/61 全绿、0 失败**（注：计划旧口径「77」已订正为实际 6 文件 61 项） |
| 首夜平衡矩阵 `idle-2t` 必须 0/2 | PASS | `wp2-matrix.txt`：`idle-2t fail 0/2`；`idle-0t` 仍 2/2 失守（不布防必输） |
| 三条浏览器 runner 回归 | PASS | `v030-wp2-hud/work/rings`：`pageErrors=[]`、`failure=none`、`afterCollapseSeconds≈2.0` |
| 生产建筑工人数徽章 ↔ 作业气泡遮挡 | **条件 PASS / 待 WP3 复拍** | `exp-4-arrived.png`（1440）、`exp-4-arrived-390.png` + 放大 |

> *卡牌模态期间 `.next` 类未实时移除（见 §3 偏差 1），但模态为整屏遮罩覆盖横幅，非用户可见缺陷；计划预期的「模态期间 `.next=false`」取证方式不成立，已改为记录事实。

---

## 2. 六步引导链（真实输入，同一次会话连续跑完）

驱动：`bg-scratch/wp2-guide.cjs`（真实鼠标/键盘，无状态注入）。每步只读断言 + 截图：

| 步 | 期望文案（逐字） | 实测 `text` | `next` | `arrows` | 截图 |
|---|---|---|---|---|---|
| S1 | 从底部选 A 或 B 前往探路 | ✓ | true | 0 | guide-1.png |
| S2 | 先选择一项开局强化 | ✓ | true | 0 | guide-2.png |
| S3 | 点领地内带金色 + 的资源点，开发成生产建筑 | ✓ | true | 0 | guide-3.png |
| S4 | 点生产建筑，派遣居民去工作 | ✓ | true | 0 | guide-4.png |
| S5 | 今夜敌军从**西**侧来：在该侧城墙内建 1–2 座箭塔（U+2013 短破折号、全角冒号） | ✓ | true | 0 | guide-5.png |
| S6 | 准备好了可以提前入夜 | ✓ | true | 0 | guide-6.png |

- S5 方向按本局 `entrances(1)[0].x<WIDTH/2` 实测为**西**，文案同步为「西」，未硬编码。
- 推荐格 `recommendedDefenseTiles()` 返回 `[3,4],[3,3]`（西侧、离入口最近 2 个合法格），`guide-5-zoom.png` 确认金色虚线框画在同侧。
- 让位证据：
  - 选「箭塔」工具后 `mode='tower'`、`next=false`、hint 变 `modes.tower`（预期让位）→ `guide-5-toolmode.png`。
  - 卡牌模态：`cardModal=true`、横幅被遮罩覆盖 → `guide-2-modal.png`（见 §3 偏差 1）。
  - 入夜后 `phase='night'`、`next=false`、hint 变夜间操作提示（不可逆退出）→ `guide-night-transition.png`。

---

## 3. 偏差 / 观察（不判 FAIL，记录事实）

1. **卡牌模态期间 `.next` 类未实时移除**：`guideStep()` 在 `cardModal` 时返回 `null`，但 `renderUI()` 只在 `sync()` 时跑、不在每帧跑，故 `.next` 类与旧文案要等模态关闭后的下一次 `sync()` 才纠正。模态本身是整屏遮罩，横幅被盖住，**非用户可见缺陷**。计划预期的「模态期间 `.next=false`」取证方式（读 class）不成立；已改用「模态遮罩覆盖横幅」作为让位事实记录。
2. **合法格悬停高亮偏弱**：选中工具后所有合法格已有淡黄描边（`drawToolPreview` 整体高亮），被悬停格仅多一层稍粗的 `#fff3a0` 描边，视觉区分度一般但存在；非法格红框+斜线区分明确（`hover-illegal-building-zoom.png` 确认）。
3. **徽章 / 气泡遮挡（既存缺陷，归 WP3 P7）**：见 §4。

---

## 4. 生产建筑工人数徽章 ↔ 作业气泡遮挡（WP2 判定帧）

- 唯一判定帧：`exp-4-arrived.png`（1440×900）与 `exp-4-arrived-390.png`（390×844），均为 `r.work.state==='working'` 到岗同帧（只读核 `workers:1, working:1`）。
- **桌面 1440 放大**（`exp-4-arrived-zoom.png`）：徽章（×1）与作业气泡相邻，**左缘未见被覆盖**（视觉模型判读）。
- **移动端 390 放大**（`exp-4-arrived-390-zoom.png`）：作业气泡**覆盖了徽章左缘，含 👤 图标起始处**——与 engineering-lead 的 VM 几何推算（`CELL=46`、`s≈0.767`、重叠区 `x27.6–34.5 / y0.77–10.73` ≈68.8px²、顶边齐平）**一致**。因重叠在单元格局部坐标系内、与视口缩放无关，桌面同帧几何同样存在，仅放大取景差异使视觉判读不同。
- **判定**：按 `wp2-acceptance-plan.md` §8.2 的 FAIL 判据（👤 图标或徽章左缘被实色气泡覆盖 → FAIL），该缺陷**在 390 判定帧已坐实**。但此为 **WP2 实装前既存的绘制排序缺陷**（作业居民 sprite 键 `y=dock.y+1.2` 必画在建筑之后），非 WP2 逻辑引入；其修复（P7，晚绘 pass / 联合收窄）归属 **WP3**。
- **WP2 质量门措辞（主理人裁定采用 design-strategist 口径）**：本项记为 **「条件 PASS / 待 WP3 P7 修复后复拍」**，不因此单条判 WP2 整体 FAIL；WP3 完成后必须按 §3.6 复拍门禁重新取证。

---

## 5. 测试结果

### 5.1 Node 全量回归（修正基线）
```
node --test tests/*.test.cjs
# tests 61 · pass 61 · fail 0 · cancelled 0 · skipped 0 · todo 0
```
> 计划旧口径「77」是静态声明数估算偏差；仓库实际 6 个 `*test.cjs` 共 61 项，全部通过。WP3 执行时以 **61 + 新增数** 为基线。

### 5.2 首夜平衡矩阵（不带 WH）
```
node D:/Work/game/bg-scratch/sim/matrix.cjs Border-Guard-v0.29.html 1
idle-0t   fail 2/2 LOST@23 ring0(x@20) c0 | LOST@23 ring0(x@20) c0
fight-0t  fail 0/2 ok ring551 c50 | ok ring551 c50
idle-1t   fail 0/2 ok ring89  c50 | ok ring89  c50
fight-1t  fail 0/2 ok ring572 c50 | ok ring572 c50
idle-2t   fail 0/2 ok ring467 c50 | ok ring467 c50
```
`idle-2t` 双 seed 均 `ok`（硬指标达成）；`idle-0t` 仍双失守（不布防必输，设计使然）；引导/高亮零影响平衡。输出已存 `wp2-matrix.txt`。

### 5.3 浏览器回归（§4.2，新目录不覆盖旧证据）
```
BORDER_ARTIFACTS=tests/artifacts/v030-wp2-hud  node tests/v029-hud-occlusion-browser.cjs   → OK
BORDER_ARTIFACTS=tests/artifacts/v030-wp2-work node tests/v029-workplaces-browser.cjs      → OK
BORDER_ARTIFACTS=tests/artifacts/v030-wp2-rings node tests/v029-rings-ui-browser.cjs       → OK
```
三份 `browser.json`：`pageErrors=[]`、`failure=none`；rings runner `afterCollapseSeconds≈2.0`（≤5）。

---

## 6. 未覆盖 / 顺延

- **day2 / 胜利页 / 失败复盘 的 `.next=false`**：由 WP5 自然试玩覆盖（引导链不可逆退出）。
- **`hover-leave.png` / `hover-after-escape.png` / `hover-touch-negative.png`**：`drawToolPreview` 首行 `if(!game.mode)return` 与 `pointerleave` 置 `hoverTile=null` 已由代码保证；本次未单独补图，可在 WP3 多端会话顺带核。
- **WP2 不实装任何代码改动**，故无新提交；验收证据（截图 / 矩阵 / 本报告）均为未跟踪文件，待 WP5 收尾统一提交。

---

*WP2 验收完成；功能项 PASS，徽章/气泡遮挡作为既存缺陷顺延 WP3 P7。*
