# Progress

2026-11-13：完成两份规则资料和v0.16实现对照；浏览器固定种子受控验证，未修改游戏。
已覆盖：清场/首领结束、核心出生、重新开局、同周期计费、欠费原子性与复产、先产后维护、结转、整营撤离两项历史边界、预警同帧保护、单人调回、面板移动/弹窗暂停、首日路线组合、起始城址收益。
报告：Border-Guard-v0.16-玩法与规则审查.md。
限制：未做人类五夜通关、真机触屏、多种子统计；手机仅浏览器390×844视口检查。
运行备注：设备模拟触发beforeunload已取消；截图服务不允许写目标路径，改内联查看。初次远探分支被暂停状态挡住，已修正测试推进助手并重跑，报告只使用重跑结果。

2026-11-13 v0.17：用户要求直接优化。保留v0.16，独立新版。20项浏览器回归先13失败/7通过，完成实现后20通过。
独立审查发现新增富矿(20,3)与普通木材点重叠；补强多种子资源唯一性断言，观察19/20，再把普通木材移至(21,2)。
完整守家受控五夜已走通：各夜7.38/19.82/33.5/22.55/33.22秒，第5夜真实击杀首领获胜、城堡160，未人为增加资源或耐久；路线自动攻击，按实际预算建设/升级，直接触发入夜省去白天等待。尚不代表所有打法平衡。

Mobile QA: at390×844 original .layout inherited align-items:start, .field expanded1282px, board.clientWidth1280 and no internal map scroll. Added5 mobile layout assertions. Fix align-items:stretch in mobile column flex; keeps map wide inside scrolling board and dock full width. Browser screenshot service became unresponsive after mobile screenshot; cancelled pending captures, validating through fallback.

Final native isolated Chrome regression: gameplay20/20, mobile layout5/5. Screenshot tests/artifacts/v017-mobile.png and machine-readable verification.json saved. Independent review approved after rich-mine collision fix, reviewed100seed resource existence. Added standalone dependency-free browser runner because connected screenshot endpoint hung; first launch DevToolsActivePort EBUSY fixed by bounded read retry.
Expansion route seed42: four base developments + one west tower + rich camp with miner used7actions,2gold2material3food remaining; walking8.4s+resident arrival2.1s,49.5s daylight left. Passed first night160castle and100hero; day2 resources19gold8material5food. This is feasibility evidence, not a balanced optimal strategy claim.

Final review approved all changes including mobile CSS and standalone runner; no blocking findings. Phase4/5/6 complete. Gameplay20/20 + mobile6/6, syntax2blocks passed, release notes saved. Originalv0.16 untouched. No publish/remote writes.

2026-11-13：用户明确要求生成方案交Cursor执行，再由本助手检查结果。方案docs/Cursor-HUD-v0.18-执行方案.md已写入，独立v0.18输出，保留v0.17。数据定义采用战后库存、不虚构跨局敌军继承、真实分夜日志。Cursor原窗口最小化且CUA无法绑定，改用已验证官方CLI新开本项目窗口。

Cursor提交阻塞：桌面项目202324已打开并能读取AX，但输入/截图/激活失败（coordinate input geometry unavailable / FrameArrived timed out / failed to activate captured window）。CLI cursor-agent存在但status=Not logged in，提交返回Authentication required，未运行任务。没有尝试读取或迁移任何凭据。已请求用户恢复并前置项目窗口；在答复前不声称Cursor已经执行。
基线v0.17重新跑26检查通过，哈希与状态写tests/artifacts/hud-baseline.json。

2026-11-13用户提供Cursor交付摘要，v0.18文件已存在。独立验收开始。v0.17哈希B77290...与提交前基线完全相同。重新运行v0.18=玩法20/20、白天手机6/6、结算6/6；v0.17=20/20+6/6。
发现测试证据口径：胜利HUD测试与截图使用damageEnemy(enemy,100000)逐个秒杀，不是正常攻击或无建造通关证据。它能验证统计/UI，但不能据此证明游戏平衡、城堡零损或普通打法可通关。

