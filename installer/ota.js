const $ = id => document.getElementById(id);
const headers = {"X-Momentra-Request": "1"};
const fields = ["version", "ip", "uptime", "rssi", "brightness", "alarms", "hourly", "health", "memory", "chip"];
const MAX_OTA_BYTES = 0x1e0000;
let target = "momentra.local";
let online = false;
let uploading = false;
let stopped = false;
let generation = 0;
let timer;
let serialBusy = () => false;

function validateClockHost(raw) {
  const host = String(raw || "").trim();
  if (host === "momentra.local") return host;
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)) {
    throw new Error("Enter momentra.local or a private IPv4 address.");
  }
  const [a, b] = parts.map(Number);
  const isPrivateOrLinkLocal =
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254);
  if (!isPrivateOrLinkLocal) {
    throw new Error("Enter momentra.local or a private/link-local IPv4 address.");
  }
  return host;
}

async function validateAppBinary(firmware) {
  if (!firmware || !firmware.size || firmware.size > MAX_OTA_BYTES) {
    throw new Error("Application image must be between 1 byte and 1.875 MiB.");
  }
  if (typeof firmware.slice !== "function") return;
  const headerBuf = await firmware.slice(0, 36).arrayBuffer();
  const bytes = new Uint8Array(headerBuf);
  if (bytes.length < 36 || bytes[0] !== 0xe9) {
    throw new Error("Invalid ESP32 image header (expected 0xE9 magic byte).");
  }
  const hasAppDescMagic =
    bytes[0x20] === 0x32 &&
    bytes[0x21] === 0x54 &&
    bytes[0x22] === 0xcd &&
    bytes[0x23] === 0xab;
  if (!hasAppDescMagic) {
    throw new Error("File does not look like an ESP32 application .bin (missing app descriptor). Do not upload a factory or bootloader image.");
  }
}

function connection(state) {
  $("ota-connection").textContent = state;
  $("ota-connection").className = `ota-connection ${state.toLowerCase()}`;
}

function setProgress(percent, visible) {
  const bar = $("ota-progress");
  if (!bar) return;
  bar.hidden = !visible;
  bar.value = Math.max(0, Math.min(100, Math.round(percent)));
}

function controls() {
  $("ota-upload").disabled = !online || uploading || stopped || !$("ota-source").value || !$("ota-confirm").checked;
  $("ota-connect").disabled = uploading || stopped;
  $("ota-host").disabled = uploading || stopped;
  $("ota-source").disabled = uploading || stopped;
  $("ota-file").disabled = uploading || stopped;
  $("ota-confirm").disabled = uploading || stopped;
  $("stop-server").disabled = uploading || stopped;
}

function clearStatus() {
  for (const field of fields) $(`ota-${field}`).textContent = "—";
  $("ota-dashboard").hidden = true;
  $("ota-dashboard").removeAttribute("href");
}

function showStatus(data) {
  if (typeof data.firmware_version !== "string" || typeof data.chip_id !== "string" ||
      typeof data.wifi_connected !== "boolean" || !Array.isArray(data.alarms)) {
    throw new Error("The device did not return a compatible Momentra status.");
  }
  const enabledCount = data.alarms.filter(a => a && typeof a === "object" && a.enabled).length;
  $("ota-version").textContent = data.firmware_version;
  $("ota-ip").textContent = data.local_ip || "Unavailable";
  $("ota-uptime").textContent = typeof data.uptime_seconds === "number" ? `${Math.floor(data.uptime_seconds / 3600)}h ${Math.floor(data.uptime_seconds % 3600 / 60)}m` : "Unavailable";
  $("ota-rssi").textContent = typeof data.wifi_rssi === "number" ? `${data.wifi_rssi} dBm` : "Unavailable";
  $("ota-brightness").textContent = typeof data.brightness === "number" ? `${data.brightness}%` : "Unavailable";
  $("ota-alarms").textContent = `${enabledCount} / ${data.alarms.length}${data.ringing ? " · ringing" : ""}`;
  $("ota-hourly").textContent = data.hourly_enabled ? "On" : "Off";
  $("ota-health").textContent = `${data.time_valid ? "Time synced" : "Time unavailable"} · ${data.display_ready ? "Display ready" : "Display unavailable"}`;
  $("ota-memory").textContent = typeof data.free_heap_bytes === "number" ? `${Math.round(data.free_heap_bytes / 1024)} KiB` : "Unavailable";
  $("ota-chip").textContent = data.chip_id;
  return data.wifi_connected && !data.setup_ap;
}

async function request(path, options = {}) {
  const response = await fetch(path, {method: "POST", ...options, headers: {...headers, ...(options.headers || {})}});
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try { message = JSON.parse(text).error || text; } catch { /* Clock may return plain text. */ }
    throw new Error(message.trim() || `HTTP ${response.status}`);
  }
  return text;
}

