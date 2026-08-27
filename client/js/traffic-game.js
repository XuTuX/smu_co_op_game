/**
 * Four-player block dodge mode.
 * P1 moves up, P2 down, P3 left, and P4 right.
 */
class ObstacleDodgeGame {
  constructor() {
    this.canvas = document.getElementById('trafficCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = 1200;
    this.canvas.height = 800;

    this.inputManager = new InputManager();
    this.soundEngine = new SoundEngine();
    this.network = new NetworkClient(this.inputManager, (connected) => this.updateHardwareStatus(connected));

    this.arena = { left: 120, right: 1080, top: 24, bottom: 776, columns: 8 };
    this.cellWidth = (this.arena.right - this.arena.left) / this.arena.columns;
    this.verticalStep = 94;
    this.player = {
      x: 660, y: 541, targetX: 660, targetY: 541,
      radius: 27, invulnerable: 0, hop: 0
    };
    this.inputRepeat = this.createInputRepeatState();
    this.hazards = [];
    this.collectibles = [];
    this.trail = [];

    this.state = 'TITLE';
    this.downSpawnTimer = 0.9;
    this.sideSpawnTimer = 3.8;
    this.collectibleTimer = 3.2;
    this.nextSideDirection = -1;
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
      x: 660, y: 541, targetX: 660, targetY: 541,
      invulnerable: 0, hop: 0
    });
    this.inputRepeat = this.createInputRepeatState();
    this.hazards = [];
    this.collectibles = [];
    this.trail = [];
    this.downSpawnTimer = 0.9;
    this.sideSpawnTimer = 3.8;
    this.collectibleTimer = 3.2;
    this.nextSideDirection = -1;
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

    const nextLevel = Math.min(5, 1 + Math.floor(this.elapsed / 15));
    if (nextLevel !== this.level) {
      this.level = nextLevel;
      this.showToast(`LEVEL ${this.level} · 박스 증가!`);
    }

    this.downSpawnTimer -= dt;
    if (this.downSpawnTimer <= 0) {
      this.spawnDownBlock();
      this.downSpawnTimer = Math.max(0.48, 1.28 - (this.level - 1) * 0.17) * (0.88 + Math.random() * 0.28);
    }

    this.sideSpawnTimer -= dt;
    if (this.sideSpawnTimer <= 0) {
      this.spawnSideBlock();
      this.sideSpawnTimer = Math.max(1.5, 3.9 - (this.level - 1) * 0.45) * (0.9 + Math.random() * 0.22);
    }

    this.collectibleTimer -= dt;
    if (this.collectibleTimer <= 0 && this.collectibles.length === 0) {
      this.spawnCollectible();
      this.collectibleTimer = 4.2 + Math.random() * 1.8;
    }

    this.updateHazards(dt);
    this.updateCollectibles(dt);
    this.score = Math.floor(this.elapsed) * 10 + this.bonusScore;
    this.updateHUD();
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

  spawnDownBlock() {
    const playerColumn = Math.round((this.player.targetX - this.arena.left) / this.cellWidth - 0.5);
    const candidates = [];
    for (let column = 0; column < this.arena.columns; column++) {
      if (column === this.lastDownColumn) continue;
      if (this.elapsed < 7 && Math.abs(column - playerColumn) <= 1) continue;
      const crowded = this.hazards.some((hazard) => hazard.type === 'down' && hazard.column === column && hazard.y < 180);
      if (!crowded) candidates.push(column);
    }
    const pool = candidates.length ? candidates : [0, 1, 2, 3, 4, 5, 6, 7];
    const column = pool[Math.floor(Math.random() * pool.length)];
    this.lastDownColumn = column;
    this.hazards.push({
      type: 'down',
      column,
      x: this.arena.left + (column + 0.5) * this.cellWidth,
      y: this.arena.top - 65,
      width: 78,
      height: 70,
      vx: 0,
      vy: 125 + (this.level - 1) * 35 + Math.random() * 22,
      hit: false,
      color: '#f0b84d'
    });
  }

  spawnSideBlock() {
    const playerRow = Math.round((this.player.targetY - this.arena.top - this.verticalStep / 2) / this.verticalStep);
    const rowOptions = this.level <= 2 ? [-1, 0, 1] : [-2, -1, 0, 1, 2];
    const row = Math.max(0, Math.min(7, playerRow + rowOptions[Math.floor(Math.random() * rowOptions.length)]));
    const direction = this.nextSideDirection;
    this.nextSideDirection *= -1;
    this.hazards.push({
      type: 'side',
      row,
      x: direction < 0 ? this.arena.right + 75 : this.arena.left - 75,
      y: this.arena.top + row * this.verticalStep + this.verticalStep / 2,
      width: 82,
      height: 68,
      vx: direction * (180 + (this.level - 1) * 38),
      vy: 0,
      hit: false,
      color: direction < 0 ? '#9dd7f5' : '#f5a9c1'
    });
  }

