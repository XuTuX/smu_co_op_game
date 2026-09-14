#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebSocketsServer.h>
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
WiFiUDP udp;

bool channelStates[ButtonProtocol::CHANNEL_COUNT][ButtonProtocol::BUTTONS_PER_CHANNEL] = {};
bool controllerOnline = false;
bool hasSequence = false;
uint32_t lastSequence = 0;
unsigned long lastControllerPacketAt = 0;
unsigned long lastStatusAt = 0;
unsigned long lastWifiReportAt = 0;
uint8_t wsClientCount = 0;
uint8_t clientChannels[MAX_TRACKED_CLIENTS];

char channelName(uint8_t channel) {
  return static_cast<char>('A' + channel);
}

void sendSystemStatus(uint8_t client = 255) {
  if (client == 255 && wsClientCount == 0) return;
  char payload[96];
  snprintf(payload, sizeof(payload),
    "{\"type\":\"system_status\",\"hub\":true,\"controller\":%s,\"controllerId\":%u}",
    controllerOnline ? "true" : "false", ButtonProtocol::CONTROLLER_ID);
  if (client == 255) webSocket.broadcastTXT(payload);
  else webSocket.sendTXT(client, payload);
}

void sendChannelState(uint8_t channel, uint32_t sequence, uint8_t client = 255) {
  if (channel >= ButtonProtocol::CHANNEL_COUNT) return;
  if (client == 255 && wsClientCount == 0) return;
  static constexpr const char* ACTIONS[ButtonProtocol::BUTTONS_PER_CHANNEL] = {
    "forward", "backward", "left", "right"
  };

  char payload[224];
  snprintf(payload, sizeof(payload),
    "{\"type\":\"input\",\"controller\":%u,\"channel\":\"%c\",\"seq\":%lu,"
    "\"data\":{\"%s\":%s,\"%s\":%s,\"%s\":%s,\"%s\":%s}}",
    ButtonProtocol::CONTROLLER_ID, channelName(channel),
    static_cast<unsigned long>(sequence),
    ACTIONS[0], channelStates[channel][0] ? "true" : "false",
    ACTIONS[1], channelStates[channel][1] ? "true" : "false",
    ACTIONS[2], channelStates[channel][2] ? "true" : "false",
    ACTIONS[3], channelStates[channel][3] ? "true" : "false");
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
  String message;
  message.reserve(length);
  for (size_t i = 0; i < length; ++i) message += static_cast<char>(payload[i]);
  if (message.indexOf("\"type\":\"register\"") < 0) return;

  const int key = message.indexOf("\"channel\"");
  if (key < 0) return;
  const int colon = message.indexOf(':', key + 9);
  if (colon < 0) return;
  int value = colon + 1;
  while (value < static_cast<int>(message.length()) &&
         (message[value] == ' ' || message[value] == '\"')) ++value;
  if (value >= static_cast<int>(message.length())) return;
  char letter = message[value];
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

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[Hub] ESP32-S3 lightweight input hub starting");
  startAccessPoint();
  // The AP side must answer instantly when a controller packet arrives; modem
  // sleep would otherwise add tens of milliseconds before any web client sees
  // the resulting WebSocket broadcast.
  WiFi.setSleep(false);
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
