const assert = require('assert');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');

const source = path.join(__dirname, 'test_button_protocol.cpp');
const binary = path.join(os.tmpdir(), `smu-button-protocol-${process.pid}`);

try {
  const compile = spawnSync('c++', ['-std=c++17', source, '-o', binary], { encoding: 'utf8' });
  assert.strictEqual(compile.status, 0, `protocol test compile failed:\n${compile.stderr}`);
  const run = spawnSync(binary, [], { encoding: 'utf8' });
  assert.strictEqual(run.status, 0, `protocol test failed:\n${run.stderr}`);
  assert(run.stdout.includes('UDP protocol assertions passed'));
  console.log('✅ FIRMWARE PROTOCOL TEST PASSED: wire validation, big-endian sequence, gaps, wraparound, and timeout work');
} finally {
  if (fs.existsSync(binary)) fs.unlinkSync(binary);
}
