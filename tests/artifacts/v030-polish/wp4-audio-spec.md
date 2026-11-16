# WP4 音效规格 · AudioKit 新增 `build` / `dawn` / `collapse`

> 任务：WP4-AUDIO-SPEC-01　角色：audio-director（阮和鸣）　优先级：P2
> **文档性质：规格草案，仅写规格。本轮不改 `Border-Guard-v0.29.html`、不写任何游戏代码、不启动/操作浏览器、不跑 `cdp.cjs`、不截图、不提交、不 push。**
> 基线：开始时 HEAD `0b9e024`；本规格撰写期间 WP2 落地为 `ee7f596`（`feat: guided first day, hover placement preview and wall time-to-breach`）。**已在 `ee7f596` 上重新 grep 核验：`AudioKit` / `effectsWeak` / `reducedMotion` / `unlockAudio` / `showBanner` / `worldFx` / `chooseSite` / `develop` / `build` / `dawn` / `collapseWall` 的形状与行号全部未变，三处 `worldFx('build')` 调用点、`structureHit` 唯一发事件点、`settings.sound` 默认值、`play()` 首行门禁均与本规格一致。** **行号一律以函数名定位**；下文行号只是快照辅助参考，实现时请按函数名搜索，不要按行号。
> 交付对象：`engineering-lead`（实现输入）、`quality-lead`（验收依据，含「音效开关仍然有效」「效果弱化时新增动画关闭」）。
> 实现前置：**WP3 质量门由主理人放行后才可开始**。本规格不宣布任何质量门判定。

---

## 0. 现状盘点（读码结论，作为规格的事实基础）

### 0.1 `AudioKit`（当前快照 ~3629–3661）

```js
const AudioKit={
  ctx:null, supported:!!(window.AudioContext||window.webkitAudioContext), volume:.16, last:{},
  unlock(){ /* 惰性 new AudioContext；suspended 时 resume() */ },
  play(kind){
    if(!this.supported||!this.ctx||this.ctx.state!=='running'||game?.settings?.sound===false)return;  // ← 唯一门禁
    const now=performance.now();
    const gap={swing:70,arrow:55,heavy:110,death:90,warn:600,victory:900,launch:55,castle:220,heroHit:80}[kind]||80;
    if(now-(this.last[kind]||0)<gap)return;
    this.last[kind]=now;                       // ← 门禁之后才写：天然可作为"开关生效"的观测量
    try{
      const c=this.ctx,t=c.currentTime,osc=c.createOscillator(),gain=c.createGain();
      const spec={swing:[430,170,'sawtooth',.09],arrow:[780,420,'triangle',.07],
        heavy:[150,70,'square',.12],death:[220,60,'sine',.18],warn:[520,300,'square',.13],
        victory:[520,990,'triangle',.42],launch:[600,300,'sine',.05],
        castle:[190,90,'triangle',.14],heroHit:[240,90,'triangle',.12]}[kind]||[400,200,'sine',.08];
      osc.type=spec[2];
      osc.frequency.setValueAtTime(spec[0],t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40,spec[1]),t+spec[3]);
      gain.gain.setValueAtTime(.0001,t);
      gain.gain.exponentialRampToValueAtTime(this.volume,t+.008);          // attack 8ms，峰值 .16
      gain.gain.exponentialRampToValueAtTime(.0001,t+spec[3]);             // decay 到时长末
      osc.connect(gain);gain.connect(c.destination);                        // 单总线，直连 destination
      osc.start(t);osc.stop(t+spec[3]+.02);
    }catch(e){/* 忽略音频设备异常 */}
  }
};
```

关键事实：

- **单振荡器 + 频率指数滑音**：`spec = [起点Hz, 终点Hz, 波形, 时长s]`。现有实现**无法表达「两个离散上行音」**（`dawn` 的要求）——它只会把起点连续滑到终点，听感是一个滑音而不是两个音。这是本规格最容易被踩的实现坑，见 §1.2 / §1.5。
- **峰值统一为 `this.volume = .16`**，所有既有音效同长度同峰值，`gain` 直接连 `c.destination`，无分组总线、无压缩器、无 `AudioBuffer`、无外部资源。
- **节流是 per-kind**：`last[kind]` + `gap` 表，默认 80 ms，基于 `performance.now()`（与 `ctx.currentTime` 无关）。
- **`play()` 的第一行门禁排在 `createOscillator()` / `createGain()` 之前** → 关闭态下不调度任何音频节点（已满足要求的一半）。
- `AudioKit` 整体已在 `window.FW` 导出（~7300 行 `FX_CAP,reducedMotion,effectsWeak,visualBudget,AudioKit,unlockAudio,`），可直接在 CDP `eval` 中读 `AudioKit.last` / `AudioKit.ctx.state`，**无需为取证改动导出契约**。

### 0.2 音效开关（当前快照）

| 项 | 位置（函数名定位） | 事实 |
|---|---|---|
| 状态字段 | `makeGame()` 内 `settings:{sound:true,effects:'standard'}` | 默认开；`sound` 是布尔，`effects` 是 `'standard'`/`'weak'` |
| 唯一消费点 | `AudioKit.play()` 首行 `game?.settings?.sound===false` | **音频的唯一门禁** |
| UI | `#soundToggle` 按钮（~598）、`$('soundToggle').addEventListener('click',…)`（~7134） | 翻转 `game.settings.sound`；打开时调 `unlockAudio()`；`syncSettingsMenu()` 显示「音效：开（低音量）/关」 |
| 跨局保留 | `newRun()` 内 `sound:game?.settings?.sound!==false` → `game.settings.sound=settings.sound` | 重开保留开关状态 |
| 解锁 | `unlockAudio()`（~3624）+ `window.addEventListener('pointerdown'|'keydown',unlockAudio)`（~3662） | **首次任意手势即无条件 `AudioKit.unlock()` → 创建 AudioContext**，见 §3.3 的诚实缺口说明 |

### 0.3 触发点现状

| 事件 | 现有函数 / 语句 | 现有表现 |
|---|---|---|
| 建成 | `chooseSite()` 末尾 `worldFx('build',…,'城堡落成')` + `showBanner('城堡落成',…,'good')`；`develop()` 末尾 `worldFx('build',…,'…建成 · 天亮 +…')`；`build()` 末尾 `worldFx('build',…,'…建成')` | 三处 `worldFx('build')`，**均无音效** |
| 天亮 | `dawn()`（~4246），唯一调用点在 `advanceBattle()` 末尾 `dawn();`；末尾 `showBanner('天亮了 · 第 N 日',…,'good')`；产出点逐个 `worldFx('ring',…)` | **无音效**；`finish(victory)` 不调用 `dawn()`，胜利夜走 `beginVictoryPresentation()` → `emitCombatEvent({kind:'victory'})` → `AudioKit.play('victory')` |
| 整圈倒塌 | `collapseWall(ringId)`（~1048），由 `damageWallRing()` 在 `ring.hp<=0` 时调用 | `report()` → `if(ringId==='home'&&typeof showBanner==='function'){ showBanner('城墙倒塌！',…,'danger'); triggerShake(6); worldFx('burst',…); }`；**无音效** |

`collapseWall` 的天然幂等（~1051）：

```js
if(ring.status==='broken'&&ring.hp<=0)return {ok:true,idempotent:true};
```

