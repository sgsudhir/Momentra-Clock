export type BinaryFlag = 0 | 1;
export type TimerState = 0 | 1 | 2 | 3; // 0=Stopped, 1=Running, 2=Paused, 3=Ringing (reminder only)
export type TimerName = 'stopwatch' | 'reminder';
export type TimerAction = 'start' | 'pause' | 'resume' | 'stop';
export type AlarmRepeat = 0 | 1; // 0=Once, 1=Daily
export type SecondsAnimationId = 0 | 1 | 2 | 3 | 4;
export type HourlyPatternId = 0 | 1 | 2 | 3;
export type FontId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface AlarmSlot {
  enabled: BinaryFlag;
  hour: number;
  minute: number;
  repeat: AlarmRepeat;
  duration_seconds: number;
}

export interface ClockStatus {
  firmware_version: string;
  uptime_seconds: number;
  free_heap_bytes: number;
  min_free_heap_bytes: number;
  wifi_connected: boolean;
  setup_ap: boolean;
  wifi_rssi: number | null;
  local_ip: string | null;
  chip_id: string;
  wifi_mac: string;
  time_valid: boolean;
  unix_time: number | null;
  unix_time_ms: number | null;
  sync_age_seconds: number | null;
  display_ready: boolean;
  buzzer_configured: boolean;
  ringing: boolean;
  ringing_mask: number;
  stopwatch_state: TimerState;
  stopwatch_ms: number;
  reminder_state: TimerState;
  reminder_ms: number;
  brightness: number;
  font: FontId;
  format_12h: BinaryFlag;
  hourly_enabled: BinaryFlag;
  hourly_pattern: HourlyPatternId;
  feedback_enabled: BinaryFlag;
  colon_blink: BinaryFlag;
  seconds_animation: SecondsAnimationId;
  timezone_primary: string;
  timezone_secondary: string;
  timezone_secondary_enabled: BinaryFlag;
  timezone_primary_offset: number | null;
  timezone_secondary_offset: number | null;
  magic_enabled: BinaryFlag;
  magic_pwm: BinaryFlag;
  magic_playing: boolean;
  magic_track: number;
  alarms: AlarmSlot[];
  alarm_next_seconds: (number | null)[];
}

export interface WifiScanNetwork {
  ssid_hex: string;
  rssi: number;
}

export interface DecodedWifiNetwork extends WifiScanNetwork {
  ssid: string;
}

export type WifiScanResponse =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'done'; networks: WifiScanNetwork[] };

export interface ApiOkResponse {
  ok: true;
}

export interface ApiErrorResponse {
  error: string;
}

export interface SettingsPayload {
  brightness: number;
  font: number;
  format_12h: BinaryFlag;
  hourly_enabled: BinaryFlag;
  hourly_pattern: HourlyPatternId;
  feedback_enabled?: BinaryFlag;
  colon_blink?: BinaryFlag;
  seconds_animation?: SecondsAnimationId;
  timezone_primary?: string;
  magic_enabled?: BinaryFlag;
  magic_pwm?: BinaryFlag;
}

export interface SecondaryTimezonePayload {
  timezone_secondary: string;
  timezone_secondary_enabled: BinaryFlag;
}

export interface AlarmUpdatePayload {
  index: number;
  enabled: BinaryFlag;
  hour: number;
  minute: number;
  repeat: AlarmRepeat;
  duration_seconds: number;
}

export type ConnectionMode = 'demo' | 'live';
export type ConnectionStatus = 'demo' | 'connecting' | 'live' | 'disconnected' | 'rebooting';

export interface DeviceProfile {
  id: string;
  name: string;
  baseUrl: string;
  useProxy: boolean;
}

export type ThemeId =
  | 'momentra'
  | 'light'
  | 'dark'
  | 'ocean'
  | 'sunset'
  | 'lavender'
  | 'sand'
  | 'forest'
  | 'midnight';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  isDark: boolean;
}

