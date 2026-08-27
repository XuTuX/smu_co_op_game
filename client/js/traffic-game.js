/**
 * Four-player 11x9 grid dodge mode with moving hazards, lasers, and pickups.
 * P1 moves up, P2 down, P3 left, and P4 right.
 */
class ObstacleDodgeGame {
  constructor() {
    this.canvas = document.getElementById('trafficCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = 1600;
    this.canvas.height = 894;

    this.inputManager = new InputManager();
    this.soundEngine = new SoundEngine();
    this.network = new NetworkClient(this.inputManager, (connected) => this.updateHardwareStatus(connected));

    this.arena = { left: 120, right: 1480, top: 24, bottom: 870, columns: 11, rows: 9 };
    this.cellWidth = (this.arena.right - this.arena.left) / this.arena.columns;
    this.verticalStep = 94;
    this.playerSpawn = {
      x: this.arena.left + (Math.floor(this.arena.columns / 2) + 0.5) * this.cellWidth,
      y: this.arena.top + 5.5 * this.verticalStep
    };
    this.doubleWaveScore = 150;
    this.laserUnlockScore = 300;
    this.doubleLaserScore = 500;
    this.player = {
      x: this.playerSpawn.x, y: this.playerSpawn.y,
      targetX: this.playerSpawn.x, targetY: this.playerSpawn.y,
      radius: 27, invulnerable: 0, hop: 0, animationTime: 0,
      movePose: 'stay'
    };
    this.playerSprites = this.loadPlayerSprites();
    this.inputRepeat = this.createInputRepeatState();
    this.hazards = [];
    this.lasers = [];
    this.collectibles = [];
    this.heart = null;
    this.heartSpawnTimer = Infinity;
    this.heartOpportunityUsed = false;
    this.trail = [];

    this.state = 'TITLE';
    this.downSpawnTimer = 0.9;
    this.sideSpawnTimer = 3.8;
    this.collectibleTimer = 3.2;
    this.laserSpawnTimer = Infinity;
    this.nextLaserOrientation = 'horizontal';
    this.nextSideDirection = -1;
    this.nextDownWaveIsDouble = true;
    this.nextSideWaveIsDouble = true;
    this.lastDownWaveSize = 0;
    this.lastSideWaveSize = 0;
    this.lastLaserWaveSize = 0;
    this.lastDownColumn = -1;
    this.elapsed = 0;
    this.score = 0;
    this.dodged = 0;
    this.bonusScore = 0;
    this.lives = 3;
    this.level = 1;
    this.lastTime = 0;
    this.toastTimer = null;

    this.bindUI();
    this.inputManager.onChange((inputs) => this.updateInputUI(inputs));
    this.network.connect();
    this.updateHUD();
    requestAnimationFrame((time) => this.loop(time));
  }

  createInputRepeatState() {
    return {
      forward: { wasPressed: false, held: 0, repeating: false },
      backward: { wasPressed: false, held: 0, repeating: false },
      left: { wasPressed: false, held: 0, repeating: false },
      right: { wasPressed: false, held: 0, repeating: false }
    };
  }

  loadPlayerSprites() {
    const spriteFiles = {
      stay: 'stay.png',
      left: 'left-transparent.png',
      right: 'right.png',
      jump: 'jump.png',
      down: 'down.png'
    };
    return Object.fromEntries(Object.entries(spriteFiles).map(([name, fileName]) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = `/assets/charcter_movement/${fileName}?v=20260827-2`;
      return [name, image];
    }));
  }

  bindUI() {
    document.getElementById('traffic-start-btn').addEventListener('click', () => this.startCountdown());
    document.getElementById('traffic-restart-btn').addEventListener('click', () => this.startCountdown());
    document.getElementById('traffic-sound-btn').addEventListener('click', (event) => {
      this.soundEngine.isMuted = !this.soundEngine.isMuted;
      event.currentTarget.textContent = this.soundEngine.isMuted ? '🔇' : '🔊';
    });
  }

  updateHardwareStatus(connected) {
    const badge = document.getElementById('traffic-hardware-badge');
    const text = document.getElementById('traffic-hardware-text');
    badge.className = connected ? 'status-badge connected' : 'status-badge local';
    text.textContent = connected ? 'ESP32 LIVE' : 'PC TEST MODE';
  }

  updateInputUI(inputs) {
    document.querySelectorAll('.canvas-control[data-action]').forEach((button) => {
      button.classList.toggle('active', Boolean(inputs[button.dataset.action]));
    });
    const labels = [];
    if (inputs.forward) labels.push('UP');
    if (inputs.backward) labels.push('DOWN');
    if (inputs.left) labels.push('LEFT');
    if (inputs.right) labels.push('RIGHT');
    const status = document.getElementById('traffic-input-status');
    status.textContent = labels.length ? `INPUT: ${labels.join(' + ')}` : 'INPUT READY';
    status.classList.toggle('active', labels.length > 0);
  }

  resetGame() {
    Object.assign(this.player, {
      x: this.playerSpawn.x, y: this.playerSpawn.y,
      targetX: this.playerSpawn.x, targetY: this.playerSpawn.y,
      invulnerable: 0, hop: 0, animationTime: 0,
      movePose: 'stay'
    });
    this.inputRepeat = this.createInputRepeatState();
    this.hazards = [];
    this.lasers = [];
    this.collectibles = [];
    this.heart = null;
    this.heartSpawnTimer = Infinity;
    this.heartOpportunityUsed = false;
    this.trail = [];
    this.downSpawnTimer = 0.9;
    this.sideSpawnTimer = 3.8;
    this.collectibleTimer = 3.2;
    this.laserSpawnTimer = Infinity;
    this.nextLaserOrientation = 'horizontal';
    this.nextSideDirection = -1;
    this.nextDownWaveIsDouble = true;
    this.nextSideWaveIsDouble = true;
    this.lastDownWaveSize = 0;
    this.lastSideWaveSize = 0;
    this.lastLaserWaveSize = 0;
    this.lastDownColumn = -1;
    this.elapsed = 0;
    this.score = 0;
    this.dodged = 0;
    this.bonusScore = 0;
    this.lives = 3;
    this.level = 1;
    this.inputManager.resetAll();
    this.updateHUD();
  }

