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
const pageSource = fs.readFileSync(path.join(__dirname, '..', 'client/beat-jump.html'), 'utf8');
const boxCharacterSource = fs.readFileSync(path.join(__dirname, '..', 'client/js/box-character.js'), 'utf8');
vm.runInContext(`${source}\nwindow.TestBeatJumpGame = BeatJumpGame;`, context, { filename: 'beat-jump.js' });
const GameClass = context.window.TestBeatJumpGame;

assert(!source.includes("'MISS!'"), 'the game should not show a miss callout');
assert(!pageSource.includes('실수') && !pageSource.includes('ONE MISS'), 'the page should not show miss wording');
assert(!source.includes('player.misses') && !source.includes('beat-player-results'), 'the game should not expose individual failure records');
assert(!source.includes('CLEAR +1') && !source.includes('WATCH LEFT'), 'the playfield should stay free of redundant helper text');
assert(!pageSource.includes('INPUT READY') && !pageSource.includes('TEAM SCORE'), 'the page should avoid decorative microcopy');
assert(!source.includes('drawJumpOrder'), 'the playfield should not show 1-2-3-4 order markers');
assert(!source.includes('오른쪽 ${count}개') && !source.includes('왼쪽 ${count}개'), 'warnings should not use verbose direction sentences');
assert(pageSource.includes('js/box-character.js'), 'timing jump must load the shared obstacle-dodge box renderer');
assert(source.includes('drawDodgeBoxCharacter'), 'timing-jump players must use the shared face-box design');
assert(!source.includes('Four non-human mascot silhouettes'), 'the old custom mascot bodies must be removed');
assert(boxCharacterSource.includes('frontColor') && boxCharacterSource.includes('mouthColor'), 'the shared box renderer must support player recoloring');

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
  game.damageCooldownDuration = 2;
  game.elapsed = 0;
  game.waveNumber = 0;
  game.nextDirection = 1;
  game.score = 0;
  game.sharedLives = 3;
  game.damageCooldown = 0;
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
    cone: { width: 92, height: 66, speed: 430, color: '#fb923c' },
    barrel: { width: 84, height: 84, speed: 480, color: '#22d3ee' },
    cart: { width: 136, height: 92, speed: 590, color: '#8b5cf6' }
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
assert.notStrictEqual(leftObstacle.variant, rightObstacle.variant, 'successive waves should vary obstacle details');
const gearObstacle = directionGame.makeObstacle('barrel', 1, 0, 1);
assert.strictEqual(gearObstacle.color, '#22d3ee', 'the old brown ball should be replaced by a bright cyan gear');
assert(source.includes('three-spike crystal cluster') && source.includes('Fast hover robot'), 'all three obstacle families should have distinct silhouettes');

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
judgeGame.judgePlayer(judgeGame.players[0], leftObstacle);
assert.strictEqual(judgeGame.sharedLives, 2, 'the short team invulnerability window should block immediate repeat damage');
assert.strictEqual(judgeGame.damageCooldown, 2, 'a collision should start a two-second team invulnerability window');
judgeGame.damageCooldown = 0;
judgeGame.judgePlayer(judgeGame.players[0], leftObstacle);
assert.strictEqual(judgeGame.sharedLives, 1, 'damage should resume after invulnerability expires');

const timingGame = makeHarness();
const timingObstacle = timingGame.makeObstacle('barrel', 1, 0, 1);
const timingPlayer = timingGame.players[0];
timingObstacle.x = timingPlayer.x - timingObstacle.width / 2 - 31;
assert.strictEqual(timingGame.shouldJudgeObstacle(timingPlayer, timingObstacle), false, 'judgment should wait until the obstacle leading edge reaches the player box');
timingObstacle.x = timingPlayer.x - timingObstacle.width / 2 - 29;
assert.strictEqual(timingGame.shouldJudgeObstacle(timingPlayer, timingObstacle), true, 'judgment should occur when the obstacle first visually touches the player box');
timingPlayer.height = 55;
assert.strictEqual(timingGame.isSuccessfulJump(timingPlayer, timingObstacle), true, 'a clearly airborne player should pass the revised judgment');
timingPlayer.height = 0;
timingPlayer.velocity = 790;
timingPlayer.lastJumpAt = timingGame.elapsed - 0.25;
assert.strictEqual(timingGame.isSuccessfulJump(timingPlayer, timingObstacle), true, 'a recent visible takeoff must receive jump grace instead of a false hit');
timingPlayer.velocity = -100;
timingPlayer.lastJumpAt = timingGame.elapsed - 0.4;
assert.strictEqual(timingGame.isSuccessfulJump(timingPlayer, timingObstacle), false, 'a grounded late jump must not clear the obstacle');

const timeDifficultyGame = makeHarness();
const openingSpeed = timeDifficultyGame.makeObstacle('cone', 1, 0, 1).speed;
const openingWarning = timeDifficultyGame.getWarningDuration();
const openingRest = timeDifficultyGame.getWaveRestDelay();
timeDifficultyGame.elapsed = 60;
assert.strictEqual(timeDifficultyGame.getTimeDifficultyTier(), 2, 'timing jump must gain a difficulty tier every 30 seconds');
assert(timeDifficultyGame.makeObstacle('cone', 1, 0, 2).speed > openingSpeed, 'timing obstacles must speed up over time');
assert(timeDifficultyGame.getWarningDuration() < openingWarning, 'timing warnings must shorten over time');
assert(timeDifficultyGame.getWaveRestDelay() < openingRest, 'the rest between timing waves must shorten over time');
timeDifficultyGame.elapsed = 150;
assert.strictEqual(timeDifficultyGame.getTimeDifficultyTier(), 5, 'timing-jump time difficulty must keep rising into a late-game cap');

