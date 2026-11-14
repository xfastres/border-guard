# 居民岗位 / 资源建筑修复报告

**分支:** `codex/fix-resident-workplaces`  
**基线:** 本地 `6f09d54`（非旧临时工作树 `ec866f0`）  
**范围:** 居民到岗与移动、资源通行、开发清 cover、四类生产建筑专属绘制。不含整圈城墙重构。

## 根因

1. **到岗失败:** `assignWorker` / `stepWorker` 已存在，但 `updateResidents` 对 `home` 居民直接插值回 `residentAnchor`（主城两旁），从未调用 `stepWorker`。
2. **开发残留:** `develop` 只设 `node.developed=true`，不清 `cover`、不建生产实体、不注册 `productionBuildings` / docks。
3. **详情缺控制:** 居民 `inspect` 分支只写文本即 `return`，无移动 / 调回 / 改派；地图点选优先建筑/资源，难选中在岗居民。
4. **绘制串台:** 开发后仍走 `nodeArt` / `drawFoliage`，`structure` 非 castle/wall 一律箭塔兜底。

## 实际修复

- `updateResidents`：手动 `order` → `stepWorker` → 主城闲置；`postedAt` 保持移动后落点。
- `develop`：原子扣费、清 cover、建 `farm/lumber/quarry/mine`、注册 dock；保留 `node.kind`。
- 居民详情与生产建筑详情接通派遣 / 移动 / 调回 / 改派；`mapClick` 优先点选居民；触屏长按传入精确坐标。
- `structure` 四类独立绘制；开发格跳过旧资源图标与树石 foliage。
- `makeGame` 初始化 `productionBuildings` / `dockReservations`；拆除释放预约。

## 命令与结果

```text
# 红（实施前）
node --test tests/v029-workplaces.test.cjs
→ 3/3 fail（到岗 / cover / 移动入口）

# 绿（实施后）
node --test tests/v029-workplaces.test.cjs
→ 6/6 pass（保留原三断言，并扩展移动改派、六资源通行与绘制、拆除释岗）

node tests/v027-balance.cjs → 10/10 pass
node tests/v028-priority.cjs → 6/6 pass

node tests/v029-workplaces-browser.cjs
→ desktop 1440×900 + touch 390×844 OK
```

## 截图

目录：`tests/artifacts/v029-workplaces/`

| 文件 | 内容 |
|---|---|
| `desktop-lumber-worker.png` | 林场到岗 |
| `desktop-resident-moved.png` | 工作中移动后停留 |
| `desktop-four-buildings.png` | 四类生产建筑 |
| `desktop-farm-lumber-workers.png` | 农场/林场与人物 |
| `touch-four-buildings.png` | 触屏视口四建筑 |
| `browser.json` | 断言与说明 |

说明：夹具用 evaluate 布置城与资源；开发/派遣/移动/改派走 CDP 真实鼠标或触屏。触屏为 Chrome Emulation，不是手机真机。

## 剩余限制

- 工作秒数已累计，但天亮经济仍走旧 `node.developed` 结算，未接完整工时产出重构。
- 资源仍为 `material` 合账，未拆 wood/stone。
- 整圈墙 / 共享墙血 / 扩地迁塔不在本次范围。
- 部分 headless 触控不合成 pointer 长按；验收对选中/点地图有鼠标 Input 回退，产品代码已支持触屏长按带坐标选居民。
