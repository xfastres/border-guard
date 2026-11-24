# 边境守卫 · Border Guard

## 当前版本：v0.60（30 波模块化工程版 · 离线单文件 HTML）

`v0.60` 是 30 波修仙肉鸽防守试玩版（含初始技能、装备词条双/三联动、W10/W20 突破与预选重抽、W29 90 秒终局整备、天命赌局、词条转移台、W30 首领三阶段锁血与局外 Meta 传承）。

仓库已完成 **v0.60 阶段一纯工程模块化重构（零玩法改动）**：
- **冻结原版基线**：根目录 `Border-Guard-v0.60.html` 与 `balance/v060-baseline.json` 保持字节不变，作为回归与等价校验黄金对照。
- **模块化源码（`src/`）**：`src/legacy/game.js` 已彻底拆分并删除，全量源码按严格单向分层组织为 90 个 ES 模块：
  - `src/data/`：静态数据与配置（零运行时状态、零 DOM）。
  - `src/core/`：唯一权威状态容器 `runtime-context.js`、对局状态工厂 `state.js`、只读查询 `state-queries.js`、RNG / 数学 / 地形纯函数。
  - `src/systems/`：7 个纯业务子域（`meta` / `equipment` / `economy` / `progression` / `hero` / `combat` / `run`），零浏览器标识符，通过 `ports` 依赖反转解耦表现层。
  - `src/ui/`：样式（8 份 CSS）、Web Audio 音频、VFX、提示反馈、Canvas 2D 渲染与相机、共享格式化、弹窗系统、零闪烁 HUD 协调器与输入控制器。
  - `src/debug/`：测试预设 `presets.js` 与 `window.BG60` / `window.BG52` 公开调试 API `test-api.js`。
  - `src/app/`：根装配 `bootstrap.js`（提供零 DOM 纯系统工厂 `createGameSystems` 与浏览器启动 `bootBrowserGame`）与主循环 `game-loop.js`。
- **离线单文件构建**：使用 Vite + `vite-plugin-singlefile` 将全部源码与样式内联打包为单个可离线双击打开的正式交付 HTML：`release/Border-Guard-v0.60.html`（521,949 字节，1 个内联 `<script>`，0 外部静态资源依赖；`release/` 已被 `.gitignore` 忽略，运行 `npm run build` 即可生成）。

### 开发、构建与验证命令（要求 Node.js >= 22.12，浏览器测试需本机 Chrome/Chromium）

```sh
npm run dev                 # 启动开发服务器
npm run build               # 构建并校验离线单文件 HTML
npm run preview             # 预览构建产物
npm run test:unit           # 298 项 ES 模块单元测试（含 AST 架构边界门禁）
npm run test:integration    # 12 项零 DOM/零浏览器纯 ES 模块 W1→W30 全链路与 BUG-01~10 集成测试
npm run test:arch           # AST 零循环依赖、单向分层、纯层无 DOM、legacy 退役与冻结原版哈希门禁
npm run test:parity         # 真实 Chrome CDP 同种子（2026 / 1337 / 9527）原版 vs 模块版全量等价校验
npm run test:modular-game   # 真实 Chrome file:// 桌面（1440×900）+ 手机（390×844）离线启动校验
npm run test:e2e:modular    # 真实 Chrome 交互 E2E（6 场景，0 未捕获异常）
npm run test:baseline       # 原版 Border-Guard-v0.60.html 全部 43 项回归测试
npm run test:all            # 依次运行以上全部 7 组测试套件
```

如需手动指定 Chrome 路径，可设置环境变量 `CHROME_BIN`（如 Windows 下 `C:/Program Files/Google/Chrome/Application/chrome.exe`）。协同规范见 [AGENTS.md](AGENTS.md)，阶段记录见 [progress.md](progress.md) 与 [findings.md](findings.md)。

---

## 历史版本说明（v0.17–v0.32 格子策略经营线）

> 以下内容为早期五夜格子策略经营版本（`Border-Guard-v0.17.html` … `Border-Guard-v0.32.html`）的历史说明，所有历史版本与 `tests/artifacts/` 证据均完整保留。

> 一款**单机、离线可玩、横屏优先**的格子策略经营游戏：白天探索、建城与布防，夜间守住边境，目标是在**五夜**之后击退首领；一局约 15 分钟。

不需要服务器，不需要联网，也不需要安装。所有内容都在本仓库的单个 HTML 文件里。

