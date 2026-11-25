# Developer reference

[Wiki home](README.md) · [Architecture](architecture.md) ·
[API reference](api.md) · [Installation](installation.md)

The public headers are the authoritative contracts for parameters, return
values and ownership. This page is a guided index; internal `static` helpers
are described in their source alongside the code rather than treated as
stable APIs.

## Repository map

| Path | Purpose |
| --- | --- |
| [`main/main.c`](../main/main.c) | Startup and OTA image confirmation |
| [`main/`](../main/) | Firmware modules and public headers |
| [`main/web/index.html`](../main/web/index.html) | Embedded HTML, CSS and JavaScript dashboard |
| [`main/Kconfig.projbuild`](../main/Kconfig.projbuild) | Panel and buzzer build options |
| [`sdkconfig.defaults`](../sdkconfig.defaults) | Project configuration defaults |
| [`sdkconfig.defaults.esp32s3`](../sdkconfig.defaults.esp32s3) | ESP32-S3-DevKitC-1 N16R8 GPIO defaults |
| [`partitions.csv`](../partitions.csv) | Flash partition layout |
| [`main/idf_component.yml`](../main/idf_component.yml) | Managed mDNS component dependency |
| [`tests/`](../tests/) | Host tests and NVS stubs |
| [`CMakePresets.json`](../CMakePresets.json) | Separate development and production build directories |
| [`installer/`](../installer/) | Portable local flasher source, launcher and pinned frontend dependencies |
| [`release.yml`](../.github/workflows/release.yml) | Builds firmware and portable packages; publishes tagged releases |

[`main/CMakeLists.txt`](../main/CMakeLists.txt) lists firmware modules and
embeds the dashboard as a text resource. Updating HTML requires a firmware
build and flash/OTA to change what the device serves.

## Function index

Function names below link to their header contracts. Functions that return
`esp_err_t` return `ESP_OK` on success and an ESP-IDF error on failure.
Callers must respect non-null pointers and other preconditions documented in
the headers.

### Startup, configuration and storage

| Function | Responsibility |
| --- | --- |
| [`app_main`](../main/main.c) | Initializes subsystems in dependency order and confirms a pending OTA image after successful local startup. |
| [`clock_config_defaults`](../main/clock_config.h) | Initializes a complete default settings snapshot, including disabled alarms. |
| [`clock_alarm_duration_valid`](../main/clock_config.h) | Checks supported alarm durations, including legacy values. |
| [`clock_config_valid`](../main/clock_config.h) | Validates all display, sound and alarm fields. |
| [`clock_store_init`](../main/clock_store.h) | Initializes locks and loads/validates NVS settings or defaults. |
| [`clock_store_get`](../main/clock_store.h) | Copies the current settings snapshot under its mutex. |
| [`clock_store_set`](../main/clock_store.h) | Validates and persists a new snapshot. |
| [`clock_store_set_if_unchanged`](../main/clock_store.h) | Compare-and-save; reports conflict if current state differs from the expected snapshot. |
| [`clock_store_claim_alarms`](../main/clock_store.h) | Rechecks candidate alarms, persists one-shot disabling and returns claimed mask and longest duration. |

### Time and scheduling

| Function | Responsibility |
| --- | --- |
| [`clock_time_init`](../main/clock_time.h) | Initializes SNTP without starting it. |
| [`clock_time_start_sync`](../main/clock_time.h) | Starts SNTP after station connection. |
| [`clock_time_snapshot`](../main/clock_time.h) | Returns validity, sync age and wall time when valid. |
| [`clock_sync_is_fresh`](../main/clock_freshness.h) | Tests a monotonic last-sync timestamp against the exclusive 12-hour limit. |
| [`clock_schedule_init`](../main/clock_schedule.h) | Resets the minute-deduplication state. |
| [`clock_schedule_check`](../main/clock_schedule.h) | Calculates current-minute alarm and hourly events when time is valid. |

