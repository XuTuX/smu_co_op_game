class FourButtonTest {
  constructor() {
    this.actions = ['forward', 'backward', 'left', 'right'];
    this.labels = {
      forward: 'GPIO 4 · 전진/위',
      backward: 'GPIO 5 · 후진/아래',
      left: 'GPIO 6 · 왼쪽',
      right: 'GPIO 7 · 오른쪽'
    };
    this.state = this.emptyState();
    this.hasReceivedInput = false;
    this.pressCounts = this.emptyCount();
    this.totalPressCount = 0;
    this.packetCount = 0;
    this.simultaneousCount = 0;
    this.wasSimultaneous = false;
    this.maxLogEntries = 20;

    this.hardwareBadge = document.getElementById('test-hardware-badge');
    this.hardwareText = document.getElementById('test-hardware-text');
    this.connectionPanel = document.getElementById('connection-panel');
    this.connectionKicker = document.getElementById('connection-kicker');
    this.connectionTitle = document.getElementById('connection-title');
    this.connectionHelp = document.getElementById('connection-help');
    this.packetCountElement = document.getElementById('packet-count');
    this.totalPressCountElement = document.getElementById('total-press-count');
    this.simultaneousCountElement = document.getElementById('simultaneous-count');
    this.lastInputTimeElement = document.getElementById('last-input-time');
    this.log = document.getElementById('input-log');

    const inputReceiver = { setEsp32Input: (data) => this.handleInput(data) };
    this.network = new NetworkClient(inputReceiver, (connected) => this.handleConnection(connected));

    document.getElementById('clear-log-btn').addEventListener('click', () => this.clearLog());
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
    this.hardwareText.textContent = connected ? 'ESP32 연결됨' : 'ESP32 연결 대기';
    this.connectionPanel.classList.toggle('connected', connected);
    this.connectionPanel.classList.toggle('waiting', !connected);
    this.connectionKicker.textContent = connected ? 'WEBSOCKET · CONNECTED' : 'WEBSOCKET · WAITING';
    this.connectionTitle.textContent = connected ? '네 버튼 입력 준비 완료' : 'ESP32 입력 연결 대기 중';
    this.connectionHelp.textContent = connected
      ? 'GPIO 4·5·6·7 버튼을 눌러 상태를 확인하세요.'
      : (this.network.isDirectEsp32
          ? 'ESP32 전원과 hihi Wi-Fi를 확인한 뒤 새로고침하세요.'
          : 'ESP32와 개발 서버 연결을 확인하세요.');

    if (!connected) {
      this.hasReceivedInput = false;
      this.state = this.emptyState();
      this.renderCards();
    }
  }

  handleInput(data) {
    const nextState = this.emptyState();
    for (const action of this.actions) nextState[action] = Boolean(data && data[action]);

    const now = new Date();
    const changedActions = this.actions.filter((action) =>
      !this.hasReceivedInput || nextState[action] !== this.state[action]
    );

    this.packetCount += 1;
    this.packetCountElement.textContent = String(this.packetCount);
    this.lastInputTimeElement.textContent = now.toLocaleTimeString('ko-KR', { hour12: false });

    for (const action of changedActions) {
      if (nextState[action]) {
        this.pressCounts[action] += 1;
        this.totalPressCount += 1;
        document.querySelector(`[data-press-count="${action}"]`).textContent = String(this.pressCounts[action]);
      }
      if (this.hasReceivedInput || nextState[action]) this.addActionLog(action, nextState[action], now);
    }

    const pressedActions = this.actions.filter((action) => nextState[action]);
    const isSimultaneous = pressedActions.length >= 2;
    if (isSimultaneous && !this.wasSimultaneous) {
      this.simultaneousCount += 1;
      this.simultaneousCountElement.textContent = String(this.simultaneousCount);
      this.addSimultaneousLog(pressedActions, now);
    }

    this.totalPressCountElement.textContent = String(this.totalPressCount);
    this.wasSimultaneous = isSimultaneous;
    this.hasReceivedInput = true;
    this.state = nextState;
    this.renderCards();
  }

  renderCards() {
    for (const action of this.actions) {
      const card = document.querySelector(`[data-input-action="${action}"]`);
      const pressed = this.state[action];
      card.classList.toggle('pressed', pressed);
      card.querySelector('.button-state').textContent = pressed ? '눌림 · LOW' : '떼짐 · HIGH';
    }
  }

  addActionLog(action, pressed, time) {
    this.removeEmptyLog();
    const item = document.createElement('li');
    item.className = pressed ? 'event-pressed' : 'event-released';
    const message = document.createElement('span');
    message.textContent = `${pressed ? '● PRESSED' : '○ RELEASED'} · ${this.labels[action]} · ${action}: ${pressed}`;
    const timestamp = document.createElement('time');
    timestamp.textContent = time.toLocaleTimeString('ko-KR', { hour12: false });
    item.append(message, timestamp);
    this.log.prepend(item);
    this.trimLog();
  }

  addSimultaneousLog(actions, time) {
    this.removeEmptyLog();
    const item = document.createElement('li');
    item.className = 'event-simultaneous';
    const message = document.createElement('span');
    message.textContent = `◆ SIMULTANEOUS · ${actions.map((action) => this.labels[action]).join(' + ')}`;
    const timestamp = document.createElement('time');
    timestamp.textContent = time.toLocaleTimeString('ko-KR', { hour12: false });
    item.append(message, timestamp);
    this.log.prepend(item);
    this.trimLog();
  }

  removeEmptyLog() {
    const empty = this.log.querySelector('.empty-log');
    if (empty) empty.remove();
  }

  trimLog() {
    while (this.log.children.length > this.maxLogEntries) this.log.lastElementChild.remove();
  }

  clearLog() {
    this.log.replaceChildren();
    const empty = document.createElement('li');
    empty.className = 'empty-log';
    empty.textContent = '기록이 비어 있습니다.';
    this.log.appendChild(empty);
  }
}

window.addEventListener('DOMContentLoaded', () => new FourButtonTest());