## 这是什么

一局由五个「昼夜」组成，循环推进：

1. **白天准备** —— 移动领主探索地图，在 A / B 城址中选址建城，开发资源点，建造箭塔 / 墙 / 营地，招募并派驻居民，为入夜做布防。资源产出在**天亮时统一结算**，不是点一下就到账。
2. **夜间承压** —— 敌人按波次进攻，箭塔、守卫与民兵自动接敌；玩家可以走位、攻击、齐射、急修、用药剂、救援。城堡失守或领主倒下则本局结束。
3. **天亮结算** —— 结算资源与战报，进入下一天；第 5 夜击败首领后进入结算页，可按夜次查看收支与战报（分夜复盘）。

白天有时长（首日 120 秒、之后 90 秒）与 7 次行动的约束，也可以主动「提前入夜」。五夜循环、成本、伤害、居民规则与奖励预算沿用 v0.25。

## 当前试玩文件

- **当前版：`Border-Guard-v0.32.html`** —— 基于 v0.31 的独立离线 HTML 新版本；包含深青玻璃 HUD 视觉优化与六项核心玩法优化（主城居民驻场与专精加成、主城守卫协防、换向预警与明夜入口标记、城墙部分修复与快捷加固、破墙缓冲与急修减伤盾、营地降本与首名驻员免首周期维护、1×/2× 倍速切换与智能资源开发）。
- **上一版：`Border-Guard-v0.29.html`（内容 v0.31）** —— v0.32 的直接基线，保留作对照，可独立离线打开。
- **上一稳定对照：`Border-Guard-v0.26.html`** —— 同样可独立双击打开。
- 历史版本 `Border-Guard-v0.17.html` … `Border-Guard-v0.28.html` 全部保留，每个都能独立打开，历史文件与历史验证证据均未改动。

> **v0.30 打磨（已合并到 `main` 并推送）**：上一版的 `Border-Guard-v0.29.html` 已完成 WP1–WP5 打磨——明亮卡通渲染与金边玻璃 HUD、首日六步引导与悬停放置预览、七视口与触控适配、1.5 秒昼夜过渡 / 刷兵烟尘 / 三个新音效 / 圈墙受击火花与效果弱化。**入口文件名保持不变，仍是双击即可离线试玩的单文件**。设计方向、取舍、前后截图索引、测试命令与结果、自然试玩记录及剩余未验证项见 [`docs/v030-polish-report.md`](docs/v030-polish-report.md)；逐包进度与质量门结论见 [`docs/v030-polish-progress.md`](docs/v030-polish-progress.md)。
 
> **v0.31 画面基线（2026-11-16）**：更新为明亮饱和的卡通地图、蓝顶城堡、圆冠松林、HiDPI Canvas、柔化迷雾、资源胶囊和建筑详情插画，提交为 `bca3ccc`。
>
> **v0.32 界面打磨与六项玩法优化（本次）**：在 `Border-Guard-v0.32.html` 上完成深青玻璃 HUD 细节修复（顶栏资源名与净产胶囊、横幅防遮挡、竖屏紧凑详情、折叠面板去重框、命令栏独立 SVG 图标、三选一卡牌分色、飘字防叠），并落地六项玩法优化：主城居民驻场提产与守卫协防、第 1→2 夜换向预警与「明夜」入口标记、白天城墙部分修复与经营栏快捷「加固城防」、城墙破墙 1.2 秒碎石阻滞 + 紧急号令 + 急修 50% 减伤盾、远征营地降本（6 材料 + 3 金币）+ 5×5 点亮 + 首名驻员免首周期维护 + 选址高亮、以及 `1× / 2×` 倍速切换与智能资源开发工具。无需外部资源，仍可离线双击打开。详见 [`Border-Guard-v0.32-更新说明.md`](Border-Guard-v0.32-更新说明.md)。

### v0.29 本轮试玩默认与限制

- 主城耐久 **50**；主城圈墙 **600** 共享 HP，归零整圈倒塌。
- 顶栏资源仍为金币 / 材料 / 粮食（不把材料拆成虚构的木材·石料余额）。
- 营地独立围墙、木石分账与完整工时经济仍属后续范围。详见 `docs/ring-wall-ui-report.md` 与 `docs/resident-workplaces-fix-report.md`。

## 桌面基本操作

