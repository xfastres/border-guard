# WP3 · QA harness 与复拍方案（预研，未执行）

> 文档类型：**执行前规划 / 判据清单**，不含任何实测截图或测试结论。
> 编写：quality-lead（严守真） · 任务 WP3-QA-01 · 团队 `border-guard-v030-polish`
> 基线：主理人已拍板默认 **P1=删 7px 等级字、P3=等比压缩先试、P7=①b′ 晚绘 pass**，书面授权已发 engineering-lead；实现尚未落定。
> 本轮边界：**未启动 Chrome、未截图、未跑 `node --test`、未做 git 写操作、未覆盖任何 `v029-*` 旧证据**。唯一的写操作是新建本文件。
> 输出：`tests/artifacts/v030-polish/viewports/`（7 视口截图 + `measurements.jsonl`）、`tests/artifacts/v030-wp3-reshoot/`（§3.6 复拍帧），均未提交。

---

## 0. 环境事实核对与两处口径冲突（需主理人/同伴确认，本计划不擅自改他文档）

### 0.1 `bg-scratch/` **并非空目录**（与派单描述不同）

只读 `ls -la D:/Work/game/bg-scratch` 实测：

| 存在 | 路径 |
|---|---|
| ✅ | `cdp.cjs`（9128 B，含 `open / size / evalfile / eval / click / clicksel / clicktext / tile / tiletap / tap / key / wait / zoom / shot` **及 `move x y`** 分支 L67）、`cdp.cjs.bak`（8853 B） |
| ✅ | `fx/day-scene.js`、`fx/night.js`、`fx/perf.js`、`fx/scale-scene.js`、`fx/wall-*.js`、`fx/wp2-s5.js` |
| ✅ | `before/`、`after/`、`after1/`、`compare.html`、`compare-wall.html`、`profile*/` |
| ❌ | **`scenes.sh` 确实不存在**（与派单描述一致）；仓库根目录也无 `scenes.sh` / `cdp.cjs` |

**结论**：不需要从零重写 CDP 驱动。**首选复用 `D:/Work/game/bg-scratch/cdp.cjs`**（已具备 `open W H [touch]`、`size`、`eval`、`evalfile`、`shot`、`zoom`、`move`，且 `open` 每次新建 tab 关旧页、规避 `beforeunload` 卡死），只新增一个 `bg-scratch/scenes.sh` 循环脚本与少量 `fx/wp3-*.js` 夹具。备选方案 A.2 为独立 Node harness（三条 runner 的 spawn+WebSocket 模板）。本计划不创建任何脚本，只给出设计。

### 0.2 ⚠️ 基线口径冲突：61 与 77，以及 per-file 数字

- 只读静态统计 `grep -c '^test('`：**当前仓库只有 6 个 `*.test.cjs`**，计数为 `v029-workplaces 10 / v029-rings 10 / v029-ui 10 / v030-flow 2 / v030-lighting-capability 5 / v030-wp2 24` = **61**，与派单给出的**总数 61 一致**。
- 但派单的逐文件数字写作 `11 / 20 / 11 / 2 / 5 / 26`，**合计 75，与 61 不符**，也与静态计数不符。按静态计数执行时应以 `10/10/10/2/5/24=61` 为准，请主理人核对笔误来源。
- **77 的来历**：此前把 `tests/v027-balance.cjs`（10 项）与 `tests/v028-priority.cjs`（6 项）计入，二者**文件名不是 `.test.cjs`**，且默认读 `Border-Guard-v0.27.html` / `v0.28.html`（`BORDER_HTML` 可覆盖），属旧构建回归；交接计划 §4.1 命令仍列着这两个文件，这是 48 → 77 的由来。
- **本计划按主理人现行指令执行**：WP3 最终全量门槛 **`# pass ≥ 61 + 新增测试数`**（新增测试为 engineering-lead 的 `tests/v030-wp3-badge-order.test.cjs`，约 3 项），`# fail 0` / `# skipped 0` / `# todo 0`，**不得按 77 设，不得删/放宽断言**。
- **需主理人处理的文档冲突**：`wp2-acceptance-plan.md`、`wp2-ux-spec.md`、`wp3-visual-spec.md` 三份文档当前仍写「8 文件 77/77 / `≥ 77 + 新增`」。本轮按 Output Path 边界**不修改它们**；请主理人裁定是否统一改为 61 口径，或授权后续单开修订任务。在裁定前，WP3 执行报告以本计划的 **61 + 新增** 为准，并显式注明三份旧文档数字作废。

