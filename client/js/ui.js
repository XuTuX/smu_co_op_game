/**
 * UI Controller: Handles HUD, overlays, animations, and modal state
 */
class UIController {
  constructor() {
    this.scoreElement = document.getElementById('score-value');
    this.roundElement = document.getElementById('round-value');
    this.livesElement = document.getElementById('lives-value');
    this.attemptTimeElement = document.getElementById('attempt-time-value');
    this.esp32Badge = document.getElementById('esp32-badge');
    this.esp32StatusText = document.getElementById('esp32-status-text');
    this.difficultyBadge = document.getElementById('difficulty-badge');
    this.stageLabel = document.getElementById('stage-label');
    this.difficultyText = document.getElementById('difficulty-text');
    this.steeringHud = document.getElementById('steering-hud');
    this.steeringDirection = document.getElementById('steering-direction');
    this.steeringWheel = document.getElementById('steering-wheel');
    this.steeringValue = document.getElementById('steering-value');
    this.tutorialCoach = document.getElementById('tutorial-coach');
    this.tutorialInstruction = document.getElementById('tutorial-instruction');
    this.coachHideTimer = null;

    // Button Indicator Elements
    this.btnForward = document.getElementById('btn-forward');
    this.btnBackward = document.getElementById('btn-backward');
    this.btnLeft = document.getElementById('btn-left');
    this.btnRight = document.getElementById('btn-right');
    // Cached once: the canvas control list is static, so re-querying the DOM
    // on every single ESP32 input event was pure overhead during play.
    this.canvasControls = null;
    // Last values rendered, used to skip redundant per-frame DOM writes.
    this.lastAttemptSeconds = null;
    this.lastSteeringKey = null;

    // Modals & Overlays
    this.startModal = document.getElementById('start-modal');
    this.gameOverModal = document.getElementById('gameover-modal');
    this.countdownOverlay = document.getElementById('countdown-overlay');
    this.countdownText = document.getElementById('countdown-text');
    this.successBanner = document.getElementById('success-banner');
    this.stageTransition = document.getElementById('stage-transition');
    this.stageTransitionKicker = document.getElementById('stage-transition-kicker');
    this.stageTransitionLabel = document.getElementById('stage-transition-label');
    this.stageTransitionName = document.getElementById('stage-transition-name');
    this.finalScoreElement = document.getElementById('final-score');
    this.finalParkCountElement = document.getElementById('final-park-count');
    this.finalRoundElement = document.getElementById('final-round');
    this.finalResultBadge = document.getElementById('final-result-badge');
    this.finalResultTitle = document.getElementById('final-result-title');

    this.gameOverPresenter = typeof GameOverPresenter === 'function'
      ? new GameOverPresenter({ modal: this.gameOverModal, messageElement: this.finalResultTitle })
      : null;

    // Action buttons
    this.startBtn = document.getElementById('start-btn');
    this.restartBtn = document.getElementById('restart-btn');
    this.soundToggleBtn = document.getElementById('sound-toggle-btn');
  }

