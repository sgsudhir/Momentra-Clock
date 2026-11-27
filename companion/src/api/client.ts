import {
  type AlarmUpdatePayload,
  type ApiErrorResponse,
  type BinaryFlag,
  type ClockStatus,
  type ConnectionMode,
  type DecodedWifiNetwork,
  OTA_MAX_BYTES,
  type OtaImageInspection,
  type SecondaryTimezonePayload,
  type SettingsPayload,
  type TimerAction,
  type TimerName,
  type WifiScanResponse,
  decodeSsidHex,
  normalizeDeviceUrl,
  validateAlarmPayload,
  validateReminderSeconds,
  validateSettingsPayload,
  validateWifiCredentials,
} from '../types/clock';
import { MockHttpError, MockMomentraDevice } from './mockDevice';
import { MAGIC_TRACK_COUNT } from '../types/magicMusic';

export class MomentraApiError extends Error {
  readonly status: number;
  readonly isNetworkError: boolean;

  constructor(status: number, message: string, isNetworkError = false) {
    super(message);
    this.name = 'MomentraApiError';
    this.status = status;
    this.isNetworkError = isNetworkError;
  }

  get isBadRequest(): boolean {
    return this.status === 400;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}

export interface MomentraClientConfig {
  mode: ConnectionMode;
  baseUrl: string;
  useProxy: boolean;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const OTA_TIMEOUT_MS = 120_000;

interface Transport {
  getJson<T>(path: string, timeoutMs?: number): Promise<T>;
  postForm(path: string, params: URLSearchParams, timeoutMs?: number): Promise<void>;
  postBinary(
    path: string,
    data: Blob | ArrayBuffer,
    timeoutMs?: number,
    onProgress?: (percent: number) => void,
  ): Promise<void>;
}

function readAsciiCString(bytes: Uint8Array, offset: number, maxLen: number): string | null {
  if (offset + maxLen > bytes.length) return null;
  let end = offset;
  while (end < offset + maxLen && bytes[end] !== 0) {
    const ch = bytes[end];
    if (ch < 0x20 || ch > 0x7e) return null;
    end += 1;
  }
  if (end === offset) return null;
  let out = '';
  for (let i = offset; i < end; i += 1) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/**
 * Inspect a firmware `.bin` before OTA upload:
 * - Size must be `1..OTA_MAX_BYTES` (0x1e0000 / 1.875 MiB).
 * - Byte 0 must be `0xE9` (`ESP_IMAGE_HEADER_MAGIC`).
 * - Offset `0x20..0x23` must contain `esp_app_desc_t` magic `0x32 0x54 0xCD 0xAB`
 *   (little-endian `0xABCD5432`). Missing app desc indicates a bootloader or merged flash image.
 */
export async function inspectOtaBinary(data: Blob | ArrayBuffer): Promise<OtaImageInspection> {
  const buffer = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const sizeBytes = bytes.byteLength;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (sizeBytes <= 0) {
    errors.push('Firmware file is empty.');
  } else if (sizeBytes > OTA_MAX_BYTES) {
    errors.push(`Firmware size (${sizeBytes} bytes) exceeds 1.875 MiB (${OTA_MAX_BYTES} bytes) OTA slot.`);
  }

  const hasImageMagic = sizeBytes >= 1 && bytes[0] === 0xe9;
  if (sizeBytes > 0 && !hasImageMagic) {
    errors.push('Missing ESP32 image magic byte (0xE9) at offset 0.');
  }

  const hasAppDescMagic =
    sizeBytes >= 0x24 &&
    bytes[0x20] === 0x32 &&
    bytes[0x21] === 0x54 &&
    bytes[0x22] === 0xcd &&
    bytes[0x23] === 0xab;

  const hasBootloaderOrMergedSignature =
    sizeBytes >= 0x8002 &&
    ((bytes[0x1000] === 0xe9 && !hasAppDescMagic) || (bytes[0x8000] === 0xaa && bytes[0x8001] === 0x50));

  const looksLikeBootloaderOrMerged =
    hasBootloaderOrMergedSignature || (hasImageMagic && sizeBytes >= 0x24 && !hasAppDescMagic);

  if (sizeBytes > 0 && !hasAppDescMagic) {
    if (looksLikeBootloaderOrMerged) {
      errors.push('Missing esp_app_desc_t magic (0xABCD5432 at 0x20); looks like a bootloader or merged flash image.');
      warnings.push('Upload the standalone application image (e.g. momentra-esp32-ota.bin), not a merged flash or bootloader binary.');
    } else {
      errors.push('File is too small or missing esp_app_desc_t header at offset 0x20.');
    }
  }

  const version = hasAppDescMagic ? readAsciiCString(bytes, 0x30, 32) : null;
  const projectName = hasAppDescMagic ? readAsciiCString(bytes, 0x50, 32) : null;

  if (hasAppDescMagic && projectName && !projectName.toLowerCase().includes('clock') && !projectName.toLowerCase().includes('momentra')) {
    warnings.push(`Application project name "${projectName}" may not match Momentra Clock firmware.`);
  }

  return {
    valid: errors.length === 0,
    sizeBytes,
    maxBytes: OTA_MAX_BYTES,
    hasImageMagic,
    hasAppDescMagic,
    looksLikeBootloaderOrMerged,
    version,
    projectName,
    errors,
    warnings,
  };
}

class HttpTransport implements Transport {
  constructor(private readonly getTarget: () => { baseUrl: string; useProxy: boolean }) {}

  private buildRequest(path: string): { url: string; headers: Record<string, string> } {
    const { baseUrl, useProxy } = this.getTarget();
    const cleanBase = normalizeDeviceUrl(baseUrl);
    if (useProxy) {
      return {
        url: `/device-proxy${path}`,
        headers: { 'X-Momentra-Target': cleanBase },
      };
    }
    return {
      url: `${cleanBase}${path}`,
      headers: {},
    };
  }

  private async execFetch(
    path: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const { url, headers } = this.buildRequest(path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        cache: 'no-store',
        headers: {
          ...headers,
          ...(init.headers as Record<string, string> | undefined),
        },
        signal: controller.signal,
      });
      return response;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new MomentraApiError(0, 'Request timed out while reaching device.', true);
      }
      const message = err instanceof Error ? err.message : 'Network request failed';
      throw new MomentraApiError(0, message, true);
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseError(response: Response): Promise<never> {
    let message = `HTTP ${response.status}`;
    try {
      const text = await response.text();
      if (text) {
        const parsed = JSON.parse(text) as Partial<ApiErrorResponse>;
        if (typeof parsed.error === 'string' && parsed.error.length > 0) {
          message = parsed.error;
        }
      }
    } catch {
      // Keep status fallback if error body is not JSON
    }
    throw new MomentraApiError(response.status, message, response.status === 502 || response.status === 503);
  }

  async getJson<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    const response = await this.execFetch(path, { method: 'GET' }, timeoutMs);
    if (!response.ok) {
      await this.parseError(response);
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new MomentraApiError(response.status || 500, 'Invalid JSON response from device.');
    }
  }

