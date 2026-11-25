# Hardware, pinout and circuits

[Wiki home](README.md) · [Installation](installation.md) ·
[Architecture](architecture.md) · [Troubleshooting](operations.md)

This guide documents the **default build**, not every P10 panel or ESP32
board. The latest firmware and these example circuits have not been verified
together on the physical hardware. Connector orientation, signal polarity,
power consumption and component ratings must be checked against the exact
parts in hand.

> [!CAUTION]
> Disconnect power before wiring. Do not connect a 5 V signal directly to an
> ESP32 GPIO or power the panel or buzzer from a GPIO. Use a regulated,
> appropriately protected low-voltage supply and a suitable enclosure.
> Never work on exposed mains wiring. Have an experienced person review an
> uncertain circuit; the diagrams are design examples, not certified plans.

## Contents

- [ESP32 boards and compatibility](#esp32-boards-and-compatibility)
- [Display requirements](#display-requirements)
- [Default GPIO and panel signal mapping](#default-gpio-and-panel-signal-mapping)
- [System wiring overview](#system-wiring-overview)
- [Panel interface and level shifting](#panel-interface-and-level-shifting)
- [Active buzzer with a 2N2222](#active-buzzer-with-a-2n2222)
- [Power supply and capacitor](#power-supply-and-capacitor)
- [Before the first power-on](#before-the-first-power-on)

## ESP32 boards and compatibility

The application has separate **original ESP32** and **ESP32-S3** builds,
with different default GPIOs and a 4 MB flash layout. The following are candidates
for the same firmware configuration, not a hardware-tested compatibility
certification:

| Board or module | Default configuration | Conditions |
| --- | --- | --- |
| Espressif **ESP32-DevKitC-32E**, V4, with ESP32-WROOM-32E | Candidate without source or pin-configuration changes | Official board lists 4 MB flash and breaks out all seven selected GPIOs. Verify actual board revision, panel and power circuit. |
| Espressif **ESP32-DevKitC-32UE**, V4, with ESP32-WROOM-32UE | Candidate without source or pin-configuration changes | Official board lists 4 MB and the same V4 header mapping; install the appropriate external antenna as specified by the manufacturer. |
| Other original-ESP32 boards with ESP32-WROOM-32 / 32E | Conditional | Confirm at least 4 MB flash, all listed GPIOs exposed and unused by board hardware, correct power and suitable module/board design. Labels and header locations vary. |
| Espressif **ESP32-S3-DevKitC-1 N16R8** | S3 image and mapping below | 16 MB flash and 8 MB octal PSRAM; mapping and panel driver have not been physically verified. |
| Other ESP32-S3 boards | Conditional | Use the S3 image only if its pin mapping is safe for the actual module and board; otherwise rebuild with suitable GPIOs. At least 4 MB flash is required. |
| ESP32-S2, C3, C6 and other ESP32-family chips | Not supported by Momentra presets | Different chip targets, pin availability or peripherals require a separate port, configuration and testing. |

“Without changes” means the existing **default pin mapping, polarity and
partition layout** are suitable only if the actual connected panel and
hardware match them. It does not mean every board or panel is verified. For
example, a panel requiring active-low OE needs a configuration change; a
different scan order can need driver changes. A different flash size needs
careful configuration and partition review. Existing device configurations
can differ from [`sdkconfig.defaults`](../sdkconfig.defaults).

On the official DevKitC V4, use the labels and header numbers below; other
boards can have a different arrangement. Consult the
[Espressif DevKitC V4 guide and pin layout](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html)
for the exact board. Do not confuse **IO23** with physical pin 23.

## Display requirements

Use **one** P10 panel with **32 × 16 pixels**, a **monochrome HUB12**
interface and **1/4 scan**. The frame and driver are fixed for a single
panel; chaining panels or using a larger matrix is not supported.

A matching monochrome panel can have white, red, green, blue, yellow or pink
LEDs: each panel is physically one color, not a software-selectable color.
RGB/multicolor HUB75 panels are not supported by this firmware. Color alone
does not determine compatibility: verify the exact panel's interface, row
mapping, polarity, input voltage and power requirements. Only earlier
firmware has been used on the user's white panel; other colors and the latest
firmware have not been verified on hardware.

## Default GPIO and panel signal mapping

### Original ESP32

| ESP32 GPIO | DevKitC V4 header / label | Connect to | Function |
| ---: | --- | --- | --- |
| 23 | J3-2 / IO23 | Panel DATA, through level shifter if required | Serial pixel data; default data polarity active-low. |
| 18 | J3-9 / IO18 | Panel CLK | SPI shift clock. |
| 19 | J3-8 / IO19 | Panel LATCH / STB | Transfers shifted data to outputs. |
| 21 | J3-6 / IO21 | Panel OE | Active-high enable in the default configuration; PWM brightness. |
| 22 | J3-3 / IO22 | Panel A | Row address bit 0. |
| 25 | J2-9 / IO25 | Panel B | Row address bit 1. |
| 26 | J2-10 / IO26 | Buzzer driver input, **not the buzzer load** | Active-high buzzer control. |
| GND | J3-1, J3-7 or J2-14 / GND | Panel, buffer and driver ground | Shared signal reference; size panel power return separately. |

### ESP32-S3-DevKitC-1 N16R8

This is the S3 image's **example mapping**, not the original ESP32 mapping.
All selected signals are on the board's J1 header. The panel and buzzer have
not yet been verified with this board. Confirm the board revision and actual
labels before wiring, and use the panel input and level shifting described
below.

| Signal | ESP32-S3 GPIO | DevKitC-1 J1 header |
| --- | ---: | --- |
| DATA | 4 | 4 |
| CLK | 5 | 5 |
| LATCH / STB | 6 | 6 |
| OE | 7 | 7 |
| A | 15 | 8 |
| B | 16 | 9 |
| Buzzer driver input | 17 | 10 |
| Common ground | GND | 22 |

The N16R8 has 16 MB flash and 8 MB octal PSRAM. GPIO35–37 are used by
flash/PSRAM; GPIO19–20 are native USB, GPIO43–44 are serial, and GPIO38 or
GPIO48 may drive the onboard LED depending on board revision. Do not use
them for this mapping. Check the
[Espressif DevKitC-1 guide](https://documentation.espressif.com/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.1.html)
for the exact revision and power requirements. The provided S3 firmware uses
the first 4 MB of flash; it does not enable or require PSRAM.

Use the panel's marked signal names and its own documentation. Some panels
label DATA as `DIN`, CLK as `SCLK` and LATCH as `STB`; only treat labels as
equivalent after checking the manufacturer's pinout. Use the panel's **input**
connector, not its output, and do not assume ribbon orientation or ground
positions. Do not connect an unverified connector pin to 5 V.

The driver assumes one 32 × 16, 1/4-scan, monochrome P10 HUB12 panel, binary A/B
addressing, active-low DATA, active-high OE and the row/shift order implemented
in [`clock_scan.c`](../main/clock_scan.c). A board exposing a `C` row signal,
different scan ratio or different shift order is not automatically supported.
OE here is the **panel output-enable signal**; it is not necessarily the
enable pin of a separate logic buffer.

## System wiring overview

The following is a signal-level overview, not a numbered HUB12 connector or a
complete power-safety schematic:

```text
       Suitable regulated 5 V supply, appropriately protected
          +5 V ────────────────┬──────────── Panel +5 V*
                               ├──────────── Buzzer +*
                               ├──────────── Buffer VCC*, if used
                               └──────────── Board 5 V input*
          GND ─────────────────┬──────────── Panel GND
                               ├──────────── Buzzer-driver GND
                               ├──────────── Buffer GND
                               └──────────── ESP32 GND

       Original ESP32            3.3 V -> panel logic, if needed       PANEL
       IO23 ───────────────────> buffer ────────────────────────────> DATA
       IO18 ───────────────────> buffer ────────────────────────────> CLK
       IO19 ───────────────────> buffer ────────────────────────────> LATCH
       IO21 ───────────────────> buffer ────────────────────────────> OE
       IO22 ───────────────────> buffer ────────────────────────────> A
       IO25 ───────────────────> buffer ────────────────────────────> B
       IO26 ─────> base resistor + 2N2222 driver ───────────────────> buzzer -
```

For the S3, substitute the GPIOs from the table above; the power, level
shifter and buzzer-driver precautions are the same.

`*` Only if the actual component is specified for that voltage. Each branch
needs wiring and protection appropriate for its current. The board may
instead be powered from USB, with grounds connected, **only if** supply paths
cannot backfeed one another and the particular board documentation permits
the arrangement. For the official DevKitC V4, Espressif specifies **one and
only one** board power input: USB, 5 V header, or 3V3 header. Disconnect the
external board power input before connecting USB.
See [power options](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html#power-supply-options).

## Panel interface and level shifting

1. Determine the panel's supply voltage and logic-input thresholds from its
   documentation. The ESP32 outputs 3.3 V logic, not 5 V. Direct operation
   may work on some panels but is not guaranteed.
2. Where a 5 V panel needs a higher logic high, use a properly powered buffer
   whose guaranteed input thresholds accept the ESP32's 3.3 V output at the
   chosen supply, and whose output levels and speed meet panel requirements.
   A 5 V **AHCT-family** buffer may be suitable; verify the exact part's
   datasheet. Shift DATA, CLK, LATCH, OE, A and B as needed.
3. Connect buffer ground to ESP32 and panel ground. Add its manufacturer-
   recommended local decoupling capacitor and give unused inputs defined
   levels. Do not assume a generic bidirectional I²C level shifter is
   suitable for the 4 MHz SPI clock and panel control edges.
4. Ensure the panel OE is **inactive during reset, startup and loss of
   control**, including when the buffer is unpowered or disabled. With this
   default active-high panel OE, inactive is low. A suitable pull-down on
   the **panel-side OE net** may be needed; select its value based on input
   leakage, buffer drive, voltage and power sequencing. If the panel uses
   active-low OE, the inactive level and configuration are different.
   Check for back-powering through buffer or panel inputs. A pull resistor
   alone is not proof of safe behavior for every power sequence.

The panel contains shift-register and output-latch circuitry. The firmware
shifts data over SPI, blanks the outputs, latches data, changes row address
and re-enables output with PWM. No separate external shift register is
required by this design; panel internal ICs and exact register wiring vary.
For software behavior see [frame production and scanning](architecture.md#frame-production-and-scanning).

## Active buzzer with a 2N2222

Use an **active** buzzer with an internal oscillator, rated for the chosen
supply. The firmware switches it on and off; it does not generate musical
pitches. The example below is a low-side NPN switch for a small 5 V active
buzzer. It is not a suitable design for an arbitrary high-current load.

```text
                   regulated +5 V
                        │
             ┌──────────┴──────────────┐
             │                         │
        buzzer (+)                  D1 cathode (stripe)
        active buzzer              [optional flyback diode]
        buzzer (-)                  D1 anode
             │                         │
             └──────────┬──────────────┘
                        │
                        C
                  Q1  2N2222 / PN2222A
                        E
                        │
                       GND ─────────────── ESP32 GND

 ESP32 GPIO26* ─ R1 1 kΩ ──┬── B (Q1)
                            │
                         R2 100 kΩ
                            │
                           GND
```

`*` Use GPIO17 with the S3 default mapping instead of GPIO26.

R1 limits GPIO/base current. R2 pulls the transistor base low while the GPIO
is high-impedance during reset; it does not protect against a driven-high
GPIO or all power faults. Q1's collector goes to buzzer negative, emitter to
ground, and the buzzer positive to its rated supply. **Do not assume the
physical E/B/C lead order**: TO-92 and metal-can 2N2222 variants and
manufacturers can differ. Identify the exact part and use its datasheet.

If the buzzer is inductive and its manufacturer requires or permits an
external flyback diode, D1 goes across the load with **cathode/stripe to
positive supply** and anode to collector/buzzer negative. Choose its voltage,
current and pulse ratings for the load. Do not add a diode blindly to a
module whose datasheet specifies a different protection circuit.

### Example resistor sizing—not a universal parts list

For illustration only, suppose the **actual** active buzzer draws at most
20 mA, its 5 V rating is verified, and the selected transistor datasheet
supports the required saturation at a forced collector/base current ratio
of 10 or less. Suppose the ESP32 GPIO high voltage is **at least 3.0 V
under this load**, and base-emitter voltage is 0.8 V. These are design
assumptions, not guaranteed board measurements:

```text
Current through R1 ≈ (3.0 V - 0.8 V) / 1,000 Ω = 2.2 mA
Current through R2 ≈ 0.8 V / 100,000 Ω = 0.008 mA
Estimated base current ≈ 2.19 mA
20 mA / 2.19 mA ≈ 9.1 forced ratio
```

Check the selected transistor's saturation specifications, ESP32 output
voltage/current limits, buzzer startup current and resistor tolerances at
worst case before relying on this example. At 3.3 V GPIO and an assumed
near-zero base voltage, R1 limits instantaneous current to approximately
3.3 mA; verify that this is safe for the actual GPIO and board. Check
transistor power `VCE × collector current`, temperature and resistor power
ratings. Ordinary 1/8 W or higher resistors have ample **nominal** power for
this low-current example, subject to the actual circuit and ratings.
For a higher-current buzzer, redesign the driver rather than assuming these
values work. See, for example, the
[onsemi P2N2222A datasheet](https://www.onsemi.com/pdf/datasheet/p2n2222a-d.pdf);
the actual device may have a different pinout or ratings.

| Part | Example selection | Verify |
| --- | --- | --- |
| Q1 | NPN 2N2222-family transistor | Exact E/B/C pinout, voltage/current, saturation and thermal limits. |
| R1 | 1 kΩ | Base drive and GPIO current at worst-case voltages. |
| R2 | 100 kΩ | Reset leakage and Q1 off-state in the actual circuit. |
| D1 | Suitable flyback diode, if applicable | Buzzer construction, manufacturer instructions, polarity and ratings. |
| Buzzer | 5 V active, ≤20 mA **only for the worked example** | Supply voltage, actual steady/start current and internal circuitry. |

## Power supply and capacitor

- Use the voltage specified by the **actual panel**. A 5 V panel normally
  needs its own 5 V power feed; do not route its load current through ESP32
  headers or a thin signal ribbon. Use appropriately sized wire, connectors
  and protection, and account for connector resistance and heating.
- Size the supply using the panel's specified or safely measured maximum
  current, plus the ESP32 board, buzzer and buffer currents, and account for
  startup/transient current and engineering margin. A charger marked
  `5 V / 2 A` is not proof of adequate voltage at the panel.
- For an illustrative calculation only: if verified loads were 1.20 A panel,
  0.30 A board and 0.02 A buzzer, total would be 1.52 A before buffer
  current. Adding 25% gives 1.90 A before further allowance for transient
  demands. **These are not measured Momentra values**; use actual ratings.
- Measure voltage at the panel input **under representative load**, then
  at the supply output. A reading of 4.8 V alone does not establish a fault
  or a healthy supply: compare with the panel's specified operating range.
  A multimeter can miss brief dips; an oscilloscope can reveal transients
  when used safely. A larger supply or capacitor is not proof of a software
  flicker fix.
- A **470 µF / 63 V** electrolytic can be used as local bulk capacitance on
  a 5 V rail if its ripple-current, temperature, physical mounting and other
  ratings suit the design. Its voltage rating is a maximum, not the applied
  voltage; 63 V is higher than needed but not harmful for that reason alone.
  Connect positive to +5 V and negative to ground, close to the panel power
  connector; observe polarity and protect against shorts. Add the smaller
  local decoupling recommended by the relevant IC/panel datasheets. The
  capacitor cannot compensate for inadequate supply, cabling or scan timing.
- Check inrush current and supply stability with the added capacitance.
  Never connect the capacitor across mains; handle disconnected capacitors
  with appropriate care.

## Before the first power-on

1. Identify the exact board, panel, power supply, buffer, buzzer and
   transistor. Compare markings and datasheets to the table and circuit.
2. With power disconnected, check +/− polarity, common ground, continuity,
   lack of shorts, transistor E/B/C, diode orientation and panel input
   connector. Confirm the panel's OE inactive state during reset.
3. Verify that only the permitted board power input is connected and that no
   separate supplies can backfeed. Ensure power wiring, protection and
   insulation are rated for the load.
4. Start with a suitably current-limited supply and low panel brightness;
   verify actual voltage and temperatures, correct scanning, buzzer behavior
   and reset/power-sequence behavior. Remove power immediately if components
   overheat or wiring behaves unexpectedly.
5. Test the final assembly under normal and high-load conditions, Wi-Fi
   traffic, startup and OTA. The project does not claim electrical or
   regulatory certification.
