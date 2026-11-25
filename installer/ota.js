const $ = id => document.getElementById(id);
const headers = {"X-Momentra-Request": "1"};
const fields = ["version", "ip", "uptime", "rssi", "brightness", "alarms", "hourly", "health", "memory", "chip"];
let target = "momentra.local";
let online = false;
let uploading = false;
let stopped = false;
let generation = 0;
let timer;
let serialBusy = () => false;

function connection(state) {
  $("ota-connection").textContent = state;
  $("ota-connection").className = `ota-connection ${state.toLowerCase()}`;
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
}

function showStatus(data) {
  if (typeof data.firmware_version !== "string" || typeof data.chip_id !== "string" ||
      typeof data.wifi_connected !== "boolean" || !Array.isArray(data.alarms)) {
    throw new Error("The device did not return a compatible Momentra status.");
  }
  $("ota-version").textContent = data.firmware_version;
  $("ota-ip").textContent = data.local_ip || "Unavailable";
  $("ota-uptime").textContent = typeof data.uptime_seconds === "number" ? `${Math.floor(data.uptime_seconds / 3600)}h ${Math.floor(data.uptime_seconds % 3600 / 60)}m` : "Unavailable";
  $("ota-rssi").textContent = typeof data.wifi_rssi === "number" ? `${data.wifi_rssi} dBm` : "Unavailable";
  $("ota-brightness").textContent = typeof data.brightness === "number" ? `${data.brightness}%` : "Unavailable";
  $("ota-alarms").textContent = `${data.alarms.filter(a => a.enabled).length} / ${data.alarms.length}${data.ringing ? " · ringing" : ""}`;
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
  target = $("ota-host").value.trim();
  generation++;
  online = false;
  $("ota-confirm").checked = false;
  clearStatus();
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
  controls();
  $("ota-result").textContent = "Uploading application firmware. Do not interrupt power or the network.";
  try {
    let firmware = file;
    if (!firmware) {
      const response = await fetch(image);
      if (!response.ok) throw new Error(`Bundled application image unavailable (HTTP ${response.status}).`);
      firmware = await response.blob();
    }
    if (!firmware.size || firmware.size > 0x1e0000) throw new Error("Application image must fit the 1.875 MiB OTA slot.");
    const response = await request("/local/ota", {body: firmware, headers: {"X-Momentra-Target": target, "Content-Type": "application/octet-stream"}});
    if (JSON.parse(response).ok !== true) throw new Error("Clock did not confirm the update.");
    $("ota-result").textContent = "Update accepted. The clock is rebooting; reconnecting to verify status.";
  } catch (error) {
    $("ota-result").textContent = `Update failed or its response was interrupted: ${error.message}. Check the clock before retrying; the update may have been accepted.`;
  } finally {
    uploading = false;
    online = false;
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
