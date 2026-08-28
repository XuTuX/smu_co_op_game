/**
 * Regression test for the four physical-button ready check in both games.
 * Covers ESP32 input mapping, rising-edge readiness, sequential presses,
 * simultaneous presses, and automatic countdown scheduling.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const queuedTimers = [];
const queuedTimerDelays = [];
const context = vm.createContext({
  console,
  document: { querySelectorAll: () => [] },
  performance: { now: () => 0 },
  requestAnimationFrame() {},
  window: {
    addEventListener() {},
    clearTimeout() {},
    clearInterval() {},
    setTimeout(callback, delay) {
      queuedTimers.push(callback);
      queuedTimerDelays.push(delay);
      return queuedTimers.length;
    }
  }
});

function load(relativePath, exportStatement) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  vm.runInContext(`${source}\n${exportStatement}`, context, { filename: relativePath });
}

load('client/js/input.js', 'window.TestInputManager = InputManager;');
load('client/js/game.js', 'window.TestParkingGame = Game;');
load('client/js/traffic-game.js', 'window.TestTrafficGame = ObstacleDodgeGame;');
load('client/js/jump-rope.js', 'window.TestJumpRopeGame = TeamJumpRopeGame;');
load('client/js/beat-jump.js', 'window.TestBeatJumpGame = BeatJumpGame;');

const ACTIONS = ['forward', 'backward', 'left', 'right'];

function createReadyHarness(GameClass) {
  const game = Object.create(GameClass.prototype);
  game.state = 'READY';
  game.readyActions = [...ACTIONS];
  game.actions = [...ACTIONS];
  game.readyPlayers = game.createReadyState();
  game.previousReadyInputs = game.createReadyState();
  game.readyStartTimer = null;
  game.restartHoldTimer = null;
  game.restartHoldDuration = 3000;
  game.updateReadyUI = () => {};
  game.countdownStarted = false;
  game.startCountdown = () => { game.countdownStarted = true; };
  game.returnedToReady = false;
  game.beginReadyCheck = () => { game.returnedToReady = true; game.state = 'READY'; };

  const input = new context.window.TestInputManager();
  input.onChange(() => game.handleReadyInput(input.getReadyState()));
  return { game, input };
}

function releaseAll(input) {
  input.setEsp32Input({ forward: false, backward: false, left: false, right: false });
}

function verifySequentialReady(GameClass, label) {
  queuedTimers.length = 0;
  const { game, input } = createReadyHarness(GameClass);

  for (const action of ACTIONS) {
    releaseAll(input);
    input.setEsp32Input({ ...game.createReadyState(), [action]: true });
    assert.strictEqual(game.readyPlayers[action], true, `${label}: ${action} must become ready`);
  }

  assert.deepStrictEqual(
    ACTIONS.map((action) => game.readyPlayers[action]),
    [true, true, true, true],
    `${label}: all four ESP32 buttons must be ready`
  );
  assert.strictEqual(game.state, 'READY_COMPLETE', `${label}: all-ready must schedule countdown`);
  assert.strictEqual(queuedTimers.length, 1, `${label}: countdown must be scheduled exactly once`);
  queuedTimers.shift()();
  assert.strictEqual(game.countdownStarted, true, `${label}: scheduled countdown must start`);
}

function verifySimultaneousReady(GameClass, label) {
  queuedTimers.length = 0;
  const { game, input } = createReadyHarness(GameClass);
  input.setEsp32Input({ forward: true, backward: true, left: true, right: true });

  assert.deepStrictEqual(
    ACTIONS.map((action) => game.readyPlayers[action]),
    [true, true, true, true],
    `${label}: one simultaneous packet must ready all players`
  );
  assert.strictEqual(game.state, 'READY_COMPLETE', `${label}: simultaneous ready must schedule countdown`);
  assert.strictEqual(queuedTimers.length, 1, `${label}: simultaneous input must schedule once`);
}

function verifyReadyToggle(GameClass, label) {
  queuedTimers.length = 0;
  const { game, input } = createReadyHarness(GameClass);
  input.setEsp32Input({ ...game.createReadyState(), forward: true });
  assert.strictEqual(game.readyPlayers.forward, true, `${label}: first press must ready the player`);
  releaseAll(input);
  input.setEsp32Input({ ...game.createReadyState(), forward: true });
  assert.strictEqual(game.readyPlayers.forward, false, `${label}: second press must cancel readiness`);

  releaseAll(input);
  input.setEsp32Input({ forward: true, backward: true, left: true, right: true });
  assert.strictEqual(game.state, 'READY_COMPLETE', `${label}: all ready must enter the pending-start state`);
  releaseAll(input);
  input.setEsp32Input({ ...game.createReadyState(), right: true });
  assert.strictEqual(game.readyPlayers.right, false, `${label}: pressing again while all-ready must cancel that player`);
  assert.strictEqual(game.state, 'READY', `${label}: cancellation during pending start must return to ready state`);
}

function verifyGameOverRestart(GameClass, label) {
  queuedTimers.length = 0;
  const { game, input } = createReadyHarness(GameClass);
  game.state = 'GAMEOVER';
  input.setEsp32Input({ ...game.createReadyState(), left: true });
  assert.strictEqual(game.returnedToReady, false, `${label}: one ESP32 button must not restart the game`);
  assert.strictEqual(queuedTimers.length, 0, `${label}: one held button must not start the restart timer`);

  input.setEsp32Input({ ...game.createReadyState(), left: true, right: true });
  assert.strictEqual(game.returnedToReady, false, `${label}: two buttons must not restart before three seconds`);
  assert.strictEqual(queuedTimers.length, 1, `${label}: two held buttons must schedule one restart timer`);
  assert.strictEqual(queuedTimerDelays[queuedTimerDelays.length - 1], 3000, `${label}: restart hold must last exactly three seconds`);
  queuedTimers.shift()();
  assert.strictEqual(game.returnedToReady, true, `${label}: two buttons held for three seconds must return to ready`);
  assert.strictEqual(game.state, 'READY', `${label}: completed restart hold must enter ready state`);

  queuedTimers.length = 0;
  const cancelled = createReadyHarness(GameClass);
  cancelled.game.state = 'GAMEOVER';
  cancelled.input.setEsp32Input({ ...cancelled.game.createReadyState(), forward: true, backward: true });
  const staleRestart = queuedTimers.shift();
  cancelled.input.setEsp32Input({ ...cancelled.game.createReadyState(), forward: true });
  staleRestart();
  assert.strictEqual(cancelled.game.returnedToReady, false, `${label}: releasing either button before three seconds must cancel restart`);
}

verifySequentialReady(context.window.TestParkingGame, 'Parking');
verifySimultaneousReady(context.window.TestParkingGame, 'Parking');
verifyReadyToggle(context.window.TestParkingGame, 'Parking');
verifyGameOverRestart(context.window.TestParkingGame, 'Parking');
verifySequentialReady(context.window.TestTrafficGame, 'Traffic');
verifySimultaneousReady(context.window.TestTrafficGame, 'Traffic');
verifyReadyToggle(context.window.TestTrafficGame, 'Traffic');
verifyGameOverRestart(context.window.TestTrafficGame, 'Traffic');
verifySequentialReady(context.window.TestJumpRopeGame, 'Jump rope');
verifySimultaneousReady(context.window.TestJumpRopeGame, 'Jump rope');
verifyReadyToggle(context.window.TestJumpRopeGame, 'Jump rope');
verifyGameOverRestart(context.window.TestJumpRopeGame, 'Jump rope');
verifySequentialReady(context.window.TestBeatJumpGame, 'Beat jump');
verifySimultaneousReady(context.window.TestBeatJumpGame, 'Beat jump');
verifyReadyToggle(context.window.TestBeatJumpGame, 'Beat jump');
verifyGameOverRestart(context.window.TestBeatJumpGame, 'Beat jump');

// Pointerdown already creates the ready edge. The browser's follow-up click
// must not create a second pulse that immediately cancels P1/P2 readiness.
queuedTimers.length = 0;
const pointerListeners = {};
const forwardButton = {
  dataset: { action: 'forward' },
  addEventListener(type, callback) { pointerListeners[type] = callback; },
  setPointerCapture() {}
};
context.document.querySelectorAll = (selector) => selector === '[data-action]' ? [forwardButton] : [];
const pointerHarness = createReadyHarness(context.window.TestParkingGame);
pointerListeners.pointerdown({ pointerId: 1, preventDefault() {} });
assert.strictEqual(pointerHarness.game.readyPlayers.forward, true, 'Parking: P1 pointerdown must set ready');
pointerListeners.pointerup({ pointerId: 1, type: 'pointerup' });
pointerListeners.click({ detail: 1 });
assert.strictEqual(pointerHarness.game.readyPlayers.forward, true, 'Parking: releasing P1 must not cancel ready through a duplicate click pulse');
queuedTimers.shift()();
assert.strictEqual(pointerHarness.game.readyPlayers.forward, true, 'Parking: P1 ready must remain after the pointer is fully released');
context.document.querySelectorAll = () => [];

// Parking adds a short forward/backward pulse on keyup for bus movement. That
// gameplay-only pulse must never toggle readiness a second time.
queuedTimers.length = 0;
const keyboardHarness = createReadyHarness(context.window.TestParkingGame);
keyboardHarness.input.handleKeyEvent('KeyW', true);
keyboardHarness.input.handleKeyEvent('KeyW', false);
keyboardHarness.input.pulseAction('forward', 100);
assert.strictEqual(keyboardHarness.game.readyPlayers.forward, true, 'Parking: releasing W must keep P1 ready despite the keyup movement pulse');
keyboardHarness.input.handleKeyEvent('KeyS', true);
keyboardHarness.input.handleKeyEvent('KeyS', false);
keyboardHarness.input.pulseAction('backward', 100);
assert.strictEqual(keyboardHarness.game.readyPlayers.backward, true, 'Parking: releasing S must keep P2 ready despite the keyup movement pulse');

console.log('✅ READY CHECK TEST PASSED: all four games support ready toggles and a two-button three-second game-over restart hold');
