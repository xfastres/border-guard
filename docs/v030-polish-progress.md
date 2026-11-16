# v0.30 打磨进度说明（WP1–WP5 状态快照）

> 日期：2026-11-16 · 分支：`codex/claude-gameplay-art-layout` · 基线版本 v0.26 → 打磨目标 v0.30
> 依据：`docs/v030-handoff-plan.md` · 入口文件名保持 `Border-Guard-v0.29.html` 不变
> 本文档由主理人维护，随提交更新；详细规格与验收证据见 `tests/artifacts/v030-polish/`。

## ✅ 已完成

### WP1 视觉与交互审计（先前提交 5320a02 / 0b9e024）
- 明亮卡通渲染器、图标集、HUD 主题、事件横幅。
- 昼夜光照渐变能力检测修复（测试 VM 桩兼容）。
- 产出 `wp1-visual-audit.md` 与 `wp1-acceptance.json`（含极窄余量预警：390×844 `siteFree` 余量仅 0.001）。

### WP2 真实输入引导与质量门（先前提交 ee7f596）
- 首日六步引导链（S1 选址→S6 建塔）、悬停放置预览、推荐布防格、圈墙受击时间估算、失败诊断三字段。
- 验收：CDP 真实输入全链路取证（`guide-1..6.png` 等），Node 测试基线 61 项全过，首夜平衡矩阵 `idle-2t 0/2`。

### WP3 布局与多端（本次提交）
| 项 | 内容 | 验证 |
|---|---|---|
| §1 小地图 | `drawMinimap()` 全量 PAL 化：局部 `M` 表只读映射，清除 13 处旧地形硬编码色（含 staging/hero/viewport）；不引入渐变/离屏/measureText | grep 判据 + 回归 |
| §2 胜利 HUD | `#victoryCard` 及 menu/legend/inspect/tip 套金边玻璃主题；标题改 system-ui 金字；夜次页签 `var(--accent)`→`var(--gold)` | 回归 |
| §3.1 | 富/铁矿角标 9px 汉字 → 纯图形双编码（菱形=富金 / 方块=铁蓝灰） | 回归 |
| §3.2 | 作业气泡底 `14*s→18*s`、符号 `9*s→11*s`（P7 晚绘落定后实施，不再遮挡徽章） | 回归 + runner |
| §3.3 | 耐久牌数字 9→11px，牌宽 96→104 | 回归 |
| §3.4 / P1 | 删除 7px 箭塔等级字（等级由三色顶+木台色+旗色三重编码；文字通道保留在升级面板） | 回归 |
| §3.5 / P7 | **①b′ 晚绘 pass**：工人数徽章整体移出 `structure()`，抽顶层 `drawProductionBadge(t)` 在 `drawSelection()` 之后、`drawLighting()` 之前画一次；`t.visible` 守卫防未探明格工人数泄露；坐标/色值/字号一字符不改；单次绘制不双绘 | 新增测试红绿闭环 |
| §4.3 / P3 | 手机端 ≤600px 命令按钮等比压缩（min-width 72→64、图标 32→26、字号 13→11/10→9）：390×844 白天 4 个 / 夜战 3 个按钮一屏完整显示，第 4 按钮文字裁切同步修复；不增高底栏（`dayFree` 0.473→0.502 反而改善） | runner 全视口 |
| §6.1 | 耐久牌「上沿」注释订正为「下沿」 | — |

**新增测试**：`tests/v030-wp3-badge-order.test.cjs`（口径 A·测试拆分）——
红跑（`WP2_HTML_FILE=../bg-scratch/wp3-p7-baseline.html`，基线快照不入库）`# fail 1` 且失败消息恰为绘制序断言 `min(badgeIndices) > max(bubbleIndices)`；修复后 3/3 全过、`# skipped 0`（守卫/计数 test 真执行）。

**回归数字**：Node 全量 **64/64**（基线 61 + 新增 3），`fail 0`、`skipped 0`；三条浏览器 runner 全绿（输出 `tests/artifacts/v030-wp3-{hud-occlusion,rings-ui,workplaces}`），`pageErrors=[]`、`afterCollapse≈2.0`、390×844 `siteFree` 0.801 ≥ 0.80。

**三项拍板记录**（主理人按推荐默认执行）：P1=①直接删、P3=①等比压缩先试（未引入横滑）、P7=①b′（硬前提待复拍确认，见下）。

## ✅ WP3 收尾（2026-11-16 补取证完成，质量门 PASS）

详细报告与证据索引：`tests/artifacts/v030-polish/wp3-acceptance-report.md`。全部截图为**状态夹具，非自然流程证据**。

