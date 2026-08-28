/** Regression test for procedural background music and shared mute controls. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let intervalId = 0;
let oscillatorCount = 0;
const makeParam = () => ({
  setValueAtTime() {},
  setTargetAtTime() {},
  exponentialRampToValueAtTime() {},
  cancelScheduledValues() {}
});
const fakeContext = {
  currentTime: 0,
  state: 'running',
  destination: {},
  sampleRate: 44100,
  createOscillator() {
    oscillatorCount++;
    return { type: 'sine', frequency: makeParam(), connect() {}, start() {}, stop() {} };
  },
  createGain() { return { gain: makeParam(), connect() {}, disconnect() {} }; },
  createBuffer() { return { getChannelData() { return new Float32Array(8); } }; },
  createBufferSource() { return { connect() {}, start() {}, stop() {}, buffer: null }; },
  createBiquadFilter() { return { type: '', frequency: makeParam(), Q: makeParam(), connect() {} }; },
  resume() {}
};

const context = vm.createContext({
  console,
  window: {
    AudioContext: function AudioContext() { return fakeContext; },
    setInterval() { return ++intervalId; },
    clearInterval() {},
    setTimeout(callback) { callback(); return 1; }
  }
});
const soundSource = fs.readFileSync(path.join(__dirname, '..', 'client/js/sound.js'), 'utf8');
vm.runInContext(`${soundSource}\nwindow.TestSoundEngine = SoundEngine;`, context, { filename: 'sound.js' });

const engine = new context.window.TestSoundEngine();
for (const theme of ['parking', 'traffic', 'rope', 'timing']) {
  oscillatorCount = 0;
  engine.startMusic(theme);
  assert.strictEqual(engine.musicTheme, engine.musicThemes[theme], `${theme} should select its own music theme`);
  assert(engine.musicTimer, `${theme} should start a scheduler`);
  assert(oscillatorCount > 0, `${theme} should schedule audible notes`);
  engine.stopMusic();
  assert.strictEqual(engine.musicTheme, null, `${theme} should stop cleanly`);
}

engine.startMusic('parking');
assert.strictEqual(engine.toggleMute(), true, 'shared sound button should mute music and effects');
assert.strictEqual(engine.toggleMute(), false, 'shared sound button should restore music and effects');
engine.stopMusic();

const buttonEngine = new context.window.TestSoundEngine();
assert.strictEqual(buttonEngine.toggleFromButton(), false, 'the first sound-button press should activate audio without muting it');
assert.strictEqual(buttonEngine.toggleFromButton(), true, 'later sound-button presses should toggle mute');

const expectedThemes = {
  'js/game.js': 'parking',
  'js/traffic-game.js': 'traffic',
  'js/jump-rope.js': 'rope',
  'js/beat-jump.js': 'timing'
};
for (const [filename, theme] of Object.entries(expectedThemes)) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'client', filename), 'utf8');
  assert(source.includes(`startMusic('${theme}')`), `${filename} should start the ${theme} theme`);
  assert(source.includes('stopMusic'), `${filename} should stop music outside active play`);
  assert(source.includes('toggleFromButton()'), `${filename} should use the shared sound-button behavior`);
}

console.log('✅ SOUND TEST PASSED: four distinct music themes start, stop, and mute consistently');
