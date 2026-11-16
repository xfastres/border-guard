# WP4 改造前基线（状态夹具，非自然流程证据）

> 采集时间：2026-11-16 · 构建：`4f7cd0a` / `91169fe`（WP4 实现落定前）
> 驱动：`bg-scratch/wp4-evidence.sh`、`fx/wp4-probe.js`、`fx/perf.js`、`fx/wp4-weak-peak.js`
> 视口 1440×900，Chrome headless 157，CDP 9333。原始输出：`transition-before.log` / `perf-before.log`（本地 `*.log` 按 .gitignore 惯例不入库）。

## 1. 昼夜过渡：入夜是阶跃，不是渐变

`startNight()` 后每 250 ms 取一帧，同时用 `canvas.getImageData` 采样全画布平均亮度（步长 401 像素）：

| 帧 | `game.clock` | 平均亮度 |
|---|---|---|
| 0（startNight 当帧） | 0.017 | 59.4 |
| 1 | 0.55 | 59.3 |
| 2 | 1.017 | 59.4 |
| 3 | 1.5 | 59.4 |
| 4 | 1.966 | 59.3 |
| 5 | 2.45 | 59.4 |
| 6 | 2.916 | 59.3 |

**结论**：夜幕在入夜当帧即达到全强度（`.58`），1.5 秒窗口内亮度无梯度。WP4 第 1 条的目标正是把这条水平线改成 0→.58 的 1.5 秒下降曲线。截图 `transition-1..6.png` 为改造前帧（后续同名文件会被改造后帧覆盖，此日志保留曲线数值）。

## 2. 性能（`fx/perf.js`，40 敌、60 次 `draw()` 取均值）

| 指标 | 改造前 | WP1 阈值 |
|---|---|---|
| `nightMs` | **3.66** | ≤ 8 |
| `dayMs` | **2.40** | ≤ 4 |
| `enemies` | 40 | — |

## 3. 弱化峰值（`fx/wp4-weak-peak.js`，改造前）

`standard=2`、`weak=2`、`ratio=1`、`pass=false`。原因：改造前 `spawnEnemy()` 不产生烟尘粒子，`worldFx('ring')` 未被该夹具触发，两态在 40 敌窗口内都只有零星 2 个效果；且旧构建 `worldFx('ring')` 无 `!weak` 门控。此结果**不作为 WP4 验收结论**，只作为「改造前两态无差异」的对照。

> 夹具可比性修正（已落地）：`startNight()` 移到 `measure()` 外只调用一次，每次测量前统一 `game.enemies=[]`、`clearCombatVisuals()`、`sound=false`，避免两态起始条件不同。
>
> **以上三节均为「改造前」对照，不是最终验收结论。** WP4 实现后的对应数字（亮度 93.9→59.4 渐变、性能 2.95/1.93、弱化峰值 150/2）与全部判据见 `tests/artifacts/v030-polish/wp4-acceptance-report.md`。

## 4. 改造前三条浏览器 runner 基线

`v030-wp4-base-{hud,work,rings}`：三条全 `OK`，六视口 `siteFree` 0.916/0.895/0.865/0.912/0.758/0.801、`dayFree` 0.639/0.581/0.576/0.641/0.527/0.502、`overlap=0`、`afterCollapseSeconds≈2.0`。改造后 `v030-wp4-{hud,work,rings}` 逐值一致，无布局回归。
