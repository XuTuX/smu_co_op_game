/** Browser WebSocket client with A/B/C channel routing and legacy support. */
class NetworkClient {
  constructor(inputManager, onEsp32StatusChange) {
    this.inputManager = inputManager;
    this.onEsp32StatusChange = onEsp32StatusChange;
    this.socket = null;
    this.reconnectTimeout = null;
    this.isServerConnected = false;
    this.isEsp32Connected = false;
    this.isLocalFile = window.location.protocol === 'file:';
    this.isDirectEsp32 = this.isLocalFile || window.location.hostname === '192.168.4.1';
    this.selectedChannel = NetworkClient.getSelectedChannel(window.location.search);
    // Diagnostics pages set this to true so the hub keeps sending every channel.
    // Game pages leave it false and only receive their own channel's input.
    this.receiveAllChannels = false;
    this.channelStates = {
      A: NetworkClient.emptyInput(),
      B: NetworkClient.emptyInput(),
      C: NetworkClient.emptyInput()
    };
    this.systemStatus = { hub: false, controller: false, controllerId: 1 };
    this.installChannelSelector();
    this.preserveChannelLinks();
  }

  static emptyInput() {
    return { forward: false, backward: false, left: false, right: false };
  }

  static normalizeChannel(channel) {
    const normalized = String(channel || '').toUpperCase();
    return ['A', 'B', 'C'].includes(normalized) ? normalized : 'A';
  }

  static getSelectedChannel(search) {
    const params = new URLSearchParams(search || '');
    return NetworkClient.normalizeChannel(params.get('channel'));
  }

  installChannelSelector() {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function' ||
        typeof document.createElement !== 'function') return;
    const fileName = String(window.location.pathname || '').split('/').pop().toLowerCase();
    if (fileName === 'button-test.html') return;
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions || document.getElementById('game-channel-select')) return;

    const label = document.createElement('label');
    label.className = 'channel-picker';
    label.htmlFor = 'game-channel-select';
    label.append('채널 ');
    const select = document.createElement('select');
    select.id = 'game-channel-select';
    select.setAttribute('aria-label', '이 게임에서 사용할 ESP32 버튼 채널');
    for (const channel of ['A', 'B', 'C']) {
      const option = document.createElement('option');
      option.value = channel;
      option.textContent = channel;
      option.selected = channel === this.selectedChannel;
      select.appendChild(option);
    }
    select.addEventListener('change', () => {
      const url = new URL(window.location.href);
      url.searchParams.set('channel', NetworkClient.normalizeChannel(select.value));
      window.location.href = url.href;
    });
    label.appendChild(select);
    headerActions.insertBefore(label, headerActions.firstChild);
  }

  preserveChannelLinks() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('a[href]').forEach((link) => {
      const rawHref = link.getAttribute('href');
      if (!rawHref || rawHref.startsWith('#') || /^[a-z]+:/i.test(rawHref)) return;
      try {
        const url = new URL(rawHref, window.location.href);
        if (url.origin !== window.location.origin || !url.pathname.endsWith('.html')) return;
        if (!url.searchParams.has('channel')) url.searchParams.set('channel', this.selectedChannel);
        link.setAttribute('href', `${url.pathname.split('/').pop()}${url.search}${url.hash}`);
      } catch (_) {}
    });
  }

  notifyStatus() {
    this.isEsp32Connected = Boolean(this.systemStatus.controller);
    if (this.onEsp32StatusChange) {
      this.onEsp32StatusChange(this.isEsp32Connected, { ...this.systemStatus });
    }
  }

  resetInputs() {
    for (const channel of ['A', 'B', 'C']) {
      this.channelStates[channel] = NetworkClient.emptyInput();
      if (this.inputManager && typeof this.inputManager.setChannelInput === 'function') {
        this.inputManager.setChannelInput(channel, this.channelStates[channel], null);
      }
    }
    if (this.inputManager && typeof this.inputManager.setEsp32Input === 'function') {
      this.inputManager.setEsp32Input(NetworkClient.emptyInput());
    }
  }

  routeInput(message) {
    const channel = NetworkClient.normalizeChannel(message.channel);
    const data = {
      forward: Boolean(message.data && message.data.forward),
      backward: Boolean(message.data && message.data.backward),
      left: Boolean(message.data && message.data.left),
      right: Boolean(message.data && message.data.right)
    };
    this.channelStates[channel] = data;

    if (this.inputManager && typeof this.inputManager.setChannelInput === 'function') {
      this.inputManager.setChannelInput(channel, data, message);
    }
    if (channel === this.selectedChannel && this.inputManager &&
        typeof this.inputManager.setEsp32Input === 'function') {
      this.inputManager.setEsp32Input(data);
    }
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)) return;

    const protocol = !this.isDirectEsp32 && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = this.isDirectEsp32
      ? '192.168.4.1:81'
      : (window.location.host || 'localhost:3000');
    const wsUrl = `${protocol}//${host}`;
    console.log(`[Network] Connecting to ${wsUrl} for channel ${this.selectedChannel}`);

    try {
      this.socket = new WebSocket(wsUrl);
      this.socket.onopen = () => {
        this.isServerConnected = true;
        // Legacy direct firmware has no system_status packet, so retain its
        // historical behavior until a Hub status packet supplies B's status.
        if (this.isDirectEsp32) {
          this.systemStatus = { hub: true, controller: true, controllerId: 1 };
          this.notifyStatus();
        }
        this.send({
          type: 'register',
          role: 'browser',
          channel: this.receiveAllChannels ? '*' : this.selectedChannel
        });
      };

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'system_status') {
            this.systemStatus = {
              hub: Boolean(message.hub),
              controller: Boolean(message.controller),
              controllerId: Number(message.controllerId) || 1
            };
            this.notifyStatus();
          } else if (message.type === 'esp32_status') {
            const connected = Boolean(message.connected);
            this.systemStatus = { hub: connected, controller: connected, controllerId: 1 };
            this.notifyStatus();
          } else if (message.type === 'input') {
            this.routeInput(message);
          } else if (message.type === 'ping') {
            this.send({ type: 'pong', timestamp: Date.now() });
          }
        } catch (_) {
          console.warn('[Network] Received invalid JSON payload');
        }
      };

      this.socket.onclose = () => {
        this.isServerConnected = false;
        this.systemStatus = { hub: false, controller: false, controllerId: 1 };
        this.resetInputs();
        this.notifyStatus();
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => this.connect(), 1000);
      };

      this.socket.onerror = () => this.socket.close();
    } catch (_) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = setTimeout(() => this.connect(), 1000);
    }
  }

  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }
}

window.NetworkClient = NetworkClient;