### 0.3 实现依赖（本计划只预研，不代跑）

P7 ①b′（晚绘 pass，插在 `drawSelection()` 之后、`drawLighting()` 之前，须 `t.visible` 守卫）、P1（删 7px 等级字）、P3（390×844 三卡等比压缩）由 engineering-lead 实现；**实现提交回传前不得执行本计划的截图**，否则会拍到中间态而作废。

---

## 1. 7 视口 × 4 场景 harness 设计

### 1.1 方案 A（首选）：复用 `cdp.cjs` + 新建 `scenes.sh`

- 驱动：`D:/Work/game/bg-scratch/cdp.cjs`，命令链以 ` ;; ` 分隔、参数整体加双引号。
- 新增（仓库外，执行阶段才写）：`D:/Work/game/bg-scratch/scenes.sh`，伪代码：
  ```sh
  OUT=D:/Work/game/border-guard/tests/artifacts/v030-polish/viewports
  mkdir -p "$OUT"
  for spec in "1440 900 0" "1920 1080 0" "1108 1195 0" "886 956 0" "1108 720 0" "932 430 1" "390 844 1"; do
    set -- $spec; W=$1; H=$2; T=$3; SUFFIX="${W}x${H}"; [ "$T" = 1 ] && SUFFIX="${SUFFIX}-touch"
    MODE=""; [ "$T" = 1 ] && MODE="touch"
    # 1) 开局（site fixture）
    node cdp.cjs "open $W $H $MODE ;; evalfile D:/Work/game/bg-scratch/fx/wp3-site.js ;; wait 400 ;; eval <MEASURE_SITE> ;; shot $OUT/site-$SUFFIX.png"
    # 2) 白天（既有 day-scene fixture）
    node cdp.cjs "open $W $H $MODE ;; evalfile D:/Work/game/bg-scratch/fx/day-scene.js ;; wait 400 ;; eval <MEASURE_DAY> ;; shot $OUT/day-$SUFFIX.png"
    # 3) 夜战（既有 day-scene + night fixture）
    node cdp.cjs "open $W $H $MODE ;; evalfile D:/Work/game/bg-scratch/fx/day-scene.js ;; wait 300 ;; evalfile D:/Work/game/bg-scratch/fx/night.js ;; wait 900 ;; eval <MEASURE_NIGHT> ;; shot $OUT/night-$SUFFIX.png"
    # 4) 卡牌（card fixture + 动画等待）
    node cdp.cjs "open $W $H $MODE ;; evalfile D:/Work/game/bg-scratch/fx/wp3-cards.js ;; wait 700 ;; eval <MEASURE_CARDS> ;; shot $OUT/cards-$SUFFIX.png"
    node cdp.cjs "size $W $H $MODE ;; evalfile D:/Work/game/bg-scratch/fx/wp3-cards.js ;; wait 700 ;; shot $OUT/cards-$SUFFIX-reduced.png"  # 见 1.4
  done
  ```
  - `<MEASURE_*>` 是 1.5 节表达式，输出为 JSON；由 `scenes.sh` 追加写入 `tests/artifacts/v030-polish/viewports/measurements.jsonl`（每行：`{viewport,scene,json,fixture:true,label:"状态夹具，非自然流程证据",ts}`）。
  - 每次 `open` 都是新 tab（含 `Emulation.setDeviceMetricsOverride {width,height,deviceScaleFactor:1,mobile:touch}` 与 `setTouchEmulationEnabled {enabled:touch,maxTouchPoints:touch?5:1}`，见 `cdp.cjs` L37），**无需手动调 CDP**；`wait 400` 对齐切换视口后的稳定时间。
  - `shot` 传绝对路径（cdp.cjs L122–125 会自动建目录）。

