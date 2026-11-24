# Legacy game runtime（已退役）

Phase 4.4 完成了过渡脚本 `game.js` 的模块化迁移并删除了该文件。本目录禁止再存放运行时 `.js` 文件。

- `src/app/bootstrap.js` 装配系统与浏览器端口，`src/app/game-loop.js` 负责主循环。
- `src/ui/input/input.js` 负责按键、指针和静态按钮监听。
- `src/debug/presets.js` 提供调试预设，`src/debug/test-api.js` 提供 `window.BG60` / `window.BG52` 兼容接口。
