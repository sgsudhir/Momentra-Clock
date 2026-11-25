import { ESPLoader, Transport } from "esptool-js";
import md5 from "js-md5";
import { parseOffset, validateImages, validatePreset } from "./validation.mjs";

const $ = id => document.getElementById(id);
let transport;
let loader;
let chip;
let flashBytes;
let busy = false;

function status(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}

function update() {
  const connected = !!loader;
  $("connect").disabled = busy || connected || !("serial" in navigator);
  $("disconnect").disabled = busy || !connected;
  $("flash").disabled = busy || !connected || !$("confirm").checked;
  $("custom").hidden = $("mode").value !== "custom";
  $("preset-warning").hidden = $("mode").value !== "momentra";
}

function addRow() {
  const row = document.createElement("div");
  row.className = "file-row";
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".bin,application/octet-stream";
  file.setAttribute("aria-label", "Firmware binary");
  const offset = document.createElement("input");
  offset.type = "text";
  offset.placeholder = "Offset, e.g. 0x10000";
  offset.setAttribute("aria-label", "Flash offset");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => row.remove());
  row.append(file, offset, remove);
  $("files").append(row);
}

async function disconnect(reset = false) {
  const currentTransport = transport;
  const currentLoader = loader;
  transport = undefined;
  loader = undefined;
  chip = undefined;
  flashBytes = undefined;
  $("device").textContent = "No device connected";
  if (!currentTransport) return;
  try {
    if (reset && currentLoader) await currentLoader.after();
  } finally {
    await currentTransport.disconnect();
  }
}

$("connect").addEventListener("click", async () => {
  busy = true;
  update();
  try {
    const port = await navigator.serial.requestPort();
    transport = new Transport(port);
    loader = new ESPLoader({transport, baudrate: 115200});
    status("Connecting to the bootloader; hold BOOT if required...");
    await loader.main();
    chip = loader.chip.CHIP_NAME;
    const size = await loader.detectFlashSize();
    if (!size) throw new Error("Could not detect flash size. Check the connection and try again.");
    flashBytes = loader.flashSizeBytes(size);
    if (flashBytes <= 0) throw new Error(`Unsupported detected flash size: ${size}`);
    $("device").textContent = `${chip} • ${size} flash`;
    status("Device detected. Review the firmware and warnings before flashing.");
  } catch (error) {
    let message = `Connection failed: ${error.message}`;
    try { await disconnect(); } catch (cleanupError) { message += ` Cleanup failed: ${cleanupError.message}`; }
    status(message, true);
  } finally {
    busy = false;
    update();
  }
});

$("disconnect").addEventListener("click", async () => {
  busy = true;
  update();
  try {
    await disconnect(true);
    status("Disconnected and reset the device.");
  } catch (error) {
    status(`Disconnect failed: ${error.message}`, true);
  } finally {
    busy = false;
    update();
  }
});

$("flash").addEventListener("click", async () => {
  busy = true;
  update();
  let written = false;
  let writeStarted = false;
  try {
    const preset = $("mode").value === "momentra";
    let images;
    if (preset) {
      validatePreset(chip, flashBytes);
      const response = await fetch("firmware/momentra-factory.bin");
      if (!response.ok) throw new Error(`Bundled Momentra image unavailable (HTTP ${response.status}).`);
      images = [{name: "momentra-factory.bin", address: 0, data: new Uint8Array(await response.arrayBuffer())}];
    } else {
      const rows = [...$("files").children];
      images = await Promise.all(rows.map(async row => {
        const file = row.children[0].files[0];
        if (!file) throw new Error("Select a binary for every file row.");
        if (file.size > flashBytes) throw new Error(`${file.name} exceeds the detected flash size.`);
        return {name: file.name, address: parseOffset(row.children[1].value), data: new Uint8Array(await file.arrayBuffer())};
      }));
    }
    validateImages(images, flashBytes);
    const eraseAll = $("erase").checked;
    if (!loader.IS_STUB) throw new Error("Flashing requires a supported flasher stub; this device did not start one.");
    const summary = images.map(image => `${image.name} at 0x${image.address.toString(16)} (${image.data.length} bytes)`).join("\n");
    const warning = preset ? "The Momentra factory image overwrites saved Wi-Fi credentials and settings." :
      "The selected flash sectors will be erased and overwritten. Wrong files or offsets can make the device unbootable.";
    if (!window.confirm(`${chip}, ${flashBytes} bytes flash\n\n${summary}\n\n${warning}\n${eraseAll ? "ALL FLASH WILL BE ERASED.\n" : ""}\nContinue?`)) {
      status("Flash cancelled; no data was written.");
      return;
    }
    if (eraseAll) {
      status("Erasing the entire flash...");
      writeStarted = true;
      await loader.eraseFlash();
    }
    writeStarted = true;
    await loader.writeFlash({
      fileArray: images, flashMode: "keep", flashFreq: "keep", flashSize: "keep",
      eraseAll: false, compress: true, calculateMD5Hash: data => md5(data),
      reportProgress: (index, done, total) => status(`Writing file ${index + 1} of ${images.length}: ${Math.round(done / total * 100)}%`)
    });
    written = true;
    await disconnect(true);
    status(preset ? "Flash verified and device reset. Connect to the open Momentra Clock Wi-Fi network and visit http://192.168.4.1/." : "Flash verified and device reset.");
  } catch (error) {
    const message = written ? "Flash was verified, but reset or disconnect failed" :
      writeStarted ? "Flash failed; the device may need reflashing" : "Unable to start flashing";
    status(`${message}: ${error.message}`, true);
  } finally {
    busy = false;
    update();
  }
});

$("add-file").addEventListener("click", addRow);
$("mode").addEventListener("change", update);
$("confirm").addEventListener("change", update);
addRow();
if (!("serial" in navigator)) status("Web Serial is unavailable. Open this local address in Chrome or Edge on Windows or Ubuntu.", true);
update();
