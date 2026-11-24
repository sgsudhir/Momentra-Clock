# Momentra Clock

ESP-IDF application for an ESP32-WROOM-32 with 4 MB flash, a single monochrome
32x16 HUB12 panel and an active buzzer. The panel driver is experimental and
enabled in the project configuration for testing: its wiring, scan order and
DATA polarity have not been verified on the user's hardware. The firmware and web
interface have not yet been hardware-tested.

## Safety and wiring

- Confirm the panel's 1/4 scan pattern, HUB12 connector pinout, active level
  for DATA, and active-buzzer circuit before connecting the panel. The user
  reports that OE is active-high; the project configuration uses that setting.
- Supply the panel and ESP32 appropriately, connect their grounds, and use level
  shifting if needed. Do not power the panel from the ESP32 GPIOs. Use an
  appropriate transistor and supply for the buzzer rather than assuming a GPIO
  can drive it directly.
- The selected ESP32-WROOM-32 GPIO assignments are below. They avoid the flash,
  UART and strapping pins; DATA and CLK use the ESP32's native VSPI pins.
  GPIO numbers are chip GPIO numbers, not physical module or HUB12 pin numbers.

  | Signal | ESP32 GPIO |
  | --- | ---: |
  | HUB12 DATA | 23 |
  | HUB12 CLK | 18 |
  | HUB12 LATCH / STB | 19 |
  | HUB12 OE | 21 |
  | HUB12 A | 22 |
  | HUB12 B | 25 |
  | Active buzzer driver input | 26 |

- These GPIOs are set in `sdkconfig.defaults`; existing configurations must be
  updated in `P10 clock hardware` menuconfig. The project defaults enable the
  panel; existing configurations may need to enable it explicitly. GPIO26 is
  configured as an active-high buzzer output on startup;
  set it to -1 if GPIO26 is used for anything else or the buzzer isn't wired.
  The firmware rejects invalid output pins, GPIOs 0, 1, 2, 3, 5, 6-12 and 15,
  and duplicate panel/buzzer pins. Check the module's actual reserved pins and
  strapping requirements as well.
