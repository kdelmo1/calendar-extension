const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, globals) {
  const source = readFileSync(join(__dirname, file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, console, ...globals });
  return exports;
}

const tick = () => new Promise(resolve => setImmediate(resolve));
const capture = { kind: 'text', text: 'Midterm February 10, 2027', pageUrl: 'https://example.com' };

function panel(initial = {}) {
  const saved = { ...initial };
  const listeners = new Set();
  const received = [];
  const storage = {
    session: {
      get: async () => ({ ...saved }),
      set: async values => {
        Object.assign(saved, values);
        const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }]));
        for (const listener of listeners) listener(changes, 'session');
      },
    },
    onChanged: {
      addListener: listener => listeners.add(listener),
      removeListener: listener => listeners.delete(listener),
    },
  };
  const { watchCaptures } = load('captureDelivery.ts', { chrome: { storage } });
  return { saved, storage, received, mount: () => watchCaptures(input => received.push(input)) };
}

test('cold panel reads empty storage, then receives its first saved capture without a live message', async () => {
  const p = panel();
  const inbox = p.mount();
  await tick();
  assert.equal(p.received.length, 0);
  await p.storage.session.set({ pendingCapture: capture, pendingCaptureId: 'first' });
  await tick();
  assert.deepEqual(p.received, [capture]);
  inbox.dispose();
});

test('initial storage read and live message start only one parse', async () => {
  const p = panel({ pendingCapture: capture, pendingCaptureId: 'first' });
  const inbox = p.mount();
  await inbox.receiveLive(capture);
  await tick();
  assert.equal(p.received.length, 1);
  assert.equal(p.saved.handledCaptureId, 'first');
  inbox.dispose();
});

test('an intentional second click with identical text starts another parse', async () => {
  const p = panel({ pendingCapture: capture, pendingCaptureId: 'first' });
  const inbox = p.mount();
  await tick();
  await p.storage.session.set({ pendingCapture: capture, pendingCaptureId: 'second' });
  await inbox.receiveLive(capture);
  await tick();
  assert.equal(p.received.length, 2);
  inbox.dispose();
});

test('reopening the panel does not replay an already handled capture', async () => {
  const p = panel({ pendingCapture: capture, pendingCaptureId: 'first' });
  p.mount().dispose(); // Like React StrictMode cleanup before the first read completes.
  const inbox = p.mount();
  await tick();
  assert.equal(p.received.length, 1);
  inbox.dispose();
  const reopened = p.mount();
  await tick();
  assert.equal(p.received.length, 1);
  reopened.dispose();
});

test('a standalone CAPTURE_READY payload still works without a saved capture', async () => {
  const p = panel();
  const inbox = p.mount();
  await inbox.receiveLive(capture);
  assert.deepEqual(p.received, [capture]);
  inbox.dispose();
});

test('worker starts saving before opening, preserves the gesture, and sends the same contract', async () => {
  let click, finishSave, finishOpen;
  const calls = [], messages = [];
  load('../background/context-menu.ts', {
    crypto: { randomUUID: () => 'first' },
    chrome: {
      runtime: { onInstalled: { addListener() {} }, sendMessage: async message => { messages.push(message); } },
      contextMenus: { onClicked: { addListener: listener => { click = listener; } } },
      storage: { session: { set: values => { calls.push(['save', values]); return new Promise(resolve => { finishSave = resolve; }); } } },
      sidePanel: { open: options => { calls.push(['open', options]); return new Promise(resolve => { finishOpen = resolve; }); } },
    },
  });
  click({ menuItemId: 'add-selected-dates', selectionText: capture.text, pageUrl: capture.pageUrl }, { windowId: 1 });
  assert.deepEqual(calls.map(call => call[0]), ['save', 'open']);
  assert.equal(calls[0][1].pendingCaptureId, 'first');
  finishOpen(); await tick();
  assert.equal(messages.length, 0);
  finishSave(); await tick();
  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0])), { type: 'CAPTURE_READY', payload: capture });
});
