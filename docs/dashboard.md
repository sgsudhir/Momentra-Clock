# Dashboard guide

[Wiki home](README.md) · [Installation](installation.md) ·
[API reference](api.md) · [Troubleshooting](operations.md)

The dashboard is served by the clock itself; it works on a phone or a
desktop browser on the same accessible network. Its appearance changes with
screen size and theme. The diagram is a **schematic**, not a screenshot.

```text
┌───────────────────────────────────────────────────────────────┐
│  Momentra Clock          Live · Theme selector · Refresh      │
├───────────────────────────────────────────────────────────────┤
│  Alarm / reminder banner and stop button, when ringing        │
├───────────────────────────────────────────────────────────────┤
│  CLOCK OVERVIEW: time, date, Wi-Fi, alarms and hourly chime   │
├──────────────────────────────┬────────────────────────────────┤
│  Display & sound             │  Second timezone               │
│  brightness · font · zone    │  optional two-line display     │
├──────────────────────────────┼────────────────────────────────┤
│  Alarms                      │  five editable alarm slots     │
├──────────────────────────────┼────────────────────────────────┤
│  Stopwatch                   │  Reminder                      │
├──────────────────────────────┼────────────────────────────────┤
│  System details              │  Wi-Fi setup / maintenance     │
└──────────────────────────────┴────────────────────────────────┘
```

## Open and understand the page

1. Connect the browser to the setup AP or the same trusted network as the
   clock. Open the IP address, or `http://momentra.local/` if mDNS works.
2. Wait for **Live** and for settings controls to become enabled. The top
   clock shows `--:--` until device time is valid.
3. Expand sections by selecting their headings. **System details** shows
   uptime, RSSI, IP, station MAC, sync age, panel/buzzer status, brightness
   and memory information.
4. Choose Light, Dark, Ocean, Sunset, Lavender, Sand, Forest or Midnight in
   the header. Theme preference is stored in this browser, not in the device.
   The page respects the browser's reduced-motion preference for decoration.

The browser polls status approximately every five seconds after each request
completes. It interpolates the clock locally and re-anchors from device time
roughly every 15 seconds. Browser scheduling and network latency affect the
display. An unreachable-device warning means shown data may be stale; short
sounds may start and finish between polls. The refresh button reloads the
page; unsaved form edits can be lost.

## Display and sound

1. Move **Brightness** to 0–100%. Zero blanks the panel.
2. Choose a **Font style** and **Time format**. The physical panel has no
   AM/PM indicator in 12-hour mode; the dashboard does.
3. Select the **Primary timezone**. Alarms and hourly chimes follow this zone.
4. Choose **Blink colon** and a **Seconds animation**, if desired. Tall fonts
   do not have room for the bottom animation; timers and connection screens
   hide it too.
5. Enable **Hourly chime** and select a pattern. Patterns differ by rhythm,
   not pitch, because the buzzer is active.
6. Toggle **Button sound feedback** to enable or disable confirmation beeps.
   This does not mute alarms, reminders or hourly chimes.
7. Select **Save settings**. Changes are applied after a successful save;
   watch for a success or error message.

The first-boot default is 50% brightness, Style 1, 24-hour time, hourly
chime off, feedback on and effects off. Saved settings override defaults.
Fonts with legacy IDs 2–4 display as Style 1; the form maps them to Style 1.

## Second timezone

1. Expand **Second timezone**, choose a named region and turn **Two-line display** on.
2. Select **Save second timezone**. The first panel row is the primary time and the second is the selected second time, without labels or AM/PM markers.
3. Both rows use 24-hour time and the 5×7 font. Time format, font and seconds-animation controls are disabled while enabled; their saved values return when the feature is turned off. Colon blinking remains available.

The dashboard footer shows the running firmware version and contact email.

Timezone settings survive restart. The bundled IANA tzdb 2026f covers 1970–2100; daylight-saving rules can change and require a firmware update to refresh.

## Create or change an alarm

1. Open **Alarms** and select **Alarm 1** through **Alarm 5**.
2. Set **Status** to On, enter hour 0–23 and minute 0–59, and select
   **Once** or **Daily** and a duration.
3. Select **Save alarm**. Repeat for other slots. The active list summarizes
   enabled slots and an approximate next occurrence when time is valid.
4. When a scheduled alarm is detected as ringing, use the top **Stop alarm**
   button. To disable a future alarm, select its slot, change Status to Off
   and save.

Alarms require a configured buzzer and fresh NTP time. One-shot alarms are
disabled persistently before sound begins. They are not replayed after missed
minutes or outages. See [alarm behavior](architecture.md#alarms-timers-and-sound).

## Stopwatch

1. Expand **Stopwatch** and choose **Start**.
2. Use **Pause**, then **Resume**, or **Stop & reset**.
3. While running it takes priority on the panel; when paused it remains visible
   in the dashboard. It pauses at its 99:59.99 limit.

## Reminder

1. Expand **Reminder**, then **Set duration**. Choose hours, minutes and
   seconds totaling between one second and 24 hours.
2. Select **Start**; use **Pause**, **Resume** or **Stop & reset** as needed.
3. At expiry, use the top **Stop reminder** button or wait up to 15 seconds
   for automatic dismissal. A scheduled sound can take buzzer priority.

Reminder start requires a configured buzzer. Both timers use monotonic time,
do not require NTP, and are cleared by reboot. A running stopwatch has panel
priority over a reminder.

## Change Wi-Fi

1. Open **Wi-Fi setup**. Scanning starts automatically; **Scan again** retries.
2. Select a network, or choose **Other / hidden network** and enter its SSID.
3. Enter its password, or leave it empty for an open network, then select
   **Save & reboot**.
4. Reconnect to the new network and find the device's new address.

Scanning may briefly interrupt traffic or fail during station connection.
Non-UTF-8 SSIDs are not selectable in the dashboard. Credentials sent to the
open setup AP are observable nearby; never provision over an untrusted
environment.

## Firmware and restart

Open **Device maintenance** to select a trusted application `.bin` and use
**Upload & reboot**, or select **Reboot device**. OTA requires a connected
station with setup AP inactive. Upload blanks the panel while flash is
written and interrupts normal operation. Check alarms and timers and follow
the [update and recovery procedure](operations.md#firmware-update-and-recovery)
first. Do not upload bootloader or combined flash images.