且 `damageWallRing()` 开头 `if(!ring||ring.status==='broken')return {ok:false,reason:'missing-or-broken'};`。`repairWallDay()` 只在白天把 `status` 复位为 `'intact'`；`startNightRepair()` 明确 `if(ring.status==='broken')return {ok:false,reason:'broken'}`，`stepNightRepair()` 遇到 broken 直接把 repair 标 failed。**结论：同一个夜晚内 `'broken'` 一旦置位就不会复位 → 「同一夜只响一次」由圈墙状态机天然保证，不需要额外标志位。**

### 0.4 弱化模式现状

- `reducedMotion()` = `window.matchMedia('(prefers-reduced-motion: reduce)').matches`；`effectsWeak()` = `!game || game.settings?.effects==='weak' || reducedMotion()`。
- JS 侧已接入：`consumeCombatEvent()` 里 `const weak=effectsWeak()` 控制火花数（`weak?2:3+…`）、`triggerShake()` 开头 `if(effectsWeak()||!game.shake)return;`、`worldFx()` 里 `if(!weak&&(kind==='build'||kind==='burst'))` 才生成 10 个粒子、`~3888` 行受击偏移 `effectsWeak()?0:2.5`。
- CSS 侧：`@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`（~334）已覆盖 `cardIn` / `bannerIn` / `deltaUp` / `critPulse` / `alertGlow`；另有 `#victoryCard.enter{animation:none}`（~367）。
- **缺口（需转交，非音频范围）**：菜单「效果：弱化」只写 `game.settings.effects`，**没有往 `documentElement` 加 class**，因此 CSS 动画在「菜单弱化但 OS 未开 reduced-motion」时仍会播放；另外 `worldFx()` 对 `kind==='ring'|'build'` 推入的 1 个 `'ring'` 特效**没有 `!weak` 门控**。这两点会影响 WP4 第 5 条「弱化后 `game.effects.length` 峰值 ≤ 标准一半」的达成，见 §4.4 / §5.3。

### 0.5 混音总线与性能预算现状

- 总线：`osc → gain → AudioContext.destination`，**单总线、无分组、无主音量节点**；平衡完全靠各 kind 的 `gain` 峰值（当前全为 `.16`）。
- 内存：**0 字节音频资产**（全程序化合成，无 `AudioBuffer`、无 `<audio>`、无 fetch）；节点在 `osc.stop()` 后由 GC 回收。
- 并发语音数：**无硬上限**，仅靠 per-kind `gap` 节流。新增三音效后新增并发上限为 3（见 §1.4），在 Web Audio / 桌面浏览器预算内，无越限风险。真正需要警惕的是 §6.2 的圈墙受击 40 敌连击。

---

## 1. 三个新音效的可实现规格

### 1.0 音频方向、命名与实现约定

**听觉身份**：明亮卡通中世纪边境聚落 → 短促、柔和、无刺耳谐波的「程序化提示音」，不用噪波、不用采样、不用混响。三个新音效分配三种不同波形，形成可分辨的最小调色板，且各自避开既有音效的音型：

| 新音效 | 波形 | 与既有音效的区分 |
|---|---|---|
| `build` | 上扬 `triangle` | 避开 `victory`（520→990 triangle，.42s，上行）——用更低音区、更短时长；避开 `arrow`（780→420 triangle，下行） |
| `dawn` | 两音 `sine` | 避开 `warn`（520→300 square，下行警报感）；sine 最柔和，匹配「夜幕退去/暖光淡入」 |
| `collapse` | 低频 `square` | 与 `heavy`（150→70 square，.12s）同族但更低、更长，形成「一次重击被拉长为灾难」的层次 |

**命名约定（不得混用两套命名空间）**：

- `AudioKit.play(kind)` 的 kind：**小写单词**（`build` / `dawn` / `collapse`），与 `swing/arrow/heavy/death/warn/victory/launch/castle/heroHit` 一致。
- `emitCombatEvent({kind})` 的 kind：**camelCase**（`structureHit` / 建议新增 `ringHit`），见 §6.2。两者绝不互相引用。

**实现约定（给 `engineering-lead`）**：

1. 三个新音效**只能通过 `AudioKit.play('build'|'dawn'|'collapse')` 播放**；触发点不得出现 `new AudioContext`、`createOscillator`、`createGain`、`setTimeout`、直接调 `AudioKit.unlock()`。
2. 为支持两音与逐 kind 峰值，把 `spec` 元组**向后兼容地**扩展为 `[f0, f1, wave, dur, peak]`，`play()` 里用 `const peak = spec[4] ?? this.volume` 取代硬编码 `this.volume`。既有 9 条 spec 的值**一字不改**（`spec[4]` 为 `undefined` → 回落 `.16`，行为完全不变）。
3. `dawn` 用「spec 为音符数组」的形状：`dawn: [[…],[…]]`；`play()` 里 `const notes = Array.isArray(spec[kind][0]) ? spec[kind] : [spec[kind]]`，以 `let at = t` 逐音累加 `at += dur`，**每个音符各自一个 osc+gain，顺序起止、不重叠**；`last[kind]` 在 `play()` 入口仍只写一次。
4. **必须**把三个 kind 写进 `gap` 表；忘了写会落到默认 80 ms，对 `dawn`/`collapse` 太短，可能被重入连响。
5. 不得修改 `AudioKit.volume` 全局值（会改变全部既有音效）；不得修改 `window.FW` 导出列表结构。

### 1.1 `build` · 建成

| 参数 | 规格 |
|---|---|
| 波形 | `triangle`（上扬三角波） |
| 频率 | 起点 **330 Hz → 终点 660 Hz**（E4→E5，一个八度上行），`exponentialRampToValueAtTime`，终点 ≥40 Hz 的既有钳制仍适用 |
| 时长 | **0.16 s**，`osc.stop(t+0.16+0.02)` |
| 包络 | attack **0.008 s** 从 `.0001` 到峰值；decay 从峰值指数降到 `.0001`，落在 `t+0.16` |
| 音量上限 | **峰值 `.11`**（`spec[4]=.11`），严格 `< AudioKit.volume=.16`，不盖过任何既有音效 |
| 节流 / 可叠加 | `gap.build = 120 ms`。**可叠加但必须节流**：`build()` 支持「连续建造」（~3151 行，资源/行动用完才退出放置模式），玩家连点会在百毫秒级内多次建成；不同 kind 之间互不阻塞（`last` 按 kind 独立），允许与战斗音并存 |
| 情绪理由 | 建成 = 玩家主动投入换来正向进展。一个大八度上行三角波是最短的「完成/升阶」动机，音色圆润无锯齿谐波，贴合明亮卡通聚落的木石质感；刻意压到 0.16 s、330 Hz 起音、峰值 .11，使它比 `victory` 轻、比 `castle` 亮，连点时不烦躁也不掩盖战斗反馈 |

### 1.2 `dawn` · 天亮

