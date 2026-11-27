/**
 * Pixel-accurate 32x16 P10 LED matrix renderer ported from Momentra-Clock/main/clock_render.c.
 * Produces a 16-row by 32-column boolean pixel matrix matching firmware behavior across all
 * 15 font IDs (0..14), seconds animations (0..4), dual-timezone 2-line mode, and ST/RE timers.
 */

import {
  type ClockStatus,
  FONT_COUNT,
  SECONDS_ANIMATION_COUNT,
  fontSupportsAnimation,
  normalizeFontId,
} from '../types/clock';
import { type LiveClockSnapshot } from '../state/ClockContext';

export const MATRIX_WIDTH = 32;
export const MATRIX_HEIGHT = 16;

export type MatrixFramebuffer = Uint8Array; // length 32 * 16 = 512 (0 or 1)

const DIGITS_3X5: readonly (readonly string[])[] = [
  [
    '111101101101111',
    '010110010010111',
    '111001111100111',
    '111001111001111',
    '101101111001001',
    '111100111001111',
    '111100111101111',
    '111001001001001',
    '111101111101111',
    '111101111001111',
  ],
  [
    '111101101101111',
    '010010010010010',
    '110001010100111',
    '110001011001110',
    '101101111001001',
    '111100110001110',
    '011100110101010',
    '111001010010010',
    '010101010101010',
    '010101011001110',
  ],
];

const LARGE_DIGITS: readonly (readonly number[])[] = [
  [0x1e, 0x33, 0x37, 0x3b, 0x33, 0x33, 0x1e],
  [0x0c, 0x1c, 0x0c, 0x0c, 0x0c, 0x0c, 0x3f],
  [0x1e, 0x33, 0x03, 0x06, 0x0c, 0x18, 0x3f],
  [0x1e, 0x33, 0x03, 0x0e, 0x03, 0x33, 0x1e],
  [0x06, 0x0e, 0x16, 0x26, 0x3f, 0x06, 0x06],
  [0x3f, 0x30, 0x3e, 0x03, 0x03, 0x33, 0x1e],
  [0x0e, 0x18, 0x30, 0x3e, 0x33, 0x33, 0x1e],
  [0x3f, 0x03, 0x06, 0x0c, 0x0c, 0x18, 0x18],
  [0x1e, 0x33, 0x33, 0x1e, 0x33, 0x33, 0x1e],
  [0x1e, 0x33, 0x33, 0x1f, 0x03, 0x06, 0x1c],
];