function uploadWithProgress(firmware, onProgress) {
  if (typeof XMLHttpRequest !== "function") {
    return request("/local/ota", {
      body: firmware,
      headers: {"X-Momentra-Target": target, "Content-Type": "application/octet-stream"}
    });
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/local/ota", true);
    xhr.timeout = 120000;
    xhr.setRequestHeader("X-Momentra-Request", "1");
    xhr.setRequestHeader("X-Momentra-Target", target);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) {
        onProgress((event.loaded / event.total) * 100);
      }
    };
    xhr.onload = () => {
      const text = xhr.responseText || "";
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve(text);
        return;
      }
      let message = text;
      try { message = JSON.parse(text).error || text; } catch { /* Clock may return plain text. */ }
      reject(new Error(message.trim() || `HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error during firmware upload."));
    xhr.ontimeout = () => reject(new Error("Firmware upload timed out."));
    xhr.send(firmware);
  });
}

async function poll(id) {
  if (stopped || uploading || id !== generation) return;
  try {
    const text = await request("/local/status", {
      headers: {"X-Momentra-Target": target},
      signal: AbortSignal.timeout(6000)
    });
    if (id !== generation || uploading || stopped) return;
    const available = showStatus(JSON.parse(text));
    online = available;
    $("ota-dashboard").href = `http://${target}/`;
    $("ota-dashboard").hidden = false;
    connection("Live");
    $("ota-message").textContent = available ? `Connected to ${target}. Choose a compatible application image to update.` : "Clock is reachable, but OTA requires station-only Wi-Fi mode.";
  } catch (error) {
    if (id !== generation || uploading || stopped) return;
    online = false;
    clearStatus();
    connection("Disconnected");
    $("ota-message").textContent = `Cannot reach ${target}: ${error.message}. Enter the clock's private IP address and select Connect.`;
  }
  controls();
  if (id === generation && !stopped && !uploading) timer = setTimeout(() => poll(id), 5000);
}

function connect() {
  clearTimeout(timer);
  generation++;
  online = false;
  $("ota-confirm").checked = false;
  clearStatus();
  let validated;
  try {
    validated = validateClockHost($("ota-host").value);
  } catch (error) {
    connection("Disconnected");
    $("ota-message").textContent = error.message;
    controls();
    return;
  }
  target = validated;
  connection("Connecting");
  $("ota-message").textContent = `Connecting to ${target}…`;
  controls();
  poll(generation);
}

$("ota-connect").addEventListener("click", connect);
$("ota-source").addEventListener("change", () => {
  $("ota-file-row").hidden = $("ota-source").value !== "custom";
  controls();
});
$("ota-confirm").addEventListener("change", controls);
$("ota-upload").addEventListener("click", async () => {
  if (!online || uploading) return;
  const source = $("ota-source").value;
  const file = source === "custom" ? $("ota-file").files[0] : null;
  if (source === "custom" && !file) {
    $("ota-result").textContent = "Select an application .bin file first.";
    return;
  }
  const image = source === "esp32" ? "firmware/momentra-esp32-ota.bin" : "firmware/momentra-esp32s3-ota.bin";
  const label = file ? file.name : source === "esp32" ? "bundled ESP32 application" : "bundled ESP32-S3 application";
  if (!window.confirm(`Update ${target} using ${label}?\n\nVerify the chip and partition layout. The clock will blank and reboot. Do not interrupt power or the network.`)) return;
  uploading = true;
  generation++;
  clearTimeout(timer);
  clearStatus();
  setProgress(0, true);
  controls();
  $("ota-result").textContent = "Validating and uploading application firmware. Do not interrupt power or the network.";
  try {
    let firmware = file;
    if (!firmware) {
      const response = await fetch(image);
      if (!response.ok) throw new Error(`Bundled application image unavailable (HTTP ${response.status}).`);
      firmware = await response.blob();
    }
    await validateAppBinary(firmware);
    const response = await uploadWithProgress(firmware, pct => {
      setProgress(pct, true);
      $("ota-result").textContent = `Uploading application firmware (${Math.round(pct)}%)… Do not interrupt power or the network.`;
    });
    if (JSON.parse(response).ok !== true) throw new Error("Clock did not confirm the update.");
    setProgress(100, true);
    $("ota-result").textContent = "Update accepted. The clock is rebooting; reconnecting to verify status.";
  } catch (error) {
    setProgress(0, false);
    $("ota-result").textContent = `Update failed or its response was interrupted: ${error.message}. Check the clock before retrying; the update may have been accepted.`;
  } finally {
    uploading = false;
    online = false;
    $("ota-confirm").checked = false;
    clearStatus();
    connection("Connecting");
    $("ota-message").textContent = `Waiting to reconnect to ${target}…`;
    controls();
    timer = setTimeout(() => poll(generation), 5000);
  }
});

$("stop-server").addEventListener("click", async () => {
  if (serialBusy()) {
    $("stop-message").textContent = "Finish the USB operation before stopping the server.";
    return;
  }
  if (!window.confirm("Stop the local server? Finish any USB flash first. The flasher page will no longer work until the launcher is restarted.")) return;
  try {
    await request("/local/stop");
    stopped = true;
    generation++;
    clearTimeout(timer);
    online = false;
    clearStatus();
    connection("Disconnected");
    $("ota-message").textContent = "Local server stopped. Restart the launcher to reconnect.";
    $("stop-message").textContent = "Server stopped. Restart the launcher to use this page again.";
    controls();
  } catch (error) {
    $("stop-message").textContent = `Could not stop server: ${error.message}`;
  }
});

export function initializeOTA(isSerialBusy) {
  serialBusy = isSerialBusy;
  connect();
}
