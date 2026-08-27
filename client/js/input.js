/**
 * Unified Input Manager: Merges Keyboard (W/A/S/D/Arrows) and ESP32 controller inputs
 */
class InputManager {
  constructor(options = {}) {
    this.latchSteering = Boolean(options.latchSteering);
    this.keyboardState = {
      forward: false,
      backward: false,
      left: false,
      right: false
    };

    this.esp32State = {
      forward: false,
      backward: false,
      left: false,
      right: false
    };

    // On-screen buttons allow complete mouse/touch testing without hardware.
    this.pointerState = {
      forward: false,
      backward: false,
      left: false,
      right: false
    };
    this.pulseState = {
      forward: false,
      backward: false,
      left: false,
      right: false
    };
    this.pulseTimers = {};
    this.activePointers = {
      forward: new Set(),
      backward: new Set(),
      left: new Set(),
      right: new Set()
    };
    this.pointerStartedAt = new Map();
    this.scheduledPointerReleases = new Set();
    this.minimumPointerPressMs = 100;

    this.listeners = [];
    this.initKeyboardListeners();
    this.initPointerListeners();
  }

  initPointerListeners() {
    document.querySelectorAll('[data-action]').forEach((button) => {
      const action = button.dataset.action;
      if (!(action in this.pointerState)) return;

      const press = (event) => {
        event.preventDefault();
        this.activePointers[action].add(event.pointerId);
        this.pointerStartedAt.set(event.pointerId, performance.now());
        this.pointerState[action] = true;
        if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
        this.notifyListeners();
      };

      const finishRelease = (event) => {
        this.activePointers[action].delete(event.pointerId);
        this.pointerStartedAt.delete(event.pointerId);
        this.scheduledPointerReleases.delete(event.pointerId);
        this.pointerState[action] = this.activePointers[action].size > 0;
        this.notifyListeners();
      };

      const release = (event) => {
        if (!this.activePointers[action].has(event.pointerId)) return;
        if (this.scheduledPointerReleases.has(event.pointerId)) return;

        const startedAt = this.pointerStartedAt.get(event.pointerId) || performance.now();
        const remaining = Math.max(0, this.minimumPointerPressMs - (performance.now() - startedAt));
        if (remaining > 0 && event.type === 'pointerup') {
          this.scheduledPointerReleases.add(event.pointerId);
          window.setTimeout(() => finishRelease(event), remaining);
        } else {
          finishRelease(event);
        }
      };

      button.addEventListener('pointerdown', press);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
      button.addEventListener('click', () => {
        if (this.latchSteering && (action === 'left' || action === 'right')) return;
        const pulseMs = action === 'left' || action === 'right' ? 450 : 150;
        this.pulseAction(action, pulseMs);
      });
      button.addEventListener('contextmenu', (event) => event.preventDefault());
    });
  }

  initKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      // Prevent default scrolling for arrows and space
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      this.handleKeyEvent(e.code, true);
    });

    window.addEventListener('keyup', (e) => {
      this.handleKeyEvent(e.code, false);
      const action = this.getActionForCode(e.code);
      if (this.latchSteering && (action === 'left' || action === 'right')) return;
      const pulseMs = action === 'left' || action === 'right' ? 250 : 100;
      this.pulseAction(action, pulseMs);
    });

    // Reset when window loses focus to prevent stuck keys
    window.addEventListener('blur', () => {
      this.resetKeyboard();
    });
  }

  getActionForCode(code) {
    if (code === 'KeyW' || code === 'ArrowUp') return 'forward';
    if (code === 'KeyS' || code === 'ArrowDown') return 'backward';
    if (code === 'KeyA' || code === 'ArrowLeft') return 'left';
    if (code === 'KeyD' || code === 'ArrowRight') return 'right';
    return null;
  }

  pulseAction(action, durationMs) {
    if (!action || !(action in this.pulseState)) return;
    window.clearTimeout(this.pulseTimers[action]);
    this.pulseState[action] = true;
    this.notifyListeners();
    this.pulseTimers[action] = window.setTimeout(() => {
      this.pulseState[action] = false;
      this.notifyListeners();
    }, durationMs);
  }

  handleKeyEvent(code, isPressed) {
    let changed = false;

    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        if (this.keyboardState.forward !== isPressed) {
          this.keyboardState.forward = isPressed;
          changed = true;
        }
        break;

      case 'KeyS':
      case 'ArrowDown':
        if (this.keyboardState.backward !== isPressed) {
          this.keyboardState.backward = isPressed;
          changed = true;
        }
        break;

      case 'KeyA':
      case 'ArrowLeft':
        if (this.keyboardState.left !== isPressed) {
          this.keyboardState.left = isPressed;
          changed = true;
        }
        break;

      case 'KeyD':
      case 'ArrowRight':
        if (this.keyboardState.right !== isPressed) {
          this.keyboardState.right = isPressed;
          changed = true;
        }
        break;
    }

    if (changed) {
      this.notifyListeners();
    }
  }

  // Update input from ESP32 WebSocket packet
  setEsp32Input(data) {
    if (!data) return;

    this.esp32State.forward = Boolean(data.forward);
    this.esp32State.backward = Boolean(data.backward);
    this.esp32State.left = Boolean(data.left);
    this.esp32State.right = Boolean(data.right);

    this.notifyListeners();
  }

  // Get combined inputs (Logical OR between Keyboard and ESP32)
  getCombinedState() {
    return {
      forward: this.keyboardState.forward || this.pointerState.forward || this.pulseState.forward || this.esp32State.forward,
      backward: this.keyboardState.backward || this.pointerState.backward || this.pulseState.backward || this.esp32State.backward,
      left: this.keyboardState.left || this.pointerState.left || this.pulseState.left || this.esp32State.left,
      right: this.keyboardState.right || this.pointerState.right || this.pulseState.right || this.esp32State.right
    };
  }

  resetKeyboard() {
    this.keyboardState.forward = false;
    this.keyboardState.backward = false;
    this.keyboardState.left = false;
    this.keyboardState.right = false;
    this.notifyListeners();
  }

  resetAll() {
    this.resetKeyboard();
    Object.keys(this.pointerState).forEach((action) => {
      this.pointerState[action] = false;
      this.activePointers[action].clear();
    });
    this.pointerStartedAt.clear();
    this.scheduledPointerReleases.clear();
    Object.keys(this.pulseState).forEach((action) => {
      this.pulseState[action] = false;
      window.clearTimeout(this.pulseTimers[action]);
    });
    this.esp32State.forward = false;
    this.esp32State.backward = false;
    this.esp32State.left = false;
    this.esp32State.right = false;
    this.notifyListeners();
  }

  onChange(callback) {
    this.listeners.push(callback);
  }

  notifyListeners() {
    const combined = this.getCombinedState();
    this.listeners.forEach(cb => cb(combined, this.keyboardState, this.esp32State));
  }
}

window.InputManager = InputManager;
