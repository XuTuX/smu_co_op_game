const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'client', 'js', 'network.js'), 'utf8');

function fakeLink(href) {
  return {
    href,
    getAttribute(name) { return name === 'href' ? this.href : null; },
    setAttribute(name, value) { if (name === 'href') this.href = value; }
  };
}

function createClient(search) {
  const genericLink = fakeLink('traffic.html');
  const explicitLink = fakeLink('jump-rope.html?channel=C');
  const delivered = [];
  const allChannels = [];
  const context = {
    console,
    URL,
    URLSearchParams,
    setTimeout: () => 1,
    clearTimeout: () => {},
    document: { querySelectorAll: () => [genericLink, explicitLink] },
    window: {
      location: {
        search,
        hostname: 'localhost',
        protocol: 'http:',
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
        href: `http://localhost:3000/index.html${search}`
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'network.js' });
  const receiver = {
    setEsp32Input: (data) => delivered.push({ ...data }),
    setChannelInput: (channel, data, message) => allChannels.push({ channel, data: { ...data }, message })
  };
  const client = new context.window.NetworkClient(receiver);
  return { client, delivered, allChannels, genericLink, explicitLink };
}

const channelB = createClient('?channel=b');
assert.strictEqual(channelB.client.selectedChannel, 'B');
assert.strictEqual(channelB.genericLink.href, 'traffic.html?channel=B', 'navigation must preserve selected channel');
assert.strictEqual(channelB.explicitLink.href, 'jump-rope.html?channel=C', 'explicit channel links must retain their target');

channelB.client.routeInput({
  type: 'input', channel: 'A', data: { forward: true }
});
assert.strictEqual(channelB.delivered.length, 0, 'channel B game must ignore channel A gameplay input');
assert.strictEqual(channelB.allChannels.length, 1, 'diagnostics must still receive every channel');

channelB.client.routeInput({
  type: 'input', channel: 'B', controller: 1, seq: 9,
  data: { forward: false, backward: true, left: false, right: false }
});
assert.strictEqual(channelB.delivered.length, 1);
assert.strictEqual(channelB.delivered[0].backward, true, 'selected channel input must reach the game');

const legacyA = createClient('?channel=invalid');
assert.strictEqual(legacyA.client.selectedChannel, 'A', 'invalid query must default to A');
legacyA.client.routeInput({ type: 'input', data: { left: true } });
assert.strictEqual(legacyA.delivered.length, 1, 'legacy channel-less input must route to A');
assert.strictEqual(legacyA.delivered[0].left, true);

for (const game of ['index.html', 'traffic.html', 'jump-rope.html']) {
  for (const channel of ['A', 'B', 'C']) {
    const selected = createClient(`?channel=${channel}`);
    assert.strictEqual(selected.client.selectedChannel, channel,
      `${game} must allow independent selection of channel ${channel}`);
  }
}

console.log('✅ CHANNEL ROUTING TEST PASSED: every game supports A/B/C independently, with URL persistence');
