# Operations and troubleshooting

[Wiki home](README.md) · [Installation](installation.md) ·
[Dashboard](dashboard.md) · [API](api.md) · [Architecture](architecture.md)

## Routine checks

- Verify the browser's **Live** state, valid NTP time, station connection,
  panel readability and buzzer operation. `display_ready` and
  `buzzer_configured` report software state, not electrical health.
- Inspect uptime, RSSI and free/minimum heap as diagnostic indicators, not
  guarantees. Record serial logs without sharing credentials or identifiers
  unnecessarily.
- Test alarms with a safe test schedule. Alarms and chimes are suppressed
  when time is invalid or 12 hours old; the device is not a safety alarm.
- After power loss, verify time sync and persistent settings. Stopwatch,
  reminder and ongoing sounds do not survive restart.

## Symptoms and checks

| Symptom | Checks |
| --- | --- |
| Cannot open dashboard | Confirm client network and station IP in serial logs/router. Try the IP if mDNS is unsupported or conflicts. Check setup AP at `192.168.4.1` when active. |
| Setup AP appears unexpectedly | Station credentials or connection may have failed; check AP coverage, credentials, DHCP and logs. Setup is open and should be used only in a trusted environment. |
| Wi-Fi scan fails or misses a network | Retry after station connection settles; scans are bounded and omit hidden names. Choose **Other / hidden network** for a hidden SSID. |
| Panel shows `WiFi` | The station is disconnected. Verify network and reconnect; setup AP alone is not a station connection. |
| Panel shows `SYNC` | Check DNS and NTP access to `pool.ntp.org`, then inspect time validity and sync age. At 12 hours without a successful sync, time becomes stale. |
| Blank or garbled panel | Check power, common ground, enable state, brightness, physical connector mapping, scan order, DATA/OE polarity and logic levels. `display_ready` does not confirm the panel is wired correctly. |
| Flicker | Check supply under load and signal integrity, then test brightness, Wi-Fi, HTTP and flash load separately. A core-1 hardware-timer wakeup and frame boundaries reduce timing variation but do not guarantee flicker-free operation; OTA intentionally blanks the panel. |
| Alarm does not sound | Check enabled slot, 24-hour local schedule, valid time, configured and physically working buzzer, missed-minute behavior and serial NVS errors. A one-shot may already be disabled. |
| Reminder unavailable | A buzzer must be configured; start only from stopped state with 1–86400 seconds. |
| API returns 400/409 | Check [field ranges and transitions](api.md); refresh status after a conflict and retry only if appropriate. |
| OTA returns 403 | Connect the station and confirm setup AP is inactive. OTA is prohibited in AP/AP+station mode. |
| OTA fails or page disconnects | Check image compatibility, size, connectivity and serial logs. An error after boot-slot selection may still require reboot or serial recovery. Do not assume an interrupted response means the update did not take effect. |

## Firmware update and recovery

1. Prepare and verify a trusted application `.bin` built for this exact
   hardware, settings and compatible partition layout. Keep a known-good
   image and serial access available.
2. Check for active or imminent alarms, reminders and stopwatch sessions.
   The update pauses the display and a successful update reboots the device;
   timers and ongoing sounds are lost.
3. Confirm station-only mode, stable power, correct target address and network
   isolation. Use **Device maintenance** or the
   [raw OTA API](api.md#post-apiota).
4. Wait for the upload response and reboot; reconnect using the IP or mDNS.
   Confirm the firmware behaves as intended, time syncs, settings remain
   intact and display, buzzer and network work on hardware.
5. If the device does not recover, inspect the serial monitor. The bootloader
   rollback configuration can revert an image that fails before startup
   confirmation, but cannot detect every later behavioral defect. Use the
   planned serial recovery procedure and known-good compatible image if
   needed. Do not erase NVS or change partition tables casually.

The new image is marked valid once local subsystem initialization succeeds;
this is not proof of working Internet, visible display or correct sound.
An OTA failure normally attempts to resume the panel; check logs if it does
not. A failure to schedule restart after slot selection can leave the new
image selected even though the API returned an error.

## Security and deployment boundaries

The setup AP is open, and the dashboard and API are plain HTTP without
authentication. OTA's station-only restriction is **not** authentication.
Anyone with network access can alter settings, reboot or upload firmware.
Nearby clients may observe credentials during setup. Use a physically and
network-isolated environment and trusted firmware. Do not expose port 80 to
the Internet or treat a VLAN alone as a substitute for a security assessment.
The project does not claim secure boot, encrypted credentials or compliance
with any named standard.

For device-specific hardware and release checks, use the
[acceptance checklist](installation.md#6-acceptance-before-deployment).