| 参数 | 规格 |
|---|---|
| 波形 | `sine` × **2 个离散上行音**（不是滑音） |
| 频率 | 音 1 **392 Hz (G4)** 恒频 0.14 s；音 2 **523.25 Hz (C5)** 恒频 0.20 s（纯四度上行）。每音用 `setValueAtTime(f, at)` **不做 ramp**；总时长 **0.34 s** |
| 时长 | 0.34 s（音 1 `at=t`、音 2 `at=t+0.14`；最后一个 `osc.stop(t+0.34+0.02)`） |
| 包络 | 每音独立：attack **0.006 s** 到峰值，decay 指数降到 `.0001` 于该音末尾。**两音顺序、不重叠**，因此峰值不叠加上升 |
| 音量上限 | **每音峰值 `.10`**（`spec[4]=.10`）；顺序播放下瞬时总和仍 = `.10` < `.16`。**若实现成重叠播放，两音峰值之和必须 ≤ `.16`** |
| 节流 / 可叠加 | `gap.dawn = 2000 ms`。**不可叠加（一夜一次）**；该节流用于防御 `dawn()` 被重入，主保证仍是 `advanceBattle()` 的清场判定 |
| 情绪理由 | 天亮 = 一整夜紧张解除 + 结算收获，与 WP4 第 1 条「天亮后 1.5 秒暖光淡入」同起。两个上行离散音构成最短的「晨号/揭幕」动机，纯四度温和而不凯旋（避免与 `victory` 抢情绪）；用 `sine` 避开战斗音效的 sawtooth/square 家族，也避免被误听为 `warn` 的下行方波警报 |

> **⚠ 最容易踩的坑**：现有 `play()` 是「一个振荡器 + `exponentialRampToValueAtTime` 连续滑音」，直接把 `dawn:[392,523,'sine',.34]` 塞进 spec 只会得到**一个上滑音**，不符合「两音上行」。必须按 §1.0 第 3 条扩展 `play()` 支持音符数组。另一个常见错误是用 `setTimeout` 触发第二个音——测试 VM 的 `setTimeout` 是返回 1 的桩（`border-guard-model.cjs`），且暂停/卡牌模态下计时冻结，会导致第二音丢失或越界；**禁止**。

### 1.3 `collapse` · 整圈倒塌

| 参数 | 规格 |
|---|---|
| 波形 | `square`（低频方波） |
| 频率 | **130 Hz → 65 Hz**（A3→A2 附近的下坠），`exponentialRampToValueAtTime`；与 `heavy`(150→70) 同族但起点更低、时长 3 倍以上 |
| 时长 | **0.40 s**（WP4 第 3 条明确 0.4 秒），`osc.stop(t+0.40+0.02)` |
| 包络 | attack **0.008 s** 到峰值；decay 指数降到 `.0001` 于 `t+0.40`。不加持续音、不加循环 |
| 音量上限 | **峰值 `.14`** < `.16`。低频方波在小喇叭上基频可能不可闻，**存疑标注**：建议真机确认；若不可闻，允许把起点提高到 ~160 Hz，或叠加一个极短的 180→90 `triangle` 层（两层瞬时峰值之和仍须 ≤ `.16`），但**不得**因此提高 `collapse` 主层峰值 |
| 节流 / 可叠加 | `gap.collapse = 2000 ms`。**不可叠加（一夜一次）**；主保证是 `ring.status='broken'` 幂等（§0.3），节流只是兜底 |
| 情绪理由 | 整圈倒塌 = 全局防线崩溃、主城即将失守，是全局最重的负面节拍。低频下坠方波提供「重量 / 坠落 / 结构失效」的听感，与同帧的 `triggerShake(6)`、`showBanner('城墙倒塌！','danger')` 构成多感官同步；0.40 s 短于横幅 2.3 s 展示、长于震屏 0.22 s，落地后不拖尾，不会盖过随后玩家操作的反馈 |

### 1.4 汇总表（可直接作为实现清单）

| kind | 波形 | f0→f1 (Hz) | 时长 | attack / decay | 峰值 | gap | 可叠加 |
|---|---|---|---|---|---|---|---|
| `build` | triangle | 330 → 660 | 0.16 s | 8 ms / 到 0.16 s | .11 | 120 ms | 节流后可 |
| `dawn` | sine ×2 | 392 恒频 → 523.25 恒频（两离散音） | 0.14 + 0.20 = 0.34 s | 每音 6 ms / 到该音末 | 每音 .10，不重叠 | 2000 ms | 否 |
| `collapse` | square | 130 → 65 | 0.40 s | 8 ms / 到 0.40 s | .14 | 2000 ms | 否 |

**性能预算**：程序化合成，音频资产内存 **0 B**；新增并发 oscillator 上限 3（实际 `dawn` 两音顺序 → 新增瞬时并发 ≤ 1，另加 `build`/`collapse` 各 1，且 gap 限制下不会同时出现）；节点均在 `stop()` 后回收。**在平台预算内，无越限风险**，无需 voice pool 或上限器。

### 1.5 `AudioKit` 最小改动清单（不改变既有音色）

1. `gap` 表追加 `build:120, dawn:2000, collapse:2000`。
2. `spec` 表追加三条（见 §1.4），既有 9 条**值不变**。
3. `play()` 内：支持 `spec[kind]` 为音符数组（§1.0 第 3 条）；`peak = spec[4] ?? this.volume`；`exponentialRampToValueAtTime(peak, at+.008)`；`osc.stop(at+dur+.02)`。**第一行门禁、`last[kind]` 写入位置、`try/catch`、`c.destination` 连接一律不动**。
4. 不新增总线、不新增 `AudioKit` 方法到 `window.FW`（`AudioKit` 对象本身已导出，内部新增字段/分支自动可见）。

---

## 2. 触发点、先后顺序与去重

### 2.1 `build` · 建成

**挂载点（三处，均在成功路径的末尾、`worldFx('build',…)` 之后）**：

1. `chooseSite()` — `worldFx('build',x+.5,y+.5,'城堡落成',…)` 之后、`showBanner('城堡落成',…)` 之前或之后均可；推荐紧随 `worldFx` 之后。
2. `develop()` — `worldFx('build',t.x+.5,t.y+.5,PRODUCTION_LABELS[type]+'建成…',…)` 之后。
3. `build()` — `worldFx('build',t.x+.5,t.y+.5,spec.label+'建成',…)` 之后、`announce()` 之前。

各插入一行 `AudioKit.play('build');`。三处都在**成功建造之后**：`build()` 的 `canBuildAt`/`validateBuild`/`spend` 提前 return 分支、以及 `chooseSite()` 的城址不可见/领主被围死分支都不会到达插入点 → **失败操作不发声**。

**为什么不放进 `worldFx()` 统一拦截**：`worldFx()` 内已有 `if(!weak&&(kind==='build'||kind==='burst'))` 的弱化分支，把音频放进去极易被误写进 `!weak` 块里，从而在弱化模式下被静音（违反 §4）。保持音频在**游戏逻辑函数**、视觉在 `worldFx()`，两条路径彻底分离。`worldFx('build')` 目前恰好只有上述 3 个调用点，逐点插入不会漏。

> **待用户拍板（选项，见 §7-A）**：推荐「建成」覆盖 建城 / 开发 / 建造 全部三种完成事件（一致的上扬提示音）；备选是只在「建塔/建造」响、建城由横幅单独承担。我推荐前者。

### 2.2 `dawn` · 天亮

**挂载点：`dawn()` 函数内部**，推荐紧接在 `showBanner('天亮了 · 第 '+game.day+' 日',…,'good')`（~4269）之前插入 `AudioKit.play('dawn');`。理由：此时 `game.phase` 已切 `'day'`、`clearCombatVisuals()` 已执行、产出 `worldFx('ring')` 与 `addIncome()` 已结算，声音标记「已完成的过渡」，与横幅同帧出现。