  startCountdown() {
    this.soundEngine.init();
    this.resetGame();
    document.body.classList.add('is-playing');
    window.scrollTo({ top: 0, behavior: 'instant' });
    this.state = 'COUNTDOWN';
    document.getElementById('traffic-start-modal').classList.add('hidden');
    document.getElementById('traffic-gameover-modal').classList.add('hidden');
    const overlay = document.getElementById('traffic-countdown');
    const text = document.getElementById('traffic-countdown-text');
    overlay.classList.remove('hidden');
    let count = 3;
    text.textContent = count;
    const timer = window.setInterval(() => {
      count--;
      if (count > 0) text.textContent = count;
      else if (count === 0) text.textContent = 'GO!';
      else {
        window.clearInterval(timer);
        overlay.classList.add('hidden');
        this.state = 'PLAYING';
      }
    }, 650);
  }

  update(dt) {
    this.updatePlayer(dt);
    this.elapsed += dt;
    this.score = Math.floor(this.elapsed * 10) + this.bonusScore;

    const nextLevel = Math.min(8, 1 + Math.floor(this.score / 100));
    if (nextLevel !== this.level) {
      this.level = nextLevel;
    }
    if (this.score >= this.laserUnlockScore && !Number.isFinite(this.laserSpawnTimer)) {
      this.laserSpawnTimer = 1.8;
    }

    this.downSpawnTimer -= dt;
    if (this.downSpawnTimer <= 0) {
      this.spawnDownWave(this.getWaveSize('down'));
      this.downSpawnTimer = this.getDownSpawnDelay();
    }

    this.sideSpawnTimer -= dt;
    if (this.sideSpawnTimer <= 0) {
      this.spawnSideWave(this.getWaveSize('side'));
      this.sideSpawnTimer = this.getSideSpawnDelay();
    }

    this.collectibleTimer -= dt;
    if (this.collectibleTimer <= 0 && this.collectibles.length === 0) {
      this.spawnCollectible();
      this.collectibleTimer = 4.2 + Math.random() * 1.8;
    }

    if (this.score >= this.laserUnlockScore) {
      this.laserSpawnTimer -= dt;
      if (this.laserSpawnTimer <= 0 && this.lasers.length === 0) {
        this.spawnLaserWave(this.getLaserWaveSize());
        this.laserSpawnTimer = this.getLaserSpawnDelay();
      }
    }

    this.updateHazards(dt);
    this.updateLasers(dt);
    this.updateCollectibles(dt);
    this.updateHeart(dt);
    this.score = Math.floor(this.elapsed * 10) + this.bonusScore;
    this.updateHUD();
  }

  getWaveSize(type) {
    if (this.score < this.doubleWaveScore) return 1;
    const key = type === 'down' ? 'nextDownWaveIsDouble' : 'nextSideWaveIsDouble';
    if (this.score < 350) {
      const size = this[key] ? 2 : 1;
      this[key] = !this[key];
      return size;
    }
    if (this.score < 700) return 2;
    const size = this[key] ? 3 : 2;
    this[key] = !this[key];
    return size;
  }

  getDifficultyProgress() {
    return Math.min(1, this.score / 800);
  }

  getDownSpawnDelay() {
    const progress = this.getDifficultyProgress();
    return (1.28 - progress * 0.75) * (0.9 + Math.random() * 0.2);
  }

  getSideSpawnDelay() {
    const progress = this.getDifficultyProgress();
    return (3.9 - progress * 2.3) * (0.92 + Math.random() * 0.16);
  }

  getLaserSpawnDelay() {
    const progress = this.getDifficultyProgress();
    return 6.4 - progress * 2.6 + Math.random() * 0.6;
  }

  getLaserWaveSize() {
    return this.score >= this.doubleLaserScore ? 2 : 1;
  }

  updatePlayer(dt) {
    const inputs = this.inputManager.getCombinedState();
    const step = {
      forward: this.shouldStep('forward', inputs.forward, dt),
      backward: this.shouldStep('backward', inputs.backward, dt),
      left: this.shouldStep('left', inputs.left, dt),
      right: this.shouldStep('right', inputs.right, dt)
    };
    const moveX = (step.right ? 1 : 0) - (step.left ? 1 : 0);
    const moveY = (step.backward ? 1 : 0) - (step.forward ? 1 : 0);
    if (moveX !== 0 || moveY !== 0) {
      if (moveY < 0) this.player.movePose = 'jump';
      else if (moveY > 0) this.player.movePose = 'down';
      else if (moveX < 0) this.player.movePose = 'left';
      else this.player.movePose = 'right';
      this.trail.push({ x: this.player.x, y: this.player.y, alpha: 0.48 });
      if (this.trail.length > 24) this.trail.shift();
      this.player.targetX += moveX * this.cellWidth;
      this.player.targetY += moveY * this.verticalStep;
      this.player.targetX = Math.max(this.arena.left + this.cellWidth / 2, Math.min(this.arena.right - this.cellWidth / 2, this.player.targetX));
      this.player.targetY = Math.max(this.arena.top + this.verticalStep / 2, Math.min(this.arena.bottom - this.verticalStep / 2, this.player.targetY));
      this.player.hop = 1;
    }

    const ease = Math.min(1, dt * 15);
    this.player.x += (this.player.targetX - this.player.x) * ease;
    this.player.y += (this.player.targetY - this.player.y) * ease;
    this.player.hop = Math.max(0, this.player.hop - dt * 5.5);
    const distanceToTarget = Math.hypot(
      this.player.targetX - this.player.x,
      this.player.targetY - this.player.y
    );
    this.player.animationTime = distanceToTarget > 0.75
      ? this.player.animationTime + dt
      : 0;
    this.player.invulnerable = Math.max(0, this.player.invulnerable - dt);
    for (const point of this.trail) point.alpha = Math.max(0, point.alpha - dt * 0.24);
    this.trail = this.trail.filter((point) => point.alpha > 0);
  }

