/** Regression test for the simplified, failure-neutral UI across every page. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const clientRoot = path.join(__dirname, '..', 'client');
const pages = ['index.html', 'traffic.html', 'jump-rope.html', 'beat-jump.html', 'button-test.html'];
const forbiddenPageText = [
  '4-PLAYER CO-OP', 'PC TEST MODE', 'INPUT READY', 'TEAM SCORE', 'TEAM LIFE',
  'POINTS', 'TIME\'S UP', 'GAME OVER', 'PARKING MODE', 'BLOCK HOP', 'TEAM ROPE',
  'game-card-label', 'modal-footnote', 'ready-state', 'player-results', 'rhythm-hud'
];

for (const filename of pages) {
  const source = fs.readFileSync(path.join(clientRoot, filename), 'utf8');
  for (const marker of forbiddenPageText) {
    assert(!source.includes(marker), `${filename} should not contain decorative microcopy: ${marker}`);
  }
}

for (const filename of ['index.html', 'traffic.html', 'jump-rope.html', 'beat-jump.html']) {
  const source = fs.readFileSync(path.join(clientRoot, filename), 'utf8');
  assert.strictEqual((source.match(/버튼을 눌러 준비하세요\./g) || []).length, 1, `${filename} should use the shared ready instruction`);
  assert.strictEqual((source.match(/>준비<\/button>/g) || []).length, 4, `${filename} should show four identical ready buttons`);
  assert.strictEqual((source.match(/class="role-card[^\n]+<strong>/g) || []).length, 4, `${filename} should show a role for every player`);
  assert.strictEqual((source.match(/game-restart/g) || []).length, 1, `${filename} should use the shared restart button style`);
  assert.strictEqual((source.match(/>다시하기<\/button>/g) || []).length, 1, `${filename} should use the shared restart label`);
}

const gameScripts = ['js/game.js', 'js/ui.js', 'js/traffic-game.js', 'js/jump-rope.js', 'js/beat-jump.js'];
const scriptSource = gameScripts
  .map((filename) => fs.readFileSync(path.join(clientRoot, filename), 'utf8'))
  .join('\n');
for (const marker of ['player.misses', 'misses:', '실수', 'MISS!', '충돌! 남은 목숨', 'CLEAR +', 'WATCH LEFT', 'INPUT READY', 'PC TEST MODE']) {
  assert(!scriptSource.includes(marker), `game UI should not expose failure or decorative text: ${marker}`);
}

console.log('✅ UI CLEANUP TEST PASSED: every game keeps only essential UI and hides individual failure details');