- **§3.6 复拍（P7 门禁）PASS**：白天到岗帧 1440×900 / 390×844 两视口，`👤1` 徽章完整画在上层、左缘与人物图标均未被实色作业气泡覆盖；夜间 N=0 帧两视口 8× 特写，灰「空」在暗幕下字形仍可辨 → **①b′ 硬前提成立，不回退 ①a、不启用夜间配色分支**。证据 `tests/artifacts/v030-wp3-reshoot/`。
- **§4 七视口 PASS**：28 张截图 + `measurements.jsonl`（28 组）+ `criteria-result.txt`，无横滚 / 顶栏单行 / 底栏不竖排 / 详情底栏零重叠 / 折叠图例与小地图均 54px / 三卡同排且第 3 张 `hit=true` 全绿。证据 `tests/artifacts/v030-polish/viewports/`。
- **触控验收 PASS**：390×844 与 932×430 两视口真实 `tiletap` 短按移动、长按 400 ms 开详情、`drag` 平移（相机进入 `manual`）、第 3 张卡真实点选生效。
- **§5 四项补图完成**：箭塔三色顶（蓝/红/紫）、倒塌碎石相机、交互三态（沿用 WP2 真实输入证据）、卡牌第 3 张（七视口 + 真实选中）。
- 目视两条观察项（932×430 折叠按钮与简报叠压、390×844 入夜横幅短时盖住简报）不判 FAIL，顺延 WP5 登记。

## ✅ WP4 表现力与节奏（2026-11-16 完成，质量门 PASS）

详细报告：`tests/artifacts/v030-polish/wp4-acceptance-report.md`；改造前对照：`tests/artifacts/v030-wp4/baseline-note.md`。

- **昼夜过渡**：`drawLighting()` 用 `game.clock / game.phaseElapsed` 在 1.5 秒内插值 `globalAlpha`，色标与渐变调用次数一字符不改。亮度曲线由改造前恒定 59.3–59.4 的阶跃，变为 93.9→82.0→70.4→59.7→59.4 的平滑下降。
- **刷兵烟尘**：`spawnEnemy()` 发 `worldFx('burst')`；弱化模式由既有 `!weak` 门控拦截。
- **三音效**：`build`（上扬三角波）、`dawn`（两音上行）、`collapse`（130→65 Hz 低频方波）；`AudioKit.play()` 支持音符数组与可选峰值，既有 9 条 spec/gap 不动；`unlockAudio()` 关闭态不创建 AudioContext。
- **圈墙受击**：采用新事件名 `ringHit`，发在 `damageWallRing()` 的 `dealt>0` 块（WP2 采样之后）；`case 'ringHit'` 火花 + 独立 500 ms 节流复用既有 `castle` 音色，**不新增第 4 个音效 kind**，不污染 `structureHit` 计数。
- **弱化一致性**：`body.fx-weak` CSS 关动画、`worldFx('ring')` 加 `!weak`、`syncSettingsMenu()` 同步 class、`drawVictoryMarks()` 改用 `effectsWeak()`。
- **回归数字**：新增 `tests/v030-wp4.test.cjs` 8 项（红 7 fail / 绿 8/8）；Node 全量 **72/72**；`v027` 10/10、`v028` 6/6；三条浏览器 runner 全绿且六视口遮挡数值与改造前逐值一致；性能 `nightMs 2.95 / dayMs 1.93`（改造前 3.66 / 2.40）；弱化峰值 150 / 2（比值 0.013 ≤ 0.5）。
- **分工记录**：曾派 engineering-lead，9 分钟无产出（判断为额度/限流阻塞，已取消），由主理人按 SOP 接手实现与验收。

## ⏳ 未完成（下一步）

### WP5 试玩回归与交付（未开始）
自然试玩 ≥3 夜、失败诊断与重置、`docs/v030-polish-report.md`、README 补充。

## 📌 已裁定的「不做 / 保守」项
- **P2**：耐久牌「改以进度条为主」不改信息架构，只改字号；进度条主导登记为 WP5 设计取舍。
- **P4**：小地图内部分辨率维持 180×120（保守，规避测试 VM 桩风险）；非等比拉伸记为已知取舍。
- **横滑**：手机端卡牌不引入横向滚动（改变可达性，未经用户同意不实施）。
- **测试基线口径**：当前有效基线为 8 个 `*.test.cjs` / **72 项**（WP3 新增 3 + WP4 新增 8；`v027-balance`、`v028-priority` 属旧构建回归、单独跑但不计入）；文档中「8 文件 77」为预研静态估算偏差，WP5 需统一订正三份旧规格。

## ⚠️ 已知风险
- 390×844 `siteFree` 余量 0.001：任何增高选址面板/底栏的改动都会破线，后续改动须每步跑 `v029-hud-occlusion-browser.cjs`（输出到 `v030-*` 新目录，禁止覆盖 `v029-*` 旧证据）。
- ~~①b′ 夜间可读性未实拍~~ → **已于 2026-11-16 复拍通过**（`v030-wp3-reshoot/night-n0-*-badge.png`），P7 判定不再待复拍。
- 三份旧规格文档仍写「8 文件 77/77」，有效基线现为 8 个 `*.test.cjs` / 72 项；`wp2-ux-spec.md` §3.2 绘制位置一行待 WP5 同步为 ①b′。
- `collapse` 低频 130→65 Hz 在小喇叭上基频可闻性存疑（规格 §1.3），真人试听前不得宣称听感合格。
- 手机真机、真人试玩、音效真人试听均未做。