v0.18独立验收完成：主要HUD通过，两项P2已运行复现（同人4次受击计hurt4；工匠恢复100→135而castleRepair0）。正常预算塔防+自动攻击受控跑完5夜，真实击杀26，160城堡，库存39/2/10，所有分夜收支闭合。没有施加秒杀或人工增资源，省略白天等待直接入夜。验收报告docs/Cursor-v0.18-验收反馈.md；产品文件未修改。

v0.19完成：20玩法+10手势+6原生输入+30尺寸几何+6胜利检查=72项通过，正常预算五夜通关、分夜收支闭合；2段JS语法检查通过。独立审查发现并修正迷雾长按、多指HUD、结束旧手势、战后tap被吞与实体鼠标误抑制；复核批准。原017/018未修改。更新说明与桌面/手机实际截图已保存。真机硬件尚未验证，已明确限制。

2026-11-13：用户明确只要相机跟随方案，自行交Cursor执行。已只读核对019实际scrollLeft/Top平移与mobile-only follow，并生成docs/Cursor-v0.20-相机跟随执行方案.md。未修改游戏。方案锁定稳定屏幕HUD，地图world wrapper单transform统一平移、严格居中允许地图外背景、统一坐标反算、手势状态/PC浮层锚点及验收矩形基线。

2026-11-13 v0.20：以 v0.19 为基线完成地图世界层相机。run-v020-checks 通过：玩法20/20、手势10/10、原生输入6/6、五视口布局与相机（锚点误差0、HUD差0、20格往返、DPR2）、五夜通关账目闭合、战后拖图不带动结算卡。v0.19 哈希未变。说明见 Border-Guard-v0.20-更新说明.md。真机未测。

2026-11-13 v0.20 回修：自然缩窗结算卡出屏、棋盘背景不能起手拖图、整数显示宽度导致格线偏格。先用 run-v020-boundaries 复现失败，再只改 clamp、board 手势和浮点 sx/sy。边界脚本与完整 run-v020-checks 随后通过。屏幕 HUD 布局和建造业务未改。

2026-11-13 v0.20独立验收：主套件玩法20/20+手势10/10+原生6/6+布局30/30+相机41/41+结算7/7全过，正常五夜26kill39/2/10。差异核对屏幕HUDCSS未重写。但独立原生边界复现3项：自然缩窗卡片left1022在390屏外；露底背景board触摸拖动tx不变；1350.390625实际宽与1350offset取整导致边界内.05px误选(21,5)而应(20,5)。已写docs/Cursor-v0.20-独立验收反馈.md，未改产品文件。只读脚本tests/audit-v020-boundaries.cjs与JSON/截图保存。

v0.20边界修复复验：用户修复后已独立重跑run-v020-boundaries全6项和完整run-v020-checks（20玩法/10手势/9原生/30布局/41相机DPR/10胜利）均通过。独立旧复现脚本再跑：board背景tx402→502、自然缩窗卡片在390内、DOM格线20,5正确，三项原问题关闭。非阻断细节：背景tap会将wall工具清成null但不移动/选格/扣费，建议明确是否视作退出工具。产品文件未编辑；复验文档docs/Cursor-v0.20-边界修复复验.md。


2026-11-13 v0.25：根据用户截图审查建城后领主不能移动。根因是 chooseSite 将领主仍站立/仍指向的候选城址格变成城堡实体，却未处理脚底碰撞与旧寻路目标。新版本在建城前检查合法出口；若领主重叠则安置到最近相邻合法格，若仍正走向城址则重算为相邻服务位；远处建城不移动领主。新增 A/B 城址、WASD、面板打开时移动、未抵达先建城、远处建城回归脚本。未改变资源/行动/战斗数值。当前环境没有项目指定的 Windows Chrome，未声称浏览器测试运行通过；需执行 node tests/run-v025-checks.cjs Border-Guard-v0.25.html。
