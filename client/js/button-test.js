class FourButtonTest {
  constructor() {
    this.actions = ['forward', 'backward', 'left', 'right'];
    this.state = this.emptyState();
    this.hasReceivedInput = false;
    this.pressCounts = this.emptyCount();
    this.hardwareBadge = document.getElementById('test-hardware-badge');
    this.hardwareText = document.getElementById('test-hardware-text');
    this.connectionPanel = document.getElementById('connection-panel');
    this.connectionTitle = document.getElementById('connection-title');

    const inputReceiver = { setEsp32Input: (data) => this.handleInput(data) };
    this.network = new NetworkClient(inputReceiver, (connected) => this.handleConnection(connected));

    this.network.connect();
  }

  emptyState() {
    return { forward: false, backward: false, left: false, right: false };
  }

  emptyCount() {
    return { forward: 0, backward: 0, left: 0, right: 0 };
  }

  handleConnection(connected) {
    this.hardwareBadge.classList.toggle('connected', connected);
    this.hardwareBadge.classList.toggle('disconnected', !connected);
    this.hardwareText.textContent = connected ? 'ESP32' : '연결 대기';
    this.connectionPanel.classList.toggle('connected', connected);
    this.connectionPanel.classList.toggle('waiting', !connected);
    this.connectionTitle.textContent = connected ? '버튼을 눌러보세요' : 'ESP32 연결 대기';

    if (!connected) {
      this.hasReceivedInput = false;
      this.state = this.emptyState();
      this.renderCards();
    }
  }

  handleInput(data) {
    const nextState = this.emptyState();
    for (const action of this.actions) nextState[action] = Boolean(data && data[action]);

    const changedActions = this.actions.filter((action) =>
      !this.hasReceivedInput || nextState[action] !== this.state[action]
    );

    for (const action of changedActions) {
      if (nextState[action]) {
        this.pressCounts[action] += 1;
        document.querySelector(`[data-press-count="${action}"]`).textContent = String(this.pressCounts[action]);
      }
    }
    this.hasReceivedInput = true;
    this.state = nextState;
    this.renderCards();
  }

  renderCards() {
    for (const action of this.actions) {
      const card = document.querySelector(`[data-input-action="${action}"]`);
      const pressed = this.state[action];
      card.classList.toggle('pressed', pressed);
      card.querySelector('.button-state').textContent = pressed ? '눌림' : '대기';
    }
  }
}

window.addEventListener('DOMContentLoaded', () => new FourButtonTest());