export interface OtaImageInspection {
  valid: boolean;
  sizeBytes: number;
  maxBytes: number;
  hasImageMagic: boolean;
  hasAppDescMagic: boolean;
  looksLikeBootloaderOrMerged: boolean;
  version: string | null;
  projectName: string | null;
  errors: string[];
  warnings: string[];
}

export const OTA_MAX_BYTES = 0x1e0000; // 1,966,080 bytes from partitions.csv

export interface FontStyleMeta {
  id: FontId;
  label: string;
  glyphWidth: number;
  glyphHeight: number;
  colonSize: 1 | 2;
  isTall: boolean;
  supportsAnimation: boolean;
}

export const ALARM_COUNT = 5;
export const FONT_COUNT = 15;
export const SOUND_PATTERN_COUNT = 4;
export const SECONDS_ANIMATION_COUNT = 5;
export const STOPWATCH_MAX_MS = 5_999_990; // 99:59.99
export const REMINDER_MAX_SECONDS = 86_400; // 24 hours
export const REMINDER_RING_DURATION_MS = 15_000;
export const POLL_INTERVAL_MS = 5_000;
export const REANCHOR_INTERVAL_MS = 15_000;

export const TALL_FONT_IDS: readonly FontId[] = [5, 6, 8, 11, 13];

export const FONT_STYLES: readonly FontStyleMeta[] = [
  { id: 0, label: 'Style 1', glyphWidth: 6, glyphHeight: 10, colonSize: 2, isTall: false, supportsAnimation: true },
  { id: 1, label: 'Style 2', glyphWidth: 6, glyphHeight: 10, colonSize: 2, isTall: false, supportsAnimation: true },
  { id: 5, label: 'Large outdoor (14 px)', glyphWidth: 6, glyphHeight: 14, colonSize: 2, isTall: true, supportsAnimation: false },
  { id: 6, label: 'Medium (12 px)', glyphWidth: 5, glyphHeight: 12, colonSize: 2, isTall: true, supportsAnimation: false },
  { id: 7, label: 'Small indoor (5×7)', glyphWidth: 5, glyphHeight: 7, colonSize: 1, isTall: false, supportsAnimation: true },
  { id: 8, label: 'Tall slim', glyphWidth: 5, glyphHeight: 14, colonSize: 2, isTall: true, supportsAnimation: false },
  { id: 9, label: 'Extra small', glyphWidth: 3, glyphHeight: 5, colonSize: 1, isTall: false, supportsAnimation: true },
  { id: 10, label: 'Wide', glyphWidth: 6, glyphHeight: 7, colonSize: 2, isTall: false, supportsAnimation: true },
  { id: 11, label: 'Bold tall', glyphWidth: 6, glyphHeight: 14, colonSize: 2, isTall: true, supportsAnimation: false },
  { id: 12, label: 'Bold compact', glyphWidth: 5, glyphHeight: 7, colonSize: 2, isTall: false, supportsAnimation: true },
  { id: 13, label: 'Digital segments', glyphWidth: 6, glyphHeight: 11, colonSize: 2, isTall: true, supportsAnimation: false },
  { id: 14, label: 'Rounded compact', glyphWidth: 5, glyphHeight: 7, colonSize: 1, isTall: false, supportsAnimation: true },
];

export const SECONDS_ANIMATIONS: readonly { id: SecondsAnimationId; label: string; description: string }[] = [
  { id: 0, label: 'Off', description: 'No bottom-row seconds indicator' },
  { id: 1, label: 'Moving dot', description: 'Single pixel sweeping x = 0..31 at y = 15' },
  { id: 2, label: 'Progress bar', description: 'Filling horizontal bar on bottom row y = 15' },
  { id: 3, label: 'Bouncing ball', description: '2×2 bouncing pixel arc across the bottom edge' },
  { id: 4, label: 'Jumping ball', description: '2×2 pixel hopping once per second along x' },
];

