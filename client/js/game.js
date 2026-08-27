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
    this.inputManager = new InputManager();
    this.soundEngine = new SoundEngine();
    this.ui = new UIController();

    this.network = new NetworkClient(this.inputManager, (isEspConnected) => {
      this.ui.updateEsp32Status(isEspConnected);
    });

    // Game state
    this.state = 'TITLE'; // 'TITLE' | 'COUNTDOWN' | 'PLAYING' | 'GAMEOVER'
    this.score = 0;
    this.parkCount = 0;
    this.level = 1;
    this.timeRemaining = CONFIG.GAME_DURATION;
    this.lastTime = 0;

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
    });

    // Initialize UI callbacks
    this.ui.init(
      () => this.startCountdown(),
      () => this.startCountdown(),
      () => {
        this.soundEngine.isMuted = !this.soundEngine.isMuted;
        const icon = document.getElementById('sound-icon');
        if (icon) icon.textContent = this.soundEngine.isMuted ? '🔇' : '🔊';
      }
    );

    // Connect WebSocket
    this.network.connect();

    // Setup first parking target
    this.applyDifficulty(1);
    const firstSpot = this.map.getSpotForLevel(1, null, this.bus.x, this.bus.y);
    this.parkingJudge.setTargetSpot(firstSpot);

    // Initial UI state
    this.ui.updateScore(this.score);
    this.ui.updateTime(this.timeRemaining);
    this.ui.updateSteering(this.bus.steeringAngle, CONFIG.BUS.MAX_STEER_ANGLE);
    this.ui.showStartScreen();

    // Start 60fps loop
    requestAnimationFrame((t) => this.loop(t));
  }

  startCountdown() {
    this.soundEngine.init(); // Initialize audio context on user interaction
    this.state = 'COUNTDOWN';
    this.ui.hideStartScreen();
    this.ui.hideGameOver();

    // Reset game variables
    this.score = 0;
    this.parkCount = 0;
    this.level = 1;
    this.timeRemaining = CONFIG.GAME_DURATION;
    this.ui.updateScore(0);
    this.ui.updateTime(CONFIG.GAME_DURATION);
    this.particles = [];
    this.skidMarks = [];

    // Reset bus position
    this.bus.reset(this.map.spawnPoint.x, this.map.spawnPoint.y, this.map.spawnPoint.angle);
    this.ui.updateSteering(this.bus.steeringAngle, CONFIG.BUS.MAX_STEER_ANGLE);
    this.applyDifficulty(1);
    const spot = this.map.getSpotForLevel(1, null, this.bus.x, this.bus.y);
    this.parkingJudge.setTargetSpot(spot);

    let count = 3;
    this.ui.showCountdown(count);
    this.soundEngine.playCountdown(count);

    const countdownInterval = setInterval(() => {
      count--;
      if (count > 0) {
        this.ui.showCountdown(count);
        this.soundEngine.playCountdown(count);
      } else if (count === 0) {
        this.ui.showCountdown(0); // "GO!"
        this.soundEngine.playCountdown(0);
      } else {
        clearInterval(countdownInterval);
        this.ui.hideCountdown();
        this.state = 'PLAYING';
      }
    }, 900);
  }

  applyDifficulty(level) {
    this.level = Math.max(1, Math.min(CONFIG.DIFFICULTY.length, level));
    const difficulty = CONFIG.DIFFICULTY[this.level - 1];
    this.parkingJudge.setDifficulty(difficulty);
    this.ui.updateDifficulty(difficulty);
    return difficulty;
  }

  handleParkingSuccess(spot) {
    this.score += CONFIG.PARKING.POINTS_PER_SUCCESS;
    this.parkCount++;
    this.ui.updateScore(this.score);
    const previousLevel = this.level;
    const nextLevel = Math.min(CONFIG.DIFFICULTY.length, this.parkCount + 1);
    const nextDifficulty = this.applyDifficulty(nextLevel);
    this.ui.showSuccessBanner(
      CONFIG.PARKING.POINTS_PER_SUCCESS,
      nextLevel > previousLevel ? nextDifficulty : null
    );
    this.soundEngine.playSuccess();

    // Spawn Confetti Particles
    this.spawnConfetti(spot.x, spot.y);

    // Delay next spot slightly for pleasant transition
    setTimeout(() => {
      if (this.state === 'PLAYING') {
        const nextSpot = this.map.getSpotForLevel(this.level, spot.id, this.bus.x, this.bus.y);
        this.parkingJudge.setTargetSpot(nextSpot);
      }
    }, 600);
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
      this.bus.update(inputs);

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

    // Continue loop
    requestAnimationFrame((t) => this.loop(t));
  }
}

// Bootstrap game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new Game();
});
