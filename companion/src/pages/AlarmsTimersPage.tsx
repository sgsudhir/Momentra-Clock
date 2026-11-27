import React, { useEffect, useState } from 'react';
import { IonButton, IonIcon, IonToggle } from '@ionic/react';
import {
  alarmOutline,
  createOutline,
  flashOutline,
  pauseOutline,
  playOutline,
  saveOutline,
  stopOutline,
  timerOutline,
} from 'ionicons/icons';
import { RingingBanner } from '../components/RingingBanner';
import { useClock } from '../state/ClockContext';
import {
  ALARM_DURATION_OPTIONS,
  type AlarmRepeat,
  type AlarmSlot,
  type BinaryFlag,
  STOPWATCH_MAX_MS,
  TIMER_STATE_LABELS,
  formatElapsed,
  formatReminderMs,
  formatStopwatchMs,
  validateAlarmPayload,
  validateReminderSeconds,
} from '../types/clock';

const REMINDER_PRESETS = [
  { label: '1m', hours: 0, minutes: 1, seconds: 0 },
  { label: '5m', hours: 0, minutes: 5, seconds: 0 },
  { label: '15m', hours: 0, minutes: 15, seconds: 0 },
  { label: '25m', hours: 0, minutes: 25, seconds: 0 },
] as const;

