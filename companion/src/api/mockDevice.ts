import {
  ALARM_COUNT,
  type AlarmRepeat,
  type AlarmSlot,
  type BinaryFlag,
  type ClockStatus,
  type FontId,
  type HourlyPatternId,
  REMINDER_MAX_SECONDS,
  REMINDER_RING_DURATION_MS,
  type SecondsAnimationId,
  STOPWATCH_MAX_MS,
  type TimerAction,
  type TimerState,
  type WifiScanNetwork,
  type WifiScanResponse,
  encodeSsidHex,
  isValidAlarmDuration,
  validateAlarmPayload,
  validateSettingsPayload,
  validateWifiCredentials,
} from '../types/clock';
import { MAGIC_TRACK_COUNT, MAGIC_TRACKS, classifyInterestingTime } from '../types/magicMusic';

const FALLBACK_TIMEZONES = [
  'Africa/Cairo',
  'Africa/Johannesburg',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/New_York',
  'America/Sao_Paulo',
  'America/Toronto',
  'Asia/Bangkok',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Kolkata',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Melbourne',
  'Australia/Sydney',
  'Etc/UTC',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Zurich',
  'Pacific/Auckland',
  'Pacific/Honolulu',
];

const OTA_MAX_BYTES = 0x1e0000; // 1,966,080 bytes from partitions.csv

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

interface InternalTimer {
  state: TimerState;
  valueMs: number;
  markMonoMs: number;
}

interface DemoConfig {
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
  magic_enabled: BinaryFlag;
  magic_pwm: BinaryFlag;
  alarms: AlarmSlot[];
}

export class MockHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'MockHttpError';
    this.status = status;
  }
}

function buildTimezoneList(): string[] {
  const intlSupported =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : [];
  const set = new Set<string>([...FALLBACK_TIMEZONES, ...intlSupported]);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function getLocalParts(timeZone: string, epochMs: number): LocalDateParts | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(new Date(epochMs));
    const lookup: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        lookup[part.type] = Number(part.value);
      }
    }
    return {
      year: lookup.year,
      month: lookup.month,
      day: lookup.day,
      hour: lookup.hour === 24 ? 0 : lookup.hour,
      minute: lookup.minute,
      second: lookup.second,
    };
  } catch {
    return null;
  }
}

export function getTimezoneOffsetSeconds(timeZone: string, epochMs: number): number | null {
  const parts = getLocalParts(timeZone, epochMs);
  if (!parts) return null;
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const truncatedEpochMs = Math.floor(epochMs / 1000) * 1000;
  return Math.round((localAsUtc - truncatedEpochMs) / 1000);
}

function computeNextAlarmSeconds(
  timeZone: string,
  unixSeconds: number,
  alarmHour: number,
  alarmMinute: number,
): number | null {
  const offsetNow = getTimezoneOffsetSeconds(timeZone, unixSeconds * 1000);
  if (offsetNow === null) return null;

  const baseParts = getLocalParts(timeZone, unixSeconds * 1000);
  if (!baseParts) return null;

  for (let dayDelta = 0; dayDelta <= 2; dayDelta += 1) {
    const guessUtc =
      Date.UTC(baseParts.year, baseParts.month - 1, baseParts.day + dayDelta, alarmHour, alarmMinute, 0) -
      offsetNow * 1000;
    const guessOffset = getTimezoneOffsetSeconds(timeZone, guessUtc);
    const refinedUtc =
      guessOffset === null
        ? guessUtc
        : Date.UTC(baseParts.year, baseParts.month - 1, baseParts.day + dayDelta, alarmHour, alarmMinute, 0) -
          guessOffset * 1000;

    const verify = getLocalParts(timeZone, refinedUtc);
    const targetSec = Math.floor(refinedUtc / 1000);
    if (
      verify &&
      verify.hour === alarmHour &&
      verify.minute === alarmMinute &&
      targetSec > unixSeconds
    ) {
      return targetSec - unixSeconds;
    }
  }
  return null;
}

