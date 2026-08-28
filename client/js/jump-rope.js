/**
 * Four independent jumpers sharing one rotating rope.
 * P1=forward, P2=backward, P3=left, P4=right.
 */
class TeamJumpRopeGame {
  constructor() {
    this.canvas = document.getElementById('ropeCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = 1600;
    this.canvas.height = 900;

    this.inputManager = new InputManager({ queueKeyboardPresses: true });
    this.soundEngine = new SoundEngine();
    this.network = new NetworkClient(this.inputManager, (connected) => this.updateHardwareStatus(connected));

    this.actions = ['forward', 'backward', 'left', 'right'];
    this.playerMeta = [
      { action: 'forward', label: 'P1', key: 'W', color: '#facc15', dark: '#a16207' },
      { action: 'backward', label: 'P2', key: 'S', color: '#fb7185', dark: '#be123c' },
      { action: 'left', label: 'P3', key: 'A', color: '#38bdf8', dark: '#0369a1' },
      { action: 'right', label: 'P4', key: 'D', color: '#4ade80', dark: '#15803d' }
    ];
    this.playerXs = [500, 700, 900, 1100];
    this.groundY = 690;
    this.ropeCenterY = 438;
    this.ropeRadius = 248;
    this.jumpVelocity = 760;
    this.gravity = 1900;
    this.clearHeight = 68;
    this.gameDuration = 60;

    this.state = 'READY';
    this.players = [];
    this.ropeAngle = -Math.PI / 2;
    this.elapsed = 0;
    this.timeRemaining = this.gameDuration;
    this.score = 0;
    this.perfectCount = 0;
    this.sharedLives = 3;
    this.roundCount = 0;
    this.tempoFactor = 1;
    this.commandTargets = null;
    this.doubleRopeMode = false;
    this.modeLabel = '전원 점프';
    this.currentMode = 'all';
    this.modePassesRemaining = 4;
    this.modeBag = [];
    this.lastMode = null;
    this.random = Math.random;
    this.combo = 0;
    this.bestCombo = 0;
    this.feverGauge = 0;
    this.feverRemaining = 0;
    this.particles = [];
    this.shake = 0;
    this.hitFreeze = 0;
    this.lastTime = 0;
    this.readyPlayers = this.createReadyState();
    this.previousReadyInputs = this.createReadyState();
    this.previousPlayInputs = this.createReadyState();
    this.readyStartTimer = null;
    this.countdownInterval = null;
    this.countdownHideTimer = null;
    this.calloutTimer = null;
    this.passPulse = 0;

    this.bindUI();
    this.inputManager.onChange((inputs) => {
      this.updateInputUI(inputs);
      this.handleReadyInput(inputs);
      if (this.state === 'PLAYING') this.handleJumpInput(inputs);
      else this.previousPlayInputs = { ...inputs };
    });
    this.network.connect();
    this.resetGame();
    this.beginReadyCheck();
    requestAnimationFrame((time) => this.loop(time));
  }

  createReadyState() {
    return { forward: false, backward: false, left: false, right: false };
  }

  createPlayers() {
    return this.playerMeta.map((meta, index) => ({
      ...meta,
      x: this.playerXs[index],
      height: 0,
      velocity: 0,
      clears: 0,
      stunned: 0,
      flash: 0,
      squash: 0,
      lastJumpAt: -Infinity
    }));
  }

  bindUI() {
    document.getElementById('rope-restart-btn').addEventListener('click', () => this.beginReadyCheck());
    document.getElementById('rope-sound-btn').addEventListener('click', (event) => {
      const muted = this.soundEngine.toggleFromButton();
      event.currentTarget.textContent = muted ? '🔇' : '🔊';
    });
  }

  beginReadyCheck() {
    this.soundEngine.stopMusic?.();
    window.clearTimeout(this.readyStartTimer);
    window.clearInterval(this.countdownInterval);
    window.clearTimeout(this.countdownHideTimer);
    window.clearTimeout(this.calloutTimer);
    this.state = 'RESETTING_READY';
    this.readyPlayers = this.createReadyState();
    this.previousReadyInputs = this.createReadyState();
    this.previousPlayInputs = this.createReadyState();
    document.body.classList.remove('is-playing');
    document.getElementById('rope-countdown').classList.add('hidden');
    document.getElementById('rope-gameover-modal').classList.add('hidden');
    document.getElementById('rope-start-modal').classList.remove('hidden');
    document.getElementById('rope-callout').classList.add('hidden');
    this.resetGame();
    this.state = 'READY';
    this.previousReadyInputs = this.createReadyState();
    this.updateReadyUI();
  }

  handleReadyInput(inputs) {
    const risingActions = this.actions.filter((action) => inputs[action] && !this.previousReadyInputs[action]);
    if (this.state === 'GAMEOVER') {
      this.previousReadyInputs = { ...inputs };
      if (risingActions.length) this.beginReadyCheck();
      return;
    }
    if (this.state !== 'READY' && this.state !== 'READY_COMPLETE') {
      this.previousReadyInputs = { ...inputs };
      return;
    }
    for (const action of risingActions) this.readyPlayers[action] = !this.readyPlayers[action];
    this.previousReadyInputs = { ...inputs };
    if (!risingActions.length) return;
    const allReady = this.actions.every((action) => this.readyPlayers[action]);
    if (!allReady && this.state === 'READY_COMPLETE') {
      window.clearTimeout(this.readyStartTimer);
      this.state = 'READY';
    }
    this.updateReadyUI();
    if (allReady && this.state !== 'READY_COMPLETE') {
      this.state = 'READY_COMPLETE';
      this.readyStartTimer = window.setTimeout(() => this.startCountdown(), 450);
    }
  }

  updateReadyUI() {
    const readyCount = this.actions.filter((action) => this.readyPlayers[action]).length;
    document.querySelectorAll('#rope-start-modal [data-ready-action]').forEach((card) => {
      const ready = Boolean(this.readyPlayers[card.dataset.readyAction]);
      card.classList.toggle('is-ready', ready);
      const button = card.querySelector('.ready-tap');
      if (button) button.textContent = ready ? '취소' : '준비';
    });
    const progress = document.getElementById('rope-ready-progress');
    progress.textContent = `${readyCount} / 4`;
    progress.classList.toggle('all-ready', readyCount === 4);
  }

  startCountdown() {
    this.soundEngine.init();
    this.state = 'COUNTDOWN';
    window.clearTimeout(this.readyStartTimer);
    window.clearInterval(this.countdownInterval);
    this.resetGame();
    document.body.classList.add('is-playing');
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('rope-start-modal').classList.add('hidden');
    document.getElementById('rope-gameover-modal').classList.add('hidden');
    const overlay = document.getElementById('rope-countdown');
    const text = document.getElementById('rope-countdown-text');
    overlay.classList.remove('hidden');
    let count = 3;
    text.textContent = count;
    this.soundEngine.playCountdown(count);
    this.countdownInterval = window.setInterval(() => {
      count--;
      if (count > 0) {
        text.textContent = count;
        this.soundEngine.playCountdown(count);
      } else {
        window.clearInterval(this.countdownInterval);
        text.textContent = 'GO!';
        this.soundEngine.playCountdown(0);
        this.soundEngine.startMusic('rope');
        this.previousPlayInputs = this.createReadyState();
        this.state = 'PLAYING';
        this.countdownHideTimer = window.setTimeout(() => overlay.classList.add('hidden'), 500);
      }
    }, 1000);
  }

  resetGame() {
    this.players = this.createPlayers();
    this.ropeAngle = -Math.PI / 2;
    this.elapsed = 0;
    this.timeRemaining = this.gameDuration;
    this.score = 0;
    this.perfectCount = 0;
    this.sharedLives = 3;
    this.roundCount = 0;
    this.tempoFactor = 1;
    this.commandTargets = null;
    this.doubleRopeMode = false;
    this.modeLabel = '전원 점프';
    this.currentMode = 'all';
    this.modePassesRemaining = 4;
    this.modeBag = [];
    this.lastMode = null;
    this.combo = 0;
    this.bestCombo = 0;
    this.feverGauge = 0;
    this.feverRemaining = 0;
    this.particles = [];
    this.shake = 0;
    this.hitFreeze = 0;
    this.passPulse = 0;
    this.applyRoundMode(false);
    this.inputManager.resetAll();
    this.previousPlayInputs = this.createReadyState();
    this.updateHUD();
  }

  updateHardwareStatus(connected) {
    const badge = document.getElementById('rope-hardware-badge');
    const text = document.getElementById('rope-hardware-text');
    badge.className = connected ? 'status-badge connected' : 'status-badge local';
    text.textContent = connected ? 'ESP32' : 'PC';
  }

  updateInputUI(inputs) {
    document.querySelectorAll('.rope-player-button[data-action]').forEach((button) => {
      button.classList.toggle('active', Boolean(inputs[button.dataset.action]));
    });
  }

  handleJumpInput(inputs) {
    for (const action of this.actions) {
      if (inputs[action] && !this.previousPlayInputs[action]) this.jumpPlayer(action);
    }
    this.previousPlayInputs = { ...inputs };
  }

  jumpPlayer(action) {
    const player = this.players.find((candidate) => candidate.action === action);
    if (!player || player.stunned > 0 || player.height > 2) return false;
    player.velocity = this.jumpVelocity;
    player.squash = 1;
    player.lastJumpAt = this.elapsed;
    this.soundEngine.playBeep(360 + this.players.indexOf(player) * 80, 0.08, 'triangle');
    return true;
  }

  getRopeSpeed() {
    const progress = Math.min(1, this.roundCount / 35);
    const timeMultiplier = 1 + this.getTimeDifficultyTier() * 0.07;
    const rotationsPerSecond = (0.44 + progress * 0.18) * timeMultiplier * this.tempoFactor;
    return Math.PI * 2 * rotationsPerSecond;
  }

  getTimeDifficultyTier() {
    return Math.min(4, Math.floor(this.elapsed / 30));
  }

  getRopeOffsets() {
    return this.doubleRopeMode ? [0, Math.PI] : [0];
  }

  getSecondsToNextPass() {
    const fullTurn = Math.PI * 2;
    const speed = this.getRopeSpeed();
    return Math.min(...this.getRopeOffsets().map((offset) => {
      const angle = this.ropeAngle + offset;
      const delta = ((Math.PI / 2 - angle) % fullTurn + fullTurn) % fullTurn;
      return delta / speed;
    }));
  }

  getTempoInfo() {
    if (this.elapsed >= 45) return { level: 4, label: 'FINAL RUSH' };
    if (this.elapsed >= 30) return { level: 3, label: 'SPEED UP' };
    if (this.elapsed >= 15) return { level: 2, label: 'RHYTHM' };
    return { level: 1, label: 'WARM UP' };
  }

  update(dt) {
    if (this.hitFreeze > 0) {
      this.hitFreeze = Math.max(0, this.hitFreeze - dt);
      this.updateEffects(dt);
      this.updateHUD();
      return;
    }

    this.elapsed += dt;
    this.passPulse = Math.max(0, this.passPulse - dt * 2.8);
    this.feverRemaining = Math.max(0, this.feverRemaining - dt);
    this.shake = Math.max(0, this.shake - dt * 25);

    for (const player of this.players) {
      player.flash = Math.max(0, player.flash - dt);
      player.stunned = Math.max(0, player.stunned - dt);
      player.squash = Math.max(0, player.squash - dt * 4);
      if (player.height > 0 || player.velocity > 0) {
        player.height += player.velocity * dt;
        player.velocity -= this.gravity * dt;
        if (player.height <= 0) {
          player.height = 0;
          player.velocity = 0;
          player.squash = 0.65;
        }
      }
    }

    const previousAngle = this.ropeAngle;
    this.ropeAngle += this.getRopeSpeed() * dt;
    for (const offset of this.getRopeOffsets()) {
      const previousPass = Math.floor((previousAngle + offset - Math.PI / 2) / (Math.PI * 2));
      const currentPass = Math.floor((this.ropeAngle + offset - Math.PI / 2) / (Math.PI * 2));
      if (currentPass > previousPass) this.resolveRopePass();
    }

    this.updateEffects(dt);
    this.updateJumpCallout();
    this.updateHUD();
  }

  resolveRopePass() {
    const activePlayers = this.players;
    if (!activePlayers.length) return;
    let allClear = true;
    const multiplier = this.feverRemaining > 0 ? 2 : 1;
    for (const player of activePlayers) {
      const onBeatJump = this.elapsed - player.lastJumpAt <= 0.16;
      const jumped = player.height >= this.clearHeight || onBeatJump;
      const shouldJump = this.commandTargets === null || this.commandTargets.includes(player.action);
      if (shouldJump && jumped) {
        player.clears++;
        this.score += multiplier;
        player.flash = 0.25;
        this.spawnBurst(player.x, this.groundY - Math.max(70, player.height), player.color, 7);
      } else if ((shouldJump && !jumped) || (!shouldJump && jumped)) {
        allClear = false;
      }
    }
    this.roundCount++;
    this.passPulse = 1;
    if (allClear) {
      this.perfectCount++;
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.feverGauge++;
      if (this.feverGauge >= 3) {
        this.feverGauge = 0;
        this.feverRemaining = 7;
      }
      this.soundEngine.playSuccess();
    } else {
      this.sharedLives = Math.max(0, this.sharedLives - 1);
      this.combo = 0;
      this.soundEngine.playCrash();
      this.shake = 13;
      this.hitFreeze = 0.1;
    }
    if (this.sharedLives <= 0) {
      this.endGame('ALL_OUT');
      return;
    }
    this.advanceRoundMode(true);
  }

  advanceRoundMode(showMessage = true) {
    this.modePassesRemaining--;
    if (this.modePassesRemaining <= 0) this.selectRandomMode();
    this.applyRoundMode(showMessage);
  }

  selectRandomMode() {
    if (!this.modeBag.length) {
      this.modeBag = ['solo', 'pair', 'double', 'slow', 'fast'];
      for (let i = this.modeBag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.modeBag[i], this.modeBag[j]] = [this.modeBag[j], this.modeBag[i]];
      }
      if (this.modeBag[this.modeBag.length - 1] === this.lastMode && this.modeBag.length > 1) {
        [this.modeBag[0], this.modeBag[this.modeBag.length - 1]] = [this.modeBag[this.modeBag.length - 1], this.modeBag[0]];
      }
    }
    this.currentMode = this.modeBag.pop();
    this.lastMode = this.currentMode;
    const isTargetCommand = this.currentMode === 'solo' || this.currentMode === 'pair';
    this.modePassesRemaining = isTargetCommand ? 1 : (this.currentMode === 'double' ? 2 : (this.random() < 0.5 ? 1 : 2));
    this.commandTargets = null;
  }

