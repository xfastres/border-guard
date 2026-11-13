() => {
  const results=[];
  const check=(name,cond)=>results.push({name,pass:!!cond});
  const fresh=(seed=42)=>{
    if($('dialog').open)$('dialog').close();
    game=makeGame(seed);game.started=true;paused=true;keys.clear();
    const site=tileAt(5,4);site.visible=true;chooseSite(0);
    Object.assign(game.hero,center(site));
    return game;
  };
  const bag=()=>JSON.stringify(game.resources);

  // A｜军令：可选、确定性、达成才给奖励、不碰资源
  fresh();
  const offer=game.contract.offer;
  check('每天给出 2 条互不相同的军令候选',offer.length===2&&offer[0].id!==offer[1].id);
  check('同种子同天候选确定且可复现',JSON.stringify(offerContracts(1,42))===JSON.stringify(offerContracts(1,42)));
  const g1=makeGame(42),g2=makeGame(42);
  offerContracts(1,42);offerContracts(5,42);
  check('军令抽取不消耗随机序列（不扰动地图/强化卡）',g1.rnd()===g2.rnd());
  check('军令默认未选择，不阻塞开局',game.contract.chosen===null);

  fresh();
  const id=game.contract.offer[0].id;
  chooseContract(id);
  check('可主动接下军令',game.contract.chosen?.id===id&&game.contract.progress===0);
  const first=game.contract.chosen;
  chooseContract(game.contract.offer[1].id);
  check('同一夜不能改选军令',game.contract.chosen===first);

  fresh();
  let before=bag(),honor=game.honor,xp=game.xp;
  settleContract(1);
  check('未接军令时结算不发放任何奖励，也不改资源',
    game.honor===honor&&game.xp===xp&&game.rallyBonus===0&&bag()===before);
  settleContract(1);
  check('军令结算有防重复保护',game.contract.settled===true);

  fresh();
  game.contract.chosen={...CONTRACTS.find(c=>c.id==='slayer'),goal:3};
  bumpContract('slayer',3);
  before=bag();honor=game.honor;xp=game.xp;
  settleContract(1);
  check('达成军令：+1 战功 / +3 主城经验 / 下夜多一次号令',
    game.honor===honor+1&&game.contractsDone===1&&game.xp===xp+3&&game.rallyBonus===1);
  check('军令奖励不发放资源，账本与库存一字不变',bag()===before);
  check('达成记录写入本局日志',game.contractLog.length===1&&game.contractLog[0].ok===true);

  fresh();
  game.contract.chosen={...CONTRACTS.find(c=>c.id==='line'),goal:6};
  before=bag();honor=game.honor;
  settleContract(1);
  check('未达成军令没有任何惩罚',game.honor===honor&&game.contractsDone===0&&bag()===before);
  check('未达成也留下中性记录',game.contractLog.length===1&&game.contractLog[0].ok===false);

  fresh();
  game.contract.chosen={...CONTRACTS.find(c=>c.id==='flawless'),goal:0};
  game.nightStartHp=game.castleHp;
  check('不落一砖：夜始完好时判定保持',contractMet(game.contract.chosen)===true);
  game.castleHp-=5;
  check('不落一砖：掉耐久后判定失败',contractMet(game.contract.chosen)===false);

  fresh();
  skipContract();
  settleContract(1);
  check('跳过军令不产生达成奖励',game.honor===0&&game.contractsDone===0&&game.contractLog.length===0);

  // B｜探索图鉴：把已有的 6 处隐藏内容接进循环
  fresh();
  markCodex('relic');
  check('发现秘点写入图鉴',codexCount()===1&&game.codex.relic===true);
  markCodex('relic');
  check('重复发现不重复计数',codexCount()===1);
  const honorBefore=game.honor;
  for(const k of ['rich','iron','danger','shard','artifact'])markCodex(k);
  check('集齐 6 处秘点给出额外战功',codexCount()===6&&game.codexComplete===true&&game.honor===honorBefore+3);
  check('未发现时只给方向提示、不剧透坐标',
    (()=>{fresh();const s=nextRunHint();return s.includes('东侧山地')&&!/\d+[,，]\d+/.test(s);})());
  fresh();
  const relic=game.tiles.find(t=>t.node?.kind==='relic');
  Object.assign(game.hero,center(relic));
  scoutAroundHero();
  check('走近点亮自动记入图鉴',game.codex.relic===true&&codexCount()>=1);

  // C｜今夜预告：只讲已有规则，不改波次
  fresh();
  const p1=nightPreview(1);
  check('第 1 夜预告含入口方向与敌军规模',/西门|东门/.test(p1)&&p1.includes('约 6 名'));
  check('第 5 夜预告写明首领夜',nightPreview(5).includes('首领夜'));
  const frontsBefore=game.fronts.length;
  nightPreview(1);
  check('预告是纯信息层，不创建战场',game.fronts.length===frontsBefore);

  // D｜夜间号令：一次主动决策，复用既有伤害与账本
  fresh();
  game.phase='night';game.rallyCharges=1;game.enemies=[];
  rally();
  check('场上无敌人时不消耗号令额度',game.rallyCharges===1);

  fresh();
  game.phase='night';game.rallyCharges=1;
  const e={x:8,y:5,hp:100,max:100,boss:false,heavy:false,speed:1,cooldown:0,flash:0,next:null};
  game.enemies=[e];
  const towerBonus=game.bonuses.bow;
  rally();
  check('号令对全场敌人造成伤害并消耗 1 次',e.hp<100&&game.rallyCharges===0);
  check('号令不改动既有箭塔强化数值',game.bonuses.bow===towerBonus);
  const hpAfter=e.hp;
  rally();
  check('额度用尽后再次点击无效',e.hp===hpAfter);

  fresh();
  game.phase='night';game.rallyCharges=1;
  const kill={x:8,y:5,hp:5,max:5,boss:false,heavy:false,speed:1,cooldown:0,flash:0,next:null};
  game.enemies=[kill];
  const goldBefore=game.resources.gold,incomeBefore=game.ledger[1].income.gold;
  rally();
  check('号令击杀仍走既有入账通道，账本闭合不被破坏',
    kill.hp<=0&&game.resources.gold===goldBefore+1&&game.ledger[1].income.gold===incomeBefore+1);

  // E｜跨局战绩：纯本地、不编数据、可容错
  const base=loadBest()||{runs:0,wins:0,bestDay:null,bestKills:0,bestHonor:0,bestCodex:0};
  fresh();game.day=3;game.kills=12;game.honor=4;
  const r1=commitRecord(true);
  check('通关累加局数',r1.runs===base.runs+1);
  check('通关累加胜场',r1.wins===base.wins+1);
  check('最佳夜次取真实通关夜（早于第 3 夜的无效记录被挡住）',r1.bestDay===3);
  check('最佳击退取本局真实值',r1.bestKills===12);
  check('最高战功取本局真实值',r1.bestHonor===4);
  game.day=5;game.kills=5;game.honor=1;
  const r2=commitRecord(false);
  check('败局只累加局数，不覆盖最佳记录',r2.runs===r1.runs+1&&r2.wins===r1.wins&&r2.bestDay===r1.bestDay&&r2.bestKills===12);

  fresh();game.phase='won';game.day=5;game.kills=30;game.honor=3;game.contractsDone=2;
  game.record=r1;
  renderVictoryCore();
  const victoryText=$('victoryCore').innerText;
  check('胜利卡展示战功/军令/秘点/个人最佳/下局建议',
    ['战功','军令达成','秘点','个人最佳','下局'].every(k=>victoryText.includes(k)));
  check('胜利卡不重复展示库存（沿用 v0.18 约定）',!victoryText.includes('战后库存'));

  // F｜常驻浮层：PC/手机都能看见，且不吃地图拖动
  fresh();
  renderQuestBar();
  check('战役浮层在游玩中常驻可见',!$('questBar').hidden);
  check('浮层显示今夜预告与图鉴进度',
    $('questPreview').textContent.includes('敌军')&&$('questCodex').textContent.includes('/6'));
  check('未选军令时给出 2 个候选 + 跳过', $('questChoices').children.length===3);
  check('HUD 本体不吃指针事件，地图仍可拖动',getComputedStyle($('questBar')).pointerEvents==='none');
  chooseContract(game.contract.offer[0].id);
  renderQuestBar();
  check('接下军令后候选收起、显示进度',
    $('questChoices').children.length===0&&$('questContract').textContent.includes('·'));
  game.phase='night';game.rallyCharges=1;renderQuestBar();
  check('夜战显示常驻号令入口',!$('questRally').hidden);
  game.phase='won';renderQuestBar();
  check('战役结束自动收起浮层',$('questBar').hidden===true);

  // G｜不破坏原有流程
  fresh();
  const dayBefore=game.day;
  dawn();
  check('不选军令时昼夜循环照常推进且无弹窗',game.day===dayBefore+1&&!$('dialog').open);

  return {total:results.length,passed:results.filter(r=>r.pass).length,results};
}
