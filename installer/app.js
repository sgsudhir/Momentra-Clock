const status = document.getElementById("installer-status");
const controls = document.getElementById("installer-controls");
const confirm = document.getElementById("confirm");
const connect = document.getElementById("connect");

async function prepareInstaller() {
  try {
    const response = await fetch("manifest.json", {cache: "no-store"});
    if (!response.ok) throw new Error("Firmware manifest is unavailable.");
    const manifest = await response.json();
    const part = manifest.builds?.find(build => build.chipFamily === "ESP32")?.parts?.[0];
    if (!part || part.offset !== 0 || part.path !== "firmware/momentra-factory.bin") {
      throw new Error("The firmware manifest is invalid.");
    }
    const firmware = await fetch(new URL(part.path, response.url), {method: "HEAD", cache: "no-store"});
    if (!firmware.ok) throw new Error("The factory firmware is unavailable.");
    await Promise.race([
      customElements.whenDefined("esp-web-install-button"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("The installer could not be loaded.")), 10000))
    ]);
    controls.hidden = false;
    status.textContent = "Installer ready. Confirm the warning above, then connect your board.";
    connect.disabled = !confirm.checked;
  } catch (error) {
    status.classList.add("error");
    status.textContent = `${error.message} Check the connection or try again later.`;
  }
}

confirm.addEventListener("change", () => { connect.disabled = !confirm.checked; });
prepareInstaller();
