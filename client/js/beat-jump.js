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
    this.damageCooldownDuration = 2;
    this.waveTypes = {
      cone: { label: '가시', width: 92, height: 66, speed: 430, color: '#fb923c' },
      barrel: { label: '회전 기어', width: 84, height: 84, speed: 480, color: '#22d3ee' },
      cart: { label: '호버 로봇', width: 136, height: 92, speed: 590, color: '#8b5cf6' }
    };

    this.state = 'READY';
    this.lastTime = 0;
    this.readyPlayers = this.createInputState();
    this.previousReadyInputs = this.createInputState();
    this.previousPlayInputs = this.createInputState();
    this.readyStartTimer = null;
    this.countdownInterval = null;
    this.countdownHideTimer = null;
    this.directionHideTimer = null;

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

  createInputState() { return { forward: false, backward: false, left: false, right: false }; }
  createReadyState() { return this.createInputState(); }

  createPlayers() {
    return this.playerMeta.map((meta, index) => ({
      ...meta, x: this.playerXs[index], height: 0, velocity: 0,
      lives: 3, clears: 0, stunned: 0, flash: 0,
      squash: 0, lastJumpAt: -Infinity, eliminated: false
    }));
  }

  bindUI() {
    document.getElementById('beat-restart-btn').addEventListener('click', () => this.beginReadyCheck());
    document.getElementById('beat-sound-btn').addEventListener('click', (event) => {
      const muted = this.soundEngine.toggleFromButton();
      event.currentTarget.textContent = muted ? '🔇' : '🔊';
    });
  }

  beginReadyCheck() {
    this.soundEngine.stopMusic?.();
    window.clearTimeout(this.readyStartTimer);
    window.clearInterval(this.countdownInterval);
    window.clearTimeout(this.countdownHideTimer);
    window.clearTimeout(this.directionHideTimer);
    this.state = 'RESETTING_READY';
    this.readyPlayers = this.createInputState();
    this.previousReadyInputs = this.createInputState();
    document.body.classList.remove('is-playing');
    document.getElementById('beat-countdown').classList.add('hidden');
    document.getElementById('beat-gameover-modal').classList.add('hidden');
    document.getElementById('beat-start-modal').classList.remove('hidden');
    document.getElementById('beat-direction').classList.add('hidden');
    this.resetGame();
    this.state = 'READY';
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
    const count = this.actions.filter((action) => this.readyPlayers[action]).length;
    document.querySelectorAll('#beat-start-modal [data-ready-action]').forEach((card) => {
      const ready = Boolean(this.readyPlayers[card.dataset.readyAction]);
      card.classList.toggle('is-ready', ready);
      const button = card.querySelector('.ready-tap');
      if (button) button.textContent = ready ? '취소' : '준비';
    });
    const progress = document.getElementById('beat-ready-progress');
    progress.textContent = `${count} / 4`;
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
        this.soundEngine.startMusic('timing');
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
    this.damageCooldown = 0;
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
    document.getElementById('beat-hardware-text').textContent = connected ? 'ESP32' : 'PC';
  }

  updateInputUI(inputs) {
    document.querySelectorAll('.beat-player-button[data-action]').forEach((button) => button.classList.toggle('active', Boolean(inputs[button.dataset.action])));
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
    if (this.getTimeDifficultyTier() >= 3 && this.waveNumber % 2 === 0) return 'cart';
    if (this.waveNumber >= 6 && this.waveNumber % 3 === 2) return 'cart';
    return this.waveNumber % 2 === 0 ? 'cone' : 'barrel';
  }

  getTimeDifficultyTier() {
    return Math.min(5, Math.floor(this.elapsed / 30));
  }

  getWarningDuration() {
    return Math.max(0.75, 1.25 - this.getTimeDifficultyTier() * 0.08);
  }

  getWaveRestDelay() {
    return Math.max(0.55, 1.35 - this.elapsed / 100 - this.getTimeDifficultyTier() * 0.08);
  }

  chooseWavePlan() {
    const waveCount = this.waveNumber < 3 ? 1 : (this.waveNumber < 7 ? 2 : 3);
    const timeCount = this.elapsed >= 90 ? 3 : (this.elapsed >= 45 ? 2 : 1);
    const count = Math.max(waveCount, timeCount);
    const firstDirection = this.nextDirection;
    this.nextDirection *= -1;
    let directions = Array(count).fill(firstDirection);
    let label = '';

    if (count > 1 && this.waveNumber % 3 === 2) {
      directions = Array.from({ length: count }, (_, index) => index % 2 === 0 ? firstDirection : -firstDirection);
    } else if (count === 3 && this.waveNumber % 3 === 1) {
      directions = [firstDirection, firstDirection, -firstDirection];
    }
    label = this.formatWavePlan(directions);

    return { count, directions, label, type: this.chooseObstacleType() };
  }

  formatWavePlan(directions) {
    const arrows = directions.map((direction) => direction > 0 ? '→' : '←');
    const sequence = new Set(directions).size > 1 ? arrows.join(' ') : arrows[0];
    return `${sequence} ×${directions.length}`;
  }

  beginWarning() {
    const plan = this.chooseWavePlan();
    this.warning = { plan, elapsed: 0, duration: this.getWarningDuration() };
    this.showDirection(plan);
    this.soundEngine.playBeep(430, 0.12, 'square');
  }

  showDirection(plan) {
    const panel = document.getElementById('beat-direction');
    const text = document.getElementById('beat-direction-text');
    const arrow = document.getElementById('beat-direction-arrow');
    panel.classList.remove('hidden');
    const mixed = new Set(plan.directions).size > 1;
    panel.dataset.direction = mixed || plan.directions[0] > 0 ? 'left' : 'right';
    arrow.textContent = mixed
      ? plan.directions.map((direction) => direction > 0 ? '→' : '←').join(' ')
      : (plan.directions[0] > 0 ? '→' : '←');
    text.textContent = `×${plan.count}`;
  }

  updateWarning(dt) {
    this.warning.elapsed += dt;
    if (this.warning.elapsed >= this.warning.duration) this.spawnWave();
  }

  makeObstacle(type, direction, offset, waveId) {
    const baseType = type === 'double' || type === 'triple' || type === 'pinch' ? 'cone' : type;
    const config = this.waveTypes[baseType];
    const progressBoost = (1 + Math.min(0.3, this.elapsed / 200))
      * (1 + this.getTimeDifficultyTier() * 0.05);
    const startX = direction > 0 ? -130 - offset : 1730 + offset;
    return {
      type: baseType, direction, x: startX, y: this.groundY,
      width: config.width, height: config.height,
      speed: config.speed * progressBoost, color: config.color,
      variant: waveId % 3, judged: new Set(), waveId
    };
  }

  spawnWave() {
    const { plan } = this.warning;
    const id = ++this.waveNumber;
    const activeCount = this.players.filter((player) => !player.eliminated).length;
    let launchDelay = 0;
    let previousDirection = null;
    plan.directions.forEach((direction, index) => {
      const obstacle = this.makeObstacle(plan.type, direction, 0, id);
      if (index > 0) {
        const landingRecovery = 1.05;
        const teamTraversal = Math.abs(this.playerXs[this.playerXs.length - 1] - this.playerXs[0]) / obstacle.speed;
        launchDelay += direction === previousDirection
          ? landingRecovery
          : teamTraversal + landingRecovery;
      }
      obstacle.launchDelay = launchDelay;
      obstacle.x += direction > 0
        ? -launchDelay * obstacle.speed
        : launchDelay * obstacle.speed;
      this.obstacles.push(obstacle);
      previousDirection = direction;
    });
    this.wave = {
      id, type: plan.type, direction: plan.directions.length === 1 ? plan.directions[0] : 0,
      planLabel: plan.label, obstacleCount: plan.count, perfect: true, successes: 0,
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
        if (!this.shouldJudgeObstacle(player, obstacle)) continue;
        obstacle.judged.add(player.action);
        this.judgePlayer(player, obstacle);
      }
    }
    // A later obstacle can intentionally wait far outside the entrance so the
    // previous jump has time to land. Only remove it after it exits in its own
    // travel direction; never delete it while it is still waiting to enter.
    this.obstacles = this.obstacles.filter((obstacle) => this.shouldKeepObstacle(obstacle));
    if (this.wave && !this.obstacles.some((obstacle) => obstacle.waveId === this.wave.id)) this.finishWave();
  }

  shouldKeepObstacle(obstacle) {
    return obstacle.direction > 0 ? obstacle.x < 1920 : obstacle.x > -320;
  }

  shouldJudgeObstacle(player, obstacle) {
    const centerTolerance = 12;
    return obstacle.direction > 0
      ? obstacle.x >= player.x - centerTolerance
      : obstacle.x <= player.x + centerTolerance;
  }

  isSuccessfulJump(player, obstacle) {
    const requiredHeight = Math.min(72, Math.max(38, obstacle.height * 0.62));
    const timeSinceJump = this.elapsed - player.lastJumpAt;
    const takeoffGrace = timeSinceJump >= 0 && timeSinceJump <= 0.2 && player.velocity > 0;
    return player.height >= requiredHeight || takeoffGrace;
  }

  judgePlayer(player, obstacle) {
    if (this.sharedLives <= 0) return;
    if (this.isSuccessfulJump(player, obstacle)) {
      player.clears++;
      player.flash = 0.25;
      this.score += 1;
      this.wave.successes++;
      this.spawnBurst(player.x, this.groundY - Math.max(70, player.height), player.color, 8);
    } else {
      this.wave.perfect = false;
      if (this.damageCooldown <= 0) {
        this.sharedLives = Math.max(0, this.sharedLives - 1);
        this.damageCooldown = this.damageCooldownDuration;
        this.soundEngine.playCrash();
      }
    }
    if (this.sharedLives <= 0) this.endGame('ALL_OUT');
  }

  finishWave() {
    const perfect = this.wave.perfect && this.wave.successes === this.wave.expected && this.wave.expected > 0;
    if (perfect) this.soundEngine.playSuccess();
    this.wave = null;
    this.nextWaveTimer = this.getWaveRestDelay();
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
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
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
    document.querySelector('.beat-time-card').classList.toggle('is-invulnerable', this.damageCooldown > 0);
  }

  spawnBurst(x, y, color, amount) {
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 210;
      this.particles.push({ x, y, color, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 80, size: 4 + Math.random() * 8, life: 0.55 + Math.random() * 0.35 });
    }
  }

  updateEffects(dt) {
    for (const particle of this.particles) { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 560 * dt; particle.life -= dt; }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  endGame(reason) {
    if (this.state !== 'PLAYING') return;
    this.state = 'GAMEOVER';
    this.soundEngine.stopMusic();
    this.inputManager.resetAll();
    document.getElementById('beat-direction').classList.add('hidden');
    document.getElementById('beat-gameover-message').textContent = '게임 종료';
    document.getElementById('beat-final-score').textContent = this.score;
    document.getElementById('beat-best-combo').textContent = this.waveNumber;
    document.getElementById('beat-gameover-modal').classList.remove('hidden');
  }

  drawBackground() {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, 900);
    gradient.addColorStop(0, '#123647'); gradient.addColorStop(.65, '#1f5262'); gradient.addColorStop(.66, '#3d6770'); gradient.addColorStop(1, '#27434e');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1600, 900);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (let x = 50; x < 1600; x += 115) { ctx.beginPath(); ctx.arc(x, 105 + x % 210 * .13, 14, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#47747d'; ctx.fillRect(0, this.groundY, 1600, 220);
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 5; ctx.setLineDash([48, 30]);
    ctx.beginPath(); ctx.moveTo(0, this.groundY + 100); ctx.lineTo(1600, this.groundY + 100); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#a5f3fc'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, this.groundY); ctx.lineTo(1600, this.groundY); ctx.stroke();
  }

  drawPlayer(player, index) {
    const ctx = this.ctx;
    const y = this.groundY - player.height;
    const pulse = player.flash > 0 && Math.floor(player.flash * 16) % 2 === 0;
    const squash = player.height === 0 ? 1 - player.squash * 0.13 : 1.04;
    ctx.save();
    ctx.translate(player.x, y);
    ctx.fillStyle = 'rgba(5,20,28,.35)';
    ctx.beginPath(); ctx.ellipse(0, player.height, 54 - Math.min(27, player.height * .13), 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.scale(1 + (1 - squash) * .7, squash);
    ctx.strokeStyle = pulse ? '#fff' : '#15202b';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Four non-human mascot silhouettes: antenna, ears, horns, and leaf.
    ctx.fillStyle = player.color;
    if (index === 0) {
      ctx.beginPath(); ctx.moveTo(0,-151); ctx.lineTo(0,-181); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,-190,11,0,Math.PI*2); ctx.fill(); ctx.stroke();
    } else if (index === 1) {
      ctx.beginPath(); ctx.moveTo(-42,-139); ctx.lineTo(-26,-181); ctx.lineTo(-7,-145); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(42,-139); ctx.lineTo(26,-181); ctx.lineTo(7,-145); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (index === 2) {
      ctx.beginPath(); ctx.moveTo(-35,-143); ctx.quadraticCurveTo(-59,-183,-20,-171); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(35,-143); ctx.quadraticCurveTo(59,-183,20,-171); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(4,-151); ctx.quadraticCurveTo(42,-190,48,-153); ctx.quadraticCurveTo(27,-145,4,-151); ctx.fill(); ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(-48,-22);
    ctx.bezierCurveTo(-68,-65,-62,-132,-32,-151);
    ctx.bezierCurveTo(-12,-165,12,-165,32,-151);
    ctx.bezierCurveTo(62,-132,68,-65,48,-22);
    ctx.quadraticCurveTo(28,5,0,-2);
    ctx.quadraticCurveTo(-28,5,-48,-22);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Side nubs and springy feet keep the creature readable while jumping.
    const lift = player.height > 12 ? 12 : 0;
    ctx.beginPath(); ctx.ellipse(-59,-70-lift,18,12,-.65,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(59,-70-lift,18,12,.65,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-25,-2-lift,24,12,-.12,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(25,-2-lift,24,12,.12,0,Math.PI*2); ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-18,-105,13,17,0,0,Math.PI*2); ctx.ellipse(18,-105,13,17,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#15202b';
    ctx.beginPath(); ctx.arc(-16,-102,5,0,Math.PI*2); ctx.arc(16,-102,5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(0,-79,13,.12,Math.PI-.12); ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.roundRect(-28,-63,56,34,12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = player.dark;
    ctx.font = '950 20px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(player.label,0,-39);
    ctx.restore();
    this.canvas.dataset[`p${index + 1}Height`] = player.height.toFixed(1);
    this.canvas.dataset[`p${index + 1}Lives`] = String(this.sharedLives);
  }

  drawObstacle(obstacle) {
    const ctx = this.ctx;
    const accent = obstacle.variant % 2 === 0 ? '#facc15' : '#fb7185';
    ctx.save();
    ctx.translate(obstacle.x, this.groundY);
    ctx.scale(obstacle.direction, 1);
    ctx.strokeStyle = '#15202b';
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(3, 18, 25, .35)';
    ctx.beginPath(); ctx.ellipse(0, 7, obstacle.width * .58, 11, 0, 0, Math.PI * 2); ctx.fill();

    if (obstacle.type === 'cone') {
      // A three-spike crystal cluster: low, wide, and clearly jumpable.
      ctx.fillStyle = '#f97316';
      ctx.beginPath(); ctx.moveTo(-46,0); ctx.lineTo(-27,-44-obstacle.variant*4); ctx.lineTo(-8,0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = obstacle.color;
      ctx.beginPath(); ctx.moveTo(-24,0); ctx.lineTo(1,-obstacle.height); ctx.lineTo(27,0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(34,-38+obstacle.variant*3); ctx.lineTo(50,0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff7ed';
      ctx.beginPath(); ctx.moveTo(-5,-48); ctx.lineTo(2,-58); ctx.lineTo(9,-42); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#15202b';
      ctx.beginPath(); ctx.roundRect(-51,-10,102,15,7); ctx.fill();
    } else if (obstacle.type === 'barrel') {
      // Bright rolling gear replaces the old brown ball.
      ctx.save();
      ctx.translate(0, -obstacle.height / 2);
      ctx.rotate(obstacle.x * .022 * obstacle.direction);
      ctx.fillStyle = accent;
      for (let index = 0; index < 10; index++) {
        ctx.save(); ctx.rotate(index * Math.PI / 5); ctx.fillRect(-8,-51,16,19); ctx.restore();
      }
      ctx.fillStyle = obstacle.color;
      ctx.beginPath(); ctx.arc(0,0,39,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 8;
      for (let index = 0; index < 4; index++) {
        ctx.save(); ctx.rotate(index * Math.PI / 2); ctx.beginPath(); ctx.moveTo(0,-9); ctx.lineTo(0,-31); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle = '#fb7185'; ctx.strokeStyle = '#15202b'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(0,0,13,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.restore();
    } else {
      // Fast hover robot with a canopy, face, and two glowing thrusters.
      ctx.fillStyle = '#67e8f9';
      ctx.beginPath(); ctx.ellipse(-43,-5,20,10,0,0,Math.PI*2); ctx.ellipse(43,-5,20,10,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.moveTo(-53,-4); ctx.lineTo(-43,16); ctx.lineTo(-33,-4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(33,-4); ctx.lineTo(43,16); ctx.lineTo(53,-4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = obstacle.color;
      ctx.beginPath(); ctx.roundRect(-68,-70,136,62,22); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c4b5fd';
      ctx.beginPath(); ctx.ellipse(0,-70,38,34,0,Math.PI,0); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-18,-42,11,0,Math.PI*2); ctx.arc(18,-42,11,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#15202b';
      ctx.beginPath(); ctx.arc(-15,-40,5,0,Math.PI*2); ctx.arc(15,-40,5,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#15202b'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-12,-22); ctx.lineTo(12,-22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-104); ctx.lineTo(0,-119); ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(0,-125,7,0,Math.PI*2); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.font = '950 24px system-ui';
    ctx.textAlign = 'center';
    const arrowY = obstacle.type === 'cart' ? -158 : -obstacle.height - 28;
    ctx.fillText(obstacle.direction > 0 ? '→' : '←',0,arrowY);
    ctx.restore();
  }

  drawEffects() {
    const ctx = this.ctx;
    for (const p of this.particles) { ctx.globalAlpha = Math.min(1,p.life*2); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill(); }
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
    this.canvas.dataset.direction = this.warning
      ? this.warning.plan.directions.join(',')
      : (this.wave ? String(this.wave.direction) : '0');
    this.canvas.dataset.waveType = this.warning ? this.warning.plan.type : (this.wave ? this.wave.type : 'none');
    this.canvas.dataset.waveObstacleCount = this.warning
      ? String(this.warning.plan.count)
      : (this.wave ? String(this.wave.obstacleCount) : '0');
    this.canvas.dataset.wavePlan = this.warning ? this.warning.plan.label : (this.wave ? this.wave.planLabel : 'none');
    this.canvas.dataset.rhythmPattern = 'none';
    this.canvas.dataset.rhythmNotation = 'none';
    this.canvas.dataset.waveNumber = String(this.waveNumber);
    this.canvas.dataset.combo = String(this.combo);
    this.canvas.dataset.sharedLives = String(this.sharedLives);
    this.canvas.dataset.damageCooldown = this.damageCooldown.toFixed(2);
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
