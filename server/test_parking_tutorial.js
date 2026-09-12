const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const clientRoot = path.join(__dirname, '..', 'client', 'js');
const context = vm.createContext({
  console,
  document: { body: { classList: { add() {}, remove() {} } } },
  requestAnimationFrame() {},
  setTimeout() {},
  window: { addEventListener() {}, clearTimeout() {}, clearInterval() {}, setTimeout() {} }
});
vm.runInContext(fs.readFileSync(path.join(clientRoot, 'config.js'), 'utf8'), context, { filename: 'config.js' });
const gameSource = fs.readFileSync(path.join(clientRoot, 'game.js'), 'utf8');
vm.runInContext(`${gameSource}\nwindow.TestParkingGame = Game;`, context, { filename: 'game.js' });
const Game = context.window.TestParkingGame;

function makeGame(round, hasParkingPass = true) {
  const calls = { resets: 0, lives: [], coach: [], retry: [], score: [], transitions: [] };
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    round,
    state: 'PLAYING',
    score: 0,
    parkCount: 0,
    lives: 3,
    hasParkingPass,
    passCoachShown: false,
    collisionCooldown: 0,
    attemptTimeRemaining: 1,
    shakeIntensity: 0,
    particles: [],
    soundEngine: { playCrash() {}, stopMusic() {}, playSuccess() {} },
    spawnSparks() {},
    spawnConfetti() {},
    inputManager: { resetAll() {} },
    map: {
      spawnPoint: { x: 100, y: 200, angle: 0 },
      getObstacleCountForRound() { return 1; },
      getMovingObstacleCountForRound() { return 0; }
    },
    bus: { reset() { calls.resets++; } },
    parkingJudge: {
      currentSpot: { id: 'practice' },
      setTargetSpot() {},
      setLocked() {}
    },
    ui: {
      updateAttemptTime(seconds) { calls.time = seconds; },
      updateLives(lives) { calls.lives.push(lives); },
      updateScore(score) { calls.score.push(score); },
      showCoach(message) { calls.coach.push(message); },
      hideCoach() {},
      showRoundTransition(round, obstacles, moving, scoreAdded, requiresPass, nameOverride) {
        calls.transitions.push({ round, scoreAdded, nameOverride });
      },
      showRetryBanner(message) { calls.retry.push(message); },
      showDamageBanner() {},
      showTimeoutBanner() {},
      showGameOver() {}
    }
  });
  return { game, calls };
}

// Round one is the practice round: collisions and timeouts never consume a life.
const practiceCollision = makeGame(1);
practiceCollision.game.handleCollision({ speed: 2, x: 10, y: 20 });
assert.strictEqual(practiceCollision.game.lives, 3, 'practice collision must not consume a life');
assert.strictEqual(practiceCollision.calls.time, 35, 'practice collision must restore the 35-second timer');
assert.strictEqual(practiceCollision.calls.resets, 1, 'practice collision must reset the bus safely');
assert(practiceCollision.calls.retry[0].includes('다시 도전'), 'practice collision must explain the retry');

const normalCollision = makeGame(2);
normalCollision.game.handleCollision({ speed: 2, x: 10, y: 20 });
assert.strictEqual(normalCollision.game.lives, 2, 'round two collision must consume a life');
assert.deepStrictEqual(normalCollision.calls.lives, [2], 'round two collision must surface the lost life');

const practiceTimeout = makeGame(1);
practiceTimeout.game.handleAttemptTimeout();
assert.strictEqual(practiceTimeout.game.lives, 3, 'practice timeout must not consume a life');
assert.strictEqual(practiceTimeout.game.state, 'TRANSITION', 'practice timeout must graduate to round two');
assert.strictEqual(practiceTimeout.calls.transitions[0].round, 2, 'practice timeout must advance to round two');
assert(practiceTimeout.calls.transitions[0].nameOverride.includes('연습을 다 하셨나요'), 'practice timeout must prompt before the real game');

const normalTimeout = makeGame(2);
normalTimeout.game.handleAttemptTimeout();
assert.strictEqual(normalTimeout.game.lives, 2, 'round two timeout must consume a life');

// A single, short coach line replaces the old multi-step explanation.
const practiceCoach = makeGame(1);
practiceCoach.game.showRoundCoach();
assert(practiceCoach.calls.coach[0].includes('연습라운드'), 'round one shows the practice label');
assert(practiceCoach.calls.coach[0].includes('목숨을 잃지 않아요'), 'round one explains that practice walls protect lives');

const roundTwoCoach = makeGame(2);
roundTwoCoach.game.showRoundCoach();
assert.strictEqual(roundTwoCoach.calls.coach.length, 0, 'the real game entry is announced by the round transition, not the coach');

const uiSource = fs.readFileSync(path.join(clientRoot, 'ui.js'), 'utf8');
assert(uiSource.includes('벽에 부딪혀서 목숨을 잃었어요'), 'wall collisions must announce the lost life');

// Practice parking never scores; the real rounds still do.
const practicePark = makeGame(1);
practicePark.game.attemptTimeRemaining = 20;
practicePark.game.handleParkingSuccess({ id: 'practice', x: 1, y: 1 });
assert.strictEqual(practicePark.game.score, 0, 'practice parking must not add score');
assert.strictEqual(practicePark.game.parkCount, 0, 'practice parking must not count as a park');
assert.deepStrictEqual(practicePark.calls.score, [], 'practice parking must not update the score display');
assert(practicePark.calls.transitions[0].nameOverride.includes('연습을 다 하셨나요'), 'practice parking must prompt before the real game');

const realPark = makeGame(2);
realPark.game.attemptTimeRemaining = 20;
realPark.game.handleParkingSuccess({ id: 'real', x: 1, y: 1 });
assert(realPark.game.score > 0, 'real parking must add score');
assert.strictEqual(realPark.game.parkCount, 1, 'real parking must count as a park');
assert(realPark.calls.transitions[0].scoreAdded > 0, 'real parking must show the earned points');
assert.strictEqual(realPark.calls.transitions[0].nameOverride, null, 'real rounds keep the standard transition copy');

const passCoach = makeGame(5, false);
passCoach.game.showRoundCoach();
assert(passCoach.calls.coach[0].includes('주차권'), 'pass rounds explain the parking pass requirement');
passCoach.game.showRoundCoach();
assert.strictEqual(passCoach.calls.coach.length, 1, 'the parking pass explanation is shown only once');

const plainCoach = makeGame(3, true);
plainCoach.game.showRoundCoach();
assert.strictEqual(plainCoach.calls.coach.length, 0, 'plain rounds show no coach text');

console.log('✅ PARKING TUTORIAL TEST PASSED: 35-second practice protection with a brief intro coach');