- **唯一调用点**：`advanceBattle()` 末尾 `dawn();`（清场条件全满足时才走到）→ 一夜一次。
- **不重叠保证**：胜利夜走 `beginVictoryPresentation()` → `emitCombatEvent({kind:'victory'})` → `AudioKit.play('victory')`，**不调用 `dawn()`**。因此 `dawn` 与 `victory` 不会同夜抢响；`victory` 的 `gap=900`、`dawn` 的 `gap=2000` 也是兜底。
- `finish(victory)` 不调用 `dawn()`；`window.FW.dawn` 仅供测试直接调用（属状态夹具，见 §5.4）。

### 2.3 `collapse` · 整圈倒塌（含与 `showBanner` / 震屏的先后顺序）

**挂载点：`collapseWall(ringId)` 内，`report(...)`（~1069）之后、`if(ringId==='home'&&typeof showBanner==='function'){…}` 之前**，新增一个独立判断：

```js
if(ringId==='home') AudioKit.play('collapse');
```

**先后顺序（推荐）**：

1. `damageWallRing()` 把 `ring.hp` 打到 0 → 调 `collapseWall(ringId)`；
2. `collapseWall()` 先走幂等检查（**第 2 次及以后直接 return，不发声**）→ 置 `hp=0` / `status='broken'` → 写 WP2 账本三字段 `collapseAt/collapseSide/towersAtCollapse`（**只增不改，不得移动或跳过**）→ `repair.status='failed'` → `invalidateNavigation()` / `calculateRoutes()` → `report(...)`；
3. **`AudioKit.play('collapse')`**（音频领先，且独立于 DOM 是否可用）；
4. `showBanner('城墙倒塌！',…,'danger')` → `triggerShake(6)` → `worldFx('burst',…)`。

说明：Web Audio 的节点都调度在 `t = ctx.currentTime`，同帧内 3–4 步的「先后」是**代码执行顺序**而非可听时间差，四者听感/观感是同步起爆。把音频放在 `showBanner` 之前有两个实际好处：(a) 即使 `#eventBanner` DOM 缺失（测试 VM 的 Element 桩或未来改版），音效仍会触发；(b) 音频不依赖 `typeof showBanner==='function'` 这个防御判断。

**去重（同一夜只响一次，三重保证）**：

- **主保证**：`collapseWall()` 开头 `if(ring.status==='broken'&&ring.hp<=0)return {ok:true,idempotent:true};`；`damageWallRing()` 开头 `if(ring.status==='broken')return`。40 个敌人在同一帧内多次命中圈墙，只有第一次会进入 `collapseWall` 的函数体。
- **夜间不可复活**：`startNightRepair()` 拒绝 broken 环、`stepNightRepair()` 遇 broken 标 failed、`repairWallDay()` 只在白天把 `status` 复位为 `'intact'`。因此一夜内 `'broken'` 不会复位 → 不会二次倒塌。**跨夜修满后再次倒塌应再次发声**，这符合「同一夜一次」而非「一局一次」。
- **兜底**：`gap.collapse = 2000 ms`，防止任何意外重入在 2 秒内连响。

**范围判定**：`collapse` **只对 `ringId==='home'`（整圈主城墙）播放**，与既有 `showBanner`/`triggerShake`/`worldFx('burst')` 的 `home` 门控完全一致。营地围墙倒塌（`ringId!=='home'`）只 `report('营地围墙倒塌。')`，不播放、不震屏、不出横幅。若主理人希望营地围墙也有轻提示，需另立 kind，不在本规格范围。

### 2.4 触发点汇总

| kind | 挂载函数 | 精确位置 | 触发条件 | 去重 |
|---|---|---|---|---|
| `build` | `chooseSite()` / `develop()` / `build()` | 各自 `worldFx('build',…)` 之后 | 该次建造/开发成功 | `gap.build=120ms` |
| `dawn` | `dawn()` | `showBanner('天亮了…')` 之前 | 夜间清场完成 | 唯一调用点 + `gap.dawn=2000ms` |
| `collapse` | `collapseWall()` | `report()` 之后、home 展示块之前 | `ringId==='home'` 且非幂等 return | `ring.status` 幂等 + `gap.collapse=2000ms` |

**与 WP4 第 2 条的协调**：`spawnEnemy()` 末尾将新增 `worldFx('burst',…)`（刷兵烟尘），它只写 `game.effects`，**不产生音频**；`collapseWall()` 里已有的 `worldFx('burst',…)` 同理。两者与 `collapse` 音效同夜可能共存，但互不影响、无需去重。

---

## 3. 「音效开关仍然有效」——复用方式（不得绕过）

### 3.1 唯一门禁与复用方式

- **唯一权威**：`AudioKit.play()` 首行 `game?.settings?.sound===false → return`。
- **复用方式**：三个新音效**只走 `AudioKit.play(kind)`**，因此在 `gap` 表 / `spec` 表里追加条目即可自动继承门禁。**禁止**在 `build()`/`dawn()`/`collapseWall()` 里写 `if(game.settings.sound)…` 之类的旁路判断——多一份判断就多一处不一致风险，也会让 quality-lead 无法用单一观测点验收。
- **禁止改动**：`makeGame()` 中 `settings.sound` 默认值、`newRun()` 的 settings 保留逻辑、`#soundToggle` 的 id 与 click handler、`syncSettingsMenu()` 的文案、`AudioKit.play()` 第一行门禁与 `last[kind]` 的写入位置。
- **触发点不得调用** `unlockAudio()` / `AudioKit.unlock()`。音效打开路径已由 `#soundToggle` handler 的 `if(game.settings.sound)unlockAudio();` 与 window 首次手势监听覆盖。

### 3.2 静音 / 关闭态的硬判据

在 `game.settings.sound === false` 时，触发 `build` / `dawn` / `collapse` 三条路径后，必须同时满足：

1. `AudioKit.last.build` / `.dawn` / `.collapse` **均未被写入或时间戳不变**（因为 `last[kind]=now` 位于门禁之后 → 这是「门禁被复用、未被绕过」的直接证据，且无需 hook Web Audio 内部）；
2. `createOscillator` / `createGain` **调用数增量为 0**（`play()` 在门禁 return，节点创建语句不可达）；
3. `AudioKit.ctx` **实例不增加**（详见 §3.3 的诚实说明）；
4. 战斗可继续、天亮/倒塌/建成的业务逻辑与 UI 表现**完全不受影响**（`play()` 内 `try/catch` 与静默 return 的设计意图）。

打开态（`sound===true` 且 `AudioKit.ctx.state==='running'`）：三个 kind 的 `AudioKit.last[kind]` 各自前进一次，且 `createOscillator` 增量分别为 1 / 2 / 1。

### 3.3 现存缺口（诚实标注，需 engineering-lead 确认 + 主理人批准后才可修）

严格按「**静音/关闭状态下不得创建 AudioContext**」字面执行，当前代码**尚未完全满足**，缺口不在新音效、而在既有的解锁路径：

- `window.addEventListener('pointerdown'|'keydown', unlockAudio)` 是**无条件**的；`unlockAudio()` → `AudioKit.unlock()` → `new (window.AudioContext||window.webkitAudioContext)()`，**不读 `game.settings.sound`**。
- 实际时序：关闭音效的那一次点击，其 `pointerdown` 先于 `click` handler 执行 → AudioContext 已在关闭前被创建；`#soundToggle` 打开时再调 `unlockAudio()` 会因 `unlockAudio.done` 而空转（但已有 ctx 仍在，功能正常）。
- 结论：**「关闭态下不调度音频节点」已由 `play()` 门禁严格满足**；但「关闭态下 AudioContext 对象数不增加」需要一处额外修改。

