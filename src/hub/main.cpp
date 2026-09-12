#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <LittleFS.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include <cstring>
#include "../shared/button_protocol.h"

namespace {

constexpr char AP_SSID[] = "hihi";
constexpr char AP_PASSWORD[] = "12345678";
constexpr uint8_t AP_CHANNEL = 1;
constexpr uint8_t AP_MAX_CLIENTS = 8;
constexpr uint16_t WEBSOCKET_PORT = 81;
constexpr uint16_t UDP_PORT = 4210;
const IPAddress AP_IP(192, 168, 4, 1);
const IPAddress AP_GATEWAY(192, 168, 4, 1);
const IPAddress AP_SUBNET(255, 255, 255, 0);

// The WS library already keeps sockets alive with its own ping/pong heartbeat,
// so this timer only refreshes the browser status badge. 4s keeps that badge
// responsive while sending far fewer broadcasts to every connected screen.
constexpr unsigned long STATUS_INTERVAL_MS = 4000;

// Each screen only needs its own channel, so the hub remembers which channel a
// browser subscribed to and skips the other two. 0xFF means "send everything"
// and is the default, which keeps single-page diagnostics (and any client that
// never registers) working exactly as before.
constexpr uint8_t RECEIVE_ALL_CHANNELS = 0xFF;
constexpr uint8_t MAX_TRACKED_CLIENTS = 8;

// Serial.printf() at 115200 baud blocks the CPU for several milliseconds per
// line. Rejected/bursty UDP packets must never be able to stutter the hub, so
// per-packet chatter is compiled out of the hot path by default.
constexpr bool VERBOSE_LOG = false;
#define LOGF(...) do { if (VERBOSE_LOG) Serial.printf(__VA_ARGS__); } while (0)

WebSocketsServer webSocket(WEBSOCKET_PORT);
WebServer httpServer(80);
DNSServer dnsServer;
WiFiUDP udp;

bool channelStates[ButtonProtocol::CHANNEL_COUNT][ButtonProtocol::BUTTONS_PER_CHANNEL] = {};
bool fileSystemReady = false;
bool controllerOnline = false;
bool hasSequence = false;
uint32_t lastSequence = 0;
unsigned long lastControllerPacketAt = 0;
unsigned long lastStatusAt = 0;
unsigned long lastWifiReportAt = 0;
uint8_t wsClientCount = 0;
uint8_t clientChannels[MAX_TRACKED_CLIENTS];

const char FALLBACK_PAGE[] PROGMEM = R"rawliteral(
<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ESP32 Game Hub</title><style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#fff5db;color:#28231f}.card{border:3px solid;border-radius:22px;padding:28px;box-shadow:8px 9px 0;max-width:620px;text-align:center}a{color:inherit;font-weight:800}</style></head><body><main class="card"><h1>ESP32 3-Channel Hub</h1><p>LittleFS web files are not installed.</p><p>Run the Hub filesystem upload, then open <a href="/button-test.html">the 12-button test page</a>.</p></main></body></html>
)rawliteral";

char channelName(uint8_t channel) {
  return static_cast<char>('A' + channel);
}

void broadcastJson(const JsonDocument& doc) {
  if (wsClientCount == 0) return;
  String payload;
  serializeJson(doc, payload);
  webSocket.broadcastTXT(payload);
}

void sendSystemStatus(uint8_t client = 255) {
  if (client == 255 && wsClientCount == 0) return;
  JsonDocument doc;
  doc["type"] = "system_status";
  doc["hub"] = true;
  doc["controller"] = controllerOnline;
  doc["controllerId"] = ButtonProtocol::CONTROLLER_ID;
  String payload;
  serializeJson(doc, payload);
  if (client == 255) webSocket.broadcastTXT(payload);
  else webSocket.sendTXT(client, payload);
}

