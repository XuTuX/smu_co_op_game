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
    this.round = 1;
    this.lives = CONFIG.PARKING_RUN.STARTING_LIVES;
    this.attemptTimeRemaining = CONFIG.PARKING_RUN.ATTEMPT_TIME_SEC;
    this.hasParkingPass = true;
    this.passCoachShown = false;
    this.collisionCooldown = 0;
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

    // Canvas dataset fields are diagnostics only. Writing a dozen of them (with
    // toFixed string allocation) every frame was needless layout/style churn,
    // so refresh them a few times per second instead.
    this.telemetryIntervalMs = 200;
    this.lastTelemetryAt = -Infinity;

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
    this.applyDifficulty();
    const firstSpot = this.map.getSpotForRound(1, null, this.bus.x, this.bus.y);
    this.map.setActiveParkingSpot(firstSpot);
    this.parkingJudge.setTargetSpot(firstSpot);

    // Initial UI state
    this.ui.updateScore(this.score);
    this.ui.updateRound(this.round);
    this.ui.updateLives(this.lives);
    this.ui.updateAttemptTime(this.attemptTimeRemaining);
    this.ui.updateSteering(this.bus.steeringAngle, CONFIG.BUS.MAX_STEER_ANGLE);
    this.beginReadyCheck();

    // Start 60fps loop
    requestAnimationFrame((t) => this.loop(t));
  }

  createReadyState() {
    return { forward: false, backward: false, left: false, right: false };
  }

  isTutorialRound() {
    return this.round === 1;
  }

  showRoundCoach() {
    if (this.round === 1) {
      this.ui.showCoach('연습라운드예요! 벽에 부딪혀도 목숨을 잃지 않아요!', 4000);
      return;
    }
    if (!this.hasParkingPass && !this.passCoachShown) {
      this.passCoachShown = true;
      this.ui.showCoach('주차권을 먹어야 주차할 수 있어요!', 4500);
    }
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
    this.ui.hideCoach();
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
    this.round = 1;
    this.lives = CONFIG.PARKING_RUN.STARTING_LIVES;
    this.attemptTimeRemaining = CONFIG.PARKING_RUN.ATTEMPT_TIME_SEC;
    this.hasParkingPass = true;
    this.passCoachShown = false;
    this.collisionCooldown = 0;
    this.ui.updateScore(0);
    this.ui.updateRound(this.round);
    this.ui.updateLives(this.lives);
    this.ui.updateAttemptTime(this.attemptTimeRemaining);
    this.particles = [];
    this.skidMarks = [];

    // Always restart from the clean opening round of the same parking lot.
    this.map.setRound(1);
    this.bus.reset(this.map.spawnPoint.x, this.map.spawnPoint.y, this.map.spawnPoint.angle);
    this.ui.updateSteering(this.bus.steeringAngle, CONFIG.BUS.MAX_STEER_ANGLE);
    this.applyDifficulty();
    const spot = this.map.getSpotForRound(1, null, this.bus.x, this.bus.y);
    this.map.setActiveParkingSpot(spot);
    this.parkingJudge.setTargetSpot(spot);
    this.parkingJudge.setLocked(false);
    this.map.clearParkingPass();

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
        this.showRoundCoach();
        this.countdownHideTimer = window.setTimeout(() => this.ui.hideCountdown(), 500);
      }
    }, 1000);
  }

  applyDifficulty() {
    const difficulty = {
      ...CONFIG.PARKING_DIFFICULTY,
      level: this.round,
      label: `장애물 ${this.map.getObstacleCountForRound(this.round)}개`
    };
    this.parkingJudge.setDifficulty(difficulty);
    this.ui.updateDifficulty(difficulty);
    return difficulty;
  }

  handleParkingSuccess(spot) {
    const isPractice = this.isTutorialRound();
    const timeBonus = Math.max(0, Math.ceil(this.attemptTimeRemaining));
    const parkingPoints = isPractice ? 0 : CONFIG.SCORING.PARKING_SUCCESS + timeBonus;
    if (!isPractice) {
      this.score += parkingPoints;
      this.parkCount++;
      this.ui.updateScore(this.score);
    }
    this.soundEngine.playBusSuccess?.();

    // Spawn Confetti Particles
    this.spawnConfetti(spot.x, spot.y);

    this.finishRound(parkingPoints, spot.id);
  }

  finishRound(parkingPoints = 0, spotId = null) {
    const nextRound = this.round + 1;
    const currentObstacleCount = this.map.getObstacleCountForRound(this.round);
    const nextObstacleCount = this.map.getObstacleCountForRound(nextRound);
    const movingObstacleAdded = this.map.getMovingObstacleCountForRound(nextRound)
      > this.map.getMovingObstacleCountForRound(this.round);
    const practiceDone = this.isTutorialRound();
    const transitionMs = practiceDone ? 2600 : CONFIG.PARKING_RUN.ROUND_TRANSITION_MS;
    this.state = 'TRANSITION';
    this.ui.hideCoach();
    this.inputManager.resetAll();
    this.ui.showRoundTransition(
      nextRound,
      nextObstacleCount - currentObstacleCount,
      movingObstacleAdded,
      parkingPoints,
      nextRound >= 5,
      practiceDone ? '연습을 다 하셨나요? 이제 시작해보죠!' : null
    );

    setTimeout(() => {
      if (this.state !== 'TRANSITION') return;
      this.round = nextRound;
      // Keep the bus where it parked and grow the same lot around it.
      this.map.advanceRound(this.round, this.bus.x, this.bus.y);
      this.applyDifficulty();
      const nextSpot = this.map.getSpotForRound(this.round, spotId, this.bus.x, this.bus.y);
      this.map.setActiveParkingSpot(nextSpot);
      this.parkingJudge.setTargetSpot(nextSpot);
      this.hasParkingPass = this.round < 5;
      if (this.hasParkingPass) {
        this.map.clearParkingPass();
      } else {
        this.map.spawnParkingPass(this.round, this.bus.x, this.bus.y, nextSpot);
      }
      this.parkingJudge.setLocked(!this.hasParkingPass);
      this.attemptTimeRemaining = CONFIG.PARKING_RUN.ATTEMPT_TIME_SEC;
      this.ui.updateAttemptTime(this.attemptTimeRemaining);
      this.collisionCooldown = 0.35;
      this.ui.updateRound(this.round);
      this.ui.hideStageTransition();
      this.state = 'PLAYING';
      this.showRoundCoach();
    }, transitionMs);
  }

  handleCollision(collisionData) {
    if (this.state !== 'PLAYING' || this.collisionCooldown > 0) return;
    const impact = Math.min(15, Math.abs(collisionData.speed) * 3 + 2);
    this.shakeIntensity = impact;
    this.soundEngine.playCarCrash?.();
    this.spawnSparks(collisionData.x, collisionData.y);
    if (this.isTutorialRound()) {
      this.collisionCooldown = CONFIG.PARKING_RUN.COLLISION_COOLDOWN_SEC;
      this.attemptTimeRemaining = CONFIG.PARKING_RUN.ATTEMPT_TIME_SEC;
      this.ui.updateAttemptTime(this.attemptTimeRemaining);
      this.ui.showRetryBanner('벽에 부딪혔어요! 다시 도전');
      this.inputManager.resetAll();
      this.bus.reset(this.map.spawnPoint.x, this.map.spawnPoint.y, this.map.spawnPoint.angle);
      return;
    }
    this.lives--;
    this.ui.updateLives(this.lives);

    if (this.lives <= 0) {
      this.state = 'GAMEOVER';
      this.soundEngine.stopMusic();
      this.soundEngine.playGameOver?.();
      this.inputManager.resetAll();
      this.ui.showGameOver(this.score, this.parkCount, this.round);
      return;
    }

    this.collisionCooldown = CONFIG.PARKING_RUN.COLLISION_COOLDOWN_SEC;
    this.attemptTimeRemaining = CONFIG.PARKING_RUN.ATTEMPT_TIME_SEC;
    this.ui.updateAttemptTime(this.attemptTimeRemaining);
    this.ui.showDamageBanner();
    this.inputManager.resetAll();
    this.bus.reset(this.map.spawnPoint.x, this.map.spawnPoint.y, this.map.spawnPoint.angle);
  }

  handleAttemptTimeout() {
    if (this.state !== 'PLAYING') return;
    if (this.isTutorialRound()) {
      // Practice time-over simply graduates the players into the real game.
      const spot = this.parkingJudge.currentSpot;
      this.finishRound(0, spot ? spot.id : null);
      return;
    }
    this.lives--;
    this.ui.updateLives(this.lives);
    this.attemptTimeRemaining = CONFIG.PARKING_RUN.ATTEMPT_TIME_SEC;
    this.ui.updateAttemptTime(this.attemptTimeRemaining);

    if (this.lives <= 0) {
      this.state = 'GAMEOVER';
      this.soundEngine.stopMusic();
      this.soundEngine.playGameOver?.();
      this.inputManager.resetAll();
      this.ui.showGameOver(this.score, this.parkCount, this.round);
      return;
    }

    this.collisionCooldown = CONFIG.PARKING_RUN.COLLISION_COOLDOWN_SEC;
      this.ui.showTimeoutBanner();
    this.inputManager.resetAll();
    this.bus.reset(this.map.spawnPoint.x, this.map.spawnPoint.y, this.map.spawnPoint.angle);
    this.parkingJudge.setTargetSpot(this.parkingJudge.currentSpot);
    this.parkingJudge.setLocked(!this.hasParkingPass);
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
      this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
      this.attemptTimeRemaining = Math.max(0, this.attemptTimeRemaining - dt);
      this.ui.updateAttemptTime(this.attemptTimeRemaining);
      const inputs = this.inputManager.getCombinedState();

      // Update bus physics
      this.bus.update(inputs, dt);

      // Moving maintenance vehicles start appearing from round five.
      this.map.update(dt);

      // Check obstacle and wall collisions
      CollisionSystem.checkBusCollisions(this.bus, this.map, (data) => this.handleCollision(data));

      if (!this.hasParkingPass && this.map.collectParkingPass(this.bus)) {
        this.hasParkingPass = true;
        this.parkingJudge.setLocked(false);
        this.soundEngine.playSuccess();
        this.ui.showPassBanner();
      }

      // Check parking condition
      this.parkingJudge.update(this.bus, dt, (spot) => this.handleParkingSuccess(spot));

      if (this.state === 'PLAYING' && this.attemptTimeRemaining <= 0) {
        this.handleAttemptTimeout();
      }

    }

    // Bus engine/driving loop: only while the bus is actually rolling during play.
    const busRolling = this.state === 'PLAYING'
      && Math.abs(this.bus.speed) > CONFIG.PARKING.MAX_STOP_SPEED;
    this.soundEngine.setCarMoving?.(busRolling);

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
    // Throttled: diagnostics do not need 60 samples a second.
    const telemetryNow = performance.now();
    if (telemetryNow - this.lastTelemetryAt >= this.telemetryIntervalMs) {
      this.lastTelemetryAt = telemetryNow;
      this.canvas.dataset.gameState = this.state;
      this.canvas.dataset.busX = this.bus.x.toFixed(2);
      this.canvas.dataset.busY = this.bus.y.toFixed(2);
      this.canvas.dataset.busAngle = this.bus.angle.toFixed(4);
      this.canvas.dataset.busSpeed = this.bus.speed.toFixed(3);
      const steeringPercent = Math.round((this.bus.steeringAngle / CONFIG.BUS.MAX_STEER_ANGLE) * 100);
      this.canvas.dataset.steeringAngle = this.bus.steeringAngle.toFixed(4);
      this.canvas.dataset.steeringPercent = String(steeringPercent);
      this.canvas.dataset.round = String(this.round);
      this.canvas.dataset.lives = String(this.lives);
      this.canvas.dataset.obstacles = String(this.map.obstacles.length);
      this.canvas.dataset.attemptTime = String(Math.max(0, Math.ceil(this.attemptTimeRemaining)));
      this.canvas.dataset.hasParkingPass = String(this.hasParkingPass);
    }

    // Continue loop
    requestAnimationFrame((t) => this.loop(t));
  }
}

// Bootstrap game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new Game();
});