**建议（最小改动，作为可选项提交主理人裁定）**：在 `unlockAudio()` 最顶部、`if(unlockAudio.done)return;` **之前**加 `if(game?.settings?.sound===false)return;`。这样关闭态首次手势不创建 ctx、`done` 保持 false；用户之后打开音效时，`#soundToggle` handler 调 `unlockAudio()` → 此时 sound 为 true → 正常创建 ctx。风险与缓解：

- 风险 1：若同一局内先开后关，ctx 已存在——「已存在的 ctx 允许保留，但关闭态不得被调度」；判据按 §3.2 的 1/2/4 条为主，第 3 条按「实例数不增加」而非「`ctx===null`」。
- 风险 2：`game` 在极早期可能未定义 → 用可选链 `game?.settings?.sound`，未定义时 `===false` 为 false，维持原行为。
- 风险 3：`v028-priority.cjs` 的 fixture 会设 `game.settings.sound=false`；但测试 VM 的 sandbox 没有 `AudioContext`（`supported:false`），`unlockAudio()` 不会被真实手势触发，`play()` 也直接 return → **无回归风险**。
- 该改动动到共享解锁函数，属于 §6.1 边界的相邻代码，**本规格不自行实施**，请主理人明确是否纳入 WP4 范围。若主理人决定不纳入，则把 §3.2 第 3 条改按「ctx 允许已存在，但关闭态不得调度节点」验收，并在报告中写清取舍。

### 3.4 对 Node 回归的安全性

`border-guard-model.cjs` 与 `helpers/v029-vm.cjs` 的 sandbox 均**不提供 `window.AudioContext`**，故 `AudioKit.supported===false`、`ctx===null`，`AudioKit.play()` 首行即 return；`window.addEventListener` 是空桩，`unlockAudio()` 永不触发。因此：

- 在 `build()` / `dawn()` / `collapseWall()` 里插入 `AudioKit.play(...)` **对全部 Node 测试是纯 no-op**，不改变任何返回值、账本、伤害或事件计数。
- `tests/v030-wp2.test.cjs` 的 DIAG-7 直接调 `collapseWall('home')` 验证幂等与账本三字段；插入点在幂等 return 之后，不影响 `{ok:true,idempotent:true}` 与「只增不改」断言。
- `matchMedia` 在 VM 返回 `{matches:false}`，`effectsWeak()` 只由 `game.settings.effects` 决定 → 音频路径完全不读它（§4），无耦合。

---

## 4. 与 WP4 第 5 条「效果弱化」的关系

### 4.1 结论（音频设计决策）

**弱化模式下，三个新音效保持正常播放：不降音量、不禁用、不静音。音频的唯一门禁仍是 `game.settings.sound`。**

理由：

1. **两个开关语义正交**。`#soundToggle`（音效：开/关）管听觉；`#effectsToggle`（效果：标准/弱化）与 `prefers-reduced-motion` 管**运动/视觉强度**（粒子、震屏、动画位移），属于前庭/动效敏感偏好。把音频绑到 `effectsWeak()` 会让只想关掉晃动的用户连声音反馈一起失去，也让只想静音的用户被迫接受视觉弱化。
2. **无障碍上音频是补偿通道，不是负担**。视觉弱化时，玩家更依赖听觉确认「建成成功 / 天亮结算 / 城墙倒塌」；此时削弱音频反而降低可玩性。
3. **三个新音效本身不构成动效刺激**：都是 ≤0.40 s、≤`.14` 峰值、单次、非循环、非空间化、无低频持续震动（`collapse` 是 0.4 s 一次性方波，非循环）。`prefers-reduced-motion` 针对的是持续/大幅运动，不是短提示音。
4. **与 §3 一致**：`AudioKit.play()` 只认 `sound`，若再加 `effectsWeak()` 判断就是「绕过/污染唯一门禁」，quality-lead 无法把两个开关独立验收。

### 4.2 判定标准（给 quality-lead，避免与视觉弱化判据冲突）

| # | 判据 | 期望 |
|---|---|---|
| W1 | `effectsWeak()` / `reducedMotion()` / `game.settings.effects` **不得出现在任何音频路径**：`AudioKit.play()`、三个触发点、新音效的 `gap`/`spec` | 全仓库 grep 无命中 |
| W2 | 弱化模式下 `build`/`dawn`/`collapse` 的 `AudioKit.last[kind]` 前进量与标准模式**完全一致**（同一 `sound=true` 设定下） | 一致 |
| W3 | 弱化模式的**验收只测视觉量**：`game.effects.length` 峰值、`triggerShake()` 是否 early-return、火花数、`cardIn`/`bannerIn`/`deltaUp`/`critPulse`/`alertGlow` 是否 `animation:none` | 「有没有声音」**不得**作为弱化判据 |
| W4 | 弱化模式下 `triggerShake(6)` 被 `effectsWeak()` 拦掉但 `collapse` 音效**仍在** | 这是**正确表现，不是缺陷**（视觉弱化、听觉不变） |
| W5 | 两个开关必须可独立组合成 4 态：`sound×{true,false} × effects×{standard,weak}` | 4 态下音频行为只随 `sound` 变化 |

**「避免冲突」的一句话口径**：音频判据 = `AudioKit.last[kind]` + 节点调度数；视觉弱化判据 = `game.effects.length` 峰值 + 动画计算样式。二者**观测对象不相交**，因此不会互相掩盖或误判。

### 4.3 为什么音频不会污染 `game.effects.length`

`AudioKit` 只创建 Web Audio 节点，**不写 `game.effects` / `game.floats` / `game.corpses` / `game.combatEvents` 任何一个数组**。因此「40 敌夜晚 `game.effects.length` 峰值 ≤ 标准模式一半」这一指标与本次音效改动**完全正交**：它由 `spawnEnemy()` 新增的 `worldFx('burst')`（标准模式每次 10 个粒子）、`consumeCombatEvent()` 的 `weak?2:3+…`、`spawnSparks()`、`triggerShake()` 的 early-return 决定。

> 由此得到一条很实用的**交叉断言**（建议 quality-lead 加进用例）：在**同一 40 敌夹具**下，只翻转 `sound`（开↔关）而保持 `effects` 不变，`game.effects.length` 峰值必须**完全相同**。若出现差异，说明音效触发点误写入了表现数组或误读了 `effectsWeak()`。这条断言同时守住 §3 和 §4。

### 4.4 现存 CSS / `worldFx` 缺口（**非音频范围，请 team-lead 转交 engineering-lead / quality-lead**）

1. 菜单「效果：弱化」只改 `game.settings.effects`，**未给 `document.documentElement` 加 class**；CSS 的 `animation:none!important` 挂在 `@media (prefers-reduced-motion:reduce)` 上。因此「菜单弱化 + OS 未开 reduced-motion」时，`cardIn`/`bannerIn`/`deltaUp`/`critPulse`/`alertGlow`/`#stock .delta` 仍在播 → WP4 第 5 条「卡牌与横幅动画要关闭或减弱」不达标。建议 `syncSettingsMenu()` 或 `#effectsToggle` handler 同步 `documentElement.classList.toggle('fx-weak', effectsWeak())`，并补 `.fx-weak *{animation:none!important;transition:none!important}` 规则（注意别把 `#eventBanner` 的 `hidden` 逻辑和游戏必需过渡一起干掉）。
2. `worldFx()` 中 `if(kind==='ring'||kind==='build')` 推入的 1 个 `'ring'` 特效**没有 `!weak` 门控**（粒子块有）。`dawn()` 会对每个产出建筑调 `worldFx('ring',…)`，弱化模式下仍在推 `game.effects`。40 敌夜晚测量窗口内影响有限，但会抬高弱化侧峰值，可能让「≤一半」变紧；建议一并处理。
3. `drawVictoryMarks()`（~6603）直接读 `window.matchMedia` 而非 `effectsWeak()`，菜单弱化不生效——胜利页不在 WP4 主验收窗口，仅记录。

