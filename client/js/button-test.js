class GpioButtonTest {
  constructor() {
    this.panel = document.getElementById('button-live-panel');
    this.stateKicker = document.getElementById('button-state-kicker');
    this.stateText = document.getElementById('button-state-text');
    this.stateHelp = document.getElementById('button-state-help');
    this.pressCountElement = document.getElementById('press-count');
    this.packetCountElement = document.getElementById('packet-count');
    this.lastInputTimeElement = document.getElementById('last-input-time');
    this.hardwareBadge = document.getElementById('test-hardware-badge');
    this.hardwareText = document.getElementById('test-hardware-text');
    this.log = document.getElementById('input-log');

    this.isPressed = false;
    this.hasReceivedInput = false;
    this.pressCount = 0;
    this.packetCount = 0;
    this.maxLogEntries = 12;

    const inputReceiver = {
      setEsp32Input: (data) => this.handleInput(data)
    };
    this.network = new NetworkClient(inputReceiver, (connected) => this.handleConnection(connected));

    document.getElementById('clear-log-btn').addEventListener('click', () => this.clearLog());
    this.setWaitingState();
    this.network.connect();
  }

  handleConnection(connected) {
    this.hardwareBadge.classList.toggle('connected', connected);
    this.hardwareBadge.classList.toggle('disconnected', !connected);
    this.hardwareText.textContent = connected ? 'ESP32 연결됨' : 'ESP32 연결 대기';

    if (!connected) {
      this.hasReceivedInput = false;
      this.setWaitingState();
    }
  }

  handleInput(data) {
    const nextPressed = Boolean(data && data.forward);
    const now = new Date();

    this.packetCount += 1;
    this.packetCountElement.textContent = String(this.packetCount);
    this.lastInputTimeElement.textContent = now.toLocaleTimeString('ko-KR', { hour12: false });

    if (!this.hasReceivedInput || nextPressed !== this.isPressed) {
      if (nextPressed) {
        this.pressCount += 1;
        this.pressCountElement.textContent = String(this.pressCount);
      }
      this.addLog(nextPressed, now);
    }

    this.hasReceivedInput = true;
    this.isPressed = nextPressed;
    this.renderButtonState();
  }

  renderButtonState() {
    this.panel.classList.remove('waiting', 'pressed', 'released');
    this.panel.classList.add(this.isPressed ? 'pressed' : 'released');
    this.stateKicker.textContent = this.isPressed ? 'INPUT_PULLUP · LOW' : 'INPUT_PULLUP · HIGH';
    this.stateText.textContent = this.isPressed ? '버튼 눌림!' : '버튼 떼짐';
    this.stateHelp.textContent = this.isPressed
      ? 'GPIO 4 입력이 정상적으로 수신되고 있습니다.'
      : '버튼을 누르면 GPIO 4가 GND와 연결됩니다.';
  }

  setWaitingState() {
    this.isPressed = false;
    this.panel.classList.remove('pressed', 'released');
    this.panel.classList.add('waiting');
    this.stateKicker.textContent = 'WEBSOCKET · WAITING';
    this.stateText.textContent = '연결 대기 중';
    this.stateHelp.textContent = this.network && this.network.isDirectEsp32
      ? 'ESP32 전원과 hihi Wi-Fi를 확인한 뒤 페이지를 새로고침하세요.'
      : 'ESP32 전원, hihi Wi-Fi, Node.js 개발 서버를 확인하세요.';
  }

  addLog(pressed, time) {
    const empty = this.log.querySelector('.empty-log');
    if (empty) empty.remove();

    const item = document.createElement('li');
    item.className = pressed ? 'event-pressed' : 'event-released';

    const state = document.createElement('span');
    state.textContent = pressed ? '● PRESSED · forward: true' : '○ RELEASED · forward: false';
    const timestamp = document.createElement('time');
    timestamp.textContent = time.toLocaleTimeString('ko-KR', { hour12: false });
    item.append(state, timestamp);
    this.log.prepend(item);

    while (this.log.children.length > this.maxLogEntries) {
      this.log.lastElementChild.remove();
    }
  }

  clearLog() {
    this.log.replaceChildren();
    const empty = document.createElement('li');
    empty.className = 'empty-log';
    empty.textContent = '기록이 비어 있습니다.';
    this.log.appendChild(empty);
  }
}

window.addEventListener('DOMContentLoaded', () => new GpioButtonTest());
