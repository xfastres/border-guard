# Border Guard｜AI 工程协作规范

## 当前工程阶段

当前模块化重构已完成 Phase 0–1，并进入 Phase 2.1：原版 HTML、CSS、JavaScript 已拆为独立入口、样式文件和 legacy 运行时模块。`src/legacy/game.js` 暂时仍是完整旧 IIFE，不代表业务模块化已完成。原版可玩基线仍是根目录的 `Border-Guard-v0.60.html`。

下一步按 `docs/architecture/v060-dependency-audit.md` 先迁移静态数据和 Core 边界，再迁移业务系统。禁止一次性批量拆分 314 个函数。

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

- `core`：状态、时间、随机数、数学工具；不操作 DOM。
- `data`：静态数据；不操作运行时状态。
- `systems`：游戏规则；不直接操作 DOM。
- `ui`：绘制、输入和显示；通过明确接口调用业务系统。
- `app`：依赖组装、初始化和主循环。
- `debug`：测试接口与调试预设，不进入正式玩法链路。

禁止循环依赖、隐式跨模块全局变量和巨型 common/utils 聚合文件。

当前原始脚本依赖共享词法作用域。迁移前必须绘制状态读写、函数调用、DOM 副作用和 RNG 调用依赖图，明确 context / state ownership / composition 方案。

## 命令

- `npm run dev`：开发服务器。
- `npm run build`：构建并验证单文件 HTML。
- `npm run preview`：预览构建结果。

当前构建产物为 `release/Border-Guard-v0.60-modular-preview.html`，它是从原版迁移出来的可玩预览；业务代码仍处于 legacy 模块，不能宣称最终模块化完成。

## 交付要求

每个阶段单独提交，报告文件清单、迁移映射、测试命令与真实结果、行为差异、未解决问题。未运行的验证必须标记为“未运行”。
