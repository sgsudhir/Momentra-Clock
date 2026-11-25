# HTTP API reference

[Wiki home](README.md) · [Dashboard](dashboard.md) ·
[Architecture](architecture.md) · [Operations](operations.md)

## Before you call

The device serves HTTP on port 80. Use its DHCP address, or
`http://momentra.local` where mDNS works. In setup AP mode, use
`http://192.168.4.1`. Examples use `http://192.168.1.50` as a placeholder.

> [!WARNING]
> There is no authentication, authorization, TLS or CSRF protection. Treat
> every client on the network as able to control or reflash the device.
> Never expose these endpoints to the public Internet.

`GET /` serves the dashboard as HTML. API responses are JSON. Form endpoints
accept URL-encoded bodies; send `Content-Type:
application/x-www-form-urlencoded`. JSON request bodies are not supported.
OTA takes a raw binary body, not a multipart form. No API versioning or
compatibility guarantee is provided.

Successful POST responses are `{"ok":true}`. Errors normally have the form
`{"error":"description"}`. Actual network interruptions or HTTP-server
failures need not return JSON. Form bodies must be 1–1024 bytes with at most
10 fields; names and values are limited to 31 and 127 decoded bytes
respectively. Duplicate names, invalid percent escapes, embedded NULs,
unexpected fields and missing required fields are rejected. Numeric inputs
must parse as complete decimal values in their allowed range.

| HTTP status | Meaning |
| --- | --- |
| 200 | Request accepted or data returned. A restart is asynchronous. |
| 400 | Malformed input, invalid value or firmware image/size, or interrupted OTA upload. |
| 403 | OTA rejected because the device is not connected in station-only mode. |
| 409 | Concurrent settings change, incompatible timer state, missing buzzer for a reminder, or scan already running. |
| 500 | Operational failure such as storage, scan, identity or OTA failure. Consult serial logs. |

Error messages are descriptive, not stable machine-readable error codes. A
500 after a save or OTA operation can report that data was saved/uploaded but
restart scheduling failed; inspect state before retrying. Do not retry
state-changing operations blindly.