The SNTP callback records the last successful synchronization timestamp.
Display and schedule conversion use [`clock_timezone.c`](../main/clock_timezone.c),
without changing process-global `TZ`. [`clock_timezone_data.inc`](../main/clock_timezone_data.inc)
is generated from the public-domain IANA tzdb (currently 2026f); regenerate
with `node tools/generate-timezones.mjs` on a system with the desired tzdb and
`zdump`, then rebuild and retest. Rules cover 1970–2100; offsets outside this
range are rejected. Timezone names and the second-line switch are saved as
separate NVS keys to preserve the legacy configuration blob.

### Network and HTTP

| Function | Responsibility |
| --- | --- |
| [`clock_network_start`](../main/clock_network.h) | Initializes network interfaces, Wi-Fi, mDNS, SNTP and network worker. |
| [`clock_network_store_credentials`](../main/clock_network.h) | Validates and stores pending station credentials. |
| [`clock_network_status`](../main/clock_network.h) | Returns station/AP state and optional current RSSI. |
| [`clock_network_display_status`](../main/clock_network.h) | Returns cached connection screen data. |
| [`clock_network_scan_start`](../main/clock_network.h) | Starts a separate scan worker or reports that a scan is already active. |
| [`clock_network_scan_result`](../main/clock_network.h) | Copies the current scan result and state. |
| [`clock_web_start`](../main/clock_web.h) | Starts the HTTP server and registers routes. |
| [`clock_form_parse`](../main/clock_form.h) | Decodes a bounded URL-encoded body, rejecting malformed or duplicate fields. |
| [`clock_form_value`](../main/clock_form.h) | Returns a borrowed decoded field value or `NULL`. |
| [`clock_form_int`](../main/clock_form.h) | Parses a complete integer in the requested inclusive range. |
| [`clock_status_json`](../main/clock_status.h) | Serializes a status snapshot into a bounded buffer; reports failure on invalid input or insufficient space. |

HTTP request handlers are private to [`clock_web.c`](../main/clock_web.c).
They gather snapshots, validate forms, translate operational errors to HTTP,
and stream OTA to the inactive slot. The dashboard's browser-side polling and
interpolation are separate from device timekeeping.

### Display

| Function | Responsibility |
| --- | --- |
| [`clock_display_start`](../main/clock_display.h) | Validates configuration and starts hardware, renderer and scanner when enabled. |
| [`clock_display_pause`](../main/clock_display.h) | Requests scan pause/resume and waits for acknowledgement. |
| [`clock_display_is_ready`](../main/clock_display.h) | Reports scanner readiness, not visual correctness. |
| [`clock_render`](../main/clock_render.h) | Clears and draws centered time or the sync screen; returns the separator position. |
| [`clock_render_seconds`](../main/clock_render.h) | Applies colon blinking and supported animation to a clock frame. |
| [`clock_connection_phase`](../main/clock_render.h) | Selects connecting, RSSI, IP or completed phase using monotonic time. |
| [`clock_render_connection`](../main/clock_render.h) | Draws a connection phase. |
| [`clock_render_timer`](../main/clock_render.h) | Draws stopwatch or reminder with the compact timer font. |
| [`clock_scan_encode`](../main/clock_scan.h) | Encodes one row group into SPI bytes with selected DATA polarity. |

