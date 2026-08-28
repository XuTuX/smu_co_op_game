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

const ACTIONS = ['forward', 'backward', 'left', 'right'];

function createReadyHarness(GameClass) {
  const game = Object.create(GameClass.prototype);
  game.state = 'READY';
  game.readyActions = [...ACTIONS];
  game.readyPlayers = game.createReadyState();
  game.previousReadyInputs = game.createReadyState();
  game.readyStartTimer = null;
  game.updateReadyUI = () => {};
  game.countdownStarted = false;
  game.startCountdown = () => { game.countdownStarted = true; };

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

verifySequentialReady(context.window.TestParkingGame, 'Parking');
verifySimultaneousReady(context.window.TestParkingGame, 'Parking');
verifySequentialReady(context.window.TestTrafficGame, 'Traffic');
verifySimultaneousReady(context.window.TestTrafficGame, 'Traffic');

console.log('✅ READY CHECK TEST PASSED: both games accept sequential and simultaneous ESP32 button readiness');
