/**
 * Main Game Engine & Loop
 */
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    // Scale canvas resolution to match CONFIG
    this.canvas.width = CONFIG.CANVAS_WIDTH;
    this.canvas.height = CONFIG.CANVAS_HEIGHT;

    // Subsystems
    this.map = new GameMap(CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
    this.bus = new Bus(this.map.spawnPoint.x, this.map.spawnPoint.y, this.map.spawnPoint.angle);
    this.parkingJudge = new ParkingJudge();
    this.inputManager = new InputManager({ latchSteering: true });
    this.soundEngine = new SoundEngine();
    this.ui = new UIController();

    this.network = new NetworkClient(this.inputManager, (isEspConnected) => {
      this.ui.updateEsp32Status(isEspConnected);
    });

    // Game state
    this.state = 'READY'; // 'READY' | 'READY_COMPLETE' | 'COUNTDOWN' | 'PLAYING' | 'TRANSITION' | 'GAMEOVER'
    this.score = 0;
    this.parkCount = 0;
    this.stageParkCount = 0;
    this.stageScore = 0;
    this.level = 1;
    this.timeRemaining = CONFIG.PARKING_STAGE_DURATION;
    this.lastTime = 0;
    this.readyActions = ['forward', 'backward', 'left', 'right'];
    this.readyPlayers = this.createReadyState();
    this.previousReadyInputs = this.createReadyState();
    this.readyStartTimer = null;
    this.restartHoldTimer = null;
    this.restartHoldDuration = 3000;
    this.countdownInterval = null;
    this.countdownHideTimer = null;

    // Screen Shake & VFX
    this.shakeIntensity = 0;
    this.shakeDecay = 0.9;
    this.particles = [];
    this.skidMarks = [];

    this.init();
  }

  init() {
    // Subscribe input changes to update HUD live button indicators
    this.inputManager.onChange((combined) => {
      this.ui.updateButtonIndicators(combined);
      this.handleReadyInput(this.inputManager.getReadyState());
    });

    // Initialize UI callbacks
    this.ui.init(
      null,
      () => this.beginReadyCheck(),
      () => {
        const muted = this.soundEngine.toggleFromButton();
        const icon = document.getElementById('sound-icon');
        if (icon) icon.textContent = muted ? '🔇' : '🔊';
      }
    );

    // Connect WebSocket
    this.network.connect();

    // Setup first parking target
    this.applyDifficulty(1);
    const firstSpot = this.map.getSpotForLevel(1, null, this.bus.x, this.bus.y);
    this.map.setActiveParkingSpot(firstSpot);
    this.parkingJudge.setTargetSpot(firstSpot);

    // Initial UI state
    this.ui.updateScore(this.score);
    this.ui.updateTime(this.timeRemaining);
    this.ui.updateSteering(this.bus.steeringAngle, CONFIG.BUS.MAX_STEER_ANGLE);
    this.beginReadyCheck();

    // Start 60fps loop
    requestAnimationFrame((t) => this.loop(t));
  }

  createReadyState() {
    return { forward: false, backward: false, left: false, right: false };
  }

  beginReadyCheck() {
    this.soundEngine.stopMusic?.();
    window.clearTimeout(this.readyStartTimer);
    window.clearTimeout(this.restartHoldTimer);
    this.restartHoldTimer = null;
    window.clearInterval(this.countdownInterval);
    window.clearTimeout(this.countdownHideTimer);
    this.state = 'RESETTING_READY';
    this.readyPlayers = this.createReadyState();
    this.previousReadyInputs = this.createReadyState();
    document.body.classList.remove('is-playing');
    this.ui.hideCountdown();
    this.ui.hideGameOver();
    this.ui.hideStageTransition();
    this.ui.showStartScreen();
    this.inputManager.resetAll();
    this.state = 'READY';
    this.previousReadyInputs = this.createReadyState();
    this.updateReadyUI();
  }

  handleReadyInput(inputs) {
    const risingActions = this.readyActions.filter((action) => inputs[action] && !this.previousReadyInputs[action]);

    if (this.state === 'GAMEOVER') {
      this.previousReadyInputs = { ...inputs };
      this.handleGameOverRestartHold(inputs, this.readyActions);
      return;
    }
    if (this.state !== 'READY' && this.state !== 'READY_COMPLETE') {
      this.previousReadyInputs = { ...inputs };
      return;
    }

    for (const action of risingActions) this.readyPlayers[action] = !this.readyPlayers[action];
    this.previousReadyInputs = { ...inputs };
    if (!risingActions.length) return;

    const allReady = this.readyActions.every((action) => this.readyPlayers[action]);
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

  handleGameOverRestartHold(inputs, actions) {
    const heldCount = actions.filter((action) => inputs[action]).length;
    if (heldCount < 2) {
      window.clearTimeout(this.restartHoldTimer);
      this.restartHoldTimer = null;
      return;
    }
    if (this.restartHoldTimer !== null) return;
    let timerId = null;
    timerId = window.setTimeout(() => {
      if (this.state !== 'GAMEOVER' || this.restartHoldTimer !== timerId) return;
      this.restartHoldTimer = null;
      this.beginReadyCheck();
    }, this.restartHoldDuration);
    this.restartHoldTimer = timerId;
  }

  updateReadyUI() {
    const readyCount = this.readyActions.filter((action) => this.readyPlayers[action]).length;
    document.querySelectorAll('#start-modal [data-ready-action]').forEach((card) => {
      const isReady = Boolean(this.readyPlayers[card.dataset.readyAction]);
      card.classList.toggle('is-ready', isReady);
      const button = card.querySelector('.ready-tap');
      if (button) button.textContent = isReady ? '취소' : '준비';
    });
    const progress = document.getElementById('parking-ready-progress');
    if (progress) {
      progress.textContent = `${readyCount} / ${this.readyActions.length}`;
      progress.classList.toggle('all-ready', readyCount === this.readyActions.length);
    }
  }

  startCountdown() {
    this.soundEngine.init(); // Initialize audio context on user interaction
    this.state = 'COUNTDOWN';
    window.clearTimeout(this.readyStartTimer);
    window.clearInterval(this.countdownInterval);
    window.clearTimeout(this.countdownHideTimer);
    document.body.classList.add('is-playing');
    this.ui.hideStartScreen();
    this.ui.hideGameOver();
    this.ui.hideStageTransition();
    this.inputManager.resetAll();

    // Reset game variables
    this.score = 0;
    this.parkCount = 0;
    this.stageParkCount = 0;
    this.stageScore = 0;
    this.level = 1;
    this.timeRemaining = CONFIG.PARKING_STAGE_DURATION;
    this.ui.updateScore(0);
    this.ui.updateTime(CONFIG.PARKING_STAGE_DURATION);
    this.particles = [];
    this.skidMarks = [];

    // Always restart from the first one-bay map.
    this.map.setStage(1);
    this.bus.reset(this.map.spawnPoint.x, this.map.spawnPoint.y, this.map.spawnPoint.angle);
    this.ui.updateSteering(this.bus.steeringAngle, CONFIG.BUS.MAX_STEER_ANGLE);
    this.applyDifficulty(1);
    const spot = this.map.getSpotForLevel(1, null, this.bus.x, this.bus.y);
    this.map.setActiveParkingSpot(spot);
    this.parkingJudge.setTargetSpot(spot);

    let count = 3;
    this.ui.showCountdown(count);
    this.soundEngine.playCountdown(count);

    this.countdownInterval = window.setInterval(() => {
      count--;
      if (count > 0) {
        this.ui.showCountdown(count);
        this.soundEngine.playCountdown(count);
      } else {
        window.clearInterval(this.countdownInterval);
        this.ui.showCountdown(0); // "GO!"
        this.soundEngine.playCountdown(0);
        this.soundEngine.startMusic('parking');
        this.state = 'PLAYING';
        this.countdownHideTimer = window.setTimeout(() => this.ui.hideCountdown(), 500);
      }
    }, 1000);
  }

  applyDifficulty(level) {
    this.level = Math.max(1, Math.min(CONFIG.DIFFICULTY.length, level));
    const difficulty = CONFIG.DIFFICULTY[this.level - 1];
    this.parkingJudge.setDifficulty(difficulty);
    this.ui.updateDifficulty(difficulty);
    return difficulty;
  }

  handleParkingSuccess(spot) {
    const parkingPoints = CONFIG.SCORING.PARKING_SUCCESS;
    this.score += parkingPoints;
    this.stageScore += parkingPoints;
    this.parkCount++;
    this.stageParkCount++;
    this.ui.updateScore(this.score);
    this.soundEngine.playSuccess();

    // Spawn Confetti Particles
    this.spawnConfetti(spot.x, spot.y);

    // First clear: keep the map and reveal its second, different destination.
    if (this.stageParkCount < 2) {
      this.ui.showSuccessBanner(parkingPoints, null);
      setTimeout(() => {
        if (this.state !== 'PLAYING') return;
        const nextSpot = this.map.getSpotForLevel(this.level, spot.id, this.bus.x, this.bus.y);
        this.map.setActiveParkingSpot(nextSpot);
        this.parkingJudge.setTargetSpot(nextSpot);
      }, 650);
      return;
    }

    // Two bays clear the stage and convert remaining seconds into score.
    const timeBonus = Math.max(0, Math.ceil(this.timeRemaining)) * CONFIG.SCORING.STAGE_TIME_MULTIPLIER;
    this.score += timeBonus;
    this.stageScore += timeBonus;
    this.ui.updateScore(this.score);
    const isFinalStage = this.level >= CONFIG.DIFFICULTY.length;

    if (!isFinalStage) {
      const nextLevel = this.level + 1;
      const nextDifficulty = CONFIG.DIFFICULTY[nextLevel - 1];
      this.state = 'TRANSITION';
      this.inputManager.resetAll();
      this.ui.showStageTransition(this.stageScore, nextDifficulty);

      setTimeout(() => {
        if (this.state !== 'TRANSITION') return;
        this.map.setStage(nextLevel);
        this.bus.reset(this.map.spawnPoint.x, this.map.spawnPoint.y, this.map.spawnPoint.angle);
        this.applyDifficulty(nextLevel);
        const nextSpot = this.map.getSpotForLevel(nextLevel, null, this.bus.x, this.bus.y);
        this.map.setActiveParkingSpot(nextSpot);
        this.parkingJudge.setTargetSpot(nextSpot);
        this.stageParkCount = 0;
        this.stageScore = 0;
        this.timeRemaining = CONFIG.PARKING_STAGE_DURATION;
        this.ui.updateTime(this.timeRemaining);
        this.particles = [];
        this.ui.hideStageTransition();
        this.state = 'PLAYING';
      }, 1150);
      return;
    }

    // Six total bays complete the run.
    this.score += CONFIG.SCORING.ALL_CLEAR_BONUS;
    this.ui.updateScore(this.score);
    this.state = 'TRANSITION';
    this.inputManager.resetAll();
    this.ui.showSuccessBanner(CONFIG.SCORING.ALL_CLEAR_BONUS, null);
    setTimeout(() => {
      if (this.state !== 'TRANSITION') return;
      this.state = 'GAMEOVER';
      this.soundEngine.stopMusic();
      this.ui.showGameClear(this.score, this.parkCount);
    }, 850);
  }

  handleCollision(collisionData) {
    const impact = Math.min(15, Math.abs(collisionData.speed) * 3 + 2);
    this.shakeIntensity = impact;
    this.soundEngine.playCrash();
    this.spawnSparks(collisionData.x, collisionData.y);
  }

  spawnSparks(x, y) {
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 1;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: Math.random() > 0.5 ? '#FBBF24' : '#EF4444',
        size: Math.random() * 3 + 2,
        alpha: 1.0,
        decay: Math.random() * 0.04 + 0.03
      });
    }
  }

  spawnConfetti(x, y) {
    const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6', '#FBBF24'];
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 2;
      this.particles.push({
        x: x + (Math.random() * 40 - 20),
        y: y + (Math.random() * 40 - 20),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2, // Upward bias
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 5 + 3,
        alpha: 1.0,
        decay: Math.random() * 0.02 + 0.01
      });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  drawParticles() {
    this.particles.forEach(p => {
      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      this.ctx.restore();
    });
  }

  loop(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    let dt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;

    // Cap delta time to prevent physics jump
    if (dt > 0.1) dt = 0.1;

    // 1. UPDATE STATE
    if (this.state === 'PLAYING') {
      const inputs = this.inputManager.getCombinedState();

      // Update bus physics
      this.bus.update(inputs, dt);

      // Check obstacle and wall collisions
      CollisionSystem.checkBusCollisions(this.bus, this.map, (data) => this.handleCollision(data));

      // Check parking condition
      this.parkingJudge.update(this.bus, dt, (spot) => this.handleParkingSuccess(spot));

      // Update game timer
      this.timeRemaining -= dt;
      this.ui.updateTime(this.timeRemaining);

      if (this.timeRemaining <= 0) {
        this.timeRemaining = 0;
        this.state = 'GAMEOVER';
        this.soundEngine.stopMusic();
        this.ui.updateTime(0);
        this.ui.showGameOver(this.score, this.parkCount);
        this.inputManager.resetAll();
      }
    }

    // Update screen shake decay
    if (this.shakeIntensity > 0.05) {
      this.shakeIntensity *= this.shakeDecay;
    } else {
      this.shakeIntensity = 0;
    }

    // Update particles
    this.updateParticles(dt);
    this.ui.updateSteering(this.bus.steeringAngle, CONFIG.BUS.MAX_STEER_ANGLE);

    // 2. RENDER PIPELINE
    this.ctx.save();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply Screen Shake
    if (this.shakeIntensity > 0) {
      const shakeX = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      const shakeY = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      this.ctx.translate(shakeX, shakeY);
    }

    // Render Map & Markings
    this.map.draw(this.ctx);

    // Render Target Parking Bay & Dwell progress
    this.parkingJudge.draw(this.ctx, this.bus);

    // Show the approximate direction implied by the retained steering angle.
    this.bus.drawSteeringGuide(this.ctx);

    // Render Bus
    this.bus.draw(this.ctx);

    // Render Particles (Sparks, Confetti)
    this.drawParticles();

    this.ctx.restore();

    // Lightweight runtime telemetry for browser smoke tests and diagnostics.
    this.canvas.dataset.gameState = this.state;
    this.canvas.dataset.busX = this.bus.x.toFixed(2);
    this.canvas.dataset.busY = this.bus.y.toFixed(2);
    this.canvas.dataset.busAngle = this.bus.angle.toFixed(4);
    this.canvas.dataset.busSpeed = this.bus.speed.toFixed(3);
    const steeringPercent = Math.round((this.bus.steeringAngle / CONFIG.BUS.MAX_STEER_ANGLE) * 100);
    this.canvas.dataset.steeringAngle = this.bus.steeringAngle.toFixed(4);
    this.canvas.dataset.steeringPercent = String(steeringPercent);
    this.canvas.dataset.stage = String(this.level);
    this.canvas.dataset.stageParkCount = String(this.stageParkCount);

    // Continue loop
    requestAnimationFrame((t) => this.loop(t));
  }
}

// Bootstrap game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new Game();
});
