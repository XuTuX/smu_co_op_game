/**
 * ============================================================================
 * ESP32 4-Button Cooperative Bus Parking Controller
 * ============================================================================
 * 
 * 4 Physical Buttons with Hardware Debouncing & Real-Time WebSocket Communication:
 * - Button 1 (Forward): Accelerate bus forward
 * - Button 2 (Backward): Accelerate bus in reverse / Brake
 * - Button 3 (Left): Turn front wheels left
 * - Button 4 (Right): Turn front wheels right
 * 
 * Wiring (INPUT_PULLUP - No external resistors needed!):
 * - GPIO PIN ---- [BUTTON SWITCH] ---- GND
 * 
 * Supported Boards:
 * - Standard ESP32 (ESP32-WROOM-32 / DevKit): GPIO 25, 26, 27, 14
 * - ESP32-S3 (ESP32-S3-DevKitM-1): GPIO 4, 5, 6, 7 (or customize below)
 * ============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// ============================================================================
// 1. USER CONFIGURATION (EDIT YOUR WI-FI & SERVER INFO HERE)
// ============================================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// IP Address of the computer running the Node.js server (e.g. "192.168.0.15")
const char* SERVER_IP     = "192.168.0.10";
const uint16_t SERVER_PORT = 3000;

// ============================================================================
// 2. GPIO PIN ASSIGNMENTS
// ============================================================================
#if defined(CONFIG_IDF_TARGET_ESP32S3)
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

// Debounce settings
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

WebSocketsClient webSocket;
bool isWsConnected = false;
unsigned long lastHeartbeatTime = 0;
unsigned long lastWifiCheckTime = 0;

// ============================================================================
// 4. WEBSOCKET & NETWORK FUNCTIONS
// ============================================================================

// Send button state to Node.js WebSocket server
void sendButtonState() {
  if (!isWsConnected) return;

  JsonDocument doc;
  doc["type"] = "input";
  JsonObject data = doc["data"].to<JsonObject>();
  data["forward"]  = buttons[0].isPressed;
  data["backward"] = buttons[1].isPressed;
  data["left"]     = buttons[2].isPressed;
  data["right"]    = buttons[3].isPressed;

  String jsonString;
  serializeJson(doc, jsonString);
  webSocket.sendTXT(jsonString);

  // Serial debug print
  Serial.printf("[INPUT SENT] FWD: %d | BWD: %d | LFT: %d | RGT: %d\n",
    buttons[0].isPressed, buttons[1].isPressed, buttons[2].isPressed, buttons[3].isPressed);
}

// Send registration payload when newly connected
void sendRegistration() {
  JsonDocument doc;
  doc["type"] = "register";
  doc["role"] = "esp32";

  String jsonString;
  serializeJson(doc, jsonString);
  webSocket.sendTXT(jsonString);
  Serial.println("[WS] Sent ESP32 registration packet to server");
}

// Send periodic heartbeat ping
void sendHeartbeat() {
  if (!isWsConnected) return;
  JsonDocument doc;
  doc["type"] = "ping";
  String jsonString;
  serializeJson(doc, jsonString);
  webSocket.sendTXT(jsonString);
}

// WebSocket Event Handler
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      isWsConnected = false;
      Serial.println("[WS] WebSocket disconnected! Waiting to reconnect...");
      break;

    case WStype_CONNECTED:
      isWsConnected = true;
      Serial.printf("[WS] WebSocket connected to http://%s:%u\n", SERVER_IP, SERVER_PORT);
      sendRegistration();
      // Send initial button states immediately
      sendButtonState();
      break;

    case WStype_TEXT:
      // Received text payload from server (e.g. pong or ack)
      // Serial.printf("[WS RX] %s\n", payload);
      break;

    case WStype_ERROR:
      Serial.println("[WS] WebSocket Error occurred!");
      break;

    default:
      break;
  }
}

// Connect or Reconnect to Wi-Fi
void ensureWiFiConnection() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("\n[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] WiFi Connected!");
    Serial.print("[WiFi] ESP32 IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("[WiFi] RSSI Signal: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println("\n[WiFi] Connection attempt timed out. Will retry in background.");
  }
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

  // Initialize button GPIOs with internal pullup
  for (size_t i = 0; i < NUM_BUTTONS; i++) {
    pinMode(buttons[i].pin, INPUT_PULLUP);
    buttons[i].lastRawState = digitalRead(buttons[i].pin);
    buttons[i].isPressed = (buttons[i].lastRawState == LOW);
    Serial.printf("   👉 %s: GPIO %d (INPUT_PULLUP)\n", buttons[i].name, buttons[i].pin);
  }

  // Connect to Wi-Fi
  ensureWiFiConnection();

  // Initialize WebSocket Client
  Serial.printf("[WS] Configuring WebSocket Server -> %s:%d\n", SERVER_IP, SERVER_PORT);
  webSocket.begin(SERVER_IP, SERVER_PORT, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(2500); // Try reconnecting every 2.5s if dropped
  webSocket.enableHeartbeat(15000, 3000, 2);

  Serial.println("========================================================");
  Serial.println("🎮 Setup Complete! Ready for 4-Player Co-op Play.");
  Serial.println("========================================================\n");
}

void loop() {
  unsigned long now = millis();

  // 1. Maintain WebSocket client event pump
  webSocket.loop();

  // 2. Scan and debounce 4 physical buttons
  updateButtons();

  // 3. Periodic Wi-Fi connection watchdog
  if (now - lastWifiCheckTime >= 5000) {
    lastWifiCheckTime = now;
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[WiFi] Wi-Fi lost! Attempting auto-reconnect...");
      ensureWiFiConnection();
    }
  }

  // 4. Send periodic heartbeat ping to server
  if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = now;
    sendHeartbeat();
  }
}