/**
 * End-to-End Simulation Test for WebSocket Server, ESP32 Controller, and Web Browser
 */
const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const TEST_PORT = 3199;

// Spin up a test server instance
const app = express();
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
app.use(express.static(path.join(__dirname, '..', 'client')));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const browserClients = new Set();
let esp32Socket = null;
let esp32LastSeen = 0;

function broadcastToBrowsers(messageObj) {
  const messageStr = JSON.stringify(messageObj);
  for (const client of browserClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  }
}

function updateEsp32Status(connected) {
  broadcastToBrowsers({
    type: 'esp32_status',
    connected: connected,
    timestamp: Date.now()
  });
}

wss.on('connection', (ws) => {
  let clientRole = 'unknown';

  ws.on('message', (messageBuffer) => {
    try {
      const payload = JSON.parse(messageBuffer.toString());

      if (payload.type === 'register') {
        if (payload.role === 'esp32') {
          clientRole = 'esp32';
          esp32Socket = ws;
          esp32LastSeen = Date.now();
          updateEsp32Status(true);
        } else if (payload.role === 'browser') {
          clientRole = 'browser';
          browserClients.add(ws);
          const isEspConnected = esp32Socket !== null && esp32Socket.readyState === WebSocket.OPEN;
          ws.send(JSON.stringify({
            type: 'esp32_status',
            connected: isEspConnected,
            timestamp: Date.now()
          }));
        }
        return;
      }

      if (payload.type === 'input') {
        broadcastToBrowsers({
          type: 'input',
          source: 'esp32',
          data: payload.data,
          timestamp: Date.now()
        });
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    if (clientRole === 'browser') {
      browserClients.delete(ws);
    } else if (clientRole === 'esp32') {
      esp32Socket = null;
      updateEsp32Status(false);
    }
  });
});

async function runTest() {
  await new Promise(resolve => server.listen(TEST_PORT, resolve));
  console.log(`[TEST] Test server started on port ${TEST_PORT}`);

  const assetResponse = await new Promise((resolve, reject) => {
    http.get(`http://localhost:${TEST_PORT}/assets/charcter_movement/stay.png`, (response) => {
      response.resume();
      response.on('end', () => resolve(response));
    }).on('error', reject);
  });
  if (assetResponse.statusCode !== 200 || assetResponse.headers['content-type'] !== 'image/png') {
    throw new Error(`Expected player asset PNG, got ${assetResponse.statusCode} ${assetResponse.headers['content-type']}`);
  }
  console.log('✅ TEST PASSED: obstacle-dodge character asset is served');

  const buttonTestHtml = await new Promise((resolve, reject) => {
    http.get(`http://localhost:${TEST_PORT}/button-test.html`, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body }));
    }).on('error', reject);
  });
  if (buttonTestHtml.statusCode !== 200 || !buttonTestHtml.body.includes('ESP32 버튼 4개 실시간 상태')) {
    throw new Error(`Expected four-button test page, got HTTP ${buttonTestHtml.statusCode}`);
  }
  console.log('✅ TEST PASSED: standalone four-button test page is served');

  const jumpRopeHtml = await new Promise((resolve, reject) => {
    http.get(`http://localhost:${TEST_PORT}/jump-rope.html`, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body }));
    }).on('error', reject);
  });
  if (jumpRopeHtml.statusCode !== 200 || !jumpRopeHtml.body.includes('4명이 각자 뛰는')) {
    throw new Error(`Expected team jump-rope page, got HTTP ${jumpRopeHtml.statusCode}`);
  }
  console.log('✅ TEST PASSED: four-player jump-rope page is served');

  // 1. Connect Browser Client
  const browserWs = new WebSocket(`ws://localhost:${TEST_PORT}`);
  let espStatusReceived = null;
  let inputRelayed = null;

  await new Promise((resolve) => {
    browserWs.on('open', () => {
      console.log('[TEST] Browser connected and registering...');
      browserWs.send(JSON.stringify({ type: 'register', role: 'browser' }));
      resolve();
    });
  });

  browserWs.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('[TEST] Browser received message:', msg);
    if (msg.type === 'esp32_status') {
      espStatusReceived = msg.connected;
    }
    if (msg.type === 'input') {
      inputRelayed = msg.data;
    }
  });

  // Wait a moment
  await new Promise(r => setTimeout(r, 200));

  // 2. Connect ESP32 Client
  const esp32Ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
  await new Promise((resolve) => {
    esp32Ws.on('open', () => {
      console.log('[TEST] ESP32 connected and registering...');
      esp32Ws.send(JSON.stringify({ type: 'register', role: 'esp32' }));
      resolve();
    });
  });

  await new Promise(r => setTimeout(r, 300));
  if (espStatusReceived !== true) {
    throw new Error(`Expected esp32_status to be true, got: ${espStatusReceived}`);
  }
  console.log('✅ TEST PASSED: ESP32 connection status communicated to browser');

  // 3. ESP32 sends 4-button simultaneous input
  const testInput = { forward: true, backward: false, left: true, right: false };
  esp32Ws.send(JSON.stringify({ type: 'input', data: testInput }));

  await new Promise(r => setTimeout(r, 300));
  if (!inputRelayed || inputRelayed.forward !== true || inputRelayed.left !== true) {
    throw new Error(`Expected input relay to match, got: ${JSON.stringify(inputRelayed)}`);
  }
  console.log('✅ TEST PASSED: 4-button simultaneous input successfully relayed to browser');

  // 4. ESP32 Disconnect test
  esp32Ws.close();
  await new Promise(r => setTimeout(r, 300));
  if (espStatusReceived !== false) {
    throw new Error(`Expected esp32_status to be false after disconnect, got: ${espStatusReceived}`);
  }
  console.log('✅ TEST PASSED: ESP32 disconnection detected and reported to browser');

  browserWs.close();
  server.close();
  console.log('\n🎉 ALL AUTOMATED TESTS COMPLETED SUCCESSFULLY!');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
