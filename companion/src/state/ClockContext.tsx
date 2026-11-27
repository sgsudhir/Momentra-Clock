import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MomentraApiError, MomentraClient, inspectOtaBinary as inspectOtaBinaryBuffer } from '../api/client';
import { type MagicPlaybackState, momentraSoundSynth } from '../api/soundSynth';
import {
  type AlarmUpdatePayload,
  type BinaryFlag,
  type ClockStatus,
  type ConnectionMode,
  type ConnectionStatus,
  DEFAULT_DEVICE_PROFILES,
  type DecodedWifiNetwork,
  type DeviceProfile,
  type OtaImageInspection,
  POLL_INTERVAL_MS,
  REANCHOR_INTERVAL_MS,
  type SecondaryTimezonePayload,
  type SettingsPayload,
  STOPWATCH_MAX_MS,
  THEMES,
  type ThemeId,
  type TimerAction,
  type TimerName,
  fontSupportsAnimation,
  normalizeDeviceUrl,
} from '../types/clock';

const STORAGE_KEYS = {
  mode: 'momentra-ionic-mode',
  profiles: 'momentra-ionic-profiles',
  activeProfile: 'momentra-ionic-active-profile',
  theme: 'momentra-ionic-theme',
} as const;

export interface ToastMessage {
  id: number;
  message: string;
  color: 'success' | 'danger' | 'warning' | 'primary';
}

export interface LiveClockSnapshot {
  /** Interpolated UTC epoch milliseconds (null if time_valid is false). */
  utcMs: number | null;
  /** Primary wall time shifted by timezone_primary_offset (read with getUTC* methods). */
  primaryWallDate: Date | null;
  /** Secondary wall time shifted by timezone_secondary_offset (read with getUTC* methods). */
  secondaryWallDate: Date | null;
  /** Sub-second ms within the current second (0..999) for animations. */
  subSecondMs: number;
  /** Interpolated stopwatch elapsed milliseconds. */
  stopwatchMs: number;
  /** Interpolated reminder remaining milliseconds. */
  reminderMs: number;
  /** Interpolated countdown seconds per alarm slot. */
  alarmNextSeconds: (number | null)[];
}

export interface ClockContextValue {
  status: ClockStatus | null;
  live: LiveClockSnapshot;
  timezones: string[];
  mode: ConnectionMode;
  demoMode: boolean;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  profiles: DeviceProfile[];
  activeProfile: DeviceProfile;
  theme: ThemeId;
  busy: boolean;
  otaProgress: number | null;
  scanningWifi: boolean;
  scannedNetworks: DecodedWifiNetwork[];
  wifiScanMessage: string | null;
  toast: ToastMessage | null;
  magicPlayback: MagicPlaybackState;
  magicSoundMuted: boolean;
  supportsMagicFirmware: boolean;

  setTheme: (theme: ThemeId) => void;
  setMagicSoundMuted: (muted: boolean) => void;
  clearToast: () => void;
  showToast: (message: string, color?: ToastMessage['color']) => void;

  setConnectionMode: (mode: ConnectionMode) => void;
  selectProfile: (profileId: string) => void;
  addProfile: (profile: Omit<DeviceProfile, 'id'>) => DeviceProfile;
  updateProfile: (profile: DeviceProfile) => void;
  removeProfile: (profileId: string) => void;

  refresh: () => Promise<boolean>;
  saveSettings: (payload: SettingsPayload) => Promise<boolean>;
  saveSecondaryTimezone: (payload: SecondaryTimezonePayload) => Promise<boolean>;
  saveAlarm: (payload: AlarmUpdatePayload) => Promise<boolean>;
  stopAlarm: () => Promise<boolean>;
  controlTimer: (timer: TimerName, action: TimerAction, seconds?: number) => Promise<boolean>;
  scanWifi: () => Promise<DecodedWifiNetwork[]>;
  saveWifi: (ssid: string, password: string) => Promise<boolean>;
  rebootDevice: () => Promise<boolean>;
  inspectOtaBinary: (file: Blob | ArrayBuffer) => Promise<OtaImageInspection>;
  uploadOta: (file: Blob | ArrayBuffer) => Promise<boolean>;
  testMagicSound: (track: number, pwmOverride?: boolean) => Promise<boolean>;
  stopMagicSound: () => Promise<boolean>;

