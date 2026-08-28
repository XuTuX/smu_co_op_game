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
const context = vm.createContext({
  console,
  document: { querySelectorAll: () => [] },
  performance: { now: () => 0 },
  requestAnimationFrame() {},
  window: {
    addEventListener() {},
    clearTimeout() {},
    clearInterval() {},
    setTimeout(callback) {
      queuedTimers.push(callback);
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
  game.updateReadyUI = () => {};
  game.countdownStarted = false;
  game.startCountdown = () => { game.countdownStarted = true; };
  game.returnedToReady = false;
  game.beginReadyCheck = () => { game.returnedToReady = true; game.state = 'READY'; };

  const input = new context.window.TestInputManager();
  input.onChange((state) => game.handleReadyInput(state));
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
  const { game, input } = createReadyHarness(GameClass);
  game.state = 'GAMEOVER';
  input.setEsp32Input({ ...game.createReadyState(), left: true });
  assert.strictEqual(game.returnedToReady, true, `${label}: any ESP32 button must return game over to ready`);
  assert.strictEqual(game.state, 'READY', `${label}: restart input must enter ready state`);
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

console.log('✅ READY CHECK TEST PASSED: all four games support ESP32 ready, cancel, all-ready cancellation, and game-over restart');
