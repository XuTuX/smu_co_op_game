/**
 * Regression test for endless parking rounds and obstacle progression.
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
const rules = CONFIG.PARKING_DIFFICULTY;

assert.strictEqual(CONFIG.PARKING_RUN.STARTING_LIVES, 3, 'Parking must start with three lives');
assert.strictEqual(CONFIG.PARKING_RUN.ATTEMPT_TIME_SEC, 40, 'Each parking attempt must last 40 seconds');
assert.strictEqual(CONFIG.SCORING.PARKING_SUCCESS, 100);
assert.strictEqual(CONFIG.PARKING_STAGE_DURATION, undefined, 'Endless parking must not have a stage timer');

const expectedObstacleCounts = new Map([
  [1, 0], [2, 0], [3, 1], [4, 2], [5, 3], [7, 5], [1000, 5]
]);
for (const [round, expectedCount] of expectedObstacleCounts) {
  map.setRound(round);
  assert.strictEqual(map.obstacles.length, expectedCount, `Round ${round} obstacle count`);
  assert.strictEqual(map.stageName, '무한 주차장', 'The visual map must stay the same between rounds');
  assert.strictEqual(map.theme.ground, '#202731', 'The ground theme must not jump between rounds');
}

map.setRound(10);
assert.ok(map.obstacles.some((obstacle) => obstacle.type === 'maintenance-cart'), 'Later rounds need moving maintenance carts');
assert.ok(map.obstacles.some((obstacle) => obstacle.type !== 'maintenance-cart'), 'Later rounds need real static road hazards');
assert.ok(map.obstacles.some((obstacle) => obstacle.type === 'wall-segment'), 'Later rounds need real collision wall segments');
assert.strictEqual(new Set(map.obstacles.map((obstacle) => `${obstacle.x},${obstacle.y}`)).size, 5, 'Random hazards need unique positions');

for (let layoutAttempt = 0; layoutAttempt < 30; layoutAttempt++) {
  map.setRound(10);
  assert.strictEqual(map.obstacles.length, 5, 'Every random layout must fit all five hazards');
  for (let i = 0; i < map.obstacles.length; i++) {
    const boundsA = map.getObstacleBounds(map.obstacles[i]);
    for (let j = i + 1; j < map.obstacles.length; j++) {
      const boundsB = map.getObstacleBounds(map.obstacles[j]);
      assert.strictEqual(map.boundsOverlap(boundsA, boundsB, 20), false, 'Hazard bodies and moving paths must not overlap');
    }
    for (const parkingSpot of map.parkingSpots) {
      assert.strictEqual(
        map.boundsOverlap(boundsA, map.getParkingSpotBounds(parkingSpot), 8),
        false,
        'Hazards must not overlap any future parking bay'
      );
    }
  }
}

map.setRound(5);
assert.strictEqual(map.getMovingObstacleCountForRound(4), 0, 'Moving hazards must wait until round five');
assert.strictEqual(map.getMovingObstacleCountForRound(5), 1, 'Round five must introduce a moving hazard');
const movingCart = map.obstacles.find((obstacle) => obstacle.motion);
const cartStartY = movingCart.y;
map.update(0.5);
assert.notStrictEqual(movingCart.y, cartStartY, 'Maintenance cart must move during play');

const passTarget = map.getSpotForRound(5, null, map.spawnPoint.x, map.spawnPoint.y);
const parkingPass = map.spawnParkingPass(5, map.spawnPoint.x, map.spawnPoint.y, passTarget);
assert.ok(parkingPass, 'Round five must have a safe parking-pass pickup position');
const passBounds = {
  minX: parkingPass.x - 25, maxX: parkingPass.x + 25,
  minY: parkingPass.y - 25, maxY: parkingPass.y + 25
};
for (const obstacle of map.obstacles) {
  assert.strictEqual(map.boundsOverlap(passBounds, map.getObstacleBounds(obstacle), 20), false, 'Parking pass must not overlap a hazard');
}
assert.strictEqual(map.collectParkingPass({ x: parkingPass.x, y: parkingPass.y }), true, 'Bus must collect the parking pass');
assert.strictEqual(map.parkingPass, null, 'Collected parking pass must disappear');

map.setRound(1);
map.advanceRound(3, 600, 400);
const firstObstacle = { ...map.obstacles[0] };
map.advanceRound(4, 600, 400);
assert.strictEqual(map.obstacles.length, 2, 'Each round after round two must add one obstacle');
assert.strictEqual(map.obstacles[0].x, firstObstacle.x, 'Existing obstacles must remain in the same space');
assert.strictEqual(map.obstacles[0].y, firstObstacle.y, 'Existing obstacle positions must persist between rounds');
assert.ok(Math.hypot(map.obstacles[1].x - 600, map.obstacles[1].y - 400) >= 200, 'A new obstacle must not spawn on the parked bus');

map.setRound(1);
const spotIds = [];
let previousSpotId = null;
for (let round = 1; round <= 12; round++) {
  map.setRound(round);
  const spot = map.getSpotForRound(round, previousSpotId, map.spawnPoint.x, map.spawnPoint.y);
  assert.notStrictEqual(spot.id, previousSpotId, 'Consecutive rounds must use a different target bay');
  spotIds.push(spot.id);
  previousSpotId = spot.id;
}
assert.ok(new Set(spotIds).size >= 5, 'Endless rounds should rotate through several bays');

judge.setDifficulty(rules);
assert.strictEqual(judge.rules.angleToleranceDeg, rules.angleToleranceDeg);
assert.strictEqual(judge.rules.dwellTimeSec, rules.dwellTimeSec);
judge.setLocked(true);
assert.strictEqual(judge.isLocked, true, 'Parking judgment must lock until the pass is collected');

const gameSource = fs.readFileSync(path.join(clientRoot, 'game.js'), 'utf8');
const mapSource = fs.readFileSync(path.join(clientRoot, 'map.js'), 'utf8');
assert(!gameSource.includes('timeRemaining'), 'Parking game loop must not count down time');
assert(gameSource.includes('this.lives--'), 'A collision must remove a life');
assert(gameSource.includes('const nextRound = this.round + 1'), 'Parking success must always advance another round');
assert(gameSource.includes('CONFIG.SCORING.PARKING_SUCCESS + timeBonus'), 'Parking score must be 100 plus remaining time');
assert(gameSource.includes('handleAttemptTimeout'), 'A 40-second timeout must consume a life and retry');
assert(gameSource.includes('this.round < 5'), 'Parking-pass requirement must begin at round five');
const successSource = gameSource.slice(gameSource.indexOf('handleParkingSuccess'), gameSource.indexOf('handleCollision'));
assert(successSource.includes('this.map.advanceRound'), 'Round clears must add to the existing lot');
assert(!successSource.includes('this.bus.reset'), 'The bus must continue from its parked position');
assert(mapSource.includes('if (this.round < 3) return;'), 'Course markings must begin after the practice rounds');
assert(mapSource.includes('drawCourseArrow'), 'Later rounds need painted direction arrows');
assert(!mapSource.includes('drawHatchedMarking'), 'Painted non-collision hatch zones must not look like walls');
assert(mapSource.includes("filter((spot) => spot.id === this.activeParkingSpotId)"), 'Only the active parking bay may be visible');

console.log('✅ DIFFICULTY TEST PASSED: endless lives-based rounds add obstacles without changing the map');