const MEDIUM_DIGITS: readonly (readonly number[])[] = [
  [0x0e, 0x11, 0x13, 0x19, 0x11, 0x0e],
  [0x04, 0x0c, 0x04, 0x04, 0x04, 0x0e],
  [0x0e, 0x11, 0x02, 0x04, 0x08, 0x1f],
  [0x1e, 0x01, 0x06, 0x01, 0x11, 0x0e],
  [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02],
  [0x1f, 0x10, 0x1e, 0x01, 0x11, 0x0e],
  [0x06, 0x08, 0x1e, 0x11, 0x11, 0x0e],
  [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08],
  [0x0e, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  [0x0e, 0x11, 0x11, 0x0f, 0x02, 0x0c],
];

const SMALL_DIGITS: readonly (readonly number[])[] = [
  [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  [0x04, 0x0c, 0x14, 0x04, 0x04, 0x04, 0x1f],
  [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  [0x1e, 0x01, 0x01, 0x0e, 0x01, 0x01, 0x1e],
  [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  [0x1f, 0x10, 0x10, 0x1e, 0x01, 0x01, 0x1e],
  [0x0e, 0x10, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x01, 0x0e],
];

const COMPACT_DIGITS: readonly (readonly number[])[] = [
  [0x6, 0x9, 0x9, 0x9, 0x9, 0x9, 0x6],
  [0x2, 0x6, 0x2, 0x2, 0x2, 0x2, 0x7],
  [0x6, 0x9, 0x1, 0x2, 0x4, 0x8, 0xf],
  [0xe, 0x1, 0x1, 0x6, 0x1, 0x1, 0xe],
  [0x2, 0x6, 0xa, 0xa, 0xf, 0x2, 0x2],
  [0xf, 0x8, 0x8, 0xe, 0x1, 0x1, 0xe],
  [0x6, 0x8, 0x8, 0xe, 0x9, 0x9, 0x6],
  [0xf, 0x1, 0x2, 0x2, 0x4, 0x4, 0x4],
  [0x6, 0x9, 0x9, 0x6, 0x9, 0x9, 0x6],
  [0x6, 0x9, 0x9, 0x7, 0x1, 0x1, 0x6],
];

const ROUNDED_DIGITS: readonly (readonly number[])[] = [
  [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  [0x1e, 0x01, 0x01, 0x0e, 0x01, 0x01, 0x1e],
  [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  [0x1f, 0x10, 0x10, 0x1e, 0x01, 0x01, 0x1e],
  [0x0e, 0x10, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x01, 0x0e],
];

const SEGMENT_MASKS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];

const SMALL_CHARS: Record<string, readonly number[]> = {
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  N: [0x11, 0x19, 0x19, 0x15, 0x13, 0x13, 0x11],
  C: [0x0f, 0x10, 0x10, 0x10, 0x10, 0x10, 0x0f],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
};

function createFrame(): MatrixFramebuffer {
  return new Uint8Array(MATRIX_WIDTH * MATRIX_HEIGHT);
}

function setPixel(frame: MatrixFramebuffer, x: number, y: number, on = 1): void {
  if (x >= 0 && x < MATRIX_WIDTH && y >= 0 && y < MATRIX_HEIGHT) {
    frame[y * MATRIX_WIDTH + x] = on;
  }
}

function getPixel(frame: MatrixFramebuffer, x: number, y: number): number {
  if (x < 0 || x >= MATRIX_WIDTH || y < 0 || y >= MATRIX_HEIGHT) return 0;
  return frame[y * MATRIX_WIDTH + x];
}

function drawGlyph3x5(
  frame: MatrixFramebuffer,
  shape: string,
  x: number,
  y: number,
  scale: number,
): void {
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (shape[row * 3 + col] !== '1') continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          setPixel(frame, x + col * scale + dx, y + row * scale + dy);
        }
      }
    }
  }
}

function drawSizedDigit(
  frame: MatrixFramebuffer,
  digit: number,
  x: number,
  font: number,
): void {
  const rows =
    font === 5 || font === 10 || font === 11
      ? LARGE_DIGITS[digit]
      : font === 6
        ? MEDIUM_DIGITS[digit]
        : font === 14
          ? ROUNDED_DIGITS[digit]
          : SMALL_DIGITS[digit];
  const width = font === 5 || font === 10 || font === 11 ? 6 : 5;
  const height = font === 6 ? 6 : 7;
  const scaleY = font === 5 || font === 6 || font === 8 || font === 11 ? 2 : 1;
  const top = font === 5 || font === 8 || font === 11 ? 1 : font === 6 ? 2 : 4;

  for (let y = 0; y < height; y += 1) {
    let bits = rows[y];
    if (font === 11 || font === 12) bits |= bits >> 1;
    for (let col = 0; col < width; col += 1) {
      if (bits & (1 << (width - 1 - col))) {
        for (let dy = 0; dy < scaleY; dy += 1) {
          setPixel(frame, x + col, top + y * scaleY + dy);
        }
      }
    }
  }
}

function drawSegmentDigit(frame: MatrixFramebuffer, digit: number, x: number): void {
  const bits = SEGMENT_MASKS[digit];
  for (let col = 1; col <= 4; col += 1) {
    if (bits & 0x01) setPixel(frame, x + col, 2);
    if (bits & 0x40) setPixel(frame, x + col, 7);
    if (bits & 0x08) setPixel(frame, x + col, 12);
  }
  for (let y = 3; y <= 6; y += 1) {
    if (bits & 0x20) setPixel(frame, x, y);
    if (bits & 0x02) setPixel(frame, x + 5, y);
    if (bits & 0x10) setPixel(frame, x, y + 5);
    if (bits & 0x04) setPixel(frame, x + 5, y + 5);
  }
}

function squareSeparator(font: number): boolean {
  return font !== 7 && font !== 9 && font !== 14;
}

function centerClock(frame: MatrixFramebuffer): number {
  let left = MATRIX_WIDTH;
  let right = 0;
  for (let y = 0; y < MATRIX_HEIGHT; y += 1) {
    for (let x = 0; x < MATRIX_WIDTH; x += 1) {
      if (getPixel(frame, x, y)) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (left === MATRIX_WIDTH) return 0;
  const shift = Math.floor((MATRIX_WIDTH - (right - left + 1)) / 2) - left;
  if (shift !== 0) {
    const copy = new Uint8Array(frame);
    frame.fill(0);
    for (let y = 0; y < MATRIX_HEIGHT; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (copy[y * MATRIX_WIDTH + x]) {
          setPixel(frame, x + shift, y);
        }
      }
    }
  }
  return shift;
}

function drawCenteredText(frame: MatrixFramebuffer, text: string, y: number): void {
  const count = text.length;
  if (!count || count > 5) return;
  const startX = Math.floor((MATRIX_WIDTH - (count * 6 - 1)) / 2);
  for (let i = 0; i < count; i += 1) {
    const rows = SMALL_CHARS[text[i]];
    if (!rows) continue;
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if (rows[row] & (1 << (4 - col))) {
          setPixel(frame, startX + i * 6 + col, y + row);
        }
      }
    }
  }
}

