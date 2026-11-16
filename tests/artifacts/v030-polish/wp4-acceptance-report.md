# WP4 · 表现力与节奏 —— 实现、验收与前后对比报告

> 日期：2026-11-16 · 分支 `codex/claude-gameplay-art-layout`
> 依据：`docs/v030-handoff-plan.md` §WP4、`tests/artifacts/v030-polish/wp4-audio-spec.md`、`wp3-qa-plan.md`
> 入口文件名保持 `Border-Guard-v0.29.html`（单文件、离线可玩）。
> **证据标注**：所有浏览器截图 / 探针均为 `eval` / `fx/*.js` **状态夹具，非自然流程证据**；自然试玩归 WP5。
> 证据目录：`tests/artifacts/v030-wp4/`（过渡帧、性能、峰值、红绿日志）、`tests/artifacts/v030-wp4-{hud,work,rings}/`（三条 runner）。改造前对照见 `v030-wp4/baseline-note.md`。

---

## 0. 质量门结论

**WP4 质量门 = PASS。**

| 验收项 | 结果 |
|---|---|
| 昼夜过渡（连续 6 帧 / 250 ms） | **PASS**：亮度 93.9→82.0→70.4→59.7→59.4 平滑下降，改造前为恒定 59.3–59.4 的阶跃 |
| 性能（1440×900、40 敌、60 次 draw） | **PASS**：`nightMs 2.95 ≤ 8`、`dayMs 1.93 ≤ 4`，且优于改造前 3.66 / 2.40 |
| 弱化后 40 敌 `game.effects` 峰值 ≤ 标准一半 | **PASS**：标准 150 / 弱化 2，比值 **0.013** |
| Node 全量回归 | **PASS**：8 文件 **72/72**，fail 0、skipped 0、todo 0 |
| 三条浏览器 runner | **PASS**：全 `OK`，`afterCollapseSeconds≈2.0`，六视口 `siteFree/dayFree` 与改造前逐值一致 |
| 新增测试先红后绿 | **PASS**：基线红跑 7 fail / 1 pass，实现后绿跑 8/8 |

---

## 1. 主理人拍板记录（与本轮实现一致）

| 编号 | 拍板 | 落实 |
|---|---|---|
| A | 「建成」覆盖建城 / 开发 / 建造三种完成事件 | 三处 `worldFx('build')` 后各加 `AudioKit.play('build')` |
| B | 弱化模式音频保持正常（只认 `settings.sound`） | 音效调用不读 `effectsWeak()`；新增交叉断言 WP4-7 |
| D | `unlockAudio()` 加 `sound` 门禁，关闭态不创建 AudioContext | L3645，测试 WP4-4b 断言 `supported` 不被置 false |
| E | 圈墙受击**直接采用新事件名 `ringHit`**，发在 `damageWallRing()` 的 `dealt>0` 块 | L1050–1056；`v027-balance.cjs` 在任何 `BORDER_HTML` 下都可证明不变红 |
| F | 菜单弱化落 class、`worldFx('ring')` 加 `!weak` 门控 | `body.fx-weak` CSS + `syncSettingsMenu()` 同步 + L2949 |
| 补充 | **保持「恰好 3 个新音效」边界** | `case 'ringHit'` 复用既有 `AudioKit.play('castle')` 音色 + 独立 500 ms 节流变量 `lastRingHitSound`，**不新增第 4 个音效 kind / gap / spec**（规格 §6.2） |

> 分工说明：本轮曾派 engineering-lead 执行实现，9 分钟无产出（判断为额度/限流阻塞，已取消任务），由主理人按 SOP 直接接手完成实现与验收；未编造任何 worker 产出。

---

## 2. 实现清单（行号为当前文件实测）

