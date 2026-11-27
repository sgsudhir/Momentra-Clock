import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IonButton, IonIcon } from '@ionic/react';
import {
  alarmOutline,
  flashOutline,
  musicalNotesOutline,
  pauseOutline,
  playOutline,
  settingsOutline,
  shuffleOutline,
  stopOutline,
  timerOutline,
} from 'ionicons/icons';
import { LedMatrixPreview } from '../components/LedMatrixPreview';
import { RingingBanner } from '../components/RingingBanner';
import { useClock } from '../state/ClockContext';
import {
  HOURLY_PATTERNS,
  TIMER_STATE_LABELS,
  formatElapsed,
  formatReminderMs,
  formatStopwatchMs,
  getFontMeta,
} from '../types/clock';
import {
  classifyInterestingTime,
  getNextInterestingTime,
  listSampleInterestingTimes,
} from '../types/magicMusic';

function formatWallClock(date: Date | null, use12h: boolean): string {
  if (!date) return '--:--';
  const hour = date.getUTCHours();
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');
  if (use12h) {
    const h12 = hour % 12 || 12;
    const ampm = hour < 12 ? 'AM' : 'PM';
    return `${h12}:${minute}:${second} ${ampm}`;
  }
  return `${String(hour).padStart(2, '0')}:${minute}:${second}`;
}

function formatUtcOffset(offsetSec: number | null): string {
  if (offsetSec === null) return 'Offset unavailable';
  const sign = offsetSec >= 0 ? '+' : '-';
  const abs = Math.abs(offsetSec);
  const hrs = String(Math.floor(abs / 3600)).padStart(2, '0');
  const mins = String(Math.floor((abs % 3600) / 60)).padStart(2, '0');
  return `UTC${sign}${hrs}:${mins}`;
}

