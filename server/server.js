const http = require('http');
const path = require('path');
const os = require('os');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;
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
    localIps: getLocalIpAddresses()
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Track connected clients
const browserClients = new Set();
let esp32Socket = null;
let esp32LastSeen = 0;
const ESP32_TIMEOUT_MS = 4000;

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
          const isEspConnected = esp32Socket !== null && esp32Socket.readyState === WebSocket.OPEN;
          ws.send(JSON.stringify({
            type: 'esp32_status',
            connected: isEspConnected,
            timestamp: Date.now()
          }));
        }
        return;
      }

      // 2. Handle ESP32 button input (either explicitly typed or auto-detected by schema)
      if (payload.type === 'input' || ('forward' in payload && 'backward' in payload)) {
        const rawInput = payload.type === 'input' ? payload.data : payload;
        const sanitized = sanitizeInput(rawInput);

        if (sanitized) {
          // If not registered explicitly yet, auto-detect as ESP32
          if (clientRole !== 'esp32') {
            clientRole = 'esp32';
            esp32Socket = ws;
            console.log(`[WS] Auto-registered ESP32 from input payload (${remoteIp})`);
            updateEsp32Status(true);
          }
          esp32LastSeen = Date.now();

          // Relay input to all browsers
          broadcastToBrowsers({
            type: 'input',
            source: 'esp32',
            data: sanitized,
            timestamp: Date.now()
          });
        }
        return;
      }

      // 3. Heartbeat / ping from ESP32
      if (payload.type === 'ping') {
        if (clientRole === 'esp32') {
          esp32LastSeen = Date.now();
        }
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
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
      esp32Socket = null;
      console.log(`[WS] ESP32 disconnected (${remoteIp})`);
      updateEsp32Status(false);
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error on socket (${remoteIp}):`, err.message);
  });
});

// Watchdog interval to detect silent ESP32 disconnection
setInterval(() => {
  if (esp32Socket) {
    if (esp32Socket.readyState !== WebSocket.OPEN || (Date.now() - esp32LastSeen > ESP32_TIMEOUT_MS)) {
      console.log('[WS] ESP32 connection timed out (no heartbeat or packets)');
      esp32Socket = null;
      updateEsp32Status(false);
    }
  }
}, 1500);

server.listen(PORT, () => {
  console.log('========================================================');
  console.log(`🚌 ESP32 Cooperative Bus Parking Game Server Started!`);
  console.log(`🌐 Local Web Game URL: http://localhost:${PORT}`);
  console.log('📡 Use the following IP for your ESP32 configuration:');
  const ips = getLocalIpAddresses();
  if (ips.length > 0) {
    ips.forEach(item => {
      console.log(`   👉 ${item.interface}: http://${item.address}:${PORT} (Set SERVER_IP="${item.address}")`);
    });
  } else {
    console.log(`   👉 Set SERVER_IP to your computer's local Wi-Fi IP address`);
  }
  console.log('========================================================');
});