| 项 | 位置 | 改动 |
|---|---|---|
| 昼夜过渡 · 白天 | `drawLighting()` L5224–5229 | `t=clamp(game.phaseElapsed/1.5)`，`ctx.save/globalAlpha=t/restore` 包住暖光 `rect()`；色标逐字与 `createLinearGradient` 调用次数不变 |
| 昼夜过渡 · 夜间 | `drawLighting()` L5240–5244 | `nightFade=clamp(game.clock/1.5)`，`l.save/globalAlpha/restore` 包住暗幕 `fillRect`；`rgba(14,24,56,.58)` 字面量不变，`destination-out` 光孔不受影响 |
| 刷兵烟尘 | `spawnEnemy()` L3620–3621 | `game.enemies.push(e)` 后 `worldFx('burst', from.x+.5, from.y+.5, '', '#c9b48a')`；不改 hp / speed / 伤害 |
| 三音效定义 | `AudioKit.play()` L3660–3690 | `gap` 追加 build/dawn/collapse；`spec` 追加 `build[420→760 triangle .16]`、`dawn` 两音上行 `[[520→660],[660→990]]`、`collapse[130→65 square .4]`；新增可选 `spec[4]` 峰值（三音均 `.14 ≤ .16`）；支持音符数组、用 `currentTime+offset` 排程（无 setTimeout）；既有 9 条 spec / gap 与门禁、`last[kind]` 位置不动 |
| 建成音 | L3044 / L3150 / L3168 | chooseSite / develop / build 三处调用点 |
| 天亮音 | `dawn()` L4311 | `showBanner` 之前 `AudioKit.play('dawn')` |
| 倒塌音 | `collapseWall()` L1083 | 幂等 return 与 WP2 账本三字段之后、`ringId==='home'` 才响 |
| 圈墙受击事件 | `damageWallRing()` L1050–1056 | 采样之后发 `{kind:'ringHit',ringId,amount:dealt,x,y}`；不改伤害 / 样本 / 账本 |
| 圈墙火花与节流 | `consumeCombatEvent()` L3738–3739、L3765–3769 | `if(!weak)spawnSparks(...,2,...)`；`lastRingHitSound` 500 ms 节流后复用 `AudioKit.play('castle')` |
| 弱化一致性 | CSS L578–580、L2949、L7180、L6668 | `body.fx-weak *{animation:none!important;transition:none!important}`；`worldFx('ring')` 加 `!weak`；`syncSettingsMenu()` 同步 class；`drawVictoryMarks()` 改用 `effectsWeak()` |

> `body.fx-weak` 挂在 `document.body`（不用 `documentElement`），因为 Node 测试 VM 的 `doc` 桩没有 `documentElement`。

---

## 3. 新增测试 `tests/v030-wp4.test.cjs`（8 项，口径 A·测试拆分）

| 用例 | 断言 |
|---|---|
| WP4-1 | 夜幕 `globalAlpha` 在 `clock=0/0.75/1.5/3` 时为 `0/0.5/1/1` |
| WP4-2 | 白天暖光 `globalAlpha` 在 `phaseElapsed=0/0.75/1.5` 时为 `0/0.5/1` |
| WP4-3 | `spawnEnemy` 标准态 ≥10 粒子、弱化态 0 |
| WP4-4 | build / dawn / collapse 的起始与终止频率序列逐值正确、写入 `last` 探针 |
| WP4-4b | `sound=false` 不调度振荡器；关闭态 `unlockAudio()` 不建 ctx、不把 `supported` 置 false；重开后可解锁 |
| WP4-5 | `damageWallRing('home',7)` → 恰 1 条 `ringHit`、`structureHit=0`、hp 恰减 7、WP2 采样 `[[17.3,7]]` 不变 |
| WP4-6 | 40 敌弱化峰值 ≤ 标准一半；弱化态 `worldFx('ring')` 不推 effects |
| WP4-7 | 只翻转 `sound` 时 `game.effects` 峰值完全相同（音频与表现层解耦，规格 §4.3） |

**红绿闭环**（基线 `D:/Work/game/bg-scratch/wp4-baseline.html` = 改造前 HEAD 快照，仓库外不入库）：

```
WP4_HTML_FILE=../bg-scratch/wp4-baseline.html node --test tests/v030-wp4.test.cjs
  -> # tests 8 / # pass 1 / # fail 7 / # skipped 0
  失败消息示例：
    "clock=0：夜幕应只设置一次 globalAlpha  0 !== 1"
    "build 的起始频率序列，实测 [400]"        （基线走默认 spec）
    "关闭态不应尝试 new AudioContext 而把 supported 置为 false"
    "应发且仅发 1 条 ringHit"
node --test tests/v030-wp4.test.cjs
  -> # tests 8 / # pass 8 / # fail 0 / # skipped 0
```

原始输出：`tests/artifacts/v030-wp4/red.txt`、`green.txt`。

---

## 4. 回归数字