export const OverviewPage: React.FC = () => {
  const {
    status,
    live,
    demoMode,
    busy,
    activeProfile,
    magicPlayback,
    saveSettings,
    controlTimer,
    triggerDemoAlarm,
    testMagicSound,
    stopMagicSound,
    simulateInterestingTime,
  } = useClock();

  const [quickBrightness, setQuickBrightness] = useState<number>(status?.brightness ?? 50);
  const [draggingBrightness, setDraggingBrightness] = useState(false);

  useEffect(() => {
    if (status && !draggingBrightness) {
      setQuickBrightness(status.brightness);
    }
  }, [status, draggingBrightness]);

  const dualZone = status?.timezone_secondary_enabled === 1;
  const is12hHero = status?.format_12h === 1 && !dualZone;

  const primaryTimeText =
    !status?.time_valid || status.timezone_primary_offset === null
      ? '--:--'
      : formatWallClock(live.primaryWallDate, is12hHero);

  const primaryDateText = !status
    ? 'Waiting for clock status'
    : !status.time_valid
      ? 'Waiting for NTP time sync'
      : status.timezone_primary_offset === null
        ? 'Timezone data unavailable for this date'
        : live.primaryWallDate
          ? live.primaryWallDate.toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            })
          : 'Waiting for clock status';

  const enabledAlarms =
    status?.alarms
      .map((alarm, index) => ({ alarm, index }))
      .filter((entry) => entry.alarm.enabled === 1) ?? [];

  const handleApplyQuickBrightness = async () => {
    if (!status) return;
    await saveSettings({
      brightness: quickBrightness,
      font: status.font,
      format_12h: status.format_12h,
      hourly_enabled: status.hourly_enabled,
      hourly_pattern: status.hourly_pattern,
      feedback_enabled: status.feedback_enabled,
      colon_blink: status.colon_blink,
      seconds_animation: status.seconds_animation,
      timezone_primary: status.timezone_primary,
    });
    setDraggingBrightness(false);
  };

  const wifiLabel = !status
    ? 'Wi-Fi: checking'
    : status.setup_ap
      ? 'Wi-Fi: Setup AP'
      : status.wifi_connected
        ? `Wi-Fi: ${status.wifi_rssi ?? '--'} dBm`
        : 'Wi-Fi: Offline';

  const chimeLabel = !status
    ? 'Chime: checking'
    : status.hourly_enabled
      ? `Chime: ${HOURLY_PATTERNS[status.hourly_pattern]?.label ?? 'On'}`
      : 'Chime: Off';

  const brightnessDirty = status !== null && quickBrightness !== status.brightness;

  const currentMagicMatch =
    status?.time_valid && live.primaryWallDate
      ? classifyInterestingTime(
          live.primaryWallDate.getUTCHours(),
          live.primaryWallDate.getUTCMinutes(),
          is12hHero,
        )
      : null;

  const nextInteresting =
    status?.time_valid && live.utcMs !== null
      ? getNextInterestingTime(new Date(live.utcMs), status.timezone_primary, is12hHero)
      : null;

  const sampleMagicTimes = listSampleInterestingTimes(is12hHero);
  const isMagicPlaying = Boolean(status?.magic_playing) || magicPlayback.playing;

  return (
    <div className="page-shell">
      <RingingBanner />

      {demoMode ? (
        <div className="sim-strip" data-testid="demo-simulator-banner">
          <span>
            <strong>Demo Simulator Active</strong> — Interactive virtual ESP32 Momentra clock.
            Switch to a LAN or Setup AP device in Device &amp; Network.
          </span>
          <Link to="/device" style={{ textDecoration: 'none' }}>
            <IonButton size="small" fill="outline" color="primary" data-testid="switch-device-btn">
              Connect Device
            </IonButton>
          </Link>
        </div>
      ) : (
        <div className="sim-strip" data-testid="live-device-banner">
          <span>
            <strong>Live Device:</strong> {activeProfile.name} ({activeProfile.baseUrl})
          </span>
          <Link to="/device" style={{ textDecoration: 'none' }}>
            <IonButton size="small" fill="outline" color="primary">
              Device Settings
            </IonButton>
          </Link>
        </div>
      )}

      <section className="hero-glass" aria-label="Clock overview">
        <div className="hero-layout">
          <div>
            <div className="hero-clock-readout" data-testid="hero-clock-time">
              {primaryTimeText}
            </div>
            <p className="hero-date" data-testid="hero-clock-date">
              {primaryDateText}
            </p>
            <p className="hero-zone-title" style={{ marginBottom: 12 }}>
              {status
                ? `${status.timezone_primary} · ${formatUtcOffset(status.timezone_primary_offset)}`
                : 'Connecting to clock'}
            </p>

            {dualZone && status && (
              <div className="hero-secondary-row" data-testid="hero-secondary-time">
                <span>Row 2 · {status.timezone_secondary}:</span>
                <strong>{formatWallClock(live.secondaryWallDate, false)}</strong>
              </div>
            )}

            <div className="hero-pills">
              <span className="m-pill" data-testid="pill-wifi">
                {wifiLabel}
              </span>
              <span className="m-pill" data-testid="pill-alarms">
                {enabledAlarms.length} {enabledAlarms.length === 1 ? 'alarm on' : 'alarms on'}
              </span>
              <span className="m-pill" data-testid="pill-chime">
                {chimeLabel}
              </span>
              {status && (
                <span className="m-pill">{getFontMeta(dualZone ? 7 : status.font).label}</span>
              )}
              {currentMagicMatch?.matched ? (
                <span className="m-pill" data-testid="pill-magic-next">
                  Magic: {currentMagicMatch.digits} · {currentMagicMatch.label}
                </span>
              ) : nextInteresting ? (
                <span className="m-pill" data-testid="pill-magic-next">
                  Next Magic: {nextInteresting.formatted} ({nextInteresting.waitText})
                </span>
              ) : null}
            </div>
          </div>

          <LedMatrixPreview
            overrides={brightnessDirty ? { brightness: quickBrightness } : undefined}
          />
        </div>
      </section>

      <div className="two-col-grid">
        <section className="glass-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">
                <IonIcon icon={settingsOutline} aria-hidden="true" />
                Panel Brightness &amp; Display
              </h2>
              <p className="panel-subtitle">
                Preview changes live on the matrix; 0% blanks the P10 panel.
              </p>
            </div>
            <Link to="/display" style={{ textDecoration: 'none' }}>
              <IonButton size="small" fill="clear">
                Full Display
              </IonButton>
            </Link>
          </div>

          <div className="field-block" style={{ marginBottom: 14 }}>
            <label className="field-label" htmlFor="overview-brightness">
              <span>Panel brightness</span>
              <output data-testid="overview-brightness-val">{quickBrightness}%</output>
            </label>
            <input
              id="overview-brightness"
              className="m-range"
              type="range"
              min={0}
              max={100}
              value={quickBrightness}
              disabled={!status}
              onChange={(e) => {
                setDraggingBrightness(true);
                setQuickBrightness(Number(e.target.value));
              }}
              data-testid="overview-brightness-slider"
            />
          </div>

          <div className="btn-row" style={{ justifyContent: 'space-between' }}>
            <div className="btn-row">
              <span className="m-pill-surface accent">
                {dualZone ? 'Dual 2-Line' : is12hHero ? '12h Mode' : '24h Mode'}
              </span>
              <span className="m-pill-surface">
                Colon {status?.colon_blink ? 'Blinking' : 'Steady'}
              </span>
            </div>
            <IonButton
              size="small"
              disabled={!status || busy || !brightnessDirty}
              onClick={() => void handleApplyQuickBrightness()}
              data-testid="overview-brightness-save"
            >
              Apply Brightness
            </IonButton>
          </div>
        </section>

        <section className="glass-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">
                <IonIcon icon={timerOutline} aria-hidden="true" />
                Timers &amp; Panel Priority
              </h2>
              <p className="panel-subtitle">
                Running Stopwatch takes panel priority over Reminder and Clock.
              </p>
            </div>
            <Link to="/alarms" style={{ textDecoration: 'none' }}>
              <IonButton size="small" fill="clear">
                Open Timers
              </IonButton>
            </Link>
          </div>

          <div className="form-grid">
            <div className="surface-row" style={{ padding: 12 }}>
              <div className="field-label">
                <span>Stopwatch</span>
                <span>{TIMER_STATE_LABELS[status?.stopwatch_state ?? 0]}</span>
              </div>
              <div
                className="timer-readout"
                style={{ fontSize: '1.5rem', margin: '2px 0 6px' }}
                data-testid="overview-stopwatch-val"
              >
                {formatStopwatchMs(live.stopwatchMs)}
              </div>
              <div className="btn-row">
                {(status?.stopwatch_state === 0 || status?.stopwatch_state === 2) && (
                  <IonButton
                    size="small"
                    disabled={busy}
                    onClick={() =>
                      void controlTimer(
                        'stopwatch',
                        status.stopwatch_state === 2 ? 'resume' : 'start',
                      )
                    }
                  >
                    <IonIcon slot="start" icon={playOutline} />
                    {status.stopwatch_state === 2 ? 'Resume' : 'Start'}
                  </IonButton>
                )}
                {status?.stopwatch_state === 1 && (
                  <IonButton
                    size="small"
                    color="secondary"
                    disabled={busy}
                    onClick={() => void controlTimer('stopwatch', 'pause')}
                  >
                    <IonIcon slot="start" icon={pauseOutline} />
                    Pause
                  </IonButton>
                )}
                {status && status.stopwatch_state !== 0 && (
                  <IonButton
                    size="small"
                    fill="outline"
                    disabled={busy}
                    onClick={() => void controlTimer('stopwatch', 'stop')}
                  >
                    <IonIcon slot="start" icon={stopOutline} />
                    Reset
                  </IonButton>
                )}
              </div>
            </div>

            <div className="surface-row" style={{ padding: 12 }}>
              <div className="field-label">
                <span>Reminder</span>
                <span>{TIMER_STATE_LABELS[status?.reminder_state ?? 0]}</span>
              </div>
              <div
                className="timer-readout"
                style={{ fontSize: '1.5rem', margin: '2px 0 6px' }}
                data-testid="overview-reminder-val"
              >
                {formatReminderMs(live.reminderMs)}
              </div>
              <div className="btn-row">
                {status?.reminder_state === 0 && (
                  <IonButton
                    size="small"
                    disabled={busy || !status.buzzer_configured}
                    onClick={() => void controlTimer('reminder', 'start', 60)}
                  >
                    <IonIcon slot="start" icon={playOutline} />
                    Quick 1m
                  </IonButton>
                )}
                {status?.reminder_state === 2 && (
                  <IonButton
                    size="small"
                    disabled={busy}
                    onClick={() => void controlTimer('reminder', 'resume')}
                  >
                    <IonIcon slot="start" icon={playOutline} />
                    Resume
                  </IonButton>
                )}
                {status?.reminder_state === 1 && (
                  <IonButton
                    size="small"
                    color="secondary"
                    disabled={busy}
                    onClick={() => void controlTimer('reminder', 'pause')}
                  >
                    <IonIcon slot="start" icon={pauseOutline} />
                    Pause
                  </IonButton>
                )}
                {status && status.reminder_state !== 0 && (
                  <IonButton
                    size="small"
                    fill="outline"
                    disabled={busy}
                    onClick={() => void controlTimer('reminder', 'stop')}
                  >
                    <IonIcon slot="start" icon={stopOutline} />
                    Stop
                  </IonButton>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="glass-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <IonIcon icon={alarmOutline} aria-hidden="true" />
              Active Alarms
            </h2>
            <p className="panel-subtitle">
              Five NVS-backed slots synchronized to {status?.timezone_primary ?? 'primary zone'}.
            </p>
          </div>
          <div className="btn-row">
            {demoMode && (
              <IonButton
                size="small"
                fill="outline"
                color="warning"
                onClick={() => void triggerDemoAlarm(0)}
                data-testid="overview-test-alarm-btn"
              >
                <IonIcon slot="start" icon={flashOutline} />
                Test Alarm Ring
              </IonButton>
            )}
            <Link to="/alarms" style={{ textDecoration: 'none' }}>
              <IonButton size="small" fill="clear">
                Manage Alarms
              </IonButton>
            </Link>
          </div>
        </div>

        {enabledAlarms.length === 0 ? (
          <div className="hint-box" data-testid="overview-no-alarms">
            No alarms currently enabled. Open #alarms-timers to configure any of the 5 slots.
          </div>
        ) : (
          <div className="alarm-grid">
            {enabledAlarms.map(({ alarm, index }) => {
              const nextSec = live.alarmNextSeconds[index];
              return (
                <div key={index} className="surface-row active" style={{ padding: '12px 14px' }}>
                  <div className="surface-row-top">
                    <div>
                      <strong>Alarm {index + 1}</strong>
                      <div className="alarm-meta-row">
                        <span className="m-pill-surface accent">
                          {alarm.repeat === 1 ? 'Daily' : 'Once'}
                        </span>
                        <span className="m-pill-surface">{alarm.duration_seconds}s ring</span>
                        <span className="panel-subtitle" style={{ margin: 0 }}>
                          {nextSec !== null ? `in ${formatElapsed(nextSec)}` : 'Waiting for NTP sync'}
                        </span>
                      </div>
                    </div>
                    <div className="alarm-time-display">
                      {String(alarm.hour).padStart(2, '0')}:{String(alarm.minute).padStart(2, '0')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="glass-panel" data-testid="overview-magic-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <IonIcon icon={musicalNotesOutline} aria-hidden="true" />
              Interesting-Time Random Music
            </h2>
            <p className="panel-subtitle">
              Plays a random non-repeating melody on repdigits (11:11), sequences (12:34), and
              palindromes (12:21).
            </p>
          </div>
          <div className="btn-row">
            <IonButton
              size="small"
              fill="outline"
              disabled={busy || (demoMode && status !== null && !status.buzzer_configured)}
              onClick={() => void testMagicSound(-1)}
              data-testid="overview-magic-random-btn"
            >
              <IonIcon slot="start" icon={shuffleOutline} />
              Play Random
            </IonButton>
            {isMagicPlaying && (
              <IonButton
                size="small"
                color="danger"
                fill="outline"
                disabled={busy}
                onClick={() => void stopMagicSound()}
              >
                <IonIcon slot="start" icon={stopOutline} />
                Stop
              </IonButton>
            )}
            <Link to="/display" style={{ textDecoration: 'none' }}>
              <IonButton size="small" fill="clear">
                Jukebox &amp; Settings
              </IonButton>
            </Link>
          </div>
        </div>

        <div className="btn-row" style={{ marginBottom: demoMode ? 12 : 0 }}>
          <span className={`m-pill-surface ${status?.magic_enabled ? 'accent' : ''}`}>
            Auto Music: {status?.magic_enabled ? 'On' : 'Off'}
          </span>
          <span className="m-pill-surface">
            {status?.magic_pwm ? 'Passive PWM Notes' : 'Active Buzzer Rhythm'}
          </span>
          {currentMagicMatch?.matched ? (
            <span className="m-pill-surface accent">
              Current minute: {currentMagicMatch.digits} ({currentMagicMatch.label})
            </span>
          ) : nextInteresting ? (
            <span className="m-pill-surface">
              Next: {nextInteresting.formatted} · {nextInteresting.label} ({nextInteresting.waitText})
            </span>
          ) : null}
        </div>

        {demoMode && (
          <div>
            <div className="field-label" style={{ marginBottom: 6 }}>
              Simulate interesting time in Demo Mode
            </div>
            <div className="preset-chips" style={{ margin: 0 }}>
              {sampleMagicTimes.map((sample) => (
                <button
                  key={`${sample.hour24}-${sample.minute}`}
                  type="button"
                  className="chip-btn"
                  disabled={busy}
                  onClick={() => void simulateInterestingTime(sample.hour24, sample.minute)}
                  data-testid={`overview-sim-magic-${sample.hour24}-${sample.minute}`}
                >
                  {sample.formatted} · {sample.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <p className="app-footer-note">
        Momentra Clock Companion · Firmware v{status?.firmware_version ?? '—'} ·{' '}
        {demoMode ? 'Demo Simulator' : 'Local HTTP Control'}
      </p>
    </div>
  );
};