const DEFAULT_SCAN_SSIDS: readonly { ssid: string; rssi: number }[] = [
  { ssid: 'Momentra-Home-2.4G', rssi: -51 },
  { ssid: 'Studio-Mesh', rssi: -63 },
  { ssid: 'Workshop-IoT', rssi: -71 },
  { ssid: 'Guest-Open', rssi: -78 },
  { ssid: 'Cafe-5G-Bridge', rssi: -84 },
];

/**
 * Stateful ESP32 Momentra Clock hardware & HTTP firmware simulator.
 * Enforces the same validation, 400/403/409 semantics, timer state machine,
 * and timezone/alarm rules as the C firmware.
 */
export class MockMomentraDevice {
  private readonly timezones: string[];
  private readonly timezoneSet: Set<string>;

  private firmwareVersion = '1.0.0-sim';
  private bootMonoMs = performance.now();
  private lastSyncMonoMs = performance.now();
  private rebootUntilMonoMs = 0;

  private wifiConnected = true;
  private setupAp = false;
  private localIp: string | null = '192.168.1.50';
  private wifiRssi: number | null = -58;
  private readonly chipId = 'A4CF1298E310';
  private readonly wifiMac = 'A4:CF:12:98:E3:10';
  private readonly displayReady = true;
  private buzzerConfigured = true;
  private timeValid = true;

  private config: DemoConfig = {
    brightness: 72,
    font: 0,
    format_12h: 0,
    hourly_enabled: 1,
    hourly_pattern: 0,
    feedback_enabled: 1,
    colon_blink: 1,
    seconds_animation: 1,
    timezone_primary: 'Asia/Kolkata',
    timezone_secondary: 'America/New_York',
    timezone_secondary_enabled: 0,
    magic_enabled: 1,
    magic_pwm: 0,
    alarms: [
      { enabled: 1, hour: 7, minute: 30, repeat: 1, duration_seconds: 30 },
      { enabled: 0, hour: 9, minute: 0, repeat: 0, duration_seconds: 15 },
      { enabled: 0, hour: 0, minute: 0, repeat: 0, duration_seconds: 10 },
      { enabled: 0, hour: 0, minute: 0, repeat: 0, duration_seconds: 10 },
      { enabled: 0, hour: 0, minute: 0, repeat: 0, duration_seconds: 10 },
    ],
  };

  private epochOffsetMs = 0;
  private ringingMask = 0;
  private ringingEndsAtMonoMs: number[] = [0, 0, 0, 0, 0];
  private lastFiredMinuteKey: string[] = ['', '', '', '', ''];
  private magicPlaying = false;
  private magicTrack = -1;
  private magicEndsAtMonoMs = 0;
  private lastMagicTrack = -1;
  private lastMagicMinuteKey = '';

  private stopwatch: InternalTimer = { state: 0, valueMs: 0, markMonoMs: 0 };
  private reminder: InternalTimer = { state: 0, valueMs: 0, markMonoMs: 0 };

  private scanState: 'idle' | 'running' | 'done' = 'idle';
  private scanCompletesAtMonoMs = 0;
  private scanNetworks: WifiScanNetwork[] = [];

  constructor() {
    this.timezones = buildTimezoneList();
    this.timezoneSet = new Set(this.timezones);
  }

  private ensureOnline(nowMonoMs: number): void {
    if (nowMonoMs < this.rebootUntilMonoMs) {
      throw new MockHttpError(503, 'Device is rebooting');
    }
  }

  private currentStopwatchMs(nowMonoMs: number): number {
    if (this.stopwatch.state !== 1) return this.stopwatch.valueMs;
    const delta = Math.max(0, nowMonoMs - this.stopwatch.markMonoMs);
    return Math.min(STOPWATCH_MAX_MS, this.stopwatch.valueMs + delta);
  }