function renderSyncFallback(frame: MatrixFramebuffer): void {
  frame.fill(0);
  drawCenteredText(frame, 'SYNC', 0);
  for (let x = 4; x <= 28; x += 6) {
    setPixel(frame, x, 13);
    setPixel(frame, x + 1, 13);
    setPixel(frame, x, 14);
    setPixel(frame, x + 1, 14);
  }
}

function renderSingleClock(
  frame: MatrixFramebuffer,
  hourInput: number,
  minute: number,
  format12h: boolean,
  fontInput: number,
): number {
  frame.fill(0);
  if (hourInput > 23 || minute > 59 || fontInput < 0 || fontInput >= FONT_COUNT) {
    renderSyncFallback(frame);
    return -1;
  }
  const font = normalizeFontId(fontInput);
  let hour = hourInput;
  if (format12h) {
    hour %= 12;
    if (hour === 0) hour = 12;
  }
  const values = [Math.floor(hour / 10), hour % 10, Math.floor(minute / 10), minute % 10];
  const positions = [0, 7, 17, 24];

  for (let i = 0; i < 4; i += 1) {
    if (font < 2) {
      drawGlyph3x5(frame, DIGITS_3X5[font][values[i]], positions[i], 2, 2);
    } else if (font === 9) {
      drawGlyph3x5(frame, DIGITS_3X5[0][values[i]], positions[i], 5, 1);
    } else if (font === 13) {
      drawSegmentDigit(frame, values[i], positions[i]);
    } else {
      drawSizedDigit(frame, values[i], positions[i], font);
    }
  }

  for (let y = 5; y <= 9; y += 4) {
    setPixel(frame, 14, y);
    if (squareSeparator(font)) {
      setPixel(frame, 15, y);
      setPixel(frame, 14, y + 1);
      setPixel(frame, 15, y + 1);
    }
  }

  return 14 + centerClock(frame);
}

function renderSecondsOverlay(
  frame: MatrixFramebuffer,
  second: number,
  millisecond: number,
  blink: boolean,
  animation: number,
  fontInput: number,
  separatorX: number,
): void {
  if (
    second < 0 ||
    second >= 60 ||
    millisecond < 0 ||
    millisecond >= 1000 ||
    separatorX < 0 ||
    separatorX > 30 ||
    animation < 0 ||
    animation >= SECONDS_ANIMATION_COUNT
  ) {
    return;
  }

  const font = normalizeFontId(fontInput);
  if (blink && second % 2 === 1) {
    const size = squareSeparator(font) ? 2 : 1;
    for (let y = 5; y <= 9; y += 4) {
      for (let dy = 0; dy < size; dy += 1) {
        for (let dx = 0; dx < size; dx += 1) {
          setPixel(frame, separatorX + dx, y + dy, 0);
        }
      }
    }
  }

  if (!fontSupportsAnimation(font)) return;

  if (animation === 1) {
    // Moving dot
    setPixel(frame, Math.floor((second * 31) / 59), 15);
  } else if (animation === 2) {
    // Progress bar
    const width = Math.floor(((second + 1) * 32 + 59) / 60);
    for (let x = 0; x < width; x += 1) setPixel(frame, x, 15);
  } else if (animation === 3 || animation === 4) {
    const step = second * 10 + Math.floor(millisecond / 100);
    let x = animation === 3 ? step % 60 : Math.floor((second * 30) / 59);
    if (x > 30) x = 60 - x;
    const arc = [14, 13, 12, 13, 14];
    const y = arc[animation === 3 ? step % 5 : Math.floor(millisecond / 200)];
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        setPixel(frame, x + dx, y + dy);
      }
    }
  }
}

function renderDualClock(
  frame: MatrixFramebuffer,
  firstHour: number,
  firstMinute: number,
  secondHour: number,
  secondMinute: number,
  blink: boolean,
  second: number,
): void {
  frame.fill(0);
  const hours = [firstHour, secondHour];
  const minutes = [firstMinute, secondMinute];
  const line = createFrame();

  for (let row = 0; row < 2; row += 1) {
    const sepX = renderSingleClock(line, hours[row], minutes[row], false, 7);
    renderSecondsOverlay(line, second, 0, blink, 0, 7, sepX);
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < MATRIX_WIDTH; x += 1) {
        setPixel(frame, x, row * 8 + y, getPixel(line, x, y + 4));
      }
    }
  }
}

