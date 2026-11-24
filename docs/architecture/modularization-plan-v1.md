# Border Guard｜模块化与仓库整理方案

- 版本：V1.0
- 状态：已建立实施基线；按阶段执行
- 适用基线：`feat/v060-30wave@98932a2918ed22f17ea176b4209de76b839160bc`
- 本方案不授权玩法重做或数值调整。

## 1. 改造目标

把当前集中在单个 HTML 中的游戏源码拆成有明确职责的 ES Modules，同时保留“构建后是一个可双击、离线运行的 HTML”这一交付方式。

本次解决的是工程组织问题，不是游戏设计问题：

1. 业务规则、渲染、输入、存档、数值定义分离。
2. 模块有明确职责和依赖方向。
3. 测试按 unit / integration / e2e 归类。
4. 历史版本、审查报告、测试证据可追溯。
5. 开发环境支持模块热更新，发布环境仍输出单文件 HTML。

## 2. 基线事实

详见 [v0.60 基线记录](./v060-baseline.md)。

当前主游戏文件约 17,042 行、758,610 字节；CSS 和 JavaScript 均嵌入 HTML。代码中有约 314 个顶层函数。现有 v0.60 测试包括 Stage 1–6、审计和浏览器 E2E 测试；部分测试通过正则从 HTML 提取内嵌脚本，再用 VM 执行。

## 3. 目标目录

以下是最终目标结构。Phase 1 只创建构建骨架；业务目录将在对应模块迁移阶段按需创建，不创建空目录来制造“已完成”的假象。

```text
border-guard/
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
├── README.md
├── PROJECT_HANDOFF.md
├── AGENTS.md
│
├── src/
│   ├── main.js
│   ├── app/
│   │   ├── bootstrap.js
│   │   └── game-loop.js
│   ├── core/
│   │   ├── state.js
│   │   ├── context.js
│   │   ├── rng.js
│   │   ├── clock.js
│   │   └── math.js
│   ├── data/
│   │   ├── hero-data.js
│   │   ├── seal-data.js
│   │   ├── equipment-data.js
│   │   ├── progression-data.js
│   │   └── boss-data.js
│   ├── systems/
│   │   ├── run/
│   │   ├── combat/
│   │   ├── hero/
│   │   ├── equipment/
│   │   ├── economy/
│   │   ├── progression/
│   │   └── meta/
│   ├── ui/
│   │   ├── canvas/
│   │   ├── hud/
│   │   ├── modals/
│   │   ├── input/
│   │   ├── audio/
│   │   ├── vfx/
│   │   └── styles/
│   └── debug/
│       ├── test-api.js
│       └── presets.js
│
├── balance/
├── scripts/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── legacy/
│   └── artifacts/
├── docs/
│   ├── architecture/
│   ├── design/
│   ├── decisions/
│   ├── releases/
│   ├── reviews/
│   └── archive/
├── sessions/
├── archive/
│   ├── baselines/
│   ├── releases/
│   └── tooling/
└── release/
```

## 4. 现有代码的目标归属

| 现有代码职责 / 代表函数 | 目标位置 |
|---|---|
| 页面入口、启动、主循环：`startNewRun`、`stepFrame`、`loop` | `src/app/` |
| 游戏状态、随机数、时钟、数学工具：`makeGame`、`mulberry32`、`dist`、`clamp` | `src/core/` |
| 静态技能、灵印、装备、突破、Boss 数据 | `src/data/` |
| 波次、局内生命周期、遥测 | `src/systems/run/` |
| 伤害、敌人、弹体、区域、异常状态、Boss | `src/systems/combat/` |
| 英雄属性、技能、Perks | `src/systems/hero/` |
| 装备实例、词条、联动、背包 | `src/systems/equipment/` |
| 金币、材料、商店、掉落和奖励 | `src/systems/economy/` |
| W10/W20 突破、天命赌局、词条转移 | `src/systems/progression/` |
| 局外传承、版本化存档、迁移、结算 | `src/systems/meta/` |
| Canvas、相机、绘制函数：`render`、`draw*` | `src/ui/canvas/` |
| HUD、商店、背包、Inspector | `src/ui/hud/` |
| 弹窗管理及各类弹窗 | `src/ui/modals/` |
| 键盘、鼠标、触屏和 Canvas 输入 | `src/ui/input/` |
| 音频、VFX | `src/ui/audio/`、`src/ui/vfx/` |
| 调试预设、测试 API、`window.BG60` 兼容接口 | `src/debug/` |
| CSS | `src/ui/styles/` |
| 数值唯一来源 | 继续使用 `balance/v060-baseline.json`，通过脚本生成/校验嵌入快照 |

这张表是迁移目标，不是按函数名机械剪切的授权。每个模块迁移前必须先检查调用关系、状态读写和副作用。

## 5. 模块边界

依赖方向：

```text
data / balance
      ↓
core
      ↓
systems
      ↓
app (composition root)
      ↓
ui

debug 与 tests 通过明确接口访问系统
```

规则：