void sendChannelState(uint8_t channel, uint32_t sequence, uint8_t client = 255) {
  if (channel >= ButtonProtocol::CHANNEL_COUNT) return;
  if (client == 255 && wsClientCount == 0) return;
  static constexpr const char* ACTIONS[ButtonProtocol::BUTTONS_PER_CHANNEL] = {
    "forward", "backward", "left", "right"
  };

  JsonDocument doc;
  doc["type"] = "input";
  doc["controller"] = ButtonProtocol::CONTROLLER_ID;
  char channelText[2] = { channelName(channel), '\0' };
  doc["channel"] = channelText;
  doc["seq"] = sequence;
  JsonObject data = doc["data"].to<JsonObject>();
  for (size_t i = 0; i < ButtonProtocol::BUTTONS_PER_CHANNEL; ++i) {
    data[ACTIONS[i]] = channelStates[channel][i];
  }

  String payload;
  serializeJson(doc, payload);
  if (client != 255) {
    // Explicit target (initial sync) always gets the full picture.
    webSocket.sendTXT(client, payload);
    return;
  }
  // Fan out only to clients that subscribed to this channel or want them all.
  for (uint8_t c = 0; c < MAX_TRACKED_CLIENTS; ++c) {
    if (clientChannels[c] == RECEIVE_ALL_CHANNELS || clientChannels[c] == channel) {
      webSocket.sendTXT(c, payload);
    }
  }
}

void sendAllChannelStates(uint8_t client = 255) {
  for (uint8_t channel = 0; channel < ButtonProtocol::CHANNEL_COUNT; ++channel) {
    sendChannelState(channel, lastSequence, client);
  }
}

void setControllerOnline(bool online) {
  if (controllerOnline == online) return;
  controllerOnline = online;
  Serial.printf("[Controller] %s\n", online ? "ONLINE" : "OFFLINE");
  sendSystemStatus();
}

void releaseAllInputs() {
  for (uint8_t channel = 0; channel < ButtonProtocol::CHANNEL_COUNT; ++channel) {
    for (size_t button = 0; button < ButtonProtocol::BUTTONS_PER_CHANNEL; ++button) {
      channelStates[channel][button] = false;
    }
    sendChannelState(channel, lastSequence);
  }
}

bool acceptSequence(uint32_t sequence, unsigned long now) {
  if (!hasSequence) return true;
  const int32_t delta = ButtonProtocol::sequenceDelta(sequence, lastSequence);
  if (delta > 0) {
    if (delta > 1) {
      LOGF("[UDP] Sequence gap: expected %lu, received %lu\n",
        static_cast<unsigned long>(lastSequence + 1),
        static_cast<unsigned long>(sequence));
    }
    return true;
  }

  // A rebooted controller starts a new random sequence. Short out-of-order
  // packets are discarded, while a sustained reset is accepted after 1 second.
  if (now - lastControllerPacketAt > 1000) {
    LOGF("[UDP] Controller sequence restarted\n");
    return true;
  }
  return false;
}

void processUdpPacket() {
  int packetLength = udp.parsePacket();
  while (packetLength > 0) {
    uint8_t packet[ButtonProtocol::PACKET_SIZE] = {};
    const int bytesRead = udp.read(packet, sizeof(packet));
    while (udp.available()) udp.read();

    if (packetLength != static_cast<int>(ButtonProtocol::PACKET_SIZE) ||
        bytesRead != static_cast<int>(ButtonProtocol::PACKET_SIZE)) {
      LOGF("[UDP] Rejected packet length %d\n", packetLength);
      packetLength = udp.parsePacket();
      continue;
    }

    ButtonProtocol::Packet event = {};
    if (!ButtonProtocol::decodeAndValidate(packet, sizeof(packet), event)) {
      LOGF("[UDP] Rejected invalid packet v=%u id=%u ch=%u btn=%u state=%u\n",
        packet[0], packet[1], packet[2], packet[3], packet[4]);
      packetLength = udp.parsePacket();
      continue;
    }

    const unsigned long now = millis();
    if (!acceptSequence(event.sequence, now)) {
      packetLength = udp.parsePacket();
      continue;
    }

    hasSequence = true;
    lastSequence = event.sequence;
    lastControllerPacketAt = now;
    setControllerOnline(true);

    const bool pressed = event.state == 1;
    const size_t buttonIndex = event.button - 1;
    if (channelStates[event.channel][buttonIndex] != pressed) {
      channelStates[event.channel][buttonIndex] = pressed;
      LOGF("[UDP] %c-%u %s seq=%lu\n", channelName(event.channel), event.button,
        pressed ? "DOWN" : "UP", static_cast<unsigned long>(event.sequence));
      sendChannelState(event.channel, event.sequence);
    }

    packetLength = udp.parsePacket();
  }
}