  applyRoundMode(showMessage = true) {
    const activeActions = this.players.map((player) => player.action);
    this.doubleRopeMode = false;
    this.tempoFactor = 1;
    this.modeLabel = '전원 점프';

    if (this.currentMode === 'solo') {
      const current = this.commandTargets && this.commandTargets.find((action) => activeActions.includes(action));
      const target = current || activeActions[Math.floor(this.random() * activeActions.length)];
      this.commandTargets = target ? [target] : null;
      this.modeLabel = '혼자 점프';
    } else if (this.currentMode === 'pair') {
      const validTargets = (this.commandTargets || []).filter((action) => activeActions.includes(action));
      const remaining = activeActions.filter((action) => !validTargets.includes(action));
      while (validTargets.length < Math.min(2, activeActions.length) && remaining.length) {
        const index = Math.floor(this.random() * remaining.length);
        validTargets.push(remaining.splice(index, 1)[0]);
      }
      this.commandTargets = validTargets.length ? validTargets : null;
      this.modeLabel = validTargets.length > 1 ? '둘이 점프' : '혼자 점프';
    } else {
      this.commandTargets = null;
      if (this.currentMode === 'double') {
        this.doubleRopeMode = true;
        this.modeLabel = '두 줄 · 전원 점프';
      } else if (this.currentMode === 'slow') {
        this.tempoFactor = 0.68 + this.getTimeDifficultyTier() * 0.035;
        this.modeLabel = '느린 템포 · 전원 점프';
      } else if (this.currentMode === 'fast') {
        this.tempoFactor = 1.45 + this.getTimeDifficultyTier() * 0.04;
        this.modeLabel = '빠른 템포 · 전원 점프';
      }
    }
    if (showMessage && this.commandTargets) {
      this.showCallout(this.getModeHtml(), 1200, true);
    } else if (showMessage) {
      if (typeof window.clearTimeout === 'function') window.clearTimeout(this.calloutTimer);
      this.calloutTimer = null;
      const callout = typeof document.getElementById === 'function' ? document.getElementById('rope-callout') : null;
      if (callout) callout.classList.add('hidden');
    }
  }

