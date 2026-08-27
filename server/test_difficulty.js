/**
 * Regression test for the easy-to-hard parking progression.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const clientRoot = path.join(__dirname, '..', 'client', 'js');
const context = vm.createContext({ console, window: {} });

for (const file of ['config.js', 'map.js', 'parking.js']) {
  vm.runInContext(fs.readFileSync(path.join(clientRoot, file), 'utf8'), context, { filename: file });
}

const { CONFIG, GameMap, ParkingJudge } = context.window;
const map = new GameMap(CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
const judge = new ParkingJudge();

const easy = CONFIG.DIFFICULTY[0];
const medium = CONFIG.DIFFICULTY[1];
const hard = CONFIG.DIFFICULTY[2];

assert.ok(easy.spotWidth > medium.spotWidth && medium.spotWidth > hard.spotWidth, 'Parking bays must narrow by stage');
assert.ok(easy.angleToleranceDeg > medium.angleToleranceDeg && medium.angleToleranceDeg > hard.angleToleranceDeg, 'Angle tolerance must tighten by stage');
assert.ok(easy.dwellTimeSec < medium.dwellTimeSec && medium.dwellTimeSec < hard.dwellTimeSec, 'Required stop time must increase by stage');

const easySpot = map.getSpotForLevel(1, null, map.spawnPoint.x, map.spawnPoint.y);
const hardSpot = map.getSpotForLevel(3, null, map.spawnPoint.x, map.spawnPoint.y);
assert.strictEqual(easySpot.id, 2, 'Stage 1 must use the straight-ahead center bay');
assert.ok([4, 5].includes(hardSpot.id), 'Stage 3 must use a parallel parking bay');
assert.strictEqual(easySpot.width, easy.spotWidth);
assert.strictEqual(hardSpot.width, hard.spotWidth);

judge.setDifficulty(hard);
assert.strictEqual(judge.rules.angleToleranceDeg, hard.angleToleranceDeg);
assert.strictEqual(judge.rules.dwellTimeSec, hard.dwellTimeSec);

console.log('✅ DIFFICULTY TEST PASSED: 연습 → 보통 → 도전 progression is configured correctly');