const warningGame = makeHarness();
warningGame.warning = { plan: { count: 1, directions: [1], label: '왼쪽 1개', type: 'cone' }, elapsed: 0, duration: 1.25 };
let spawned = 0;
warningGame.spawnWave = () => { spawned++; };
warningGame.updateWarning(1.0);
assert.strictEqual(spawned, 0, 'direction warning should remain visible briefly before launch');
warningGame.updateWarning(0.26);
assert.strictEqual(spawned, 1, 'one obstacle should launch after the simple warning');

const waveGame = makeHarness();
waveGame.obstacles = [];
waveGame.warning = { plan: { count: 1, directions: [1], label: '왼쪽 1개', type: 'cone' } };
waveGame.spawnWave();
assert.strictEqual(waveGame.obstacles.length, 1, 'each wave should contain exactly one clean obstacle');
assert.strictEqual(waveGame.obstacles[0].direction, 1, 'the obstacle should follow the announced direction');
waveGame.waveNumber = 6;
assert.strictEqual(waveGame.chooseObstacleType(), 'cone', 'obstacle types should stay simple and deterministic');
waveGame.waveNumber = 8;
assert.strictEqual(waveGame.chooseObstacleType(), 'cart', 'later waves may use one faster cart');

const progressionGame = makeHarness();
progressionGame.waveNumber = 0;
let plan = progressionGame.chooseWavePlan();
assert.strictEqual(plan.count, 1, 'the opening should use one obstacle');
assert.strictEqual(plan.label, '→ ×1', 'warning labels should use only an arrow and count');
progressionGame.waveNumber = 3;
plan = progressionGame.chooseWavePlan();
assert.strictEqual(plan.count, 2, 'the middle section should introduce two obstacles');
progressionGame.waveNumber = 7;
plan = progressionGame.chooseWavePlan();
assert.strictEqual(plan.count, 3, 'the later section should introduce three obstacles');

const mixedGame = makeHarness();
mixedGame.waveNumber = 5;
plan = mixedGame.chooseWavePlan();
assert.strictEqual(plan.count, 2, 'mixed-side variation should retain the correct obstacle count');
assert.deepStrictEqual(Array.from(plan.directions), [1, -1], 'two-obstacle variation should alternate left and right entry');
mixedGame.obstacles = [];
mixedGame.warning = { plan };
mixedGame.spawnWave();
assert.strictEqual(mixedGame.obstacles.length, 2, 'two-obstacle plan should spawn two separate obstacles');
assert.deepStrictEqual(mixedGame.obstacles.map((obstacle) => obstacle.direction), [1, -1], 'spawn order should preserve the announced side sequence');
const delayedRightObstacle = mixedGame.obstacles[1];
assert(delayedRightObstacle.x > 1920, 'the second obstacle should wait outside the right entrance');
assert.strictEqual(
  mixedGame.shouldKeepObstacle(delayedRightObstacle),
  true,
  'a delayed obstacle must not be deleted before it enters the screen'
);
assert.strictEqual(
  mixedGame.shouldKeepObstacle({ direction: 1, x: 1920 }),
  false,
  'a left-entering obstacle should be removed after it exits on the right'
);
assert.strictEqual(
  mixedGame.shouldKeepObstacle({ direction: -1, x: -320 }),
  false,
  'a right-entering obstacle should be removed after it exits on the left'
);
for (const playerX of mixedGame.playerXs) {
  const arrivalTimes = mixedGame.obstacles.map((obstacle) => obstacle.direction > 0
    ? (playerX - obstacle.x) / obstacle.speed
    : (obstacle.x - playerX) / obstacle.speed
  ).sort((a, b) => a - b);
  assert(
    arrivalTimes[1] - arrivalTimes[0] >= 1,
    `opposite-side obstacles must leave landing time at player x=${playerX}`
  );
}

const tripleMixedGame = makeHarness();
tripleMixedGame.waveNumber = 8;
plan = tripleMixedGame.chooseWavePlan();
assert.deepStrictEqual(Array.from(plan.directions), [1, -1, 1], 'later mixed wave should alternate three entry sides');
tripleMixedGame.obstacles = [];
tripleMixedGame.warning = { plan };
tripleMixedGame.spawnWave();
for (const playerX of tripleMixedGame.playerXs) {
  const arrivalTimes = tripleMixedGame.obstacles.map((obstacle) => obstacle.direction > 0
    ? (playerX - obstacle.x) / obstacle.speed
    : (obstacle.x - playerX) / obstacle.speed
  ).sort((a, b) => a - b);
  for (let index = 1; index < arrivalTimes.length; index++) {
    assert(arrivalTimes[index] - arrivalTimes[index - 1] >= 1, 'three-way cross wave must remain physically jumpable');
  }
}

console.log('✅ BEAT JUMP TEST PASSED: one-to-three obstacle progression, changing side order, shared lives, and independent jumps work');