  triggerDemoAlarm: (slotIndex?: number) => Promise<void>;
  setDemoNetworkMode: (setupAp: boolean) => Promise<void>;
  setDemoBuzzerConfigured: (configured: boolean) => Promise<void>;
  simulateInterestingTime: (hour24: number, minute: number) => Promise<void>;
}

const ClockContext = createContext<ClockContextValue | null>(null);

function safeStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota/privacy mode failures
  }
}

function loadInitialProfiles(): DeviceProfile[] {
  const raw = safeStorageGet(STORAGE_KEYS.profiles);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter(
          (item): item is DeviceProfile =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as DeviceProfile).id === 'string' &&
            typeof (item as DeviceProfile).name === 'string' &&
            typeof (item as DeviceProfile).baseUrl === 'string' &&
            typeof (item as DeviceProfile).useProxy === 'boolean',
        );
        if (valid.length > 0) return valid;
      }
    } catch {
      // Fall back to defaults
    }
  }
  return DEFAULT_DEVICE_PROFILES.map((p) => ({ ...p }));
}

function loadInitialMode(): ConnectionMode {
  const saved = safeStorageGet(STORAGE_KEYS.mode);
  return saved === 'live' ? 'live' : 'demo';
}

function loadInitialTheme(): ThemeId {
  const saved = safeStorageGet(STORAGE_KEYS.theme);
  if (saved && THEMES.some((t) => t.id === saved)) {
    return saved as ThemeId;
  }
  return 'momentra';
}

function applyThemeToDocument(themeId: ThemeId): void {
  const meta = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  document.documentElement.dataset.theme = meta.id;
  document.documentElement.classList.toggle('ion-palette-dark', meta.isDark);
  document.documentElement.style.colorScheme = meta.isDark ? 'dark' : 'light';
}

const EMPTY_LIVE: LiveClockSnapshot = {
  utcMs: null,
  primaryWallDate: null,
  secondaryWallDate: null,
  subSecondMs: 0,
  stopwatchMs: 0,
  reminderMs: 0,
  alarmNextSeconds: [null, null, null, null, null],
};

function computeLiveSnapshot(
  status: ClockStatus | null,
  clockAnchorMs: number | null,
  clockAnchorAt: number,
  receivedAt: number,
  nowMono: number,
): LiveClockSnapshot {
  if (!status) return EMPTY_LIVE;

  const timerDelta = Math.max(0, nowMono - receivedAt);
  const stopwatchMs = Math.min(
    STOPWATCH_MAX_MS,
    status.stopwatch_ms + (status.stopwatch_state === 1 ? timerDelta : 0),
  );
  const reminderMs =
    status.reminder_state === 3
      ? 0
      : Math.max(0, status.reminder_ms - (status.reminder_state === 1 ? timerDelta : 0));

  const alarmNextSeconds = status.alarm_next_seconds.map((sec) => {
    if (sec === null) return null;
    return Math.max(0, sec - Math.floor(timerDelta / 1000));
  });

  if (!status.time_valid || clockAnchorMs === null) {
    return {
      utcMs: null,
      primaryWallDate: null,
      secondaryWallDate: null,
      subSecondMs: 0,
      stopwatchMs,
      reminderMs,
      alarmNextSeconds,
    };
  }

  const utcMs = clockAnchorMs + Math.max(0, nowMono - clockAnchorAt);
  const primaryWallDate =
    status.timezone_primary_offset !== null
      ? new Date(utcMs + status.timezone_primary_offset * 1000)
      : null;
  const secondaryWallDate =
    status.timezone_secondary_offset !== null
      ? new Date(utcMs + status.timezone_secondary_offset * 1000)
      : null;

  return {
    utcMs,
    primaryWallDate,
    secondaryWallDate,
    subSecondMs: ((Math.floor(utcMs) % 1000) + 1000) % 1000,
    stopwatchMs,
    reminderMs,
    alarmNextSeconds,
  };
}