  async postForm(path: string, params: URLSearchParams, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    const hasFields = Array.from(params.keys()).length > 0;
    const response = await this.execFetch(
      path,
      {
        method: 'POST',
        headers: hasFields ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
        body: hasFields ? params.toString() : undefined,
      },
      timeoutMs,
    );
    if (!response.ok) {
      await this.parseError(response);
    }
  }

  async postBinary(
    path: string,
    data: Blob | ArrayBuffer,
    timeoutMs = OTA_TIMEOUT_MS,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    if (onProgress && typeof XMLHttpRequest !== 'undefined') {
      const { url, headers } = this.buildRequest(path);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.timeout = timeoutMs;
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        for (const [key, value] of Object.entries(headers)) {
          xhr.setRequestHeader(key, value);
        }

        const totalBytes = data instanceof ArrayBuffer ? data.byteLength : data.size;
        onProgress(0);

        xhr.upload.onprogress = (event) => {
          const total = event.lengthComputable && event.total > 0 ? event.total : totalBytes;
          if (total > 0) {
            const pct = Math.max(0, Math.min(99, Math.round((event.loaded / total) * 100)));
            onProgress(pct);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress(100);
            resolve();
            return;
          }
          let message = `HTTP ${xhr.status}`;
          try {
            if (xhr.responseText) {
              const parsed = JSON.parse(xhr.responseText) as Partial<ApiErrorResponse>;
              if (typeof parsed.error === 'string' && parsed.error.length > 0) {
                message = parsed.error;
              }
            }
          } catch {
            // Keep HTTP status fallback
          }
          reject(new MomentraApiError(xhr.status, message, xhr.status === 502 || xhr.status === 503));
        };

        xhr.onerror = () => {
          reject(new MomentraApiError(0, 'Network request failed during upload.', true));
        };

        xhr.ontimeout = () => {
          reject(new MomentraApiError(0, 'Upload timed out while reaching device.', true));
        };

        xhr.send(data);
      });
      return;
    }