### 1.2 方案 B（备选）：独立 Node harness（三条 runner 模板）

若需**一次 Chrome 进程跑完 28 张**（减少启动开销、统一捕获 `pageErrors`），新建 `bg-scratch/wp3-viewports.cjs`，照抄 `tests/v029-hud-occlusion-browser.cjs` L6–L125：

| 步骤 | runner 模板位置 | 要点 |
|---|---|---|
| spawn Chrome | L17–L26 | `CHROME_BIN \|\| 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'`；`--headless=new --disable-gpu --no-first-run --no-default-browser-check --remote-debugging-port=0 --user-data-dir=<mkdtemp>`；`windowsHide:true`；`finally { chrome.kill(); }` |
| CDP 连接 | L29–L55 | `fetch('http://localhost:<port>/json/list')` → `new WebSocket(wsUrl)`；`send(method,params)` 用 id→Promise map |
| 捕获异常 | L32–L40 | `Runtime.exceptionThrown` / `Runtime.consoleAPICalled(error\|warn)` 累积进 `__pageErrors`，注入页面并每轮 `assert.deepEqual(pageErrors,[])` |
| 设视口 | 自建 `size(w,h,touch)` | `Emulation.setDeviceMetricsOverride {width:w,height:h,deviceScaleFactor:1,mobile:touch}` + `Emulation.setTouchEmulationEnabled {enabled:touch,maxTouchPoints:touch?5:1}`，然后 `await delay(400)` |
| 导航 | L86/L104 | `Page.navigate {url: pathToFileURL(path.join(root,'Border-Guard-v0.29.html')).href}` |
| 执行夹具/测量 | L86 | `Runtime.evaluate {expression, awaitPromise:true, returnByValue:true}` |
| 截图 | L120–L123 | `Page.captureScreenshot {format:'png', captureBeyondViewport:false}` → 写文件 |
| 双 rAF | L124 | `frames()` = `new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`，夹具后调用 |

两方案**判据、命名、标注完全一致**，只差驱动方式；推荐 A（改动最小、复用已批准的 `move` 工具）。

### 1.3 夹具定义（全部「状态夹具，非自然流程证据」）

| 夹具 | 来源 | 内容 |
|---|---|---|
| `fx/wp3-site.js`（新建） | 抄 `v029-hud-occlusion-browser.cjs` 的 `siteFixture()` L180–L193 | `$('dialog').close(); game=makeGame(42); game.started=true; paused=false; keys.clear(); game.settings.sound=false; for(t of tiles)t.visible=true; closeInspector(); sync(); layoutHudChrome(); measureCameraViewport(); snapCameraToHero();` |
| `fx/day-scene.js`（已有） | 本轮只读核对 | 四生产建筑 + 2 塔 + 派工 + `game.hero=(6.5,6.5)` + `centerOnHero()`；**不改** |
| `fx/night.js`（已有） | 同上 | `startNight()`；**不改** |
| `fx/wp3-cards.js`（新建） | `wp3-visual-spec.md` §5.4 | `game.cardPending=true; game.cardChoices=CARDS.slice(0,3).map(c=>({key:c.key,label:c.label,info:c.info})); showCards(); sync();`；随后 **`wait ≥700ms`**（`cardIn .38s` + `nth-child(3) delay .14s` = 520ms，留 180ms 余量） |
| 弱化态变体 | CDP `Emulation.setEmulatedMedia {features:[{name:'prefers-reduced-motion',value:'reduce'}]}` | 若不支持则注入 CSS `*{animation:none!important;transition:none!important}`；仅用于 `cards-*-reduced.png` |

`开局` 场景也可用真实输入 `clicktext 普通难度` 作为自然流程对照，但 **7 视口布局判定统一用 site fixture 保证可比性**；自然输入证据由 WP2 验收（已完成）覆盖。

### 1.4 7 视口矩阵（28 张标准截图 + 7 张弱化态卡牌）