  shouldStep(action, pressed, dt) {
    const state = this.inputRepeat[action];
    let trigger = false;
    if (pressed && !state.wasPressed) {
      trigger = true;
      state.held = 0;
      state.repeating = false;
    } else if (pressed) {
      state.held += dt;
      const threshold = state.repeating ? 0.18 : 0.5;
      if (state.held >= threshold) {
        trigger = true;
        state.held = 0;
        state.repeating = true;
      }
    } else {
      state.held = 0;
      state.repeating = false;
    }
    state.wasPressed = pressed;
    return trigger;
  }

  spawnDownWave(count) {
    const usedColumns = new Set();
    for (let index = 0; index < count; index++) {
      const column = this.spawnDownBlock(usedColumns);
      usedColumns.add(column);
    }
    this.lastDownWaveSize = usedColumns.size;
  }

  spawnDownBlock(excludedColumns = new Set()) {
    const playerColumn = Math.round((this.player.targetX - this.arena.left) / this.cellWidth - 0.5);
    const candidates = [];
    for (let column = 0; column < this.arena.columns; column++) {
      if (excludedColumns.has(column)) continue;
      if (column === this.lastDownColumn) continue;
      if (this.elapsed < 7 && Math.abs(column - playerColumn) <= 1) continue;
      const crowded = this.hazards.some((hazard) => hazard.type === 'down'
        && hazard.column === column
        && hazard.y < this.arena.top + 180);
      if (!crowded) candidates.push(column);
    }
    const fallback = Array.from({ length: this.arena.columns }, (_, column) => column)
      .filter((column) => !excludedColumns.has(column));
    const pool = candidates.length ? candidates : fallback;
    const column = pool[Math.floor(Math.random() * pool.length)];
    const downSpeed = this.getDownSpeed();
    this.lastDownColumn = column;
    this.hazards.push({
      type: 'down',
      column,
      x: this.arena.left + (column + 0.5) * this.cellWidth,
      y: this.arena.top - 40,
      width: 68,
      height: 68,
      vx: 0,
      vy: downSpeed,
      hit: false,
      color: '#f0b84d'
    });
    return column;
  }

  getDownSpeed() {
    const progress = this.getDifficultyProgress();
    return 138 + progress * 142 + Math.random() * (12 + progress * 28);
  }

  getSideSpeed() {
    const progress = this.getDifficultyProgress();
    return 180 + progress * 170 + Math.random() * (15 + progress * 30);
  }

  pickSpeedBand(bands, offset = 0) {
    const [minSpeed, maxSpeed] = bands[Math.floor(Math.random() * bands.length)];
    return minSpeed + offset + Math.random() * (maxSpeed - minSpeed);
  }

  spawnSideWave(count) {
    const usedRows = new Set();
    for (let index = 0; index < count; index++) {
      const row = this.spawnSideBlock(usedRows);
      usedRows.add(row);
    }
    this.lastSideWaveSize = usedRows.size;
  }

  spawnSideBlock(excludedRows = new Set()) {
    const playerRow = Math.round((this.player.targetY - this.arena.top - this.verticalStep / 2) / this.verticalStep);
    const rowOptions = this.level <= 2 ? [-1, 0, 1] : [-2, -1, 0, 1, 2];
    const nearbyRows = [...new Set(rowOptions.map((offset) => Math.max(0, Math.min(this.arena.rows - 1, playerRow + offset))))]
      .filter((row) => !excludedRows.has(row));
    const fallbackRows = Array.from({ length: this.arena.rows }, (_, row) => row)
      .filter((row) => !excludedRows.has(row));
    const pool = nearbyRows.length ? nearbyRows : fallbackRows;
    const row = pool[Math.floor(Math.random() * pool.length)];
    const direction = this.nextSideDirection;
    const sideSpeed = this.getSideSpeed();
    this.nextSideDirection *= -1;
    this.hazards.push({
      type: 'side',
      row,
      x: direction < 0 ? this.arena.right + 75 : this.arena.left - 75,
      y: this.arena.top + row * this.verticalStep + this.verticalStep / 2,
      width: 68,
      height: 68,
      vx: direction * sideSpeed,
      vy: 0,
      hit: false,
      color: direction < 0 ? '#9dd7f5' : '#f5a9c1'
    });
    return row;
  }

  spawnCollectible() {
    let x = this.arena.left + 70 + Math.random() * (this.arena.right - this.arena.left - 140);
    let y = this.arena.top + 70 + Math.random() * (this.arena.bottom - this.arena.top - 140);
    for (let attempt = 0; attempt < 10 && Math.hypot(x - this.player.x, y - this.player.y) < 180; attempt++) {
      x = this.arena.left + 70 + Math.random() * (this.arena.right - this.arena.left - 140);
      y = this.arena.top + 70 + Math.random() * (this.arena.bottom - this.arena.top - 140);
    }
    const speed = this.pickStarSpeed();
    const angle = Math.random() * Math.PI * 2;
    this.collectibles.push({
      x,
      y,
      radius: 23,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: 0,
      age: 0,
      life: 12 + Math.random() * 5,
      turnTimer: 0.35 + Math.random() * 0.75,
      wobblePhase: Math.random() * Math.PI * 2
    });
  }

