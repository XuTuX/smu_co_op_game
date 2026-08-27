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

console.log(`✅ PHYSICS TEST PASSED: bus moved from y=${startY.toFixed(1)} to y=${bus.y.toFixed(1)}`);