function renderTimerFrame(
  frame: MatrixFramebuffer,
  reminder: boolean,
  first: number,
  second: number,
  third: number,
): void {
  frame.fill(0);
  const clampedFirst = Math.min(99, Math.max(0, first));
  drawCenteredText(frame, reminder ? 'RE' : 'ST', 0);

  const values = [
    Math.floor(clampedFirst / 10),
    clampedFirst % 10,
    Math.floor(second / 10),
    second % 10,
    Math.floor(third / 10),
    third % 10,
  ];
  const reminderX = [0, 5, 11, 16, 22, 27];
  const stopwatchX = [3, 8, 14, 19, 25];
  const xCoords = reminder ? reminderX : stopwatchX;
  const digitCount = reminder ? 6 : 5;

  for (let i = 0; i < digitCount; i += 1) {
    const glyphRows = COMPACT_DIGITS[values[i]];
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        if (glyphRows[row] & (1 << (3 - col))) {
          setPixel(frame, xCoords[i] + col, 9 + row);
        }
      }
    }
  }

  for (let y = 11; y <= 13; y += 2) {
    setPixel(frame, reminder ? 10 : 13, y);
    setPixel(frame, reminder ? 21 : 24, y);
  }
}

export interface MatrixRenderOverrides {
  brightness?: number;
  font?: number;
  format_12h?: 0 | 1;
  colon_blink?: 0 | 1;
  seconds_animation?: 0 | 1 | 2 | 3 | 4;
  timezone_secondary_enabled?: 0 | 1;
}

export interface MatrixRenderResult {
  frame: MatrixFramebuffer;
  modeLabel: string;
  brightness: number;
}

export function renderMomentraMatrix(
  status: ClockStatus | null,
  live: LiveClockSnapshot,
  overrides?: MatrixRenderOverrides,
): MatrixRenderResult {
  const frame = createFrame();
  if (!status) {
    renderSyncFallback(frame);
    return { frame, modeLabel: 'Connecting · SYNC', brightness: 50 };
  }

  const brightness = overrides?.brightness ?? status.brightness;

  // 1. Running stopwatch takes top panel priority
  if (status.stopwatch_state === 1) {
    const totalTenths = Math.floor(live.stopwatchMs / 100);
    const mins = Math.min(99, Math.floor(totalTenths / 600));
    const secs = Math.floor((totalTenths / 10) % 60);
    const tenthsTimes10 = (totalTenths % 10) * 10;
    renderTimerFrame(frame, false, mins, secs, tenthsTimes10);
    return { frame, modeLabel: 'Stopwatch Priority', brightness };
  }

  // 2. Running or ringing reminder takes next panel priority
  if (status.reminder_state === 1 || status.reminder_state === 3) {
    const totalSec = Math.max(0, Math.ceil(live.reminderMs / 1000));
    const hrs = Math.min(99, Math.floor(totalSec / 3600));
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    renderTimerFrame(frame, true, hrs, mins, secs);
    return {
      frame,
      modeLabel: status.reminder_state === 3 ? 'Reminder Ringing' : 'Reminder Priority',
      brightness,
    };
  }

  // 3. Unsynced NTP / missing primary offset
  if (!status.time_valid || !live.primaryWallDate) {
    renderSyncFallback(frame);
    return { frame, modeLabel: 'Waiting for NTP · SYNC', brightness };
  }

  const primaryHour = live.primaryWallDate.getUTCHours();
  const primaryMinute = live.primaryWallDate.getUTCMinutes();
  const primarySecond = live.primaryWallDate.getUTCSeconds();
  const colonBlink = (overrides?.colon_blink ?? status.colon_blink) === 1;
  const dualEnabled =
    (overrides?.timezone_secondary_enabled ?? status.timezone_secondary_enabled) === 1;

  // 4. Dual-timezone 2-line display
  if (dualEnabled && live.secondaryWallDate) {
    renderDualClock(
      frame,
      primaryHour,
      primaryMinute,
      live.secondaryWallDate.getUTCHours(),
      live.secondaryWallDate.getUTCMinutes(),
      colonBlink,
      primarySecond,
    );
    return { frame, modeLabel: 'Dual Timezone · 5×7', brightness };
  }

  // 5. Standard single-line clock
  const font = overrides?.font ?? status.font;
  const format12h = (overrides?.format_12h ?? status.format_12h) === 1;
  const animation = overrides?.seconds_animation ?? status.seconds_animation;

  const sepX = renderSingleClock(frame, primaryHour, primaryMinute, format12h, font);
  renderSecondsOverlay(
    frame,
    primarySecond,
    live.subSecondMs,
    colonBlink,
    animation,
    font,
    sepX,
  );

  return {
    frame,
    modeLabel: format12h ? '12h Clock' : '24h Clock',
    brightness,
  };
}
