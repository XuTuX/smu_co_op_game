/**
 * Four-player falling-grid survival mode.
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
      x: 660,
      y: 729,
      targetX: 660,
      targetY: 729,
      radius: 27,
      invulnerable: 0,
      moveCooldown: 0,
      hop: 0
    };
    this.obstacleRows = [];
    this.trail = [];
    this.trailTimer = 0;
    this.safeColumn = 4;
    this.generatedRows = 0;
    this.lastPathShift = 0;
    this.inputRepeat = {
      forward: { wasPressed: false, held: 0, repeating: false },
      backward: { wasPressed: false, held: 0, repeating: false },
      left: { wasPressed: false, held: 0, repeating: false },
      right: { wasPressed: false, held: 0, repeating: false }
    };

    this.state = 'TITLE';
    this.spawnTimer = 0.8;
    this.elapsed = 0;
    this.score = 0;
    this.rowsCleared = 0;
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
    this.player.x = 660;
    this.player.y = 729;
    this.player.targetX = 660;
    this.player.targetY = 729;
    this.player.invulnerable = 0;
    this.player.moveCooldown = 0;
    this.player.hop = 0;
    this.obstacleRows = [];
    this.trail = [];
    this.trailTimer = 0;
    this.safeColumn = 4;
    this.generatedRows = 0;
    this.lastPathShift = 0;
    Object.values(this.inputRepeat).forEach((state) => {
      state.wasPressed = false;
      state.held = 0;
      state.repeating = false;
    });
    this.spawnTimer = 0.8;
    this.elapsed = 0;
    this.score = 0;
    this.rowsCleared = 0;
    this.lives = 3;
    this.level = 1;
    this.inputManager.resetAll();
    this.updateHUD();
  }

  startCountdown() {
    this.soundEngine.init();
    this.resetGame();
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
      if (count > 0) {
        text.textContent = count;
      } else if (count === 0) {
        text.textContent = 'GO!';
      } else {
        window.clearInterval(timer);
        overlay.classList.add('hidden');
        this.state = 'PLAYING';
      }
    }, 650);
  }

  update(dt) {
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
      this.player.targetX = Math.max(
        this.arena.left + this.cellWidth / 2,
        Math.min(this.arena.right - this.cellWidth / 2, this.player.targetX)
      );
      this.player.targetY = Math.max(
        this.arena.top + this.verticalStep / 2,
        Math.min(this.arena.bottom - this.verticalStep / 2, this.player.targetY)
      );
      this.player.hop = 1;
    }

    const moveEase = Math.min(1, dt * 15);
    this.player.x += (this.player.targetX - this.player.x) * moveEase;
    this.player.y += (this.player.targetY - this.player.y) * moveEase;
    this.player.hop = Math.max(0, this.player.hop - dt * 5.5);
    this.player.invulnerable = Math.max(0, this.player.invulnerable - dt);

    for (const point of this.trail) point.alpha = Math.max(0, point.alpha - dt * 0.24);
    this.trail = this.trail.filter((point) => point.alpha > 0);

    this.elapsed += dt;
    const nextLevel = Math.min(5, 1 + Math.floor(this.elapsed / 15));
    if (nextLevel !== this.level) {
      this.level = nextLevel;
      this.showToast(`LEVEL ${this.level} · 더 빨라집니다!`);
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const newestRow = this.obstacleRows[this.obstacleRows.length - 1];
      const minimumSpacing = this.level <= 2 ? 175 : 150;
      if (!newestRow || newestRow.y >= this.arena.top + minimumSpacing) {
        this.spawnObstacleRow();
        this.spawnTimer = Math.max(0.9, 1.82 - (this.level - 1) * 0.17);
      } else {
        this.spawnTimer = 0.12;
      }
    }

    const fallSpeed = 108 + (this.level - 1) * 32;
    for (let rowIndex = this.obstacleRows.length - 1; rowIndex >= 0; rowIndex--) {
      const row = this.obstacleRows[rowIndex];
      row.y += fallSpeed * dt;
      if (!row.hit && this.player.invulnerable <= 0 && this.rowCollidesWithPlayer(row)) {
        row.hit = true;
        this.handleCollision();
      }
      if (row.y > this.arena.bottom + 100) {
        if (!row.hit) this.rowsCleared++;
        this.obstacleRows.splice(rowIndex, 1);
      }
    }

    this.score = Math.floor(this.elapsed * 10) + this.rowsCleared * 35;
    this.updateHUD();
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

  spawnObstacleRow() {
    // The safe route is planned, not independently randomized per row.
    // It begins directly above the player and moves at most one column per row.
    const gapWidth = this.level === 1 ? 4 : (this.level <= 3 ? 3 : 2);
    const maxGapStart = this.arena.columns - gapWidth;
    let shift = 0;

    if (this.generatedRows >= 3) {
      if (this.level === 1 && this.generatedRows % 2 === 0) {
        shift = 0;
      } else {
        const choices = this.lastPathShift === 0
          ? [-1, 0, 1]
          : [this.lastPathShift, 0, this.lastPathShift];
        shift = choices[Math.floor(Math.random() * choices.length)];
      }
    }

    const minSafeColumn = 0;
    const maxSafeColumn = this.arena.columns - 1;
    this.safeColumn = Math.max(minSafeColumn, Math.min(maxSafeColumn, this.safeColumn + shift));
    if (this.safeColumn === minSafeColumn && shift < 0) shift = 1;
    if (this.safeColumn === maxSafeColumn && shift > 0) shift = -1;
    this.lastPathShift = shift;

    const gapStart = Math.max(0, Math.min(maxGapStart, this.safeColumn - Math.floor(gapWidth / 2)));
    this.safeColumn = Math.max(gapStart, Math.min(gapStart + gapWidth - 1, this.safeColumn));

    const blockedColumns = [];
    for (let column = 0; column < this.arena.columns; column++) {
      if (column < gapStart || column >= gapStart + gapWidth) blockedColumns.push(column);
    }

    this.obstacleRows.push({
      y: this.arena.top - 95,
      height: this.level >= 4 ? 82 : 70,
      gapStart,
      gapWidth,
      safeColumn: this.safeColumn,
      blockedColumns,
      hit: false,
      hue: (this.level * 34 + Math.floor(Math.random() * 20)) % 360
    });
    this.generatedRows++;
  }

  rowCollidesWithPlayer(row) {
    const blockPadding = 7;
    for (const column of row.blockedColumns) {
      const x = this.arena.left + column * this.cellWidth + blockPadding;
      const y = row.y;
      const width = this.cellWidth - blockPadding * 2;
      const height = row.height;
      const closestX = Math.max(x, Math.min(this.player.x, x + width));
      const closestY = Math.max(y, Math.min(this.player.y, y + height));
      const dx = this.player.x - closestX;
      const dy = this.player.y - closestY;
      if (dx * dx + dy * dy <= this.player.radius * this.player.radius) return true;
    }
    return false;
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
    const blockCount = this.obstacleRows.reduce((sum, row) => sum + row.blockedColumns.length, 0);
    document.getElementById('traffic-speed').textContent = `OBSTACLES ${blockCount}`;
    const labels = ['연습', '주의', '빠름', '위험', '극한'];
    document.getElementById('traffic-level').textContent = `${this.level} · ${labels[this.level - 1]}`;
  }

  drawArena() {
    const ctx = this.ctx;
    const width = this.arena.right - this.arena.left;
    const height = this.arena.bottom - this.arena.top;
    ctx.fillStyle = '#132b32';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const rows = Math.ceil(height / this.verticalStep);
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < this.arena.columns; column++) {
        ctx.fillStyle = (row + column) % 2 === 0 ? '#315a4b' : '#2b5145';
        ctx.fillRect(
          this.arena.left + column * this.cellWidth,
          this.arena.top + row * this.verticalStep,
          this.cellWidth,
          this.verticalStep
        );
      }
    }

    ctx.strokeStyle = 'rgba(235,255,241,.12)';
    ctx.lineWidth = 2;
    for (let column = 0; column <= this.arena.columns; column++) {
      const x = this.arena.left + column * this.cellWidth;
      ctx.beginPath();
      ctx.moveTo(x, this.arena.top);
      ctx.lineTo(x, this.arena.bottom);
      ctx.stroke();
    }
    for (let y = this.arena.top; y <= this.arena.bottom; y += this.verticalStep) {
      ctx.beginPath();
      ctx.moveTo(this.arena.left, y);
      ctx.lineTo(this.arena.right, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#9dd7f5';
    ctx.lineWidth = 5;
    ctx.strokeRect(this.arena.left, this.arena.top, width, height);
  }

  drawObstacleRows() {
    const ctx = this.ctx;
    for (const row of this.obstacleRows) {
      const gapX = this.arena.left + row.gapStart * this.cellWidth + 5;
      const gapWidthPx = row.gapWidth * this.cellWidth - 10;
      ctx.fillStyle = 'rgba(137, 215, 154, .2)';
      ctx.strokeStyle = 'rgba(196, 255, 207, .72)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(gapX, row.y, gapWidthPx, row.height, 12);
      ctx.fill();
      ctx.stroke();

      const guideX = this.arena.left + (row.safeColumn + 0.5) * this.cellWidth;
      ctx.fillStyle = 'rgba(215, 255, 223, .88)';
      ctx.beginPath();
      ctx.moveTo(guideX, row.y + row.height - 14);
      ctx.lineTo(guideX - 10, row.y + row.height - 28);
      ctx.lineTo(guideX + 10, row.y + row.height - 28);
      ctx.closePath();
      ctx.fill();

      for (const column of row.blockedColumns) {
        const padding = 7;
        const x = this.arena.left + column * this.cellWidth + padding;
        const width = this.cellWidth - padding * 2;
        const frontColor = row.hit ? '#7c2d12' : `hsl(${row.hue} 72% 55%)`;
        const topColor = row.hit ? '#a34120' : `hsl(${row.hue} 78% 68%)`;
        const sideColor = row.hit ? '#5a1f0d' : `hsl(${row.hue} 68% 39%)`;

        // Chunky top and side faces give each falling obstacle a voxel look.
        ctx.fillStyle = topColor;
        ctx.strokeStyle = '#28231f';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, row.y);
        ctx.lineTo(x + 10, row.y - 10);
        ctx.lineTo(x + width + 10, row.y - 10);
        ctx.lineTo(x + width, row.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = sideColor;
        ctx.beginPath();
        ctx.moveTo(x + width, row.y);
        ctx.lineTo(x + width + 10, row.y - 10);
        ctx.lineTo(x + width + 10, row.y + row.height - 10);
        ctx.lineTo(x + width, row.y + row.height);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = frontColor;
        ctx.strokeStyle = '#28231f';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(x, row.y, width, row.height, 13);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(40,35,31,.68)';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + width * 0.35, row.y + row.height * 0.3);
        ctx.lineTo(x + width * 0.65, row.y + row.height * 0.7);
        ctx.moveTo(x + width * 0.65, row.y + row.height * 0.3);
        ctx.lineTo(x + width * 0.35, row.y + row.height * 0.7);
        ctx.stroke();
      }
    }
  }

  drawTrail() {
    if (this.trail.length === 0) return;
    const ctx = this.ctx;
    ctx.save();
    this.trail.forEach((point) => {
      ctx.globalAlpha = point.alpha;
      ctx.fillStyle = '#ffd84d';
      ctx.fillRect(point.x - 10, point.y - 10, 20, 20);
    });
    ctx.restore();
  }

  drawPlayer() {
    const ctx = this.ctx;
    ctx.save();
    const hopLift = Math.sin((1 - this.player.hop) * Math.PI) * 13;
    ctx.translate(this.player.x, this.player.y - hopLift);
    if (this.player.invulnerable > 0 && Math.floor(this.player.invulnerable * 12) % 2 === 0) ctx.globalAlpha = 0.3;

    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.ellipse(5, 31 + hopLift, 31, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // Blocky mascot body with a top and side face.
    ctx.fillStyle = '#ffe77d';
    ctx.strokeStyle = '#28231f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-28, -24);
    ctx.lineTo(-18, -34);
    ctx.lineTo(34, -34);
    ctx.lineTo(26, -24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#d9a900';
    ctx.beginPath();
    ctx.moveTo(26, -24);
    ctx.lineTo(34, -34);
    ctx.lineTo(34, 18);
    ctx.lineTo(26, 28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffd84d';
    ctx.fillRect(-28, -24, 54, 52);
    ctx.strokeRect(-28, -24, 54, 52);

    ctx.fillStyle = '#28231f';
    ctx.fillRect(-15, -10, 7, 8);
    ctx.fillRect(8, -10, 7, 8);

    ctx.fillStyle = '#ff6b35';
    ctx.fillRect(-8, 2, 16, 9);
    ctx.strokeStyle = '#28231f';
    ctx.lineWidth = 3;
    ctx.strokeRect(-8, 2, 16, 9);
    ctx.restore();
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawArena();
    this.drawTrail();
    this.drawObstacleRows();
    this.drawPlayer();

    this.canvas.dataset.gameState = this.state;
    this.canvas.dataset.playerX = this.player.x.toFixed(2);
    this.canvas.dataset.playerY = this.player.y.toFixed(2);
    this.canvas.dataset.lives = String(this.lives);
    this.canvas.dataset.score = String(this.score);
    this.canvas.dataset.obstacleRows = String(this.obstacleRows.length);
    this.canvas.dataset.level = String(this.level);
    const approachingRows = this.obstacleRows.filter((row) => row.y < this.player.y + this.player.radius);
    const nextRow = approachingRows.length ? approachingRows[0] : null;
    this.canvas.dataset.safeColumn = nextRow ? String(nextRow.safeColumn) : String(this.safeColumn);
    this.canvas.dataset.playerColumn = String(Math.round((this.player.targetX - this.arena.left) / this.cellWidth - 0.5));
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
