# 《边境守卫》v0.26 独立浏览器验收报告

- 验收日期：2026-11-14
- 被测分支：`codex/border-guard-v0.26` @ `37684770a89117ac42e08d5f00e3440a79456665`（远端 SHA 经 GitHub API 核对一致）
- 本地工作分支：`acceptance/v0.26-browser-verify`（基线提交 `655d843` 由 codeload 快照重建，内容与远端提交逐字节一致，`Border-Guard-v0.26.html` SHA-256 = `5cc70b101dbd45c1561b93f07c48443d1903f8c734d244f6436da8ea57d0b616`）
- 对照版本：`Border-Guard-v0.25.html`（`main` @ `f4de3bf`）
- 浏览器：Google Chrome 144.0.7559.132（headless=new + CDP，Node 22 标准库）
- 结论：**浏览器链路已跑通，13 视口截图齐全；发现并修复 3 项缺陷，全套回归通过。**

> 关于上一轮"Chromium 启动阶段退出"：接手后复现为**环境问题 + 测试脚本参数缺陷**，不是游戏缺陷。详见 §2.1。

---

## 1. 修了什么

三处修复均遵守「先留复现步骤 → 最小改动 → 重跑对应场景与相关回归」。**五夜循环、资源、经济、伤害、成长数值一行未改**；v0.17–v0.25 全部历史 HTML 与历史会话逐字节未动（已用 SHA-256 核对）。

### 修复 1 · 浏览器验收脚本在容器/root 下无法启动（测试缺陷）

| 项 | 内容 |
|---|---|
| 复现 | `CHROME_BIN=/usr/bin/google-chrome node tests/run-v026-checks.cjs` → `Error: Chromium exited: Running as root without --no-sandbox is not supported`；与上一轮 `Chromium 156` 报的 `process_singleton_posix.cc:297 socket() failed: Operation not permitted` 同源 |
| 根因 | 脚本启动参数缺 `--no-sandbox`、`--disable-dev-shm-usage`；默认二进制为 Windows 路径 / `chromium`，未做 Linux 探测。以 root 运行时 Chrome 直接退出 |
| 改动 | `tests/run-v026-checks.cjs`：非 Windows 追加 `--no-sandbox --disable-dev-shm-usage`；默认二进制按 `/usr/bin/google-chrome` → `/usr/bin/chromium` → `chromium` 探测，仍支持 `CHROME_BIN` 覆盖 |
| 复测证据 | 参数矩阵诊断：`orig` → exitCode 1；`--no-sandbox` → CDP 端口 + HTTP 200。修复后 `run-v026-checks.cjs` 输出「13 个视口、两组原生输入和 6 局模拟已通过」 |

### 修复 2 · `320×568` 打开详情后棋盘被压到 123px（布局缺陷，P1）

| 项 | 内容 |
|---|---|
| 复现 | `320×568` 竖屏打开城堡详情 → `run-v026-checks.cjs` 断言失败 `320x568 地图过窄或过矮`；截图可见地图仅剩约 2 行格子，领主几乎被裁掉；`side` 占 193px、`deck` 98px、`board` 仅 123px（占屏 21.7%） |
| 根因 | `@media (max-width:600px)` 下 `.side { max-height:min(34dvh,280px) }` 在 568 高的矮屏仍占 `34dvh=193px`，加上固定顶栏/简报/命令栏，棋盘被挤到不可操作 |
| 改动 | `Border-Guard-v0.26.html` 新增 `@media (max-width:600px) and (max-height:620px) { .side { max-height:min(28dvh,168px); } }`。只收紧矮竖屏详情区上限，详情内容仍可纵向滚动；其它 12 个视口规则不变 |
| 复测证据 | `320×568`：`board` **123px → 157px**（≥145 质量门），`side` 193→159px，`heroError=0`（领主锚点无偏移）；修复前后截图 `inspector-320x568.png` 对比可见领主重新完整可见。13 视口断言全过 |

### 修复 3 · 详情面板内容溢出时无任何"下面还有内容"提示（提示缺陷，P1）

