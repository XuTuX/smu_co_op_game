class TwelveButtonTest {
  constructor() {
    this.actions = ['forward', 'backward', 'left', 'right'];
    this.states = { A: this.emptyState(), B: this.emptyState(), C: this.emptyState() };
    this.received = { A: false, B: false, C: false };
    this.counts = { A: this.emptyCounts(), B: this.emptyCounts(), C: this.emptyCounts() };

    const receiver = {
      setChannelInput: (channel, data, message) => this.handleChannelInput(channel, data, message),
      setEsp32Input: () => {}
    };
    this.network = new NetworkClient(receiver, (_connected, status) => this.handleStatus(status));
    // This page monitors all three channels at once, so ask the hub not to filter.
    this.network.receiveAllChannels = true;
    this.renderSelectedChannel();
    this.network.connect();
  }

  emptyState() {
    return { forward: false, backward: false, left: false, right: false };
  }

  emptyCounts() {
    return { forward: 0, backward: 0, left: 0, right: 0 };
  }

  handleStatus(status = {}) {
    this.updateStatusBadge('hub-status', Boolean(status.hub), 'Hub');
    this.updateStatusBadge('controller-status', Boolean(status.controller), 'Controller');
    if (!status.controller) {
      document.getElementById('last-event').textContent = status.hub ? 'Controller 연결 대기' : 'Hub 연결 대기';
    }
  }

  updateStatusBadge(id, connected, label) {
    const badge = document.getElementById(id);
    badge.classList.toggle('connected', connected);
    badge.classList.toggle('disconnected', !connected);
    badge.querySelector('span:last-child').textContent = `${label} ${connected ? 'ONLINE' : 'OFFLINE'}`;
  }

  handleChannelInput(channel, data, message) {
    if (!['A', 'B', 'C'].includes(channel)) return;
    const next = this.emptyState();
    for (const action of this.actions) next[action] = Boolean(data && data[action]);

    const changed = this.actions.filter((action) =>
      this.received[channel] && next[action] !== this.states[channel][action]
    );
    for (const action of changed) {
      if (next[action]) this.counts[channel][action] += 1;
    }

    this.received[channel] = true;
    this.states[channel] = next;
    this.renderChannel(channel);

    if (message && changed.length > 0) {
      const lastAction = changed[changed.length - 1];
      const button = this.actions.indexOf(lastAction) + 1;
      const state = next[lastAction] ? 'DOWN' : 'UP';
      const seq = Number.isFinite(Number(message.seq)) ? ` · seq ${message.seq}` : '';
      document.getElementById('last-event').textContent = `${channel}-${button} ${state}${seq}`;
    }
  }

  renderChannel(channel) {
    for (const action of this.actions) {
      const card = document.querySelector(`[data-channel="${channel}"][data-action="${action}"]`);
      const pressed = this.states[channel][action];
      card.classList.toggle('pressed', pressed);
      card.querySelector('.button-state').textContent = pressed ? 'DOWN' : 'UP';
      card.querySelector('[data-count]').textContent = String(this.counts[channel][action]);
    }
  }

  renderSelectedChannel() {
    const selected = this.network.selectedChannel;
    document.getElementById('selected-channel').textContent = selected;
    document.querySelectorAll('[data-channel-panel]').forEach((panel) => {
      panel.classList.toggle('selected', panel.dataset.channelPanel === selected);
    });
    document.querySelectorAll('[data-channel-link]').forEach((link) => {
      link.classList.toggle('active', link.dataset.channelLink === selected);
    });
  }
}

window.addEventListener('DOMContentLoaded', () => new TwelveButtonTest());