| # | 视口 | `open W H [touch]` | 说明 |
|---|---|---|---|
| 1 | 1440×900 | `open 1440 900` | 桌面基准 |
| 2 | 1920×1080 | `open 1920 1080` | 大屏 |
| 3 | 1108×1195 | `open 1108 1195` | 竖屏平板 |
| 4 | 886×956 | `open 886 956` | 中屏 |
| 5 | 1108×720 | `open 1108 720` | 矮屏，`siteFree` 窄余量 0.015 |
| 6 | 932×430 | `open 932 430 touch` | **横屏触屏**，`sideDock==='right'` |
| 7 | 390×844 | `open 390 844 touch` | **竖屏手机**，`sideDock==='bottom'`，`siteFree` 余量 0.001 |

场景名与文件：`site-<SUFFIX>.png`、`day-<SUFFIX>.png`、`night-<SUFFIX>.png`、`cards-<SUFFIX>.png`、`cards-<SUFFIX>-reduced.png`；`<SUFFIX>` 如 `932x430-touch`。**输出目录仅 `tests/artifacts/v030-polish/viewports/`**，不触碰 `tests/artifacts/v029-*`。

### 1.5 §4.2 判据 → 可执行表达式（每项写入 `measurements.jsonl`）

| 判据 | `Runtime.evaluate` 表达式/取值（返回 JSON） | PASS 阈值 | 来源 |
|---|---|---|---|
| 无横向滚动 | `({docSW:document.documentElement.scrollWidth, iw:innerWidth})` | `docSW <= iw+1` | §4.2 L487 |
| 顶栏资源不换行/不裁切 | `const st=$('stocks'); const rows=new Set([...st.children].map(e=>Math.round(e.getBoundingClientRect().top))); const bad=[...st.children].filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1||r.left<-1}); ({rows:rows.size, overflow:bad.length})` | `rows===1 && overflow===0`（≤600px 可只显示图标+数字） | §4.2 L487 |
| 底栏按钮文字不竖排 | `[...document.querySelectorAll('#commandBar button')].map(b=>({t:b.textContent.trim().slice(0,20), wm:getComputedStyle(b).writingMode, h:b.getBoundingClientRect().height}))` | 全部 `wm==='horizontal-tb'`；按钮不因竖排撑高（人工看截图复核） | §4.2 L487 |
| 详情与底栏不重叠 | `const s=$('playSide').getBoundingClientRect(), d=$('commandDeck').getBoundingClientRect(); ({ox:Math.max(0,Math.min(s.right,d.right)-Math.max(s.left,d.left)), oy:Math.max(0,Math.min(s.bottom,d.bottom)-Math.max(s.top,d.top))})` | `ox*oy===0` | runner L303 `overlapPx` |
| 三卡同排且第 3 张在视口内可点 | `const cs=[...document.querySelectorAll('#cardRow button')]; const rs=cs.map(c=>c.getBoundingClientRect()); const third=cs[2], r=rs[2], top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); ({n:cs.length, ySpread:Math.max(...rs.map(x=>x.y))-Math.min(...rs.map(x=>x.y)), inView:r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1, hit:top===third||third.contains(top), opacity:cs.map(c=>getComputedStyle(c).opacity)})` | `n===3 && ySpread<28 && inView && hit && opacity 全 '1'`（**runner 只验首卡命中+同排，第 3 张靠此表达式+截图**） | §4.2 L491 / runner L259 |
| `#eventBanner` 不遮顶栏 | `const b=$('eventBanner'), t=document.querySelector('.top'); const br=b.hidden?null:b.getBoundingClientRect(), tr=t.getBoundingClientRect(); ({hidden:b.hidden, overlap:br?Math.max(0,Math.min(br.bottom,tr.bottom)-Math.max(br.top,tr.top))*Math.max(0,Math.min(br.right,tr.right)-Math.max(br.left,tr.left)):0})` | `hidden===true || overlap===0`（且目视不遮主城，见下） | §4.2 L493 / §4.4 |
| 横幅不遮主城（目视） | 主城屏幕矩形由 `worldToScreen((game.castle.x+.5)*CELL,(game.castle.y+.5)*CELL)` 与 `CELL*camera.sx` 估算；与 `br` 求交 | 交集 ≤ 主城面积 20% 或 `br.bottom < castle.top` | §4.2 L492 |
| 折叠图例/小地图 ≤60 | `.legend-panel` / `.minimap-panel` 的 `getBoundingClientRect().height` | 两者均 `<=60`（runner L238–239） | §4.2 L493 |
| 选址/详情可见地图占比 | 复用 runner `measureOcclusion()` L127–L180 的 32×32 网格（`blocked` 元素仅 `.briefing,.legend-panel,.minimap-panel,#commandDeck,#playSide`），返回 `siteFree=1-blocked/total` | `siteFree >= 0.85` 桌面 / `0.80` 触屏 / `0.68` 矮横屏(h≤430)；`dayFree >= 0.45` / `0.48` 矮横屏 | §4.2 L496 |
| 932×430 特判 | `camera.insets.sideDock`、`insets.r`、`insets.b`、`day.deckOnlyB`、`focusScreen.x < sideRect.left-4` | `sideDock==='right' && r>100 && b<=deckOnlyB+2 && 焦点在左` | §4.2 L497 |
| 390×844 特判 | `camera.insets.sideDock` | `==='bottom'` | §4.2 L498 |
| `pageErrors` | `Runtime.exceptionThrown` / console error\|warn 累积数组 | `[]` | runner L34–L40 |

