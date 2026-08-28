/** Regression tests for independent players in the shared-rope game. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const context = vm.createContext({
  console,
  requestAnimationFrame() {},
  document: {},
  window: { addEventListener() {} }
});

const source = fs.readFileSync(path.join(__dirname, '..', 'client/js/jump-rope.js'), 'utf8');
vm.runInContext(`${source}\nwindow.TestJumpRopeGame = TeamJumpRopeGame;`, context, { filename: 'jump-rope.js' });
const GameClass = context.window.TestJumpRopeGame;

function makeHarness() {
  const game = Object.create(GameClass.prototype);
  game.playerMeta = [
    { action: 'forward', label: 'P1', key: 'W' },
    { action: 'backward', label: 'P2', key: 'S' },
    { action: 'left', label: 'P3', key: 'A' },
    { action: 'right', label: 'P4', key: 'D' }
  ];
  game.playerXs = [500, 700, 900, 1100];
  game.jumpVelocity = 760;
  game.clearHeight = 68;
  game.gameDuration = 60;
  game.elapsed = 0;
  game.score = 0;
  game.perfectCount = 0;
  game.combo = 0;
  game.bestCombo = 0;
  game.feverGauge = 0;
  game.feverRemaining = 0;
  game.doubleRopeRemaining = 0;
  game.feedbacks = [];
  game.particles = [];
  game.shake = 0;
  game.hitFreeze = 0;
  game.ropeCenterY = 438;
  game.ropeRadius = 248;
  game.groundY = 690;
  game.ropeAngle = -Math.PI / 2;
  game.state = 'PLAYING';
  game.players = game.createPlayers();
  game.soundEngine = { playBeep() {}, playSuccess() {}, playCrash() {} };
  game.showCallout = () => {};
  game.endGame = () => {};
  return game;
}

const jumpGame = makeHarness();
assert.strictEqual(jumpGame.jumpPlayer('left'), true, 'P3 input should start P3 jump');
assert.strictEqual(jumpGame.players[2].velocity, 760, 'P3 should receive jump velocity');
assert.strictEqual(jumpGame.players[0].velocity, 0, 'P1 must remain independent from P3');
assert.strictEqual(jumpGame.players[1].velocity, 0, 'P2 must remain independent from P3');
assert.strictEqual(jumpGame.players[3].velocity, 0, 'P4 must remain independent from P3');

const passGame = makeHarness();
passGame.players[0].height = 90;
passGame.players[1].height = 80;
passGame.players[2].height = 0;
passGame.players[3].height = 100;
passGame.resolveRopePass();
assert.deepStrictEqual(
  passGame.players.map((player) => player.clears),
  [1, 1, 0, 1],
  'only players above the rope-clear height should score'
);
assert.deepStrictEqual(
  passGame.players.map((player) => player.lives),
  [3, 3, 2, 3],
  'a miss should reduce only that player\'s life'
);
assert.strictEqual(passGame.score, 3, 'team score should sum individual clears');
assert.strictEqual(passGame.perfectCount, 0, 'mixed pass should not count as perfect');

passGame.players.forEach((player) => { player.height = 100; });
passGame.resolveRopePass();
assert.strictEqual(passGame.score, 7, 'four clear players should add four team points');
assert.strictEqual(passGame.perfectCount, 1, 'all four clearing together should count as perfect');

const speedGame = makeHarness();
const startingSpeed = speedGame.getRopeSpeed();
speedGame.elapsed = 60;
assert(speedGame.getRopeSpeed() > startingSpeed, 'rope speed should increase during the round');

const geometryGame = makeHarness();
geometryGame.ropeAngle = Math.PI / 2;
const bottomGeometry = geometryGame.getRopeGeometry();
assert.strictEqual(bottomGeometry.midpointY, 686, 'visible rope midpoint should reach the collision ground');
assert.strictEqual(bottomGeometry.controlY, 934, 'quadratic control point must compensate for midpoint interpolation');
assert(Math.abs(bottomGeometry.midpointY - geometryGame.groundY) <= 4, 'rope and player feet must meet visually');

const eventGame = makeHarness();
eventGame.doubleRopeRemaining = 5;
assert.deepStrictEqual(Array.from(eventGame.getRopeOffsets()), [0, Math.PI], 'double-rope event should render and judge two ropes');

const feverGame = makeHarness();
feverGame.players.forEach((player) => { player.height = 100; });
feverGame.resolveRopePass();
feverGame.resolveRopePass();
feverGame.resolveRopePass();
assert.strictEqual(feverGame.combo, 3, 'three full-team clears should build a three combo');
assert.strictEqual(feverGame.feverRemaining, 7, 'three perfect clears should activate seven-second fever');
feverGame.resolveRopePass();
assert.strictEqual(feverGame.score, 20, 'fever should double all four clear points');

console.log('✅ JUMP ROPE TEST PASSED: floor sync, double ropes, combo fever, lives, and scoring work');