| 项 | 内容 |
|---|---|
| 复现 | `320×568` 打开战役简报 → 只能看到「战役简报 + 五夜进度」，军令「领主亲征 / 守住阵线 / 跳过」与待选强化全在滚动区外（`scrollHeight 534 / clientHeight 158`）；面板无 `title`、无视觉提示，而命令栏有「左右滑动查看全部命令」。玩家无法知道要往下滚才能找到入口 |
| 根因 | `markCommandOverflow()` 只检测命令栏/营地列表的**横向**溢出；详情面板 `#playSide` 的**纵向**溢出从未检测，触屏下滚动条也不可见 |
| 改动 | `Border-Guard-v0.26.html`：新增 `markSideOverflow()`，在 `syncSheet()` 末尾（内容渲染完成后）检测 `scrollHeight > clientHeight + 8`，设置 `can-scroll-y` class 与 `title`；CSS 增加底部渐隐阴影 + `.sheet-bar::after` 文案「↓ 下方还有内容」，用绝对定位不参与 flex 布局，不影响已验收的 HUD 尺寸 |
| 复测证据 | `320×568` / `390×844`：`can-scroll-y=true`、`title=向下滚动查看全部内容（军令、强化、战报）`、伪元素内容 `"↓ 下方还有内容"`；`1440×900`（无溢出）：`can-scroll-y=false`、提示 `none`。截图 `edge-11-320x568-scroll-hint.png` 显示文案位于标题与关闭按钮之间，无遮挡、无重叠。全套回归通过 |

### 明确未改的部分

- 未改任何核心规则、数值、五夜循环、经济账本、伤害与成长。
- 未删除或放宽任何既有断言；`v026-ui-contract.cjs`、`run-v026-model.cjs`、`run-v026-checks.cjs` 的原始断言全部保留，另新增两套独立验收脚本的断言（22 + 32 项）。
- 玩法层面的观察（首夜真实链路失守）只作为建议提出，见 §5，交用户决定。

---

## 2. 跑了什么

### 2.1 环境与启动排查（先查路径、日志、最小页面，再判定归属）

| 检查 | 结果 |
|---|---|
| Chrome 定位 | `/usr/bin/google-chrome`（144）、`/usr/bin/chromium` → 同一二进制；`~/.cache/ms-playwright/chromium-1208` 实际路径不存在 |
| 最小页面 | `--headless=new --no-sandbox --disable-dev-shm-usage --dump-dom` 正常输出 DOM；stderr 里的 dbus 报错为无害警告 |
| 参数矩阵 | `orig` → exitCode 1；`--no-sandbox` → CDP `HTTP 200`；`--no-sandbox --disable-dev-shm-usage` → `HTTP 200` + `DevTools listening` |
| 判定 | **环境（root 运行）+ 测试脚本参数**问题，非游戏问题。`tests/artifacts/v026-browser-status.json` 中上一轮 `status: blocked / viewportsExecuted: 0 / screenshotCount: 0` 已由本次覆盖 |
| 网络 | `git fetch` / `git ls-remote` 到 `github.com:443` 超时不可达；`codeload.github.com` tarball 与 GitHub MCP API 通道可用。故用 codeload 快照（提交 `3768477…`）重建工作树，SHA-256 校验与远端一致 |

### 2.2 命令与通过/失败数量

| # | 命令 | 通过 | 失败 |
|---|---|---|---|
| 1 | `node --test tests/v026-ui-contract.cjs` | **4 / 4** | 0 |
| 2 | `node tests/run-v026-model.cjs` | 两版各 168 项钩子 + 6 组战役 + 分夜账本闭合 | 0 |
| 3 | `CHROME_BIN=/usr/bin/google-chrome node tests/run-v026-checks.cjs` | **13 视口 + 2 组原生输入 + 6 局模拟**，6 个钩子 `42/42、52/52、31/31、30/30、12/12、1/1` | 0 |
| 4 | `CHROME_BIN=… node tests/v026-playthrough.cjs`（新增） | **22 / 22**（真实界面 19 步 + 加速夹具 3 步） | 0 |
| 5 | `CHROME_BIN=… node tests/v026-edge-cases.cjs`（新增） | **32 / 32**（真实界面 24 + 夹具 8） | 0 |

> 第 3 项在修复前**原样复现失败**（启动即退出、`320x568 地图过窄或过矮`），修复后全绿。第 4/5 项为本次新增，用于覆盖内置脚本未走到的完整玩家链路与易漏交互。

### 2.3 六组同种子战役对照（v0.25 vs v0.26，结果逐值一致）

