/** Regression tests for the left/right three-beat timing-jump game. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const context = vm.createContext({
  console,
  requestAnimationFrame() {},
  document: {},
  window: { addEventListener() {}, clearTimeout() {}, setTimeout() { return 1; } }
});
const source = fs.readFileSync(path.join(__dirname, '..', 'client/js/beat-jump.js'), 'utf8');
const pageSource = fs.readFileSync(path.join(__dirname, '..', 'client/beat-jump.html'), 'utf8');
vm.runInContext(`${source}\nwindow.TestBeatJumpGame = BeatJumpGame;`, context, { filename: 'beat-jump.js' });
const GameClass = context.window.TestBeatJumpGame;

assert(!source.includes("'MISS!'"), 'the game should not show a miss callout');
assert(!pageSource.includes('실수') && !pageSource.includes('ONE MISS'), 'the page should not show miss wording');

function makeHarness() {
  const game = Object.create(GameClass.prototype);
  game.actions = ['forward', 'backward', 'left', 'right'];
  game.playerMeta = [
    { action: 'forward', label: 'P1', key: 'W', color: '#facc15' },
    { action: 'backward', label: 'P2', key: 'S', color: '#fb7185' },
    { action: 'left', label: 'P3', key: 'A', color: '#38bdf8' },
    { action: 'right', label: 'P4', key: 'D', color: '#4ade80' }
  ];
  game.playerXs = [500, 700, 900, 1100];
  game.groundY = 680;
  game.jumpVelocity = 790;
  game.gameDuration = 60;
  game.elapsed = 0;
  game.waveNumber = 0;
  game.nextDirection = 1;
  game.score = 0;
  game.sharedLives = 3;
  game.combo = 0;
  game.bestCombo = 0;
  game.feverGauge = 0;
  game.feverRemaining = 0;
  game.feedbacks = [];
  game.particles = [];
  game.shake = 0;
  game.hitFreeze = 0;
  game.players = game.createPlayers();
  game.waveTypes = {
    cone: { width: 84, height: 62, speed: 430, color: '#fb923c' },
    barrel: { width: 78, height: 78, speed: 480, color: '#a16207' },
    cart: { width: 132, height: 88, speed: 590, color: '#8b5cf6' }
  };
  game.soundEngine = { playBeep() {}, playSuccess() {}, playCrash() {} };
  game.showCallout = () => {};
  game.showDirection = () => {};
  game.endGame = () => {};
  return game;
}

const directionGame = makeHarness();
const leftObstacle = directionGame.makeObstacle('cone', 1, 0, 1);
const rightObstacle = directionGame.makeObstacle('cone', -1, 0, 2);
assert(leftObstacle.x < directionGame.playerXs[0] && leftObstacle.direction === 1, 'left obstacle should enter toward P1 first');
assert(rightObstacle.x > directionGame.playerXs[3] && rightObstacle.direction === -1, 'right obstacle should enter toward P4 first');

const jumpGame = makeHarness();
jumpGame.soundEngine.playBeep = () => {};
assert.strictEqual(jumpGame.jumpPlayer('left'), true, 'P3 button should jump P3');
assert.strictEqual(jumpGame.players[2].velocity, 790, 'P3 should receive jump velocity');
assert.deepStrictEqual(jumpGame.players.map((player) => player.velocity), [0, 0, 790, 0], 'the other three players must stay independent');

const judgeGame = makeHarness();
judgeGame.wave = { perfect: true, successes: 0 };
judgeGame.players[1].height = 100;
judgeGame.judgePlayer(judgeGame.players[1], leftObstacle);
assert.strictEqual(judgeGame.players[1].clears, 1, 'jumping P2 should clear its obstacle');
assert.strictEqual(judgeGame.score, 1, 'one independent clear should add one point');
assert.deepStrictEqual(judgeGame.players.map((player) => player.lives), [3, 3, 3, 3], 'a clear must not affect any life');
judgeGame.judgePlayer(judgeGame.players[3], leftObstacle);
assert.strictEqual(judgeGame.sharedLives, 2, 'one miss should remove exactly one shared team life');
assert.deepStrictEqual(judgeGame.players.map((player) => player.lives), [3, 3, 3, 3], 'timing jump should not use individual lives');
assert.strictEqual(judgeGame.wave.perfect, false, 'any individual miss should break the perfect wave');

const warningGame = makeHarness();
warningGame.warning = { plan: { count: 1, directions: [1], label: '왼쪽 1개', type: 'cone' }, elapsed: 0, duration: 1.25 };
let spawned = 0;
warningGame.spawnWave = () => { spawned++; };
warningGame.updateWarning(1.0);
assert.strictEqual(spawned, 0, 'direction warning should remain visible briefly before launch');
warningGame.updateWarning(0.26);
assert.strictEqual(spawned, 1, 'one obstacle should launch after the simple warning');

const waveGame = makeHarness();
waveGame.obstacles = [];
waveGame.warning = { plan: { count: 1, directions: [1], label: '왼쪽 1개', type: 'cone' } };
waveGame.spawnWave();
assert.strictEqual(waveGame.obstacles.length, 1, 'each wave should contain exactly one clean obstacle');
assert.strictEqual(waveGame.obstacles[0].direction, 1, 'the obstacle should follow the announced direction');
waveGame.waveNumber = 6;
assert.strictEqual(waveGame.chooseObstacleType(), 'cone', 'obstacle types should stay simple and deterministic');
waveGame.waveNumber = 8;
assert.strictEqual(waveGame.chooseObstacleType(), 'cart', 'later waves may use one faster cart');

const progressionGame = makeHarness();
progressionGame.waveNumber = 0;
let plan = progressionGame.chooseWavePlan();
assert.strictEqual(plan.count, 1, 'the opening should use one obstacle');
progressionGame.waveNumber = 3;
plan = progressionGame.chooseWavePlan();
assert.strictEqual(plan.count, 2, 'the middle section should introduce two obstacles');
progressionGame.waveNumber = 7;
plan = progressionGame.chooseWavePlan();
assert.strictEqual(plan.count, 3, 'the later section should introduce three obstacles');

const mixedGame = makeHarness();
mixedGame.waveNumber = 5;
plan = mixedGame.chooseWavePlan();
assert.strictEqual(plan.count, 2, 'mixed-side variation should retain the correct obstacle count');
assert.deepStrictEqual(Array.from(plan.directions), [1, -1], 'two-obstacle variation should alternate left and right entry');
mixedGame.obstacles = [];
mixedGame.warning = { plan };
mixedGame.spawnWave();
assert.strictEqual(mixedGame.obstacles.length, 2, 'two-obstacle plan should spawn two separate obstacles');
assert.deepStrictEqual(mixedGame.obstacles.map((obstacle) => obstacle.direction), [1, -1], 'spawn order should preserve the announced side sequence');
const delayedRightObstacle = mixedGame.obstacles[1];
assert(delayedRightObstacle.x > 1920, 'the second obstacle should wait outside the right entrance');
assert.strictEqual(
  mixedGame.shouldKeepObstacle(delayedRightObstacle),
  true,
  'a delayed obstacle must not be deleted before it enters the screen'
);
assert.strictEqual(
  mixedGame.shouldKeepObstacle({ direction: 1, x: 1920 }),
  false,
  'a left-entering obstacle should be removed after it exits on the right'
);
assert.strictEqual(
  mixedGame.shouldKeepObstacle({ direction: -1, x: -320 }),
  false,
  'a right-entering obstacle should be removed after it exits on the left'
);
for (const playerX of mixedGame.playerXs) {
  const arrivalTimes = mixedGame.obstacles.map((obstacle) => obstacle.direction > 0
    ? (playerX - obstacle.x) / obstacle.speed
    : (obstacle.x - playerX) / obstacle.speed
  ).sort((a, b) => a - b);
  assert(
    arrivalTimes[1] - arrivalTimes[0] >= 1,
    `opposite-side obstacles must leave landing time at player x=${playerX}`
  );
}

const tripleMixedGame = makeHarness();
tripleMixedGame.waveNumber = 8;
plan = tripleMixedGame.chooseWavePlan();
assert.deepStrictEqual(Array.from(plan.directions), [1, -1, 1], 'later mixed wave should alternate three entry sides');
tripleMixedGame.obstacles = [];
tripleMixedGame.warning = { plan };
tripleMixedGame.spawnWave();
for (const playerX of tripleMixedGame.playerXs) {
  const arrivalTimes = tripleMixedGame.obstacles.map((obstacle) => obstacle.direction > 0
    ? (playerX - obstacle.x) / obstacle.speed
    : (obstacle.x - playerX) / obstacle.speed
  ).sort((a, b) => a - b);
  for (let index = 1; index < arrivalTimes.length; index++) {
    assert(arrivalTimes[index] - arrivalTimes[index - 1] >= 1, 'three-way cross wave must remain physically jumpable');
  }
}

console.log('✅ BEAT JUMP TEST PASSED: one-to-three obstacle progression, changing side order, shared lives, and independent jumps work');
