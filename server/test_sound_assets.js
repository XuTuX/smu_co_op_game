/** Regression test for the bundled assets/sound MP3 wiring and its synth fallback. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const soundSource = fs.readFileSync(path.join(__dirname, '..', 'client/js/sound.js'), 'utf8');

function createHarness() {
  const events = { created: [], plays: [], pauses: 0 };
  function FakeAudio() {
    const listeners = {};
    const element = {
      src: '',
      volume: 1,
      loop: false,
      preload: 'auto',
      paused: true,
      currentTime: 0,
      addEventListener(type, callback) {
        (listeners[type] = listeners[type] || []).push(callback);
      },
      dispatch(type) {
        (listeners[type] || []).forEach((callback) => callback());
      },
      play() {
        element.paused = false;
        events.plays.push(element.src);
        return { catch() {} };
      },
      pause() { element.paused = true; events.pauses += 1; },
      load() {},
      cloneNode() {
        const clone = FakeAudio();
        clone.src = element.src;
        clone.volume = element.volume;
        clone.loop = element.loop;
        return clone;
      }
    };
    events.created.push(element);
    return element;
  }
  const context = vm.createContext({
    console,
    window: {
      Audio: FakeAudio,
      setInterval() { return 1; },
      clearInterval() {},
      setTimeout(callback) { callback(); return 1; }
    }
  });
  vm.runInContext(`${soundSource}\nwindow.TestSoundEngine = SoundEngine;`, context, { filename: 'sound.js' });
  return { engine: new context.window.TestSoundEngine(), events };
}

// --- Background music plays the bundled MP3 and stops cleanly -----------------
const music = createHarness();
music.engine.startMusic('parking');
assert(music.engine.musicFile, 'startMusic should attach an <audio> element for the parking music');
assert(music.engine.musicFile.loop, 'background music should loop');
assert(
  music.engine.musicFile.src.endsWith('bus_Game_background.mp3'),
  'the parking game should load its own bus_Game_background.mp3'
);
assert(
  music.events.plays.some((src) => src.endsWith('bus_Game_background.mp3')),
  'the parking background music should start playing'
);

// Traffic and jump-rope keep the shared track instead of the bus song.
const sharedMusic = createHarness();
sharedMusic.engine.prepareMusic('traffic');
assert(
  sharedMusic.events.created.some((element) => element.src.endsWith('background_music.mp3')),
  'traffic should preload the shared background_music.mp3 during the countdown'
);
sharedMusic.engine.startMusic('traffic');
assert(
  sharedMusic.engine.musicFile.src.endsWith('background_music.mp3'),
  'traffic should keep the shared background_music.mp3'
);

music.engine.setMuted(true);
assert.strictEqual(music.engine.musicFile.volume, 0, 'muting should silence the background music element');
music.engine.setMuted(false);
assert(music.engine.musicFile.volume > 0, 'unmuting should restore the background music volume');

music.engine.stopMusic();
assert(music.events.pauses >= 1, 'stopMusic should pause the background music element');
assert.strictEqual(music.engine.musicFile, null, 'stopMusic should release the background music element');

// --- Each effect resolves to its bundled file ---------------------------------
const effects = createHarness();
const expectedEffects = {
  playBusSuccess: 'bus_success.mp3',
  playStarBonus: 'star_bounus.mp3',
  playMove: 'move.mp3',
  playCarCrash: 'car_crush.mp3',
  playRopeFail: 'rope_fail.mp3',
  playGameOver: 'game_over.mp3'
};
for (const [method, fileName] of Object.entries(expectedEffects)) {
  const before = effects.events.plays.length;
  effects.engine[method]();
  const started = effects.events.plays.slice(before);
  assert(started.some((src) => src.endsWith(fileName)), `${method} should play ${fileName}`);
}

// --- Missing assets fall back to the synth effects ----------------------------
const missing = createHarness();
missing.engine.init();
for (const element of missing.events.created) {
  if (element.src.includes('star_bounus.mp3')) element.dispatch('error');
}
assert.strictEqual(missing.engine.effectStatus.starBonus, 'missing', 'a failed star_bounus.mp3 load should be recorded');
let fallbackCalls = 0;
missing.engine.playSuccess = () => { fallbackCalls += 1; };
missing.engine.playStarBonus();
assert.strictEqual(fallbackCalls, 1, 'a missing star_bounus.mp3 should fall back to the synth success sound');

// --- The 3·2·1 countdown plays game_start.mp3 exactly once --------------------
const countdown = createHarness();
countdown.engine.init();
const beforeCountdown = countdown.events.plays.length;
countdown.engine.playCountdown(3);
assert(
  countdown.events.plays.slice(beforeCountdown).some((src) => src.endsWith('game_start.mp3')),
  'playCountdown(3) should play game_start.mp3'
);
assert.strictEqual(countdown.engine.countdownSoundPlaying, true, 'the countdown should remember the MP3 is playing');
const beforeTwo = countdown.events.plays.length;
countdown.engine.playCountdown(2);
countdown.engine.playCountdown(1);
assert.strictEqual(countdown.events.plays.length, beforeTwo, '2 and 1 should not restart the countdown MP3');
countdown.engine.playCountdown(0);
assert.strictEqual(countdown.engine.countdownSoundPlaying, false, 'GO! should reset the countdown state');

// --- The parking bus loops car_sound.mp3 while rolling ------------------------
const car = createHarness();
car.engine.init();
car.engine.setCarMoving(true);
assert(car.engine.carAudio, 'setCarMoving(true) should attach a car_sound.mp3 element');
assert(car.engine.carAudio.loop, 'the car sound should loop');
assert(car.engine.carAudio.src.endsWith('car_sound.mp3'), 'the car sound should load car_sound.mp3');
assert(car.events.plays.some((src) => src.endsWith('car_sound.mp3')), 'the car sound should play while moving');
const playsWhileMoving = car.events.plays.length;
car.engine.setCarMoving(true);
assert.strictEqual(car.events.plays.length, playsWhileMoving, 'the car loop must not restart on every frame');
car.engine.setCarMoving(false);
assert.strictEqual(car.engine.carAudio.paused, true, 'the car sound should pause when the bus stops');
assert(car.engine.carAudio.currentTime === 0, 'the car sound should rewind when the bus stops');

// --- The parking wheel loops bus_direction.mp3 while steering -----------------
const steering = createHarness();
steering.engine.init();
steering.engine.setSteeringTurning(true);
assert(steering.engine.steeringAudio, 'setSteeringTurning(true) should attach a bus_direction.mp3 element');
assert(steering.engine.steeringAudio.loop, 'the steering sound should loop while the wheel turns');
assert(
  steering.engine.steeringAudio.src.endsWith('bus_direction.mp3'),
  'the steering sound should load bus_direction.mp3'
);
assert(
  steering.events.plays.some((src) => src.endsWith('bus_direction.mp3')),
  'the steering sound should play while the wheel turns'
);
const steeringPlays = steering.events.plays.length;
steering.engine.setSteeringTurning(true);
assert.strictEqual(steering.events.plays.length, steeringPlays, 'the steering loop must not restart on every frame');
steering.engine.setSteeringTurning(false);
assert.strictEqual(steering.engine.steeringAudio.paused, true, 'the steering sound should pause when the wheel stops');

// --- The games call the new event methods -------------------------------------
const wiring = [
  ['js/game.js', 'playBusSuccess'],
  ['js/game.js', 'playCarCrash'],
  ['js/game.js', 'setCarMoving'],
  ['js/game.js', 'setSteeringTurning'],
  ['js/game.js', "prepareMusic?.('parking')"],
  ['js/traffic-game.js', 'playStarBonus'],
  ['js/traffic-game.js', 'playMove'],
  ['js/traffic-game.js', "prepareMusic?.('traffic')"],
  ['js/jump-rope.js', 'playStarBonus'],
  ['js/jump-rope.js', 'playRopeFail'],
  ['js/jump-rope.js', "prepareMusic?.('rope')"]
];
for (const [file, method] of wiring) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'client', file), 'utf8');
  assert(source.includes(method), `${file} should call ${method}`);
}

console.log('✅ SOUND ASSET TEST PASSED: background music, countdown, car loop and MP3 effects are wired with a synth fallback');