- The experimental driver uses the scan conventions observed in
  [DMD2](https://github.com/freetronics/DMD2/blob/08a1d8ed06f5005a5a88f6f7d0f4d423d4db4f07/DMD2.cpp):
  SPI mode 0, 4 MHz, MSB first, four interleaved rows per scan, binary A/B
  addressing, active-low DATA, and active-high OE. The `Output enable is
  active low` menuconfig option supports panels with the opposite OE polarity;
  existing configurations must be updated explicitly. Panels with a different
  shift order need driver changes. Verify with low brightness and suitable
  power/current limits first.
- The active buzzer must be configured separately. An alarm is not claimed or
  disabled when the buzzer GPIO is unconfigured.

Use the panel's marked signal names, not an assumed ribbon-cable orientation.
For a 5 V panel, use suitable 3.3-to-5 V logic buffers, such as correctly
powered AHCT-family buffers, and make sure OE stays in its inactive state
during reset. For a 5 V active buzzer, use a suitable low-side driver with a
gate/base pull-down so the buzzer remains off while the ESP32 boots; add
appropriate protection for an inductive load. Confirm the actual panel and
buzzer ratings before selecting the supply and driver components.

The [product page](https://robu.in/product/p10-outdoor-white-led-display-panel-module/)
was inaccessible directly; a search listing describes a white 512-LED panel.
The specific connector orientation and DATA polarity are not independently
verified; OE is reported as active-high by the user. DMD2 compatibility is not
guaranteed. Confirm the remaining details from the physical panel or its
manufacturer before connecting it. DMD2 itself is
not included; this is an ESP-IDF implementation. GPIO selection is based on the
[ESP32-WROOM-32 datasheet](https://documentation.espressif.com/esp32-wroom-32_datasheet_en.pdf).

The display application task is pinned to core 1; alarm, HTTP and network
application tasks are pinned to core 0. ESP-IDF system tasks and interrupts
retain their normal affinity, so core 1 is not absolutely exclusive. Flash
operations may still affect refresh. OTA explicitly blanks the display while
writing.

## Build and flash

Use the ESP-IDF VS Code extension to configure and build for ESP32. The
`sdkconfig.defaults` file sets 4 MB flash, an OTA partition table, rollback,
and a 1 kHz FreeRTOS tick. Existing SDK configurations may need these options
set in menuconfig. The partition table has two 1.875 MiB OTA application slots.

Changing the partition layout can make existing flash contents inaccessible or
overwrite them. Back up needed data and use a deliberate full-flash/migration
procedure; do not apply an OTA update across an incompatible partition layout.
The first flash must include the bootloader, partition table and application.
Do not flash the panel-enabled build until the physical wiring has been checked.

## Wi-Fi, security and time

On first boot, or after five failed connection attempts, the device provides an
**open** AP named `P10-Clock-Setup`. Connect to it and open
`http://192.168.4.1/` to enter station credentials. The device saves the
candidate credentials and reboots. Successful credentials replace the
previous saved credentials; a failed connection returns to the setup AP and
retries periodically. The station IP is logged on the serial console.
The Wi-Fi setup section scans for nearby broadcast SSIDs and shows their RSSI;
use the hidden-network option for an unadvertised SSID. Scanning may briefly
interrupt Wi-Fi traffic, and a scan can fail while the station is connecting;
retry when the connection settles.
The station obtains its IP address and DNS servers through DHCP.
On networks that support multicast DNS, the page is also available at
`http://momentra.local/`. If multiple devices use that hostname, or the client
or network does not support mDNS, use the IP address instead.

The setup AP, HTTP UI and REST API have **no authentication or encryption**.
Anyone nearby can connect to the open AP and observe credentials sent over it;
anyone on the trusted station network can change settings, reboot or upload
firmware. OTA is rejected unless connected in station-only mode. Use only on a
trusted, isolated network; this is not suitable for an untrusted LAN or public
Internet.

The clock uses `pool.ntp.org` and Asia/Kolkata (UTC+05:30). After boot it
displays `SYNC...` until the first successful NTP update. It requests a new
NTP synchronization every minute after successful responses; network failures
can delay retries. Once 12 hours have elapsed without a successful sync,
the clock returns to `SYNC...` and suppresses scheduled alarms and chimes.
Brief Wi-Fi outages do not immediately invalidate time.

## Controls and alarms

The web page configures brightness (0-100%), five font styles, 12/24-hour
display, hourly chime enable and four active-buzzer beep patterns. Five alarm
slots support once or daily repetition; selectable durations are 5, 10, 15, 20,
30, 45, 60, 90, 120, 150, 180, 240 and 300 seconds. Older saved durations
remain supported. One-shot alarms are persisted as
disabled before sounding. An alarm can be stopped from the page or API.
The dashboard refreshes device status approximately every five seconds and
shows the stop control at the top while an alarm is reported as ringing.
Alarm and reminder state changes may therefore take roughly five seconds plus
network latency to appear; short sounds can finish between polls.
The expandable alarm block lists enabled alarms and their next occurrence; device health
is available in the expandable system-details section.
System details include the local IP and station MAC. The status API also exposes
a stable chip identifier derived from the factory MAC. These identifiers are
visible to anyone who can access the unauthenticated status API.
The browser polls status roughly every five seconds, but interpolates the clock
and alarm countdown locally and re-anchors to device time about every
15 seconds. Network latency and browser scheduling can affect accuracy.
The header's theme selector offers Light, Dark, Ocean, Sunset, Lavender, Sand,
Forest and Midnight; the choice is stored in the browser, not on the clock.
Subtle visual animation runs in the browser and respects reduced-motion settings.
Simultaneous alarms sound together for the longest requested duration; an
alarm takes priority over an hourly chime. Reboot stops any ongoing sound.
Successful settings and alarm saves request a 100 ms buzzer confirmation;
feedback waits for existing alarm, chime or reminder sounds.
The hourly patterns are one long beep, two medium beeps, three short beeps,
and two short beeps followed by a long beep. Alarms repeat four rapid beeps
followed by a pause; reminders repeat the previous slower
on/off alarm beep. An active
buzzer has a fixed pitch, so these patterns differ by rhythm rather than tone.

The stopwatch starts, pauses, resumes and resets from the web page. It stops
at 99:59.99 and sounds on start, pause/resume and stop. One reminder can count
down from 1 second to 24 hours using hour, minute and second selectors, pause or
resume, and ring for up to 15 seconds
unless stopped. Both timers use monotonic time and are cleared on reboot; they
do not need NTP. A buzzer must be configured to start a reminder. The panel
shows the running stopwatch (ST, MM:SS:tenths), otherwise a running or
ringing reminder (RE, HH:MM:SS), otherwise the clock. Paused timers remain
visible on the web page. A ringing alarm has priority over the reminder buzzer.

Scheduling considers the current minute only: missed alarms are not replayed
after an outage or time jump. A backward clock correction suppresses repeated
minutes until time exceeds the last processed minute. Daily alarms can sound
again after a reboot in the same scheduled minute; one-shot alarms remain
disabled once successfully claimed. A power loss after a one-shot is disabled
but before it sounds can therefore skip that alarm. A flash/commit error is
logged; the persisted state may be uncertain after a storage failure.

## REST API

Responses are JSON. Configuration requests use
`application/x-www-form-urlencoded`; all fields shown are required. Invalid
input returns HTTP 400, concurrent changes return 409, and operational errors
return 500 with an `error` field. Successful writes return `{"ok":true}`.

- `GET /api/status`: `uptime_seconds`, `free_heap_bytes`, `min_free_heap_bytes`,
  `wifi_connected`, `setup_ap`,
  `wifi_rssi` and `local_ip` (null if unavailable), `wifi_mac`, `chip_id`
  (factory-MAC-derived), `time_valid`, `unix_time` and `unix_time_ms` (null if
  unsynchronized), `sync_age_seconds` (null if never synchronized),
  `display_ready`, `buzzer_configured`, `ringing`, `ringing_mask`,
  `stopwatch_state`, `stopwatch_ms`, `reminder_state`, `reminder_ms`,
  `brightness`, `font`, `format_12h`, `hourly_enabled`, `hourly_pattern`, and
  an `alarms` array. Wi-Fi credentials are never returned.
- `POST /api/settings`: `brightness` 0-100, `font` 0-4, `format_12h` 0/1,
  `hourly_enabled` 0/1, and `hourly_pattern` 0-3.
- `POST /api/alarm`: `index` 0-4, `enabled` 0/1, `hour` 0-23, `minute` 0-59,
  `repeat` 0 (once) or 1 (daily), and `duration_seconds`.
- `POST /api/alarm/stop`: stop the current alarm sound.
- `POST /api/timer`: form fields `timer` (`stopwatch` or `reminder`) and
  `action` (`start`, `pause`, `resume`, `stop`). Starting a reminder also
  requires `seconds` from 1 to 86400. Stop resets the timer and dismisses a
  ringing reminder. Status states are 0 stopped, 1 running, 2 paused, 3 ringing.
- `POST /api/wifi/scan`: start a background Wi-Fi scan.
  `GET /api/wifi/scan` returns its state and, when done, networks with
  `ssid_hex` (UTF-8 SSID bytes encoded as hexadecimal) and `rssi` in dBm.
  Hidden SSIDs are omitted; non-UTF-8 names are not selectable in the UI.
- `POST /api/wifi`: `ssid` and `password`; saves a candidate and reboots.
  Password must be empty for an open network or 8-63 bytes. SSID is 1-32 bytes.
- `POST /api/reboot`: reboot.
- `POST /api/ota`: upload the raw ESP32 application `.bin`, not a bootloader or
  combined flash image. A successful upload selects the inactive slot and
  reboots. The new image is confirmed only after local initialization succeeds;
  startup failure before confirmation allows bootloader rollback.

Examples (replace the address):

```sh
curl http://192.168.1.50/api/status
curl -X POST -d 'brightness=50&font=0&format_12h=0&hourly_enabled=1&hourly_pattern=0' http://192.168.1.50/api/settings
curl -X POST -d 'index=0&enabled=1&hour=7&minute=30&repeat=1&duration_seconds=30' http://192.168.1.50/api/alarm
curl -X POST http://192.168.1.50/api/alarm/stop
curl -X POST --data-binary @firmware.bin http://192.168.1.50/api/ota
```

## Host checks

```sh
cc -std=c11 -Wall -Wextra -Werror -I main \
  main/clock_config.c main/clock_schedule.c main/clock_freshness.c \
  main/clock_render.c main/clock_scan.c main/clock_form.c main/clock_sound.c tests/test_clock_logic.c \
  -o /tmp/esp-p10-clock-logic-test
/tmp/esp-p10-clock-logic-test
cc -std=c11 -Wall -Wextra -Werror -pthread -I tests/stubs -I main \
  main/clock_config.c main/clock_store.c tests/test_clock_store.c \
  -o /tmp/esp-p10-clock-store-test
/tmp/esp-p10-clock-store-test
cc -std=c11 -Wall -Wextra -Werror -I main \
  main/clock_config.c main/clock_status.c tests/test_clock_status.c \
  -o /tmp/esp-p10-clock-status-test
/tmp/esp-p10-clock-status-test | node tests/test_status_json.js
cc -std=c11 -Wall -Wextra -Werror -I main \
  main/clock_timer_logic.c tests/test_clock_timers.c -o /tmp/esp-p10-clock-timers-test
/tmp/esp-p10-clock-timers-test
```

Hardware testing is still needed for signal mapping, brightness and flicker
under Wi-Fi/flash load, AP provisioning and reconnects, NTP, buzzer timing,
power-cycle persistence, OTA failure recovery and rollback.
