# 模块化重构执行记录｜Phase 2.1

更新日期：2026-11-24

## 目标

将原版 v0.60 的 HTML 页面、CSS 和 JavaScript 从一个 HTML 文件中分离，保持游戏行为不变，为后续业务模块迁移建立可构建、可测试的过渡版本。

## 变更

- 原版 HTML：保留在根目录，不覆盖。
- 页面结构：迁入 `index.html`，DOM 结构从原版复制，替换样式和脚本入口。
- CSS：迁入 `src/ui/styles/game.css`。
- 游戏脚本：迁入 `src/legacy/game.js`，保留原 IIFE 和函数实现。
- 数值：`src/data/balance.js` 从 `balance/v060-baseline.json` 直接 import；不再在 legacy 模块中复制一份 JSON。
- 入口：`src/main.js` 加载样式和 legacy 游戏模块，并验证 `window.BG60` 初始化。
- 构建：输出 `release/Border-Guard-v0.60-modular-preview.html`。

## 边界

这一步完成了 HTML / CSS / JS 文件分离，但 **尚未完成 314 个函数的业务模块拆分**。目前 `src/legacy/game.js` 仍然是单个大型运行时文件。它是迁移桥接层，不是最终架构。

## 验收

- [ ] Vite 单文件构建通过。
- [ ] 桌面和手机 Chrome `file://` 启动通过。
- [ ] 原版 6 场景 Chrome E2E 在模块化构建上通过。
- [ ] 原版 43 个基线测试继续通过。
- [ ] 确认根目录原版 HTML 与 balance JSON 未被修改。