Frame format is 16 rows of four bytes, with the leftmost pixel in bit 7.
Frame publication and full-scan boundary copying are described in the
[architecture](architecture.md#frame-production-and-scanning).

### Timers and sound

| Function | Responsibility |
| --- | --- |
| [`clock_timer_value`](../main/clock_timer_logic.h) | Calculates a clamped elapsed/remaining value from a monotonic reference. |
| [`clock_timers_command`](../main/clock_timer_logic.h) | Applies a validated timer state transition. |
| [`clock_timers_tick`](../main/clock_timer_logic.h) | Advances stopwatch limit and reminder expiry/ringing transitions. |
| [`clock_timers_apply`](../main/clock_timers.h) | Applies a timer command to shared state using current monotonic time. |
| [`clock_timers_snapshot`](../main/clock_timers.h) | Returns current shared timer state and values. |
| [`clock_timers_update`](../main/clock_timers.h) | Advances shared timer state; signals a newly reached stopwatch limit. |
| [`clock_alarm_start`](../main/clock_alarm.h) | Configures buzzer GPIO when present and starts the alarm worker. |
| [`clock_alarm_is_configured`](../main/clock_alarm.h) | Reports whether a buzzer GPIO is configured. |
| [`clock_alarm_stop`](../main/clock_alarm.h) | Queues a stop request for scheduled sound. |
| [`clock_alarm_beep`](../main/clock_alarm.h) | Requests coalesced feedback if configured and enabled. |
| [`clock_alarm_status`](../main/clock_alarm.h) | Copies current scheduled-alarm ringing state and mask. |
| [`clock_sound_chime`](../main/clock_sound.h), [`clock_sound_alarm`](../main/clock_sound.h), [`clock_sound_reminder`](../main/clock_sound.h) | Pure functions return the buzzer on/off level for a given elapsed time. |

## Persistent data and compatibility

The `clock` NVS namespace uses the legacy `config_v1` blob prefix and
separate `feedback`, `colon_blink` and `seconds_anim` keys. Font IDs and
persisted enum values must not be renumbered. Wi-Fi candidates and
successfully connected credentials use the `network` namespace. Neither
stopwatch nor reminder state is persisted.

Before changing stored layout, plan migration, downgrade and interrupted-write
behavior. Compare-and-save avoids overwriting concurrent changes; an NVS error
can leave persistence uncertain. Do not log or return Wi-Fi credentials.

## Host tests

The firmware version is defined in [`clock_version.h`](../main/clock_version.h).
The ESP-IDF image metadata, status API and dashboard all use this value.

Run these from the repository root with a C compiler and Node.js. The tests
exercise pure logic, persistence with host stubs, status serialization and
timer behavior; they do not simulate actual Wi-Fi, flash, panel or OTA.

```sh
cc -std=c11 -Wall -Wextra -Werror -I main \
  main/clock_config.c main/clock_timezone.c main/clock_schedule.c main/clock_freshness.c \
  main/clock_render.c main/clock_scan.c main/clock_form.c main/clock_sound.c \
  tests/test_clock_logic.c -o /tmp/esp-p10-clock-logic-test
/tmp/esp-p10-clock-logic-test

cc -std=c11 -Wall -Wextra -Werror -pthread -I tests/stubs -I main \
  main/clock_config.c main/clock_timezone.c main/clock_store.c tests/test_clock_store.c \
  -o /tmp/esp-p10-clock-store-test
/tmp/esp-p10-clock-store-test

cc -std=c11 -Wall -Wextra -Werror -I main \
  main/clock_config.c main/clock_timezone.c main/clock_status.c tests/test_clock_status.c \
  -o /tmp/esp-p10-clock-status-test
/tmp/esp-p10-clock-status-test | node tests/test_status_json.js

cc -std=c11 -Wall -Wextra -Werror -I main \
  main/clock_timer_logic.c tests/test_clock_timers.c -o /tmp/esp-p10-clock-timers-test
/tmp/esp-p10-clock-timers-test

cc -std=c11 -Wall -Wextra -Werror -I main \
  main/clock_config.c main/clock_timezone.c main/clock_schedule.c tests/test_clock_timezone.c \
  -o /tmp/esp-p10-clock-timezone-test
/tmp/esp-p10-clock-timezone-test

cc -std=c11 -Wall -Wextra -Werror -DCONFIG_IDF_TARGET_ESP32=1 \
  -I tests/stubs -I main tests/test_clock_pins.c -o /tmp/clock-pins-esp32
/tmp/clock-pins-esp32
cc -std=c11 -Wall -Wextra -Werror -DCONFIG_IDF_TARGET_ESP32S3=1 \
  -I tests/stubs -I main tests/test_clock_pins.c -o /tmp/clock-pins-s3
/tmp/clock-pins-s3

node tests/test_dashboard.mjs
node tests/test_installer.mjs
```

For the ESP-IDF build and deployment procedure see
[installation](installation.md#3-install-and-configure-esp-idf). Add focused
tests for changed behavior and test timing, power and failures on the
intended hardware; a successful host test or compilation is not hardware
validation.