  private currentReminderMs(nowMonoMs: number): number {
    if (this.reminder.state !== 1) return this.reminder.valueMs;
    const delta = Math.max(0, nowMonoMs - this.reminder.markMonoMs);
    return delta >= this.reminder.valueMs ? 0 : this.reminder.valueMs - delta;
  }

  private pickNextMagicTrack(requested = -1): number {
    if (requested >= 0 && requested < MAGIC_TRACK_COUNT) {
      this.lastMagicTrack = requested;
      return requested;
    }
    let chosen = Math.floor(Math.random() * MAGIC_TRACK_COUNT);
    if (MAGIC_TRACK_COUNT > 1 && chosen === this.lastMagicTrack) {
      chosen = (chosen + 1 + Math.floor(Math.random() * (MAGIC_TRACK_COUNT - 1))) % MAGIC_TRACK_COUNT;
    }
    this.lastMagicTrack = chosen;
    return chosen;
  }

  private startMagicPlayback(nowMonoMs: number, requestedTrack = -1): number {
    const chosen = this.pickNextMagicTrack(requestedTrack);
    this.magicPlaying = true;
    this.magicTrack = chosen;
    this.magicEndsAtMonoMs = nowMonoMs + MAGIC_TRACKS[chosen].durationMs;
    return chosen;
  }

  private tick(nowMonoMs: number, nowEpochMs: number): void {
    // Advance stopwatch auto-pause at 99:59.99
    if (this.stopwatch.state === 1 && this.currentStopwatchMs(nowMonoMs) >= STOPWATCH_MAX_MS) {
      this.stopwatch.valueMs = STOPWATCH_MAX_MS;
      this.stopwatch.state = 2;
    }

    // Advance reminder countdown -> ringing -> auto-stop after 15s
    if (this.reminder.state === 1 && this.currentReminderMs(nowMonoMs) === 0) {
      this.reminder.markMonoMs += this.reminder.valueMs;
      this.reminder.valueMs = 0;
      this.reminder.state = 3;
    }
    if (this.reminder.state === 3 && nowMonoMs - this.reminder.markMonoMs >= REMINDER_RING_DURATION_MS) {
      this.reminder = { state: 0, valueMs: 0, markMonoMs: 0 };
    }

    // Auto-clear expired alarm ringing slots
    for (let i = 0; i < ALARM_COUNT; i += 1) {
      if ((this.ringingMask & (1 << i)) !== 0 && nowMonoMs >= this.ringingEndsAtMonoMs[i]) {
        this.ringingMask &= ~(1 << i);
        this.ringingEndsAtMonoMs[i] = 0;
      }
    }

    // Auto-clear expired magic music playback
    if (this.magicPlaying && nowMonoMs >= this.magicEndsAtMonoMs) {
      this.magicPlaying = false;
      this.magicTrack = -1;
      this.magicEndsAtMonoMs = 0;
    }

    // Check scheduled alarm & interesting-time triggers against primary timezone wall time
    if (this.timeValid) {
      const local = getLocalParts(this.config.timezone_primary, nowEpochMs);
      if (local) {
        const minuteKey = `${local.year}-${local.month}-${local.day}-${local.hour}:${local.minute}`;
        for (let i = 0; i < ALARM_COUNT; i += 1) {
          const alarm = this.config.alarms[i];
          if (
            alarm.enabled === 1 &&
            alarm.hour === local.hour &&
            alarm.minute === local.minute &&
            local.second < 2 &&
            this.lastFiredMinuteKey[i] !== minuteKey
          ) {
            this.lastFiredMinuteKey[i] = minuteKey;
            this.ringingMask |= 1 << i;
            this.ringingEndsAtMonoMs[i] = nowMonoMs + alarm.duration_seconds * 1000;
            if (alarm.repeat === 0) {
              alarm.enabled = 0;
            }
          }
        }

        if (
          this.config.magic_enabled === 1 &&
          this.ringingMask === 0 &&
          local.second < 2 &&
          this.lastMagicMinuteKey !== minuteKey
        ) {
          const effective12h =
            this.config.format_12h === 1 && this.config.timezone_secondary_enabled === 0;
          const match = classifyInterestingTime(local.hour, local.minute, effective12h);
          if (match.matched) {
            this.lastMagicMinuteKey = minuteKey;
            this.startMagicPlayback(nowMonoMs, -1);
          }
        }
      }
    }

    // Advance asynchronous Wi-Fi scan
    if (this.scanState === 'running' && nowMonoMs >= this.scanCompletesAtMonoMs) {
      this.scanState = 'done';
      this.scanNetworks = DEFAULT_SCAN_SSIDS.map((n) => ({
        ssid_hex: encodeSsidHex(n.ssid),
        rssi: n.rssi + Math.round((Math.random() - 0.5) * 4),
      }));
    }
  }