    const response = await this.execFetch(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: data,
      },
      timeoutMs,
    );
    if (!response.ok) {
      await this.parseError(response);
    }
    onProgress?.(100);
  }
}

class DemoTransport implements Transport {
  constructor(private readonly device: MockMomentraDevice) {}

  private wrap<T>(fn: () => T): Promise<T> {
    try {
      return Promise.resolve(fn());
    } catch (err) {
      if (err instanceof MockHttpError) {
        return Promise.reject(
          new MomentraApiError(err.status, err.message, err.status === 503),
        );
      }
      const msg = err instanceof Error ? err.message : 'Simulator error';
      return Promise.reject(new MomentraApiError(500, msg));
    }
  }

  getJson<T>(path: string): Promise<T> {
    return this.wrap(() => {
      if (path === '/api/status') return this.device.getStatus() as T;
      if (path === '/api/timezones') return this.device.getTimezones() as T;
      if (path === '/api/wifi/scan') return this.device.getWifiScanStatus() as T;
      throw new MockHttpError(404, `Unknown GET path: ${path}`);
    });
  }

  postForm(path: string, params: URLSearchParams): Promise<void> {
    return this.wrap(() => {
      if (path === '/api/settings') {
        this.device.saveSettings(params);
        return;
      }
      if (path === '/api/timezones') {
        this.device.saveSecondaryTimezone(params);
        return;
      }
      if (path === '/api/alarm') {
        this.device.saveAlarm(params);
        return;
      }
      if (path === '/api/alarm/stop') {
        this.device.stopAlarm();
        return;
      }
      if (path === '/api/sound/test') {
        this.device.testMagicSound(params);
        return;
      }
      if (path === '/api/timer') {
        this.device.controlTimer(params);
        return;
      }
      if (path === '/api/wifi/scan') {
        this.device.startWifiScan();
        return;
      }
      if (path === '/api/wifi') {
        this.device.saveWifiCredentials(params);
        return;
      }
      if (path === '/api/reboot') {
        this.device.reboot();
        return;
      }
      throw new MockHttpError(404, `Unknown POST path: ${path}`);
    });
  }

  async postBinary(
    path: string,
    data: Blob | ArrayBuffer,
    _timeoutMs?: number,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    if (path !== '/api/ota') {
      return Promise.reject(new MomentraApiError(404, `Unknown binary POST path: ${path}`));
    }
    const byteLength = data instanceof ArrayBuffer ? data.byteLength : data.size;
    if (onProgress) {
      onProgress(0);
      for (const pct of [20, 45, 70, 92]) {
        await new Promise((resolve) => setTimeout(resolve, 110));
        onProgress(pct);
      }
    }
    await this.wrap(() => {
      this.device.uploadOta(byteLength);
    });
    onProgress?.(100);
  }
}

/**
 * Deep module encapsulating all Momentra Clock operations across Live HTTP
 * (direct or `/device-proxy`) and Demo Simulator modes.
 */