void checkControllerTimeout() {
  if (!controllerOnline) return;
  if (!ButtonProtocol::controllerTimedOut(true, millis(), lastControllerPacketAt)) return;
  setControllerOnline(false);
  hasSequence = false;
  releaseAllInputs();
}

void sendHeartbeat() {
  if (wsClientCount == 0) return;
  sendSystemStatus();
}

void handleRegister(uint8_t client, const uint8_t* payload, size_t length) {
  if (client >= MAX_TRACKED_CLIENTS || payload == nullptr || length == 0) return;
  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) return;
  if (strcmp(doc["type"] | "", "register") != 0) return;

  const char* channel = doc["channel"] | "";
  char letter = channel[0];
  if (letter == '*') {
    clientChannels[client] = RECEIVE_ALL_CHANNELS;
    return;
  }
  if (letter >= 'a' && letter <= 'z') letter = static_cast<char>(letter - 'a' + 'A');
  if (letter >= 'A' && letter < 'A' + ButtonProtocol::CHANNEL_COUNT) {
    clientChannels[client] = static_cast<uint8_t>(letter - 'A');
  }
}

void webSocketEvent(uint8_t client, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      ++wsClientCount;
      if (client < MAX_TRACKED_CLIENTS) clientChannels[client] = RECEIVE_ALL_CHANNELS;
      Serial.printf("[WS] Client #%u connected (%u total)\n", client, wsClientCount);
      sendSystemStatus(client);
      sendAllChannelStates(client);
      break;
    case WStype_DISCONNECTED:
      if (client < MAX_TRACKED_CLIENTS) clientChannels[client] = RECEIVE_ALL_CHANNELS;
      if (wsClientCount > 0) --wsClientCount;
      Serial.printf("[WS] Client #%u disconnected (%u remaining)\n", client, wsClientCount);
      break;
    case WStype_TEXT:
      handleRegister(client, payload, length);
      break;
    default:
      break;
  }
}

String contentType(const String& path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".mp3")) return "audio/mpeg";
  if (path.endsWith(".m4a") || path.endsWith(".mp4")) return "audio/mp4";
  if (path.endsWith(".wav")) return "audio/wav";
  if (path.endsWith(".ogg")) return "audio/ogg";
  return "application/octet-stream";
}

bool serveFile(String path) {
  if (!fileSystemReady || path.indexOf("..") >= 0) return false;
  if (path.endsWith("/")) path += "button-test.html";
  if (!LittleFS.exists(path)) return false;

  File file = LittleFS.open(path, "r");
  if (!file || file.isDirectory()) {
    file.close();
    return false;
  }
  if (path.endsWith(".html") || path.endsWith(".css") || path.endsWith(".js")) {
    httpServer.sendHeader("Cache-Control", "no-cache");
  } else {
    httpServer.sendHeader("Cache-Control", "public, max-age=86400");
  }
  httpServer.streamFile(file, contentType(path));
  file.close();
  return true;
}

bool isPageNavigation(const String& uri) {
  const int slash = uri.lastIndexOf('/');
  const String tail = uri.substring(slash + 1);
  return tail.length() == 0 || tail.indexOf('.') < 0 || tail.endsWith(".html");
}

// Every OS pings its own connectivity-check URL right after Wi-Fi connects and
// again whenever it re-validates the link (for example after a brief drop).
// Answering these with a redirect makes the OS treat "hihi" as a captive portal
// and pop up its Wi-Fi sign-in window in the middle of a game.
void sendNoContent() {
  httpServer.send(204, "text/plain", "");
}

void sendAppleSuccess() {
  httpServer.send(200, "text/html; charset=utf-8",
    "<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>");
}

void sendWindowsConnectTest() {
  httpServer.send(200, "text/plain", "Microsoft Connect Test");
}