  private simulateReboot(nowMonoMs: number, nextApMode = false): void {
    this.rebootUntilMonoMs = nowMonoMs + 1800;
    this.bootMonoMs = this.rebootUntilMonoMs;
    this.lastSyncMonoMs = this.rebootUntilMonoMs;
    this.ringingMask = 0;
    this.ringingEndsAtMonoMs = [0, 0, 0, 0, 0];
    this.magicPlaying = false;
    this.magicTrack = -1;
    this.magicEndsAtMonoMs = 0;
    this.stopwatch = { state: 0, valueMs: 0, markMonoMs: 0 };
    this.reminder = { state: 0, valueMs: 0, markMonoMs: 0 };
    this.scanState = 'idle';
    this.scanNetworks = [];
    this.setupAp = nextApMode;
    this.wifiConnected = !nextApMode;
    this.localIp = nextApMode ? '192.168.4.1' : '192.168.1.50';
    this.wifiRssi = nextApMode ? null : -58;
  }

  getStatus(): ClockStatus {
    const nowMono = performance.now();
    this.ensureOnline(nowMono);
    const nowEpoch = Date.now() + this.epochOffsetMs;
    this.tick(nowMono, nowEpoch);

    const unixSeconds = Math.floor(nowEpoch / 1000);
    const primaryOffset = this.timeValid
      ? getTimezoneOffsetSeconds(this.config.timezone_primary, nowEpoch)
      : null;
    const secondaryOffset = this.timeValid
      ? getTimezoneOffsetSeconds(this.config.timezone_secondary, nowEpoch)
      : null;

    const alarmNextSeconds = this.config.alarms.map((alarm) => {
      if (!this.timeValid || alarm.enabled === 0) return null;
      return computeNextAlarmSeconds(
        this.config.timezone_primary,
        unixSeconds,
        alarm.hour,
        alarm.minute,
      );
    });

    return {
      firmware_version: this.firmwareVersion,
      uptime_seconds: Math.max(0, Math.floor((nowMono - this.bootMonoMs) / 1000)),
      free_heap_bytes: 112_640 - (this.stopwatch.state === 1 ? 512 : 0),
      min_free_heap_bytes: 96_256,
      wifi_connected: this.wifiConnected,
      setup_ap: this.setupAp,
      wifi_rssi: this.wifiConnected ? this.wifiRssi : null,
      local_ip: this.localIp,
      chip_id: this.chipId,
      wifi_mac: this.wifiMac,
      time_valid: this.timeValid,
      unix_time: this.timeValid ? unixSeconds : null,
      unix_time_ms: this.timeValid ? nowEpoch : null,
      sync_age_seconds: this.timeValid
        ? Math.max(0, Math.floor((nowMono - this.lastSyncMonoMs) / 1000))
        : null,
      display_ready: this.displayReady,
      buzzer_configured: this.buzzerConfigured,
      ringing: this.ringingMask !== 0,
      ringing_mask: this.ringingMask,
      stopwatch_state: this.stopwatch.state,
      stopwatch_ms: Math.round(this.currentStopwatchMs(nowMono)),
      reminder_state: this.reminder.state,
      reminder_ms: Math.ceil(this.currentReminderMs(nowMono)),
      brightness: this.config.brightness,
      font: this.config.font,
      format_12h: this.config.format_12h,
      hourly_enabled: this.config.hourly_enabled,
      hourly_pattern: this.config.hourly_pattern,
      feedback_enabled: this.config.feedback_enabled,
      colon_blink: this.config.colon_blink,
      seconds_animation: this.config.seconds_animation,
      timezone_primary: this.config.timezone_primary,
      timezone_secondary: this.config.timezone_secondary,
      timezone_secondary_enabled: this.config.timezone_secondary_enabled,
      timezone_primary_offset: primaryOffset,
      timezone_secondary_offset: secondaryOffset,
      magic_enabled: this.config.magic_enabled,
      magic_pwm: this.config.magic_pwm,
      magic_playing: this.magicPlaying,
      magic_track: this.magicPlaying ? this.magicTrack : -1,
      alarms: this.config.alarms.map((a) => ({ ...a })),
      alarm_next_seconds: alarmNextSeconds,
    };
  }