## Endpoint index

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/status` | Read current settings and telemetry |
| POST | `/api/settings` | Save display, sound and optional primary timezone settings |
| GET / POST | `/api/timezones` | List named timezones / save second timezone settings |
| POST | `/api/alarm` | Save one alarm slot |
| POST | `/api/alarm/stop` | Request stop of scheduled sound |
| POST | `/api/timer` | Control stopwatch or reminder |
| POST / GET | `/api/wifi/scan` | Start / read an asynchronous Wi-Fi scan |
| POST | `/api/wifi` | Save candidate credentials and reboot |
| POST | `/api/reboot` | Request restart |
| POST | `/api/ota` | Stream raw application image and reboot |

## GET /api/status

The response is marked `Cache-Control: no-store`. Boolean telemetry is JSON
`true`/`false`; persisted switches are numeric `0`/`1`.

| Field | Type and meaning |
| --- | --- |
| `firmware_version` | Firmware semantic version string, also shown in the dashboard footer. |
| `uptime_seconds` | Integer monotonic seconds since boot. |
| `free_heap_bytes`, `min_free_heap_bytes` | Current and minimum free heap in bytes since boot. |
| `wifi_connected`, `setup_ap` | Boolean station connection and setup AP state. |
| `wifi_rssi` | Station RSSI in dBm, or `null` when unavailable. |
| `local_ip` | IPv4 string for station when connected, otherwise AP when active; `null` if unavailable. |
| `wifi_mac` | Station MAC string. |
| `chip_id` | Twelve uppercase hexadecimal digits derived from the factory MAC. |
| `time_valid` | Boolean; synchronization is fresh and wall time was readable. |
| `unix_time`, `unix_time_ms` | UTC Unix epoch seconds/milliseconds, or `null` when time is invalid. |
| `sync_age_seconds` | Monotonic seconds since successful sync; `null` if never synchronized or monotonic reference invalid. It can remain numeric when time is stale. |
| `display_ready`, `buzzer_configured` | Boolean driver readiness and buzzer GPIO configuration; neither proves physical hardware works. |
| `ringing`, `ringing_mask` | Scheduled-alarm boolean and bitmask: bit 0 is slot 0, bit 4 is slot 4. A reminder or chime is not represented by `ringing`. |
| `stopwatch_state`, `reminder_state` | `0` stopped, `1` running, `2` paused, `3` ringing (reminder only). |
| `stopwatch_ms`, `reminder_ms` | Elapsed and remaining milliseconds. Reminder values are rounded up from microseconds. |
| `brightness`, `font`, `format_12h`, `hourly_enabled`, `hourly_pattern`, `feedback_enabled`, `colon_blink`, `seconds_animation` | Persisted values, described under settings below. |
| `timezone_primary`, `timezone_secondary` | Saved IANA timezone names. |
| `timezone_secondary_enabled` | Numeric 0/1, whether the panel shows two rows. |
| `timezone_primary_offset`, `timezone_secondary_offset` | Current seconds east of UTC, or `null` when time or bundled timezone rules are unavailable. |
| `alarms` | Exactly five objects in slot order, each with numeric `enabled`, `hour`, `minute`, `repeat`, `duration_seconds`. |
| `alarm_next_seconds` | Five estimated seconds to the next matching local alarm time, or `null` for disabled alarms or unavailable time. Scheduling state, time corrections and DST rollbacks can alter the actual next sound. |

Credentials are not returned. MAC-derived identifiers are exposed to any
client with API access. Values come from individually collected snapshots, so
they may reflect slightly different instants.

```sh
curl -fsS http://192.168.1.50/api/status
```

Illustrative response (identifiers and values are examples):

```json
{
  "firmware_version": "1.0.0", "uptime_seconds": 42, "free_heap_bytes": 100000, "min_free_heap_bytes": 90000,
  "wifi_connected": true, "setup_ap": false, "wifi_rssi": -67,
  "local_ip": "192.168.1.50", "chip_id": "0123456789AB",
  "wifi_mac": "01:23:45:67:89:AB", "time_valid": true,
  "unix_time": 1700000000, "unix_time_ms": 1700000000123, "sync_age_seconds": 15,
  "display_ready": true, "buzzer_configured": true, "ringing": false, "ringing_mask": 0,
  "stopwatch_state": 0, "stopwatch_ms": 0, "reminder_state": 0, "reminder_ms": 0,
  "brightness": 50, "font": 0, "format_12h": 0, "hourly_enabled": 0,
  "hourly_pattern": 0, "feedback_enabled": 1, "colon_blink": 0, "seconds_animation": 0,
  "timezone_primary": "Asia/Kolkata", "timezone_secondary": "Etc/UTC",
  "timezone_secondary_enabled": 0, "timezone_primary_offset": 19800, "timezone_secondary_offset": 0,
  "alarms": [
    {"enabled": 0, "hour": 0, "minute": 0, "repeat": 0, "duration_seconds": 10},
    {"enabled": 0, "hour": 0, "minute": 0, "repeat": 0, "duration_seconds": 10},
    {"enabled": 0, "hour": 0, "minute": 0, "repeat": 0, "duration_seconds": 10},
    {"enabled": 0, "hour": 0, "minute": 0, "repeat": 0, "duration_seconds": 10},
    {"enabled": 0, "hour": 0, "minute": 0, "repeat": 0, "duration_seconds": 10}
  ], "alarm_next_seconds": [null, null, null, null, null]
}
```

## POST /api/settings

All first five fields are required; omitted optional fields retain their
current values. Changes persist across reboot after a successful commit.

| Field | Values |
| --- | --- |
| `brightness` | 0–100 percent |
| `font` | 0–14; see table below |
| `format_12h` | Saved single-zone preference: 0 = 24-hour, 1 = 12-hour; two-zone mode always displays 24-hour time. The panel has no AM/PM indicator. |
| `hourly_enabled` | 0 = off, 1 = on |
| `hourly_pattern` | 0–3; the patterns differ in beep rhythm, not pitch |
| `feedback_enabled` | Optional 0/1; action feedback |
| `colon_blink` | Optional 0/1 |
| `seconds_animation` | Optional: 0 off, 1 moving dot, 2 progress bar, 3 bouncing ball, 4 jumping ball |
| `timezone_primary` | Optional IANA name from `GET /api/timezones`; alarms and hourly chimes use this zone |

| Font ID | Dashboard label | Font ID | Dashboard label |
| ---: | --- | ---: | --- |
| 0 | Style 1 | 1 | Style 2 |
| 2–4 | Legacy IDs; render as Style 1 | 5 | Large outdoor (14 px) |
| 6 | Medium (12 px) | 7 | Small indoor (5×7) |
| 8 | Tall slim | 9 | Extra small |
| 10 | Wide | 11 | Bold tall |
| 12 | Bold compact | 13 | Digital segments |
| 14 | Rounded compact | | |

Animations are suppressed for fonts 5, 6, 8, 11 and 13 because of height.
When the second timezone is enabled, both rows use 24-hour 5×7 digits.
Animation is suppressed without changing the saved time format, font or animation.
The dashboard maps stored legacy IDs 2–4 to Style 1 on editing. Older firmware
may reject newer font IDs; choose Style 1 or 2 before a downgrade.

```sh
curl -fsS -X POST http://192.168.1.50/api/settings \
  -d 'brightness=80&font=7&format_12h=0&hourly_enabled=1&hourly_pattern=1&feedback_enabled=1&colon_blink=1&seconds_animation=3&timezone_primary=Europe%2FLondon'
