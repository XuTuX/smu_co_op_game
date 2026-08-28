/**
 * Web Audio API Sound Synthesizer (Zero external audio assets required)
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
      },
      timing: {
        bpm: 108, type: 'sine', volume: 0.04, duration: 0.24,
        melody: [329.63, null, 392, 440, null, 392, 293.66, 329.63],
        bass: [110, 123.47, 98, 110]
      }
    };
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
  }

  playBeep(freq = 440, duration = 0.15, type = 'sine') {
    if (this.isMuted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  }

  setMuted(muted) {
    this.isMuted = Boolean(muted);
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
    if (!this.ctx || !this.musicThemes[themeName]) return;
    this.stopMusic();
    this.musicTheme = this.musicThemes[themeName];
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(this.isMuted ? 0.0001 : this.musicTheme.volume, this.ctx.currentTime);
    this.musicGain.connect(this.ctx.destination);
    this.musicStep = 0;
    this.nextMusicTime = this.ctx.currentTime + 0.06;
    this.scheduleMusic();
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 90);
  }

  stopMusic() {
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
    if (count > 0) {
      this.playBeep(440, 0.15, 'sine'); // 3, 2, 1
    } else {
      this.playBeep(880, 0.4, 'triangle'); // GO!
    }
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

        gain.gain.setValueAtTime(0.25, time);
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
      gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      whiteNoise.start();
      whiteNoise.stop(this.ctx.currentTime + 0.15);
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
      gain.gain.setValueAtTime(0.16, now);
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