| 种子 | 策略 | 结局 | 夜次 | 城堡耐久 | 击杀 | 账本 |
|---|---|---|---|---|---|---|
| 7 | tower | won | 5 | 136 | 163 | 闭合 |
| 42 | tower | won | 5 | 146 | 163 | 闭合 |
| 99 | tower | won | 5 | 160 | 163 | 闭合 |
| 42 | camp | won | 5 | 160 | 166 | 闭合 |
| 42 | lord | lost | 5 | 0 | 141 | 败局当夜不结账（原口径） |
| 42 | none | lost | 2 | 0 | 24 | 败局当夜不结账（原口径） |

浏览器内 6 局模拟结论与 Node VM 一致：**至少一局 won/5、末局 lost**，账本按原口径闭合。

### 2.4 原生输入覆盖范围

| 类别 | 覆盖内容 | 性质 |
|---|---|---|
| 鼠标 | 开局难度、前往/查看城址、确认建城、居民管理、战役、战报、关闭详情、点资源地、开发、选工具、点地建造 ×2、提前入夜、取消、急修、药剂、暂停/继续、菜单、重开确认、点地图关菜单 | **真实界面** |
| 键盘 | `Esc` 取消工具、空格在按钮上激活按钮、空格在地图上攻击 | **真实界面** |
| 触摸 | 短按移动、长按 420ms 查看、拖动平移、选工具点地、多指（第二根手指）、切分组、入夜；`Input.dispatchTouchEvent` 原生事件 | **CDP 触屏模拟，非真机** |
| 加速 | `tickCampaign` 快进（真实战斗逻辑）覆盖领主抵达/揭雾、入夜、首夜结算、天亮；`__simulateV023` 六组战役 | **夹具，已标注** |
| 预设状态 | 固定种子 42 + 建城 + 全揭雾 + 充分布防，用于天亮画面、夜战支援、胜败与重开 | **夹具，已标注** |
| 未执行 | **真人试玩、手机真机测试**（本环境无真机/真人，触屏仅为 CDP 模拟） | 如实标注未完成 |

### 2.5 玩家链路（真实界面，19 步）

开局弹窗 → 普通难度 → 前往 A → 揭雾 → 查看 A → 确认建城 → 开发引导 → 居民管理 → 夜袭预报（战役）→ 战报 → 关闭面板 → 点资源地 → 开发资源点 → 切回「建造」分组 → 箭塔 ×2 → Esc 取消工具 → 提前入夜（按钮原位变「取消入夜 3秒」）→ 自动攻击 → 首夜 → 结局。

关键反馈均有 toast + 战报 + 库存变化三重证据，例如：
- 建城：`城堡建在西岭台地，两名居民已在城内。领主已改道至城堡外侧。`（castle=false→true）
- 开发：`已开发采石场。正常产出将在天亮时结算。`（材料 30→28、行动 7→6）
- 建造：两次各扣 **4 金 / 10 材料 / 1 行动**，各建 1 座塔，**无重复扣费**
- 提前入夜：`准备完毕：3 秒后入夜…提醒（不强制阻止）：3 处领地资源未开发。`

---

## 3. 截图在哪里

目录：`tests/artifacts/v026/`，共 **95 张真实浏览器 PNG**。13 视口逐格索引见 **[`tests/artifacts/v026/SCREENSHOT_INDEX.md`](tests/artifacts/v026/SCREENSHOT_INDEX.md)**。

| 类别 | 数量 | 说明 |
|---|---|---|
| `baseline-day-<视口>.png` / `baseline-inspector-<视口>.png` | 13 + 13 | v0.25 同种子同状态对照 |
| `day-<视口>.png` / `inspector-<视口>.png` / `night-<视口>.png` | 13 × 3 | v0.26 白天 / 打开详情 / 进入夜战 |
| `support-<视口>.png` | 3 | `320×568`、`844×390`、`1740×900` 夜战支援 |
| `victory-1440x900.png` / `defeat-1440x900.png` | 2 | 胜败结算对照 |
| `play-00…12-*.png` | 14 | 玩家链路逐步截图（开局→天亮/结局） |
| `edge-01…11-*.png` | 11 | 专项：天亮、支援、暂停、战役、胜利演出、结算、`320×568` 长详情+工具、`844×390` 支援与结算、滚动提示修复后 |