---

## 5. 可验收判定（给 quality-lead）

> 全部浏览器证据按计划 §2 统一设 `BORDER_ARTIFACTS=tests/artifacts/v030-<名称>`，不要覆盖旧证据目录。`cdp.cjs` 参数整体加双引号；点击后至少等 150 ms 再读 DOM；重新进入游戏一律用 `open`（`beforeunload` 会卡住）。

### 5.1 音效开 / 关两态

| 检查点 | 操作 | 证据形式 | 期望 |
|---|---|---|---|
| S1 · 开 | 真实点 `#soundToggle` 确认为「音效：开（低音量）」，先做一次真实 pointerdown/keydown 让 `unlockAudio()` 生效，再分别触发建成、天亮、倒塌 | `eval` 读 `game.settings.sound`、`AudioKit.ctx.state`、`AudioKit.last`；截图显示菜单文案与对应横幅 | `sound===true`；`ctx.state==='running'`；三个 kind 的 `last[kind]` 各前进一次；`createOscillator` 增量 1 / 2 / 1 |
| S2 · 关 | 点 `#soundToggle` 切到「音效：关」，在**同一局**重复触发三事件（或另开一局并确认 `newRun()` 保留了 `sound=false`） | 同上 + 关闭前后 `AudioKit.last` 快照对比；可用 `eval` 包装 `AudioContext.prototype.createOscillator`/`createGain` 计数 | `sound===false`；三个 `last[kind]` **不变**；节点创建增量 **0**；战斗/天亮/倒塌/建成业务逻辑与 UI **照常**（横幅、粒子、账本三字段齐全） |
| S3 · 组合 | 4 态矩阵 `sound×{true,false} × effects×{standard,weak}` | 表格式 `eval` 快照 | 音频行为只随 `sound` 变化（W5） |
| S4 · 解锁口径 | 按 §3.3 主理人裁定结果执行 | 关闭态 `AudioKit.ctx` 实例数快照 | 若采纳修复：关闭态不新增 ctx；若不采纳：按「已存在 ctx 允许保留但不得调度节点」验收并在报告写明取舍 |

**观测点说明**：`AudioKit.last[kind]` 是**现成的、无需改代码的**门禁探针——它写在 `play()` 门禁之后，因此「`last` 没动」=「`play()` 在门禁处 return」=「开关生效且未被绕过」。强烈建议以此为主证据，避免依赖听感或录音。

### 5.2 三个事件各触发一次的证据形式

| 事件 | 自然流程触发方式 | 证据形式 | 期望 |
|---|---|---|---|
| `build` | 真实鼠标选工具 → 点合法格建 1 座箭塔（或开发 1 处资源 / 建城） | 建造前后 `eval` 读 `AudioKit.last.build` + 截图（金框预览、建成横幅/粒子） | 1 次成功建造 → `last.build` **恰好 +1 次**；失败操作（资源不足/非法格）→ **不前进**；连续建造 2 次且间隔 >120 ms → +2 |
| `dawn` | 真实等到首夜清场天亮（或提前入夜后清场） | 天亮前后 `AudioKit.last.dawn` + `game.day` + `#eventBanner`「天亮了」截图 + 顶栏 `+N` 浮字 | `game.day +1`；`last.dawn` **恰好 +1**；`AudioKit.last.victory` 不前进（除非胜利夜）；两音 = `createOscillator` +2 |
| `collapse` | 故意不布防的一夜，等 40 敌拆完整圈墙 | 倒塌前后 `AudioKit.last.collapse` + `game.wallRings.get('home').status` + `game.ledger[day].collapseAt/collapseSide/towersAtCollapse` + 「城墙倒塌！」横幅截图 | `status==='broken'`；`last.collapse` **恰好 +1**；账本三字段写入且只增不改；随后再次调 `collapseWall('home')` 返回 `{ok:true,idempotent:true}` 且 `last.collapse` **不再前进** |

**去重复的额外证明**：在倒塌那一夜的连续帧采样中，`AudioKit.last.collapse` 只出现一次跃变；`game.combatEvents` 里不应因音效新增任何条目（音效不走 `emitCombatEvent`）。

### 5.3 弱化模式 40 敌夜晚 `game.effects.length` 峰值 ≤ 标准模式一半 —— 关联说明

- **测量方法**：用**同一个 40 敌夜晚状态夹具**，分别在 `effects='standard'` 与 `effects='weak'`（或 OS `prefers-reduced-motion:reduce`）下逐帧采样 `game.effects.length` 取峰值，断言 `peakWeak ≤ peakStandard / 2`。两种模式必须保持 `game.settings.sound` **相同**，否则引入混杂变量。
- **本音效改动与该指标的关系**：**零影响**。`AudioKit` 不写 `game.effects`（§4.3），三个新音效也不产生粒子/飘字/残影。该指标只由 WP4 第 2 条 `spawnEnemy()` 的 `worldFx('burst')`（标准模式每次刷兵 10 粒子、弱化模式由 `!weak` 拦掉）、`consumeCombatEvent()` 的 `weak?2:3+…`、`spawnSparks()`、`triggerShake()` early-return 决定。
- **交叉断言（建议必加）**：同夹具下只翻转 `sound`，`peak` 必须完全一致（§4.3）。这条同时证明「音效开关未绕过」与「音频未污染视觉弱化判据」。
- **注意 `FX_CAP=150`**：`visualBudget()` 达 150 时 `worldFx`/`spawnSparks`/`addFloat` 会丢弃次要特效，标准模式峰值可能被削顶；记录 `visualBudget()` 与 `FX_CAP` 命中情况，避免把「削顶」误判为「弱化生效」。
- **前置依赖**：§4.4 的两个缺口（`worldFx('ring')` 未受 `!weak` 门控、菜单弱化未落 class）会抬高弱化侧峰值 / 遗漏 CSS 动画，须由 engineering-lead 在 WP4 内一并处理，否则本指标与第 5 条都可能不达标。

### 5.4 状态夹具标注（**逐字标注「非自然流程证据」**）

计划 §2 明确：`fx/day-scene.js` / `fx/night.js` / `fx/perf.js` 是状态夹具；WP5 允许用夹具把 `game.day` 设为 5 验证胜利页但必须标注。本规格要求：**凡下列证据，在报告与截图文件名/图注中逐字出现「非自然流程证据」**。