```

## GET /api/timezones and POST /api/timezones

GET returns an array of supported IANA names from bundled tzdb 2026f. POST
requires `timezone_secondary` (one of those names) and
`timezone_secondary_enabled` (0/1). Changes are committed to NVS. The rules
cover 1970–2100 and can require a firmware update as timezone laws change.

```sh
curl -fsS http://192.168.1.50/api/timezones
curl -fsS -X POST http://192.168.1.50/api/timezones \
  -d 'timezone_secondary=America%2FNew_York&timezone_secondary_enabled=1'
```

## POST /api/alarm

All six fields are required. The hour is always 24-hour local time.

| Field | Values |
| --- | --- |
| `index` | 0–4; dashboard labels these Alarm 1–5 |
| `enabled` | 0/1 |
| `hour`, `minute` | 0–23 and 0–59 |
| `repeat` | 0 = once, 1 = daily |
| `duration_seconds` | 5, 15, 45, 240, 300, or any multiple of 10 from 10 through 180 |

The dashboard presents a subset of the accepted legacy multiples of ten.
One-shot alarms are disabled in flash before sounding. See
[alarm flow](architecture.md#alarms-timers-and-sound) for power-loss and
time-correction limitations.

```sh
curl -fsS -X POST http://192.168.1.50/api/alarm \
  -d 'index=0&enabled=1&hour=7&minute=30&repeat=1&duration_seconds=30'
```

## POST /api/alarm/stop

Requests that the alarm worker stop the current scheduled alarm or chime.
The response acknowledges the request; it does not wait for the worker. Use
the timer endpoint to dismiss a reminder.

```sh
curl -fsS -X POST http://192.168.1.50/api/alarm/stop
```

## POST /api/timer

Send `timer=stopwatch` or `timer=reminder` and `action=start`, `pause`,
`resume` or `stop`. Reminder `start` additionally requires `seconds=1–86400`;
no other fields are accepted. Start requires stopped state; pause requires
running; resume requires paused; stop requires a non-stopped state. Invalid
transitions return 409. A reminder requires a configured buzzer.

```sh
curl -fsS -X POST http://192.168.1.50/api/timer -d 'timer=stopwatch&action=start'
curl -fsS -X POST http://192.168.1.50/api/timer -d 'timer=stopwatch&action=pause'
curl -fsS -X POST http://192.168.1.50/api/timer -d 'timer=reminder&action=start&seconds=90'
curl -fsS -X POST http://192.168.1.50/api/timer -d 'timer=reminder&action=stop'
```

The stopwatch reaches 99:59.99 and pauses. A reminder rings for at most 15 s
after its deadline unless stopped; both timers are lost on reboot.

## POST and GET /api/wifi/scan

POST starts a scan on a separate worker; 409 means one is already running.
GET returns `{"state":"idle"}`, `{"state":"running"}`, or:

```json
{"state":"done","networks":[{"ssid_hex":"4578616d706c65","rssi":-60}]}
```

`ssid_hex` contains SSID bytes encoded as lowercase hexadecimal, not a
JSON-escaped SSID. Empty names are omitted and repeated SSIDs deduplicated.
The scan considers up to the configured maximum of 20 records; it is not a
guaranteed inventory of every nearby network. Scan failures return 500.

```sh
curl -fsS -X POST http://192.168.1.50/api/wifi/scan
curl -fsS http://192.168.1.50/api/wifi/scan
```

## POST /api/wifi

Send exactly `ssid` and `password`. SSID is 1–32 bytes; password is empty
for an open network or 8–63 bytes. The device saves pending credentials and
schedules reboot; successful connection promotes them. Do not place real
credentials in shell history or shared logs.

```sh
# Interactive curl prompts avoid placing the password in the command line.
read -r -p 'SSID: ' SSID
read -r -s -p 'Wi-Fi password: ' WIFI_PASSWORD; printf '\n'
curl -fsS -X POST http://192.168.1.50/api/wifi \
  --data-urlencode "ssid=$SSID" --data-urlencode "password=$WIFI_PASSWORD"
unset WIFI_PASSWORD SSID
```

Even with an interactive prompt, the request is unencrypted and process
arguments may be observable locally. Provision only on a trusted isolated
network; the device reboots and the address may change.

## POST /api/reboot

Schedules restart after a short delay. Active timers and sounds are lost.

```sh
curl -fsS -X POST http://192.168.1.50/api/reboot
```

## POST /api/ota

Upload the raw ESP32 application `.bin` to the inactive OTA slot. The station
must be connected and the setup AP inactive. The body must be nonempty and fit
the inactive slot; the firmware validates the image before selecting it.
Display scanning is paused during upload and resumes on failure when possible.
After a successful response the device reboots. A restart scheduling failure
can leave the uploaded image selected; see
[recovery](operations.md#firmware-update-and-recovery).

```sh
curl -fsS -X POST -H 'Content-Type: application/octet-stream' \
  --data-binary @build/production/ESP_P10_Clock_BLR.bin \
  http://192.168.1.50/api/ota
```

Only upload a trusted, compatible application image. Do not use a bootloader,
partition table or merged flash image for this endpoint.
