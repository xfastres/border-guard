# v0.20 地图相机跟随

打开同目录 `Border-Guard-v0.20.html` 即可离线试玩。v0.19 原件未改，SHA256 仍是 `1CEA1572D91B426B82522DD45EA688B2A3B3C2D7A4C285FDF3B6F49D36DCC8D1`。

## 改了什么

地图平移从 `#board` 滚动改成 `#mapWorld` 的 `translate3d`。电脑和手机共用这一套相机。标题、资源 HUD、战报、右下目标、建造栏和底部抽屉仍是原来的屏幕定位，没有放进世界层。

跟随锚点是地图可视安全区的中心：扣除顶部标题和资源条、底部命令栏或手机 dock，不拿左下战报和右下目标卡去挤地图。领主贴边时仍对准这个中心，棋盘底色可以露出来。没有缩放、惯性和镜头震动。

`game.hero.x/y` 已是连续格坐标，相机直接用 `hero * CELL`，不再加半格。地图外的点击返回空，不再被钳到边缘格。

## 变更函数

- 新增：`measureCameraViewport`、`worldToScreen`、`screenToWorld`、`screenToGrid`、`setCameraMode`、`panCameraBy`、`updateCamera`、`resizeCamera`
- 替换：`centerOnHero`、`followHero`；删除只服务手机滚动的 `heroViewport`
- 接入：`tileFromPointer`、`screenRectOfTile`、`bindMapGestures`、战后拖图、滚轮、定位领主、回城、`newRun`、暂停和说明弹窗
- 建造、扣费、寻路和战斗函数没有改

按下时先暂停自动跟随；超过 10px 才进入手动浏览，松手不弹回。新的 WASD、短按移动、回城或定位领主恢复跟随。长按打开的抽屉期间不追镜头，关闭后保留按下前的手动或跟随状态。

## 验证

执行 `node tests/run-v020-checks.cjs`。本机 Chrome，无新增依赖。

- 玩法 20/20，手势 10/10，原生触屏/鼠标/WASD 6/6。
- 五个视口布局各 6/6。相机各 8/8，另加 DPR 2 的往返 1/1。
- 正常预算五夜通关：城堡 160，击退 26，库存 39/2/10，分夜账目闭合。
- 胜利布局与战后只读点击通过；战后拖图改变的是世界层，结算卡不动。
- 源码里不再有非零的 `scrollLeft/scrollTop` 平移写入。

领主渲染锚点到安全中心的误差，五个视口的静止、直线、对角线、点击寻路、四边四角和小地图都是 0 CSS px。1440×900 的锚点是 (720, 500.5)。拖图和移动后，标题、资源条、战报、右下目标的 x/y/w/h 变化都是 0。20 个随机地块在平移后 world→screen→grid 仍回到原格。DPR 2 时 CSS 坐标不重复乘设备像素比。

## 截图

- `tests/artifacts/v020-1440x900.png`：跟随，领主在安全中心
- `tests/artifacts/v020-1440x900-pan.png`：地图平移，HUD 仍在原位
- `tests/artifacts/v020-1440x900-corner.png`：领主在地图角落仍居中，左上露出底色
- `tests/artifacts/v020-1920x1080.png`、`v020-844x390.png`、`v020-932x430.png`、`v020-390x844.png`
- 结算：`v020-victory-1440x900.png`、`v020-victory-844x390.png`、`v020-victory-390x844.png`
- 机器可读结果：`tests/artifacts/v020-verification.json`

## 限制

测量来自 Chrome 视口模拟，没有在真机上试过。角色精灵画在锚点上方，身体会比数学中心略高；验收比的是渲染锚点，不是精灵外接矩形。电脑上的地点面板本来就是右侧固定浮层，这轮只改了地块屏幕矩形的换算，没有把它改成跟着格子跑。

## 验收回修

只改了三项。屏幕 HUD 的布局规则和建造扣费没有动。

- 胜利时，窗口 `resize` 继续调用原来的 `clampVictoryCard`。1440×900 的结算卡自然缩到 390×844 后仍在视口内；手动拖到 left 1022 再缩窗，也会被拉回。
- 地图平移改由 `#board` 接收，canvas 上的事件冒泡进来，不另挂一套监听。露出的底色可以拖图；短按底色不移动、不选格、不建造。战后也能从棋盘背景起手拖图。
- `sx/sy` 改用 canvas 的实际浮点显示宽高。390×844 上显示宽度 1350.390625、`offsetWidth` 1350 时，第 20 列右边界内 0.05 CSS px 仍是 (20,5)。

`node tests/run-v020-checks.cjs` 已通过，原有玩法、手势、布局、相机和五夜账目都在，并包含这三项。`node tests/run-v020-boundaries.cjs` 同样通过，结果在 `tests/artifacts/v020-boundary-checks.json`。