  getTimezones(): string[] {
    this.ensureOnline(performance.now());
    return [...this.timezones];
  }

  saveSettings(params: URLSearchParams): void {
    const nowMono = performance.now();
    this.ensureOnline(nowMono);

    const required = ['brightness', 'font', 'format_12h', 'hourly_enabled', 'hourly_pattern'];
    const optional = [
      'feedback_enabled',
      'colon_blink',
      'seconds_animation',
      'timezone_primary',
      'magic_enabled',
      'magic_pwm',
    ];
    const allowed = new Set([...required, ...optional]);

    const seen = new Set<string>();
    for (const key of params.keys()) {
      if (!allowed.has(key) || seen.has(key)) {
        throw new MockHttpError(400, 'invalid settings');
      }
      seen.add(key);
    }
    for (const reqKey of required) {
      if (!seen.has(reqKey)) {
        throw new MockHttpError(400, 'invalid settings');
      }
    }

    const parseStrictInt = (key: string): number => {
      const raw = params.get(key) ?? '';
      if (!/^-?\d+$/.test(raw)) throw new MockHttpError(400, 'invalid settings');
      return Number(raw);
    };

    const brightness = parseStrictInt('brightness');
    const font = parseStrictInt('font') as FontId;
    const format_12h = parseStrictInt('format_12h') as BinaryFlag;
    const hourly_enabled = parseStrictInt('hourly_enabled') as BinaryFlag;
    const hourly_pattern = parseStrictInt('hourly_pattern') as HourlyPatternId;
    const feedback_enabled = params.has('feedback_enabled')
      ? (parseStrictInt('feedback_enabled') as BinaryFlag)
      : this.config.feedback_enabled;
    const colon_blink = params.has('colon_blink')
      ? (parseStrictInt('colon_blink') as BinaryFlag)
      : this.config.colon_blink;
    const seconds_animation = params.has('seconds_animation')
      ? (parseStrictInt('seconds_animation') as SecondsAnimationId)
      : this.config.seconds_animation;
    const timezone_primary = params.get('timezone_primary') ?? this.config.timezone_primary;
    const magic_enabled = params.has('magic_enabled')
      ? (parseStrictInt('magic_enabled') as BinaryFlag)
      : this.config.magic_enabled;
    const magic_pwm = params.has('magic_pwm')
      ? (parseStrictInt('magic_pwm') as BinaryFlag)
      : this.config.magic_pwm;

    const validationError = validateSettingsPayload({
      brightness,
      font,
      format_12h,
      hourly_enabled,
      hourly_pattern,
      feedback_enabled,
      colon_blink,
      seconds_animation,
      timezone_primary,
      magic_enabled,
      magic_pwm,
    });
    if (validationError || !this.timezoneSet.has(timezone_primary)) {
      throw new MockHttpError(400, 'invalid settings');
    }

    this.config = {
      ...this.config,
      brightness,
      font,
      format_12h,
      hourly_enabled,
      hourly_pattern,
      feedback_enabled,
      colon_blink,
      seconds_animation,
      timezone_primary,
      magic_enabled,
      magic_pwm,
    };
  }