export const HOURLY_PATTERNS: readonly { id: HourlyPatternId; label: string; description: string; mask: number }[] = [
  { id: 0, label: 'Pattern 1', description: '600 ms steady chime', mask: 0x003f },
  { id: 1, label: 'Pattern 2', description: '300 ms · gap · 300 ms double chime', mask: 0x00e7 },
  { id: 2, label: 'Pattern 3', description: 'Three crisp 100 ms pulses', mask: 0x0049 },
  { id: 3, label: 'Pattern 4', description: 'Two short 100 ms taps + 500 ms tail', mask: 0x01f5 },
];

export const ALARM_DURATION_OPTIONS: readonly number[] = [
  5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 180, 240, 300,
];

export const TIMER_STATE_LABELS: readonly string[] = [
  'Stopped',
  'Running',
  'Paused',
  'Ringing',
];

export const THEMES: readonly ThemeMeta[] = [
  { id: 'momentra', label: 'Momentra Dark', isDark: true },
  { id: 'light', label: 'Light', isDark: false },
  { id: 'dark', label: 'Dark', isDark: true },
  { id: 'ocean', label: 'Ocean', isDark: false },
  { id: 'sunset', label: 'Sunset', isDark: false },
  { id: 'lavender', label: 'Lavender', isDark: false },
  { id: 'sand', label: 'Sand', isDark: false },
  { id: 'forest', label: 'Forest', isDark: false },
  { id: 'midnight', label: 'Midnight', isDark: true },
];

export const DEFAULT_DEVICE_PROFILES: readonly DeviceProfile[] = [
  { id: 'mdns', name: 'Momentra mDNS', baseUrl: 'http://momentra.local', useProxy: true },
  { id: 'setup-ap', name: 'Setup AP (192.168.4.1)', baseUrl: 'http://192.168.4.1', useProxy: true },
  { id: 'lan-default', name: 'LAN Device (192.168.1.50)', baseUrl: 'http://192.168.1.50', useProxy: true },
];

/** Map legacy font IDs 2..4 to Style 1 (0), matching dashboard editing behavior. */
export function normalizeFontId(font: number): FontId {
  if (!Number.isInteger(font) || font < 0 || font >= FONT_COUNT) return 0;
  if (font >= 2 && font <= 4) return 0;
  return font as FontId;
}

export function fontSupportsAnimation(font: number): boolean {
  const normalized = normalizeFontId(font);
  return !TALL_FONT_IDS.includes(normalized);
}

export function getFontMeta(font: number): FontStyleMeta {
  const normalized = normalizeFontId(font);
  return FONT_STYLES.find((f) => f.id === normalized) ?? FONT_STYLES[0];
}

export function isValidAlarmDuration(seconds: number): boolean {
  if (!Number.isInteger(seconds)) return false;
  return (
    seconds === 5 ||
    seconds === 15 ||
    seconds === 45 ||
    seconds === 240 ||
    seconds === 300 ||
    (seconds >= 10 && seconds <= 180 && seconds % 10 === 0)
  );
}

