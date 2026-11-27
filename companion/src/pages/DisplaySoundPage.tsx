import React, { useEffect, useState } from 'react';
import { IonButton, IonIcon, IonToggle } from '@ionic/react';
import {
  chevronForwardOutline,
  colorWandOutline,
  globeOutline,
  musicalNotesOutline,
  playOutline,
  refreshOutline,
  saveOutline,
  shuffleOutline,
  stopOutline,
  volumeHighOutline,
  volumeMuteOutline,
} from 'ionicons/icons';
import { LedMatrixPreview } from '../components/LedMatrixPreview';
import { RingingBanner } from '../components/RingingBanner';
import { TimezoneModal } from '../components/TimezoneModal';
import { useClock } from '../state/ClockContext';
import {
  type BinaryFlag,
  FONT_STYLES,
  type FontId,
  HOURLY_PATTERNS,
  type HourlyPatternId,
  SECONDS_ANIMATIONS,
  type SecondsAnimationId,
  fontSupportsAnimation,
  getFontMeta,
  normalizeFontId,
  validateSettingsPayload,
} from '../types/clock';
import { MAGIC_TRACKS, listSampleInterestingTimes } from '../types/magicMusic';

export const DisplaySoundPage: React.FC = () => {
  const {
    status,
    timezones,
    demoMode,
    busy,
    magicPlayback,
    magicSoundMuted,
    supportsMagicFirmware,
    setMagicSoundMuted,
    saveSettings,
    saveSecondaryTimezone,
    testMagicSound,
    stopMagicSound,
    simulateInterestingTime,
    showToast,
  } = useClock();

  const [brightness, setBrightness] = useState<number>(50);
  const [font, setFont] = useState<FontId>(0);
  const [format12h, setFormat12h] = useState<BinaryFlag>(0);
  const [timezonePrimary, setTimezonePrimary] = useState<string>('Asia/Kolkata');
  const [colonBlink, setColonBlink] = useState<BinaryFlag>(0);
  const [secondsAnimation, setSecondsAnimation] = useState<SecondsAnimationId>(0);
  const [hourlyEnabled, setHourlyEnabled] = useState<BinaryFlag>(0);
  const [hourlyPattern, setHourlyPattern] = useState<HourlyPatternId>(0);
  const [feedbackEnabled, setFeedbackEnabled] = useState<BinaryFlag>(1);
  const [magicEnabled, setMagicEnabled] = useState<BinaryFlag>(1);
  const [magicPwm, setMagicPwm] = useState<BinaryFlag>(0);
  const [settingsDirty, setSettingsDirty] = useState(false);

  const [simTimeInput, setSimTimeInput] = useState<string>('12:34');

  const [secondaryEnabled, setSecondaryEnabled] = useState<BinaryFlag>(0);
  const [timezoneSecondary, setTimezoneSecondary] = useState<string>('Etc/UTC');
  const [secondaryDirty, setSecondaryDirty] = useState(false);

  const [tzModalTarget, setTzModalTarget] = useState<'primary' | 'secondary' | null>(null);

  useEffect(() => {
    if (!status) return;
    if (!settingsDirty) {
      setBrightness(status.brightness);
      setFont(normalizeFontId(status.font));
      setFormat12h(status.format_12h);
      setTimezonePrimary(status.timezone_primary);
      setColonBlink(status.colon_blink);
      setSecondsAnimation(status.seconds_animation);
      setHourlyEnabled(status.hourly_enabled);
      setHourlyPattern(status.hourly_pattern);
      setFeedbackEnabled(status.feedback_enabled);
      setMagicEnabled(status.magic_enabled ?? 1);
      setMagicPwm(status.magic_pwm ?? 0);
    }
    if (!secondaryDirty) {
      setSecondaryEnabled(status.timezone_secondary_enabled);
      setTimezoneSecondary(status.timezone_secondary);
    }
  }, [status, settingsDirty, secondaryDirty]);

  const dualActive = status?.timezone_secondary_enabled === 1;
  const selectedFontMeta = getFontMeta(font);
  const animationAllowedByFont = fontSupportsAnimation(font);
  const animationDisabled = dualActive || !animationAllowedByFont;

  const handleResetDisplayDraft = () => {
    if (!status) return;
    setBrightness(status.brightness);
    setFont(normalizeFontId(status.font));
    setFormat12h(status.format_12h);
    setTimezonePrimary(status.timezone_primary);
    setColonBlink(status.colon_blink);
    setSecondsAnimation(status.seconds_animation);
    setHourlyEnabled(status.hourly_enabled);
    setHourlyPattern(status.hourly_pattern);
    setFeedbackEnabled(status.feedback_enabled);
    setMagicEnabled(status.magic_enabled ?? 1);
    setMagicPwm(status.magic_pwm ?? 0);
    setSettingsDirty(false);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!status) return;
    const payload = {
      brightness,
      font,
      format_12h: dualActive ? status.format_12h : format12h,
      hourly_enabled: hourlyEnabled,
      hourly_pattern: hourlyPattern,
      feedback_enabled: feedbackEnabled,
      colon_blink: colonBlink,
      seconds_animation: secondsAnimation,
      timezone_primary: timezonePrimary,
      magic_enabled: magicEnabled,
      magic_pwm: magicPwm,
    };
    const error = validateSettingsPayload(payload);
    if (error) {
      showToast(error, 'danger');
      return;
    }
    const ok = await saveSettings(payload);
    if (ok) setSettingsDirty(false);
  };

  const handleSaveSecondary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!status) return;
    const ok = await saveSecondaryTimezone({
      timezone_secondary: timezoneSecondary,
      timezone_secondary_enabled: secondaryEnabled,
    });
    if (ok) setSecondaryDirty(false);
  };

  return (
    <div className="page-shell">
      <RingingBanner />

      <section className="glass-panel" aria-label="Live display preview">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Live Panel Preview</h2>
            <p className="panel-subtitle">
              {settingsDirty
                ? 'Showing unsaved draft preview — save below to push to clock.'
                : 'Synced with current clock display configuration.'}
            </p>
          </div>
          {settingsDirty && (
            <IonButton size="small" fill="outline" onClick={handleResetDisplayDraft}>
              <IonIcon slot="start" icon={refreshOutline} />
              Discard Draft
            </IonButton>
          )}
        </div>

        <LedMatrixPreview
          surfaceMeta
          label="Draft Preview"
          overrides={{
            brightness,
            font,
            format_12h: dualActive ? 0 : format12h,
            colon_blink: colonBlink,
            seconds_animation: secondsAnimation,
            timezone_secondary_enabled: status?.timezone_secondary_enabled ?? 0,
          }}
        />
      </section>

      <div className="two-col-grid" style={{ alignItems: 'start' }}>
        <form
          className="glass-panel"
          onSubmit={(e) => void handleSaveSettings(e)}
          data-testid="display-settings-form"
        >
          <div className="panel-header">
            <div>
              <h2 className="panel-title">
                <IonIcon icon={colorWandOutline} aria-hidden="true" />
                Display &amp; Sound
              </h2>
              <p className="panel-subtitle">Hardware brightness, typography, chimes, and zone.</p>
            </div>
          </div>

          {dualActive && (
            <div className="hint-box warn" style={{ marginBottom: 14 }} data-testid="dual-lock-notice">
              Two-line display is active: <strong>Font</strong>, <strong>Time format</strong>, and{' '}
              <strong>Seconds animation</strong> are locked while both rows show 24-hour 5×7 time.
              Your saved preferences return when two-line mode is turned off.
            </div>
          )}

          <div className="form-grid">
            <div className="field-block form-full">
              <label className="field-label" htmlFor="display-brightness">
                <span>Brightness (0% blanks panel)</span>
                <output data-testid="display-brightness-output">{brightness}%</output>
              </label>
              <input
                id="display-brightness"
                className="m-range"
                type="range"
                min={0}
                max={100}
                value={brightness}
                disabled={!status}
                onChange={(e) => {
                  setBrightness(Number(e.target.value));
                  setSettingsDirty(true);
                }}
                data-testid="display-brightness-slider"
              />
            </div>

            <label className="field-block">
              <span className="field-label">Font style</span>
              <select
                className="m-select"
                disabled={!status || dualActive}
                value={font}
                onChange={(e) => {
                  setFont(Number(e.target.value) as FontId);
                  setSettingsDirty(true);
                }}
                data-testid="display-font-select"
              >
                {FONT_STYLES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label} {f.isTall ? '(Tall)' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-block">
              <span className="field-label">Time format</span>
              <select
                className="m-select"
                disabled={!status || dualActive}
                value={dualActive ? 0 : format12h}
                onChange={(e) => {
                  setFormat12h(Number(e.target.value) as BinaryFlag);
                  setSettingsDirty(true);
                }}
                data-testid="display-format-select"
              >
                <option value={0}>24 hour</option>
                <option value={1}>12 hour (no AM/PM on LED)</option>
              </select>
            </label>

            <div className="field-block form-full">
              <span className="field-label">Primary timezone (Alarms &amp; Chimes)</span>
              <button
                type="button"
                className="m-select-btn"
                disabled={!status}
                onClick={() => setTzModalTarget('primary')}
                data-testid="primary-timezone-btn"
              >
                <span>{timezonePrimary}</span>
                <IonIcon icon={chevronForwardOutline} />
              </button>
            </div>

            <label className="field-block">
              <span className="field-label">Blink colon</span>
              <select
                className="m-select"
                disabled={!status}
                value={colonBlink}
                onChange={(e) => {
                  setColonBlink(Number(e.target.value) as BinaryFlag);
                  setSettingsDirty(true);
                }}
                data-testid="display-colon-select"
              >
                <option value={0}>Off</option>
                <option value={1}>On</option>
              </select>
            </label>

            <label className="field-block">
              <span className="field-label">Seconds animation</span>
              <select
                className="m-select"
                disabled={!status || animationDisabled}
                value={secondsAnimation}
                onChange={(e) => {
                  setSecondsAnimation(Number(e.target.value) as SecondsAnimationId);
                  setSettingsDirty(true);
                }}
                data-testid="display-animation-select"
              >
                {SECONDS_ANIMATIONS.map((anim) => (
                  <option key={anim.id} value={anim.id}>
                    {anim.label}
                  </option>
                ))}
              </select>
            </label>

            {!dualActive && !animationAllowedByFont && (
              <div className="hint-box form-full" data-testid="tall-font-anim-note">
                <strong>{selectedFontMeta.label}</strong> is a tall font ({selectedFontMeta.glyphHeight}px
                high), leaving no bottom row for seconds animations. Choose a shorter font (Style 1,
                Small indoor, Wide, or Bold compact) to enable animations.
              </div>
            )}

            <label className="field-block">
              <span className="field-label">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <IonIcon icon={volumeHighOutline} aria-hidden="true" />
                  Hourly chime
                </span>
              </span>
              <select
                className="m-select"
                disabled={!status}
                value={hourlyEnabled}
                onChange={(e) => {
                  setHourlyEnabled(Number(e.target.value) as BinaryFlag);
                  setSettingsDirty(true);
                }}
                data-testid="display-hourly-select"
              >
                <option value={0}>Off</option>
                <option value={1}>On</option>
              </select>
            </label>

            <label className="field-block">
              <span className="field-label">Chime pattern</span>
              <select
                className="m-select"
                disabled={!status}
                value={hourlyPattern}
                onChange={(e) => {
                  setHourlyPattern(Number(e.target.value) as HourlyPatternId);
                  setSettingsDirty(true);
                }}
                data-testid="display-pattern-select"
              >
                {HOURLY_PATTERNS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} — {p.description}
                  </option>
                ))}
              </select>
            </label>

            <div className="toggle-row form-full">
              <div>
                <strong style={{ fontSize: 14 }}>Button sound feedback</strong>
                <div className="panel-subtitle" style={{ marginTop: 2 }}>
                  Confirmation beeps on hardware buttons (does not mute alarms).
                </div>
              </div>
              <IonToggle
                checked={feedbackEnabled === 1}
                disabled={!status}
                aria-label="Button sound feedback"
                onIonChange={(e) => {
                  setFeedbackEnabled(e.detail.checked ? 1 : 0);
                  setSettingsDirty(true);
                }}
                data-testid="display-feedback-toggle"
              />
            </div>

            <div className="toggle-row form-full">
              <div>
                <strong style={{ fontSize: 14 }}>Interesting-time random music</strong>
                <div className="panel-subtitle" style={{ marginTop: 2 }}>
                  Plays 1 of 8 non-repeating melodies on repdigits (11:11), sequences (12:34), and
                  palindromes (12:21).
                </div>
              </div>
              <IonToggle
                checked={magicEnabled === 1}
                disabled={!status}
                aria-label="Interesting-time random music"
                onIonChange={(e) => {
                  setMagicEnabled(e.detail.checked ? 1 : 0);
                  setSettingsDirty(true);
                }}
                data-testid="display-magic-toggle"
              />
            </div>

            <label className="field-block form-full">
              <span className="field-label">Magic melody buzzer mode</span>
              <select
                className="m-select"
                disabled={!status}
                value={magicPwm}
                onChange={(e) => {
                  setMagicPwm(Number(e.target.value) as BinaryFlag);
                  setSettingsDirty(true);
                }}
                data-testid="display-magic-pwm-select"
              >
                <option value={0}>Active buzzer (100ms rhythm pattern)</option>
                <option value={1}>Passive buzzer PWM (pitched musical notes)</option>
              </select>
            </label>
          </div>

          <div style={{ marginTop: 16 }}>
            <IonButton
              type="submit"
              expand="block"
              disabled={!status || busy}
              data-testid="display-save-btn"
            >
              <IonIcon slot="start" icon={saveOutline} />
              Save Display &amp; Sound
            </IonButton>
          </div>
        </form>

        <form
          className="glass-panel"
          onSubmit={(e) => void handleSaveSecondary(e)}
          data-testid="secondary-timezone-form"
        >
          <div className="panel-header">
            <div>
              <h2 className="panel-title">
                <IonIcon icon={globeOutline} aria-hidden="true" />
                Second Timezone
              </h2>
              <p className="panel-subtitle">
                Show two times stacked on the 32×16 panel: primary above, second below.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <div className="toggle-row form-full">
              <div>
                <strong style={{ fontSize: 14 }}>Two-line display</strong>
                <div className="panel-subtitle" style={{ marginTop: 2 }}>
                  Enables dual-timezone 5×7 rendering.
                </div>
              </div>
              <IonToggle
                checked={secondaryEnabled === 1}
                disabled={!status}
                aria-label="Two-line display"
                onIonChange={(e) => {
                  setSecondaryEnabled(e.detail.checked ? 1 : 0);
                  setSecondaryDirty(true);
                }}
                data-testid="dual-zone-toggle"
              />
            </div>

            <div className="field-block form-full">
              <span className="field-label">Second timezone</span>
              <button
                type="button"
                className="m-select-btn"
                disabled={!status}
                onClick={() => setTzModalTarget('secondary')}
                data-testid="secondary-timezone-btn"
              >
                <span>{timezoneSecondary}</span>
                <IonIcon icon={chevronForwardOutline} />
              </button>
            </div>
          </div>

          <div className="hint-box" style={{ marginTop: 14 }}>
            Both rows use 24-hour time and the 5×7 font without labels or AM/PM markers. Font,
            time format, and seconds animation settings return automatically when two-line display
            is turned off. Bundled IANA tzdb 2026f covers 1970–2100.
          </div>

          <div style={{ marginTop: 16 }}>
            <IonButton
              type="submit"
              expand="block"
              color="primary"
              disabled={!status || busy}
              data-testid="secondary-tz-save-btn"
            >
              <IonIcon slot="start" icon={saveOutline} />
              Save Second Timezone
            </IonButton>
          </div>
        </form>
      </div>

      {/* Interesting-Time Music Jukebox & Simulator */}
      <section className="glass-panel" data-testid="magic-jukebox-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <IonIcon icon={musicalNotesOutline} aria-hidden="true" />
              Interesting-Time Music Jukebox
            </h2>
            <p className="panel-subtitle">
              Audition 8 Beethoven &amp; Indian Classical tracks (5–8s each ·{' '}
              {magicPwm === 1 ? 'Passive PWM Pitched Notes' : 'Active Buzzer Rhythm'}).
            </p>
          </div>
          <div className="btn-row">
            <IonButton
              size="small"
              fill="outline"
              onClick={() => setMagicSoundMuted(!magicSoundMuted)}
              data-testid="jukebox-mute-btn"
            >
              <IonIcon slot="start" icon={magicSoundMuted ? volumeMuteOutline : volumeHighOutline} />
              {magicSoundMuted ? 'Unmute Browser' : 'Mute Browser'}
            </IonButton>
            <IonButton
              size="small"
              disabled={busy || (demoMode && status !== null && !status.buzzer_configured)}
              onClick={() => void testMagicSound(-1, magicPwm === 1)}
              data-testid="jukebox-random-btn"
            >
              <IonIcon slot="start" icon={shuffleOutline} />
              Play Random
            </IonButton>
            {(status?.magic_playing || magicPlayback.playing) && (
              <IonButton
                size="small"
                color="danger"
                fill="outline"
                disabled={busy}
                onClick={() => void stopMagicSound()}
                data-testid="jukebox-stop-btn"
              >
                <IonIcon slot="start" icon={stopOutline} />
                Stop
              </IonButton>
            )}
          </div>
        </div>

        {!demoMode && !supportsMagicFirmware && (
          <div className="hint-box warn" style={{ marginBottom: 14 }} data-testid="jukebox-firmware-hint">
            Connected device firmware does not expose <code>/api/sound/test</code> or{' '}
            <code>magic_enabled</code> yet. Clicking <strong>Play</strong> auditions tracks in
            your browser; flash the updated build from <code>firmware/main/</code> via{' '}
            <strong>#usb-flasher</strong> to enable on-device playback.
          </div>
        )}

        {supportsMagicFirmware && magicPwm === 0 && (
          <div className="hint-box" style={{ marginBottom: 14 }}>
            Active buzzers have a single fixed pitch, so tracks differ by rhythm. If your board uses
            a passive piezo buzzer, switch <strong>Magic melody buzzer mode</strong> above to{' '}
            <strong>Passive buzzer PWM</strong> to hear pitched Beethoven &amp; Raga notes.
          </div>
        )}

        <div className="two-col-grid" style={{ marginBottom: demoMode ? 16 : 0 }}>
          {MAGIC_TRACKS.map((track) => {
            const isActive =
              (magicPlayback.playing && magicPlayback.trackId === track.id) ||
              (Boolean(status?.magic_playing) && status?.magic_track === track.id);
            return (
              <div
                key={track.id}
                className={`surface-row ${isActive ? 'active' : ''}`}
                style={{ padding: '12px 14px' }}
                data-testid={`magic-track-${track.id}`}
              >
                <div className="surface-row-top">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong>
                        {track.id + 1}. {track.name}
                      </strong>
                      {isActive && <span className="m-pill-surface accent">Playing</span>}
                    </div>
                    <div className="panel-subtitle">
                      {track.mood} · {(track.durationMs / 1000).toFixed(1)}s · {track.notes.length}{' '}
                      notes
                    </div>
                  </div>
                  <IonButton
                    size="small"
                    fill={isActive ? 'solid' : 'outline'}
                    color={isActive ? 'danger' : 'primary'}
                    disabled={
                      busy ||
                      (!isActive && demoMode && status !== null && !status.buzzer_configured)
                    }
                    onClick={() =>
                      isActive
                        ? void stopMagicSound()
                        : void testMagicSound(track.id, magicPwm === 1)
                    }
                    data-testid={`magic-play-${track.id}`}
                  >
                    <IonIcon slot="start" icon={isActive ? stopOutline : playOutline} />
                    {isActive ? 'Stop' : 'Play'}
                  </IonButton>
                </div>
              </div>
            );
          })}
        </div>

        {demoMode && (
          <div className="surface-row" data-testid="magic-demo-sim-box">
            <div className="panel-header" style={{ marginBottom: 4 }}>
              <div>
                <strong style={{ fontSize: 14 }}>Simulate Interesting Time</strong>
                <div className="panel-subtitle">
                  Jump the Demo Simulator clock to an interesting minute and trigger random music.
                </div>
              </div>
            </div>

            <div className="preset-chips" style={{ margin: '4px 0 8px' }}>
              {listSampleInterestingTimes(
                (dualActive ? 0 : format12h) === 1,
              ).map((sample) => (
                <button
                  key={`${sample.hour24}-${sample.minute}`}
                  type="button"
                  className="chip-btn"
                  disabled={busy}
                  onClick={() => void simulateInterestingTime(sample.hour24, sample.minute)}
                  data-testid={`jukebox-sim-${sample.hour24}-${sample.minute}`}
                >
                  {sample.formatted} · {sample.label}
                </button>
              ))}
            </div>

            <div className="btn-row">
              <input
                className="m-input"
                type="time"
                aria-label="Custom time to simulate"
                style={{ width: 140 }}
                value={simTimeInput}
                onChange={(e) => setSimTimeInput(e.target.value)}
                data-testid="jukebox-sim-time-input"
              />
              <IonButton
                size="small"
                fill="outline"
                disabled={busy}
                onClick={() => {
                  const [hStr, mStr] = simTimeInput.split(':');
                  const h = Number(hStr);
                  const m = Number(mStr);
                  if (Number.isInteger(h) && Number.isInteger(m)) {
                    void simulateInterestingTime(h, m);
                  }
                }}
                data-testid="jukebox-sim-time-btn"
              >
                Jump &amp; Test Minute
              </IonButton>
            </div>
          </div>
        )}
      </section>

      <TimezoneModal
        isOpen={tzModalTarget !== null}
        title={tzModalTarget === 'secondary' ? 'Select Second Timezone' : 'Select Primary Timezone'}
        selectedZone={tzModalTarget === 'secondary' ? timezoneSecondary : timezonePrimary}
        zones={timezones}
        onSelect={(zone) => {
          if (tzModalTarget === 'secondary') {
            setTimezoneSecondary(zone);
            setSecondaryDirty(true);
          } else if (tzModalTarget === 'primary') {
            setTimezonePrimary(zone);
            setSettingsDirty(true);
          }
        }}
        onDismiss={() => setTzModalTarget(null)}
      />
    </div>
  );
};