  saveSecondaryTimezone(params: URLSearchParams): void {
    this.ensureOnline(performance.now());
    const keys = Array.from(params.keys());
    if (
      keys.length !== 2 ||
      !params.has('timezone_secondary') ||
      !params.has('timezone_secondary_enabled')
    ) {
      throw new MockHttpError(400, 'invalid second timezone');
    }
    const name = params.get('timezone_secondary') ?? '';
    const enabledRaw = params.get('timezone_secondary_enabled') ?? '';
    if (!this.timezoneSet.has(name) || (enabledRaw !== '0' && enabledRaw !== '1')) {
      throw new MockHttpError(400, 'invalid second timezone');
    }
    this.config.timezone_secondary = name;
    this.config.timezone_secondary_enabled = Number(enabledRaw) as BinaryFlag;
  }

  saveAlarm(params: URLSearchParams): void {
    this.ensureOnline(performance.now());
    const required = ['index', 'enabled', 'hour', 'minute', 'repeat', 'duration_seconds'];
    const keys = Array.from(params.keys());
    if (keys.length !== 6 || required.some((k) => !params.has(k))) {
      throw new MockHttpError(400, 'invalid alarm');
    }
    const parseStrictInt = (key: string): number => {
      const raw = params.get(key) ?? '';
      if (!/^\d+$/.test(raw)) throw new MockHttpError(400, 'invalid alarm');
      return Number(raw);
    };
    const index = parseStrictInt('index');
    const enabled = parseStrictInt('enabled') as BinaryFlag;
    const hour = parseStrictInt('hour');
    const minute = parseStrictInt('minute');
    const repeat = parseStrictInt('repeat') as AlarmRepeat;
    const duration_seconds = parseStrictInt('duration_seconds');

    if (
      !isValidAlarmDuration(duration_seconds) ||
      validateAlarmPayload({ index, enabled, hour, minute, repeat, duration_seconds }) !== null
    ) {
      throw new MockHttpError(400, 'invalid alarm');
    }

    this.config.alarms[index] = { enabled, hour, minute, repeat, duration_seconds };
  }

  stopAlarm(): void {
    this.ensureOnline(performance.now());
    this.ringingMask = 0;
    this.ringingEndsAtMonoMs = [0, 0, 0, 0, 0];
    this.magicPlaying = false;
    this.magicTrack = -1;
    this.magicEndsAtMonoMs = 0;
  }

  testMagicSound(params: URLSearchParams): number {
    const nowMono = performance.now();
    this.ensureOnline(nowMono);
    this.tick(nowMono, Date.now() + this.epochOffsetMs);

    if (params.get('stop') === '1') {
      this.magicPlaying = false;
      this.magicTrack = -1;
      this.magicEndsAtMonoMs = 0;
      return -1;
    }

    const rawTrack = params.get('track') ?? '';
    if (!/^-?\d+$/.test(rawTrack)) {
      throw new MockHttpError(400, 'invalid track');
    }
    const track = Number(rawTrack);
    if (track < -1 || track >= MAGIC_TRACK_COUNT) {
      throw new MockHttpError(400, 'invalid track');
    }

    if (params.has('pwm')) {
      const rawPwm = params.get('pwm') ?? '';
      if (rawPwm !== '0' && rawPwm !== '1') {
        throw new MockHttpError(400, 'invalid pwm flag');
      }
    }

    if (!this.buzzerConfigured) {
      throw new MockHttpError(409, 'buzzer not configured');
    }

    return this.startMagicPlayback(nowMono, track);
  }

