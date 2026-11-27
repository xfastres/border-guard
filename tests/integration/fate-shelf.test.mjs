import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameSystems } from '../../src/app/bootstrap.js';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import { createDestinyTransferModals } from '../../src/ui/modals/destiny-transfer-modals.js';

test('blind box refresh, stale clicks, payout and W29 deadline use the real checkout', t => {
  const ctx = createRuntimeContext();
  const systems = createGameSystems(ctx);
  const game = systems.run.makeGame(2026);
  ctx.setGame(game);
  game.gold = 500;
  game.rnd = () => assert.fail('browsing a shelf consumed the gameplay RNG');

  const buttons = new Map();
  function button() {
    return {
      dataset: {}, addEventListener(name, handler) { this[name] = handler; },
      append(child) { (this.cards ||= []).push(child); },
    };
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: button } });
  t.after(() => original ? Object.defineProperty(globalThis, 'document', original) : delete globalThis.document);
  const box = {
    set innerHTML(markup) {
      this.markup = markup;
      buttons.clear();
      for (const [, id] of markup.matchAll(/ id="([^"]+)"/g)) buttons.set('#' + id, button());
    },
    querySelector(key) { return buttons.get(key); },
  };
  const ui = createDestinyTransferModals(ctx, {
    getEl: id => id === 'modalBox' ? box : {}, equipment: {}, economy: { getBagCapacity: () => 12 },
    progression: systems.destiny, feedback: { toast() {} }, formatters: { renderAffixChipsHtml: () => '' },
    modalManager: { closeModal: () => { game.activeModal = null; } },
  });
  ctx.bindPorts({ modals: { renderDestinyGambleModal: ui.renderDestinyGambleModal } });
  ui.openDestinyGambleModal();
  const first = box.markup;
  const abandoned = buttons.get('#fateBuy0');
  buttons.get('#fateRefresh').click();
  assert.notEqual(box.markup, first);
  abandoned.click();
  assert.equal(game.gold, 500);
  assert.equal(game.destiny.totalRolls, 0);

  const rerendered = buttons.get('#fateBuy0');
  game.activeModal = null;
  ui.openDestinyGambleModal();
  rerendered.click();
  assert.equal(game.gold, 500);
  const price = systems.destiny.getDestinyConfig().minBet;
  const buy = buttons.get('#fateBuy0');
  game.rnd = () => 0;
  buy.click();
  buy.click();
  assert.equal(game.gold, 500 - price);
  assert.equal(game.destiny.totalRolls, 1);
  assert.match(box.markup, /上次遇到空劫/);

  const custom = buttons.get('#fateCustomBuy');
  const input = buttons.get('#fatePrice');
  input.value = '1.5';
  custom.click();
  assert.equal(game.destiny.totalRolls, 1);
  game.wave = 30;
  game.finalPrep = { active: true, started: true, timer: 0 };
  buttons.get('#fateBuy0').click();
  assert.equal(game.destiny.totalRolls, 1);

  game.finalPrep.active = false;
  game.rnd = () => .7;
  buttons.get('#fateBuy0').click();
  assert.equal(game.destiny.totalRolls, 2);
  assert.equal(game.gold, 500 - price * 2);
  const offer = game.destiny.pendingOffer;
  assert.equal(offer.choices.length, 3);
  assert.ok(!buttons.has('#fateRefresh'));
  const claim = buttons.get('#modalChoices').cards[0];
  claim.click();
  claim.click();
  assert.equal(game.destiny.pendingOffer, null);
  assert.equal(game.destiny.claimedOfferIds.filter(id => id === offer.offerId).length, 1);
});
