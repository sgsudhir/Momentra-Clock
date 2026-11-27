import React from 'react';
import { IonButton, IonIcon } from '@ionic/react';
import {
  alarmOutline,
  musicalNotesOutline,
  notificationsOffOutline,
  stopOutline,
  volumeHighOutline,
  volumeMuteOutline,
  warningOutline,
} from 'ionicons/icons';
import { useClock } from '../state/ClockContext';
import { MAGIC_TRACKS } from '../types/magicMusic';

export const RingingBanner: React.FC = () => {
  const {
    status,
    busy,
    magicPlayback,
    magicSoundMuted,
    setMagicSoundMuted,
    stopAlarm,
    stopMagicSound,
    controlTimer,
    connectionStatus,
    connectionError,
    refresh,
  } = useClock();

  const ringingSlots =
    status?.alarms
      .map((_, index) => index + 1)
      .filter((slot) => ((status.ringing_mask ?? 0) & (1 << (slot - 1))) !== 0) ?? [];

  const isAlarmRinging = Boolean(status?.ringing);
  const isReminderRinging = status?.reminder_state === 3;
  const activeTrackId =
    magicPlayback.playing && magicPlayback.trackId !== null
      ? magicPlayback.trackId
      : status?.magic_playing && status.magic_track >= 0
        ? status.magic_track
        : null;
  const activeTrack =
    activeTrackId !== null ? MAGIC_TRACKS.find((t) => t.id === activeTrackId) ?? null : null;
  const isMagicPlaying = Boolean(status?.magic_playing) || magicPlayback.playing;

  return (
    <>
      {isAlarmRinging && (
        <section
          className="ringing-banner"
          role="alert"
          aria-live="assertive"
          data-testid="alarm-ringing-banner"
        >
          <div className="ringing-banner-text">
            <strong>
              <IonIcon icon={alarmOutline} aria-hidden="true" />
              Alarm is ringing
            </strong>
            <span>
              {ringingSlots.length > 0
                ? `Ringing: ${ringingSlots.map((slot) => `Alarm ${slot}`).join(', ')}`
                : 'Your alarm or hourly chime is active.'}
            </span>
          </div>
          <IonButton
            color="danger"
            fill="solid"
            disabled={busy}
            onClick={() => void stopAlarm()}
            data-testid="stop-alarm-btn"
          >
            <IonIcon slot="start" icon={notificationsOffOutline} />
            Stop alarm
          </IonButton>
        </section>
      )}

      {isReminderRinging && (
        <section
          className="ringing-banner"
          role="alert"
          aria-live="assertive"
          data-testid="reminder-ringing-banner"
        >
          <div className="ringing-banner-text">
            <strong>
              <IonIcon icon={alarmOutline} aria-hidden="true" />
              Reminder is ringing
            </strong>
            <span>Stops automatically after 15 seconds.</span>
          </div>
          <IonButton
            color="danger"
            fill="solid"
            disabled={busy}
            onClick={() => void controlTimer('reminder', 'stop')}
            data-testid="stop-reminder-btn"
          >
            <IonIcon slot="start" icon={notificationsOffOutline} />
            Stop reminder
          </IonButton>
        </section>
      )}

      {isMagicPlaying && (
        <section
          className="sim-strip"
          role="status"
          aria-live="polite"
          data-testid="magic-playing-banner"
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <IonIcon icon={musicalNotesOutline} style={{ color: 'var(--m-accent)', fontSize: 18 }} />
            <strong>
              {activeTrack ? `${activeTrack.name} (${activeTrack.mood})` : 'Magic Time Melody'}
            </strong>
            <span>
              {status?.magic_pwm === 1
                ? magicPlayback.freqHz > 0
                  ? `Passive PWM · ${magicPlayback.freqHz} Hz`
                  : 'Passive PWM'
                : 'Active buzzer rhythm'}
            </span>
          </span>
          <div className="btn-row">
            <IonButton
              size="small"
              fill="outline"
              color="primary"
              onClick={() => setMagicSoundMuted(!magicSoundMuted)}
              data-testid="magic-banner-mute-btn"
            >
              <IonIcon slot="start" icon={magicSoundMuted ? volumeMuteOutline : volumeHighOutline} />
              {magicSoundMuted ? 'Unmute Browser' : 'Mute Browser'}
            </IonButton>
            <IonButton
              size="small"
              color="primary"
              disabled={busy}
              onClick={() => void stopMagicSound()}
              data-testid="stop-magic-btn"
            >
              <IonIcon slot="start" icon={stopOutline} />
              Stop Music
            </IonButton>
          </div>
        </section>
      )}

      {connectionStatus === 'disconnected' && (
        <div className="warning-strip" role="status" data-testid="connection-warning">
          <span>
            <IonIcon icon={warningOutline} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            {connectionError
              ? `Cannot reach clock: ${connectionError}`
              : 'Clock unreachable. Shown information may be out of date.'}
          </span>
          <IonButton size="small" fill="outline" color="warning" onClick={() => void refresh()}>
            Retry
          </IonButton>
        </div>
      )}
    </>
  );
};