| 证据 | 性质 | 标注要求 |
|---|---|---|
| `fx/night.js` / `fx/perf.js` 造出的 40 敌夜晚，用于 `game.effects.length` 峰值对比 | 状态夹具 | 逐字标注「非自然流程证据」 |
| `eval` 直接改 `game.settings.sound` / `game.settings.effects` / `game.day` / `game.clock` / `game.wallRings.get('home').hp` | 状态夹具 | 逐字标注「非自然流程证据」 |
| `eval` 直接调用 `build()` / `develop()` / `dawn()` / `collapseWall('home')` / `damageWallRing()` 来取音效证据 | 状态夹具 | 逐字标注「非自然流程证据」 |
| `eval` 包装 `AudioContext.prototype.createOscillator/createGain` 计数、或读 `AudioKit.last` 的快照 | 观测手段（不改游戏状态，但非玩家可见流程） | 图注写「仪器取证」；若同时用了上面的夹具，仍须逐字标注「非自然流程证据」 |
| `sim/matrix.cjs` 的 VM 复现 | 状态夹具 | 逐字标注「非自然流程证据」 |
| 真实 `clicktext` / `tile` / `tiletap` / `key` / `wait ms` 等真实输入等到天亮、建成、倒塌的截图与 DOM 读数 | **自然流程证据** | 不得标注为夹具 |

> 建议：至少为 `build`、`dawn`、`collapse` 各保留 1 组**自然流程证据**（真实输入 + 横幅截图 + `AudioKit.last` 读数），夹具只用于 40 敌峰值与去重压力验证。

### 5.5 回归命令与断言纪律

```sh
node --test tests/v029-workplaces.test.cjs tests/v029-rings.test.cjs tests/v029-ui.test.cjs tests/v027-balance.cjs tests/v028-priority.cjs tests/v030-flow.test.cjs
```

- 交接 48/48；WP4 后应 ≥ 48 + 新增测试数，**0 失败**。
- `git diff cd4437a -- tests/` 对已有断言**只能新增，不能删除或放宽**（计划 §0 测试纪律、§4.1）。
- 浏览器三条：`BORDER_ARTIFACTS=tests/artifacts/v030-hud|v030-work|v030-rings` + `v029-hud-occlusion-browser.cjs` / `v029-workplaces-browser.cjs` / `v029-rings-ui-browser.cjs`，均输出 `OK`、`pageErrors=[]`、`afterCollapseSeconds ≤ 5`。
- 性能：1440×900 白天夹具 `evalfile fx/perf.js`，`nightMs ≤ 8`、`dayMs ≤ 4`（WP4 验收第 2 条沿用 WP1 阈值）。新增音频节点不应影响 `draw()` 耗时；若 `nightMs` 上升，先排查 `ringHit` 火花/音效泛滥（§6.2）而非放宽阈值。

---

## 6. 不得触碰范围 + WP4 第 4 条判断

### 6.1 WP4 音频部分明确不得触碰

**§0 核心规则（六条，逐条）**：

1. 城墙**整圈共享耐久、归零整圈倒塌**（`tests/v029-rings.test.cjs` 全绿；地图只有一条圈耐久牌）→ `collapseWall()` 的插入点在幂等检查之后，不改 `ring.hp`/`status`/`wallRings` 结构。
2. **破墙后主城很快失守**（`v029-rings-ui-browser.cjs` 的 `afterCollapseSeconds ≤ 5`）→ 音频是 0.4 s 一次性，不得引入任何阻塞/延时/等待。
3. **居民到岗后仍可移动、召回、改派**（`v029-workplaces*.cjs`）→ 不碰居民逻辑。
4. **资源地形不挡友军；开发后清旧自然图标**（`structure`/`nodeArt`/`drawFoliage` 函数名契约必须保留）→ 不碰绘制函数。
5. **资源、费用、收入与界面一致**（顶栏只显示金币/材料/粮食/稀缺资源；天亮飘字 = `forecastIncome()`）→ 不碰 `spend`/`pay`/`addIncome`/`forecastIncome`。
6. **测试纪律**：不删断言、不放宽阈值、不改结果文件掩盖失败；有意改规则要写进报告并附依据。

**伤害数值（一律不碰）**：`V029.wallHit={normal:7,heavy:14,boss:30}`、`wallBlow()`、拆单体建筑 12/22/35、主城 `impact` 19/9/5、`DEMO.*`、`spawnEnemy()` 的 hp/speed 计算、`damageWallRing()` 的扣血与 `wallDamageSamples` 采样。

**WP2 引导链（一律不碰）**：`tutorialStep()` 六步提示、`#mapHint.next`、推荐布防格、`structure()` 工人数徽章、`inspect()` 居民「建筑名 + 坐标」、`estimateWallBreach()`、`failureDiagnosis()`、`game.ledger[day].collapseAt/collapseSide/towersAtCollapse`（**只增不改，且 `collapseWall()` 里写这三字段的代码块必须保持在插入点之前**）、`bindMapGestures()` 悬停预览 / `game.hoverTile`。

**WP3 布局与小地图（一律不碰）**：`drawMinimap()` 的 `PAL` 配色、`#victoryCard` 主题、7 视口响应式 CSS、手机端底栏 4 命令与 `#eventBanner` 不遮顶栏。

**其他边界**：

- 不改 `Border-Guard-v0.29.html` 之外的任何文件；入口文件名不变；保持单文件、离线、双击可玩；**不新增任何外部音频资源/网络请求**。
- 不改 `window.FW` 导出列表结构；不改 `AudioKit.play()` 第一行门禁与 `last[kind]` 写入位置；不改既有 9 条 `spec` 的值与 `gap` 值；不改 `AudioKit.volume=.16`。
- 不改 WP4 第 1 条 `drawLighting()` 昼夜过渡、第 2 条 `spawnEnemy()` 刷兵烟尘的实现（只做触发点协调）。
- 不改 `makeGame()` 的 `settings` 默认值、`newRun()` 的 settings 保留、`#soundToggle`/`#effectsToggle` 的 DOM id 与 click handler。
- **本轮不提交、不 push**；WP4 的提交信息按计划为 `feat: day-night transitions, spawn dust, new sounds and ring hit sparks`，由主理人决定。

### 6.2 WP4 第 4 条「圈墙受击发 `emitCombatEvent`」——判断与建议（不改代码）

**现状事实**：

- `emitCombatEvent({kind:'structureHit',…})` 目前**只有一处**（~4107，`enemyBreakable(e.next)` 分支），语义是「**单体可破坏建筑**（箭塔/墙段）受击」，`consumeCombatEvent()` 的 `case 'structureHit'` 会 `spawnSparks(…,2,…)` + `AudioKit.play('castle')`。
- **圈墙受击走的是另一条路**：`advanceBattle()` 中 `findRingEdgeNear()` → `wallBlow(e)` → `damageWallRing()`（~4019 / ~4070 两处调用），它只做 `ring.hitFlash`、`markBuildingFlash()`、`wallDamageSamples` 采样，**完全不发 `emitCombatEvent`** → 圈墙受击目前既无火花也无音效。WP4 第 4 条就是要补这个。
- `tests/v027-balance.cjs` 的「拆墙有受击反馈并能正常天亮」用例（~93–108）统计 `game.combatEvents.filter(e=>e.kind==='structureHit').length` 并断言结果数组为 `[2,true,1,'day',3,true]`，即 **恰好 2 个 `structureHit`**。

**我的判断（三点）**：