export class MomentraClient {
  private config: MomentraClientConfig;
  private readonly mockDevice = new MockMomentraDevice();
  private readonly httpTransport: HttpTransport;
  private readonly demoTransport: DemoTransport;

  constructor(initialConfig: MomentraClientConfig) {
    this.config = {
      ...initialConfig,
      baseUrl: normalizeDeviceUrl(initialConfig.baseUrl),
    };
    this.httpTransport = new HttpTransport(() => ({
      baseUrl: this.config.baseUrl,
      useProxy: this.config.useProxy,
    }));
    this.demoTransport = new DemoTransport(this.mockDevice);
  }

  configure(next: Partial<MomentraClientConfig>): void {
    this.config = {
      ...this.config,
      ...next,
      baseUrl: next.baseUrl !== undefined ? normalizeDeviceUrl(next.baseUrl) : this.config.baseUrl,
    };
  }

  getConfig(): MomentraClientConfig {
    return { ...this.config };
  }

  private get transport(): Transport {
    return this.config.mode === 'demo' ? this.demoTransport : this.httpTransport;
  }

  async getStatus(): Promise<ClockStatus> {
    return this.transport.getJson<ClockStatus>('/api/status');
  }

  async getTimezones(): Promise<string[]> {
    return this.transport.getJson<string[]>('/api/timezones');
  }

  async saveSettings(payload: SettingsPayload): Promise<void> {
    const err = validateSettingsPayload(payload);
    if (err) throw new MomentraApiError(400, err);

    const params = new URLSearchParams({
      brightness: String(payload.brightness),
      font: String(payload.font),
      format_12h: String(payload.format_12h),
      hourly_enabled: String(payload.hourly_enabled),
      hourly_pattern: String(payload.hourly_pattern),
    });
    if (payload.feedback_enabled !== undefined) {
      params.set('feedback_enabled', String(payload.feedback_enabled));
    }
    if (payload.colon_blink !== undefined) {
      params.set('colon_blink', String(payload.colon_blink));
    }
    if (payload.seconds_animation !== undefined) {
      params.set('seconds_animation', String(payload.seconds_animation));
    }
    if (payload.timezone_primary !== undefined) {
      params.set('timezone_primary', payload.timezone_primary);
    }
    if (payload.magic_enabled !== undefined) {
      params.set('magic_enabled', String(payload.magic_enabled));
    }
    if (payload.magic_pwm !== undefined) {
      params.set('magic_pwm', String(payload.magic_pwm));
    }
    await this.transport.postForm('/api/settings', params);
  }

  async saveSecondaryTimezone(payload: SecondaryTimezonePayload): Promise<void> {
    if (!payload.timezone_secondary || payload.timezone_secondary.length > 63) {
      throw new MomentraApiError(400, 'Secondary timezone is required.');
    }
    const params = new URLSearchParams({
      timezone_secondary: payload.timezone_secondary,
      timezone_secondary_enabled: String(payload.timezone_secondary_enabled),
    });
    await this.transport.postForm('/api/timezones', params);
  }

  async saveAlarm(payload: AlarmUpdatePayload): Promise<void> {
    const err = validateAlarmPayload(payload);
    if (err) throw new MomentraApiError(400, err);

    const params = new URLSearchParams({
      index: String(payload.index),
      enabled: String(payload.enabled),
      hour: String(payload.hour),
      minute: String(payload.minute),
      repeat: String(payload.repeat),
      duration_seconds: String(payload.duration_seconds),
    });
    await this.transport.postForm('/api/alarm', params);
  }

  async stopAlarm(): Promise<void> {
    await this.transport.postForm('/api/alarm/stop', new URLSearchParams());
  }

