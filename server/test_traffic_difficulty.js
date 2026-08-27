/**
 * Regression tests for obstacle-dodge score progression.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.join(__dirname, '..', 'client', 'js', 'traffic-game.js');
const source = `${fs.readFileSync(sourcePath, 'utf8')}\nwindow.ObstacleDodgeGame = ObstacleDodgeGame;`;
const context = vm.createContext({
  console,
  window: { addEventListener() {} }
});
vm.runInContext(source, context, { filename: 'traffic-game.js' });
vm.runInContext('Math.random = () => 0.5;', context);

const prototype = context.window.ObstacleDodgeGame.prototype;
const game = Object.create(prototype);
Object.assign(game, {
  score: 0,
  doubleWaveScore: 150,
  doubleLaserScore: 500,
  nextDownWaveIsDouble: true,
  nextSideWaveIsDouble: true,
  nextLaserOrientation: 'horizontal',
  lastLaserWaveSize: 0,
  lasers: [],
  lives: 1,
  heart: null,
  heartSpawnTimer: Infinity,
  heartOpportunityUsed: false,
  arena: { top: 24, bottom: 870, left: 120, right: 1480, rows: 9, columns: 11 },
  verticalStep: 94,
  cellWidth: (1480 - 120) / 11
});

game.score = 149;
assert.strictEqual(game.getWaveSize('down'), 1, 'Early waves must contain one obstacle');
game.score = 150;
assert.deepStrictEqual(
  [game.getWaveSize('down'), game.getWaveSize('down')],
  [2, 1],
  '150-point waves must alternate between two and one obstacles'
);
game.score = 350;
assert.strictEqual(game.getWaveSize('down'), 2, '350-point waves must always contain two obstacles');
game.score = 700;
game.nextDownWaveIsDouble = true;
assert.deepStrictEqual(
  [game.getWaveSize('down'), game.getWaveSize('down')],
  [3, 2],
  '700-point waves must alternate between three and two obstacles'
);

game.score = 499;
assert.strictEqual(game.getLaserWaveSize(), 1, 'Lasers must remain single before 500 points');
game.score = 500;
assert.strictEqual(game.getLaserWaveSize(), 2, 'Lasers must spawn in pairs from 500 points');
game.spawnLaserWave(game.getLaserWaveSize());
assert.strictEqual(game.lasers.length, 2, 'A 500-point laser wave must create two lasers together');
assert.deepStrictEqual(
  game.lasers.map((laser) => laser.orientation),
  ['horizontal', 'vertical'],
  'A laser pair must cover one horizontal and one vertical lane'
);

game.score = 0;
const earlyDownSpeed = game.getDownSpeed();
const earlySideSpeed = game.getSideSpeed();
const earlyDownDelay = game.getDownSpawnDelay();
const earlySideDelay = game.getSideSpawnDelay();
game.score = 800;
assert.ok(game.getDownSpeed() > earlyDownSpeed, 'Falling obstacles must speed up with score');
assert.ok(game.getSideSpeed() > earlySideSpeed, 'Side obstacles must speed up with score');
assert.ok(game.getDownSpawnDelay() < earlyDownDelay, 'Falling obstacles must spawn more often with score');
assert.ok(game.getSideSpawnDelay() < earlySideDelay, 'Side obstacles must spawn more often with score');

const starSpeed = game.pickStarSpeed();
const heartSpeed = game.pickHeartSpeed();
assert.ok(starSpeed >= 180, 'Stars must include a genuinely fast movement band');
assert.ok(heartSpeed > starSpeed, 'The extra-life heart must be harder to catch than a star');
game.scheduleHeartDrop();
assert.strictEqual(game.heartSpawnTimer, 2.5, 'The heart must wait a random 2-3 seconds at one life');
game.heartSpawnTimer = 9;
game.scheduleHeartDrop();
assert.strictEqual(game.heartSpawnTimer, 9, 'The heart opportunity must only be scheduled once per game');
game.player = { x: 800, y: 500 };
game.spawnHeart();
assert.strictEqual(game.heart.life, Infinity, 'The extra-life heart must stay until the player collects it');

console.log('✅ TRAFFIC DIFFICULTY TEST PASSED: progressive hazards + fast pickups + one-life heart');
