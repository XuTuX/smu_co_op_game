/**
 * Regression test for the "Wi-Fi reconnected / sign-in window pops up during play" bug.
 *
 * Windows, macOS/iOS, Android/Chrome and Firefox each re-run their own
 * connectivity check when a device (re)joins the ESP32 "hihi" access point.
 * If the firmware answers those probe URLs with a redirect, the OS decides the
 * AP is a captive portal and opens its Wi-Fi sign-in window again - which is
 * exactly the pop-up that interrupted games before. The firmware must answer
 * every probe the way the OS expects, and unknown non-page requests must not be
 * redirected to the game.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const firmwareSources = [
  ['ESP32 single-board build', path.join(__dirname, '..', 'src', 'main.cpp')],
  ['legacy Arduino sketch', path.join(__dirname, '..', 'esp32', 'esp32_bus_controller.ino')]
];

// The production ESP32 A is intentionally a lightweight input-only hub. It has
// no HTTP, DNS, or LittleFS surface: local laptop HTML talks straight to port 81.
const lightweightHub = fs.readFileSync(path.join(__dirname, '..', 'src', 'hub', 'main.cpp'), 'utf8');
for (const removedFeature of ['<WebServer.h>', '<DNSServer.h>', '<LittleFS.h>', 'startHttpServer']) {
  assert(!lightweightHub.includes(removedFeature),
    `ESP32 A must not include laptop-owned web feature: ${removedFeature}`);
}

// Each operating system's connectivity-check URL and the handler it must hit.
const probes = [
  { path: '/generate_204', handler: 'sendNoContent' },
  { path: '/gen_204', handler: 'sendNoContent' },
  { path: '/hotspot-detect.html', handler: 'sendAppleSuccess' },
  { path: '/library/test/success.html', handler: 'sendAppleSuccess' },
  { path: '/connecttest.txt', handler: 'sendWindowsConnectTest' },
  { path: '/ncsi.txt', handler: 'sendWindowsNcsi' },
  { path: '/canonical.html', handler: 'sendFirefoxSuccess' },
  { path: '/success.txt', handler: 'sendFirefoxSuccess' }
];

// The bodies the operating systems actually compare against.
const expectedBodies = [
  ['sendNoContent', /httpServer\.send\(204/],
  ['sendAppleSuccess', /<TITLE>Success<\/TITLE>.*<BODY>Success<\/BODY>/],
  ['sendWindowsConnectTest', /"Microsoft Connect Test"/],
  ['sendWindowsNcsi', /"Microsoft NCSI"/],
  ['sendFirefoxSuccess', /"success\\n"/]
];

for (const [label, file] of firmwareSources) {
  const source = fs.readFileSync(file, 'utf8');

  for (const probe of probes) {
    const registration = new RegExp(
      'httpServer\\.on\\(\\"' + probe.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\"'
    );
    assert(registration.test(source),
      `${label} must register a handler for ${probe.path} or the OS re-opens its Wi-Fi sign-in window`);
    const line = source.split('\n').find((entry) => registration.test(entry));
    assert(line.includes(probe.handler),
      `${label} must answer ${probe.path} with ${probe.handler} (found: ${line.trim()})`);
  }

  for (const [handler, body] of expectedBodies) {
    assert(new RegExp('void ' + handler + '\\(\\)[\\s\\S]*?\\n\\}').test(source),
      `${label} must define ${handler}`);
    const definition = source.match(new RegExp('void ' + handler + '\\(\\)[\\s\\S]*?\\n\\}'))[0];
    assert(body.test(definition),
      `${label} must return the exact response body for ${handler}`);
  }

  assert(/bool isPageNavigation\(const String& uri\)/.test(source),
    `${label} must classify page navigations before falling back to a redirect`);
  assert(/indexOf\('\.'\) < 0/.test(source),
    `${label} must treat extension-less paths as page navigations and everything else as a probe/asset`);
  assert(/tail\.endsWith\("\.html"\)/.test(source),
    `${label} must keep .html requests as page navigations`);

  const notFound = source.match(/httpServer\.onNotFound\(\[\]\(\) \{[\s\S]*?\n  \}\);/);
  assert(notFound, `${label} must define an onNotFound handler`);
  assert(notFound[0].includes('isPageNavigation'),
    `${label} must not redirect unknown probe paths to the game (captive-portal loop)`);
}

console.log('✅ CAPTIVE PORTAL TEST PASSED: every firmware answers OS connectivity checks without opening a sign-in window');