export const ClockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profiles, setProfiles] = useState<DeviceProfile[]>(loadInitialProfiles);
  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    const saved = safeStorageGet(STORAGE_KEYS.activeProfile);
    return saved || DEFAULT_DEVICE_PROFILES[0].id;
  });
  const [mode, setMode] = useState<ConnectionMode>(loadInitialMode);
  const [theme, setThemeState] = useState<ThemeId>(loadInitialTheme);

  const activeProfile = useMemo<DeviceProfile>(() => {
    return profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  }, [profiles, activeProfileId]);

  const clientRef = useRef<MomentraClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new MomentraClient({
      mode,
      baseUrl: activeProfile.baseUrl,
      useProxy: activeProfile.useProxy,
    });
  }

  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [timezones, setTimezones] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    mode === 'demo' ? 'demo' : 'connecting',
  );
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [otaProgress, setOtaProgress] = useState<number | null>(null);
  const [scanningWifi, setScanningWifi] = useState(false);
  const [scannedNetworks, setScannedNetworks] = useState<DecodedWifiNetwork[]>([]);
  const [wifiScanMessage, setWifiScanMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [magicSoundMuted, setMagicSoundMuted] = useState(false);
  const [magicPlayback, setMagicPlayback] = useState<MagicPlaybackState>({
    playing: false,
    trackId: null,
    stepIndex: 0,
    freqHz: 0,
  });

  const anchorRef = useRef<{
    clockAnchorMs: number | null;
    clockAnchorAt: number;
    lastClockSync: number;
    receivedAt: number;
  }>({
    clockAnchorMs: null,
    clockAnchorAt: 0,
    lastClockSync: 0,
    receivedAt: performance.now(),
  });

  const [live, setLive] = useState<LiveClockSnapshot>(EMPTY_LIVE);

  const refreshGenRef = useRef(0);
  const inFlightGenRef = useRef<number | null>(null);
  const zonesLoadedForRef = useRef<string | null>(null);
  const rebootingUntilRef = useRef(0);
  const toastIdRef = useRef(1);
  const scanAbortRef = useRef<AbortController | null>(null);
  const prevMagicPlayingRef = useRef(false);
  const suppressAutoSynthRef = useRef(false);

  const showToast = useCallback(
    (message: string, color: ToastMessage['color'] = 'primary') => {
      toastIdRef.current += 1;
      setToast({ id: toastIdRef.current, message, color });
    },
    [],
  );

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  const setTheme = useCallback((nextTheme: ThemeId) => {
    setThemeState(nextTheme);
    safeStorageSet(STORAGE_KEYS.theme, nextTheme);
    applyThemeToDocument(nextTheme);
  }, []);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  // Keep client configuration synchronized with mode & active profile
  useEffect(() => {
    refreshGenRef.current += 1;
    inFlightGenRef.current = null;
    scanAbortRef.current?.abort();
    momentraSoundSynth.stop();
    prevMagicPlayingRef.current = false;
    clientRef.current?.configure({
      mode,
      baseUrl: activeProfile.baseUrl,
      useProxy: activeProfile.useProxy,
    });
    zonesLoadedForRef.current = null;
    anchorRef.current.clockAnchorMs = null;
    anchorRef.current.lastClockSync = 0;
    setScannedNetworks([]);
    setWifiScanMessage(null);
    setConnectionError(null);
    setConnectionStatus(mode === 'demo' ? 'demo' : 'connecting');
  }, [mode, activeProfile.id, activeProfile.baseUrl, activeProfile.useProxy]);

  const refresh = useCallback(async (): Promise<boolean> => {
    const client = clientRef.current;
    const myGen = refreshGenRef.current;
    if (!client || inFlightGenRef.current === myGen) return false;
    inFlightGenRef.current = myGen;
    const targetKey =
      mode === 'demo' ? 'demo' : `${activeProfile.baseUrl}|${String(activeProfile.useProxy)}`;

    try {
      const requestStartedAt = performance.now();
      const nextStatus = await client.getStatus();
      const receivedAt = performance.now();
      if (refreshGenRef.current !== myGen) return false;

      if (zonesLoadedForRef.current !== targetKey) {
        try {
          const zones = await client.getTimezones();
          if (refreshGenRef.current !== myGen) return false;
          setTimezones(zones);
          zonesLoadedForRef.current = targetKey;
        } catch {
          if (refreshGenRef.current !== myGen) return false;
          // Keep previous or empty timezone list if fetch fails transiently
        }
      }

      const anchor = anchorRef.current;
      anchor.receivedAt = receivedAt;
      if (!nextStatus.time_valid || nextStatus.unix_time_ms === null) {
        anchor.clockAnchorMs = null;
      } else if (
        anchor.clockAnchorMs === null ||
        receivedAt - anchor.lastClockSync >= REANCHOR_INTERVAL_MS
      ) {
        anchor.clockAnchorMs = nextStatus.unix_time_ms;
        anchor.clockAnchorAt = (requestStartedAt + receivedAt) / 2;
        anchor.lastClockSync = receivedAt;
      }

      setStatus(nextStatus);
      if (mode === 'demo') {
        const wasPlaying = prevMagicPlayingRef.current;
        prevMagicPlayingRef.current = nextStatus.magic_playing;
        if (nextStatus.magic_playing && !wasPlaying && !suppressAutoSynthRef.current && !magicSoundMuted) {
          momentraSoundSynth.playTrack(
            nextStatus.magic_track >= 0 ? nextStatus.magic_track : -1,
            Boolean(nextStatus.magic_pwm),
            setMagicPlayback,
          );
        } else if (!nextStatus.magic_playing && wasPlaying) {
          momentraSoundSynth.stop();
        }
      } else {
        prevMagicPlayingRef.current = nextStatus.magic_playing;
      }
      setLive(
        computeLiveSnapshot(
          nextStatus,
          anchor.clockAnchorMs,
          anchor.clockAnchorAt,
          anchor.receivedAt,
          receivedAt,
        ),
      );
      setConnectionError(null);
      setConnectionStatus(mode === 'demo' ? 'demo' : 'live');
      return true;
    } catch (err) {
      if (refreshGenRef.current !== myGen) return false;
      const apiErr =
        err instanceof MomentraApiError
          ? err
          : new MomentraApiError(0, err instanceof Error ? err.message : 'Connection failed', true);
      if (performance.now() < rebootingUntilRef.current || apiErr.status === 503) {
        setConnectionStatus('rebooting');
        setConnectionError('Device is rebooting and will reconnect shortly.');
      } else {
        setConnectionStatus('disconnected');
        setConnectionError(apiErr.message);
      }
      return false;
    } finally {
      if (inFlightGenRef.current === myGen) {
        inFlightGenRef.current = null;
      }
    }
  }, [mode, activeProfile.baseUrl, activeProfile.useProxy, magicSoundMuted]);

  useEffect(() => {
    return () => {
      momentraSoundSynth.stop();
    };
  }, []);

  // 5-second background polling
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Local clock/timer interpolation (1s baseline, 100ms when sub-second timer/animation active)
  useEffect(() => {
    if (!status) return;
    const needsSubSecond =
      status.stopwatch_state === 1 ||
      status.reminder_state === 1 ||
      status.reminder_state === 3 ||
      (status.seconds_animation >= 3 &&
        status.timezone_secondary_enabled === 0 &&
        fontSupportsAnimation(status.font));
    const intervalMs = needsSubSecond ? 100 : 1000;

    const update = () => {
      const anchor = anchorRef.current;
      setLive(
        computeLiveSnapshot(
          status,
          anchor.clockAnchorMs,
          anchor.clockAnchorAt,
          anchor.receivedAt,
          performance.now(),
        ),
      );
    };

    update();
    const id = window.setInterval(update, intervalMs);
    return () => window.clearInterval(id);
  }, [status]);

  const runMutation = useCallback(
    async (
      work: (client: MomentraClient) => Promise<void>,
      successMessage?: string,
      skipRefresh = false,
    ): Promise<boolean> => {
      const client = clientRef.current;
      if (!client) return false;
      setBusy(true);
      try {
        await work(client);
        if (successMessage) {
          showToast(successMessage, 'success');
        }
        if (!skipRefresh) {
          await refresh();
        }
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Request failed';
        showToast(msg, 'danger');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh, showToast],
  );

  const setConnectionMode = useCallback((nextMode: ConnectionMode) => {
    setMode(nextMode);
    safeStorageSet(STORAGE_KEYS.mode, nextMode);
  }, []);

  const selectProfile = useCallback((profileId: string) => {
    setActiveProfileId(profileId);
    safeStorageSet(STORAGE_KEYS.activeProfile, profileId);
  }, []);

  const addProfile = useCallback((draft: Omit<DeviceProfile, 'id'>): DeviceProfile => {
    const newProfile: DeviceProfile = {
      ...draft,
      id: `profile-${Date.now()}`,
      baseUrl: normalizeDeviceUrl(draft.baseUrl),
    };
    setProfiles((prev) => {
      const next = [...prev, newProfile];
      safeStorageSet(STORAGE_KEYS.profiles, JSON.stringify(next));
      return next;
    });
    setActiveProfileId(newProfile.id);
    safeStorageSet(STORAGE_KEYS.activeProfile, newProfile.id);
    return newProfile;
  }, []);

  const updateProfile = useCallback((updated: DeviceProfile) => {
    const normalized: DeviceProfile = {
      ...updated,
      baseUrl: normalizeDeviceUrl(updated.baseUrl),
    };
    setProfiles((prev) => {
      const next = prev.map((p) => (p.id === normalized.id ? normalized : p));
      safeStorageSet(STORAGE_KEYS.profiles, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeProfile = useCallback(
    (profileId: string) => {
      setProfiles((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.filter((p) => p.id !== profileId);
        safeStorageSet(STORAGE_KEYS.profiles, JSON.stringify(next));
        if (activeProfileId === profileId && next[0]) {
          setActiveProfileId(next[0].id);
          safeStorageSet(STORAGE_KEYS.activeProfile, next[0].id);
        }
        return next;
      });
    },
    [activeProfileId],
  );

  const saveSettings = useCallback(
    (payload: SettingsPayload) =>
      runMutation(async (client) => {
        // When dual-zone mode is active, preserve the saved format_12h value from status.
        const basePayload: SettingsPayload =
          status?.timezone_secondary_enabled === 1
            ? { ...payload, format_12h: status.format_12h }
            : { ...payload };
        // Stock v1.0.2 firmware rejects unknown optional fields in /api/settings (strict form.count).
        const supportsMagic = mode === 'demo' || status?.magic_enabled !== undefined;
        if (!supportsMagic) {
          delete basePayload.magic_enabled;
          delete basePayload.magic_pwm;
        }
        await client.saveSettings(basePayload);
      }, 'Display & sound settings saved.'),
    [mode, runMutation, status],
  );

  const saveSecondaryTimezone = useCallback(
    (payload: SecondaryTimezonePayload) =>
      runMutation(
        (client) => client.saveSecondaryTimezone(payload),
        'Second timezone settings saved.',
      ),
    [runMutation],
  );

  const saveAlarm = useCallback(
    (payload: AlarmUpdatePayload) =>
      runMutation(
        (client) => client.saveAlarm(payload),
        `Alarm ${payload.index + 1} saved.`,
      ),
    [runMutation],
  );

  const stopAlarm = useCallback(
    () =>
      runMutation(async (client) => {
        await client.stopAlarm();
      }, 'Stop alarm requested.'),
    [runMutation],
  );

  const controlTimer = useCallback(
    (timer: TimerName, action: TimerAction, seconds?: number) =>
      runMutation((client) => client.controlTimer(timer, action, seconds)),
    [runMutation],
  );

  const scanWifi = useCallback(async (): Promise<DecodedWifiNetwork[]> => {
    const client = clientRef.current;
    if (!client || scanningWifi) return scannedNetworks;
    scanAbortRef.current?.abort();
    const controller = new AbortController();
    scanAbortRef.current = controller;
    setScanningWifi(true);
    setWifiScanMessage('Scanning nearby 2.4 GHz networks…');
    try {
      const networks = await client.scanWifiUntilDone(controller.signal);
      setScannedNetworks(networks);
      setWifiScanMessage(
        networks.length > 0
          ? `Found ${networks.length} network${networks.length === 1 ? '' : 's'}.`
          : 'No networks found. Try scanning again.',
      );
      return networks;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Wi-Fi scan failed; retry.';
      setWifiScanMessage(msg);
      showToast(msg, 'danger');
      return [];
    } finally {
      setScanningWifi(false);
    }
  }, [scannedNetworks, scanningWifi, showToast]);

  const scheduleRebootRecovery = useCallback(() => {
    rebootingUntilRef.current = performance.now() + 2200;
    setConnectionStatus('rebooting');
    window.setTimeout(() => {
      void refresh();
    }, 2200);
  }, [refresh]);

  const saveWifi = useCallback(
    (ssid: string, password: string) =>
      runMutation(
        async (client) => {
          await client.saveWifiCredentials(ssid, password);
          scheduleRebootRecovery();
        },
        'Wi-Fi credentials saved. Device is rebooting.',
        true,
      ),
    [runMutation, scheduleRebootRecovery],
  );

  const rebootDevice = useCallback(
    () =>
      runMutation(
        async (client) => {
          await client.reboot();
          scheduleRebootRecovery();
        },
        'Device reboot requested.',
        true,
      ),
    [runMutation, scheduleRebootRecovery],
  );

  const inspectOtaBinary = useCallback(
    (file: Blob | ArrayBuffer) => inspectOtaBinaryBuffer(file),
    [],
  );

  const uploadOta = useCallback(
    (file: Blob | ArrayBuffer) =>
      runMutation(
        async (client) => {
          setOtaProgress(0);
          try {
            await client.uploadOta(file, (percent) => setOtaProgress(percent));
            scheduleRebootRecovery();
          } finally {
            setOtaProgress(null);
          }
        },
        'Firmware uploaded. Device is rebooting.',
        true,
      ),
    [runMutation, scheduleRebootRecovery],
  );

  const triggerDemoAlarm = useCallback(
    async (slotIndex = 0) => {
      if (mode !== 'demo') return;
      clientRef.current?.triggerDemoAlarm(slotIndex);
      await refresh();
      showToast(`Simulated Alarm ${slotIndex + 1} ringing!`, 'warning');
    },
    [mode, refresh, showToast],
  );

  const setDemoNetworkMode = useCallback(
    async (setupAp: boolean) => {
      if (mode !== 'demo') return;
      clientRef.current?.setDemoNetworkMode(setupAp);
      await refresh();
      showToast(
        setupAp ? 'Simulator switched to Setup AP mode (192.168.4.1).' : 'Simulator switched to Station mode.',
        'primary',
      );
    },
    [mode, refresh, showToast],
  );

  const setDemoBuzzerConfigured = useCallback(
    async (configured: boolean) => {
      if (mode !== 'demo') return;
      clientRef.current?.setDemoBuzzerConfigured(configured);
      await refresh();
    },
    [mode, refresh],
  );

  const supportsMagicFirmware = mode === 'demo' || status?.magic_enabled !== undefined;

  const testMagicSound = useCallback(
    async (track: number, pwmOverride?: boolean): Promise<boolean> => {
      const pwmFlag: BinaryFlag | undefined =
        pwmOverride === undefined ? undefined : pwmOverride ? 1 : 0;
      const effectivePwm = pwmOverride ?? Boolean(status?.magic_pwm);
      suppressAutoSynthRef.current = true;
      try {
        if (mode === 'live' && (!status || !supportsMagicFirmware || !status.buzzer_configured)) {
          const chosen = momentraSoundSynth.playTrack(track, effectivePwm, setMagicPlayback);
          const reason = !status
            ? 'Device offline — auditioning in browser.'
            : !supportsMagicFirmware
              ? 'Device firmware lacks /api/sound/test — playing in browser preview (flash updated firmware from #usb-flasher for hardware audio).'
              : 'Buzzer GPIO unconfigured on device — playing in browser preview.';
          showToast(`${reason} (Track #${chosen + 1})`, 'warning');
          return true;
        }

        const client = clientRef.current;
        if (!client) return false;
        setBusy(true);
        try {
          const resolvedTrack = await client.testMagicSound(track, pwmFlag, false);
          if (mode === 'demo' && !magicSoundMuted) {
            momentraSoundSynth.playTrack(resolvedTrack, effectivePwm, setMagicPlayback);
          } else if (mode === 'live' && !magicSoundMuted) {
            momentraSoundSynth.playTrack(resolvedTrack >= 0 ? resolvedTrack : track, effectivePwm, setMagicPlayback);
          }
          await refresh();
          return true;
        } catch (err) {
          if (err instanceof MomentraApiError && err.status === 404) {
            const chosen = momentraSoundSynth.playTrack(track, effectivePwm, setMagicPlayback);
            showToast(
              `Device returned 404 for /api/sound/test — playing Track #${chosen + 1} in browser preview. Flash updated firmware from #usb-flasher for hardware playback.`,
              'warning',
            );
            return true;
          }
          const msg = err instanceof Error ? err.message : 'Request failed';
          showToast(msg, 'danger');
          return false;
        } finally {
          setBusy(false);
        }
      } finally {
        suppressAutoSynthRef.current = false;
      }
    },
    [mode, magicSoundMuted, refresh, showToast, status, supportsMagicFirmware],
  );

  const stopMagicSound = useCallback(async (): Promise<boolean> => {
    momentraSoundSynth.stop();
    if (mode === 'live' && (!status || !supportsMagicFirmware)) {
      return true;
    }
    const client = clientRef.current;
    if (!client) return true;
    setBusy(true);
    try {
      await client.testMagicSound(0, undefined, true);
      await refresh();
      return true;
    } catch (err) {
      if (err instanceof MomentraApiError && err.status === 404) {
        return true;
      }
      const msg = err instanceof Error ? err.message : 'Request failed';
      showToast(msg, 'danger');
      return false;
    } finally {
      setBusy(false);
    }
  }, [mode, refresh, showToast, status, supportsMagicFirmware]);

  const simulateInterestingTime = useCallback(
    async (hour24: number, minute: number) => {
      if (mode !== 'demo' || !clientRef.current) return;
      suppressAutoSynthRef.current = true;
      try {
        const res = clientRef.current.simulateInterestingTime(hour24, minute);
        anchorRef.current.clockAnchorMs = null;
        anchorRef.current.lastClockSync = 0;
        await refresh();
        if (res.matched && res.track >= 0) {
          if (!magicSoundMuted) {
            momentraSoundSynth.playTrack(res.track, Boolean(status?.magic_pwm), setMagicPlayback);
          }
          showToast(
            `Simulated ${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')} — playing track #${res.track + 1}!`,
            'success',
          );
        } else if (!res.matched) {
          showToast(
            `Clock set to ${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')} (not an interesting time).`,
            'primary',
          );
        } else {
          showToast(
            `Clock set to ${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')} (Interesting-Time Music is disabled).`,
            'warning',
          );
        }
      } finally {
        suppressAutoSynthRef.current = false;
      }
    },
    [mode, magicSoundMuted, refresh, showToast, status?.magic_pwm],
  );

  const value = useMemo<ClockContextValue>(
    () => ({
      status,
      live,
      timezones,
      mode,
      demoMode: mode === 'demo',
      connectionStatus,
      connectionError,
      profiles,
      activeProfile,
      theme,
      busy,
      otaProgress,
      scanningWifi,
      scannedNetworks,
      wifiScanMessage,
      toast,
      magicPlayback,
      magicSoundMuted,
      supportsMagicFirmware,
      setTheme,
      setMagicSoundMuted,
      clearToast,
      showToast,
      setConnectionMode,
      selectProfile,
      addProfile,
      updateProfile,
      removeProfile,
      refresh,
      saveSettings,
      saveSecondaryTimezone,
      saveAlarm,
      stopAlarm,
      controlTimer,
      scanWifi,
      saveWifi,
      rebootDevice,
      inspectOtaBinary,
      uploadOta,
      testMagicSound,
      stopMagicSound,
      triggerDemoAlarm,
      setDemoNetworkMode,
      setDemoBuzzerConfigured,
      simulateInterestingTime,
    }),
    [
      status,
      live,
      timezones,
      mode,
      connectionStatus,
      connectionError,
      profiles,
      activeProfile,
      theme,
      busy,
      otaProgress,
      scanningWifi,
      scannedNetworks,
      wifiScanMessage,
      toast,
      magicPlayback,
      magicSoundMuted,
      supportsMagicFirmware,
      setTheme,
      clearToast,
      showToast,
      setConnectionMode,
      selectProfile,
      addProfile,
      updateProfile,
      removeProfile,
      refresh,
      saveSettings,
      saveSecondaryTimezone,
      saveAlarm,
      stopAlarm,
      controlTimer,
      scanWifi,
      saveWifi,
      rebootDevice,
      inspectOtaBinary,
      uploadOta,
      testMagicSound,
      stopMagicSound,
      triggerDemoAlarm,
      setDemoNetworkMode,
      setDemoBuzzerConfigured,
      simulateInterestingTime,
    ],
  );

  return <ClockContext.Provider value={value}>{children}</ClockContext.Provider>;
};

export function useClock(): ClockContextValue {
  const ctx = useContext(ClockContext);
  if (!ctx) {
    throw new Error('useClock must be used inside a <ClockProvider>');
  }
  return ctx;
}
