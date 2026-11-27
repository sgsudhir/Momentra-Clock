import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

function makeValidAppBlob(size = 64) {
  const bytes = new Uint8Array(size);
  bytes[0] = 0xe9;
  bytes[0x20] = 0x32;
  bytes[0x21] = 0x54;
  bytes[0x22] = 0xcd;
  bytes[0x23] = 0xab;
  return new Blob([bytes]);
}

const source = (await readFile(new URL("../installer/ota.js", import.meta.url), "utf8"))
  .replace("export function initializeOTA", "function initializeOTA");
const ids = ["ota-connection", "ota-upload", "ota-connect", "ota-host", "ota-source", "ota-file",
  "ota-confirm", "ota-progress", "stop-server", "ota-message", "ota-result", "ota-file-row", "stop-message", "ota-dashboard",
  ...["version", "ip", "uptime", "rssi", "brightness", "alarms", "hourly", "health", "memory", "chip"].map(s => `ota-${s}`)];
const elements = Object.fromEntries(ids.map(id => [id, {
  value: "", checked: false, disabled: false, hidden: false, textContent: "", files: [],
  addEventListener(type, fn) { this[type] = fn; },
  removeAttribute(name) { delete this[name]; }
}]));
elements["ota-host"].value = "momentra.local";
const status = {firmware_version: "1.0.0", chip_id: "ABC", wifi_connected: true, setup_ap: false,
  alarms: [{enabled: 1}, null], local_ip: "192.168.1.10", uptime_seconds: 3600, wifi_rssi: -50};
const calls = [];
let serialBusy = false;
let fail = false;
const validAppBlob = makeValidAppBlob();
const context = {
  document: {getElementById: id => elements[id]},
  window: {confirm: () => true},
  AbortSignal, setTimeout: () => 1, clearTimeout: () => {},
  fetch: async (url, options) => {
    calls.push({url, options});
    if (url === "/local/status") {
      if (fail) throw new Error("offline");
      return {ok: true, text: async () => JSON.stringify(status)};
    }
    if (url.startsWith("firmware/")) return {ok: true, blob: async () => validAppBlob};
    return {ok: true, text: async () => '{"ok":true}'};
  }
};
vm.runInNewContext(`${source}\ninitializeOTA(() => isBusy());`, {...context, isBusy: () => serialBusy});
const settle = () => new Promise(resolve => setImmediate(resolve));
await settle();
assert.equal(elements["ota-connection"].textContent, "Live");
assert.equal(elements["ota-version"].textContent, "1.0.0");
assert.equal(elements["ota-alarms"].textContent, "1 / 2");
assert.equal(elements["ota-dashboard"].hidden, false);
assert.equal(elements["ota-dashboard"].href, "http://momentra.local/");
assert.equal(calls[0].options.headers["X-Momentra-Target"], "momentra.local");

// Invalid host rejection
const callsBeforeInvalidHost = calls.length;
elements["ota-host"].value = "8.8.8.8";
elements["ota-connect"].click();
await settle();
assert.equal(elements["ota-connection"].textContent, "Disconnected");
assert.equal(elements["ota-dashboard"].hidden, true);
assert.equal(elements["ota-dashboard"].href, undefined);
assert.match(elements["ota-message"].textContent, /private/);
assert.equal(calls.length, callsBeforeInvalidHost);

fail = true;
elements["ota-host"].value = "192.168.1.10";
elements["ota-connect"].click();
await settle();
assert.equal(elements["ota-connection"].textContent, "Disconnected");
assert.equal(elements["ota-version"].textContent, "—");
assert.equal(elements["ota-dashboard"].hidden, true);
assert.equal(elements["ota-dashboard"].href, undefined);
assert.match(elements["ota-message"].textContent, /offline/);
fail = false;
elements["ota-connect"].click();
await settle();
assert.equal(elements["ota-connection"].textContent, "Live");
assert.equal(elements["ota-dashboard"].href, "http://192.168.1.10/");
assert.equal(calls.at(-1).options.headers["X-Momentra-Target"], "192.168.1.10");

status.setup_ap = true;
elements["ota-connect"].click();
await settle();
assert.equal(elements["ota-dashboard"].hidden, false);
assert.equal(elements["ota-upload"].disabled, true);
status.setup_ap = false;
elements["ota-connect"].click();
await settle();

// Invalid .bin magic rejection
elements["ota-source"].value = "custom";
elements["ota-source"].change();
elements["ota-file"].files = [new Blob([new Uint8Array(64)])];
elements["ota-confirm"].checked = true;
elements["ota-confirm"].change();
const callsBeforeInvalidBin = calls.length;
await elements["ota-upload"].click();
assert.equal(calls.length, callsBeforeInvalidBin);
assert.match(elements["ota-result"].textContent, /0xE9/);
assert.equal(elements["ota-confirm"].checked, false);
assert.equal(elements["ota-upload"].disabled, true);

// Reconnect and test valid bundled OTA + confirm reset
elements["ota-connect"].click();
await settle();
elements["ota-source"].value = "esp32s3";
elements["ota-source"].change();
elements["ota-confirm"].checked = true;
elements["ota-confirm"].change();
assert.equal(elements["ota-upload"].disabled, false);
await elements["ota-upload"].click();
assert.ok(calls.some(call => call.url === "firmware/momentra-esp32s3-ota.bin"));
const upload = calls.find(call => call.url === "/local/ota");
assert.equal(upload.options.headers["X-Momentra-Target"], "192.168.1.10");
assert.equal(new Uint8Array(await upload.options.body.arrayBuffer())[0], 0xe9);
assert.match(elements["ota-result"].textContent, /Update accepted/);
assert.equal(elements["ota-dashboard"].hidden, true);
assert.equal(elements["ota-confirm"].checked, false);

serialBusy = true;
await elements["stop-server"].click();
assert.match(elements["stop-message"].textContent, /Finish the USB operation/);
assert.equal(calls.some(call => call.url === "/local/stop"), false);
serialBusy = false;
await elements["stop-server"].click();
assert.match(elements["stop-message"].textContent, /Server stopped/);
console.log("installer OTA tests passed");
