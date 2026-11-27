# Momentra Clock — Discord-Style Web Companion & ESP Web Serial Flasher

Pure runnable web application (no native app installation required) combining:

1. **Discord-Style Glassmorphic Web Companion & ESP Web Serial Flasher** (repository root) — Ionic React + TypeScript + Vite web app with a Discord-inspired server/channel shell, Momentra's midnight-slate (`#080e1a`) & mint-emerald (`#8be8cb`) glassmorphism theme, stateful ESP32 Demo Simulator, pixel-accurate **32×16 P10 LED Matrix Preview**, integrated **Web Serial USB Flasher** (`esptool-js` + `js-md5`), OTA preflight/progress, and a Vite `/device-proxy` for CORS-free local LAN testing.
2. **Improved ESP32 Firmware & Portable Web/OTA Flasher** (`firmware/`, synced from upstream `Momentra-Clock` `267655a` including wireless OTA and dashboard link updates).

## Repository Layout

```text
momentra-clock-ionic/
├── src/
│   ├── api/                 # MomentraClient (Live HTTP/proxy + XHR OTA), mockDevice.ts, flasher.ts (esptool-js + sim)
│   ├── components/          # DiscordShell, LedMatrixPreview, ledMatrixRenderer, DeviceBar, RingingBanner, TimezoneModal
│   ├── pages/               # OverviewPage, AlarmsTimersPage, DisplaySoundPage, DevicePage, FlasherPage
│   ├── state/               # ClockContext.tsx (5s polling, 1s interpolation, 15s NTP re-anchoring, device profiles)
│   ├── theme/               # Momentra Dark glassmorphic default + all 8 Momentra glass themes
│   └── types/               # clock.ts (API types & validators), flasher.ts (Web Serial offsets/images/pinouts)
├── firmware/                # Momentra-Clock ESP-IDF firmware, Go launcher, portable installer & tests
│   ├── main/                # ESP-IDF C firmware (clock_web.c, clock_status.c, clock_store.c, main.c, etc.)
│   ├── installer/           # Standalone Web Serial + Wireless OTA portable flasher (ota.js, app.js, launcher/*.go)
│   └── tests/               # Node & C unit/integration tests
├── vite.config.ts           # Vite config + /device-proxy middleware
└── IMPROVEMENTS.md          # Firmware, HTTP API, UI/UX, and installer/test audit & improvement log
```

## Quick Start (Windows PowerShell)

> On Windows PowerShell, use `npm.cmd` and `npx.cmd` to avoid `npm.ps1` execution policy blocks.

```powershell
# Install dependencies
npm.cmd install

# Start runnable web app (includes /device-proxy for live ESP32 testing)
npm.cmd run dev

# Typecheck & build production web bundle into dist/
npx.cmd tsc --noEmit
npm.cmd run build

# Preview production bundle locally
npm.cmd run preview

# Run firmware dashboard & installer Node test suites
npm.cmd run test:firmware-js
```

## Companion Channels & Highlights

- **Server Rail & Channels**: Left device rail switches between the **Demo Simulator** and saved LAN/AP clock profiles (`+` Add Device, quick Theme switcher); channel sidebar groups `# clock-overview`, `# alarms-timers`, `# display-sound`, `# device-network`, and `# usb-flasher`.
- **`# clock-overview`**: Interactive Canvas **32×16 P10 LED Matrix Preview** ported from `firmware/main/clock_render.c` (15 font IDs, brightness dimming/0% blanking, colon blink, 5 seconds animations, dual-timezone 2-line layout, `ST`/`RE` timer priority, `SYNC` fallback), quick brightness control, and ringing banners.
- **`# alarms-timers`**: 5 NVS alarm slots with instant toggles, time/repeat/duration editor (preserving unsaved edits across 5s polls), Demo Mode **Test Alarm Ring**, Stopwatch (`MM:SS:T`, `99:59.99` limit), and Reminder (`1s–24h`, preset chips + custom `H:M:S`).
- **`# display-sound`**: Live draft matrix preview, 12 selectable font styles (mapping legacy IDs `2–4 -> 0`), searchable IANA timezone modal (~590 zones), dual-timezone lock enforcement (preserving saved `format_12h`), hourly chime patterns (`0–3`), and button feedback toggle.
- **`# device-network`**: Demo Simulator vs Live HTTP profile manager, **Open Device Web Dashboard** quick link, Wi-Fi scan & credential provisioning, live hardware telemetry, OTA `.bin` binary header preflight (`inspectOtaBinary`: `0xE9` magic + `0xABCD5432` app descriptor check + `1.875 MiB` cap), upload progress bar (`XMLHttpRequest`), and station-only OTA/reboot confirmations.
- **`# usb-flasher`**: Browser-based **ESP Web Serial Flasher** (`esptool-js` + `js-md5`) supporting real USB flashing in Chrome/Edge AND simulated ESP32 / ESP32-S3 flashing in Demo Mode, with 4096-byte aligned offset validation, sector-overlap checks, whole-flash erase guard, live progress log, Ubuntu `dialout` command copy, and Factory GPIO pinout reference.
- **Glassmorphic Themes**: Default **Momentra Dark** (`#080e1a` midnight-slate + `#8be8cb` mint-emerald) plus all 8 Momentra themes (`Light`, `Dark`, `Ocean`, `Sunset`, `Lavender`, `Sand`, `Forest`, `Midnight`) persisted in `localStorage`.

## Firmware & Portable Flasher Improvements (`firmware/`)

- **Portable Flasher (`firmware/installer/ota.js`, `index.html`, `style.css`)**:
  - Client-side `ota-host` validation (`momentra.local` or private/link-local IPv4) before polling or setting the dashboard link.
  - Pre-upload `.bin` app header inspection (`0xE9` + `esp_app_desc_t` magic `0xABCD5432` at `0x20`).
  - Upload progress bar (`XMLHttpRequest` with `fetch` fallback for Node tests), safe `alarms` entry guards, and resetting `#ota-confirm` after upload.
- **ESP-IDF Firmware (`firmware/main/`) & Go Launcher (`firmware/installer/launcher/`)**:
  - CORS + `OPTIONS` preflight support, JSON error escaping, heap-allocated `/api/status` buffer, OTA app-descriptor & `project_name` verification with rollback if restart scheduling fails, NVS unchanged-key write skip, and panel-ready OTA verification check.
  - Reusable `http.Client` in `clock.go`, macOS `open` support, and `SIGINT`/`SIGTERM` graceful shutdown in `main.go`.

## Toolchain Verification Limits

- Verified locally on this Windows host: TypeScript (`npx.cmd tsc --noEmit`), Vite production build (`npm.cmd run build`), Playwright headless browser E2E, and Node firmware tests (`npm.cmd run test:firmware-js`).
- ESP-IDF C firmware (`idf.py build` / C unit tests) and the Go launcher (`go test ./...`) require `esp-idf`, `gcc`, and `go` toolchains (available in CI / Linux dev environments, not installed on this Windows host).