  pickStarSpeed() {
    return this.pickSpeedBand([
      [65, 90],
      [115, 155],
      [180, 230],
      [250, 315]
    ]);
  }

  redirectStar(star, angleOffset = 0) {
    const currentAngle = Math.atan2(star.vy, star.vx);
    const nextAngle = currentAngle + angleOffset + (Math.random() - 0.5) * Math.PI * 0.95;
    const speed = this.pickStarSpeed();
    star.vx = Math.cos(nextAngle) * speed;
    star.vy = Math.sin(nextAngle) * speed;
    star.turnTimer = 0.35 + Math.random() * 0.75;
  }

  scheduleHeartDrop() {
    if (this.lives !== 1 || this.heartOpportunityUsed) return;
    this.heartOpportunityUsed = true;
    this.heartSpawnTimer = 2 + Math.random();
  }

  spawnHeart() {
    let x = this.arena.left + 80 + Math.random() * (this.arena.right - this.arena.left - 160);
    let y = this.arena.top + 80 + Math.random() * (this.arena.bottom - this.arena.top - 160);
    for (let attempt = 0; attempt < 12 && Math.hypot(x - this.player.x, y - this.player.y) < 260; attempt++) {
      x = this.arena.left + 80 + Math.random() * (this.arena.right - this.arena.left - 160);
      y = this.arena.top + 80 + Math.random() * (this.arena.bottom - this.arena.top - 160);
    }
    const speed = this.pickHeartSpeed();
    const angle = Math.random() * Math.PI * 2;
    this.heart = {
      x,
      y,
      radius: 17,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: 0,
      age: 0,
      life: 9 + Math.random() * 3,
      turnTimer: 0.2 + Math.random() * 0.35,
      wobblePhase: Math.random() * Math.PI * 2
    };
  }

  pickHeartSpeed() {
    return this.pickSpeedBand([
      [240, 285],
      [305, 355],
      [380, 430]
    ]);
  }

  redirectHeart(heart, angleOffset = 0) {
    const currentAngle = Math.atan2(heart.vy, heart.vx);
    const nextAngle = currentAngle + angleOffset + (Math.random() - 0.5) * Math.PI * 1.25;
    const speed = this.pickHeartSpeed();
    heart.vx = Math.cos(nextAngle) * speed;
    heart.vy = Math.sin(nextAngle) * speed;
    heart.turnTimer = 0.2 + Math.random() * 0.35;
  }

  spawnLaser() {
    const orientation = this.nextLaserOrientation;
    this.nextLaserOrientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
    const laneCount = orientation === 'horizontal' ? this.arena.rows : this.arena.columns;
    const occupiedLanes = new Set(this.lasers
      .filter((laser) => laser.orientation === orientation)
      .map((laser) => laser.lane));
    const available = Array.from({ length: laneCount }, (_, lane) => lane)
      .filter((lane) => !occupiedLanes.has(lane));
    const lane = available[Math.floor(Math.random() * available.length)] ?? 0;
    const progress = this.getDifficultyProgress();
    const warningDuration = 1.35 - progress * 0.45;
    this.lasers.push({
      orientation,
      lane,
      phase: 'warning',
      timer: warningDuration,
      warningDuration,
      activeDuration: 0.72 + progress * 0.12,
      thickness: 22,
      hit: false
    });
  }

  spawnLaserWave(count) {
    for (let index = 0; index < count; index++) this.spawnLaser();
    this.lastLaserWaveSize = count;
  }

  updateHazards(dt) {
    for (let index = this.hazards.length - 1; index >= 0; index--) {
      const hazard = this.hazards[index];
      hazard.x += hazard.vx * dt;
      hazard.y += hazard.vy * dt;
      if (!hazard.hit && this.player.invulnerable <= 0 && this.hazardCollidesWithPlayer(hazard)) {
        hazard.hit = true;
        this.handleCollision();
      }

      const outside = hazard.y - hazard.height / 2 > this.arena.bottom + 80
        || hazard.x + hazard.width / 2 < this.arena.left - 100
        || hazard.x - hazard.width / 2 > this.arena.right + 100;
      if (outside) {
        if (!hazard.hit) this.dodged++;
        this.hazards.splice(index, 1);
      }
    }
  }

  updateLasers(dt) {
    for (let index = this.lasers.length - 1; index >= 0; index--) {
      const laser = this.lasers[index];
      laser.timer -= dt;
      if (laser.phase === 'warning' && laser.timer <= 0) {
        laser.phase = 'active';
        laser.timer = laser.activeDuration;
        this.soundEngine.playLaser?.();
      }
      if (laser.phase === 'active') {
        if (!laser.hit && this.player.invulnerable <= 0 && this.laserCollidesWithPlayer(laser)) {
          laser.hit = true;
          this.handleCollision();
        }
        if (laser.timer <= 0) this.lasers.splice(index, 1);
      }
    }
  }

  laserCollidesWithPlayer(laser) {
    if (laser.orientation === 'horizontal') {
      const y = this.arena.top + laser.lane * this.verticalStep + this.verticalStep / 2;
      return Math.abs(this.player.y - y) <= this.player.radius + laser.thickness / 2;
    }
    const x = this.arena.left + (laser.lane + 0.5) * this.cellWidth;
    return Math.abs(this.player.x - x) <= this.player.radius + laser.thickness / 2;
  }

