/**
 * Regression test: the bus must be able to leave its spawn point.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const clientRoot = path.join(__dirname, '..', 'client', 'js');
const context = vm.createContext({ console, window: {} });

for (const file of ['config.js', 'map.js', 'bus.js', 'collision.js']) {
  const source = fs.readFileSync(path.join(clientRoot, file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

const { CONFIG, GameMap, Bus, CollisionSystem } = context.window;
const map = new GameMap(CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
const bus = new Bus(map.spawnPoint.x, map.spawnPoint.y, map.spawnPoint.angle);

assert.strictEqual(
  CollisionSystem.checkBusCollisions(bus, map),
  false,
  'Bus spawn must not overlap a boundary wall or obstacle'
);

const startY = bus.y;
for (let frame = 0; frame < 30; frame++) {
  bus.update({ forward: true, backward: false, left: false, right: false });
  CollisionSystem.checkBusCollisions(bus, map);
}

assert.ok(bus.y < startY - 10, `Bus should move forward from y=${startY}, got y=${bus.y}`);
assert.ok(bus.speed > 0, `Bus should have positive forward speed, got ${bus.speed}`);

const steeringBus = new Bus(map.spawnPoint.x, map.spawnPoint.y, map.spawnPoint.angle);
for (let frame = 0; frame < 12; frame++) {
  steeringBus.update({ forward: false, backward: false, left: true, right: false });
}
const heldSteeringAngle = steeringBus.steeringAngle;
assert.ok(heldSteeringAngle < 0, `Left input should turn the wheel left, got ${heldSteeringAngle}`);
assert.ok(
  Math.abs(heldSteeringAngle) < CONFIG.BUS.MAX_STEER_ANGLE * 0.5,
  `A short steering input should allow fine adjustment, got ${heldSteeringAngle}`
);
for (let frame = 0; frame < 30; frame++) {
  steeringBus.update({ forward: false, backward: false, left: false, right: false });
}
assert.strictEqual(
  steeringBus.steeringAngle,
  heldSteeringAngle,
  'Steering angle must remain latched after the left/right input is released'
);
const steeringGuide = steeringBus.getSteeringGuidePoints();
assert.ok(steeringGuide.length > 2, 'A turned wheel should produce a dotted trajectory guide');
assert.ok(
  steeringGuide[steeringGuide.length - 1].x < steeringGuide[0].x,
  'A left steering angle should project the forward guide toward the left'
);
const anchoredGuideStart = { ...steeringBus.steeringGuidePoints[0] };
steeringBus.update({ forward: true, backward: false, left: false, right: false });
assert.strictEqual(steeringBus.steeringGuidePoints[0].x, anchoredGuideStart.x);
assert.strictEqual(
  steeringBus.steeringGuidePoints[0].y,
  anchoredGuideStart.y,
  'The trajectory guide should stay anchored to the map while the bus moves'
);

for (const round of [1, 3, 10, 18, 22]) {
  map.setRound(round);
  const stageBus = new Bus(map.spawnPoint.x, map.spawnPoint.y, map.spawnPoint.angle);
  assert.strictEqual(
    CollisionSystem.checkBusCollisions(stageBus, map),
    false,
    `Round ${round} spawn must be clear of walls and obstacles`
  );
}

console.log(`✅ PHYSICS TEST PASSED: bus moved from y=${startY.toFixed(1)} to y=${bus.y.toFixed(1)} and steering stayed latched`);