1. **与我的三个音效设计不冲突**。`build`/`dawn`/`collapse` 是 `AudioKit.play(kind)` 的**小写音频 kind**，与 `emitCombatEvent` 的 **camelCase 事件 kind** 是两套命名空间；三个新音效**不调用 `emitCombatEvent`、不写 `game.combatEvents`**，因此不会改变任何 `structureHit` 计数。既有 `case 'structureHit'` 的 `AudioKit.play('castle')` 也不受影响。
2. **关于 `v027-balance.cjs` 是否会变红**：
   - 该文件的 `const file=process.env.BORDER_HTML||'Border-Guard-v0.27.html';`（第 4 行）→ 在计划 §4.1 的**默认命令**（未设 `BORDER_HTML`）下加载的是 `Border-Guard-v0.27.html`，而 WP4 改动落在 `Border-Guard-v0.29.html`，**默认跑法下不可能变红**。
   - 若 QA / `sim` 设了 `BORDER_HTML=Border-Guard-v0.29.html` 重跑：该 fixture 用 `game=makeGame(42)` 后**直接**铺路并 `game.castle=fort(3,5,'castle')`，**从不调用 `chooseSite()` / `createHomeWallRing()`**，`game.wallRings` 保持空 `Map` → `ringProtectsCastle()` 为 false → 圈墙受击分支不可达 → 计到的 2 个 `structureHit` 全部来自单体墙段。因此**即使重定向到 v0.29 也不应变红**。
   - 但这是「**确认它统计的场景里没有圈墙**」的脆弱保证：一旦未来该用例或别的新用例造出了 home 环，或者把事件发在 `damageWallRing()` 内被其他路径（夜间抢修、测试直接调用）触发，计数就会漂移。计划给的退路（`ringHit`）更稳妥。
3. **音频上的真实风险（比计数更值得关注）**：40 个敌人围拆圈墙时，每个敌人 `cooldown=.85 s` → 峰值约 **47 次/秒**的圈墙命中。若沿用 `case 'structureHit'` 的 `AudioKit.play('castle')`（`gap.castle=220 ms`），仍会有 ~4.5 次/秒的低频三角波，加上每次 2 个火花 → **听感会是持续的机关枪式闷响，且 `game.combatEvents` 240 条环形缓冲会被圈墙事件淹没、挤掉真正的战斗事件**。这不是「不冲突」，是「会互相抢表现预算」。

**建议（只给判断与建议，不改代码）**：

- **建议直接采用计划给的 `ringHit` 新事件名**，不必先等 `v027-balance.cjs` 变红再退让。理由：(a) 语义正确——整圈共享耐久的圈墙不是「单体可破坏建筑」，与 `structureHit` 混用会污染现有计数与语义；(b) 让 `v027-balance.cjs` 在任何 `BORDER_HTML` 配置下都**可证明**不变红，省掉「确认场景无圈墙」的人工核对；(c) 便于 `consumeCombatEvent()` 给圈墙单独配一套更克制的表现。
- `case 'ringHit'` 的表现建议：`spawnSparks()` **受 `!weak` 门控且数量 ≤2**；音频**复用 `AudioKit.play('castle')` 但把该 kind 的节流显著拉长**（例如独立 `ringHit` kind 配 `gap ≥ 400–600 ms`），或干脆只出火花不发声——**不要再新增第 4 个音效 kind**，保持本规格「恰好 3 个新音效」的边界。此项属表现层决策，需主理人/engineering-lead 拍板。
- **唯一的权威发事件点建议放在 `damageWallRing()` 内 `if(dealt>0){…}` 块**（该函数是圈墙受击的唯一权威采样点，与 WP2 的 `wallDamageSamples` 同址），而不是分别改 `advanceBattle()` 的 ~4019 / ~4070 两处调用点——后者容易漏发或重复发。
- **不得改伤害**：`ringHit` 只发事件、出火花/音效，绝不触碰 `wallBlow()` 返回值、`ring.hp`、`wallDamageSamples`、`game.ledger`。

---

## 7. 待用户 / 主理人拍板处、风险与下一步

| 编号 | 决策点 | 我的推荐 | 影响 |
|---|---|---|---|
| **A** | `build` 覆盖范围：三种建成事件都响 vs 只在建塔/建造响 | **三种都响**（`chooseSite` / `develop` / `build`），统一的上扬提示音 | 影响 §2.1 插入点数量与 S 类用例 |
| **B** | 弱化模式下音效是否同步降音量/禁用 | **不降、不禁用**，音频只认 `sound`（§4.1） | 决定 W1–W5 判据；若改判，需重定 §4 全部验收口径 |
| **C** | `collapse` 低频在小喇叭可能不可闻 | 先按 130→65 Hz / .14 实现，**真机确认**后再决定是否提到 ~160 Hz 或加一层极短 triangle | 属「存疑标注」，不阻塞实现 |
| **D** | 是否采纳 §3.3 的 `unlockAudio()` 加 `sound` 门禁（严格满足「关闭态不创建 AudioContext」） | **建议采纳**，但动到共享函数，需 engineering-lead 确认范围 + 主理人批准；若不采纳，须按「已存在 ctx 允许保留、关闭态不调度节点」验收并在报告写明 | 决定 §3.2 第 3 条判据 |
| **E** | §6.2 是否直接采用 `ringHit` 而不等 `v027-balance.cjs` 变红 | **建议直接采用**，并把发事件点放在 `damageWallRing()` 的 `dealt>0` 块 | 影响 WP4 第 4 条实现与性能 |
| **F** | §4.4 两个缺口（菜单弱化未落 class、`worldFx('ring')` 未受 `!weak` 门控）是否纳入 WP4 | **建议纳入**，否则第 5 条与「峰值 ≤ 一半」有风险 | 属视觉层，需转交 engineering-lead |

**最容易踩的实现坑（Top 3，给 engineering-lead）**：

1. **`dawn` 的「两音上行」不能用现有单振荡器滑音 spec 表达**，必须扩展 `play()` 支持音符数组；**禁用 `setTimeout`** 排第二音（VM 桩 + 暂停冻结会丢音）。
2. **忘了把 `build`/`dawn`/`collapse` 写进 `gap` 表** → 落到默认 80 ms，`dawn`/`collapse` 可能被重入连响；同时 `peak` 若沿用硬编码 `this.volume=.16` 而不是逐 kind 峰值，会盖过既有音效（违反「不得盖过」）。
3. **把音频写进 `worldFx()` 的 `!weak` 分支或读 `effectsWeak()`** → 弱化模式被静音，直接违反 §4；或把 `collapse` 音效放进 `if(typeof showBanner==='function')` 块内 → DOM 缺失时不发声。另：`collapseWall()` 的插入点必须在幂等 return **之后**、WP2 账本三字段写入块**之后**，否则破坏「只增不改」与「一夜一次」。

**下一步建议**：

1. 主理人就 A–F 拍板（尤其 B / D / E），并把 §4.4 转交 engineering-lead、§5 验收点转交 quality-lead（本轮按分工「禁止与其他成员直连」，未直接联系）。
2. WP3 质量门放行后，engineering-lead 按 §1.5 + §2 实施；**先红后绿**地补一条 Node 用例：在 VM 中把 `AudioKit.supported` 与 `ctx` 桩成可观测状态，验证「`sound=false` 时 `play('build'|'dawn'|'collapse')` 不写 `last`、不创建节点」以及「`collapseWall('home')` 幂等返回时音频不重复」。注意不得删改已有断言。
3. quality-lead 按 §5 取证，严格区分自然流程证据与「非自然流程证据」（逐字标注）。
4. 真机/真人试玩时补听感确认（尤其 C 项低频可闻性、40 敌夜晚 `ringHit` 是否仍显嘈杂），并在 `docs/v030-polish-report.md` 的「剩余问题」中列出「未做手机真机」「未做真人试玩」。

---

*本文件为规格草案，未提交、未改动任何游戏代码（`git status` 中仅新增本文件）。所有行号为 `0b9e024` 起、`ee7f596` 复核后的快照辅助参考，实现时以函数名为准。*
