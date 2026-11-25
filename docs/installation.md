# Installation and deployment

[Wiki home](README.md) · [Dashboard](dashboard.md) ·
[Operations](operations.md) · [Architecture](architecture.md)

This is a release and deployment procedure, not a claim that the project is
production-certified. The latest panel redesign has not been physically
verified; complete the acceptance checklist on each intended hardware
revision. Do not use the clock as a safety-critical alarm.

For board selection, connector mapping, resistor calculations, a 2N2222
buzzer-driver example and power guidance, read the
[hardware and pinout guide](hardware.md) before assembling.

## First installation with the portable flasher

Download a published package from [GitHub Releases](https://github.com/sgsudhir/Momentra-Clock/releases):
the Windows x86-64 ZIP or Ubuntu x86-64 tar.gz. A release must exist before
these packages can be downloaded. After download and extraction, the launcher,
browser assets and Momentra image work offline. The launcher serves only
`127.0.0.1` on a random port; leave its window open. The browser requests
explicit serial-port permission. Chrome or Edge on Windows or Ubuntu is
required; opening a local HTML file directly does not work.

1. Read the [hardware guide](hardware.md). Each factory image enables panel
   GPIOs and a target-specific buzzer output; use safe, correctly wired hardware. Use
   **one** 32 × 16 monochrome P10 HUB12 panel with 1/4 scan and matching
   polarity and scan order; white, red, green, blue, yellow and pink are
   possible fixed-color variants, subject to hardware verification. RGB and
   multiple panels are unsupported. If
   using the official DevKitC with USB, disconnect external board power.
2. Connect a data-capable USB cable to the ESP32 and computer. Install the
   appropriate USB-to-serial driver if the board does not appear; close
   serial monitors using the same port.
3. Extract the archive and run `momentra-flasher.exe` on Windows or
   `./momentra-flasher` on Ubuntu. If needed, use
   `chmod +x ./momentra-flasher` first. The launcher opens the default browser;
   if it is not Chrome or Edge, copy the printed local URL into one of them.
4. Select **Connect device** and choose the serial port. Check that the
   detected chip is ESP32 or ESP32-S3 with at least 4 MB flash. Select the
   Momentra preset, read the warnings, check the confirmation box, and select
   **Review and flash**. The installer chooses the image for the detected
   chip. Verify that the board matches its target-specific GPIO mapping.
   Confirm the displayed image and device. The factory
   image **always overwrites NVS**, even when whole-device erase is unchecked.
   Existing credentials, settings and the previous partition layout can be
   lost; back up first. Wait for verification and reset.
5. After verification, release BOOT and press EN/RESET once to start normally.
   Follow the installer's on-screen instructions to
   connect to the open **Momentra Clock** AP and configure station Wi-Fi.
   The AP is unauthenticated and unencrypted; provision only in a trusted
   environment. Older installed firmware uses `P10-Clock-Setup` until updated.

Close the launcher window or press Ctrl+C when finished. On Ubuntu, serial
device permissions may need to be granted for the USB
adapter and the user may need to sign in again. On Ubuntu, if the device uses
the `dialout` group, the installer provides a copy button for
`sudo usermod -aG dialout "$USER"`. This grants the account access to serial
devices; sign out and back in afterward. Check the device's actual group,
which can differ by Linux distribution.

On Windows, the flasher page includes an expandable step-by-step guide. If
the board does not appear, use Device Manager to inspect its COM port or
driver, try a data-capable cable, and install only the driver appropriate
to the board's USB interface from the manufacturer's official source. Close
other serial applications before connecting.

Most boards enter download mode automatically. If connection fails, hold
BOOT, press and release EN/RESET, then release BOOT. Select **Connect device**
and choose the port. After upload and verification, release BOOT and press
EN/RESET once to start the installed firmware normally; the flasher may also
reset the device automatically. Check the board manual for its button sequence.
Browser
port selection is explicit. Momentra presets support ESP32 and ESP32-S3;
custom mode supports ESP8266 and ESP32-family chips implemented by the
bundled `esptool-js` version with a working flasher stub and detectable flash,
not all boards or chip configurations.
The firmware does not implement Improv Wi-Fi provisioning: use the open
setup AP.

### Flash custom ESP firmware

Select **Custom ESP firmware**, choose each binary and enter its decimal or
hexadecimal flash offset. Offsets must be 4096-byte aligned. The flasher
detects the flash size, rejects empty files, out-of-bounds files and
overlapping erase sectors, and displays the detected chip and file list
before confirmation. It does not determine whether custom binaries match
the chip or partition layout; obtain correct files and offsets from their
provider. Wrong files can make the device unbootable.

Whole-chip erase is off by default. Even without it, each selected file
erases its touched sectors, and custom files can overwrite credentials or
other important data. Back up first. The flasher checks written data with MD5;
this detects transfer errors, not malicious firmware.

## Modify, build and upload

To customize the firmware, install and activate ESP-IDF using Espressif's
official instructions, then edit the source and build locally. For the
tested toolchain and production configuration, follow steps
[3](#3-install-and-configure-esp-idf) and [4](#4-initial-flash) below. In an
ESP-IDF terminal on Windows, use the same `idf.py` actions and a Windows
path for `SDKCONFIG`, for example `-D SDKCONFIG=C:/momentra/build/production/sdkconfig`,
and replace `/dev/ttyUSB0` with the board's `COM` port. Select the matching
**ESP32** or **ESP32-S3** target; S2/C3 are not supported. Use separate build
and sdkconfig directories for the two targets. Rebuild after changing source,
settings or the embedded dashboard.

Use the serial `flash` action for the first install or a deliberate partition
migration; it writes the bootloader, partition table, OTA data and application.
Back up device data before changing layouts. For a compatible existing layout,
the dashboard's **Device maintenance** accepts only the generated application
binary for the same chip target (`build/production/ESP_P10_Clock_BLR.bin`
for ESP32 or `build/production-s3/ESP_P10_Clock_BLR.bin` for ESP32-S3) as
an OTA update, not the merged factory image. Confirm active alarms and timers and follow
[update and recovery](operations.md#firmware-update-and-recovery).

## Build and publish portable packages

The [`release.yml`](../.github/workflows/release.yml) workflow builds the
ESP-IDF 6.1 factory images for both targets, browser bundle, and Windows and Ubuntu x86-64
launchers. Pushes to `main` and manual workflow dispatch create an Actions
artifact without publishing a release. Pushing a `v*` tag triggers the build
and, if it succeeds, creates a GitHub Release with both archives and
`SHA256SUMS.txt`.
Review the source and verify the actual target hardware before creating a
release tag. A passing build is not hardware validation. No GitHub Pages
configuration is required.

The factory image combines the bootloader, partition table, initial OTA
metadata and app into one binary. Since it starts at offset zero, its filled
gaps include the NVS area; do not describe it as a settings-preserving update.
The workflow checks offsets and flash parameters against the ESP-IDF build
output before packaging. The bundled webpage, libraries and image are served
locally; no cloud provisioning service is used.

To build the launcher from source after building firmware with ESP-IDF, install
Node.js/npm and Go 1.22 or later. From the repository root, using an activated
ESP-IDF environment:

```sh
idf.py -B build/production -D SDKCONFIG="$PWD/build/production/sdkconfig" build
mkdir -p build/release
esptool --chip esp32 merge-bin --flash-mode dio --flash-size 4MB --flash-freq 40m \
  -o build/release/momentra-factory.bin \
  0x1000 build/production/bootloader/bootloader.bin \
  0x8000 build/production/partition_table/partition-table.bin \
  0xf000 build/production/ota_data_initial.bin \
  0x20000 build/production/ESP_P10_Clock_BLR.bin
idf.py -B build/production-s3 -D SDKCONFIG="$PWD/build/production-s3/sdkconfig" \
  -D IDF_TARGET=esp32s3 build
esptool --chip esp32s3 merge-bin --flash-mode dio --flash-size 4MB --flash-freq 80m \
  -o build/release/momentra-s3-factory.bin \
  0x0 build/production-s3/bootloader/bootloader.bin \
  0x8000 build/production-s3/partition_table/partition-table.bin \
  0xf000 build/production-s3/ota_data_initial.bin \
  0x20000 build/production-s3/ESP_P10_Clock_BLR.bin
npm ci --prefix installer
sh installer/prepare-site.sh build/release/momentra-factory.bin build/release/momentra-s3-factory.bin
(cd installer/launcher && go test ./... && go build -o momentra-flasher .)
```

These merge offsets and flash parameters assume the production defaults.
If the firmware configuration changes, check `flasher_args.json` and the
partition layout before using the merged image. The CI workflow enforces
the expected production layout.

## 1. Prepare the equipment

- Original ESP32 or ESP32-S3 with **at least 4 MB flash**, programming interface and suitable 3.3 V
  regulation; **one** 32 × 16 monochrome P10 HUB12 panel with 1/4 scan and
  matching scan order and polarity. White, red, green, blue, yellow or pink
  single-color panels are possible; verify the exact panel before use.
- A properly rated, regulated panel supply; common ground between panel,
  ESP32 and buzzer driver. Confirm actual panel current under worst-case load.
- An active buzzer with a suitable transistor/MOSFET driver, pull-down and
  supply; use appropriate protection if the load is inductive.
- Suitable 3.3 V-to-panel logic level shifting when required by the panel.
  Correctly powered AHCT-family buffers are one possible option for 5 V
  inputs, subject to the actual component and panel specifications.
- USB/data cable, workstation, ESP-IDF toolchain, and access to a trusted
  isolated Wi-Fi network. DHCP and DNS are needed for ordinary station setup;
  UDP NTP access is needed for time synchronization.

> [!CAUTION]
> Do not power the panel or buzzer directly from ESP32 GPIOs. Verify supply
> polarity, current capacity, ground, logic voltage, OE inactive state during
> reset, and actual connector markings before connecting. Disconnect power
> before changing wiring. No ribbon-cable orientation is assumed here.

## 2. Wire by signal name

These are default **chip GPIO numbers**, not physical connector positions.
Refer to the panel and module documentation for actual pin locations.

| Signal | ESP32 GPIO | ESP32-S3 GPIO | Role |
| --- | ---: | ---: | --- |
| DATA | 23 | 4 | SPI data |
| CLK | 18 | 5 | SPI clock |
| LATCH / STB | 19 | 6 | Shift-register latch |
| OE | 21 | 7 | Output enable and brightness PWM |
| A | 22 | 15 | Row-address bit 0 |
| B | 25 | 16 | Row-address bit 1 |
| Buzzer driver input | 26 | 17 | Active-high control of external driver |

```text
 Original ESP32         Panel / driver
 GPIO23  -------------> DATA
 GPIO18  -------------> CLK
 GPIO19  -------------> LATCH
 GPIO21  -------------> OE
 GPIO22  -------------> A
 GPIO25  -------------> B
 GPIO26  -------------> buzzer driver input, not buzzer load
 GND     -------------  common ground

 Correctly rated panel supply ---> panel power inputs
```

For S3 wiring substitute the S3 GPIOs from the table. The S3 mapping is
for an ESP32-S3-DevKitC-1 N16R8 and has not been physically verified.

Add level shifting where needed; the diagram omits it and is not a complete
circuit. The current driver assumes active-low DATA, active-high OE, binary
A/B addressing and the documented 1/4-scan row ordering. Other panels may
need different configuration or driver changes. Confirm OE and DATA polarity
from the panel itself. Start at low brightness and use an appropriately
protected supply. The firmware rejects unsafe/reserved or duplicate output
pins; this check does not replace board-level electrical review.

## 3. Install and configure ESP-IDF

Install ESP-IDF and its tools using the
[official setup instructions](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/get-started/).
The prior build used ESP-IDF 6.1; compatibility with other versions has not
been established here. Activate the ESP-IDF environment in the shell, then
work from the repository root. The ESP-IDF component manager resolves the
declared mDNS dependency during configuration.

The project has separate development and production CMake presets. The
commands below use a separate production build and SDK configuration; the
name “production” is a build configuration, **not** a certification.
Run `set-target` when creating this build configuration. It runs a full
clean of the specified build directory and recreates its SDK configuration,
so back up any settings and artifacts you need before using it on an existing
build.

```sh
idf.py -B build/production -D SDKCONFIG="$PWD/build/production/sdkconfig" set-target esp32
idf.py -B build/production -D SDKCONFIG="$PWD/build/production/sdkconfig" menuconfig
```

For ESP32-S3, use a separate build directory and target:

```sh
idf.py -B build/production-s3 -D SDKCONFIG="$PWD/build/production-s3/sdkconfig" set-target esp32s3
idf.py -B build/production-s3 -D SDKCONFIG="$PWD/build/production-s3/sdkconfig" menuconfig
```

In the following build and flash commands, replace `build/production` with
`build/production-s3` for the S3. Target-specific defaults are read when a
new configuration is created; inspect existing configurations explicitly.

In **P10 clock hardware**, verify panel enable, pin assignments, DATA and OE
polarity against the real hardware. Set buzzer GPIO to `-1` if no buzzer is
connected; this prevents reminder starts and scheduled sound. Inspect the
effective configuration rather than assuming defaults were re-applied to an
existing `sdkconfig`. Project defaults configure 4 MB flash, a custom OTA
partition table, rollback, 1 kHz FreeRTOS tick and core-0 TCP/IP affinity.
Save configuration and build:

```sh
idf.py -B build/production -D SDKCONFIG="$PWD/build/production/sdkconfig" build
```

Confirm the build succeeds and the application fits the OTA slot. Keep the
source revision, toolchain version, effective SDK configuration, partition
table and resulting binaries together as release records. Verify the image
on the actual target before distributing it.

## 4. Initial flash

> [!WARNING]
> Changing a partition layout can make existing data inaccessible or
> overwrite it. Back up required data and plan migration before flashing.
> Do not OTA-update across incompatible partition layouts. Never erase flash
> without understanding the impact on credentials, alarms and other data.

The first flash must include the bootloader, partition table and application.
Select the correct serial port; replace the example below. Review permissions
and connected device identity before running:

```sh
idf.py -B build/production -D SDKCONFIG="$PWD/build/production/sdkconfig" \
  -p /dev/ttyUSB0 flash monitor
```

Follow the ESP-IDF monitor's exit instructions. The custom layout contains
NVS at `0x9000` (24 KiB), OTA metadata at `0xf000` (8 KiB), PHY data at
`0x11000` (4 KiB), and two 1.875 MiB app slots at `0x20000` and `0x200000`.
See [`partitions.csv`](../partitions.csv) for the authoritative table.

## 5. Provision Wi-Fi

1. On first boot, connect a phone or computer to the open
   **Momentra Clock** Wi-Fi network.
2. Open **http://192.168.4.1/**. This is not a captive portal; enter the
   address explicitly if necessary.
3. Open **Wi-Fi setup**. Select a scanned network or **Other / hidden
   network**, enter its name and password, and select **Save & reboot**.
   Empty passwords are for open networks; otherwise use 8–63 bytes.
4. Reconnect your client to the station network. Find the clock's address in
   the serial log or router, or try **http://momentra.local/** if mDNS is
   supported. If multiple clocks share the name, use the IP address.
5. Confirm the dashboard shows station connection and valid time. The panel
   normally shows RSSI and the final IPv4 octet briefly after connection.

The AP and setup traffic are open and unencrypted; nearby users can observe
credentials. The firmware keeps a pending credential candidate and promotes
it after connection. Failed connection attempts can reactivate the AP and
retry. Protect physical access and use a dedicated trusted network.

## 6. Acceptance before deployment

| Check | Expected evidence |
| --- | --- |
| Electrical safety | Supply, current, reset levels, logic levels and buzzer driver verified against actual component ratings. |
| Display | Correct scan mapping and polarity; readable time at multiple brightness settings; no unacceptable flicker under Wi-Fi and flash activity. |
| Network and time | Provisioning, reconnect, DNS, mDNS/IP access and NTP synchronization work on the target network; stale behavior tested. |
| Settings and alarms | Settings and alarms survive power cycle; once/daily, stop, simultaneous and failed-storage behavior tested. |
| Timers and sound | Stopwatch, reminder, chime, feedback and buzzer priority tested on actual hardware. |
| Update and recovery | Correct app image, upload, reboot, rollback/failure and serial recovery tested with a representative power interruption plan. |
| Security and operations | Network isolation, physical access, backup, monitoring and recovery responsibilities documented by the deployer. |

For ongoing updates use [firmware update and recovery](operations.md#firmware-update-and-recovery).
Perform a separate safety, security, radio/regulatory, accessibility and
environmental assessment as applicable; this repository does not establish
conformance with those standards.
