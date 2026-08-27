/**
 * UI Controller: Handles HUD, overlays, animations, and modal state
 */
class UIController {
  constructor() {
    this.scoreElement = document.getElementById('score-value');
    this.timeElement = document.getElementById('time-value');
    this.esp32Badge = document.getElementById('esp32-badge');
    this.esp32StatusText = document.getElementById('esp32-status-text');
    this.inputStatus = document.getElementById('input-status');
    this.difficultyBadge = document.getElementById('difficulty-badge');
    this.stageLabel = document.getElementById('stage-label');
    this.difficultyText = document.getElementById('difficulty-text');
    this.steeringHud = document.getElementById('steering-hud');
    this.steeringDirection = document.getElementById('steering-direction');
    this.steeringIndicator = document.getElementById('steering-indicator');
    this.steeringValue = document.getElementById('steering-value');

    // Button Indicator Elements
    this.btnForward = document.getElementById('btn-forward');
    this.btnBackward = document.getElementById('btn-backward');
    this.btnLeft = document.getElementById('btn-left');
    this.btnRight = document.getElementById('btn-right');

    // Modals & Overlays
    this.startModal = document.getElementById('start-modal');
    this.gameOverModal = document.getElementById('gameover-modal');
    this.countdownOverlay = document.getElementById('countdown-overlay');
    this.countdownText = document.getElementById('countdown-text');
    this.successBanner = document.getElementById('success-banner');
    this.finalScoreElement = document.getElementById('final-score');
    this.finalParkCountElement = document.getElementById('final-park-count');

    // Action buttons
    this.startBtn = document.getElementById('start-btn');
    this.restartBtn = document.getElementById('restart-btn');
    this.soundToggleBtn = document.getElementById('sound-toggle-btn');
  }

  init(onStart, onRestart, onSoundToggle) {
    if (this.startBtn) {
      this.startBtn.addEventListener('click', onStart);
    }
    if (this.restartBtn) {
      this.restartBtn.addEventListener('click', onRestart);
    }
    if (this.soundToggleBtn) {
      this.soundToggleBtn.addEventListener('click', onSoundToggle);
    }
  }

  updateScore(score) {
    if (this.scoreElement) {
      this.scoreElement.textContent = score;
    }
  }

  updateDifficulty(difficulty) {
    if (this.difficultyBadge) {
      this.difficultyBadge.className = `difficulty-badge stage-${difficulty.level}`;
    }
    if (this.stageLabel) this.stageLabel.textContent = `STAGE ${difficulty.level}`;
    if (this.difficultyText) {
      this.difficultyText.textContent = `${difficulty.label} · ${difficulty.description}`;
    }
  }

  updateTime(secondsRemaining) {
    if (this.timeElement) {
      this.timeElement.textContent = Math.max(0, Math.ceil(secondsRemaining));
      if (secondsRemaining <= 10) {
        this.timeElement.classList.add('urgent');
      } else {
        this.timeElement.classList.remove('urgent');
      }
    }
  }

  updateSteering(steeringAngle, maxSteeringAngle) {
    if (!this.steeringHud || !this.steeringIndicator || !this.steeringValue || !this.steeringDirection) return;
    const normalized = Math.max(-1, Math.min(1, steeringAngle / maxSteeringAngle));
    const amount = Math.round(Math.abs(normalized) * 100);
    const direction = normalized < -0.02 ? 'left' : normalized > 0.02 ? 'right' : 'center';
    const labels = { left: '왼쪽', right: '오른쪽', center: '중앙' };
    this.steeringHud.dataset.direction = direction;
    this.steeringHud.setAttribute('aria-label', `핸들 ${labels[direction]} ${amount}%`);
    this.steeringDirection.textContent = labels[direction];
    this.steeringValue.textContent = `${amount}%`;
    this.steeringIndicator.style.left = `${(normalized + 1) * 50}%`;
  }

  updateEsp32Status(isConnected) {
    if (this.esp32Badge && this.esp32StatusText) {
      if (isConnected) {
        this.esp32Badge.className = 'status-badge connected';
        this.esp32StatusText.textContent = 'ESP32 LIVE';
      } else {
        this.esp32Badge.className = 'status-badge local';
        this.esp32StatusText.textContent = 'PC TEST MODE';
      }
    }
  }

  updateButtonIndicators(inputs) {
    if (this.btnForward) this.btnForward.classList.toggle('active', inputs.forward);
    if (this.btnBackward) this.btnBackward.classList.toggle('active', inputs.backward);
    if (this.btnLeft) this.btnLeft.classList.toggle('active', inputs.left);
    if (this.btnRight) this.btnRight.classList.toggle('active', inputs.right);

    document.querySelectorAll('.canvas-control[data-action]').forEach((button) => {
      button.classList.toggle('active', Boolean(inputs[button.dataset.action]));
    });

    if (this.inputStatus) {
      const labels = [];
      if (inputs.forward) labels.push('FORWARD');
      if (inputs.backward) labels.push('BACKWARD');
      if (inputs.left) labels.push('LEFT');
      if (inputs.right) labels.push('RIGHT');
      this.inputStatus.textContent = labels.length ? `INPUT: ${labels.join(' + ')}` : 'INPUT READY';
      this.inputStatus.classList.toggle('active', labels.length > 0);
    }
  }

  showStartScreen() {
    this.startModal.classList.remove('hidden');
    this.gameOverModal.classList.add('hidden');
    this.countdownOverlay.classList.add('hidden');
  }

  hideStartScreen() {
    this.startModal.classList.add('hidden');
  }

  showCountdown(count) {
    this.countdownOverlay.classList.remove('hidden');
    this.countdownText.textContent = count > 0 ? count : 'GO!';
    this.countdownText.className = 'countdown-number pop-animation';
  }

  hideCountdown() {
    this.countdownOverlay.classList.add('hidden');
  }

  showSuccessBanner(scoreAdded = 10, nextDifficulty = null) {
    if (!this.successBanner) return;
    this.successBanner.textContent = nextDifficulty
      ? `성공! +${scoreAdded} · STAGE ${nextDifficulty.level} ${nextDifficulty.label}`
      : `주차 성공! +${scoreAdded}`;
    this.successBanner.classList.remove('hidden');
    this.successBanner.classList.add('banner-pop');

    setTimeout(() => {
      this.successBanner.classList.add('hidden');
      this.successBanner.classList.remove('banner-pop');
    }, 1800);
  }

  showGameOver(score, parkCount) {
    if (this.finalScoreElement) this.finalScoreElement.textContent = score;
    if (this.finalParkCountElement) this.finalParkCountElement.textContent = parkCount;
    this.gameOverModal.classList.remove('hidden');
  }

  hideGameOver() {
    this.gameOverModal.classList.add('hidden');
  }
}

window.UIController = UIController;