  updateCollectibles(dt) {
    for (let index = this.collectibles.length - 1; index >= 0; index--) {
      const star = this.collectibles[index];
      this.advanceMovingPickup(star, dt, this.redirectStar, 0.85);

      const dx = this.player.x - star.x;
      const dy = this.player.y - star.y;
      if (dx * dx + dy * dy <= (this.player.radius + star.radius) ** 2) {
        this.collectibles.splice(index, 1);
        this.bonusScore += 10;
        this.soundEngine.playSuccess();
        this.showToast('★ 별 획득 +10');
        continue;
      }
      if (star.life <= 0) this.collectibles.splice(index, 1);
    }
  }

  updateHeart(dt) {
    if (this.lives <= 0) return;
    if (Number.isFinite(this.heartSpawnTimer)) {
      this.heartSpawnTimer -= dt;
      if (this.heartSpawnTimer <= 0) {
        this.heartSpawnTimer = Infinity;
        if (this.lives === 1 && !this.heart) this.spawnHeart();
      }
    }
    if (!this.heart) return;

    const heart = this.heart;
    this.advanceMovingPickup(heart, dt, this.redirectHeart, 1.2);
    const dx = this.player.x - heart.x;
    const dy = this.player.y - heart.y;
    if (dx * dx + dy * dy <= (this.player.radius + heart.radius) ** 2) {
      this.heart = null;
      this.lives = Math.min(3, this.lives + 1);
      this.soundEngine.playSuccess();
      this.showToast('♥ 생명 +1');
      this.updateHUD();
    } else if (heart.life <= 0) {
      this.heart = null;
    }
  }

  advanceMovingPickup(pickup, dt, redirect, curveStrength) {
    pickup.age += dt;
    pickup.life -= dt;
    pickup.turnTimer -= dt;
    if (pickup.turnTimer <= 0) redirect.call(this, pickup);

    const curve = Math.sin(pickup.age * 5.2 + pickup.wobblePhase) * curveStrength * dt;
    const cos = Math.cos(curve);
    const sin = Math.sin(curve);
    const curvedVx = pickup.vx * cos - pickup.vy * sin;
    pickup.vy = pickup.vx * sin + pickup.vy * cos;
    pickup.vx = curvedVx;
    pickup.x += pickup.vx * dt;
    pickup.y += pickup.vy * dt;
    pickup.rotation += dt * (2.4 + Math.hypot(pickup.vx, pickup.vy) / 70);

    let bounced = false;
    if (pickup.x - pickup.radius < this.arena.left) {
      pickup.x = this.arena.left + pickup.radius;
      pickup.vx = Math.abs(pickup.vx);
      bounced = true;
    } else if (pickup.x + pickup.radius > this.arena.right) {
      pickup.x = this.arena.right - pickup.radius;
      pickup.vx = -Math.abs(pickup.vx);
      bounced = true;
    }
    if (pickup.y - pickup.radius < this.arena.top) {
      pickup.y = this.arena.top + pickup.radius;
      pickup.vy = Math.abs(pickup.vy);
      bounced = true;
    } else if (pickup.y + pickup.radius > this.arena.bottom) {
      pickup.y = this.arena.bottom - pickup.radius;
      pickup.vy = -Math.abs(pickup.vy);
      bounced = true;
    }
    if (bounced) redirect.call(this, pickup);
  }

  hazardCollidesWithPlayer(hazard) {
    const left = hazard.x - hazard.width / 2;
    const top = hazard.y - hazard.height / 2;
    const closestX = Math.max(left, Math.min(this.player.x, left + hazard.width));
    const closestY = Math.max(top, Math.min(this.player.y, top + hazard.height));
    const dx = this.player.x - closestX;
    const dy = this.player.y - closestY;
    return dx * dx + dy * dy <= this.player.radius * this.player.radius;
  }

  handleCollision() {
    this.lives--;
    this.player.invulnerable = 1.4;
    if (this.lives === 1) this.scheduleHeartDrop();
    this.soundEngine.playCrash();
    this.showToast(this.lives > 0 ? `충돌! 남은 목숨 ${this.lives}` : '게임 종료');
    this.updateHUD();
    if (this.lives <= 0) this.endGame();
  }

  endGame() {
    this.state = 'GAMEOVER';
    this.inputManager.resetAll();
    const resultMessage = this.score >= this.doubleWaveScore
      ? '좋은 무빙이에요!'
      : '괜찮은 움직임!';
    document.getElementById('traffic-gameover-message').textContent = resultMessage;
    document.getElementById('traffic-final-score').textContent = this.score;
    document.getElementById('traffic-gameover-modal').classList.remove('hidden');
  }