- **移动**：`WASD` 或点击地面 / 空地移动；点地块或资源点查看详情。
- **命令分组**：白天为「建造 / 经营 / 营地」，夜间为「战斗 / 支援 / 营地」。选中建造或占地工具后**点地执行**，`Esc` 取消工具，取消后恢复普通状态。
- **战斗**：地图有焦点时按`空格`攻击（键盘聚焦在按钮上时，空格用于激活该按钮）。
- **提前入夜**：点「准备完毕 · 立即入夜」后按钮会在 3 秒内原位变为取消，可撤销；不点则到时自动入夜。
- **暂停与菜单**：暂停会停住时钟与战斗；菜单中可查看操作指南与资源说明、开关音效、重新开局。
- **结算**：第 5 夜首领战结束后进入结算页，可浏览地图并查看分夜复盘；失败页会先说明失败原因。
- **看地图**：拖动地图或用滚轮浏览；点「领主」可让镜头重新跟随领主。

## 手机基本操作

- **短按**移动，**长按约 350ms** 查看详情，**拖动只平移地图**（三种手势互斥，不会误执行）。
- 选中建造 / 占地工具后**点地执行**工具，取消后回到普通状态。
- 详情面板位置随屏幕方向变化：**竖屏在地图下方，横屏与桌面在地图右侧**；战役、地点详情与战报共用同一个区域，面板打开时地图仍可操作。
- 详情内容过长时，面板**顶部会出现「↓ 下方还有内容」提示**，需要向下滑动才能看到后面的军令、强化、战报等入口。
- 界面按横屏优先设计，建议在横屏下游玩。

## 测试命令与环境要求

要求 **Node.js 22+**；浏览器相关的 runner 需要可启动的 **Chrome / Chromium**，必要时用 `CHROME_BIN` 指定二进制路径（Windows 示例为 `C:/Program Files/Google/Chrome/Application/chrome.exe`，请按本机实际路径替换；Linux/容器可设为 `/usr/bin/google-chrome`）。

无浏览器回归（Node 脚本，不启动浏览器、不写产物，**可直接在项目目录运行**）：

```sh
node --test tests/v029-workplaces.test.cjs tests/v029-rings.test.cjs tests/v029-ui.test.cjs
node --test tests/v026-ui-contract.cjs
node tests/run-v026-model.cjs
```

浏览器回归（把 `CHROME_BIN` 换成你的浏览器路径后可直接复制）：

```sh
CHROME_BIN="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/v029-rings-ui-browser.cjs
CHROME_BIN="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/v029-workplaces-browser.cjs
CHROME_BIN="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/run-v026-checks.cjs
CHROME_BIN="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/v026-playthrough.cjs
CHROME_BIN="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/v026-edge-cases.cjs
```

v0.25 旧版对照：

```sh
CHROME_BIN="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/run-v025-checks.cjs Border-Guard-v0.25.html
```

> 若已在环境中导出 `CHROME_BIN`，上面三条也可直接写成 `node tests/v026-edge-cases.cjs` 等形式。

> ⚠️ **浏览器 runner 会写 `tests/artifacts/`**（截图与 JSON）。为避免覆写仓库里已有的历史验证证据，建议**在仓库外的临时副本中运行**：新建临时目录，把根目录的 `*.html` 与整个 `tests/` 目录复制进去再执行上面的命令。上面前两条 Node 脚本不写产物，可以直接在项目目录运行。

## 已验证范围

以下均为**自动化断言、无头浏览器与 CDP 模拟**的证据，日期 **2026-11-14**；**不是真人试玩或手机真机结论**。

- 13 种视口（`1920×1080` 至 `320×568`，含 `932×430` / `844×390` 横屏）的布局断言与真实浏览器截图，逐格索引见截图索引文档。
- 原生鼠标 / 键盘输入验收；触屏输入为 **CDP 触屏模拟（非真机）**：短按、长按、拖动、多指、分组切换与工具执行。
- 六组同种子战役对照（v0.25 vs v0.26）结果逐值一致；Node VM 中两版各 **168 项钩子**断言；分夜账本 `收入 − 支出 = 期末 − 期初` 闭合。
- v0.25 旧 runner **178/178**、专项边界用例 **32/32** 通过。

**本轮在 Windows / Node 22.22.2 / Chrome 157 复跑**：UI 契约 `4/4`、模型两版各 `168/168`、专项 `32/32`、v0.25 旧 runner 全部通过，`pageErrors=[]`。

**已知（测试脚本问题，游戏本体回归通过）**：

