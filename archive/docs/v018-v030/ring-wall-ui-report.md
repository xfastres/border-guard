# 整圈城墙与参考图 UI 报告

**分支:** `codex/fix-resident-workplaces`
**基线:** `6f09d54`
**范围:** 居民岗位 + 整圈城墙 + 参考图风格 UI（含返修与审查收尾）。

## 默认值

| 项 | 值 |
|---|---|
| 主城耐久 | **50 / 50** |
| 主城圈墙 | **600 / 600** 共享 HP |
| 白天修满 | 按缺血比例，满额 12 材料，最少 1，不耗行动 |
| 夜间抢修 | 6 材料、持续 6 秒、每圈每夜一次；破墙中断 |
| 资源栏 | 金币 / **材料** / 粮食（不伪造木材·石料分栏） |

## 本轮收尾要点

- `recallHomeResident`：先验回城路径，再清岗进入 `returning`，按 `dispatchSpeed` 碰撞移动；无路保留岗位。
- `salvage` / 生产移除：清 `node.developed`，`forecastIncome` 只认有效生产实体；拆除后 0 收入可重建。
- 点墙边选圈开维修详情（工具/居民移动优先）；夜修 detail 先进度后 used；`castleVital`/`wallVital` 持续刷新。
- 小地图画真实 `wallRings`/城门/破圈与 `fronts` 入口；底栏追加农场/林场/采石/矿场入口（点对应资源，不凭空产）。
- 作业工人按建筑入口层绘制并带「作」标识；建城触发首组三选一；SVG 轮廓图标；镜头 cover×1.12 且避开左轨。
- 卡牌/关详情：**禁止** evaluate 回退冒充成功；触屏为 Chrome Emulation。

## 命令与结果（最终实测）

```text
node --test tests/v029-workplaces.test.cjs tests/v029-rings.test.cjs tests/v029-ui.test.cjs
→ 29/29 pass

node tests/v027-balance.cjs → （交付时复跑）
node tests/v028-priority.cjs → （交付时复跑）

# Codex 独立（勿把绝对路径写入仓库）
workplaces-independent.cjs → 7/7
rings-independent.cjs → 7/7
ring-ui-independent-browser.cjs → 四视口 fills / 三卡并排 / 真实点选

node tests/v029-rings-ui-browser.cjs
→ 四视口 + 真实点击卡牌/关详情 + 战斗夹具 OK
```

## 战斗夹具实测（破墙后至主城失守）

| 字段 | 值 |
|---|---|
| seed | 42 |
| 敌人 | 12 × normal |
| 墙起始 | 80 HP（完整圈几何） |
| 主城起始 | **50 HP** |
| 布防 | 无塔 |
| 模式 | 真实 `moveEnemy` 循环，dt=0.05 |
| 破墙后→失守 | **约 2.55 秒** |

说明：用户本意是「破墙后很快失守」；**不为硬凑 5–10 秒增加未验证机制**。50HP 主城保留。未伪造倒塌时间，未传送敌人。

## 截图

目录：`tests/artifacts/v029-rings-ui/`

- `day-*` / `castle-*`：1440×900、1920×1080、932×430、390×844（**7/7 行动**，真实城址）
- `cards-1440x900.png` / `cards-390x844.png`：三卡并排真实点选
- `desktop-work-inside-building.png`：工人作业层可见
- `combat-after-collapse.png` / `touch-closed-panel.png`
- `browser.json`（元数据写明：状态夹具 evaluate；卡牌/关详情 CDP 真实点选，无回退）

## 剩余限制

- 营地独立围墙圈未全面产品化（主城圈已闭环）。
- 材料未拆 wood/stone。
- 图标为内联 SVG 轮廓，非精细插画/3D。
- 图例与小地图默认折叠，可按需展开；窄屏开详情时左轨隐藏并改底部 sheet。

## HUD 遮挡返修

**原因：** 选址底栏固定 960px 宽、左图例+小地图默认全开，手机开详情时 sheet 与命令栏重叠，镜头安全点落在 `sheetHandle` 上。

**改动：** 图例/小地图紧凑默认折叠；选址底栏 `max-content` 保证两个按钮完整显示；`--hud-bottom` / `--sheet-max` 避免底栏与详情重叠；`measureCameraViewport` 根据实际面板位置避开顶/底/左右面板，折叠与详情变化后更新；命令栏透明容器不拦截地图点击。

**命令：**

```text
node --test tests/v029-workplaces.test.cjs tests/v029-rings.test.cjs tests/v029-ui.test.cjs tests/v027-balance.cjs tests/v028-priority.cjs
→ 46/46 pass

node tests/v029-hud-occlusion-browser.cjs
→ 六视口选址/详情 + 三卡真实点击 + 地图点击 OK
```

**截图：** `tests/artifacts/v029-hud-occlusion/`（`site-*` / `details-*` / `cards-*` / `expanded-rail-1440x900.png` / `map-click-1440x900.png` / `browser.json`）

实测摘要（修复后）：选址底栏宽约 277–289（桌面旧 960）；390×844 详情 `focusClear=true`、与底栏重叠 0px、free≈0.473（旧 free≈0.385 且 focusClear=false）。Codex 最终独立浏览器检查六种视口的焦点、面板重叠和 A/B 按钮完整可见性全部通过，最终 Node 测试为 46/46。

## Codex 独立最终复核

产品提交 `0d19325` 之后，Codex 独立运行：

- `node --test tests/v029-workplaces.test.cjs tests/v029-rings.test.cjs tests/v029-ui.test.cjs tests/v027-balance.cjs tests/v028-priority.cjs`：**45/45 通过**（本轮 29、历史 16；HUD 返修后为 **46/46**）。
- 独立居民检查 **7/7**：真实到岗、调回按钮、返程全程速度及碰撞、失败改派保留岗位、拆除停产/重建、跨营地派驻释放旧岗。
- 独立圈墙检查 **7/7**：闭合外框、城门权限、移除逐段放置、致命伤优先、真实刷兵敌方标记、点墙开详情、HUD 持续显示圈/主城耐久。
- `node tests/v029-workplaces-browser.cjs`：实际鼠标与 Chrome 触屏模拟的派遣、移动、改派通过。
- `node tests/v029-rings-ui-browser.cjs`：四视口及真实卡牌/详情操作、圈墙战斗夹具通过。
- `node tests/v029-hud-occlusion-browser.cjs`：1108×1195 / 886×956 / 1108×720 / 1440×900 / 932×430 / 390×844 遮挡回归通过。
- 额外独立浏览器回放：1440×900、1920×1080、932×430、390×844 均无页面横向溢出，地图覆盖视口，三卡同排且实际可选择；小地图图像随整圈倒塌及真实进攻方向变化而变化。

本轮为 Chrome 自动化及受控状态夹具，未冒称真人或手机真机试玩。已人工查看实际输出的主城、工人作业和窄屏截图。