  showToast(message) {
    const toast = document.getElementById('traffic-toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.add('hidden'), 1100);
  }

  updateHUD() {
    document.getElementById('traffic-score').textContent = this.score;
    const hearts = '♥'.repeat(this.lives) + '♡'.repeat(Math.max(0, 3 - this.lives));
    const lives = document.getElementById('traffic-lives');
    lives.textContent = hearts;
    lives.setAttribute('aria-label', `남은 목숨 ${this.lives}개`);
  }

  drawArena() {
    const ctx = this.ctx;
    ctx.fillStyle = '#132b32';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (let row = 0; row < this.arena.rows; row++) {
      for (let column = 0; column < this.arena.columns; column++) {
        ctx.fillStyle = (row + column) % 2 === 0 ? '#315a4b' : '#2b5145';
        ctx.fillRect(this.arena.left + column * this.cellWidth, this.arena.top + row * this.verticalStep, this.cellWidth, this.verticalStep);
      }
    }
    ctx.strokeStyle = 'rgba(235,255,241,.12)';
    ctx.lineWidth = 2;
    for (let column = 0; column <= this.arena.columns; column++) {
      const x = this.arena.left + column * this.cellWidth;
      ctx.beginPath(); ctx.moveTo(x, this.arena.top); ctx.lineTo(x, this.arena.bottom); ctx.stroke();
    }
    for (let y = this.arena.top; y <= this.arena.bottom; y += this.verticalStep) {
      ctx.beginPath(); ctx.moveTo(this.arena.left, y); ctx.lineTo(this.arena.right, y); ctx.stroke();
    }
    ctx.strokeStyle = '#9dd7f5';
    ctx.lineWidth = 5;
    ctx.strokeRect(this.arena.left, this.arena.top, this.arena.right - this.arena.left, this.arena.bottom - this.arena.top);
  }

  drawHazards() {
    for (const hazard of this.hazards) {
      this.drawCubeBlock(hazard);
    }
  }

  drawLasers() {
    const ctx = this.ctx;
    for (const laser of this.lasers) {
      const horizontal = laser.orientation === 'horizontal';
      const center = horizontal
        ? this.arena.top + laser.lane * this.verticalStep + this.verticalStep / 2
        : this.arena.left + (laser.lane + 0.5) * this.cellWidth;
      const length = horizontal
        ? this.arena.right - this.arena.left
        : this.arena.bottom - this.arena.top;
      ctx.save();
      ctx.beginPath();
      ctx.rect(this.arena.left, this.arena.top, this.arena.right - this.arena.left, this.arena.bottom - this.arena.top);
      ctx.clip();

      if (laser.phase === 'warning') {
        const warningDuration = laser.warningDuration || 1.35;
        const charge = Math.max(0, Math.min(1, 1 - laser.timer / warningDuration));
        const pulse = 0.18 + (0.18 + charge * 0.28)
          * Math.abs(Math.sin(this.elapsed * (9 + charge * 20)));
        const warningGlow = horizontal
          ? ctx.createLinearGradient(0, center - 30, 0, center + 30)
          : ctx.createLinearGradient(center - 30, 0, center + 30, 0);
        warningGlow.addColorStop(0, 'rgba(255,34,20,0)');
        warningGlow.addColorStop(0.5, `rgba(255,55,28,${pulse.toFixed(3)})`);
        warningGlow.addColorStop(1, 'rgba(255,34,20,0)');
        ctx.fillStyle = warningGlow;
        if (horizontal) ctx.fillRect(this.arena.left, center - 30, length, 60);
        else ctx.fillRect(center - 30, this.arena.top, 60, length);

        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,224,105,${0.55 + charge * 0.4})`;
        ctx.shadowColor = '#ff3b20';
        ctx.shadowBlur = 8 + charge * 12;
        ctx.lineWidth = 2 + charge * 2;
        ctx.setLineDash([13, 11]);
        ctx.lineDashOffset = -this.elapsed * (70 + charge * 100);
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(this.arena.left, center);
          ctx.lineTo(this.arena.right, center);
        } else {
          ctx.moveTo(center, this.arena.top);
          ctx.lineTo(center, this.arena.bottom);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalCompositeOperation = 'source-over';
        this.drawLaserEmitter(
          horizontal ? this.arena.left + 6 : center,
          horizontal ? center : this.arena.top + 6,
          horizontal ? 0 : Math.PI / 2,
          charge,
          false
        );
        this.drawLaserEmitter(
          horizontal ? this.arena.right - 6 : center,
          horizontal ? center : this.arena.bottom - 6,
          horizontal ? Math.PI : -Math.PI / 2,
          charge,
          false
        );

        ctx.fillStyle = '#ffdd57';
        ctx.strokeStyle = '#28231f';
        ctx.lineWidth = 3;
        if (horizontal) {
          this.drawWarningMarker(this.arena.left + 58, center, 0);
          this.drawWarningMarker(this.arena.right - 58, center, Math.PI);
        } else {
          this.drawWarningMarker(center, this.arena.top + 58, Math.PI / 2);
          this.drawWarningMarker(center, this.arena.bottom - 58, -Math.PI / 2);
        }
      } else {
        const age = laser.activeDuration - laser.timer;
        const envelope = Math.min(1, age * 12) * Math.min(1, laser.timer * 9);
        const flicker = (0.94 + Math.sin(this.elapsed * 57 + laser.lane * 1.7) * 0.06) * envelope;
        const outerGlow = horizontal
          ? ctx.createLinearGradient(0, center - 48, 0, center + 48)
          : ctx.createLinearGradient(center - 48, 0, center + 48, 0);
        outerGlow.addColorStop(0, 'rgba(255,0,0,0)');
        outerGlow.addColorStop(0.32, `rgba(255,20,0,${(0.12 * flicker).toFixed(3)})`);
        outerGlow.addColorStop(0.5, `rgba(255,58,8,${(0.5 * flicker).toFixed(3)})`);
        outerGlow.addColorStop(0.68, `rgba(255,20,0,${(0.12 * flicker).toFixed(3)})`);
        outerGlow.addColorStop(1, 'rgba(255,0,0,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = outerGlow;
        if (horizontal) ctx.fillRect(this.arena.left, center - 48, length, 96);
        else ctx.fillRect(center - 48, this.arena.top, 96, length);

        const plasma = horizontal
          ? ctx.createLinearGradient(0, center - laser.thickness / 2, 0, center + laser.thickness / 2)
          : ctx.createLinearGradient(center - laser.thickness / 2, 0, center + laser.thickness / 2, 0);
        plasma.addColorStop(0, 'rgba(255,35,5,0.25)');
        plasma.addColorStop(0.18, '#ff3b0a');
        plasma.addColorStop(0.38, '#ffb21c');
        plasma.addColorStop(0.5, '#fffbe8');
        plasma.addColorStop(0.62, '#ffcf3b');
        plasma.addColorStop(0.82, '#ff3b0a');
        plasma.addColorStop(1, 'rgba(255,35,5,0.25)');
        ctx.globalAlpha = flicker;
        ctx.shadowColor = '#ff2a00';
        ctx.shadowBlur = 28;
        ctx.fillStyle = plasma;
        if (horizontal) ctx.fillRect(this.arena.left, center - laser.thickness / 2, length, laser.thickness);
        else ctx.fillRect(center - laser.thickness / 2, this.arena.top, laser.thickness, length);

        ctx.shadowColor = '#fff2b0';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = 'rgba(255,255,245,.95)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(this.arena.left, center);
          ctx.lineTo(this.arena.right, center);
        } else {
          ctx.moveTo(center, this.arena.top);
          ctx.lineTo(center, this.arena.bottom);
        }
        ctx.stroke();

        // Fast moving hot spots make the beam feel unstable instead of painted on.
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 12;
        for (let index = 0; index < 7; index++) {
          const travel = (this.elapsed * (520 + index * 37) + index * length / 7) % length;
          const radius = 2.2 + (index % 3) * 0.8;
          ctx.beginPath();
          ctx.arc(
            horizontal ? this.arena.left + travel : center,
            horizontal ? center : this.arena.top + travel,
            radius,
            0,
            Math.PI * 2
          );
          ctx.fillStyle = 'rgba(255,255,235,.9)';
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        this.drawLaserEmitter(
          horizontal ? this.arena.left + 6 : center,
          horizontal ? center : this.arena.top + 6,
          horizontal ? 0 : Math.PI / 2,
          1,
          true
        );
        this.drawLaserEmitter(
          horizontal ? this.arena.right - 6 : center,
          horizontal ? center : this.arena.bottom - 6,
          horizontal ? Math.PI : -Math.PI / 2,
          1,
          true
        );
      }
      ctx.restore();
    }
  }

  drawLaserEmitter(x, y, rotation, charge, active) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.shadowBlur = active ? 18 : 8;
    ctx.shadowColor = active ? '#ff3b0a' : 'rgba(255,80,20,.7)';
    ctx.fillStyle = '#172229';
    ctx.strokeStyle = '#8da4aa';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, -23);
    ctx.lineTo(18, -18);
    ctx.lineTo(25, -10);
    ctx.lineTo(25, 10);
    ctx.lineTo(18, 18);
    ctx.lineTo(-10, 23);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = active ? 14 : 5;
    ctx.fillStyle = active ? '#fff7cc' : `rgba(255,91,35,${0.3 + charge * 0.7})`;
    ctx.strokeStyle = active ? '#ff4b12' : '#763321';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(22, 0, 8, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(220,239,241,.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, -15);
    ctx.lineTo(12, -12);
    ctx.moveTo(-4, 15);
    ctx.lineTo(12, 12);
    ctx.stroke();
    ctx.restore();
  }

  drawWarningMarker(x, y, rotation) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.moveTo(-18, -18);
    ctx.lineTo(20, 0);
    ctx.lineTo(-18, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawCollectibles() {
    const ctx = this.ctx;
    for (const star of this.collectibles) {
      ctx.save();
      ctx.translate(star.x, star.y);
      ctx.rotate(star.rotation);
      ctx.shadowColor = '#fff2a8';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#fff176';
      ctx.strokeStyle = '#28231f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let point = 0; point < 10; point++) {
        const angle = -Math.PI / 2 + point * Math.PI / 5;
        const radius = point % 2 === 0 ? star.radius : star.radius * 0.45;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (point === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  drawHeart() {
    if (!this.heart) return;
    const heart = this.heart;
    const ctx = this.ctx;
    const pulse = 1 + Math.sin(heart.age * 10) * 0.08;
    ctx.save();
    ctx.translate(heart.x, heart.y);
    ctx.rotate(Math.sin(heart.rotation * 0.18) * 0.18);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = '#ff496c';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ff4f70';
    ctx.strokeStyle = '#28231f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.bezierCurveTo(-27, 1, -22, -19, -8, -19);
    ctx.bezierCurveTo(-2, -19, 0, -14, 0, -10);
    ctx.bezierCurveTo(0, -14, 2, -19, 8, -19);
    ctx.bezierCurveTo(22, -19, 27, 1, 0, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.beginPath();
    ctx.ellipse(-8, -10, 4, 6, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawCubeBlock(hazard) {
    const ctx = this.ctx;
    const scale = Math.min(hazard.width, hazard.height) / 68;
    const topColor = hazard.hit ? '#a33b22' : '#ffe77d';
    const frontColor = hazard.hit ? '#7c2d12' : '#ffd84d';
    const sideColor = hazard.hit ? '#5b1c0d' : '#d9a900';

    ctx.save();
    ctx.translate(hazard.x, hazard.y);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(5, 32, 31, 12, 0, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#28231f';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';

    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.moveTo(-28, -24);
    ctx.lineTo(-18, -34);
    ctx.lineTo(34, -34);
    ctx.lineTo(26, -24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = sideColor;
    ctx.beginPath();
    ctx.moveTo(26, -24);
    ctx.lineTo(34, -34);
    ctx.lineTo(34, 18);
    ctx.lineTo(26, 28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = frontColor;
    ctx.fillRect(-28, -24, 54, 52);
    ctx.strokeRect(-28, -24, 54, 52);

    ctx.fillStyle = '#28231f';
    ctx.fillRect(-15, -10, 7, 8);
    ctx.fillRect(8, -10, 7, 8);
    ctx.fillStyle = hazard.hit ? '#f5a9c1' : '#ff6b35';
    ctx.fillRect(-8, 2, 16, 9);
    ctx.strokeStyle = '#28231f';
    ctx.lineWidth = 3;
    ctx.strokeRect(-8, 2, 16, 9);
    ctx.restore();
  }

  drawTrail() {
    const ctx = this.ctx;
    ctx.save();
    for (const point of this.trail) {
      ctx.globalAlpha = point.alpha;
      ctx.fillStyle = '#ffd84d';
      ctx.fillRect(point.x - 10, point.y - 10, 20, 20);
    }
    ctx.restore();
  }

  drawPlayer() {
    const ctx = this.ctx;
    const hopLift = Math.sin((1 - this.player.hop) * Math.PI) * 13;
    const distanceToTarget = Math.hypot(
      this.player.targetX - this.player.x,
      this.player.targetY - this.player.y
    );
    let pose = 'stay';
    if (this.player.hop > 0 || distanceToTarget > 0.75) pose = this.player.movePose;
    const sprite = this.playerSprites[pose];
    const walkBob = pose === 'left' || pose === 'right'
      ? Math.sin(this.player.animationTime * 34) * 2
      : 0;

    ctx.save();
    ctx.translate(this.player.x, this.player.y - hopLift + walkBob);
    if (this.player.invulnerable > 0 && Math.floor(this.player.invulnerable * 12) % 2 === 0) ctx.globalAlpha = 0.3;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.ellipse(3, 34 + hopLift - walkBob, 31, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    if (sprite.complete && sprite.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const spriteSize = 84;
      ctx.drawImage(sprite, -spriteSize / 2, -47, spriteSize, spriteSize);
    } else {
      // Keep a friendly non-box fallback visible during the first image download.
      ctx.fillStyle = '#9a542f';
      ctx.strokeStyle = '#4b1f0d';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(0, -14, 33, 38, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-11, -20, 8, 0, Math.PI * 2); ctx.arc(11, -20, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#28231f';
      ctx.beginPath(); ctx.arc(-9, -20, 3, 0, Math.PI * 2); ctx.arc(9, -20, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    this.canvas.dataset.playerPose = pose;
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawArena();
    this.drawTrail();
    this.drawLasers();
    this.drawHazards();
    this.drawCollectibles();
    this.drawHeart();
    this.drawPlayer();
    this.canvas.dataset.gameState = this.state;
    this.canvas.dataset.playerX = this.player.x.toFixed(2);
    this.canvas.dataset.playerY = this.player.y.toFixed(2);
    this.canvas.dataset.lives = String(this.lives);
    this.canvas.dataset.score = String(this.score);
    this.canvas.dataset.elapsed = this.elapsed.toFixed(2);
    this.canvas.dataset.hazards = String(this.hazards.length);
    this.canvas.dataset.downHazards = String(this.hazards.filter((hazard) => hazard.type === 'down').length);
    this.canvas.dataset.sideHazards = String(this.hazards.filter((hazard) => hazard.type === 'side').length);
    this.canvas.dataset.leftMoving = String(this.hazards.filter((hazard) => hazard.type === 'side' && hazard.vx < 0).length);
    this.canvas.dataset.rightMoving = String(this.hazards.filter((hazard) => hazard.type === 'side' && hazard.vx > 0).length);
    this.canvas.dataset.lastDownWave = String(this.lastDownWaveSize);
    this.canvas.dataset.lastSideWave = String(this.lastSideWaveSize);
    const downSpeeds = this.hazards.filter((hazard) => hazard.type === 'down').map((hazard) => hazard.vy);
    const sideSpeeds = this.hazards.filter((hazard) => hazard.type === 'side').map((hazard) => Math.abs(hazard.vx));
    this.canvas.dataset.downMinSpeed = downSpeeds.length ? Math.min(...downSpeeds).toFixed(1) : '0';
    this.canvas.dataset.downMaxSpeed = downSpeeds.length ? Math.max(...downSpeeds).toFixed(1) : '0';
    this.canvas.dataset.sideMinSpeed = sideSpeeds.length ? Math.min(...sideSpeeds).toFixed(1) : '0';
    this.canvas.dataset.sideMaxSpeed = sideSpeeds.length ? Math.max(...sideSpeeds).toFixed(1) : '0';
    this.canvas.dataset.lasers = String(this.lasers.length);
    this.canvas.dataset.laserWarnings = String(this.lasers.filter((laser) => laser.phase === 'warning').length);
    this.canvas.dataset.activeLasers = String(this.lasers.filter((laser) => laser.phase === 'active').length);
    this.canvas.dataset.lastLaserWave = String(this.lastLaserWaveSize);
    this.canvas.dataset.stars = String(this.collectibles.length);
    const trackedStar = this.collectibles[0];
    this.canvas.dataset.starX = trackedStar ? trackedStar.x.toFixed(1) : '0';
    this.canvas.dataset.starY = trackedStar ? trackedStar.y.toFixed(1) : '0';
    this.canvas.dataset.starVx = trackedStar ? trackedStar.vx.toFixed(1) : '0';
    this.canvas.dataset.starVy = trackedStar ? trackedStar.vy.toFixed(1) : '0';
    this.canvas.dataset.starSpeed = trackedStar ? Math.hypot(trackedStar.vx, trackedStar.vy).toFixed(1) : '0';
    this.canvas.dataset.heart = this.heart ? '1' : '0';
    this.canvas.dataset.heartSpawnTimer = Number.isFinite(this.heartSpawnTimer)
      ? Math.max(0, this.heartSpawnTimer).toFixed(2)
      : 'inactive';
    this.canvas.dataset.heartSpeed = this.heart
      ? Math.hypot(this.heart.vx, this.heart.vy).toFixed(1)
      : '0';
    this.canvas.dataset.bonusScore = String(this.bonusScore);
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
  window.trafficGameInstance = new ObstacleDodgeGame();
});