export function validateSettingsPayload(payload: SettingsPayload): string | null {
  if (!Number.isInteger(payload.brightness) || payload.brightness < 0 || payload.brightness > 100) {
    return 'Brightness must be an integer between 0 and 100.';
  }
  if (!Number.isInteger(payload.font) || payload.font < 0 || payload.font >= FONT_COUNT) {
    return 'Font ID must be between 0 and 14.';
  }
  if (payload.format_12h !== 0 && payload.format_12h !== 1) {
    return 'Time format must be 0 (24h) or 1 (12h).';
  }
  if (payload.hourly_enabled !== 0 && payload.hourly_enabled !== 1) {
    return 'Hourly chime enabled must be 0 or 1.';
  }
  if (!Number.isInteger(payload.hourly_pattern) || payload.hourly_pattern < 0 || payload.hourly_pattern >= SOUND_PATTERN_COUNT) {
    return 'Hourly chime pattern must be between 0 and 3.';
  }
  if (payload.feedback_enabled !== undefined && payload.feedback_enabled !== 0 && payload.feedback_enabled !== 1) {
    return 'Button feedback must be 0 or 1.';
  }
  if (payload.colon_blink !== undefined && payload.colon_blink !== 0 && payload.colon_blink !== 1) {
    return 'Colon blink must be 0 or 1.';
  }
  if (
    payload.seconds_animation !== undefined &&
    (!Number.isInteger(payload.seconds_animation) || payload.seconds_animation < 0 || payload.seconds_animation >= SECONDS_ANIMATION_COUNT)
  ) {
    return 'Seconds animation must be between 0 and 4.';
  }
  if (payload.timezone_primary !== undefined && (!payload.timezone_primary || payload.timezone_primary.length > 63)) {
    return 'Primary timezone must be a non-empty IANA timezone name.';
  }
  if (payload.magic_enabled !== undefined && payload.magic_enabled !== 0 && payload.magic_enabled !== 1) {
    return 'Interesting-time music enabled must be 0 or 1.';
  }
  if (payload.magic_pwm !== undefined && payload.magic_pwm !== 0 && payload.magic_pwm !== 1) {
    return 'Passive buzzer PWM mode must be 0 or 1.';
  }
  return null;
}

export function validateAlarmPayload(payload: AlarmUpdatePayload): string | null {
  if (!Number.isInteger(payload.index) || payload.index < 0 || payload.index >= ALARM_COUNT) {
    return 'Alarm slot index must be between 0 and 4.';
  }
  if (payload.enabled !== 0 && payload.enabled !== 1) {
    return 'Alarm enabled flag must be 0 or 1.';
  }
  if (!Number.isInteger(payload.hour) || payload.hour < 0 || payload.hour > 23) {
    return 'Alarm hour must be between 0 and 23.';
  }
  if (!Number.isInteger(payload.minute) || payload.minute < 0 || payload.minute > 59) {
    return 'Alarm minute must be between 0 and 59.';
  }
  if (payload.repeat !== 0 && payload.repeat !== 1) {
    return 'Alarm repeat must be 0 (Once) or 1 (Daily).';
  }
  if (!isValidAlarmDuration(payload.duration_seconds)) {
    return 'Alarm duration must be 5, 15, 45, 240, 300, or a multiple of 10 from 10 to 180.';
  }
  return null;
}

export function validateReminderSeconds(seconds: number): string | null {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > REMINDER_MAX_SECONDS) {
    return 'Choose a reminder duration from 1 second to 24 hours (86400 s).';
  }
  return null;
}

export function validateWifiCredentials(ssid: string, password: string): string | null {
  const encoder = new TextEncoder();
  const ssidBytes = encoder.encode(ssid).length;
  const passBytes = encoder.encode(password).length;
  if (ssidBytes < 1 || ssidBytes > 32) {
    return 'SSID must be 1 to 32 UTF-8 bytes.';
  }
  if (passBytes !== 0 && (passBytes < 8 || passBytes > 63)) {
    return 'Password must be empty (open network) or 8 to 63 UTF-8 bytes.';
  }
  return null;
}

export function decodeSsidHex(hex: string): string | null {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function encodeSsidHex(ssid: string): string {
  const bytes = new TextEncoder().encode(ssid);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const days = Math.floor(whole / 86_400);
  const hours = Math.floor((whole % 86_400) / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${secs}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export function formatStopwatchMs(ms: number): string {
  const clamped = Math.max(0, Math.min(STOPWATCH_MAX_MS, ms));
  const centis = Math.floor(clamped / 10);
  const mins = String(Math.floor(centis / 6000)).padStart(2, '0');
  const secs = String(Math.floor(centis / 100) % 60).padStart(2, '0');
  const tenths = String(Math.floor((centis % 100) / 10));
  return `${mins}:${secs}:${tenths}`;
}

export function formatReminderMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mins = String(Math.floor(totalSec / 60) % 60).padStart(2, '0');
  const secs = String(totalSec % 60).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

export function normalizeDeviceUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return 'http://momentra.local';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}