- `run-v026-checks.cjs` 与 `v026-playthrough.cjs` 在该环境存在 **CDP 输入时序竞态**——点击后未等待即读取 DOM；补 `120ms` 等待后 13 视口与 6 局模拟均通过。这是脚本时序问题，不是游戏功能缺陷。
- `v026-playthrough.cjs` 出现 `FAIL` 时仍可能返回 `exit 0`，请以其输出的 `summary` 与 `tests/artifacts/v026/playthrough.json` 为准，不要只看退出码。

因此本轮结论表述为「**测试脚本已知问题，游戏本体回归通过**」；这不是整套脚本在该环境零告警通过的结论，请仍以各 runner 的输出为准。

## 本轮自然试玩结论（AI 经 UI 自然操作，真实游戏时钟，非真人试玩）

以下均为 **AI 通过可见 UI 逐步操作、等待游戏自身时钟** 完成的完整对局，证据级别 E1；**不是真人试玩结论**，也未使用内部跳时、预设状态或状态注入。

- **标准五夜（塔防守家）**：普通难度、A 城址，第 5 夜胜利，163 击杀，城堡 149/200，3 塔 2 民兵，逐日／逐夜账本全部闭合；首夜最危险（承伤 155、靠 2 次急修稳住），后靠金币急修与号令齐射守住。
- **第二套打法（塔先占入口格＋补墙＋领主主动接敌／撤退）**：同样第 5 夜胜利，163 击杀，城堡 120/160，3 塔 3 墙 2 民兵；领主终局 hp 65/120 证明真实参战；前 3 夜城堡零承伤、全局累计承伤 40／修复 0，**城堡承压明显低于纯塔防守家**。
- **提前召唤**：第 3 天起在战役面板开放，确认后第 3 夜首领战直接结算、提前通关胜利，91 击杀，城堡 158/180；召唤弹窗 6 条描述（无法取消／提前通关记录／放弃后续收益／首领战利品规则相同／完整生命入场）与行为逐条一致。
- **A／B 城址建城落位**：两处建城后领主均能实际移动（位移约 1 格、无「道路受阻」），v0.25 的城址占位修复在 v0.26 仍生效。
- **夜战清场不结束（QA-STALL-01，本轮新发现、待修复）**：城墙优先＋单塔组合会令夜战卡在「清场·残敌 N」不进入天亮（两次独立种子复现，clock 均超 260 秒）；改用「塔先占入口再补墙」可正常通关。该缺陷直接阻断五夜循环，修复方案待用户拍板，详见审计报告。

## 仍待验证

- **真人试玩**：首次游玩的玩家能否在无人提示下完成建城、开发一处材料来源并完成首夜布防；本轮所有操作者均为 AI。
- **手机真机**：触摸延迟、帧率、音效观感，以及密集战斗在小屏上能否看清命中；触屏证据仅为 CDP 模拟。
- **失败页归因**是否足以指导玩家下一局的决策；白天 `120 / 90` 秒与 7 次行动是否形成有效约束、主动入夜是否被滥用。
- **营地路线**：自然迷雾下未找到合法建营位（`canPlaceCamp` 要求目标格及周围 8 格全未占领），本轮三局 `camps=[]`；建营回本与风险仍待验证（见审计报告 D12）。
- **封印碎片减免**：S2／S4 均 `fragments=0`，首领均以完整生命入场，「封印碎片 −18% 首领生命」分支未实测。
- **严格同种子对照**：`makeGame()` 用 `Math.random()` 且无玩家可见种子输入，本轮各局种子不同，对比均为「同难度／同城址／不同地图」，不量化主导策略强度。

## 相关文档

- [v0.26 更新说明](Border-Guard-v0.26-更新说明.md)
- [v0.26 体验审查报告](Border-Guard-v0.26-体验审查报告.md)
- [v0.26 独立浏览器验收报告](Border-Guard-v0.26-独立浏览器验收报告.md)
- [13 视口截图索引](tests/artifacts/v026/SCREENSHOT_INDEX.md)
- [项目交接说明](PROJECT_HANDOFF.md)
- [v0.25 更新说明](Border-Guard-v0.25-更新说明.md)

`PROJECT_HANDOFF.md` 已在文件头补上 v0.30 当前状态；其下 v0.24 / v0.25 / v0.26 段落均为历史交接记录，不再作为当前入口。当前入口以本 README 与 [v0.30 交付报告](docs/v030-polish-report.md) 为准。
