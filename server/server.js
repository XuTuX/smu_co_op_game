const http = require('http');
const path = require('path');
const os = require('os');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;
const ESP32_WS_URL = process.env.ESP32_WS_URL || 'ws://192.168.4.1:81';
const ESP32_RECONNECT_MS = 2500;
const ESP32_CONNECT_TIMEOUT_MS = 5000;
const ESP32_TIMEOUT_MS = 6000;
const app = express();

// Serve static client files
const clientPath = path.join(__dirname, '..', 'client');
const assetPath = path.join(__dirname, '..', 'assets');
app.use('/assets', express.static(assetPath));
app.use(express.static(clientPath));

// API endpoint to get server info / IP for easy setup
app.get('/api/info', (req, res) => {
  res.json({
    status: 'running',
    port: PORT,
    esp32WebSocketUrl: ESP32_WS_URL,
    localIps: getLocalIpAddresses()
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Track connected clients
const browserClients = new Set();
let esp32Socket = null;
let esp32LastSeen = 0;
let esp32ReconnectTimer = null;

// Get local IPv4 addresses for user convenience
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ interface: name, address: iface.address });
      }
    }
  }
  return addresses;
}

// Broadcast message to all connected browser clients
function broadcastToBrowsers(messageObj) {
  const messageStr = JSON.stringify(messageObj);
  for (const client of browserClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  }
}

// Notify browsers about ESP32 connection state
function updateEsp32Status(connected) {
  broadcastToBrowsers({
    type: 'esp32_status',
    connected: connected,
    timestamp: Date.now()
  });
}

// Sanitize & validate input payload
function sanitizeInput(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    forward: Boolean(data.forward),
    backward: Boolean(data.backward),
    left: Boolean(data.left),
    right: Boolean(data.right)
  };
}

function isEsp32Connected() {
  return esp32Socket !== null && esp32Socket.readyState === WebSocket.OPEN;
}

function handleEsp32Payload(payload, ws, sourceLabel) {
  const wasConnected = isEsp32Connected();
  esp32Socket = ws;
  esp32LastSeen = Date.now();

  if (!wasConnected) {
    console.log(`[ESP32 AP] Connected via ${sourceLabel}`);
    updateEsp32Status(true);
  }

  if (payload.type === 'input' || ('forward' in payload && 'backward' in payload)) {
    const rawInput = payload.type === 'input' ? payload.data : payload;
    const sanitized = sanitizeInput(rawInput);
    if (sanitized) {
      broadcastToBrowsers({
        type: 'input',
        source: 'esp32',
        data: sanitized,
        timestamp: Date.now()
      });
    }
    return;
  }

  if (payload.type === 'ping' && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
  }
}

function scheduleEsp32Reconnect() {
  if (esp32ReconnectTimer) return;
  esp32ReconnectTimer = setTimeout(() => {
    esp32ReconnectTimer = null;
    connectToEsp32AccessPoint();
  }, ESP32_RECONNECT_MS);
}