  spawnCollectible() {
    const column = Math.floor(Math.random() * this.arena.columns);
    this.collectibles.push({
      x: this.arena.left + (column + 0.5) * this.cellWidth,
      y: this.arena.top - 36,
      radius: 23,
      vy: 58 + this.level * 6,
      rotation: 0
    });
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

  updateCollectibles(dt) {
    for (let index = this.collectibles.length - 1; index >= 0; index--) {
      const star = this.collectibles[index];
      star.y += star.vy * dt;
      star.rotation += dt * 2.4;
      const dx = this.player.x - star.x;
      const dy = this.player.y - star.y;
      if (dx * dx + dy * dy <= (this.player.radius + star.radius) ** 2) {
        this.collectibles.splice(index, 1);
        this.bonusScore += 10;
        this.soundEngine.playSuccess();
        this.showToast('★ 별 획득 +10');
        continue;
      }
      if (star.y - star.radius > this.arena.bottom + 50) this.collectibles.splice(index, 1);
    }
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
    this.soundEngine.playCrash();
    this.showToast(this.lives > 0 ? `충돌! 남은 목숨 ${this.lives}` : '게임 종료');
    this.updateHUD();
    if (this.lives <= 0) this.endGame();
  }

  endGame() {
    this.state = 'GAMEOVER';
    this.inputManager.resetAll();
    document.getElementById('traffic-final-score').textContent = this.score;
    document.getElementById('traffic-final-distance').textContent = `${Math.floor(this.elapsed)}s`;
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
    document.getElementById('traffic-speed').textContent = `X ${this.hazards.length} · ★ ${this.collectibles.length}`;
    const labels = ['연습', '주의', '빠름', '위험', '극한'];
    document.getElementById('traffic-level').textContent = `${this.level} · ${labels[this.level - 1]}`;
  }

  drawArena() {
    const ctx = this.ctx;
    ctx.fillStyle = '#132b32';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (let row = 0; row < 8; row++) {
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
      this.drawXBlock(hazard);
    }
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

  drawXBlock(hazard) {
    const ctx = this.ctx;
    const x = hazard.x - hazard.width / 2;
    const y = hazard.y - hazard.height / 2;
    const width = hazard.width;
    const height = hazard.height;
    ctx.fillStyle = hazard.hit ? '#7c2d12' : hazard.color;
    ctx.strokeStyle = '#28231f';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(x, y, width, height, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = hazard.hit ? '#a34120' : '#dff3ff';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 9, y - 9); ctx.lineTo(x + width + 9, y - 9); ctx.lineTo(x + width, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,35,31,.72)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + width * .33, y + height * .28); ctx.lineTo(x + width * .67, y + height * .72);
    ctx.moveTo(x + width * .67, y + height * .28); ctx.lineTo(x + width * .33, y + height * .72);
    ctx.stroke();
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
    ctx.save();
    const hopLift = Math.sin((1 - this.player.hop) * Math.PI) * 13;
    ctx.translate(this.player.x, this.player.y - hopLift);
    if (this.player.invulnerable > 0 && Math.floor(this.player.invulnerable * 12) % 2 === 0) ctx.globalAlpha = 0.3;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(5, 31 + hopLift, 31, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe77d'; ctx.strokeStyle = '#28231f'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-28,-24); ctx.lineTo(-18,-34); ctx.lineTo(34,-34); ctx.lineTo(26,-24); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d9a900'; ctx.beginPath(); ctx.moveTo(26,-24); ctx.lineTo(34,-34); ctx.lineTo(34,18); ctx.lineTo(26,28); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd84d'; ctx.fillRect(-28,-24,54,52); ctx.strokeRect(-28,-24,54,52);
    ctx.fillStyle = '#28231f'; ctx.fillRect(-15,-10,7,8); ctx.fillRect(8,-10,7,8);
    ctx.fillStyle = '#ff6b35'; ctx.fillRect(-8,2,16,9); ctx.strokeStyle = '#28231f'; ctx.lineWidth = 3; ctx.strokeRect(-8,2,16,9);
    ctx.restore();
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawArena();
    this.drawTrail();
    this.drawHazards();
    this.drawCollectibles();
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
    this.canvas.dataset.stars = String(this.collectibles.length);
    this.canvas.dataset.bonusScore = String(this.bonusScore);
    this.canvas.dataset.level = String(this.level);
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
