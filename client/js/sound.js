/**
 * Game audio engine.
 *
 * Plays the bundled MP3s in assets/sound (background music plus the bus-clear,
 * game-over, rope-fail and star-bonus effects) and keeps the original Web Audio
 * synthesizer as a fallback for missing assets or browsers without HTMLAudio.
 */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.musicTimer = null;
    this.musicGain = null;
    this.musicTheme = null;
    this.musicStep = 0;
    this.nextMusicTime = 0;
    this.musicThemes = {
      parking: {
        bpm: 92, type: 'triangle', volume: 0.045, duration: 0.34,
        melody: [261.63, null, 329.63, 392, null, 329.63, 293.66, null],
        bass: [130.81, 146.83, 164.81, 146.83]
      },
      traffic: {
        bpm: 132, type: 'square', volume: 0.026, duration: 0.12,
        melody: [440, 523.25, 659.25, null, 587.33, 523.25, 440, 392],
        bass: [110, 130.81, 146.83, 98]
      },
      rope: {
        bpm: 116, type: 'triangle', volume: 0.038, duration: 0.2,
        melody: [392, 493.88, 587.33, 493.88, 440, 523.25, 659.25, 523.25],
        bass: [130.81, 164.81, 146.83, 174.61]
      }
    };

    // Bundled MP3s in assets/sound. These take priority; the synth above stays
    // as a fallback so the games still make noise if an asset is missing or the
    // browser refuses HTMLAudio.
    this.soundFiles = {
      // 배경음악은 효과음을 가리지 않도록 낮게, 효과음은 크게 유지한다.
      music: { file: 'background_music.mp3', volume: 0.18 },
      busSuccess: { file: 'bus_success.mp3', volume: 0.9 },
      gameOver: { file: 'game_over.mp3', volume: 0.95 },
      ropeFail: { file: 'rope_fail.mp3', volume: 0.95 },
      starBonus: { file: 'star_bounus.mp3', volume: 0.9 },
      move: { file: 'move.mp3', volume: 0.65 },
      gameStart: { file: 'game_start.mp3', volume: 0.9 },
      carSound: { file: 'car_sound.mp3', volume: 0.4 },
      carCrash: { file: 'car_crush.mp3', volume: 0.95 }
    };
    this.musicFileVolume = this.soundFiles.music.volume;
    this.musicFile = null;
    this.musicAudio = undefined;
    this.audioBaseCandidates = null;
    this.effectAudio = {};
    this.effectStatus = {};
    this.countdownSoundPlaying = false;
    this.carAudio = undefined;
    this.carMoving = false;
    this.unlockBound = false;
    this.installUnlockHandlers();
  }

  /**
   * Browsers block audio until the page sees a user gesture. The ESP32 buttons
   * arrive over WebSocket and do not count as one, so retry the music on the
   * first real tap or key press.
   */
  installUnlockHandlers() {
    if (this.unlockBound || typeof document === 'undefined' || !document.addEventListener) return;
    this.unlockBound = true;
    const unlock = () => {
      this.init();
      if (this.musicFile && this.musicFile.paused && !this.isMuted) this.playAudio(this.musicFile);
      if (this.carAudio && this.carMoving && this.carAudio.paused && !this.isMuted) this.playAudio(this.carAudio);
    };
    for (const type of ['pointerdown', 'keydown', 'touchstart']) {
      document.addEventListener(type, unlock, { once: true, passive: true });
    }
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.preloadEffects();
    this.loadMusicAudio();
  }

  // ---------------------------------------------------------------------------
  // MP3 asset helpers
  // ---------------------------------------------------------------------------

  /** Base URLs for assets/sound across file://, the Node server, and the ESP32 hub. */
  audioBases() {
    if (this.audioBaseCandidates) return this.audioBaseCandidates;
    const bases = [];
    try {
      if (typeof document !== 'undefined' && document.baseURI && typeof URL === 'function') {
        bases.push(new URL('../assets/sound/', document.baseURI).href);
        bases.push(new URL('assets/sound/', document.baseURI).href);
      }
    } catch (error) {}
    bases.push('/assets/sound/');
    this.audioBaseCandidates = bases;
    return bases;
  }

  /** Creates an <audio> element that walks the candidate URLs until one loads. */
  createAudio(fileName, options = {}) {
    if (typeof window === 'undefined' || typeof window.Audio !== 'function') return null;
    const candidates = this.audioBases().map((base) => base + fileName);
    const audio = new window.Audio();
    audio.preload = options.preload || 'auto';
    audio.loop = Boolean(options.loop);
    audio.volume = typeof options.volume === 'number' ? options.volume : 1;
    let index = 0;
    audio.src = candidates[index];
    audio.addEventListener('error', () => {
      index += 1;
      if (index < candidates.length) {
        audio.src = candidates[index];
        audio.load();
        return;
      }
      if (typeof options.onUnavailable === 'function') options.onUnavailable();
    });
    return audio;
  }

  playAudio(audio) {
    try {
      const promise = audio.play();
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
      return true;
    } catch (error) {
      return false;
    }
  }

  loadEffectAudio(key) {
    if (key in this.effectAudio) return this.effectAudio[key];
    const config = this.soundFiles[key];
    if (!config) return null;
    this.effectStatus[key] = 'loading';
    const audio = this.createAudio(config.file, {
      preload: 'auto',
      volume: config.volume,
      onUnavailable: () => { this.effectStatus[key] = 'missing'; }
    });
    if (audio) {
      audio.addEventListener('canplaythrough', () => { this.effectStatus[key] = 'ready'; }, { once: true });
    }
    this.effectAudio[key] = audio;
    return audio;
  }

  /** Warms the effect elements up so a missing file is discovered before gameplay. */
  preloadEffects() {
    for (const key of ['busSuccess', 'gameOver', 'ropeFail', 'starBonus', 'move', 'gameStart', 'carCrash']) this.loadEffectAudio(key);
  }

  /** Plays assets/sound/<key>.mp3, returning false so the caller can fall back to the synth. */
  playEffect(key) {
    if (this.isMuted) return true;
    const config = this.soundFiles[key];
    if (!config || this.effectStatus[key] === 'missing') return false;
    const template = this.loadEffectAudio(key);
    if (!template) return false;
    try {
      const source = typeof template.cloneNode === 'function' ? template.cloneNode(true) : template;
      source.volume = config.volume;
      return this.playAudio(source);
    } catch (error) {
      return false;
    }
  }

  playBeep(freq = 440, duration = 0.15, type = 'sine') {
    if (this.isMuted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.28, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  }

  setMuted(muted) {
    this.isMuted = Boolean(muted);
    if (this.musicFile) {
      this.musicFile.volume = this.isMuted ? 0 : this.musicFileVolume;
      if (!this.isMuted) this.playAudio(this.musicFile);
    }
    if (this.carAudio) {
      this.carAudio.volume = this.isMuted ? 0 : this.soundFiles.carSound.volume;
      if (!this.isMuted && this.carMoving) this.playAudio(this.carAudio);
    }
    if (this.musicGain && this.ctx) {
      const volume = this.isMuted ? 0.0001 : (this.musicTheme?.volume || 0.04);
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.04);
    }
    return this.isMuted;
  }

  toggleMute() {
    return this.setMuted(!this.isMuted);
  }

  toggleFromButton() {
    const needsActivation = !this.ctx;
    this.init();
    if (needsActivation) return this.setMuted(false);
    return this.toggleMute();
  }

  startMusic(themeName) {
    this.init();
    if (!this.musicThemes[themeName]) return;
    this.stopMusic();
    this.musicTheme = this.musicThemes[themeName];
    const audio = this.loadMusicAudio();
    if (audio) {
      audio.loop = true;
      audio.volume = this.isMuted ? 0 : this.musicFileVolume;
      try { audio.currentTime = 0; } catch (error) {}
      this.musicFile = audio;
      this.playAudio(audio);
      return;
    }
    this.startSynthMusic();
  }

  /** Cached background-music element so the countdown can preload the MP3. */
  loadMusicAudio() {
    if (this.musicAudio !== undefined) return this.musicAudio;
    this.musicAudio = this.createAudio(this.soundFiles.music.file, {
      preload: 'auto',
      loop: true,
      volume: this.isMuted ? 0 : this.musicFileVolume,
      onUnavailable: () => {
        this.musicAudio = null;
        if (!this.musicFile) return;
        this.musicFile = null;
        if (this.musicTheme) this.startSynthMusic();
      }
    });
    return this.musicAudio;
  }

  startSynthMusic() {
    if (!this.ctx || !this.musicTheme) return;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(this.isMuted ? 0.0001 : this.musicTheme.volume, this.ctx.currentTime);
    this.musicGain.connect(this.ctx.destination);
    this.musicStep = 0;
    this.nextMusicTime = this.ctx.currentTime + 0.06;
    this.scheduleMusic();
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 90);
  }

  stopMusic() {
    if (this.musicFile) {
      const audio = this.musicFile;
      this.musicFile = null;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (error) {}
    }
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (this.musicGain && this.ctx) {
      const gain = this.musicGain;
      const now = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, 0.04);
      window.setTimeout(() => {
        try { gain.disconnect(); } catch (error) {}
      }, 220);
    }
    this.musicGain = null;
    this.musicTheme = null;
  }

  scheduleMusic() {
    if (!this.ctx || !this.musicTheme || !this.musicGain) return;
    const stepDuration = 60 / this.musicTheme.bpm / 2;
    while (this.nextMusicTime < this.ctx.currentTime + 0.42) {
      const melody = this.musicTheme.melody[this.musicStep % this.musicTheme.melody.length];
      if (melody) this.scheduleMusicTone(melody, this.nextMusicTime, this.musicTheme.duration, this.musicTheme.type, 0.72);
      if (this.musicStep % 2 === 0) {
        const bassIndex = Math.floor(this.musicStep / 2) % this.musicTheme.bass.length;
        this.scheduleMusicTone(this.musicTheme.bass[bassIndex], this.nextMusicTime, stepDuration * 1.35, 'sine', 0.34);
      }
      this.musicStep++;
      this.nextMusicTime += stepDuration;
    }
  }

  scheduleMusicTone(frequency, time, duration, type, level) {
    try {
      const oscillator = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(level, time + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      oscillator.connect(gain);
      gain.connect(this.musicGain);
      oscillator.start(time);
      oscillator.stop(time + duration + 0.03);
    } catch (error) {}
  }

  playCountdown(count) {
    if (count <= 0) {
      this.countdownSoundPlaying = false;
      this.playBeep(880, 0.4, 'triangle'); // GO!
      return;
    }
    // "3, 2, 1" 카운트다운 사운드는 시작(3)에서 한 번만 재생하고, 파일이
    // 재생되는 동안에는 2·1 삑 소리를 겹치지 않게 생략한다.
    if (count === 3) this.countdownSoundPlaying = this.playEffect('gameStart');
    if (this.countdownSoundPlaying) return;
    this.playBeep(440, 0.15, 'sine'); // 3, 2, 1
  }

  playSuccess() {
    if (this.isMuted || !this.ctx) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const time = this.ctx.currentTime + idx * 0.08;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.5, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(time);
        osc.stop(time + 0.35);
      });
    } catch (e) {}
  }

  playCrash() {
    if (this.isMuted || !this.ctx) return;
    try {
      // Noise burst for impact
      const bufferSize = this.ctx.sampleRate * 0.15;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.15);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.55, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      whiteNoise.start();
      whiteNoise.stop(this.ctx.currentTime + 0.15);
    } catch (e) {}
  }

  /** 버스 주차 스테이지 통과 팡파르 (assets/sound/bus_success.mp3). */
  playBusSuccess() {
    if (!this.playEffect('busSuccess')) this.playSuccess();
  }

  /** 장애물 게임에서 별을 먹었을 때 (assets/sound/star_bounus.mp3). */
  playStarBonus() {
    if (!this.playEffect('starBonus')) this.playSuccess();
  }

  /** 장애물 게임에서 캐릭터가 한 칸 움직일 때마다 (assets/sound/move.mp3). */
  playMove() {
    if (!this.playEffect('move')) this.playBeep(520, 0.05, 'sine');
  }

  /** 버스 주차 게임에서 버스가 실제로 굴러가는 동안 (assets/sound/car_sound.mp3) 반복 재생. */
  setCarMoving(moving) {
    const next = Boolean(moving);
    if (next === this.carMoving) return;
    this.carMoving = next;
    const audio = this.loadCarAudio();
    if (!audio) return;
    if (next) {
      audio.volume = this.isMuted ? 0 : this.soundFiles.carSound.volume;
      this.playAudio(audio);
      return;
    }
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch (error) {}
  }

  /** Cached car/engine element so the driving loop can start and stop instantly. */
  loadCarAudio() {
    if (this.carAudio !== undefined) return this.carAudio;
    this.carAudio = this.createAudio(this.soundFiles.carSound.file, {
      preload: 'auto',
      loop: true,
      volume: this.isMuted ? 0 : this.soundFiles.carSound.volume
    });
    return this.carAudio;
  }

  /** 버스가 벽이나 장애물에 부딪혔을 때 (assets/sound/car_crush.mp3). */
  playCarCrash() {
    if (!this.playEffect('carCrash')) this.playCrash();
  }

  /** 줄넘기에서 한 명이라도 줄에 걸렸을 때 (assets/sound/rope_fail.mp3). */
  playRopeFail() {
    if (!this.playEffect('ropeFail')) this.playCrash();
  }

  /** 게임 오버 (assets/sound/game_over.mp3). */
  playGameOver() {
    if (this.playEffect('gameOver')) return;
    this.playGameOverSynth();
  }

  /** 게임 종료용 "루~우~" 하강 글라이드 효과음(MP3를 쓸 수 없을 때 대체). */
  playGameOverSynth() {
    if (this.isMuted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const glide = this.ctx.createOscillator();
      const glideGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      glide.type = 'sawtooth';
      glide.frequency.setValueAtTime(660, now);
      glide.frequency.exponentialRampToValueAtTime(140, now + 1.15);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, now);
      filter.frequency.exponentialRampToValueAtTime(360, now + 1.15);
      glideGain.gain.setValueAtTime(0.0001, now);
      glideGain.gain.exponentialRampToValueAtTime(0.45, now + 0.06);
      glideGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);

      glide.connect(filter);
      filter.connect(glideGain);
      glideGain.connect(this.ctx.destination);
      glide.start(now);
      glide.stop(now + 1.3);

      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(330, now);
      sub.frequency.exponentialRampToValueAtTime(80, now + 1.2);
      subGain.gain.setValueAtTime(0.0001, now);
      subGain.gain.exponentialRampToValueAtTime(0.3, now + 0.08);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

      sub.connect(subGain);
      subGain.connect(this.ctx.destination);
      sub.start(now);
      sub.stop(now + 1.25);
    } catch (e) {}
  }

  playLaser() {
    if (this.isMuted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const oscillator = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(1450, now);
      oscillator.frequency.exponentialRampToValueAtTime(190, now + 0.18);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.Q.setValueAtTime(1.8, now);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.24);
    } catch (e) {}
  }
}

window.SoundEngine = SoundEngine;
