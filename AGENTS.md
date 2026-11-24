# Border Guard｜AI 工程协作规范

## 当前工程阶段

当前模块化重构处于 Phase 1：只建立 ES Modules / Vite 构建骨架和单 HTML 输出验证。原版可玩游戏仍是根目录的 `Border-Guard-v0.60.html`。

在 Phase 2 依赖图和迁移设计完成前，不得开始批量迁移业务代码。

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

Phase 1 构建产物为 `release/Border-Guard-v0.60-modular-shell.html`，它是骨架验证页，不是游戏版本。

## 交付要求

每个阶段单独提交，报告文件清单、迁移映射、测试命令与真实结果、行为差异、未解决问题。未运行的验证必须标记为“未运行”。