  controlTimer(params: URLSearchParams): void {
    const nowMono = performance.now();
    this.ensureOnline(nowMono);
    this.tick(nowMono, Date.now() + this.epochOffsetMs);

    const timerName = params.get('timer');
    const action = params.get('action') as TimerAction | null;
    if (
      (timerName !== 'stopwatch' && timerName !== 'reminder') ||
      !action ||
      !['start', 'pause', 'resume', 'stop'].includes(action)
    ) {
      throw new MockHttpError(400, 'invalid timer request');
    }

    const isReminder = timerName === 'reminder';
    const expectedCount = isReminder && action === 'start' ? 3 : 2;
    if (Array.from(params.keys()).length !== expectedCount) {
      throw new MockHttpError(400, 'invalid timer request');
    }

    let seconds = 0;
    if (isReminder && action === 'start') {
      const rawSeconds = params.get('seconds') ?? '';
      if (!/^\d+$/.test(rawSeconds)) {
        throw new MockHttpError(400, 'invalid reminder duration');
      }
      seconds = Number(rawSeconds);
      if (seconds < 1 || seconds > REMINDER_MAX_SECONDS) {
        throw new MockHttpError(400, 'invalid reminder duration');
      }
      if (!this.buzzerConfigured) {
        throw new MockHttpError(409, 'buzzer not configured');
      }
    }

    const timer = isReminder ? this.reminder : this.stopwatch;
    if (action === 'start') {
      if (timer.state !== 0) {
        throw new MockHttpError(409, 'timer state changed; refresh and retry');
      }
      timer.valueMs = isReminder ? seconds * 1000 : 0;
      timer.markMonoMs = nowMono;
      timer.state = 1;
      return;
    }
    if (action === 'pause') {
      if (timer.state !== 1) {
        throw new MockHttpError(409, 'timer state changed; refresh and retry');
      }
      const value = isReminder ? this.currentReminderMs(nowMono) : this.currentStopwatchMs(nowMono);
      if (isReminder && value === 0) {
        throw new MockHttpError(409, 'timer state changed; refresh and retry');
      }
      timer.valueMs = value;
      timer.state = 2;
      return;
    }
    if (action === 'resume') {
      if (timer.state !== 2 || (!isReminder && timer.valueMs >= STOPWATCH_MAX_MS)) {
        throw new MockHttpError(409, 'timer state changed; refresh and retry');
      }
      timer.markMonoMs = nowMono;
      timer.state = 1;
      return;
    }
    if (action === 'stop') {
      if (timer.state === 0) {
        throw new MockHttpError(409, 'timer state changed; refresh and retry');
      }
      if (isReminder) {
        this.reminder = { state: 0, valueMs: 0, markMonoMs: 0 };
      } else {
        this.stopwatch = { state: 0, valueMs: 0, markMonoMs: 0 };
      }
    }
  }

  startWifiScan(): void {
    const nowMono = performance.now();
    this.ensureOnline(nowMono);
    this.tick(nowMono, Date.now() + this.epochOffsetMs);
    if (this.scanState === 'running') {
      throw new MockHttpError(409, 'scan already running');
    }
    this.scanState = 'running';
    this.scanCompletesAtMonoMs = nowMono + 1000;
  }

  getWifiScanStatus(): WifiScanResponse {
    const nowMono = performance.now();
    this.ensureOnline(nowMono);
    this.tick(nowMono, Date.now() + this.epochOffsetMs);
    if (this.scanState === 'running') return { state: 'running' };
    if (this.scanState === 'done') {
      return { state: 'done', networks: this.scanNetworks.map((n) => ({ ...n })) };
    }
    return { state: 'idle' };
  }