| 命令 | 结果 |
|---|---|
| `node --test`（8 个 `*.test.cjs`） | **72/72**，fail 0、skipped 0、todo 0（WP3 基线 64 + 新增 8） |
| `node tests/v027-balance.cjs` | 10/10，fail 0（旧构建回归，证明 `ringHit` 未污染 `structureHit` 计数） |
| `node tests/v028-priority.cjs` | 6/6，fail 0 |
| `v029-hud-occlusion-browser.cjs`（`v030-wp4-hud`） | `OK`，六视口 `siteFree` 0.916/0.895/0.865/0.912/0.758/**0.801**、`dayFree` 0.639/0.581/0.576/0.641/0.527/**0.502**、`overlap=0` —— 与改造前逐值一致 |
| `v029-workplaces-browser.cjs`（`v030-wp4-work`） | `OK` |
| `v029-rings-ui-browser.cjs`（`v030-wp4-rings`） | `OK`，`afterCollapseSeconds=2.0`、两视口卡牌可点 |
| 临时后门 `grep "__wallHit\|window.__"` | 无结果（`window.FW` 测试钩子除外） |

---

## 5. 浏览器证据与前后对比

### 5.1 昼夜过渡（1440×900，每 250 ms 一帧 + 全画布平均亮度探针）

| `game.clock` | 改造前亮度 | 改造后亮度 |
|---|---|---|
| 0.017 | 59.4 | **93.9** |
| ~0.53 | 59.3 | **82.0** |
| ~1.02 | 59.4 | **70.4** |
| ~1.48 | 59.4 | **59.7** |
| ~1.95 | 59.3 | 59.4 |
| ~2.42 | 59.4 | 59.5 |
| ~2.87 | 59.3 | 59.3 |

改造前是**入夜当帧即全暗**的水平线；改造后前 1.5 秒线性下降、之后稳定。目视复核 `before-transition-1.png`（首帧已暗）→ `transition-1.png`（首帧明显亮、渐变中间态）→ `transition-5.png`（暗蓝夜幕 + 主城暖色光晕）三张一致。

### 5.2 性能（40 敌、60 次 `draw()` 均值）

| | 改造前 | 改造后 | WP1 阈值 |
|---|---|---|---|
| `nightMs` | 3.66 | **2.95** | ≤ 8 |
| `dayMs` | 2.40 | **1.93** | ≤ 4 |

### 5.3 弱化峰值（40 敌夜晚夹具）

`standard=150`、`weak=2`、`ratio=0.013`、`pass=true`。

> **环境偏差如实登记**：headless Chrome 默认把 `prefers-reduced-motion` 报为 `reduce`，会让「标准」态也被 `effectsWeak()` 判为弱化（首次探针误得 2/2）。取证夹具 `fx/wp4-weak-peak.js` 显式模拟 OS 未开启减弱动画后重测得上值；菜单弱化仍由 `game.settings.effects` 决定。这是取证环境处理，不是产品代码改动。

---

## 6. 顺延 WP5 / 未验证项（如实标注）

- **音效真人试听未做**：`collapse` 低频 130→65 Hz 方波在小喇叭上基频可能不可闻（规格 §1.3 已存疑标注），真机确认前不得宣称听感合格；若不可闻，按规格允许提高起点到 ~160 Hz 或叠加极短 triangle 层，但主层峰值不得提高。
- 手机真机、真人完整试玩、自然流程音效证据（真实输入 + 横幅 + `AudioKit.last` 读数）均未做，归 WP5。
- `ringHit` 的 500 ms 独立节流属表现层决策，未做真人节奏评估。
- 文档口径：三份旧规格仍写「8 文件 77/77」，有效基线现为 **8 个 `*.test.cjs` / 72 项**；`wp2-ux-spec.md` §3.2 绘制位置待 WP5 同步；WP3 两条目视观察项仍在。
- README「当前试玩文件」一节尚未补 v0.30 打磨说明（计划 WP5 第 4 步）。

---

## 7. 本轮边界自检

- [x] 未改既有测试的断言（只新增 `tests/v030-wp4.test.cjs`）
- [x] 未改 `window.FW` 导出列表结构
- [x] 未合并 main、未 push、未建 worktree
- [x] 证据全部落 `v030-*` 新目录，未覆盖 `v029-*` 旧证据
- [x] 仓库外夹具 / 驱动脚本（`bg-scratch/`）不入库；PNG 证据按惯例不入库
