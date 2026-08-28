/** Four-player timing jump: obstacles cross the team from left or right. */
class BeatJumpGame {
  constructor() {
    this.canvas = document.getElementById('beatCanvas');
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
    this.groundY = 680;
    this.jumpVelocity = 790;
    this.gravity = 1950;
    this.gameDuration = 60;
    this.waveTypes = {
      cone: { label: '삼각 장애물', width: 84, height: 62, speed: 430, color: '#fb923c' },
      barrel: { label: '통나무', width: 78, height: 78, speed: 480, color: '#a16207' },
      cart: { label: '스피드 카트', width: 132, height: 88, speed: 590, color: '#8b5cf6' }
    };

    this.state = 'READY';
    this.lastTime = 0;
    this.readyPlayers = this.createInputState();
    this.previousReadyInputs = this.createInputState();
    this.previousPlayInputs = this.createInputState();
    this.readyStartTimer = null;
    this.countdownInterval = null;
    this.countdownHideTimer = null;
    this.calloutTimer = null;
    this.directionHideTimer = null;

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

  createInputState() { return { forward: false, backward: false, left: false, right: false }; }
  createReadyState() { return this.createInputState(); }

  createPlayers() {
    return this.playerMeta.map((meta, index) => ({
      ...meta, x: this.playerXs[index], height: 0, velocity: 0,
      lives: 3, clears: 0, misses: 0, stunned: 0, flash: 0,
      squash: 0, lastJumpAt: -Infinity, eliminated: false
    }));
  }

  bindUI() {
    document.getElementById('beat-restart-btn').addEventListener('click', () => this.beginReadyCheck());
    document.getElementById('beat-sound-btn').addEventListener('click', (event) => {
      this.soundEngine.isMuted = !this.soundEngine.isMuted;
      event.currentTarget.textContent = this.soundEngine.isMuted ? '🔇' : '🔊';
    });
  }

  beginReadyCheck() {
    window.clearTimeout(this.readyStartTimer);
    window.clearInterval(this.countdownInterval);
    window.clearTimeout(this.countdownHideTimer);
    window.clearTimeout(this.calloutTimer);
    window.clearTimeout(this.directionHideTimer);
    this.state = 'RESETTING_READY';
    this.readyPlayers = this.createInputState();
    this.previousReadyInputs = this.createInputState();
    document.body.classList.remove('is-playing');
    document.getElementById('beat-countdown').classList.add('hidden');
    document.getElementById('beat-gameover-modal').classList.add('hidden');
    document.getElementById('beat-start-modal').classList.remove('hidden');
    document.getElementById('beat-callout').classList.add('hidden');
    document.getElementById('beat-direction').classList.add('hidden');
    this.resetGame();
    this.state = 'READY';
    this.updateReadyUI();
  }

  handleReadyInput(inputs) {
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
    const count = this.actions.filter((action) => this.readyPlayers[action]).length;
    document.querySelectorAll('#beat-start-modal [data-ready-action]').forEach((card) => {
      const ready = Boolean(this.readyPlayers[card.dataset.readyAction]);
      card.classList.toggle('is-ready', ready);
      const status = card.querySelector('.ready-state');
      if (status) status.textContent = ready ? '준비 완료 ✓' : '대기 중';
    });
    const progress = document.getElementById('beat-ready-progress');
    progress.textContent = count === 4 ? '모두 준비 완료!' : `준비 ${count} / 4`;
    progress.classList.toggle('all-ready', count === 4);
  }

  startCountdown() {
    this.soundEngine.init();
    this.state = 'COUNTDOWN';
    this.resetGame();
    document.body.classList.add('is-playing');
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('beat-start-modal').classList.add('hidden');
    document.getElementById('beat-gameover-modal').classList.add('hidden');
    const overlay = document.getElementById('beat-countdown');
    const text = document.getElementById('beat-countdown-text');
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
        this.previousPlayInputs = this.createInputState();
        this.state = 'PLAYING';
        this.countdownHideTimer = window.setTimeout(() => overlay.classList.add('hidden'), 500);
      }
    }, 1000);
  }

  resetGame() {
    this.players = this.createPlayers();
    this.elapsed = 0;
    this.timeRemaining = this.gameDuration;
    this.score = 0;
    this.sharedLives = 3;
    this.combo = 0;
    this.bestCombo = 0;
    this.feverGauge = 0;
    this.feverRemaining = 0;
    this.waveNumber = 0;
    this.nextDirection = 1;
    this.nextWaveTimer = 1.2;
    this.warning = null;
    this.wave = null;
    this.obstacles = [];
    this.feedbacks = [];
    this.particles = [];
    this.shake = 0;
    this.hitFreeze = 0;
    this.passPulse = 0;
    this.inputManager.resetAll();
    this.previousPlayInputs = this.createInputState();
    this.updateHUD();
  }

  updateHardwareStatus(connected) {
    document.getElementById('beat-hardware-badge').className = connected ? 'status-badge connected' : 'status-badge local';
    document.getElementById('beat-hardware-text').textContent = connected ? 'ESP32 LIVE' : 'PC TEST MODE';
  }

  updateInputUI(inputs) {
    document.querySelectorAll('.beat-player-button[data-action]').forEach((button) => button.classList.toggle('active', Boolean(inputs[button.dataset.action])));
    const active = this.playerMeta.filter((meta) => inputs[meta.action]).map((meta) => meta.label);
    const status = document.getElementById('beat-input-status');
    status.textContent = active.length ? `JUMP: ${active.join(' + ')}` : 'INPUT READY';
    status.classList.toggle('active', active.length > 0);
  }

  handleJumpInput(inputs) {
    for (const action of this.actions) if (inputs[action] && !this.previousPlayInputs[action]) this.jumpPlayer(action);
    this.previousPlayInputs = { ...inputs };
  }

  jumpPlayer(action) {
    const player = this.players.find((candidate) => candidate.action === action);
    if (!player || player.eliminated || player.stunned > 0 || player.height > 2) return false;
    player.velocity = this.jumpVelocity;
    player.squash = 1;
    player.lastJumpAt = this.elapsed;
    this.soundEngine.playBeep(360 + this.players.indexOf(player) * 80, 0.08, 'triangle');
    return true;
  }

  chooseObstacleType() {
    if (this.waveNumber >= 6 && this.waveNumber % 3 === 2) return 'cart';
    return this.waveNumber % 2 === 0 ? 'cone' : 'barrel';
  }

  beginWarning() {
    const type = this.chooseObstacleType();
    const direction = this.nextDirection;
    this.nextDirection *= -1;
    this.warning = { type, direction, elapsed: 0, duration: 1.15 };
    this.showDirection(direction);
    this.soundEngine.playBeep(430, 0.12, 'square');
  }

  showDirection(direction) {
    const panel = document.getElementById('beat-direction');
    const text = document.getElementById('beat-direction-text');
    const arrow = document.getElementById('beat-direction-arrow');
    panel.classList.remove('hidden');
    if (direction > 0) {
      panel.dataset.direction = 'left';
      text.textContent = '왼쪽에서 온다';
      arrow.textContent = '→';
    } else {
      panel.dataset.direction = 'right';
      text.textContent = '오른쪽에서 온다';
      arrow.textContent = '←';
    }
  }

  updateWarning(dt) {
    this.warning.elapsed += dt;
    if (this.warning.elapsed >= this.warning.duration) this.spawnWave();
  }

  makeObstacle(type, direction, offset, waveId) {
    const baseType = type === 'double' || type === 'triple' || type === 'pinch' ? 'cone' : type;
    const config = this.waveTypes[baseType];
    const progressBoost = 1 + Math.min(0.3, this.elapsed / 200);
    const startX = direction > 0 ? -130 - offset : 1730 + offset;
    return {
      type: baseType, direction, x: startX, y: this.groundY,
      width: config.width, height: config.height,
      speed: config.speed * progressBoost, color: config.color,
      judged: new Set(), waveId
    };
  }

  spawnWave() {
    const { type, direction } = this.warning;
    const id = ++this.waveNumber;
    const activeCount = this.players.filter((player) => !player.eliminated).length;
    this.obstacles.push(this.makeObstacle(type, direction, 0, id));
    this.wave = {
      id, type, direction, perfect: true, successes: 0,
      expected: this.obstacles.filter((obstacle) => obstacle.waveId === id).length * activeCount
    };
    this.warning = null;
    window.clearTimeout(this.directionHideTimer);
    this.directionHideTimer = window.setTimeout(() => document.getElementById('beat-direction').classList.add('hidden'), 900);
  }

  updateObstacles(dt) {
    for (const obstacle of this.obstacles) {
      obstacle.x += obstacle.direction * obstacle.speed * dt;
      for (const player of this.players) {
        if (player.eliminated || obstacle.judged.has(player.action)) continue;
        const approaching = obstacle.direction > 0 ? obstacle.x <= player.x + 35 : obstacle.x >= player.x - 35;
        if (!approaching) continue;
        if (Math.abs(obstacle.x - player.x) > obstacle.width * 0.42 + 30) continue;
        obstacle.judged.add(player.action);
        this.judgePlayer(player, obstacle);
      }
    }
    this.obstacles = this.obstacles.filter((obstacle) => obstacle.x > -320 && obstacle.x < 1920);
    if (this.wave && !this.obstacles.some((obstacle) => obstacle.waveId === this.wave.id)) this.finishWave();
  }

  judgePlayer(player, obstacle) {
    const requiredHeight = Math.min(78, obstacle.height * 0.72);
    const onBeatJump = this.elapsed - player.lastJumpAt <= 0.17;
    if (player.height >= requiredHeight || onBeatJump) {
      player.clears++;
      player.flash = 0.25;
      this.score += 1;
      this.wave.successes++;
      this.addFeedback(player, 'CLEAR +1', '#a7f3d0');
      this.spawnBurst(player.x, this.groundY - Math.max(70, player.height), player.color, 8);
    } else {
      this.sharedLives--;
      player.misses++;
      player.stunned = 0.65;
      player.flash = 0.75;
      this.wave.perfect = false;
      this.addFeedback(player, 'MISS!', '#fb7185');
      this.spawnBurst(player.x, this.groundY - 35, '#fb7185', 16);
      this.soundEngine.playCrash();
      this.shake = 13;
      this.hitFreeze = 0.09;
    }
    if (this.sharedLives <= 0) this.endGame('ALL_OUT');
  }

  finishWave() {
    const perfect = this.wave.perfect && this.wave.successes === this.wave.expected && this.wave.expected > 0;
    if (perfect) this.soundEngine.playSuccess();
    this.wave = null;
    this.nextWaveTimer = Math.max(0.7, 1.35 - this.elapsed / 100);
    this.passPulse = 1;
  }

  update(dt) {
    if (this.hitFreeze > 0) {
      this.hitFreeze = Math.max(0, this.hitFreeze - dt);
      this.updateEffects(dt);
      this.updateHUD();
      return;
    }
    this.elapsed += dt;
    this.passPulse = Math.max(0, this.passPulse - dt * 2.5);
    this.shake = Math.max(0, this.shake - dt * 25);

    for (const player of this.players) {
      player.flash = Math.max(0, player.flash - dt);
      player.stunned = Math.max(0, player.stunned - dt);
      player.squash = Math.max(0, player.squash - dt * 4);
      if (player.height > 0 || player.velocity > 0) {
        player.height += player.velocity * dt;
        player.velocity -= this.gravity * dt;
        if (player.height <= 0) { player.height = 0; player.velocity = 0; player.squash = 0.65; }
      }
    }

    if (this.warning) this.updateWarning(dt);
    else if (this.wave) this.updateObstacles(dt);
    else {
      this.nextWaveTimer -= dt;
      if (this.nextWaveTimer <= 0) this.beginWarning();
    }
    this.updateEffects(dt);
    this.updateHUD();
  }

  updateHUD() {
    document.getElementById('beat-score').textContent = this.score;
    const time = document.getElementById('beat-time');
    time.textContent = this.sharedLives > 0 ? '♥'.repeat(this.sharedLives) : '0';
    time.classList.toggle('urgent', this.sharedLives === 1);
  }

  showCallout(message, duration) {
    window.clearTimeout(this.calloutTimer);
    const callout = document.getElementById('beat-callout');
    callout.textContent = message;
    callout.classList.remove('hidden');
    this.calloutTimer = window.setTimeout(() => { this.calloutTimer = null; callout.classList.add('hidden'); }, duration);
  }

  addFeedback(player, text, color) { this.feedbacks.push({ x: player.x, y: this.groundY - 235 - player.height, text, color, life: 1 }); }

  spawnBurst(x, y, color, amount) {
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 210;
      this.particles.push({ x, y, color, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 80, size: 4 + Math.random() * 8, life: 0.55 + Math.random() * 0.35 });
    }
  }

  updateEffects(dt) {
    for (const feedback of this.feedbacks) { feedback.y -= 70 * dt; feedback.life -= dt * 1.25; }
    this.feedbacks = this.feedbacks.filter((feedback) => feedback.life > 0);
    for (const particle of this.particles) { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 560 * dt; particle.life -= dt; }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  endGame(reason) {
    if (this.state !== 'PLAYING') return;
    this.state = 'GAMEOVER';
    this.inputManager.resetAll();
    document.getElementById('beat-callout').classList.add('hidden');
    document.getElementById('beat-direction').classList.add('hidden');
    document.getElementById('beat-gameover-badge').textContent = 'TEAM LIFE 0';
    document.getElementById('beat-gameover-message').textContent = this.waveNumber >= 12 ? '양쪽 웨이브까지 돌파!' : this.waveNumber >= 6 ? '여러 개 타이밍도 좋아요!' : `${this.waveNumber}웨이브 돌파 · 다시 기록 도전!`;
    document.getElementById('beat-final-score').textContent = this.score;
    document.getElementById('beat-best-combo').textContent = this.waveNumber;
    document.getElementById('beat-player-results').innerHTML = this.players.map((player, index) => `<div class="beat-result-card p${index + 1}"><span>${player.label} · ${player.key}</span><strong>${player.clears}회</strong><span>실수 ${player.misses}</span></div>`).join('');
    document.getElementById('beat-gameover-modal').classList.remove('hidden');
  }

  drawBackground() {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, 900);
    gradient.addColorStop(0, '#123647'); gradient.addColorStop(.65, '#1f5262'); gradient.addColorStop(.66, '#3d6770'); gradient.addColorStop(1, '#27434e');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1600, 900);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (let x = 50; x < 1600; x += 115) { ctx.beginPath(); ctx.arc(x, 105 + x % 210 * .13, 14, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#e0f2fe'; ctx.font = '950 40px "Arial Rounded MT Bold", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('WATCH LEFT  ←   ·   →  WATCH RIGHT', 800, 78);
    ctx.fillStyle = '#47747d'; ctx.fillRect(0, this.groundY, 1600, 220);
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 5; ctx.setLineDash([48, 30]);
    ctx.beginPath(); ctx.moveTo(0, this.groundY + 100); ctx.lineTo(1600, this.groundY + 100); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#a5f3fc'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, this.groundY); ctx.lineTo(1600, this.groundY); ctx.stroke();
    if (this.warning) this.drawJumpOrder();
  }

  drawJumpOrder() {
    const ctx = this.ctx;
    const order = this.warning.direction < 0 ? [...this.players].reverse() : this.players;
    ctx.textAlign = 'center';
    order.forEach((player, index) => {
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.strokeStyle = '#15202b'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(player.x, 350, 27, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#15202b'; ctx.font = '950 22px system-ui'; ctx.fillText(String(index + 1), player.x, 358);
    });
  }

  drawPlayer(player, index) {
    const ctx = this.ctx;
    const y = this.groundY - player.height;
    const pulse = player.flash > 0 && Math.floor(player.flash * 16) % 2 === 0;
    ctx.save(); ctx.translate(player.x, y); ctx.globalAlpha = player.eliminated ? .3 : 1;
    ctx.fillStyle = 'rgba(5,20,28,.35)'; ctx.beginPath(); ctx.ellipse(0, player.height, 50 - Math.min(25, player.height * .13), 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = pulse ? '#fff' : '#15202b'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    const lift = player.height > 12 ? 14 : 0;
    ctx.beginPath(); ctx.moveTo(-19,-54); ctx.lineTo(-26,-8-lift); ctx.lineTo(-43,-lift); ctx.moveTo(19,-54); ctx.lineTo(26,-8-lift); ctx.lineTo(43,-lift); ctx.stroke();
    ctx.fillStyle = player.color; ctx.beginPath(); ctx.roundRect(-48,-146,96,98,28); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-42,-126); ctx.lineTo(-70,-84-lift); ctx.moveTo(42,-126); ctx.lineTo(70,-84-lift); ctx.stroke();
    ctx.fillStyle = '#f5cfa8'; ctx.beginPath(); ctx.arc(0,-181,40,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#15202b'; ctx.beginPath(); ctx.arc(-13,-185,4,0,Math.PI*2); ctx.arc(13,-185,4,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(0,-170,11,.1,Math.PI-.1); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(-29,-128,58,41,12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = player.dark; ctx.font = '950 22px system-ui'; ctx.textAlign = 'center'; ctx.fillText(player.label,0,-100); ctx.restore();
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '900 19px system-ui'; ctx.fillText(`${player.key} · ${player.clears}회`,player.x,730);
    ctx.fillStyle = '#a5f3fc'; ctx.font = '900 18px system-ui'; ctx.fillText(`통과 ${player.clears}`,player.x,760);
    this.canvas.dataset[`p${index + 1}Height`] = player.height.toFixed(1);
    this.canvas.dataset[`p${index + 1}Lives`] = String(this.sharedLives);
  }

  drawObstacle(obstacle) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(obstacle.x, this.groundY); ctx.scale(obstacle.direction, 1);
    ctx.strokeStyle = '#15202b'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
    if (obstacle.type === 'cone') {
      ctx.fillStyle = obstacle.color; ctx.beginPath(); ctx.moveTo(-38,0); ctx.lineTo(0,-obstacle.height); ctx.lineTo(38,0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(-23,-31,46,13);
    } else if (obstacle.type === 'barrel') {
      ctx.fillStyle = obstacle.color; ctx.beginPath(); ctx.arc(0,-obstacle.height/2,obstacle.width/2,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-32,-50); ctx.lineTo(32,-27); ctx.stroke();
    } else {
      ctx.fillStyle = obstacle.color; ctx.beginPath(); ctx.roundRect(-65,-70,130,58,18); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c4b5fd'; ctx.beginPath(); ctx.moveTo(-34,-70); ctx.lineTo(-7,-116); ctx.lineTo(34,-70); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#15202b'; ctx.beginPath(); ctx.arc(-42,-5,18,0,Math.PI*2); ctx.arc(42,-5,18,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '950 22px system-ui'; ctx.textAlign = 'center'; ctx.fillText('⚡',0,-34);
    }
    ctx.fillStyle = '#fff'; ctx.font = '950 24px system-ui'; ctx.textAlign = 'center'; ctx.fillText(obstacle.direction > 0 ? '→' : '←',0,-obstacle.height-22);
    ctx.restore();
  }

  drawEffects() {
    const ctx = this.ctx;
    for (const p of this.particles) { ctx.globalAlpha = Math.min(1,p.life*2); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill(); }
    for (const f of this.feedbacks) { ctx.globalAlpha = Math.min(1,f.life*2); ctx.font = '950 34px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 8; ctx.strokeStyle = '#15202b'; ctx.strokeText(f.text,f.x,f.y); ctx.fillStyle = f.color; ctx.fillText(f.text,f.x,f.y); }
    ctx.globalAlpha = 1;
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0,0,1600,900); ctx.save();
    if (this.shake > 0) ctx.translate((Math.random()-.5)*this.shake,(Math.random()-.5)*this.shake);
    this.drawBackground();
    this.players.forEach((player,index)=>this.drawPlayer(player,index));
    this.obstacles.forEach((obstacle)=>this.drawObstacle(obstacle));
    this.drawEffects(); ctx.restore();
    this.canvas.dataset.gameState = this.state;
    this.canvas.dataset.score = String(this.score);
    this.canvas.dataset.obstacles = String(this.obstacles.length);
    this.canvas.dataset.warningBeat = '0';
    this.canvas.dataset.direction = this.warning ? String(this.warning.direction) : (this.wave ? String(this.wave.direction) : '0');
    this.canvas.dataset.waveType = this.warning ? this.warning.type : (this.wave ? this.wave.type : 'none');
    this.canvas.dataset.rhythmPattern = 'none';
    this.canvas.dataset.rhythmNotation = 'none';
    this.canvas.dataset.waveNumber = String(this.waveNumber);
    this.canvas.dataset.combo = String(this.combo);
    this.canvas.dataset.sharedLives = String(this.sharedLives);
  }

  loop(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    const dt = Math.min(.05,(timestamp-this.lastTime)/1000);
    this.lastTime = timestamp;
    if (this.state === 'PLAYING') this.update(dt);
    this.draw();
    requestAnimationFrame((time)=>this.loop(time));
  }
}

window.addEventListener('DOMContentLoaded', () => { window.beatJumpGameInstance = new BeatJumpGame(); });