- `data` 只定义静态数据，不读写运行状态。
- `core` 不操作 DOM，不依赖具体 UI。
- `systems` 实现游戏规则，不直接读写 DOM。
- `ui` 负责绘制、输入和显示，通过系统接口发起操作。
- `app` 负责组装依赖、启动游戏和驱动主循环。
- `debug` 不进入正式业务调用链。
- 不允许用一个巨型 `common.js` / `utils.js` 替代原来的巨型 HTML。
- 不允许循环 import；跨系统协作由明确接口或应用层组合解决。

**特别风险：当前代码依赖大量同一 script 作用域中的变量和函数。** 拆成 ES Modules 后，原先隐式可见的标识符不会自动共享。Phase 2 必须先产出依赖图，并决定运行时 context / state ownership / system composition 的方案，再迁移业务函数。不得直接按注释块切文件。

## 6. 不可破坏的行为约束

1. 不改变游戏规则、战斗数值、概率、掉落、经济和波次安排。
2. 不改变 DOM 交互、键位、HUD 布局和视觉效果。
3. 不改变 localStorage 键名、存档 schema 和迁移行为。
4. 不删除已有测试、历史版本或测试证据。
5. 不因拆分方便而复制第二份权威游戏状态。
6. 不在本轮顺手重构随机数算法；必须保留同种子下 RNG 调用顺序。
7. 发现原有 Bug 时先记录，除非用户另行授权，不在结构重构中修复。
8. 不引入 React、TypeScript、ECS 或大型状态管理框架；如确有必要，先提交决策说明。

## 7. 构建与发布

- 开发：`npm run dev`
- 构建：`npm run build`
- 入口：`index.html`
- 源码：`src/`
- 构建临时目录：`dist/`（忽略，不提交）
- 单文件构建产物：`release/Border-Guard-v0.60-modular-shell.html`

Phase 1 的产物只是“模块化构建骨架验证页”，**不是可玩的游戏版本**。原始可玩版 `Border-Guard-v0.60.html` 保持原位，不被覆盖。等所有业务模块迁移、回归和行为等价验收通过后，才生成正式的模块化游戏 HTML。

单文件要求：

- JS 和 CSS 全部内联。
- 不依赖 CDN、远程字体、远程图片或远程脚本。
- 不需要服务器即可双击打开。
- 构建检查必须确认没有外部 JS/CSS 资源引用。

## 8. 分阶段实施

### Phase 0｜冻结基线
- 记录源分支、提交、文件 Blob SHA、SHA-256、字节数和行数。
- 在 `archive/baselines/` 建立不可变基线副本。
- 新建独立重构分支，不直接修改原分支。

### Phase 1｜工程骨架
- 建立 Vite + ES Modules。
- 建立入口 HTML、main、bootstrap 和基础样式。
- 建立单文件构建和构建产物检查。
- 建立 CI 构建门禁。
- 不迁移游戏逻辑，不替换当前可玩 HTML。

### Phase 2｜依赖图与 Core / Data
- 盘点全局状态、函数调用、DOM 访问、随机数调用和副作用。
- 决定 context、状态归属和 system composition 方案。
- 迁移基础状态、随机数、数学工具和静态数据。
- 逐项对照旧版结果。

### Phase 3｜业务系统
建议按低 UI 依赖到高耦合顺序：
1. Meta / Persistence
2. Equipment / Inventory / Synergy
3. Economy / Shop / Rewards
4. Hero / Progression
5. Run / Waves / Telemetry
6. Combat / Enemies / Projectiles / Bosses

每个系统独立迁移、测试和审查，不允许一次性重写。

### Phase 4｜表现与输入
1. Canvas / Camera / Draw
2. HUD / Inspector / Shop / Bag
3. Modal
4. Input / Keyboard / Pointer / Touch
5. Audio / VFX
6. 主循环和启动组装

### Phase 5｜测试迁移
- Unit 测试直接 import 模块，不再从 HTML 正则提取业务源码。
- Integration 测试验证跨系统流程。
- E2E 使用真实浏览器验证玩家交互。
- `window.BG60` 兼容测试 API 保留，但实现迁至 `src/debug/`。
- 历史测试移至 legacy 前必须确认其证据价值和替代覆盖。

### Phase 6｜归档与文档
- 历史 HTML 归档，保留可独立打开的原件。
- 测试脚本按类别归档。
- 测试证据不删除、不覆盖。
- 更新 README、PROJECT_HANDOFF、AGENTS、progress 和 task_plan。
- 将旧的一次性补丁脚本移至 `archive/tooling/`，不再作为当前工具入口。

### Phase 7｜行为等价与发布
- 旧版与模块版使用相同种子进行关键状态对照。
- 验证 W1–W30、装备、突破、天命、W29 整备、W30 Boss、结算和局外存档。
- 桌面、窄屏和离线 file:// 打开验证。
- 所有门禁通过后才切换正式入口。

## 9. 每阶段交付格式

每个 Phase 完成后必须报告：

- 变更文件清单。
- 旧函数 / 旧代码块 → 新模块映射。
- 模块依赖图。
- 测试命令、通过数、失败数和退出码。
- 与基线的行为差异。
- 未解决问题和明确未覆盖范围。
- 下一阶段计划。

禁止把“代码已搬迁”当成“重构完成”，也禁止把未运行的测试写成通过。