  async testMagicSound(track: number, pwm?: BinaryFlag, stop = false): Promise<number> {
    const params = new URLSearchParams();
    if (stop) {
      params.set('stop', '1');
    } else {
      if (!Number.isInteger(track) || track < -1 || track >= MAGIC_TRACK_COUNT) {
        throw new MomentraApiError(400, `Track ID must be -1 (random) or 0..${MAGIC_TRACK_COUNT - 1}.`);
      }
      params.set('track', String(track));
      if (pwm !== undefined) {
        params.set('pwm', String(pwm));
      }
    }
    await this.transport.postForm('/api/sound/test', params);
    if (this.config.mode === 'demo' && !stop) {
      return this.mockDevice.getStatus().magic_track;
    }
    return track;
  }

  async controlTimer(timer: TimerName, action: TimerAction, seconds?: number): Promise<void> {
    const params = new URLSearchParams({ timer, action });
    if (timer === 'reminder' && action === 'start') {
      const sec = seconds ?? 0;
      const err = validateReminderSeconds(sec);
      if (err) throw new MomentraApiError(400, err);
      params.set('seconds', String(sec));
    }
    await this.transport.postForm('/api/timer', params);
  }

  async startWifiScan(): Promise<void> {
    await this.transport.postForm('/api/wifi/scan', new URLSearchParams());
  }

  async getWifiScanStatus(): Promise<WifiScanResponse> {
    return this.transport.getJson<WifiScanResponse>('/api/wifi/scan');
  }

  /** Start a Wi-Fi scan and poll until completion, decoding valid UTF-8 SSIDs. */
  async scanWifiUntilDone(signal?: AbortSignal): Promise<DecodedWifiNetwork[]> {
    await this.startWifiScan();
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (signal?.aborted) {
        throw new MomentraApiError(0, 'Wi-Fi scan cancelled.', true);
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
      if (signal?.aborted) {
        throw new MomentraApiError(0, 'Wi-Fi scan cancelled.', true);
      }
      const res = await this.getWifiScanStatus();
      if (res.state === 'done') {
        const decoded: DecodedWifiNetwork[] = [];
        for (const item of res.networks) {
          const ssid = decodeSsidHex(item.ssid_hex);
          if (ssid !== null) {
            decoded.push({ ...item, ssid });
          }
        }
        return decoded;
      }
      if (res.state === 'idle') {
        throw new MomentraApiError(500, 'Scan returned to idle unexpectedly.');
      }
    }
    throw new MomentraApiError(500, 'Wi-Fi scan timed out.');
  }

  async saveWifiCredentials(ssid: string, password: string): Promise<void> {
    const err = validateWifiCredentials(ssid, password);
    if (err) throw new MomentraApiError(400, err);
    const params = new URLSearchParams({ ssid, password });
    await this.transport.postForm('/api/wifi', params);
  }

  async reboot(): Promise<void> {
    await this.transport.postForm('/api/reboot', new URLSearchParams());
  }

  async uploadOta(file: Blob | ArrayBuffer, onProgress?: (percent: number) => void): Promise<void> {
    const size = file instanceof ArrayBuffer ? file.byteLength : file.size;
    if (size <= 0) {
      throw new MomentraApiError(400, 'Select a non-empty .bin firmware image.');
    }
    await this.transport.postBinary('/api/ota', file, OTA_TIMEOUT_MS, onProgress);
  }

  /** Demo-mode test trigger: ring an alarm slot immediately. */
  triggerDemoAlarm(slotIndex = 0): void {
    this.mockDevice.triggerDemoAlarm(slotIndex);
  }

  /** Demo-mode test helper: toggle Setup AP vs Station mode. */
  setDemoNetworkMode(setupAp: boolean): void {
    this.mockDevice.setDemoNetworkMode(setupAp);
  }

  /** Demo-mode test helper: toggle buzzer configured flag. */
  setDemoBuzzerConfigured(configured: boolean): void {
    this.mockDevice.setDemoBuzzerConfigured(configured);
  }

  /** Demo-mode test helper: jump simulated clock to HH:MM and trigger interesting-time playback if enabled. */
  simulateInterestingTime(hour24: number, minute: number): { matched: boolean; track: number } {
    return this.mockDevice.simulateInterestingTime(hour24, minute);
  }
}
