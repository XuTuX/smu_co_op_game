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
vm.runInContext(`${source}\nwindow.TestBeatJumpGame = BeatJumpGame;`, context, { filename: 'beat-jump.js' });
const GameClass = context.window.TestBeatJumpGame;

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
warningGame.warning = { type: 'cone', direction: 1, elapsed: 0, duration: 1.15 };
let spawned = 0;
warningGame.spawnWave = () => { spawned++; };
warningGame.updateWarning(1.0);
assert.strictEqual(spawned, 0, 'direction warning should remain visible briefly before launch');
warningGame.updateWarning(0.16);
assert.strictEqual(spawned, 1, 'one obstacle should launch after the simple warning');

const waveGame = makeHarness();
waveGame.obstacles = [];
waveGame.warning = { type: 'cone', direction: 1 };
waveGame.spawnWave();
assert.strictEqual(waveGame.obstacles.length, 1, 'each wave should contain exactly one clean obstacle');
assert.strictEqual(waveGame.obstacles[0].direction, 1, 'the obstacle should follow the announced direction');
waveGame.waveNumber = 6;
assert.strictEqual(waveGame.chooseObstacleType(), 'cone', 'obstacle types should stay simple and deterministic');
waveGame.waveNumber = 8;
assert.strictEqual(waveGame.chooseObstacleType(), 'cart', 'later waves may use one faster cart');

console.log('✅ BEAT JUMP TEST PASSED: simple direction warning, one obstacle, shared lives, and independent jumps work');
