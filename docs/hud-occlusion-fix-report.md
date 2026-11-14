# HUD 遮挡返修报告

**分支:** `codex/fix-resident-workplaces`
**基线 HEAD:** `2ceb1d6`（本轮未提交）
**范围:** HUD 遮挡、响应式布局及选址按钮裁切修复。

## 修改原因

固定宽底栏和默认展开的图例、小地图遮住视野；详情底边未随命令栏高度变化，产生重叠。镜头安全区未完整计入可见面板。

1. **932×430 触屏横屏：** CSS 仅在 `max-width:600` 把详情改成底部 sheet；横屏仍是右侧栏。原先 `measureCameraViewport` 用 `MOBILE()` 误判为底部，把 `safeY` 抬到顶栏附近，主城上半被提示条挡住。
2. **390 折叠轨：** `.rail-head` 同时放标题和按钮，窄宽下汉字竖排；折叠后 `legendH≈96` / `minimapH≈76` 仍偏高。

## 改动要点

- 详情对接边按**实际矩形**判断：宽铺且靠底 → 底部 inset；否则 → 右侧 inset。不再按输入设备。
- 折叠态只留一个紧凑按钮（隐藏重复 `h3`），`white-space:nowrap`，最小可点高度 44；展开后显示标题+完整列表/小地图，面板有足够横排宽度。
- `layoutHudChrome` 的 `--sheet-max` 仅在 `innerWidth<=600` 生效，避免影响横屏右侧详情。

## 命令与结果

```text
node --test tests/v029-workplaces.test.cjs tests/v029-rings.test.cjs tests/v029-ui.test.cjs tests/v027-balance.cjs tests/v028-priority.cjs
→ 46/46 pass

node tests/v029-hud-occlusion-browser.cjs
→ OK
```

浏览器验收含：六视口选址/详情、932 右侧 inset + 底部仅底栏、焦点在剩余空隙中心、390 折叠不竖排与真实触控展开/折叠、三卡与地图点击；详情 `free>=0.45`（矮横屏 `>=0.48`）未降门槛。

## 证据截图

目录：`tests/artifacts/v029-hud-occlusion/`

| 文件 | 说明 |
|---|---|
| `site-390x844.png` / `rail-touch-390x844.png` | 折叠单按钮横排；触控展开后再折叠 |
| `details-932x430.png` | 横屏右侧详情，焦点不再贴顶 |
| `site-*` / `details-*` | 六视口对照 |
| `expanded-rail-1440x900.png` | 展开后完整列表 |
| `cards-*` / `map-click-1440x900.png` | 三卡与地图真实点击 |
| `browser.json` | 度量与断言元数据 |

最终实测：选址底栏宽约 277–289；390 详情 `free≈0.473`、`focusClear=true`、重叠 0；932 详情 `sideDock=right`、底部 inset 仅底栏。比例来自测试网格采样。

## 选址底栏裁切补丁

**红测：** 390×844 `deck-compact` 宽仅 195，A 完整、B 只露「查看」。根因 `position:absolute; left:50%` 下 `width:fit-content` 按右半视口 shrink-to-fit。

**修复：** `.command-deck.deck-compact { width:max-content; }`（保留既有 `max-width`）。浏览器回归断言 A/B 完整 rect 均在 `#commandBar` 内且中心命中，并真实点击 A、B。

```text
node tests/v029-hud-occlusion-browser.cjs → OK
```

## Codex 独立验收

独立 Chrome 回归先在旧版捕捉详情与底栏重叠；复核时另捕捉 390 选址 B 按钮被裁切，均交由 Cursor 修复。最终 1108×1195、886×956、1108×720、1440×900、932×430、390×844 的相同独立检查全部通过。已查看最终桌面、手机选址和横屏详情截图；Node 最终复测 46/46。

浏览器测试使用状态夹具及真实鼠标/模拟触控输入，未进行手机真机验收。
