/**
 * Regression test: rapid grid taps stay discrete while a real hold still repeats.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const listeners = {};
const context = vm.createContext({
  console,
  document: { querySelectorAll: () => [] },
  performance: { now: () => 0 },
  window: {
    addEventListener(type, callback) {
      listeners[type] = callback;
    },
    clearTimeout() {},
    setTimeout() { return 1; }
  }
});

const inputSource = fs.readFileSync(path.join(__dirname, '..', 'client', 'js', 'input.js'), 'utf8');
vm.runInContext(inputSource, context, { filename: 'input.js' });
const input = new context.window.InputManager({ queueKeyboardPresses: true });

for (let tap = 0; tap < 3; tap++) {
  listeners.keydown({ code: 'ArrowRight', key: 'ArrowRight', preventDefault() {} });
  listeners.keyup({ code: 'ArrowRight', key: 'ArrowRight' });
}

assert.strictEqual(input.getCombinedState().right, false, 'Keyup must end the held state immediately');
assert.deepStrictEqual(
  [
    input.consumeQueuedPress('right'),
    input.consumeQueuedPress('right'),
    input.consumeQueuedPress('right'),
    input.consumeQueuedPress('right')
  ],
  [true, true, true, false],
  'Three rapid taps must remain three discrete queued moves'
);

const trafficPath = path.join(__dirname, '..', 'client', 'js', 'traffic-game.js');
const trafficSource = `${fs.readFileSync(trafficPath, 'utf8')}\nwindow.ObstacleDodgeGame = ObstacleDodgeGame;`;
vm.runInContext(trafficSource, context, { filename: 'traffic-game.js' });
const game = Object.create(context.window.ObstacleDodgeGame.prototype);
game.inputRepeat = game.createInputRepeatState();

assert.strictEqual(game.shouldStep('right', false, 0.016, true), true, 'A queued tap must move immediately');
assert.strictEqual(game.shouldStep('right', false, 0.016, false), false, 'A released tap must not become a hold');
assert.strictEqual(game.shouldStep('right', true, 0.016, true), true, 'The start of a real hold must move immediately');
assert.strictEqual(game.shouldStep('right', true, 0.48), false, 'A hold must wait before auto-repeat');
assert.strictEqual(game.shouldStep('right', true, 0.03), true, 'A real hold must repeat after its delay');

console.log('✅ TRAFFIC INPUT TEST PASSED: rapid taps queue separately and only real holds repeat');