void sendWindowsNcsi() {
  httpServer.send(200, "text/plain", "Microsoft NCSI");
}

void sendFirefoxSuccess() {
  httpServer.send(200, "text/plain", "success\n");
}

void startAccessPoint() {
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
  if (!WiFi.softAP(AP_SSID, AP_PASSWORD, AP_CHANNEL, false, AP_MAX_CLIENTS)) {
    Serial.println("[WiFi] Failed to start AP; restarting");
    delay(2000);
    ESP.restart();
  }
  Serial.printf("[WiFi] AP %s at %s, max clients=%u\n", AP_SSID,
    WiFi.softAPIP().toString().c_str(), AP_MAX_CLIENTS);
}

void startHttpServer() {
  fileSystemReady = LittleFS.begin(false);
  Serial.printf("[HTTP] LittleFS %s\n", fileSystemReady ? "mounted" : "not mounted");

  httpServer.on("/", HTTP_GET, []() {
    if (serveFile("/button-test.html")) return;
    httpServer.send_P(200, "text/html; charset=utf-8", FALLBACK_PAGE);
  });
  httpServer.on("/api/info", HTTP_GET, []() {
    httpServer.send(200, "application/json",
      "{\"status\":\"running\",\"mode\":\"esp32-hub\",\"ip\":\"192.168.4.1\",\"webSocketPort\":81,\"udpPort\":4210}");
  });
  // Satisfy common connectivity checks without triggering a captive-portal UI.
  httpServer.on("/generate_204", HTTP_ANY, sendNoContent);
  httpServer.on("/gen_204", HTTP_ANY, sendNoContent);
  httpServer.on("/hotspot-detect.html", HTTP_ANY, sendAppleSuccess);
  httpServer.on("/library/test/success.html", HTTP_ANY, sendAppleSuccess);
  httpServer.on("/connecttest.txt", HTTP_ANY, sendWindowsConnectTest);
  httpServer.on("/ncsi.txt", HTTP_ANY, sendWindowsNcsi);
  httpServer.on("/canonical.html", HTTP_ANY, sendFirefoxSuccess);
  httpServer.on("/success.txt", HTTP_ANY, sendFirefoxSuccess);

  httpServer.onNotFound([]() {
    if (serveFile(httpServer.uri())) return;
    // Only real page navigations are sent to the game. Unknown files and the
    // vendor-specific probe paths of phones/PCs must answer "no content" so the
    // OS never re-opens its Wi-Fi sign-in window during play.
    if (!isPageNavigation(httpServer.uri())) {
      sendNoContent();
      return;
    }
    httpServer.sendHeader("Location", "http://192.168.4.1/", true);
    httpServer.send(302, "text/plain", "");
  });

  dnsServer.start(53, "*", AP_IP);
  httpServer.begin();
  Serial.println("[HTTP] Open http://192.168.4.1");
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[Hub] ESP32-S3 3-channel game hub starting");
  startAccessPoint();
  // The AP side must answer instantly when a controller packet arrives; modem
  // sleep would otherwise add tens of milliseconds before any web client sees
  // the resulting WebSocket broadcast.
  WiFi.setSleep(false);
  startHttpServer();
  udp.begin(UDP_PORT);
  Serial.printf("[UDP] Listening on %u\n", UDP_PORT);
  for (uint8_t i = 0; i < MAX_TRACKED_CLIENTS; ++i) clientChannels[i] = RECEIVE_ALL_CHANNELS;
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  webSocket.enableHeartbeat(15000, 3000, 2);
  Serial.printf("[WS] Listening on ws://192.168.4.1:%u\n", WEBSOCKET_PORT);
}

void loop() {
  webSocket.loop();
  httpServer.handleClient();
  dnsServer.processNextRequest();
  processUdpPacket();
  checkControllerTimeout();

  const unsigned long now = millis();
  if (now - lastStatusAt >= STATUS_INTERVAL_MS) {
    lastStatusAt = now;
    sendHeartbeat();
  }
  if (now - lastWifiReportAt >= 5000) {
    lastWifiReportAt = now;
    Serial.printf("[WiFi] Connected stations: %u\n", WiFi.softAPgetStationNum());
  }
}