**⚠️ runner 盲区（已写入 §4.2.1）**：`measureOcclusion` 的 `blocked` **不含 `#eventBanner` / `#victoryCard` 及新增浮层**；上述自动化全绿也**不能**替代「浮层面板目视检查」，必须逐张看 `site/day/night/cards` 截图。

### 1.6 标注、清单与失败处理

- **标注**：每张截图的 manifest 行写明 `fixture:true` 与 `label:"状态夹具，非自然流程证据"`；不在像素上打水印（会污染布局测量）。报告末尾统一列出该标注。
- **顺序**：先跑 6 视口的 hud-occlusion runner 比数，再拍 7 视口；每改一处 CSS 立即重测，不等 28 张拍完（§4.2.1 第 5 条）。触线时**改 CSS 不改断言**。
- **回归门槛**：WP3 实现提交后全量 Node 命令须显式列 **6 个 `*.test.cjs` + `tests/v030-wp3-badge-order.test.cjs`**，判 `# pass ≥ 61 + 新增`、`# fail 0`、`# skipped 0`、`# todo 0`；**不得沿用 77、不得删/放宽断言**。三条浏览器 runner 用新目录 `BORDER_ARTIFACTS=tests/artifacts/v030-wp3-{hud,work,rings}`，全 `OK`、`pageErrors=[]`。

---

## 2. §3.6 复拍方案（P7 ①b′ 门禁，两套判定帧互不替代）

> 两帧均为**状态夹具**，报告须标注「状态夹具，非自然流程证据」；判据来自 WP2 §6 第 4 条（气泡遮挡），但**此复拍服务于 WP3 是否破坏该证据**。

### 2.1 帧 A · 白天到岗帧（判气泡遮挡）

1. `open 1440 900` → `clicktext 普通难度`（真实输入）→ `evalfile fx/day-scene.js`（派工夹具）。
2. **`wait 1200`** 让居民走到 dock；只读校验 `game.residents.some(r=>r.work?.state==='working' && r.activity==='work' && r.work.buildingId)` 且对应生产建筑 `assignedResidentIds.length>0`。若未到岗再等 800ms，仍不满足则回传阻塞（不假造状态）。
3. `shot tests/artifacts/v030-wp3-reshoot/day-working-1440x900.png`；再用 `zoom` 对 **含 `👤N` 的建筑格**做 ≥4× 裁切：`day-working-1440x900-zoom.png`。
   - 裁切坐标获取（只读）：`eval` 返回 `const t=game.tiles[game.productionBuildings.get(id).tileId]; const p=worldToScreen((t.x+.5)*CELL,(t.y+.5)*CELL); ({x:p.x-40,y:p.y-40})`，再 `zoom <file> <x> <y> 160 120 4`。
