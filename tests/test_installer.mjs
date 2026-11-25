import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {parseOffset, validateImages, validatePreset} from "../installer/validation.mjs";

assert.equal(parseOffset("0x10000"), 65536);
assert.equal(parseOffset("4096"), 4096);
for (const value of ["", "-4096", "0x1001", "3e3", "0x", "9007199254740992"]) {
  assert.throws(() => parseOffset(value));
}
const image = (name, address, size) => ({name, address, data: new Uint8Array(size)});
validateImages([image("a", 0, 4097), image("b", 8192, 1)], 12288);
assert.throws(() => validateImages([], 4096), /at least one/);
assert.throws(() => validateImages([image("a", 0, 0)], 4096), /empty/);
assert.throws(() => validateImages([image("a", 0, 4097)], 4096), /exceeds/);
assert.throws(() => validateImages([image("a", 0, 4097), image("b", 4096, 1)], 12288), /overlap/);
assert.throws(() => validateImages([image("a", 1, 1)], 4096), /unaligned/);
assert.throws(() => validateImages([image("a", 0, 1)], 0), /flash size/);
validatePreset("ESP32", 4 * 1024 * 1024);
assert.throws(() => validatePreset("ESP32-S3", 8 * 1024 * 1024));
assert.throws(() => validatePreset("ESP32", 2 * 1024 * 1024));

const source = (await readFile(new URL("../installer/app.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "");

async function setup(chipName = "ESP32", stub = true) {
  const calls = [];
  const elements = {};
  function element() {
    return {
      children: [], checked: false, value: "", hidden: false, textContent: "",
      classList: {toggle() {}},
      addEventListener(type, fn) { this[type] = fn; },
      setAttribute() {},
      append(...children) { this.children.push(...children); },
      remove() {}
    };
  }
  for (const id of ["status", "connect", "disconnect", "flash", "custom", "preset-warning",
    "mode", "files", "device", "confirm", "erase", "add-file"]) elements[id] = element();
  elements.mode.value = "momentra";
  class Transport {
    async disconnect() { calls.push("disconnect"); }
  }
  class ESPLoader {
    constructor() { this.chip = {CHIP_NAME: chipName}; this.IS_STUB = stub; }
    async main() {}
    async detectFlashSize() { return "4MB"; }
    flashSizeBytes() { return 4 * 1024 * 1024; }
    async eraseFlash() { calls.push("erase"); }
    async writeFlash(options) { calls.push(options); }
    async after() { calls.push("reset"); }
  }
  let approved = true;
  const context = {
    document: {getElementById: id => elements[id], createElement: element},
    navigator: {serial: {requestPort: async () => ({})}},
    window: {confirm: text => { calls.push(text); return approved; }},
    fetch: async () => ({ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer}),
    ESPLoader, Transport, md5: () => "hash", parseOffset, validateImages, validatePreset, Uint8Array
  };
  vm.runInNewContext(source, context);
  await elements.connect.click();
  elements.confirm.checked = true;
  elements.confirm.change();
  return {elements, calls, cancel: () => { approved = false; }};
}

{
  const {elements, calls} = await setup();
  await elements.flash.click();
  const write = calls.find(call => typeof call === "object");
  assert.equal(write.fileArray[0].address, 0);
  assert.equal(write.eraseAll, false);
  assert.equal(write.calculateMD5Hash(new Uint8Array([1])), "hash");
  assert.equal(calls.includes("erase"), false);
  assert.match(calls[0], /overwrites saved Wi-Fi credentials/);
  assert.match(elements.status.textContent, /Flash verified/);
}
{
  const {elements, calls} = await setup("ESP32-S3");
  await elements.flash.click();
  assert.match(elements.status.textContent, /original ESP32/);
  assert.equal(calls.length, 0);
}
{
  const {elements, calls} = await setup("ESP32", false);
  await elements.flash.click();
  assert.match(elements.status.textContent, /requires a supported flasher stub/);
  assert.equal(calls.length, 0);
}
{
  const {elements, calls, cancel} = await setup();
  elements.erase.checked = true;
  cancel();
  await elements.flash.click();
  assert.equal(calls.includes("erase"), false);
  assert.equal(calls.some(call => typeof call === "object"), false);
  assert.match(elements.status.textContent, /cancelled/);
}
{
  const {elements, calls} = await setup();
  elements.mode.value = "custom";
  elements.erase.checked = true;
  const row = elements.files.children[0];
  row.children[0].files = [{name: "app.bin", size: 2, arrayBuffer: async () => new Uint8Array([1, 2]).buffer}];
  row.children[1].value = "0x10000";
  await elements.flash.click();
  assert.equal(calls[1], "erase");
  assert.equal(calls[2].fileArray[0].address, 0x10000);
  assert.equal(calls[2].eraseAll, false);
  assert.match(calls[0], /ALL FLASH WILL BE ERASED/);
}
console.log("installer safety tests passed");
