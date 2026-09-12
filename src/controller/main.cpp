#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include "../shared/button_protocol.h"

namespace {

constexpr char AP_SSID[] = "hihi";
constexpr char AP_PASSWORD[] = "12345678";
const IPAddress HUB_IP(192, 168, 4, 1);
constexpr uint16_t UDP_PORT = 4210;

constexpr size_t BUTTON_COUNT = 12;
// Leading-edge debounce: the first raw transition is reported instantly and
// the pin is then muted for DEBOUNCE_MS. The previous trailing-edge logic
// waited the whole window before reporting, which added ~35ms to every press
// and could swallow very fast taps entirely.
constexpr unsigned long DEBOUNCE_MS = 35;
// Full-state resync only needs to beat the hub's 3s controller timeout, so
// halving this from 500ms keeps correctness while cutting periodic UDP load.
constexpr unsigned long SNAPSHOT_INTERVAL_MS = 1000;
constexpr unsigned long WIFI_RETRY_MS = 1000;

// Serial.printf() at 115200 baud blocks the CPU for several milliseconds per
// line. Snapshot bursts plus a pressed/released pair could print dozens of
// lines per second and stutter the loop, so keep per-event chatter off during
// play. Startup/connection messages below are always printed.
constexpr bool VERBOSE_LOG = false;
#define LOGF(...) do { if (VERBOSE_LOG) Serial.printf(__VA_ARGS__); } while (0)

// ESP32-S3 DevKitM-1 defaults. Each button connects its GPIO to GND.
constexpr uint8_t BUTTON_PINS[BUTTON_COUNT] = {
  4, 5, 6, 7,
  8, 9, 10, 11,
  12, 13, 14, 15
};

struct ButtonState {
  bool pressed;
  int lastRaw;
  unsigned long lastAcceptedAt;
};

ButtonState buttons[BUTTON_COUNT] = {};
WiFiUDP udp;
uint32_t sequence = 0;
unsigned long lastSnapshotAt = 0;
unsigned long lastWifiAttemptAt = 0;
bool wasConnected = false;

char channelName(size_t physicalIndex) {
  return static_cast<char>('A' + (physicalIndex / 4));
}

bool sendButtonPacket(size_t physicalIndex) {
  if (WiFi.status() != WL_CONNECTED || physicalIndex >= BUTTON_COUNT) return false;

  const uint8_t channel = physicalIndex / 4;
  const uint8_t button = (physicalIndex % 4) + 1;
  const uint32_t packetSequence = ++sequence;
  const ButtonProtocol::Packet event = {
    ButtonProtocol::VERSION,
    ButtonProtocol::CONTROLLER_ID,
    channel, button,
    static_cast<uint8_t>(buttons[physicalIndex].pressed ? 1 : 0),
    packetSequence
  };
  uint8_t packet[ButtonProtocol::PACKET_SIZE] = {};
  ButtonProtocol::encode(event, packet);

  if (!udp.beginPacket(HUB_IP, UDP_PORT)) return false;
  udp.write(packet, sizeof(packet));
  const bool sent = udp.endPacket() == 1;

  if (sent) {
    LOGF("[UDP] %c-%u %s seq=%lu\n",
      channelName(physicalIndex), button,
      buttons[physicalIndex].pressed ? "DOWN" : "UP",
      static_cast<unsigned long>(packetSequence));
  }
  return sent;
}

void sendFullSnapshot() {
  if (WiFi.status() != WL_CONNECTED) return;
  for (size_t i = 0; i < BUTTON_COUNT; ++i) sendButtonPacket(i);
  lastSnapshotAt = millis();
}

void maintainWifi() {
  const unsigned long now = millis();
  const bool connected = WiFi.status() == WL_CONNECTED;

  if (connected && !wasConnected) {
    wasConnected = true;
    udp.begin(0);
    Serial.print("[WiFi] Connected, IP: ");
    Serial.println(WiFi.localIP());
    sendFullSnapshot();
    return;
  }

  if (!connected && wasConnected) {
    wasConnected = false;
    udp.stop();
    Serial.println("[WiFi] Connection lost");
  }

  if (!connected && now - lastWifiAttemptAt >= WIFI_RETRY_MS) {
    lastWifiAttemptAt = now;
    Serial.println("[WiFi] Connecting to hub...");
    WiFi.begin(AP_SSID, AP_PASSWORD);
  }
}

void scanButtons() {
  const unsigned long now = millis();

  for (size_t i = 0; i < BUTTON_COUNT; ++i) {
    ButtonState& button = buttons[i];
    const int raw = digitalRead(BUTTON_PINS[i]);
    if (raw != button.lastRaw) {
      button.lastRaw = raw;
    }

    // Mute a pin that we just acted on so contact bounce cannot emit extra
    // events. Once the window passes we re-read the settled level, which also
    // recovers the state if a noise spike was accepted and then reverted.
    if (now - button.lastAcceptedAt < DEBOUNCE_MS) continue;

    const bool pressed = raw == LOW;
    if (pressed == button.pressed) continue;

    button.pressed = pressed;
    button.lastAcceptedAt = now;
    LOGF("[BUTTON] %c-%u %s (GPIO %u)\n",
      channelName(i), static_cast<unsigned>((i % 4) + 1),
      pressed ? "DOWN" : "UP", BUTTON_PINS[i]);
    sendButtonPacket(i);
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[Controller] ESP32-S3 12-button controller starting");

  for (size_t i = 0; i < BUTTON_COUNT; ++i) {
    pinMode(BUTTON_PINS[i], INPUT_PULLUP);
    buttons[i].lastRaw = digitalRead(BUTTON_PINS[i]);
    buttons[i].pressed = buttons[i].lastRaw == LOW;
    buttons[i].lastAcceptedAt = millis();
    Serial.printf("  %c-%u -> GPIO %u\n", channelName(i),
      static_cast<unsigned>((i % 4) + 1), BUTTON_PINS[i]);
  }

  sequence = esp_random();
  WiFi.mode(WIFI_STA);
  // Modem sleep injects tens of milliseconds of latency into every outbound
  // UDP packet. Disable it so button presses leave the radio immediately.
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(AP_SSID, AP_PASSWORD);
  lastWifiAttemptAt = millis();
}

void loop() {
  maintainWifi();
  scanButtons();

  if (WiFi.status() == WL_CONNECTED &&
      millis() - lastSnapshotAt >= SNAPSHOT_INTERVAL_MS) {
    sendFullSnapshot();
  }
  delay(1);
}