**重点组合**
- `320×568` 打开长详情并选中工具：`edge-08-320x568-detail-tool.png` + `edge-11-320x568-scroll-hint.png`（修复后可见提示）；`inspector-320x568.png` 可见棋盘从 123px 恢复到 157px。
- `844×390` 夜战支援与结算：`edge-09-844x390-support.png`、`edge-10-844x390-settlement.png`、`support-844x390.png`。截图核对：急修 5 金币、药剂 4 金币、回到城堡按钮完整可读，无横滑才能找到的关键内容；结算卡 `inView=true`，「开始新一局 / 复盘 / 分夜」均可达。

**证据 JSON**：`browser.json`（13 视口测量 + 交互 + 6 局）、`playthrough.json`、`edge-cases.json`。

**缺口与原因（如实标注）**
- 上一轮 `v026-browser-status.json` 记录 `viewportsExecuted: 0 / screenshotCount: 0`：本轮已全部补齐，13 视口 × 5 张无缺失。
- 无固定种子下"真机触屏"截图：无真机设备，触屏为 CDP 模拟，已标注。
- 真人试玩：未执行，无截图。
- 主链路「打完首夜 → 查看天亮结果」：真实链路结局为**城堡失守**（`play-12-dawn.png`，`castleHp=0`，战报写明"城堡失守，本局结束"，与真实情况相符）；天亮正例由**明确标注的预设状态夹具**产出 `edge-01-dawn-day2.png`（`day=2 / castleHp=160 / kills=18`）。两者不混为一谈。

---

## 4. 我打开哪个文件试玩

| 项 | 值 |
|---|---|
| HTML 路径 | `/workspace/border-guard/Border-Guard-v0.26.html`（双击即可离线运行，无需服务器） |
| 分支 | `acceptance/v0.26-browser-verify`（从 `codex/border-guard-v0.26` 派生；基线内容对齐远端 `37684770a89117ac42e08d5f00e3440a79456665`） |
| 提交号 | 工作分支 HEAD（本交付的修复提交，`git rev-parse HEAD`；基线 `655d843`，远端被测提交 `37684770…`）。实际 SHA 见交付说明 |
| 对照 | `Border-Guard-v0.25.html`（未改动） |

**最值得亲自验证的一个场景**：`320×568`（或把浏览器窗口缩到最窄）打开「战役」详情，然后点「建造 / 经营」分组切换。
理由：这是本次唯一同时暴露「棋盘被挤到看不见领主」和「军令/强化入口埋在滚动区外」的组合；修复后应看到地图仍有约 157px 可操作空间、领主完整可见，面板顶部出现「↓ 下方还有内容」提示，且下滑能找到军令选项。这个组合自动化最难覆盖「玩家是否真的看得懂」，最需要真人一眼判断。

---

## 5. 玩法层面的证据与建议（不改，交用户决定）

- **首夜压力**：真实玩家链路只建 2 座塔（建在"第一个可建地块"，未必是有效守城位）+ 开自动攻击，第 1 夜 27.5 秒城堡失守；预设状态夹具下布防充分（4 塔、同种子 42）可 `day=2` 天亮、`kills=18`。二者差异说明**塔位选择**比"是否建塔"更关键，但当前脚本无真人换位操作，不能据此断言平衡有问题。建议：真人试玩时对比"随便建 2 塔"与"贴近西门建塔"的首夜体验。
- **失败原因可读性**：失守战报与 `castleHp=0` 一致，且提前入夜时给出"3 处领地资源未开发"提醒；可读性达标。
- **仍需真人/真机**：首个白天 120 秒是否够用、密集战斗在手机上能否看清命中、真机触摸延迟与音效观感——本轮只有自动化与 CDP 模拟证据，**不代表真人结论**。

## 6. 已知风险与缓解

| 风险 | 缓解 |
|---|---|
| 本地 git 协议不可达，提交对象无法从远端 fetch | 用 codeload tarball 重建，SHA-256 与远端快照逐字节一致；报告如实说明基线提交号与远端提交号不同但内容一致 |
| 触屏为 CDP 模拟，非真机 | 专项脚本标注为「CDP 触屏模拟」；真机与真人试玩明确列为未完成 |
| 新增提示在小屏可能遮挡 | 用 `position:absolute` + `pointer-events:none`，并在 `320/390/1440` 三视口验证 class 与伪元素；全套 13 视口布局断言、HUD 矩形断言仍通过 |
| 修复仅针对矮竖屏（≤620px 高） | 其余 12 个视口 CSS 规则未变，`browser.json` 中 13 视口 `intersection/deckIntersection/heroError/overflow` 全部通过 |
