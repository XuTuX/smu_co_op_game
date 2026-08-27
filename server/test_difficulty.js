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

map.setStage(1);
const easySpot = map.getSpotForLevel(1, null, map.spawnPoint.x, map.spawnPoint.y);
assert.strictEqual(map.parkingSpots.length, 1, 'Stage 1 must show exactly one parking bay');
const stageGrounds = [map.theme.ground];
const stageNames = [map.stageName];

map.setStage(2);
const mediumSpot = map.getSpotForLevel(2, null, map.spawnPoint.x, map.spawnPoint.y);
assert.strictEqual(map.parkingSpots.length, 1, 'Stage 2 must show exactly one parking bay');
stageGrounds.push(map.theme.ground);
stageNames.push(map.stageName);

map.setStage(3);
const hardSpot = map.getSpotForLevel(3, null, map.spawnPoint.x, map.spawnPoint.y);
assert.strictEqual(map.parkingSpots.length, 1, 'Stage 3 must show exactly one parking bay');
stageGrounds.push(map.theme.ground);
stageNames.push(map.stageName);

assert.strictEqual(easySpot.id, 2, 'Stage 1 must use the straight-ahead center bay');
assert.strictEqual(mediumSpot.id, 1, 'Stage 2 must use its single construction-zone bay');
assert.strictEqual(hardSpot.id, 4, 'Stage 3 must use its single parallel parking bay');
assert.strictEqual(easySpot.width, easy.spotWidth);
assert.strictEqual(hardSpot.width, hard.spotWidth);
assert.strictEqual(new Set(stageGrounds).size, 3, 'Every stage must have a distinct ground theme');
assert.strictEqual(new Set(stageNames).size, 3, 'Every stage must have a distinct map name');

judge.setDifficulty(hard);
assert.strictEqual(judge.rules.angleToleranceDeg, hard.angleToleranceDeg);
assert.strictEqual(judge.rules.dwellTimeSec, hard.dwellTimeSec);

console.log('✅ DIFFICULTY TEST PASSED: 연습 → 보통 → 도전 progression is configured correctly');
