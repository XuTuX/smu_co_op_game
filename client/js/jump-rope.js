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
      if (this.state === 'READY') this.handleReadyInput(inputs);
      else if (this.state === 'PLAYING') this.handleJumpInput(inputs);
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
      lives: 3,
      clears: 0,
      misses: 0,
      stunned: 0,
      flash: 0,
      squash: 0,
      eliminated: false
    }));
  }

  bindUI() {
    document.getElementById('rope-restart-btn').addEventListener('click', () => this.beginReadyCheck());
    document.getElementById('rope-sound-btn').addEventListener('click', (event) => {
      this.soundEngine.isMuted = !this.soundEngine.isMuted;
      event.currentTarget.textContent = this.soundEngine.isMuted ? '🔇' : '🔊';
    });
  }

  beginReadyCheck() {
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
    if (this.state !== 'READY') {
      this.previousReadyInputs = { ...inputs };
      return;
    }
    let changed = false;
    for (const action of this.actions) {
      if (inputs[action] && !this.previousReadyInputs[action] && !this.readyPlayers[action]) {
        this.readyPlayers[action] = true;
        changed = true;
      }
    }
    this.previousReadyInputs = { ...inputs };
    if (!changed) return;
    this.updateReadyUI();
    if (this.actions.every((action) => this.readyPlayers[action])) {
      this.state = 'READY_COMPLETE';
      this.readyStartTimer = window.setTimeout(() => this.startCountdown(), 450);
    }
  }

  updateReadyUI() {
    const readyCount = this.actions.filter((action) => this.readyPlayers[action]).length;
    document.querySelectorAll('#rope-start-modal [data-ready-action]').forEach((card) => {
      const ready = Boolean(this.readyPlayers[card.dataset.readyAction]);
      card.classList.toggle('is-ready', ready);
      const status = card.querySelector('.ready-state');
      if (status) status.textContent = ready ? '준비 완료 ✓' : '대기 중';
    });
    const progress = document.getElementById('rope-ready-progress');
    progress.textContent = readyCount === 4 ? '모두 준비 완료!' : `준비 ${readyCount} / 4`;
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
    this.passPulse = 0;
    this.inputManager.resetAll();
    this.previousPlayInputs = this.createReadyState();
    this.updateHUD();
  }

  updateHardwareStatus(connected) {
    const badge = document.getElementById('rope-hardware-badge');
    const text = document.getElementById('rope-hardware-text');
    badge.className = connected ? 'status-badge connected' : 'status-badge local';
    text.textContent = connected ? 'ESP32 LIVE' : 'PC TEST MODE';
  }

  updateInputUI(inputs) {
    document.querySelectorAll('.rope-player-button[data-action]').forEach((button) => {
      button.classList.toggle('active', Boolean(inputs[button.dataset.action]));
    });
    const active = this.playerMeta.filter((meta) => inputs[meta.action]).map((meta) => meta.label);
    const status = document.getElementById('rope-input-status');
    status.textContent = active.length ? `JUMP: ${active.join(' + ')}` : 'INPUT READY';
    status.classList.toggle('active', active.length > 0);
  }

  handleJumpInput(inputs) {
    for (const action of this.actions) {
      if (inputs[action] && !this.previousPlayInputs[action]) this.jumpPlayer(action);
    }
    this.previousPlayInputs = { ...inputs };
  }

  jumpPlayer(action) {
    const player = this.players.find((candidate) => candidate.action === action);
    if (!player || player.eliminated || player.stunned > 0 || player.height > 2) return false;
    player.velocity = this.jumpVelocity;
    player.squash = 1;
    this.soundEngine.playBeep(360 + this.players.indexOf(player) * 80, 0.08, 'triangle');
    return true;
  }

  getRopeSpeed() {
    const progress = Math.min(1, this.elapsed / this.gameDuration);
    const rotationsPerSecond = 0.44 + progress * 0.24;
    return Math.PI * 2 * rotationsPerSecond;
  }

  update(dt) {
    this.elapsed += dt;
    this.timeRemaining = Math.max(0, this.gameDuration - this.elapsed);
    this.passPulse = Math.max(0, this.passPulse - dt * 2.8);

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
    const previousPass = Math.floor((previousAngle - Math.PI / 2) / (Math.PI * 2));
    const currentPass = Math.floor((this.ropeAngle - Math.PI / 2) / (Math.PI * 2));
    if (currentPass > previousPass) this.resolveRopePass();

    this.updateJumpCallout();
    this.updateHUD();
    if (this.timeRemaining <= 0) this.endGame('TIME_UP');
  }

  resolveRopePass() {
    const activePlayers = this.players.filter((player) => !player.eliminated);
    if (!activePlayers.length) return;
    let allClear = true;
    for (const player of activePlayers) {
      if (player.height >= this.clearHeight) {
        player.clears++;
        this.score++;
        player.flash = 0.25;
      } else {
        allClear = false;
        player.lives--;
        player.misses++;
        player.stunned = 0.75;
        player.flash = 0.75;
        player.eliminated = player.lives <= 0;
      }
    }
    this.passPulse = 1;
    if (allClear) {
      this.perfectCount++;
      this.showCallout('PERFECT ×4!', 650);
      this.soundEngine.playSuccess();
    } else {
      this.showCallout('줄에 걸렸어요!', 650);
      this.soundEngine.playCrash();
    }
    if (this.players.every((player) => player.eliminated)) this.endGame('ALL_OUT');
  }

  updateJumpCallout() {
    const phase = ((this.ropeAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const warning = phase > 0.48 && phase < 1.18;
    const callout = document.getElementById('rope-callout');
    if (!this.calloutTimer) {
      callout.textContent = 'JUMP!';
      callout.classList.toggle('hidden', !warning);
    }
  }

  showCallout(message, duration) {
    window.clearTimeout(this.calloutTimer);
    const callout = document.getElementById('rope-callout');
    callout.textContent = message;
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
      time.textContent = Math.ceil(this.timeRemaining);
      time.classList.toggle('urgent', this.timeRemaining <= 10);
    }
  }

  endGame(reason) {
    if (this.state !== 'PLAYING') return;
    this.state = 'GAMEOVER';
    this.inputManager.resetAll();
    window.clearTimeout(this.calloutTimer);
    this.calloutTimer = null;
    document.getElementById('rope-callout').classList.add('hidden');
    const badge = document.getElementById('rope-gameover-badge');
    const message = document.getElementById('rope-gameover-message');
    badge.textContent = reason === 'TIME_UP' ? "TIME'S UP!" : 'TEAM OUT';
    message.textContent = this.score >= 45 ? '우리 팀 호흡이 최고예요!' : this.score >= 24 ? '우리 팀 호흡이 좋아요!' : '박자를 맞춰 다시 도전!';
    document.getElementById('rope-final-score').textContent = this.score;
    document.getElementById('rope-perfect-count').textContent = this.perfectCount;
    document.getElementById('rope-player-results').innerHTML = this.players.map((player, index) =>
      `<div class="rope-result-card p${index + 1}"><span>${player.label} · ${player.key}</span><strong>${player.clears}회</strong><span>실수 ${player.misses}</span></div>`
    ).join('');
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
    ctx.fillStyle = '#f8fafc';
    ctx.globalAlpha = 0.9;
    ctx.font = '950 42px "Arial Rounded MT Bold", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('4-PLAYER  ·  ONE ROPE  ·  FOUR JUMPS', 800, 82);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#6d5a9a';
    ctx.fillRect(0, this.groundY, this.canvas.width, this.canvas.height - this.groundY);
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 3;
    for (let y = this.groundY + 55; y < 900; y += 55) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1600, y); ctx.stroke();
    }
    for (let x = 0; x < 1600; x += 150) {
      ctx.beginPath(); ctx.moveTo(800, this.groundY); ctx.lineTo(x, 900); ctx.stroke();
    }
  }

  getRopeGeometry() {
    const phase = this.ropeAngle;
    return {
      y: this.ropeCenterY + Math.sin(phase) * this.ropeRadius,
      front: Math.cos(phase) < 0,
      width: 8 + Math.max(0, -Math.cos(phase)) * 6
    };
  }

  drawRope() {
    const ctx = this.ctx;
    const rope = this.getRopeGeometry();
    ctx.save();
    ctx.strokeStyle = rope.front ? '#fef08a' : 'rgba(254,240,138,.5)';
    ctx.lineWidth = rope.width;
    ctx.lineCap = 'round';
    ctx.shadowColor = rope.front ? 'rgba(250,204,21,.65)' : 'transparent';
    ctx.shadowBlur = rope.front ? 12 : 0;
    ctx.beginPath();
    ctx.moveTo(230, this.ropeCenterY);
    ctx.quadraticCurveTo(800, rope.y, 1370, this.ropeCenterY);
    ctx.stroke();
    ctx.restore();
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
    ctx.globalAlpha = player.eliminated ? 0.34 : 1;

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

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = '900 19px system-ui, sans-serif';
    ctx.fillText(`${player.key} · ${player.clears}회`, player.x, 735);
    ctx.fillStyle = player.lives > 0 ? '#fb7185' : '#a1a1aa';
    ctx.font = '900 23px system-ui, sans-serif';
    ctx.fillText(player.lives > 0 ? '♥'.repeat(player.lives) : 'OUT', player.x, 765);
    ctx.restore();
    this.canvas.dataset[`p${index + 1}Height`] = player.height.toFixed(1);
    this.canvas.dataset[`p${index + 1}Lives`] = String(player.lives);
    this.canvas.dataset[`p${index + 1}Clears`] = String(player.clears);
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBackground();
    const rope = this.getRopeGeometry();
    if (!rope.front) this.drawRope();
    this.drawTurner(245, false);
    this.drawTurner(1355, true);
    this.players.forEach((player, index) => this.drawPlayer(player, index));
    if (rope.front) this.drawRope();

    if (this.passPulse > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.passPulse * 0.12})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.canvas.dataset.gameState = this.state;
    this.canvas.dataset.score = String(this.score);
    this.canvas.dataset.perfect = String(this.perfectCount);
    this.canvas.dataset.ropeAngle = this.ropeAngle.toFixed(3);
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