  saveWifiCredentials(params: URLSearchParams): void {
    const nowMono = performance.now();
    this.ensureOnline(nowMono);
    const keys = Array.from(params.keys());
    if (keys.length !== 2 || !params.has('ssid') || !params.has('password')) {
      throw new MockHttpError(400, 'invalid Wi-Fi credentials');
    }
    const ssid = params.get('ssid') ?? '';
    const password = params.get('password') ?? '';
    if (validateWifiCredentials(ssid, password) !== null) {
      throw new MockHttpError(400, 'invalid Wi-Fi credentials');
    }
    this.simulateReboot(nowMono, false);
  }

  reboot(): void {
    const nowMono = performance.now();
    this.ensureOnline(nowMono);
    this.simulateReboot(nowMono, this.setupAp);
  }

  uploadOta(byteLength: number): void {
    const nowMono = performance.now();
    this.ensureOnline(nowMono);
    if (!this.wifiConnected || this.setupAp) {
      throw new MockHttpError(403, 'OTA requires station-only mode');
    }
    if (byteLength <= 0 || byteLength > OTA_MAX_BYTES) {
      throw new MockHttpError(400, 'invalid firmware size');
    }
    this.firmwareVersion = '1.0.1-ota-sim';
    this.simulateReboot(nowMono, false);
  }

  /** Demo-only helper to immediately ring a specific alarm slot for UI testing. */
  triggerDemoAlarm(slotIndex = 0): void {
    const nowMono = performance.now();
    const index = Math.max(0, Math.min(ALARM_COUNT - 1, Math.trunc(slotIndex)));
    const duration = this.config.alarms[index].duration_seconds || 30;
    this.ringingMask |= 1 << index;
    this.ringingEndsAtMonoMs[index] = nowMono + duration * 1000;
  }

  /** Demo-only helper to toggle simulated Setup AP vs Station mode (e.g., to test OTA 403 guard). */
  setDemoNetworkMode(setupAp: boolean): void {
    this.setupAp = setupAp;
    this.wifiConnected = !setupAp;
    this.localIp = setupAp ? '192.168.4.1' : '192.168.1.50';
    this.wifiRssi = setupAp ? null : -58;
  }

  /** Demo-only helper to toggle buzzer availability (e.g., to test reminder 409 guard). */
  setDemoBuzzerConfigured(configured: boolean): void {
    this.buzzerConfigured = configured;
  }

  /** Demo-only helper: jump simulated clock to HH:MM:00 in primary timezone and trigger interesting-time music. */
  simulateInterestingTime(hour24: number, minute: number): { matched: boolean; track: number } {
    const realNow = Date.now();
    const parts = getLocalParts(this.config.timezone_primary, realNow);
    const offsetNow = getTimezoneOffsetSeconds(this.config.timezone_primary, realNow) ?? 0;
    const h = ((Math.trunc(hour24) % 24) + 24) % 24;
    const m = ((Math.trunc(minute) % 60) + 60) % 60;

    if (parts) {
      const guessUtc = Date.UTC(parts.year, parts.month - 1, parts.day, h, m, 0) - offsetNow * 1000;
      const offsetGuess = getTimezoneOffsetSeconds(this.config.timezone_primary, guessUtc) ?? offsetNow;
      const targetUtc = Date.UTC(parts.year, parts.month - 1, parts.day, h, m, 0) - offsetGuess * 1000;
      this.epochOffsetMs = targetUtc - realNow;
    }

    this.lastMagicMinuteKey = '';
    const nowMono = performance.now();
    this.tick(nowMono, realNow + this.epochOffsetMs);

    const effective12h = this.config.format_12h === 1 && this.config.timezone_secondary_enabled === 0;
    const match = classifyInterestingTime(h, m, effective12h);
    return {
      matched: match.matched,
      track: this.magicPlaying ? this.magicTrack : -1,
    };
  }
}
