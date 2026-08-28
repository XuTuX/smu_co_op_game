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
  game.roundCount = 0;
  game.tempoFactor = 1;
  game.commandTargets = null;
  game.doubleRopeMode = false;
  game.modeLabel = '전원 점프';
  game.combo = 0;
  game.bestCombo = 0;
  game.feverGauge = 0;
  game.feverRemaining = 0;
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
speedGame.roundCount = 35;
assert(speedGame.getRopeSpeed() > startingSpeed, 'rope speed should increase during the round');

const geometryGame = makeHarness();
geometryGame.ropeAngle = Math.PI / 2;
const bottomGeometry = geometryGame.getRopeGeometry();
assert.strictEqual(bottomGeometry.midpointY, 686, 'visible rope midpoint should reach the collision ground');
assert.strictEqual(bottomGeometry.controlY, 934, 'quadratic control point must compensate for midpoint interpolation');
assert(Math.abs(bottomGeometry.midpointY - geometryGame.groundY) <= 4, 'rope and player feet must meet visually');

const eventGame = makeHarness();
eventGame.doubleRopeMode = true;
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

const commandGame = makeHarness();
commandGame.roundCount = 4;
commandGame.applyRoundMode(false);
assert.deepStrictEqual(Array.from(commandGame.commandTargets), ['backward'], 'round five should command red-only jump');
assert(commandGame.getModeHtml().includes('rope-command-color red'), 'solo instruction should color the red name without a generic all-jump message');
assert(commandGame.getModeHtml().includes('만 점프!'), 'solo instruction should explicitly say only that color jumps');
commandGame.players[1].height = 100;
commandGame.resolveRopePass();
assert.strictEqual(commandGame.players[1].clears, 1, 'red should score when red-only is commanded');
assert.deepStrictEqual(commandGame.players.map((player) => player.lives), [3, 3, 3, 3], 'players who correctly stay grounded should keep their lives');

const sequenceGame = makeHarness();
for (let round = 0; round < 4; round++) {
  sequenceGame.roundCount = round;
  sequenceGame.applyRoundMode(false);
  assert.strictEqual(sequenceGame.commandTargets, null, 'the first four passes should always command everyone');
  assert.strictEqual(sequenceGame.doubleRopeMode, false, 'the first four passes should use one rope');
}
sequenceGame.roundCount = 5;
sequenceGame.applyRoundMode(false);
assert.deepStrictEqual(Array.from(sequenceGame.commandTargets), ['forward', 'backward'], 'the pair command should follow the solo command');
assert(sequenceGame.getModeHtml().includes('yellow') && sequenceGame.getModeHtml().includes('red'), 'pair instruction should color both requested names');
sequenceGame.roundCount = 6;
sequenceGame.applyRoundMode(false);
assert.strictEqual(sequenceGame.doubleRopeMode, true, 'two-rope mode should follow the two color commands');
assert.strictEqual(sequenceGame.commandTargets, null, 'two-rope mode must always command everyone');
sequenceGame.roundCount = 8;
sequenceGame.applyRoundMode(false);
assert.strictEqual(sequenceGame.tempoFactor, 0.68, 'slow tempo should follow two-rope mode');
sequenceGame.roundCount = 10;
sequenceGame.applyRoundMode(false);
assert.strictEqual(sequenceGame.tempoFactor, 1.45, 'fast tempo should follow slow tempo');
sequenceGame.roundCount = 12;
sequenceGame.applyRoundMode(false);
assert.deepStrictEqual(Array.from(sequenceGame.commandTargets), ['left'], 'the next cycle should rotate the solo color');

console.log('✅ JUMP ROPE TEST PASSED: four all-jumps, colored solo/pair commands, all-player double ropes, slow/fast tempo, and lives work');