  getCommandText() {
    const labels = {
      forward: '노랑',
      backward: '빨강',
      left: '파랑',
      right: '초록'
    };
    if (!this.commandTargets) return '전원 점프!';
    const names = this.commandTargets.map((action) => labels[action]).join(' + ');
    return this.commandTargets.length === 1 ? `${names}만 점프!` : `${names} 점프!`;
  }

  getModeHtml() {
    if (!this.commandTargets) return this.modeLabel;
    const labels = {
      forward: ['노랑', 'yellow'],
      backward: ['빨강', 'red'],
      left: ['파랑', 'blue'],
      right: ['초록', 'green']
    };
    const names = this.commandTargets.map((action) => {
      const [name, color] = labels[action];
      return `<span class="rope-command-color ${color}">${name}</span>`;
    }).join(' + ');
    return this.commandTargets.length === 1 ? `${names}만 점프!` : `${names} 점프!`;
  }

  updateJumpCallout() {
    const seconds = this.getSecondsToNextPass();
    const warning = seconds <= 0.28 && seconds > 0.04;
    const callout = document.getElementById('rope-callout');
    if (!this.calloutTimer) {
      if (this.commandTargets) {
        callout.innerHTML = this.getModeHtml();
        callout.classList.toggle('hidden', !warning);
      } else {
        callout.classList.add('hidden');
      }
    }
  }

