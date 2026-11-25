import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../installer/app.js", import.meta.url), "utf8");

async function loadInstaller({manifest, firmwareOk = true}) {
  const elements = {
    "installer-status": {textContent: "", classList: {values: [], add(value) { this.values.push(value); }}},
    "installer-controls": {hidden: true},
    "confirm": {checked: false, addEventListener(_type, listener) { this.change = listener; }},
    "connect": {disabled: true}
  };
  const calls = [];
  const context = {
    document: {getElementById: id => elements[id]},
    fetch: async (url, options) => {
      calls.push({url: String(url), method: options?.method || "GET"});
      if (String(url) === "manifest.json") {
        return {ok: true, url: "https://example.test/manifest.json", json: async () => manifest};
      }
      return {ok: firmwareOk};
    },
    customElements: {whenDefined: async () => {}},
    setTimeout: () => 0,
    URL
  };
  vm.runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return {elements, calls};
}

const validManifest = {
  builds: [{chipFamily: "ESP32", parts: [{path: "firmware/momentra-factory.bin", offset: 0}]}]
};
{
  const {elements, calls} = await loadInstaller({manifest: validManifest});
  assert.equal(elements["installer-controls"].hidden, false);
  assert.equal(elements.connect.disabled, true);
  elements.confirm.checked = true;
  elements.confirm.change();
  assert.equal(elements.connect.disabled, false);
  elements.confirm.checked = false;
  elements.confirm.change();
  assert.equal(elements.connect.disabled, true);
  assert.equal(calls[1].method, "HEAD");
  assert.equal(calls[1].url, "https://example.test/firmware/momentra-factory.bin");
}
{
  const {elements} = await loadInstaller({manifest: validManifest, firmwareOk: false});
  assert.equal(elements["installer-controls"].hidden, true);
  assert.match(elements["installer-status"].textContent, /firmware is unavailable/);
}
{
  const {elements, calls} = await loadInstaller({manifest: {builds: []}});
  assert.equal(elements["installer-controls"].hidden, true);
  assert.match(elements["installer-status"].textContent, /manifest is invalid/);
  assert.equal(calls.length, 1);
}
console.log("browser installer tests passed");