  init(onStart, onRestart, onSoundToggle) {
    if (this.startBtn && onStart) {
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
    if (this.stageLabel) this.stageLabel.textContent = `${difficulty.level}단계`;
    if (this.difficultyText) {
      this.difficultyText.textContent = difficulty.label;
    }
  }

  updateRound(round) {
    if (this.roundElement) this.roundElement.textContent = round;
  }

  updateLives(lives) {
    if (!this.livesElement) return;
    const safeLives = Math.max(0, lives);
    this.livesElement.textContent = `♥ ${safeLives}`;
    this.livesElement.setAttribute('aria-label', `목숨 ${safeLives}개`);
  }

  showCoach(message, durationMs = 3500) {
    if (!this.tutorialCoach) return;
    if (this.tutorialInstruction) this.tutorialInstruction.textContent = message;
    this.tutorialCoach.classList.add('is-visible');
    window.clearTimeout(this.coachHideTimer);
    this.coachHideTimer = window.setTimeout(() => {
      this.tutorialCoach.classList.remove('is-visible');
    }, durationMs);
  }

  hideCoach() {
    if (!this.tutorialCoach) return;
    window.clearTimeout(this.coachHideTimer);
    this.tutorialCoach.classList.remove('is-visible');
  }

  updateAttemptTime(seconds) {
    if (!this.attemptTimeElement) return;
    const safeSeconds = Math.max(0, Math.ceil(seconds));
    // The loop calls this ~60 times a second; only touch the DOM when the
    // displayed integer actually changes.
    if (safeSeconds === this.lastAttemptSeconds) return;
    this.lastAttemptSeconds = safeSeconds;
    this.attemptTimeElement.textContent = safeSeconds;
    this.attemptTimeElement.classList.toggle('urgent', safeSeconds <= 10);
  }

  updateSteering(steeringAngle, maxSteeringAngle) {
    if (!this.steeringHud || !this.steeringWheel || !this.steeringValue || !this.steeringDirection) return;
    const normalized = Math.max(-1, Math.min(1, steeringAngle / maxSteeringAngle));
    const amount = Math.round(Math.abs(normalized) * 100);
    const direction = normalized < -0.02 ? 'left' : normalized > 0.02 ? 'right' : 'center';
    const labels = { left: '왼쪽', right: '오른쪽', center: '중앙' };
    const steeringKey = `${amount}|${direction}`;
    if (steeringKey !== this.lastSteeringKey) {
      this.lastSteeringKey = steeringKey;
      this.steeringHud.dataset.direction = direction;
      this.steeringHud.setAttribute('aria-label', `핸들 ${labels[direction]} ${amount}%`);
      this.steeringDirection.textContent = labels[direction];
      this.steeringValue.textContent = `${amount}%`;
    }
    // The wheel itself still animates every frame so the rotation stays smooth.
    this.steeringWheel.style.transform = `rotate(${normalized * 135}deg)`;
  }

  updateEsp32Status(isConnected) {
    if (this.esp32Badge && this.esp32StatusText) {
      if (isConnected) {
        this.esp32Badge.className = 'status-badge connected';
        this.esp32StatusText.textContent = 'ESP32';
      } else {
        this.esp32Badge.className = 'status-badge local';
        this.esp32StatusText.textContent = 'PC';
      }
    }
  }

  updateButtonIndicators(inputs) {
    if (this.btnForward) this.btnForward.classList.toggle('active', inputs.forward);
    if (this.btnBackward) this.btnBackward.classList.toggle('active', inputs.backward);
    if (this.btnLeft) this.btnLeft.classList.toggle('active', inputs.left);
    if (this.btnRight) this.btnRight.classList.toggle('active', inputs.right);

    if (this.canvasControls === null) {
      this.canvasControls = Array.from(document.querySelectorAll('.canvas-control[data-action]'));
    }
    for (const button of this.canvasControls) {
      button.classList.toggle('active', Boolean(inputs[button.dataset.action]));
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

  showRoundTransition(round, obstaclesAdded = 0, movingObstacleAdded = false, scoreAdded = 0, requiresPass = false, nameOverride = null) {
    if (!this.stageTransition) return;
    this.stageTransition.className = 'overlay stage-transition';
    if (this.stageTransitionKicker) {
      this.stageTransitionKicker.textContent = scoreAdded > 0
        ? `주차 완료 · +${scoreAdded}점`
        : '연습 종료';
    }
    if (this.stageTransitionLabel) this.stageTransitionLabel.textContent = `STAGE ${round}`;
    if (this.stageTransitionName) {
      this.stageTransitionName.textContent = nameOverride
        || (requiresPass
          ? '주차권 획득 후 주차'
          : (movingObstacleAdded ? '움직이는 장애물 등장' : (obstaclesAdded > 0 ? '장애물 +1' : '다음 주차 시작')));
    }
  }

  hideStageTransition() {
    if (this.stageTransition) this.stageTransition.classList.add('hidden');
  }

  showSuccessBanner(scoreAdded = 10, nextDifficulty = null) {
    if (!this.successBanner) return;
    this.successBanner.textContent = nextDifficulty
      ? `주차 완료 · ${nextDifficulty.level}단계`
      : `주차 성공! +${scoreAdded}`;
    this.successBanner.classList.remove('hidden');
    this.successBanner.classList.add('banner-pop');

    setTimeout(() => {
      this.successBanner.classList.add('hidden');
      this.successBanner.classList.remove('banner-pop');
    }, 1800);
  }

  showDamageBanner() {
    if (!this.successBanner) return;
    this.successBanner.textContent = '벽에 부딪혀서 목숨을 잃었어요!';
    this.successBanner.classList.add('damage-banner', 'banner-pop');
    this.successBanner.classList.remove('hidden');
    window.clearTimeout(this.bannerHideTimer);
    this.bannerHideTimer = window.setTimeout(() => {
      this.successBanner.classList.add('hidden');
      this.successBanner.classList.remove('damage-banner', 'banner-pop');
    }, 1700);
  }

  showRetryBanner(message) {
    if (!this.successBanner) return;
    this.successBanner.textContent = message;
    this.successBanner.classList.remove('damage-banner', 'hidden');
    this.successBanner.classList.add('banner-pop');
    window.clearTimeout(this.bannerHideTimer);
    this.bannerHideTimer = window.setTimeout(() => {
      this.successBanner.classList.add('hidden');
      this.successBanner.classList.remove('banner-pop');
    }, 1600);
  }

  showTimeoutBanner() {
    if (!this.successBanner) return;
    this.successBanner.textContent = '시간 초과로 목숨을 잃었어요!';
    this.successBanner.classList.add('damage-banner', 'banner-pop');
    this.successBanner.classList.remove('hidden');
    window.clearTimeout(this.bannerHideTimer);
    this.bannerHideTimer = window.setTimeout(() => {
      this.successBanner.classList.add('hidden');
      this.successBanner.classList.remove('damage-banner', 'banner-pop');
    }, 1700);
  }

  showPassBanner() {
    if (!this.successBanner) return;
    this.successBanner.textContent = '주차권 획득! 이제 주차하세요';
    this.successBanner.classList.remove('damage-banner', 'hidden');
    this.successBanner.classList.add('banner-pop');
    window.clearTimeout(this.bannerHideTimer);
    this.bannerHideTimer = window.setTimeout(() => {
      this.successBanner.classList.add('hidden');
      this.successBanner.classList.remove('banner-pop');
    }, 1400);
  }

  showGameOver(score, parkCount, round = 1) {
    if (this.finalScoreElement) this.finalScoreElement.textContent = score;
    if (this.finalParkCountElement) this.finalParkCountElement.textContent = parkCount;
    if (this.finalRoundElement) this.finalRoundElement.textContent = round;
    if (this.gameOverPresenter) this.gameOverPresenter.begin();
    else this.gameOverModal.classList.remove('hidden');
  }

  showGameClear(score, parkCount) {
    if (this.finalScoreElement) this.finalScoreElement.textContent = score;
    if (this.finalParkCountElement) this.finalParkCountElement.textContent = parkCount;
    if (this.gameOverPresenter) this.gameOverPresenter.begin();
    else this.gameOverModal.classList.remove('hidden');
  }

  hideGameOver() {
    if (this.gameOverPresenter) this.gameOverPresenter.hide();
    else this.gameOverModal.classList.add('hidden');
  }
}

window.UIController = UIController;
