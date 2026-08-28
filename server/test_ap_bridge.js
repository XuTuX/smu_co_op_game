/**
 * Integration test for the ESP32 SoftAP architecture:
 * fake ESP32 WebSocket server <- Node bridge -> browser client.
 */
const http = require('http');
const { spawn } = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');

const APP_PORT = 3201;
const ESP32_PORT = 3202;
const ESP32_URL = `ws://127.0.0.1:${ESP32_PORT}`;

function waitFor(check, description, timeoutMs = 4000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (check()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for ${description}`));
      }
    }, 25);
  });
}

async function runTest() {
  const fakeEspHttp = http.createServer();
  const fakeEspWss = new WebSocketServer({ server: fakeEspHttp });
  let bridgeSocket = null;
  fakeEspWss.on('connection', (ws) => {
    bridgeSocket = ws;
  });
  await new Promise((resolve) => fakeEspHttp.listen(ESP32_PORT, '127.0.0.1', resolve));

  const serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      ESP32_WS_URL: ESP32_URL
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverOutput = '';
  serverProcess.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
  serverProcess.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

  let browserWs = null;
  try {
    await waitFor(
      () => serverOutput.includes(`Local Web Game URL: http://localhost:${APP_PORT}`),
      'Node bridge startup'
    );
    await waitFor(() => bridgeSocket && bridgeSocket.readyState === WebSocket.OPEN, 'ESP32 bridge connection');

    browserWs = new WebSocket(`ws://127.0.0.1:${APP_PORT}`);
    let esp32Connected = null;
    let relayedInput = null;

    browserWs.on('message', (data) => {
      const payload = JSON.parse(data.toString());
      if (payload.type === 'esp32_status') esp32Connected = payload.connected;
      if (payload.type === 'input') relayedInput = payload.data;
    });

    await new Promise((resolve, reject) => {
      browserWs.once('open', resolve);
      browserWs.once('error', reject);
    });
    browserWs.send(JSON.stringify({ type: 'register', role: 'browser' }));
    await waitFor(() => esp32Connected === true, 'browser ESP32-connected status');

    bridgeSocket.send(JSON.stringify({
      type: 'input',
      data: { forward: true, backward: false, left: true, right: false }
    }));
    await waitFor(() => relayedInput && relayedInput.forward && relayedInput.left, 'button input relay');

    bridgeSocket.close();
    await waitFor(() => esp32Connected === false, 'browser ESP32-disconnected status');
    console.log('✅ ESP32 SOFTAP BRIDGE TEST PASSED: AP input and status relay work end-to-end');
  } finally {
    if (browserWs) browserWs.close();
    serverProcess.kill('SIGTERM');
    await new Promise((resolve) => fakeEspHttp.close(resolve));
  }
}

runTest().catch((err) => {
  console.error('❌ ESP32 SoftAP bridge test failed:', err.message);
  process.exit(1);
});
