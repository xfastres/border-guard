# Border Guard｜AI 工程协作规范

## 当前工程阶段

当前 v0.60 阶段一模块化重构（Phase 0–7）已全部完成并验收：`src/legacy/game.js` 已彻底拆解并删除（`src/legacy/` 仅保留退役说明 `README.md`，0 个 `.js` 文件），全部源码已按单向分层组织为 90 个构建模块（`src/data/` → `src/core/` → `src/systems/` → `src/ui/` & `src/debug/` → `src/app/`）。根目录 `Border-Guard-v0.60.html` 作为冻结原版基线保持字节未变。

新静态数据放入 `src/data/`，状态容器/查询/纯函数放入 `src/core/`，业务规则按子域（`meta` / `equipment` / `economy` / `progression` / `hero` / `combat` / `run`）放入 `src/systems/` 并遵循 `createXxx(runtimeCtx, deps)` 工厂依赖注入，绘制/弹窗/HUD/输入/音频放入 `src/ui/`，调试预设与对外 API 放入 `src/debug/`，根装配与主循环放入 `src/app/`。禁止在 `src/legacy/` 新增任何代码。

## 不可违反

1. 未经明确授权，不修改玩法、战斗数值、掉落概率、经济、波次和玩家交互。
2. 不覆盖根目录原版 `Border-Guard-v0.60.html`。
3. 不修改 `balance/v060-baseline.json` 和嵌入式 BALANCE 生成区。
4. 不删除旧版本、测试、审查报告和 `tests/artifacts/` 证据。
5. 不将未执行的测试标记为通过。
6. 不一次性重写或搬迁全部代码。
7. 不为拆文件而引入 React、TypeScript、ECS 或大型状态管理框架。
8. 不新增第二份权威游戏状态。
9. 不在本次重构中改变 RNG 算法或调用顺序。

## 模块约定

- `data`：静态数据与配置（`balance.js`、`core-data.js`、`equipment-data.js`、`progression-data.js`、`destiny-data.js`）；不操作运行时状态，不访问浏览器全局。
- `core`：唯一权威状态容器（`runtime-context.js`）、对局状态工厂（`state.js`）、纯状态查询（`state-queries.js`）、RNG/数学/地形工具；不操作 DOM，不导入 `systems`/`ui`/`debug`/`app`。
- `systems`：游戏业务规则（`meta` / `equipment` / `economy` / `progression` / `hero` / `combat` / `run`）；通过 `runtimeCtx.ports` 反转 UI/音频/VFX/弹窗/存储/时钟副作用，不直接操作 DOM 或浏览器全局。
- `ui`：音频、VFX、提示反馈、Canvas 2D 渲染与相机、共享格式化、弹窗系统、零闪烁 HUD 协调器与输入监听；通过明确接口调用业务系统，禁止导入 `app`/`debug`/`legacy`。
- `debug`：调试预设与 `window.BG60` / `window.BG52` 公开测试 API，不进入正式玩法链路，禁止导入 `app`/`legacy`。
- `app`：顶层装配（`bootstrap.js` 含零 DOM 纯装配 `createGameSystems` 与浏览器入口 `bootBrowserGame`）和 RAF 主循环（`game-loop.js`）。

禁止循环依赖、隐式跨模块全局变量和巨型 common/utils 聚合文件。所有分层边界与零循环依赖由 `tests/unit/architecture-guard.test.mjs` 的 AST 门禁自动强制检查。

## 命令

- `npm run dev`：启动 Vite 开发服务器。
- `npm run build`：打包并校验离线单文件 HTML（`vite-plugin-singlefile` + `scripts/verify-single-file.mjs`）。
- `npm run preview`：预览构建结果。
- `npm run test:unit`：运行全部 ES 模块单元测试（含 AST 架构门禁）。
- `npm run test:integration`：运行零 DOM / 零浏览器纯 ES 模块 W1→W30 全链路与 BUG-01～BUG-10 集成测试。
- `npm run test:arch`：单独运行 AST 分层边界、零循环依赖、legacy 退役与冻结原版哈希门禁。
- `npm run test:parity`：真实 Chrome CDP 同种子（`2026` / `1337` / `9527`）原版 vs 模块版全量等价校验与双向 `localStorage` Meta 存档兼容校验。
- `npm run test:modular-game`：用 Chrome 通过 `file://` 检查单文件在桌面与手机视口离线启动。
- `npm run test:e2e:modular`：对模块化单文件交付产物运行 6 场景真实 Chrome 交互 E2E。
- `npm run test:baseline`：运行根目录原版 `Border-Guard-v0.60.html` 全部 43 项回归测试。
- `npm run test:all`：运行当前玩法门禁与冻结原版回归。`test:parity` 留作玩法重构前的历史等价校验。

正式单文件交付产物为 `release/Border-Guard-v0.60.html`（由 `npm run build` 生成，`.gitignore` 已忽略构建输出目录，根目录原版 `Border-Guard-v0.60.html` 保持冻结未变）。

## 交付要求

每个阶段单独提交，报告文件清单、迁移映射、测试命令与真实结果、行为差异、未解决问题。未运行的验证必须标记为“未运行”。
