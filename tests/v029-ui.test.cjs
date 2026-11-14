'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {bootV029} = require('./helpers/v029-vm.cjs');

const boot = () => {
  const b = bootV029({seed: 42});
  b.execute(`(() => {
    document.getElementById('dialog').close();
    game.started = true;
    game.settings.sound = false;
    for (const t of game.tiles) t.visible = true;
    chooseSite(0);
    closeInspector();
    sync();
  })()`);
  return b;
};

test('顶栏展示金币材料粮食人口行动，不伪造木石分栏', () => {
  const b = boot();
  const ui = b.execute(`(() => {
    renderUI();
    return {
      stocks: document.getElementById('stocks').textContent,
      actions: document.getElementById('actionCount').textContent,
      phase: document.getElementById('phaseName').textContent,
      hasWoodLabel: /木材/.test(document.getElementById('stocks').textContent),
      hasStoneLabel: /石料/.test(document.getElementById('stocks').textContent),
      hasMaterial: /材料/.test(document.getElementById('stocks').textContent),
      hasGold: /金币/.test(document.getElementById('stocks').textContent),
      hasFood: /粮食/.test(document.getElementById('stocks').textContent),
      hasPop: /人口/.test(document.getElementById('actionCount').textContent),
      hasAct: /行动/.test(document.getElementById('actionCount').textContent)
    };
  })()`);
  assert.equal(ui.hasMaterial, true);
  assert.equal(ui.hasGold, true);
  assert.equal(ui.hasFood, true);
  assert.equal(ui.hasPop, true);
  assert.equal(ui.hasAct, true);
  assert.equal(ui.hasWoodLabel, false);
  assert.equal(ui.hasStoneLabel, false);
});

test('左侧图例与小地图节点存在，右侧主城区分城墙与主城血条', () => {
  const b = boot();
  const ui = b.execute(`(() => {
    openInspector(game.castle); sync();
    return {
      legend: !!document.getElementById('leftRail'),
      mini: !!document.getElementById('miniMap'),
      body: document.getElementById('inspectBody').textContent,
      wallBtn: [...document.getElementById('inspectBody').querySelectorAll('button')].some(x => /城墙/.test(x.textContent))
    };
  })()`);
  assert.equal(ui.legend, true);
  assert.equal(ui.mini, true);
  assert.match(ui.body, /主城/);
  assert.match(ui.body, /城墙/);
  assert.equal(ui.wallBtn, true);
});

test('卡牌三选一独立模态冻结，不 inert main、不显示暂停遮罩', () => {
  const b = boot();
  const ui = b.execute(`(() => {
    game.cardPending = true;
    game.cardChoices = CARDS.slice(0,3).map(c => ({key:c.key,label:c.label,info:c.info}));
    const elapsed = game.phaseElapsed;
    showCards();
    const overlay = document.getElementById('cardOverlay');
    const row = document.getElementById('cardRow');
    const cards = row.children.length;
    tickCampaign(0.5);
    const frozen = game.phaseElapsed === elapsed && game.cardModal && !paused;
    document.getElementById('cardSkip').click();
    return {
      open: overlay && !overlay.hidden, cards, frozen, pending: game.cardPending, paused,
      mainInert: !!document.querySelector('main').inert,
      pauseVisible: !document.getElementById('pauseOverlay').hidden,
      cardModal: game.cardModal
    };
  })()`);
  assert.equal(ui.cards, 3);
  assert.equal(ui.frozen, true);
  assert.equal(ui.mainInert, false);
  assert.equal(ui.pauseVisible, false);
  assert.equal(ui.pending, false);
  assert.equal(ui.paused, false);
  assert.equal(ui.cardModal, false);
});

test('暂停后再开卡牌，关闭应恢复原暂停', () => {
  const b = boot();
  const ui = b.execute(`(() => {
    setPaused(true);
    game.cardPending = true;
    game.cardChoices = CARDS.slice(0,3).map(c => ({key:c.key,label:c.label,info:c.info}));
    showCards();
    const during = {
      cardModal: game.cardModal,
      pauseVisible: !document.getElementById('pauseOverlay').hidden,
      mainInert: document.querySelector('main').inert
    };
    pickGrowthCard(null, '跳过');
    return {
      during,
      afterPaused: paused,
      afterPauseVisible: !document.getElementById('pauseOverlay').hidden,
      afterModal: game.cardModal
    };
  })()`);
  assert.equal(ui.during.cardModal, true);
  assert.equal(ui.during.pauseVisible, false);
  assert.equal(ui.during.mainInert, false);
  assert.equal(ui.afterPaused, true);
  assert.equal(ui.afterPauseVisible, true);
  assert.equal(ui.afterModal, false);
});

test('建城后镜头夹紧不留正方向空白，地图至少盖住视口', () => {
  const b = boot();
  const cam = b.execute(`(() => {
    measureCameraViewport();
    snapCameraToPoint(game.castle.x + .5, game.castle.y + .5);
    const worldW = document.getElementById('map').width * camera.sx;
    const worldH = document.getElementById('map').height * camera.sy;
    return {
      tx: camera.tx, ty: camera.ty, vw: camera.vw, vh: camera.vh,
      covers: worldW + .5 >= camera.vw && worldH + .5 >= camera.vh,
      noPosBlank: (worldW >= camera.vw - .5 ? camera.tx <= 0.5 : true) &&
                  (worldH >= camera.vh - .5 ? camera.ty <= 0.5 : true)
    };
  })()`);
  assert.equal(cam.covers, true);
  assert.equal(cam.noPosBlank, true);
});

test('主城详情含插图与双进度条，命令栏含图标', () => {
  const b = boot();
  const ui = b.execute(`(() => {
    openInspector(game.castle); sync();
    const body = document.getElementById('inspectBody');
    const art = [...body.children].some(c => String(c.className||'').includes('inspect-art'));
    const barsEl = [...body.children].find(c => String(c.className||'') === 'inspect-bars');
    game.mobileGroup = 'build';
    renderCommands(); applyCommandGroups();
    const icons = [...document.getElementById('commandBar').children].filter(btn =>
      [...(btn.children||[])].some(c => String(c.className||'') === 'cmd-icon')
    ).length;
    return {art, bars: barsEl ? barsEl.children.length : 0, icons};
  })()`);
  assert.equal(ui.art, true);
  assert.equal(ui.bars, 2);
  assert.ok(ui.icons >= 3);
});

test('建造栏无逐格城墙，保留箭塔与真实费用', () => {
  const b = boot();
  const ui = b.execute(`(() => {
    game.mobileGroup = 'build';
    renderCommands(); applyCommandGroups();
    const text = [...document.getElementById('commandBar').children].map(b => b.textContent).join('|');
    return {text, hasWall: /城墙/.test(text), hasTower: /箭塔/.test(text)};
  })()`);
  assert.equal(ui.hasWall, false);
  assert.equal(ui.hasTower, true);
});