export const AlarmsTimersPage: React.FC = () => {
  const {
    status,
    live,
    demoMode,
    busy,
    saveAlarm,
    controlTimer,
    triggerDemoAlarm,
    showToast,
  } = useClock();

  const [editingIndex, setEditingIndex] = useState<number>(0);
  const [alarmDirty, setAlarmDirty] = useState<boolean>(false);
  const [draftAlarm, setDraftAlarm] = useState<AlarmSlot>({
    enabled: 0,
    hour: 7,
    minute: 0,
    repeat: 1,
    duration_seconds: 30,
  });

  const [remHours, setRemHours] = useState<number>(0);
  const [remMinutes, setRemMinutes] = useState<number>(1);
  const [remSeconds, setRemSeconds] = useState<number>(0);

  const selectSlotForEdit = (nextIndex: number) => {
    setEditingIndex(nextIndex);
    setAlarmDirty(false);
    const slot = status?.alarms[nextIndex];
    if (slot) {
      setDraftAlarm({ ...slot });
    }
  };

  useEffect(() => {
    if (alarmDirty) return;
    const slot = status?.alarms[editingIndex];
    if (slot) {
      setDraftAlarm({ ...slot });
    }
  }, [editingIndex, status, alarmDirty]);

  const updateDraftAlarm = (updater: (prev: AlarmSlot) => AlarmSlot) => {
    setDraftAlarm(updater);
    setAlarmDirty(true);
  };

  const handleToggleAlarm = async (index: number, nextEnabled: boolean) => {
    const current = status?.alarms[index];
    if (!current) return;
    await saveAlarm({
      index,
      enabled: nextEnabled ? 1 : 0,
      hour: current.hour,
      minute: current.minute,
      repeat: current.repeat,
      duration_seconds: current.duration_seconds,
    });
  };

  const handleSaveDraftAlarm = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { index: editingIndex, ...draftAlarm };
    const error = validateAlarmPayload(payload);
    if (error) {
      showToast(error, 'danger');
      return;
    }
    const ok = await saveAlarm(payload);
    if (ok) {
      setAlarmDirty(false);
    }
  };

  const handleReminderStartOrResume = async () => {
    if (!status) return;
    if (status.reminder_state === 2) {
      await controlTimer('reminder', 'resume');
      return;
    }
    const totalSeconds = remHours * 3600 + remMinutes * 60 + remSeconds;
    const err = validateReminderSeconds(totalSeconds);
    if (err) {
      showToast(err, 'danger');
      return;
    }
    await controlTimer('reminder', 'start', totalSeconds);
  };

  const durationOptions = React.useMemo(() => {
    const list = [...ALARM_DURATION_OPTIONS];
    if (!list.includes(draftAlarm.duration_seconds)) {
      list.push(draftAlarm.duration_seconds);
      list.sort((a, b) => a - b);
    }
    return list;
  }, [draftAlarm.duration_seconds]);

  const swState = status?.stopwatch_state ?? 0;
  const remState = status?.reminder_state ?? 0;
  const swAtMaxPaused = swState === 2 && (status?.stopwatch_ms ?? 0) >= STOPWATCH_MAX_MS;
  const currentReminderTotalSec = remHours * 3600 + remMinutes * 60 + remSeconds;

  return (
    <div className="page-shell">
      <RingingBanner />

      <section className="glass-panel" aria-label="Alarms">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <IonIcon icon={alarmOutline} aria-hidden="true" />
              Alarms (5 Slots)
            </h2>
            <p className="panel-subtitle">
              Stored in NVS flash across reboots. One-shot alarms auto-disable before ringing.
            </p>
          </div>
          {demoMode && (
            <IonButton
              size="small"
              color="warning"
              fill="outline"
              onClick={() => void triggerDemoAlarm(editingIndex)}
              data-testid="demo-ring-alarm-btn"
            >
              <IonIcon slot="start" icon={flashOutline} />
              Test Alarm Ring
            </IonButton>
          )}
        </div>

        <div className="two-col-grid" style={{ alignItems: 'start' }}>
          <div className="alarm-grid">
            {(status?.alarms ?? []).map((alarm, index) => {
              const isRinging =
                Boolean(status?.ringing) && (((status?.ringing_mask ?? 0) & (1 << index)) !== 0);
              const isEditing = editingIndex === index;
              const nextSec = live.alarmNextSeconds[index];

              return (
                <div
                  key={index}
                  className={`surface-row ${alarm.enabled ? 'active' : ''} ${
                    isRinging ? 'ringing' : ''
                  }`}
                  style={isEditing ? { borderColor: 'var(--m-accent)' } : undefined}
                  data-testid={`alarm-card-${index}`}
                >
                  <div className="surface-row-top">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong>Alarm {index + 1}</strong>
                        {isEditing && <span className="m-pill-surface accent">Editing</span>}
                      </div>
                      <div className="alarm-time-display">
                        {String(alarm.hour).padStart(2, '0')}:
                        {String(alarm.minute).padStart(2, '0')}
                      </div>
                      <div className="alarm-meta-row">
                        <span className="m-pill-surface">
                          {alarm.repeat === 1 ? 'Daily' : 'Once'}
                        </span>
                        <span className="m-pill-surface">{alarm.duration_seconds}s</span>
                        {alarm.enabled === 1 && (
                          <span className="panel-subtitle" style={{ margin: 0 }}>
                            {nextSec !== null ? `in ${formatElapsed(nextSec)}` : 'Needs NTP'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: 8,
                      }}
                    >
                      <IonToggle
                        checked={alarm.enabled === 1}
                        disabled={busy}
                        aria-label={`Toggle Alarm ${index + 1}`}
                        onIonChange={(e) => {
                          const checked = e.detail.checked;
                          if ((checked ? 1 : 0) !== alarm.enabled) {
                            void handleToggleAlarm(index, checked);
                          }
                        }}
                        data-testid={`alarm-toggle-${index}`}
                      />
                      <IonButton
                        size="small"
                        fill={isEditing ? 'solid' : 'outline'}
                        onClick={() => selectSlotForEdit(index)}
                        data-testid={`alarm-edit-${index}`}
                      >
                        <IonIcon slot="start" icon={createOutline} />
                        Edit
                      </IonButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <form
            className="surface-row"
            onSubmit={(e) => void handleSaveDraftAlarm(e)}
            data-testid="alarm-editor-form"
          >
            <div className="panel-header" style={{ marginBottom: 6 }}>
              <div>
                <h3 className="panel-title" style={{ fontSize: 15 }}>
                  Edit Alarm {editingIndex + 1}
                  {alarmDirty && <span className="m-pill-surface accent">Unsaved</span>}
                </h3>
                <p className="panel-subtitle">Configure slot #{editingIndex + 1} schedule</p>
              </div>
              <select
                className="m-select"
                style={{ width: 'auto', minHeight: 36 }}
                aria-label="Alarm slot"
                value={editingIndex}
                onChange={(e) => selectSlotForEdit(Number(e.target.value))}
                data-testid="alarm-slot-select"
              >
                {[0, 1, 2, 3, 4].map((idx) => (
                  <option key={idx} value={idx}>
                    Alarm {idx + 1}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-grid">
              <label className="field-block">
                <span className="field-label">Status</span>
                <select
                  className="m-select"
                  value={draftAlarm.enabled}
                  onChange={(e) =>
                    updateDraftAlarm((prev) => ({
                      ...prev,
                      enabled: Number(e.target.value) as BinaryFlag,
                    }))
                  }
                  data-testid="alarm-enabled-select"
                >
                  <option value={0}>Off</option>
                  <option value={1}>On</option>
                </select>
              </label>

              <label className="field-block">
                <span className="field-label">Quick time picker</span>
                <input
                  className="m-input"
                  type="time"
                  value={`${String(draftAlarm.hour).padStart(2, '0')}:${String(
                    draftAlarm.minute,
                  ).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [hStr, mStr] = e.target.value.split(':');
                    const h = Number(hStr);
                    const m = Number(mStr);
                    if (Number.isInteger(h) && Number.isInteger(m)) {
                      updateDraftAlarm((prev) => ({ ...prev, hour: h, minute: m }));
                    }
                  }}
                  data-testid="alarm-time-input"
                />
              </label>

              <label className="field-block">
                <span className="field-label">Hour (0–23)</span>
                <input
                  className="m-input"
                  type="number"
                  min={0}
                  max={23}
                  required
                  value={draftAlarm.hour}
                  onChange={(e) =>
                    updateDraftAlarm((prev) => ({
                      ...prev,
                      hour: Math.max(0, Math.min(23, Number(e.target.value) || 0)),
                    }))
                  }
                  data-testid="alarm-hour-input"
                />
              </label>

              <label className="field-block">
                <span className="field-label">Minute (0–59)</span>
                <input
                  className="m-input"
                  type="number"
                  min={0}
                  max={59}
                  required
                  value={draftAlarm.minute}
                  onChange={(e) =>
                    updateDraftAlarm((prev) => ({
                      ...prev,
                      minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)),
                    }))
                  }
                  data-testid="alarm-minute-input"
                />
              </label>

              <label className="field-block">
                <span className="field-label">Repeat</span>
                <select
                  className="m-select"
                  value={draftAlarm.repeat}
                  onChange={(e) =>
                    updateDraftAlarm((prev) => ({
                      ...prev,
                      repeat: Number(e.target.value) as AlarmRepeat,
                    }))
                  }
                  data-testid="alarm-repeat-select"
                >
                  <option value={0}>Once</option>
                  <option value={1}>Daily</option>
                </select>
              </label>

              <label className="field-block">
                <span className="field-label">Ring duration</span>
                <select
                  className="m-select"
                  value={draftAlarm.duration_seconds}
                  onChange={(e) =>
                    updateDraftAlarm((prev) => ({
                      ...prev,
                      duration_seconds: Number(e.target.value),
                    }))
                  }
                  data-testid="alarm-duration-select"
                >
                  {durationOptions.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec} seconds{!ALARM_DURATION_OPTIONS.includes(sec) ? ' (saved)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {!status?.buzzer_configured && (
              <div className="hint-box warn">
                Buzzer is not configured on this device; alarms will not sound.
              </div>
            )}

            <IonButton
              type="submit"
              expand="block"
              disabled={busy || !status}
              data-testid="alarm-save-btn"
            >
              <IonIcon slot="start" icon={saveOutline} />
              Save Alarm {editingIndex + 1}
            </IonButton>
          </form>
        </div>
      </section>

      <div className="two-col-grid">
        <section className="glass-panel" aria-label="Stopwatch">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">
                <IonIcon icon={timerOutline} aria-hidden="true" />
                Stopwatch
              </h2>
              <p className="panel-subtitle">
                Shown on the P10 panel while running. Auto-pauses at 99:59.99.
              </p>
            </div>
            <span className="m-pill-surface accent" data-testid="stopwatch-state-badge">
              {TIMER_STATE_LABELS[swState] ?? 'Stopped'}
            </span>
          </div>

          <div className="timer-readout" data-testid="stopwatch-readout">
            {formatStopwatchMs(live.stopwatchMs)}
          </div>

          <div className="btn-row" style={{ marginTop: 14 }}>
            <IonButton
              disabled={busy || !status || !(swState === 0 || swState === 2) || swAtMaxPaused}
              onClick={() => void controlTimer('stopwatch', swState === 2 ? 'resume' : 'start')}
              data-testid="stopwatch-start-btn"
            >
              <IonIcon slot="start" icon={playOutline} />
              {swState === 2 ? 'Resume' : 'Start'}
            </IonButton>

            <IonButton
              color="secondary"
              disabled={busy || !status || swState !== 1}
              onClick={() => void controlTimer('stopwatch', 'pause')}
              data-testid="stopwatch-pause-btn"
            >
              <IonIcon slot="start" icon={pauseOutline} />
              Pause
            </IonButton>

            <IonButton
              fill="outline"
              disabled={busy || !status || swState === 0}
              onClick={() => void controlTimer('stopwatch', 'stop')}
              data-testid="stopwatch-stop-btn"
            >
              <IonIcon slot="start" icon={stopOutline} />
              Stop &amp; reset
            </IonButton>
          </div>
        </section>

        <section className="glass-panel" aria-label="Reminder">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">
                <IonIcon icon={timerOutline} aria-hidden="true" />
                Reminder Countdown
              </h2>
              <p className="panel-subtitle">
                1 second to 24 hours; cleared on reboot. Rings for up to 15 seconds.
              </p>
            </div>
            <span className="m-pill-surface accent" data-testid="reminder-state-badge">
              {TIMER_STATE_LABELS[remState] ?? 'Stopped'}
            </span>
          </div>

          <div className="timer-readout" data-testid="reminder-readout">
            {formatReminderMs(live.reminderMs)}
          </div>

          <div className="preset-chips" aria-label="Reminder presets">
            {REMINDER_PRESETS.map((preset) => {
              const presetTotal = preset.hours * 3600 + preset.minutes * 60 + preset.seconds;
              const active = currentReminderTotalSec === presetTotal;
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`chip-btn ${active ? 'active' : ''}`}
                  disabled={remState !== 0}
                  onClick={() => {
                    setRemHours(preset.hours);
                    setRemMinutes(preset.minutes);
                    setRemSeconds(preset.seconds);
                  }}
                  data-testid={`reminder-preset-${preset.label}`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div
            className="form-grid"
            style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 14 }}
          >
            <label className="field-block">
              <span className="field-label">Hours</span>
              <select
                className="m-select"
                disabled={remState !== 0}
                value={remHours}
                onChange={(e) => setRemHours(Number(e.target.value))}
                data-testid="reminder-hours-select"
              >
                {Array.from({ length: 25 }, (_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-block">
              <span className="field-label">Minutes</span>
              <select
                className="m-select"
                disabled={remState !== 0}
                value={remMinutes}
                onChange={(e) => setRemMinutes(Number(e.target.value))}
                data-testid="reminder-minutes-select"
              >
                {Array.from({ length: 60 }, (_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-block">
              <span className="field-label">Seconds</span>
              <select
                className="m-select"
                disabled={remState !== 0}
                value={remSeconds}
                onChange={(e) => setRemSeconds(Number(e.target.value))}
                data-testid="reminder-seconds-select"
              >
                {Array.from({ length: 60 }, (_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {status && !status.buzzer_configured && (
            <div className="hint-box warn" style={{ marginBottom: 12 }}>
              Buzzer is not configured; starting a reminder will return 409 Conflict.
            </div>
          )}

          <div className="btn-row">
            <IonButton
              disabled={busy || !status || !(remState === 0 || remState === 2)}
              onClick={() => void handleReminderStartOrResume()}
              data-testid="reminder-start-btn"
            >
              <IonIcon slot="start" icon={playOutline} />
              {remState === 2 ? 'Resume' : 'Start'}
            </IonButton>

            <IonButton
              color="secondary"
              disabled={busy || !status || remState !== 1}
              onClick={() => void controlTimer('reminder', 'pause')}
              data-testid="reminder-pause-btn"
            >
              <IonIcon slot="start" icon={pauseOutline} />
              Pause
            </IonButton>

            <IonButton
              fill="outline"
              disabled={busy || !status || remState === 0}
              onClick={() => void controlTimer('reminder', 'stop')}
              data-testid="reminder-stop-btn"
            >
              <IonIcon slot="start" icon={stopOutline} />
              Stop &amp; reset
            </IonButton>
          </div>
        </section>
      </div>
    </div>
  );
};
