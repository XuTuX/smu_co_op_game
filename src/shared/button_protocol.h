#pragma once

#include <cstddef>
#include <cstdint>

namespace ButtonProtocol {

constexpr uint8_t VERSION = 1;
constexpr uint8_t CONTROLLER_ID = 1;
constexpr uint8_t CHANNEL_COUNT = 3;
constexpr uint8_t BUTTONS_PER_CHANNEL = 4;
constexpr size_t PACKET_SIZE = 9;
constexpr uint32_t CONTROLLER_TIMEOUT_MS = 3000;

struct Packet {
  uint8_t version;
  uint8_t controllerId;
  uint8_t channel;
  uint8_t button;
  uint8_t state;
  uint32_t sequence;
};

inline void encodeUint32BigEndian(uint8_t* target, uint32_t value) {
  target[0] = static_cast<uint8_t>(value >> 24);
  target[1] = static_cast<uint8_t>(value >> 16);
  target[2] = static_cast<uint8_t>(value >> 8);
  target[3] = static_cast<uint8_t>(value);
}

inline uint32_t decodeUint32BigEndian(const uint8_t* source) {
  return (static_cast<uint32_t>(source[0]) << 24) |
         (static_cast<uint32_t>(source[1]) << 16) |
         (static_cast<uint32_t>(source[2]) << 8) |
         static_cast<uint32_t>(source[3]);
}

inline void encode(const Packet& packet, uint8_t* target) {
  target[0] = packet.version;
  target[1] = packet.controllerId;
  target[2] = packet.channel;
  target[3] = packet.button;
  target[4] = packet.state;
  encodeUint32BigEndian(target + 5, packet.sequence);
}

inline bool decodeAndValidate(const uint8_t* source, size_t length, Packet& packet) {
  if (source == nullptr || length != PACKET_SIZE) return false;
  packet = {
    source[0], source[1], source[2], source[3], source[4],
    decodeUint32BigEndian(source + 5)
  };
  return packet.version == VERSION &&
         packet.controllerId == CONTROLLER_ID &&
         packet.channel < CHANNEL_COUNT &&
         packet.button >= 1 && packet.button <= BUTTONS_PER_CHANNEL &&
         packet.state <= 1;
}

inline int32_t sequenceDelta(uint32_t current, uint32_t previous) {
  return static_cast<int32_t>(current - previous);
}

inline bool controllerTimedOut(bool online, uint32_t now, uint32_t lastPacketAt) {
  return online && static_cast<uint32_t>(now - lastPacketAt) > CONTROLLER_TIMEOUT_MS;
}

}  // namespace ButtonProtocol
