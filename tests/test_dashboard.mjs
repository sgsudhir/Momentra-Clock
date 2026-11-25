import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html = readFileSync(new URL('../main/web/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const nodes = new Map();
function element(id) {
  if (!nodes.has(id)) {
    const fields = new Proxy({}, {get(target, key) {
      return target[key] ||= {value: '', disabled: false};
    }});
    nodes.set(id, {
      elements: fields, options: [], value: '', dataset: {},
      classList: {add() {}, remove() {}, toggle() {}},
      add(option) { this.options.push(option); },
      replaceChildren() {},
      querySelector() { return {disabled: false}; },
    });
  }
  return nodes.get(id);
}
const requests = [];
class FormDataStub {
  constructor(form) {
    this.entries = Object.entries(form.elements).map(([name, field]) => [name, field.value]);
  }
  [Symbol.iterator]() { return this.entries[Symbol.iterator](); }
}
const context = {
  document: {getElementById: element, createElement: () => element('created'), documentElement: {dataset: {}}},
  localStorage: {getItem: () => null},
  Option: class { constructor(text, value) { this.text = text; this.value = value; } },
  FormData: FormDataStub,
  URLSearchParams, AbortController,
  performance: {now: () => 0},
  setTimeout() {}, clearTimeout() {}, setInterval() {},
  fetch(path, options) {
    if (path === '/api/status') return new Promise(() => {});
    requests.push({path, options});
    return Promise.resolve({ok: true, json: async () => ({ok: true})});
  },
};
runInNewContext(script + '\nglobalThis.setStatusForTest = value => { data = value; renderStatus(); };', context);

const form = element('second-zone');
form.elements.timezone_secondary.value = 'America/New_York';
form.elements.timezone_secondary_enabled.value = '1';
assert.equal(typeof form.onsubmit, 'function', 'Second timezone handler must be installed on page load');
let prevented = false;
form.onsubmit({currentTarget: form, preventDefault() { prevented = true; }});
await new Promise(resolve => setImmediate(resolve));
assert.ok(prevented);
assert.equal(requests.length, 1);
assert.equal(requests[0].path, '/api/timezones');
assert.equal(requests[0].options.method, 'POST');
assert.equal(requests[0].options.body.get('timezone_secondary'), 'America/New_York');
assert.equal(requests[0].options.body.get('timezone_secondary_enabled'), '1');
const status = {
  firmware_version: '1.0.0', timezone_primary: 'Asia/Kolkata', timezone_secondary_enabled: 1,
  format_12h: 1, alarms: [], alarm_next_seconds: [], free_heap_bytes: 0, min_free_heap_bytes: 0,
  stopwatch_state: 0, stopwatch_ms: 0, reminder_state: 0, reminder_ms: 0,
};
context.setStatusForTest(status);
const settings = element('settings');
assert.equal(element('firmware-version').textContent, '1.0.0');
assert.equal(settings.elements.format_12h.value, '0');
assert.equal(settings.elements.format_12h.disabled, true);
settings.onsubmit({currentTarget: settings, preventDefault() {}});
await new Promise(resolve => setImmediate(resolve));
assert.equal(requests[1].options.body.get('format_12h'), '1');
status.timezone_secondary_enabled = 0;
context.setStatusForTest(status);
assert.equal(settings.elements.format_12h.disabled, false);
assert.equal(settings.elements.format_12h.value, '1');
console.log('dashboard timezone submission test passed');
