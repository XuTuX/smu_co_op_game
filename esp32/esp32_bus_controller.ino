/**
 * ============================================================================
 * ESP32 4-Button Cooperative Bus Parking Controller (Arduino IDE Sketch)
 * ============================================================================
 * 
 * 4 Physical Buttons with Hardware Debouncing & Real-Time WebSocket Communication:
 * - Button 1 (Forward): Accelerate bus forward
 * - Button 2 (Backward): Accelerate bus in reverse / Brake
 * - Button 3 (Left): Turn front wheels left
 * - Button 4 (Right): Turn front wheels right
 * 
 * Required Arduino IDE Libraries (Install via Library Manager):
 * 1. WebSockets by Markus Sattler (v2.4.1 or higher)
 * 2. ArduinoJson by Benoit Blanchon (v7.0.0 or higher)
 * 
 * Wiring (INPUT_PULLUP - No external resistors needed!):
 * - GPIO PIN ---- [BUTTON SWITCH] ---- GND
 * 
 * Default Safe Pins:
 * - Standard ESP32: GPIO 25 (FWD), GPIO 26 (BWD), GPIO 27 (LEFT), GPIO 14 (RIGHT)
 * - ESP32-S3:       GPIO 4 (FWD),  GPIO 5 (BWD),  GPIO 6 (LEFT),  GPIO 7 (RIGHT)
 * ============================================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <LittleFS.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>

// ============================================================================
// 1. USER CONFIGURATION (ESP32 ACCESS POINT)
// ============================================================================
const char* AP_SSID     = "hihi";
const char* AP_PASSWORD = "12345678"; // WPA2 password must be at least 8 characters
const uint8_t AP_CHANNEL = 1;
const uint8_t AP_MAX_CLIENTS = 4;
const uint16_t WEBSOCKET_PORT = 81;

// Hardware-test mode: open the 4-button test page at the root URL.
// On a standard ESP32 it also maps Forward/P1 to GPIO 4 for a one-button bench test.
#define BUTTON_TEST_MODE 1

const IPAddress AP_IP(192, 168, 4, 1);
const IPAddress AP_GATEWAY(192, 168, 4, 1);
const IPAddress AP_SUBNET(255, 255, 255, 0);

// ============================================================================
// 2. GPIO PIN ASSIGNMENTS
// ============================================================================
#if BUTTON_TEST_MODE
  #define PIN_FORWARD   4
  #if defined(CONFIG_IDF_TARGET_ESP32S3)
    #define PIN_BACKWARD  5
    #define PIN_LEFT      6
    #define PIN_RIGHT     7
  #else
    #define PIN_BACKWARD  26
    #define PIN_LEFT      27
    #define PIN_RIGHT     14
  #endif
#elif defined(CONFIG_IDF_TARGET_ESP32S3)
  // Recommended Safe GPIOs for ESP32-S3
  #define PIN_FORWARD   4
  #define PIN_BACKWARD  5
  #define PIN_LEFT      6
  #define PIN_RIGHT     7
#else
  // Recommended Safe GPIOs for standard ESP32 (DevKit)
  #define PIN_FORWARD   25
  #define PIN_BACKWARD  26
  #define PIN_LEFT      27
  #define PIN_RIGHT     14
#endif

// Debounce & Heartbeat Settings
const unsigned long DEBOUNCE_DELAY_MS = 35; // 35ms debounce threshold
const unsigned long HEARTBEAT_INTERVAL_MS = 2000; // Ping server every 2s

// ============================================================================
// 3. DATA STRUCTURES & GLOBALS
// ============================================================================
struct Button {
  const char* name;
  uint8_t pin;
  bool isPressed;              // Current confirmed state (true = pressed)
  bool lastRawState;           // Previous instantaneous reading
  unsigned long lastDebounce;  // Last timestamp reading changed
};

Button buttons[] = {
  { "Forward",  PIN_FORWARD,  false, HIGH, 0 },
  { "Backward", PIN_BACKWARD, false, HIGH, 0 },
  { "Left",     PIN_LEFT,     false, HIGH, 0 },
  { "Right",    PIN_RIGHT,    false, HIGH, 0 }
};

const size_t NUM_BUTTONS = sizeof(buttons) / sizeof(buttons[0]);

WebSocketsServer webSocket(WEBSOCKET_PORT);
WebServer httpServer(80);
DNSServer dnsServer;
uint8_t wsClientCount = 0;
bool fileSystemReady = false;
unsigned long lastHeartbeatTime = 0;
unsigned long lastWifiCheckTime = 0;

const char FALLBACK_TEST_PAGE[] PROGMEM = R"rawliteral(
<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP32 4 Button Test</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff5db;color:#28231f;font-family:system-ui,sans-serif}.card{width:min(94%,760px);border:3px solid;border-radius:24px;padding:28px;background:#fffdf7;box-shadow:9px 10px 0 #28231f;text-align:center}h1{font-size:clamp(30px,8vw,54px);margin:8px 0}.badge{display:inline-block;border:2px solid;border-radius:999px;padding:7px 12px;font-weight:900}.buttons{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:24px 0}.key{border:3px solid;border-radius:18px;padding:20px 8px;background:#eee;font-size:18px;font-weight:900}.key.on{background:#89d79a;transform:translate(2px,2px)}.state{font-size:24px;font-weight:950}.small{color:#766d62;font-weight:700}.links{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:24px}.links a{color:inherit;border:2px solid;border-radius:999px;padding:9px 13px;text-decoration:none;font-weight:900}</style></head>
<body><main class="card"><span id="net" class="badge">연결 중</span><h1>버튼 4개 테스트</h1><p class="small">GPIO 4·5·6·7 버튼을 하나씩 또는 동시에 눌러보세요.</p><div class="buttons"><div id="forward" class="key">GPIO 4<br>전진 / 위</div><div id="backward" class="key">GPIO 5<br>후진 / 아래</div><div id="left" class="key">GPIO 6<br>왼쪽</div><div id="right" class="key">GPIO 7<br>오른쪽</div></div><div id="state" class="state">입력 대기</div><nav class="links"><a href="/button-test.html">버튼 연습</a><a href="/index.html">버스 주차</a><a href="/traffic.html">장애물 피하기</a><a href="/jump-rope.html">단체 줄넘기</a><a href="/beat-jump.html">타이밍 점프</a></nav></main>
<script>const net=document.getElementById('net'),state=document.getElementById('state'),actions=['forward','backward','left','right'];const ws=new WebSocket('ws://'+location.hostname+':81');ws.onopen=()=>net.textContent='ESP32 연결됨';ws.onclose=()=>{net.textContent='연결 끊김';state.textContent='재연결 필요'};ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='input'){const on=actions.filter(a=>{const p=!!m.data[a];document.getElementById(a).classList.toggle('on',p);return p});state.textContent=on.length?on.join(' + ')+' 눌림':'모든 버튼 떼짐'}else if(m.type==='ping')ws.send(JSON.stringify({type:'pong'}))}catch(_){}};</script></body></html>
)rawliteral";

// ============================================================================
// 4. WEBSOCKET & NETWORK FUNCTIONS
// ============================================================================

// Send button state to every server/browser connected to the ESP32 AP
void sendButtonState() {
  if (wsClientCount == 0) return;

  JsonDocument doc;
  doc["type"] = "input";
  JsonObject data = doc["data"].to<JsonObject>();
  data["forward"]  = buttons[0].isPressed;
  data["backward"] = buttons[1].isPressed;
  data["left"]     = buttons[2].isPressed;
  data["right"]    = buttons[3].isPressed;

  String jsonString;
  serializeJson(doc, jsonString);
  webSocket.broadcastTXT(jsonString);

  // Serial debug print
  Serial.printf("[INPUT SENT] FWD: %d | BWD: %d | LFT: %d | RGT: %d\n",
    buttons[0].isPressed, buttons[1].isPressed, buttons[2].isPressed, buttons[3].isPressed);
}

// Send periodic heartbeat ping
void sendHeartbeat() {
  if (wsClientCount == 0) return;
  JsonDocument doc;
  doc["type"] = "ping";
  String jsonString;
  serializeJson(doc, jsonString);
  webSocket.broadcastTXT(jsonString);
}

// WebSocket Event Handler
void webSocketEvent(uint8_t clientNum, WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      if (wsClientCount > 0) wsClientCount--;
      Serial.printf("[WS] Client #%u disconnected (%u client(s) remaining)\n",
        clientNum, wsClientCount);
      break;

    case WStype_CONNECTED:
      wsClientCount++;
      Serial.printf("[WS] Client #%u connected from %s (%u client(s))\n",
        clientNum, webSocket.remoteIP(clientNum).toString().c_str(), wsClientCount);
      sendButtonState();
      break;

    case WStype_TEXT:
      // Received text payload from server
      break;

    case WStype_ERROR:
      Serial.println("[WS] WebSocket Error occurred!");
      break;

    default:
      break;
  }
}

// Start the ESP32's own Wi-Fi network (SoftAP mode)
void startAccessPoint() {
  WiFi.mode(WIFI_AP);

  if (!WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET)) {
    Serial.println("[WiFi AP] Failed to configure the static AP address!");
  }

  if (!WiFi.softAP(AP_SSID, AP_PASSWORD, AP_CHANNEL, false, AP_MAX_CLIENTS)) {
    Serial.println("[WiFi AP] Failed to start access point. Restarting...");
    delay(2000);
    ESP.restart();
  }

  Serial.println("[WiFi AP] ESP32 access point started");
  Serial.printf("[WiFi AP] SSID: %s\n", AP_SSID);
  Serial.printf("[WiFi AP] Password: %s\n", AP_PASSWORD);
  Serial.print("[WiFi AP] ESP32 IP: ");
  Serial.println(WiFi.softAPIP());
  Serial.printf("[WiFi AP] WebSocket: ws://%s:%u\n",
    WiFi.softAPIP().toString().c_str(), WEBSOCKET_PORT);
}

String getContentType(const String& path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

bool serveFile(String path) {
  if (!fileSystemReady || path.indexOf("..") >= 0) return false;
  if (path.endsWith("/")) path += "index.html";
  if (!LittleFS.exists(path)) return false;

  File file = LittleFS.open(path, "r");
  if (!file || file.isDirectory()) {
    file.close();
    return false;
  }

  if (path.endsWith(".html") || path.endsWith(".js") || path.endsWith(".css")) {
    httpServer.sendHeader("Cache-Control", "no-cache");
  } else {
    httpServer.sendHeader("Cache-Control", "public, max-age=86400");
  }
  httpServer.streamFile(file, getContentType(path));
  file.close();
  return true;
}

void redirectToHome() {
  httpServer.sendHeader("Location", "http://192.168.4.1/", true);
  httpServer.send(302, "text/plain", "");
}

void startHttpServer() {
  fileSystemReady = LittleFS.begin(false);
  if (fileSystemReady) {
    Serial.printf("[HTTP] LittleFS mounted: %u / %u bytes used\n",
      (unsigned int)LittleFS.usedBytes(), (unsigned int)LittleFS.totalBytes());
  } else {
    Serial.println("[HTTP] LittleFS not mounted; using embedded GPIO 4 page");
  }

  httpServer.on("/", HTTP_GET, []() {
#if BUTTON_TEST_MODE
    if (serveFile("/button-test.html")) return;
#else
    if (serveFile("/index.html")) return;
#endif
    httpServer.send_P(200, "text/html; charset=utf-8", FALLBACK_TEST_PAGE);
  });

  httpServer.on("/api/info", HTTP_GET, []() {
    String json = "{\"status\":\"running\",\"mode\":\"esp32-direct\",\"ip\":\"192.168.4.1\",\"webSocketPort\":81}";
    httpServer.send(200, "application/json", json);
  });

  httpServer.on("/generate_204", HTTP_ANY, redirectToHome);
  httpServer.on("/hotspot-detect.html", HTTP_ANY, redirectToHome);
  httpServer.on("/connecttest.txt", HTTP_ANY, redirectToHome);
  httpServer.on("/ncsi.txt", HTTP_ANY, redirectToHome);

  httpServer.onNotFound([]() {
    if (serveFile(httpServer.uri())) return;
    redirectToHome();
  });

  dnsServer.start(53, "*", AP_IP);
  httpServer.begin();
  Serial.println("[HTTP] Open http://192.168.4.1 in a browser");
}

// ============================================================================
// 5. BUTTON SCAN & DEBOUNCE
// ============================================================================
void updateButtons() {
  unsigned long currentMillis = millis();
  bool stateChanged = false;

  for (size_t i = 0; i < NUM_BUTTONS; i++) {
    // Read raw hardware level (LOW = pressed due to INPUT_PULLUP)
    int rawReading = digitalRead(buttons[i].pin);

    // If the reading changed from last loop, reset debounce timer
    if (rawReading != buttons[i].lastRawState) {
      buttons[i].lastDebounce = currentMillis;
      buttons[i].lastRawState = rawReading;
    }

    // Check if reading has stayed stable for longer than debounce window
    if ((currentMillis - buttons[i].lastDebounce) >= DEBOUNCE_DELAY_MS) {
      bool currentlyPressed = (rawReading == LOW);

      // If stable state is different from confirmed button state
      if (currentlyPressed != buttons[i].isPressed) {
        buttons[i].isPressed = currentlyPressed;
        stateChanged = true;

        if (buttons[i].isPressed) {
          Serial.printf("[BUTTON] Button '%s' PRESSED (GPIO %d)\n", buttons[i].name, buttons[i].pin);
        } else {
          Serial.printf("[BUTTON] Button '%s' RELEASED (GPIO %d)\n", buttons[i].name, buttons[i].pin);
        }
      }
    }
  }

  // If any button state changed, dispatch update over WebSocket immediately
  if (stateChanged) {
    sendButtonState();
  }
}

// ============================================================================
// 6. MAIN SETUP & LOOP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n========================================================");
  Serial.println("🚌 ESP32 4-Button Cooperative Bus Controller Initializing");
  Serial.println("========================================================");

#if BUTTON_TEST_MODE
  Serial.println("[BUTTON TEST] 4-button test page enabled: GPIO 4, 5, 6, 7");
#endif

  // Initialize button GPIOs with internal pullup
  for (size_t i = 0; i < NUM_BUTTONS; i++) {
    pinMode(buttons[i].pin, INPUT_PULLUP);
    buttons[i].lastRawState = digitalRead(buttons[i].pin);
    buttons[i].isPressed = (buttons[i].lastRawState == LOW);
    Serial.printf("   👉 %s: GPIO %d (INPUT_PULLUP)\n", buttons[i].name, buttons[i].pin);
  }

  // Create the ESP32's own Wi-Fi hotspot
  startAccessPoint();

  // Serve the test page and games directly from the ESP32.
  startHttpServer();

  // Accept the Node.js bridge at ws://192.168.4.1:81
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  webSocket.enableHeartbeat(15000, 3000, 2);

  Serial.println("========================================================");
  Serial.println("🎮 Setup Complete! Ready for 4-Player Co-op Play.");
  Serial.println("========================================================\n");
}

void loop() {
  unsigned long now = millis();

  // 1. Maintain WebSocket server event pump
  webSocket.loop();
  httpServer.handleClient();
  dnsServer.processNextRequest();

  // 2. Scan and debounce 4 physical buttons
  updateButtons();

  // 3. Periodically report how many devices are connected to the ESP32 AP
  if (now - lastWifiCheckTime >= 5000) {
    lastWifiCheckTime = now;
    Serial.printf("[WiFi AP] Connected station(s): %u\n", WiFi.softAPgetStationNum());
  }

  // 4. Send periodic heartbeat ping to server
  if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = now;
    sendHeartbeat();
  }
}