// In AP mode the ESP32 owns the fixed address, so the PC server connects to it.
function connectToEsp32AccessPoint() {
  if (esp32Socket &&
      (esp32Socket.readyState === WebSocket.OPEN || esp32Socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const ws = new WebSocket(ESP32_WS_URL);
  esp32Socket = ws;
  const connectionTimer = setTimeout(() => {
    if (ws.readyState === WebSocket.CONNECTING) {
      console.log('[ESP32 AP] Connection timed out; waiting to retry...');
      ws.terminate();
    }
  }, ESP32_CONNECT_TIMEOUT_MS);

  ws.on('open', () => {
    clearTimeout(connectionTimer);
    esp32LastSeen = Date.now();
    console.log(`[ESP32 AP] WebSocket connected: ${ESP32_WS_URL}`);
    updateEsp32Status(true);
    ws.send(JSON.stringify({ type: 'register', role: 'node_server' }));
  });

  ws.on('message', (messageBuffer) => {
    try {
      handleEsp32Payload(JSON.parse(messageBuffer.toString()), ws, ESP32_WS_URL);
    } catch (err) {
      console.warn('[ESP32 AP] Ignored invalid JSON packet');
    }
  });

  ws.on('close', () => {
    clearTimeout(connectionTimer);
    if (esp32Socket === ws) {
      esp32Socket = null;
      updateEsp32Status(false);
      console.log('[ESP32 AP] Disconnected; waiting to reconnect...');
    }
    scheduleEsp32Reconnect();
  });

  ws.on('error', () => {
    // The close handler schedules a retry. This is expected until the PC joins the ESP32 AP.
  });
}

wss.on('connection', (ws, req) => {
  const remoteIp = req.socket.remoteAddress;
  let clientRole = 'unknown';

  console.log(`[WS] New connection from ${remoteIp}`);

  ws.on('message', (messageBuffer) => {
    let messageText;
    try {
      messageText = messageBuffer.toString();
      const payload = JSON.parse(messageText);

      // 1. Role registration or detection
      if (payload.type === 'register') {
        if (payload.role === 'esp32') {
          clientRole = 'esp32';
          esp32Socket = ws;
          esp32LastSeen = Date.now();
          console.log(`[WS] ESP32 registered successfully from ${remoteIp}`);
          updateEsp32Status(true);
        } else if (payload.role === 'browser') {
          clientRole = 'browser';
          browserClients.add(ws);
          console.log(`[WS] Browser client connected (Total: ${browserClients.size})`);
          // Send immediate current ESP32 status to newly joined browser
          ws.send(JSON.stringify({
            type: 'esp32_status',
            connected: isEsp32Connected(),
            timestamp: Date.now()
          }));
        }
        return;
      }

      // 2. Handle ESP32 button input (either explicitly typed or auto-detected by schema)
      if (payload.type === 'input' || ('forward' in payload && 'backward' in payload)) {
        if (clientRole !== 'esp32') clientRole = 'esp32';
        handleEsp32Payload(payload, ws, `legacy inbound connection from ${remoteIp}`);
        return;
      }

      // 3. Heartbeat / ping from ESP32
      if (payload.type === 'ping') {
        if (clientRole === 'esp32') handleEsp32Payload(payload, ws, remoteIp);
      }

    } catch (err) {
      console.warn(`[WS] Invalid JSON payload from ${remoteIp}:`, messageText);
    }
  });

  ws.on('close', () => {
    if (clientRole === 'browser' || browserClients.has(ws)) {
      browserClients.delete(ws);
      console.log(`[WS] Browser client disconnected (Remaining: ${browserClients.size})`);
    } else if (clientRole === 'esp32' || ws === esp32Socket) {
      if (ws === esp32Socket) {
        esp32Socket = null;
        console.log(`[WS] ESP32 disconnected (${remoteIp})`);
        updateEsp32Status(false);
        scheduleEsp32Reconnect();
      }
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error on socket (${remoteIp}):`, err.message);
  });
});

// Watchdog interval to detect silent ESP32 disconnection
setInterval(() => {
  if (esp32Socket && esp32Socket.readyState === WebSocket.OPEN &&
      Date.now() - esp32LastSeen > ESP32_TIMEOUT_MS) {
    console.log('[WS] ESP32 connection timed out (no heartbeat or packets)');
    const staleSocket = esp32Socket;
    esp32Socket = null;
    updateEsp32Status(false);
    staleSocket.terminate();
    scheduleEsp32Reconnect();
  }
}, 1500);

server.listen(PORT, () => {
  console.log('========================================================');
  console.log(`🚌 ESP32 Cooperative Bus Parking Game Server Started!`);
  console.log(`🌐 Local Web Game URL: http://localhost:${PORT}`);
  console.log('📡 ESP32 AP: connect this computer to Wi-Fi "hihi"');
  console.log(`🔌 ESP32 WebSocket: ${ESP32_WS_URL}`);
  console.log('========================================================');
  connectToEsp32AccessPoint();
});
