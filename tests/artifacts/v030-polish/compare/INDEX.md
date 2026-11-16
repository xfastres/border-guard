# v0.30 前后对比截图索引（§4.4）

> 旧图来源：`D:/Work/game/bg-scratch/before/`（仓库外，改造前 v0.29 基线，**不入库**）与
> `tests/artifacts/v029-hud-occlusion/cards-1440x900.png`（v0.29 时代卡牌证据）。
> 新图来源：当前分支 `Border-Guard-v0.29.html` 实拍。PNG 按仓库惯例留本地、不入库，本文档入库作索引。

| 组 | 改造前 | 改造后 | 拼接 | 看什么 |
|---|---|---|---|---|
| 开局 | `start-before.png` | `start-after.png` | — | 昏暗墨绿 → 明亮嫩绿卡通草地 / 亮蓝水面 / 金边玻璃顶栏；`start-after` 来自自然试玩 `v030-wp5/01-day1-start.png`，与旧图同为「选完普通难度后的第 1 天开局」，状态可比 |
| 白天（桌面 1440×900） | `desktop-day-before.png` | `desktop-day-after.png` | `desktop-day-compare.png` | 建筑 2.5D 侧面 + 黑褐描边、生产建筑轮廓区分、顶栏资源 delta |
| 夜战（桌面 1440×900） | `desktop-night-before.png` | `desktop-night-after.png` | `desktop-night-compare.png` | 冷蓝暗幕 + 主城 / 领主 / 箭塔暖色光孔；WP4 后入夜前 1.5 秒为渐变而非阶跃 |
| 卡牌 | `cards-before.png` | `cards-after.png` | — | 朴素深色方块 → 金边玻璃风 + 插画圆 + 三色卡面 + 「选择一项强化」标题；`cards-after` 来自自然试玩 `v030-wp5/03-growth-cards.png` |
| 白天（手机 390×844） | `mobile-day-before.png` | `mobile-day-after.png` | `mobile-day-compare.png` | 顶栏单行图标 + 数字、底栏 4 个命令一屏完整、无横滚 |
| 夜战（手机 390×844） | `mobile-night-before.png` | `mobile-night-after.png` | `mobile-night-compare.png` | 夜战 3 个战斗命令横排、暗幕下 HUD 仍可读 |

补充：`tests/artifacts/v030-polish/viewports/` 有七视口 28 张结构化取证（含 932×430 横屏与 390×844 触控），
`tests/artifacts/v030-wp4/transition-1..6.png` 是 WP4 昼夜过渡六连帧，
`before-transition-1..6.png` 为改造前同间隔对照（亮度恒定 59.3 vs 93.9→59.4）。
