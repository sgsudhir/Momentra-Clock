# Momentra Clock — Codebase Audit & Improvement Recommendations

Scope: static audit of the upstream ESP-IDF firmware, embedded dashboard, portable Web Serial/OTA flasher, and host test suite (`Momentra-Clock`, synced at `267655a` into [`firmware/`](firmware/)), paired with improvements implemented in this unified repository and remaining open recommendations.

> **Verification boundary**: On this Windows host (`Node v26.13.1`, `Python 3.12`), TypeScript, Vite, and `firmware/` Node.js tests (`test_dashboard.mjs`, `test_installer.mjs`, `test_installer_ota.mjs`) run directly. Because `gcc`, `go`, and `idf.py` are not installed locally, edits in `firmware/main/` and `firmware/installer/launcher/` are verified by static source inspection and require CI/Docker (`espressif/idf:v6.1`, `go test ./...`) for compilation and hardware testing.

---

## Status Summary: Implemented vs. Remaining

| Area | Improvement | Status in `momentra-clock-ionic` | Evidence |
| --- | --- | --- | --- |
| Firmware HTTP | CORS headers + `OPTIONS /api/*` preflight | **Implemented** (C, static check) | [`firmware/main/clock_web.c`](firmware/main/clock_web.c#L52-L65), [`clock_web_start`](firmware/main/clock_web.c#L562-L596) |
| Firmware HTTP | JSON string escaping in `json_error()` and `clock_status_json()` | **Implemented** (C, static check) | [`firmware/main/clock_web.c`](firmware/main/clock_web.c#L68-L124), [`firmware/main/clock_status.c`](firmware/main/clock_status.c#L7-L53) |
| Firmware HTTP | Heap-allocate 1400-byte status buffer off 8 KiB HTTPD stack | **Implemented** (C, static check) | [`firmware/main/clock_web.c`](firmware/main/clock_web.c#L193-L206) |
| Firmware OTA | Check `0xE9` image magic, verify `esp_app_desc_t.project_name`, revert boot slot if restart fails, check `clock_display_is_ready()` before canceling rollback | **Implemented** (C, static check) | [`firmware/main/clock_web.c`](firmware/main/clock_web.c#L515-L558), [`firmware/main/main.c`](firmware/main/main.c#L25-L33) |
| Firmware NVS | Skip unchanged NVS keys in `commit_update()` | **Implemented** (C, static check) | [`firmware/main/clock_store.c`](firmware/main/clock_store.c#L108-L149) |
| Go Launcher | Reuse `sharedClockClient`, add macOS `darwin` `open`, handle `SIGINT`/`SIGTERM` shutdown | **Implemented** (Go, static check) | [`firmware/installer/launcher/clock.go`](firmware/installer/launcher/clock.go#L93-L97), [`firmware/installer/launcher/main.go`](firmware/installer/launcher/main.go#L86-L139) |
| Installer & Tests | Fix CRLF import stripping in `test_installer.mjs`; host validation, `0xE9`+`0xABCD5432` check, upload progress bar, confirm reset, and alarm item guards in `ota.js` | **Implemented & Verified** (`node`) | [`firmware/tests/test_installer.mjs`](firmware/tests/test_installer.mjs#L25-L26), [`firmware/installer/ota.js`](firmware/installer/ota.js#L13-L144), [`firmware/tests/test_installer_ota.mjs`](firmware/tests/test_installer_ota.mjs#L5-L129) |
| Companion UI | 32×16 P10 LED preview, dirty-form sync, one-tap alarm toggles, searchable TZ modal, `.bin` preflight + `IonProgressBar` OTA, dashboard deep link | **Implemented & Verified** (`tsc`, `vite build`, Playwright) | [`src/api/client.ts`](src/api/client.ts#L94-L154), [`src/pages/DevicePage.tsx`](src/pages/DevicePage.tsx#L184-L543) |
| Firmware & Ops | SSE/WebSocket push, device auth/TLS & WPA2 setup AP, one-shot/daily alarm power-loss hardening, SNTP 12h fallback, `clock_web.c` host C tests, ESP32-S3 hardware panel check | **Open** | Detailed below |

---

## 1. ESP32 Firmware & HTTP API

### 1.1 CORS & `OPTIONS` Preflight for Native / Ionic Clients *(Implemented in `firmware/`)*
- **Upstream Gap**: Upstream `clock_web_start()` registered only `HTTP_GET` and `HTTP_POST` across 13 handlers (`max_uri_handlers = 13`) without CORS headers or `HTTP_OPTIONS`, blocking direct calls from Vite dev servers and Capacitor/Ionic WebViews (`capacitor://localhost`, `http://localhost`).
- **Implemented Fix**: [`firmware/main/clock_web.c`](firmware/main/clock_web.c#L52-L65) adds `set_cors_headers()` (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`), [`options_handler`](firmware/main/clock_web.c#L60-L65) on `/api/*`, `httpd_uri_match_wildcard`, and `max_uri_handlers = 16` ([`clock_web.c:567-586`](firmware/main/clock_web.c#L567-L586)).
- **Remaining Consideration**: Tighten `Access-Control-Allow-Origin` or pair with an optional origin/PIN check if deployed on shared LANs.

### 1.2 Event Push (SSE / WebSocket) vs. 5-Second Polling *(Open)*
- **Finding**: The embedded dashboard polls `GET /api/status` every `5000` ms (`main/web/index.html:736`, `docs/dashboard.md:42-46`). Meanwhile, hourly chimes last `2000` ms (`main/clock_alarm.c:156`) and are omitted from `status.ringing` (`main/clock_alarm.c:162` sets `ringing = active_alarms != 0`), short alarms (`5` s minimum in `main/clock_config.c:21`) or the `15` s reminder ring (`main/clock_timer_logic.c:63`) can fire and clear between polls, and mobile clients wake the Wi-Fi radio continuously.
- **Recommendation**: Add a lightweight Server-Sent Events endpoint (`GET /api/events` via `httpd_resp_send_chunk`) or ESP-IDF WebSocket endpoint (`httpd_ws_*`) emitting state-change events (`alarm_ring`, `reminder_state`, `time_sync`, `wifi_state`, `settings_changed`) while keeping `GET /api/status` as the initial snapshot and fallback.

### 1.3 Authentication, TLS, and Setup AP Hardening *(Open)*
- **Finding**:
  - `main/clock_web.c` serves plain HTTP on port 80 with zero authentication, CSRF protection, or rate limiting (`docs/api.md:12-15`, `docs/operations.md:64-71`). Any client on the network can call `POST /api/ota`, `POST /api/wifi`, or `POST /api/reboot`.
  - `enable_ap()` (`main/clock_network.c:284-299`) starts an open Wi-Fi AP (`WIFI_AUTH_OPEN`, SSID `"Momentra Clock"`), exposing credentials sent via `POST /api/wifi` in plaintext over the air.
- **Recommendation**:
  - Replace `WIFI_AUTH_OPEN` (`main/clock_network.c:288`) with `WIFI_AUTH_WPA2_PSK` using a per-device setup passphrase derived from hardware eFuse/MAC (`chip_id` is already read in `status_handler`).
  - Add an optional device pairing PIN / bearer token stored in NVS for mutating endpoints (`/api/settings`, `/api/timezones`, `/api/alarm`, `/api/wifi`, `/api/reboot`, `/api/ota`), and evaluate `esp_https_server` or signed OTA images against ESP32 SRAM (`free_heap_bytes`).

### 1.4 OTA Validation, Progress, and Rollback Completeness *(Partially Implemented; Signature/Async Open)*
- **Upstream Gap**: Upstream `app_main()` marked `ESP_OTA_IMG_PENDING_VERIFY` valid immediately after `clock_web_start()`, and `ota_handler()` checked only partition size and `esp_ota_end()`, leaving a new boot slot selected even if `schedule_restart()` failed.
- **Implemented Fix**:
  - [`firmware/main/clock_web.c`](firmware/main/clock_web.c#L515-L558) rejects uploads whose first byte is not `0xE9`, verifies `incoming_desc.project_name` matches `esp_app_get_description()->project_name` via `esp_ota_get_partition_description()` before selecting the boot partition, and reverts to `running` if `schedule_restart()` fails.
  - [`firmware/main/main.c`](firmware/main/main.c#L25-L33) checks `clock_display_is_ready()` under `#ifdef CONFIG_CLOCK_PANEL_ENABLED` and calls `esp_ota_mark_app_invalid_rollback_and_reboot()` if the panel failed to initialize.
- **Remaining Open**:
  - Cryptographic OTA signature verification / anti-rollback version floor.
  - Deferring rollback confirmation until network/AP or HTTP health is also confirmed (currently `main.c:25-32` confirms immediately after `clock_web_start()`).
  - Non-blocking OTA or chunked progress reporting (HTTP server task blocks during flash writes at `clock_web.c:508-531`).

### 1.5 Alarm, NVS Storage, and Timekeeping Edge Cases *(Partially Implemented)*
- **NVS Flash Wear Reduction *(Implemented)***: [`firmware/main/clock_store.c`](firmware/main/clock_store.c#L108-L149) now writes only changed keys (`config_v1`, `feedback`, `colon_blink`, `seconds_anim`, `tz_primary`, `tz_secondary`, `tz2_enabled`) inside `commit_update()`.
- **JSON Escaping & Stack Safety *(Implemented)***: [`firmware/main/clock_web.c`](firmware/main/clock_web.c#L68-L124,L193-L206) escapes JSON strings in `json_error()` and heap-allocates the 1400-byte status buffer; [`firmware/main/clock_status.c`](firmware/main/clock_status.c#L7-L53,L101,L132-L136) escapes `firmware_version`, `timezone_primary`, and `timezone_secondary`.
- **One-shot alarm loss vs. daily alarm double-fire *(Open)***:
  - `clock_store_claim_alarms()` (`main/clock_store.c:184-220`) disables `ALARM_ONCE` in NVS *before* `clock_alarm.c:136-143` begins sounding; power loss in between skips the alarm permanently. Conversely, `clock_schedule_t.last_minute` (`main/clock_schedule.c:4-8,27-30`) is volatile RAM only, so a reboot within the same minute re-triggers `ALARM_DAILY` and hourly chimes.
  - Also, if `timezone_primary` changes concurrently with an alarm tick, `clock_store_claim_alarms()` (`main/clock_store.c:194-197`) returns `claimed = 0` without re-checking the new zone.
- **12-hour SNTP freshness hard blackout *(Open)***: `clock_sync_is_fresh()` (`main/clock_freshness.c:3-9`) invalidates time once `now_us - last_sync_us >= 12h`, and `clock_time_snapshot()` (`main/clock_time.c:54-68`) withholds `unix_time`, causing `clock_schedule_check()` (`main/clock_schedule.c:14-16`) to suppress all alarms and show `SYNC`. Adding fallback NTP pools (currently only `pool.ntp.org` at `main/clock_time.c:34`) or a degraded local-RTC grace window prevents silent alarm blackouts.
- **Wi-Fi reconnect & scan edge cases *(Open)***: After `failures >= RETRY_LIMIT` (5) in `network_task()` (`main/clock_network.c:360-379`), `NETWORK_DISCONNECTED` stops calling `esp_wifi_connect()`, relying solely on the 30-second queue timeout (`main/clock_network.c:311-317`). `scan_task()` (`main/clock_network.c:83-97`) deduplicates SSIDs with `strcmp`, stopping at embedded NULs if any.

---

## 2. UI/UX & Mobile Companion Capabilities

Audit of `firmware/main/web/index.html`, `firmware/docs/dashboard.md`, and `firmware/installer/` (`a188fdd`, `267655a`):

1. **Embedded Dashboard Gaps (`firmware/main/web/index.html`) *(Solved in Ionic app; open in embedded HTML)***:
   - **No live 32×16 P10 LED matrix preview**: `index.html:188-197` shows text only. The Ionic companion implements pixel-exact Canvas preview in [`src/components/ledMatrixRenderer.ts`](src/components/ledMatrixRenderer.ts) and [`src/components/LedMatrixPreview.tsx`](src/components/LedMatrixPreview.tsx).
   - **Forms stop syncing after initial load (`populated` lock)**: `index.html:569-580` fills forms only when `!populated`. The Ionic app adds dirty tracking (e.g., `alarmDirty` in `AlarmsTimersPage.tsx`) and live synchronization.
   - **Alarms & Timezones**: `index.html:266-285` uses a `<select>` + 5-field form (with invalid `<br></br>` at line 270) and dumps ~590+ IANA names (`tests/test_clock_timezone.c:21`) into native `<select>` dropdowns (`index.html:216,252`). Ionic provides one-tap toggles and searchable `TimezoneModal`.
   - **Timer UX**: `index.html:307,392` initializes `#reminder-value` to `00:00:00` while `#reminder-minutes` defaults to `1`, and `index.html:501` renders stopwatch tenths (`MM:SS:T`) whereas `docs/dashboard.md:99` and `clock_timer_logic.h:6` specify `99:59.99`.
   - **Embedded OTA UX**: `index.html:730-734` uses `fetch('/api/ota')` with no upload progress bar and no pre-upload `.bin` header or `setup_ap` UI guard.

2. **Portable Flasher Wireless OTA Improvements *(Implemented in `firmware/installer/` & Ionic `DevicePage.tsx`)***:
   - **Upstream `a188fdd` / `267655a` gaps**: `ota.js` previously allowed invalid/non-private `ota-host` strings into `poll()` and `ota-dashboard.href`, checked only file size (`<= 0x1e0000`) without inspecting ESP32 headers, left `#ota-confirm` checked after an upload, lacked upload progress percentage, and accessed `a.enabled` without guarding null/non-object alarm entries.
   - **Implemented in [`firmware/installer/ota.js`](firmware/installer/ota.js)**: added `validateClockHost()` (`lines 13-30`), `validateAppBinary()` checking `0xE9` + `esp_app_desc_t` magic `0xABCD5432` at `0x20` (`lines 32-50`), `XMLHttpRequest` upload progress (`lines 110-144`, `#ota-progress` bar), safe `data.alarms` filtering (`line 85`), and `ota-confirm.checked = false` reset in `finally` (`line 238`).
   - **Implemented in Ionic Companion**: [`inspectOtaBinary()`](src/api/client.ts#L94-L154), `XMLHttpRequest` progress (`otaProgress`), `IonProgressBar`, and `"Open Device Web Dashboard"` link in [`src/pages/DevicePage.tsx`](src/pages/DevicePage.tsx#L184-L543).

---

## 3. Installer & Testing Gaps

Audit of `firmware/installer/`, `firmware/tests/`, and `firmware/.github/workflows/release.yml`:

1. **Windows CRLF test bug in `test_installer.mjs` *(Fixed in `firmware/`)***:
   - `firmware/tests/test_installer.mjs:26` previously used `.replace(/^import .*;\n/gm, "")`, which failed on Windows CRLF (`\r\n`) checkouts with `SyntaxError: Cannot use import statement outside a module`. Updated to `/^import .*;\r?\n/gm`; now passes under Node.
2. **Expanded OTA installer unit tests *(Implemented in `firmware/`)***:
   - [`firmware/tests/test_installer_ota.mjs`](firmware/tests/test_installer_ota.mjs#L56-L120) now covers invalid host rejection (`8.8.8.8`), invalid `.bin` magic rejection (`0xE9`), null alarm entries, and `ota-confirm` reset after upload.
3. **Go launcher resource & platform improvements *(Implemented in `firmware/`, requires `go test` in CI)***:
   - [`firmware/installer/launcher/clock.go`](firmware/installer/launcher/clock.go#L93-L97) reuses `sharedClockClient` instead of creating a new `http.Transport` on each 5s poll.
   - [`firmware/installer/launcher/main.go`](firmware/installer/launcher/main.go#L86-L139) adds `darwin` (`open`) support in `openBrowser` and `SIGINT`/`SIGTERM` graceful shutdown.
   - **Remaining CI Gap**: `.github/workflows/release.yml:105-115` builds release artifacts only for `linux/amd64` and `windows/amd64` (no `darwin/arm64` / `darwin/amd64` build job yet).
4. **Firmware C & Embedded Dashboard Test Coverage *(Open)***:
   - `.github/workflows/release.yml:27-50` excludes `clock_web.c`, `clock_network.c`, `clock_alarm.c`, `clock_display.c`, and `clock_time.c` from host C unit tests. Adding `httpd` stubs to test `settings_handler`, `timer_handler`, `ota_handler` (403 station-only, `0xE9` / `project_name` rejection), `options_handler`, and `scan_status_handler` would verify HTTP behavior in CI without hardware.
   - `firmware/tests/test_dashboard.mjs:1-76` still tests only `second-zone` submission and `format_12h` locking; it does not cover `/api/settings`, legacy fonts `2..4`, `/api/alarm`, `/api/timer`, `/api/wifi/scan`, or `/api/ota`.
   - `firmware/installer/index.html:146` still notes that *"The S3 mapping and display still need panel testing"* (configured in `sdkconfig.defaults.esp32s3`, awaiting physical ESP32-S3 + HUB12 panel verification).
   - `firmware/installer/app.js:112` does not verify a SHA-256 checksum on fetched `firmware/${name}` images, and `tests/test_installer.mjs` mocks `ESPLoader`/`Transport` rather than running end-to-end Web Serial / Playwright browser verification against `prepare-site.sh` output.
