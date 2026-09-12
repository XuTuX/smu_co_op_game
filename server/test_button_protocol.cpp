#include <cassert>
#include <cstdint>
#include <iostream>
#include "../src/shared/button_protocol.h"

int main() {
  using namespace ButtonProtocol;

  const Packet source = { VERSION, CONTROLLER_ID, 1, 3, 1, 0x12345678u };
  uint8_t wire[PACKET_SIZE] = {};
  encode(source, wire);
  assert(wire[5] == 0x12 && wire[6] == 0x34 && wire[7] == 0x56 && wire[8] == 0x78);

  Packet decoded = {};
  assert(decodeAndValidate(wire, PACKET_SIZE, decoded));
  assert(decoded.channel == 1 && decoded.button == 3 && decoded.state == 1);
  assert(decoded.sequence == 0x12345678u);
  assert(!decodeAndValidate(wire, PACKET_SIZE - 1, decoded));

  uint8_t invalid[PACKET_SIZE] = {};
  for (size_t i = 0; i < PACKET_SIZE; ++i) invalid[i] = wire[i];
  invalid[0] = VERSION + 1;
  assert(!decodeAndValidate(invalid, PACKET_SIZE, decoded));
  invalid[0] = VERSION; invalid[1] = CONTROLLER_ID + 1;
  assert(!decodeAndValidate(invalid, PACKET_SIZE, decoded));
  invalid[1] = CONTROLLER_ID; invalid[2] = CHANNEL_COUNT;
  assert(!decodeAndValidate(invalid, PACKET_SIZE, decoded));
  invalid[2] = 0; invalid[3] = 0;
  assert(!decodeAndValidate(invalid, PACKET_SIZE, decoded));
  invalid[3] = 1; invalid[4] = 2;
  assert(!decodeAndValidate(invalid, PACKET_SIZE, decoded));

  assert(sequenceDelta(11, 10) == 1);
  assert(sequenceDelta(15, 10) == 5);
  assert(sequenceDelta(0, UINT32_MAX) == 1);
  assert(!controllerTimedOut(false, 5000, 0));
  assert(!controllerTimedOut(true, 4000, 1000));
  assert(controllerTimedOut(true, 4001, 1000));
  assert(controllerTimedOut(true, 100, UINT32_MAX - 3000));

  std::cout << "UDP protocol assertions passed\n";
  return 0;
}