4. 视口改 `open 390 844 touch`，重复 2–3，产出 `day-working-390x844.png` 与 `-zoom.png`。
5. **PASS/FAIL**：同帧内 `👤` 图标**或徽章左缘**被**实色作业气泡**覆盖 → **FAIL**；仅看「徽章是否可见」不够（`N` 数字大概率存活，会误放 PASS）。灰「空」同理按左缘判。

### 2.2 帧 B · 夜间 N=0 帧（判 ①b′ 硬前提：暗幕下灰「空」可读性）

1. `open 1440 900` → `evalfile fx/day-scene.js` → **新建夹具 `fx/wp3-night-n0.js`**（唯一新写入的夹具，执行阶段才建）：把所有生产建筑 `assignedResidentIds=[]`；把居民 `r.work=emptyWork(); r.state='home'; r.activity='idle'; r.x/r.y` 移出 dock（用 `findResidentSlot` 或城堡位）；`sync(); layoutHudChrome(); measureCameraViewport();`。
2. `evalfile fx/night.js`（`startNight()`）→ `wait 900`（夜幕 `drawLighting` 生效）→ 只读校验 `game.phase==='night'` 且**所有**生产建筑 `productionWorkerCountAt(t)===0` 且无 `working` 气泡锚在徽章处。
3. `shot .../night-n0-1440x900.png` + `zoom` ≥4× 灰「空」裁切；`open 390 844 touch` 重复得 `night-n0-390x844.png` + zoom。
4. **判定**：`rgba(84,90,96,.88)` 底 + `#cdd3d8` 字在 `drawLighting()` 夜幕压暗后是否仍可辨；**不可读则 ①b′ 硬前提不成立**，按已登记路径回退 ①a + 夜间色值微调（需另行拍板）。
5. **归属说明**：此帧判的是**夜景可读性**，不判气泡遮挡；帧 A 判遮挡，二者互不替代。Baseline 事实 `countAssertionWouldFailOnBaseline:true` 在 ②/③ 下属现状行为、不是新引入的信息泄露。

### 2.3 复拍清单

| 文件 | 判定项 | 夹具标注 |
|---|---|---|
| `day-working-{1440x900,390x844}.png` + `-zoom.png` | `👤` 图标/徽章左缘是否被实色气泡覆盖 | 状态夹具，非自然流程证据 |
| `night-n0-{1440x900,390x844}.png` + `-zoom.png` | 暗幕下灰「空」可读性（①b′ 硬前提） | 状态夹具，非自然流程证据 |

---

## 3. 本轮明确不做

- 不启动 Chrome / 不调用 `cdp.cjs` / 不截图；实现回传前拍了会作废。
- 不改 `Border-Guard-v0.29.html`、不改断言、不跑 `node --test`、不提交、不 push。
- 不覆盖 `tests/artifacts/v029-*`；不修改另外三份规格文档（61/77 冲突只在本文件登记并上报）。
- 不替主理人裁定「条件 PASS / 双重门禁」措辞；不自行宣布质量门结论。

---

## 4. 执行阶段前置检查清单（收到派单后逐项核）

- [ ] engineering-lead 的 ①b′ / P1 / P3 实现已提交，HEAD 已知；
- [ ] P7 拍板结果与本计划 ①b′ 假设一致（若改 ②/③，转 §3.6 替代红源，须另行裁定）；
- [ ] 61/77 基线冲突已有主理人结论，三份旧文档是否已同步；
- [ ] `Emulation.setDeviceMetricsOverride` / `setTouchEmulationEnabled` 在两方案下均已生效（`cdp.cjs open` 内置或 harness 自建）；
- [ ] `measurements.jsonl` 每行含 `fixture:true` 与标注文本；28+7 张截图全部落在新目录；
- [ ] 全量 Node 门槛按 61+新增、三条 runner 用 `v030-wp3-*` 新目录、无断言删改。