  spawnBurst(x, y, color, amount) {
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 210;
      this.particles.push({
        x, y, color,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        size: 4 + Math.random() * 8,
        life: 0.55 + Math.random() * 0.35
      });
    }
  }

  updateEffects(dt) {
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 560 * dt;
      particle.life -= dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  showCallout(message, duration, allowHtml = false) {
    window.clearTimeout(this.calloutTimer);
    const callout = document.getElementById('rope-callout');
    if (allowHtml) callout.innerHTML = message;
    else callout.textContent = message;
    callout.classList.remove('hidden');
    this.calloutTimer = window.setTimeout(() => {
      this.calloutTimer = null;
      callout.classList.add('hidden');
    }, duration);
  }

  updateHUD() {
    const score = document.getElementById('rope-score');
    const time = document.getElementById('rope-time');
    if (score) score.textContent = this.score;
    if (time) {
      time.textContent = this.sharedLives > 0 ? '♥'.repeat(this.sharedLives) : '0';
      time.classList.toggle('urgent', this.sharedLives === 1);
    }
  }

  endGame(reason) {
    if (this.state !== 'PLAYING') return;
    this.state = 'GAMEOVER';
    this.soundEngine.stopMusic();
    this.inputManager.resetAll();
    window.clearTimeout(this.calloutTimer);
    this.calloutTimer = null;
    document.getElementById('rope-callout').classList.add('hidden');
    const message = document.getElementById('rope-gameover-message');
    message.textContent = '게임 종료';
    document.getElementById('rope-final-score').textContent = this.score;
    document.getElementById('rope-perfect-count').textContent = this.perfectCount;
    document.getElementById('rope-gameover-modal').classList.remove('hidden');
  }

  drawBackground() {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    gradient.addColorStop(0, '#24204b');
    gradient.addColorStop(0.67, '#30265d');
    gradient.addColorStop(0.68, '#5d4a8a');
    gradient.addColorStop(1, '#2e2550');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = 'rgba(255,255,255,.09)';
    for (let x = 70; x < 1600; x += 150) {
      ctx.beginPath();
      ctx.arc(x, 95 + (x % 300) * 0.16, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#6d5a9a';
    ctx.fillRect(0, this.groundY, this.canvas.width, this.canvas.height - this.groundY);
    if (this.state === 'PLAYING') {
      const seconds = this.getSecondsToNextPass();
      if (seconds < 0.3) {
        const danger = Math.max(0, 1 - seconds / 0.3);
        ctx.fillStyle = `rgba(251,113,133,${0.12 + danger * 0.36})`;
        ctx.fillRect(330, this.groundY - 24, 940, 48);
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + danger * 0.5})`;
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(350, this.groundY); ctx.lineTo(1250, this.groundY); ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 3;
    for (let y = this.groundY + 55; y < 900; y += 55) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1600, y); ctx.stroke();
    }
    for (let x = 0; x < 1600; x += 150) {
      ctx.beginPath(); ctx.moveTo(800, this.groundY); ctx.lineTo(x, 900); ctx.stroke();
    }
  }

  getRopeGeometry(angle = this.ropeAngle) {
    const phase = angle;
    // A quadratic curve reaches only halfway from its endpoints to its control
    // point at x=50%. Calculate the control point from the desired midpoint so
    // the visible rope really reaches the same groundY used by collision logic.
    const midpointY = this.ropeCenterY + Math.sin(phase) * this.ropeRadius;
    return {
      midpointY,
      controlY: midpointY * 2 - this.ropeCenterY,
      front: Math.sin(phase) > 0,
      atGround: Math.abs(midpointY - (this.groundY - 4)) < 20,
      width: 8 + Math.max(0, Math.sin(phase)) * 7
    };
  }

  drawRope(angle = this.ropeAngle, secondary = false) {
    const ctx = this.ctx;
    const rope = this.getRopeGeometry(angle);
    ctx.save();
    const normalColor = secondary ? '#67e8f9' : '#fef08a';
    const backColor = secondary ? 'rgba(103,232,249,.48)' : 'rgba(254,240,138,.5)';
    ctx.strokeStyle = rope.atGround ? '#fb7185' : (rope.front ? normalColor : backColor);
    ctx.lineWidth = rope.width;
    ctx.lineCap = 'round';
    ctx.shadowColor = rope.atGround
      ? 'rgba(251,113,133,.9)'
      : (rope.front ? (secondary ? 'rgba(103,232,249,.75)' : 'rgba(250,204,21,.65)') : 'transparent');
    ctx.shadowBlur = rope.atGround ? 22 : (rope.front ? 12 : 0);
    ctx.beginPath();
    ctx.moveTo(230, this.ropeCenterY);
    ctx.quadraticCurveTo(800, rope.controlY, 1370, this.ropeCenterY);
    ctx.stroke();
    ctx.restore();
  }

  drawEffects() {
    const ctx = this.ctx;
    for (const particle of this.particles) {
      ctx.globalAlpha = Math.min(1, particle.life * 2);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawTurner(x, flip) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, this.groundY - 78);
    ctx.scale(flip ? -1 : 1, 1);
    ctx.strokeStyle = '#161228';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.fillStyle = '#c4b5fd';
    ctx.beginPath(); ctx.roundRect(-36, -94, 72, 88, 26); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f5cfa8';
    ctx.beginPath(); ctx.arc(0, -126, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(25, -72); ctx.lineTo(78, -145); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-20, -4); ctx.lineTo(-30, 54); ctx.moveTo(20, -4); ctx.lineTo(30, 54); ctx.stroke();
    ctx.restore();
  }

  drawPlayer(player, index) {
    const ctx = this.ctx;
    const bodyY = this.groundY - player.height;
    const pulse = player.flash > 0 && Math.floor(player.flash * 16) % 2 === 0;
    const squashY = player.height === 0 ? 1 - player.squash * 0.12 : 1;
    const stretchY = player.height > 0 ? 1.04 : squashY;
    ctx.save();
    ctx.translate(player.x, bodyY);
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(8,5,20,.3)';
    ctx.beginPath();
    ctx.ellipse(0, player.height - 1, 54 - Math.min(28, player.height * 0.14), 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(1, stretchY);
    ctx.strokeStyle = pulse ? '#fff' : '#181229';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    const legLift = player.height > 12 ? 13 : 0;
    ctx.beginPath();
    ctx.moveTo(-19, -54); ctx.lineTo(-25, -8 - legLift); ctx.lineTo(-42, 0 - legLift);
    ctx.moveTo(19, -54); ctx.lineTo(25, -8 - legLift); ctx.lineTo(42, 0 - legLift);
    ctx.stroke();

    ctx.fillStyle = player.color;
    ctx.beginPath(); ctx.roundRect(-48, -146, 96, 98, 28); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-42, -126); ctx.lineTo(-70, -83 - (player.height > 0 ? 12 : 0));
    ctx.moveTo(42, -126); ctx.lineTo(70, -83 - (player.height > 0 ? 12 : 0));
    ctx.stroke();

    ctx.fillStyle = '#f5cfa8';
    ctx.beginPath(); ctx.arc(0, -181, 40, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#181229';
    ctx.beginPath(); ctx.arc(-13, -185, 4, 0, Math.PI * 2); ctx.arc(13, -185, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -170, 11, 0.1, Math.PI - 0.1); ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#181229';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(-29, -128, 58, 41, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = player.dark;
    ctx.font = '950 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(player.label, 0, -100);
    ctx.restore();

    this.canvas.dataset[`p${index + 1}Height`] = player.height.toFixed(1);
    this.canvas.dataset[`p${index + 1}Lives`] = String(this.sharedLives);
    this.canvas.dataset[`p${index + 1}Clears`] = String(player.clears);
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    this.drawBackground();
    const ropes = this.getRopeOffsets().map((offset, index) => ({
      angle: this.ropeAngle + offset,
      secondary: index === 1,
      geometry: this.getRopeGeometry(this.ropeAngle + offset)
    }));
    ropes.filter((rope) => !rope.geometry.front).forEach((rope) => this.drawRope(rope.angle, rope.secondary));
    this.drawTurner(245, false);
    this.drawTurner(1355, true);
    this.players.forEach((player, index) => this.drawPlayer(player, index));
    ropes.filter((rope) => rope.geometry.front).forEach((rope) => this.drawRope(rope.angle, rope.secondary));
    this.drawEffects();

    if (this.passPulse > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.passPulse * 0.12})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.restore();
    this.canvas.dataset.gameState = this.state;
    this.canvas.dataset.score = String(this.score);
    this.canvas.dataset.perfect = String(this.perfectCount);
    this.canvas.dataset.ropeAngle = this.ropeAngle.toFixed(3);
    this.canvas.dataset.ropeMidpointY = this.getRopeGeometry().midpointY.toFixed(1);
    this.canvas.dataset.ropeGroundY = String(this.groundY);
    this.canvas.dataset.ropeCount = String(this.getRopeOffsets().length);
    this.canvas.dataset.combo = String(this.combo);
    this.canvas.dataset.fever = this.feverRemaining.toFixed(2);
    this.canvas.dataset.sharedLives = String(this.sharedLives);
  }

  loop(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    const dt = Math.min(0.05, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;
    if (this.state === 'PLAYING') this.update(dt);
    this.draw();
    requestAnimationFrame((time) => this.loop(time));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.jumpRopeGameInstance = new TeamJumpRopeGame();
});
