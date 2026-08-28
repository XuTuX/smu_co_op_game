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
  game.sharedLives = 3;
  game.roundCount = 0;
  game.tempoFactor = 1;
  game.commandTargets = null;
  game.doubleRopeMode = false;
  game.modeLabel = '전원 점프';
  game.currentMode = 'all';
  game.modePassesRemaining = 4;
  game.modeBag = [];
  game.lastMode = null;
  game.random = () => 0;
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
assert.strictEqual(passGame.sharedLives, 2, 'one or more misses in a pass should remove exactly one shared life');
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
commandGame.currentMode = 'solo';
commandGame.commandTargets = ['backward'];
commandGame.applyRoundMode(false);
assert.deepStrictEqual(Array.from(commandGame.commandTargets), ['backward'], 'solo mode should command a living red player');
assert(commandGame.getModeHtml().includes('rope-command-color red'), 'solo instruction should color the red name without a generic all-jump message');
assert(commandGame.getModeHtml().includes('만 점프!'), 'solo instruction should explicitly say only that color jumps');
commandGame.players[1].height = 100;
commandGame.resolveRopePass();
assert.strictEqual(commandGame.players[1].clears, 1, 'red should score when red-only is commanded');
assert.strictEqual(commandGame.sharedLives, 3, 'a correct color command should keep all shared lives');

const sequenceGame = makeHarness();
sequenceGame.modeBag = ['solo'];
for (let pass = 0; pass < 3; pass++) {
  sequenceGame.advanceRoundMode(false);
  assert.strictEqual(sequenceGame.commandTargets, null, 'the first four passes should always command everyone');
  assert.strictEqual(sequenceGame.doubleRopeMode, false, 'the first four passes should use one rope');
}
sequenceGame.advanceRoundMode(false);
assert.strictEqual(sequenceGame.currentMode, 'solo', 'a random event should begin after four all-player passes');
assert.deepStrictEqual(Array.from(sequenceGame.commandTargets), ['forward'], 'random solo target should be selected from living players');

const pairGame = makeHarness();
pairGame.currentMode = 'pair';
pairGame.applyRoundMode(false);
assert.deepStrictEqual(Array.from(pairGame.commandTargets), ['forward', 'backward'], 'pair mode should choose two living players');
assert(pairGame.getModeHtml().includes('yellow') && pairGame.getModeHtml().includes('red'), 'pair instruction should color both requested names');

const oneShotCommandGame = makeHarness();
oneShotCommandGame.random = () => 0.9;
oneShotCommandGame.modeBag = ['solo'];
oneShotCommandGame.selectRandomMode();
assert.strictEqual(oneShotCommandGame.modePassesRemaining, 1, 'a solo target must be announced for one rope pass only');
oneShotCommandGame.modeBag = ['pair'];
oneShotCommandGame.selectRandomMode();
assert.strictEqual(oneShotCommandGame.modePassesRemaining, 1, 'a pair target must be announced for one rope pass only');

const doubleGame = makeHarness();
doubleGame.currentMode = 'double';
doubleGame.applyRoundMode(false);
assert.strictEqual(doubleGame.doubleRopeMode, true, 'random double mode should render and judge two ropes');
assert.strictEqual(doubleGame.commandTargets, null, 'two-rope mode must always command everyone');

const tempoGame = makeHarness();
tempoGame.currentMode = 'slow';
tempoGame.applyRoundMode(false);
assert.strictEqual(tempoGame.tempoFactor, 0.68, 'random slow mode should lower rope speed');
tempoGame.currentMode = 'fast';
tempoGame.applyRoundMode(false);
assert.strictEqual(tempoGame.tempoFactor, 1.45, 'random fast mode should raise rope speed');

const sharedLifeGame = makeHarness();
sharedLifeGame.commandTargets = null;
sharedLifeGame.players.forEach((player) => { player.height = 0; });
sharedLifeGame.resolveRopePass();
assert.strictEqual(sharedLifeGame.sharedLives, 2, 'four simultaneous misses must still cost only one shared life');
sharedLifeGame.resolveRopePass();
sharedLifeGame.resolveRopePass();
assert.strictEqual(sharedLifeGame.sharedLives, 0, 'the game should end when the third shared life is lost');

const bagGame = makeHarness();
bagGame.random = () => 0.25;
const randomModes = [];
for (let i = 0; i < 5; i++) {
  bagGame.selectRandomMode();
  randomModes.push(bagGame.currentMode);
}
assert.deepStrictEqual(randomModes.sort(), ['double', 'fast', 'pair', 'slow', 'solo'], 'one shuffled bag should contain every random event exactly once');

console.log('✅ JUMP ROPE TEST PASSED: random event bag, colored commands, double ropes, tempo shifts, and three shared lives work');
