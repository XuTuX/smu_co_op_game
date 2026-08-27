/**
 * WebSocket Network Client for Browser <-> Node.js Server Communication
 */
class NetworkClient {
  constructor(inputManager, onEsp32StatusChange) {
    this.inputManager = inputManager;
    this.onEsp32StatusChange = onEsp32StatusChange;

    this.socket = null;
    this.reconnectTimeout = null;
    this.isServerConnected = false;
    this.isEsp32Connected = false;
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:3000';
    const wsUrl = `${protocol}//${host}`;

    console.log(`[Network] Connecting to WebSocket server at ${wsUrl}...`);

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('[Network] Connected to Node.js WebSocket Server');
        this.isServerConnected = true;

        // Register as browser client
        this.send({
          type: 'register',
          role: 'browser'
        });
      };

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'esp32_status') {
            this.isEsp32Connected = Boolean(message.connected);
            if (this.onEsp32StatusChange) {
              this.onEsp32StatusChange(this.isEsp32Connected);
            }
          } else if (message.type === 'input') {
            // ESP32 input payload relayed through server
            this.inputManager.setEsp32Input(message.data);
          }
        } catch (err) {
          console.warn('[Network] Received non-JSON message:', event.data);
        }
      };

      this.socket.onclose = () => {
        console.log('[Network] WebSocket disconnected. Reconnecting in 2 seconds...');
        this.isServerConnected = false;
        this.isEsp32Connected = false;
        if (this.onEsp32StatusChange) {
          this.onEsp32StatusChange(false);
        }

        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => this.connect(), 2000);
      };

      this.socket.onerror = (err) => {
        console.warn('[Network] WebSocket error');
        this.socket.close();
      };
    } catch (e) {
      console.error('[Network] Connection failed:', e);
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = setTimeout(() => this.connect(), 2000);
    }
  }

  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }
}

window.NetworkClient = NetworkClient;
