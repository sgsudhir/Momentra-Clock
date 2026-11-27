import { MAGIC_TRACKS, MAGIC_TRACK_COUNT } from '../types/magicMusic';

export interface MagicPlaybackState {
  playing: boolean;
  trackId: number | null;
  stepIndex: number;
  freqHz: number;
}

type StateListener = (state: MagicPlaybackState) => void;

const IDLE_STATE: MagicPlaybackState = {
  playing: false,
  trackId: null,
  stepIndex: 0,
  freqHz: 0,
};

/**
 * Web Audio API synthesizer mirroring both Momentra firmware buzzer modes:
 * - Active Buzzer (`pwmMode = false`): crisp ~2700 Hz piezo square wave gated by 100ms rhythm slices.
 * - Passive Buzzer PWM (`pwmMode = true`): variable-frequency musical notes with soft envelope.
 */
export class MomentraSoundSynth {
  private audioCtx: AudioContext | null = null;
  private activeOsc: OscillatorNode | null = null;
  private activeGain: GainNode | null = null;
  private timers: number[] = [];
  private lastTrackId = -1;
  private state: MagicPlaybackState = { ...IDLE_STATE };
  private listener: StateListener | null = null;

  getState(): MagicPlaybackState {
    return { ...this.state };
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new Ctor();
      }
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  private silenceOscillator(): void {
    try {
      this.activeOsc?.stop();
      this.activeOsc?.disconnect();
    } catch {
      // Already stopped
    }
    try {
      this.activeGain?.disconnect();
    } catch {
      // Already disconnected
    }
    this.activeOsc = null;
    this.activeGain = null;
  }

  private clearTimers(): void {
    for (const id of this.timers) {
      window.clearTimeout(id);
    }
    this.timers = [];
  }

  private emit(next: MagicPlaybackState, explicitListener?: StateListener | null): void {
    this.state = next;
    const cb = explicitListener ?? this.listener;
    cb?.({ ...next });
  }

  private pickTrack(requestedTrack: number): number {
    if (requestedTrack >= 0 && requestedTrack < MAGIC_TRACK_COUNT) {
      this.lastTrackId = requestedTrack;
      return requestedTrack;
    }
    let chosen = Math.floor(Math.random() * MAGIC_TRACK_COUNT);
    if (MAGIC_TRACK_COUNT > 1 && chosen === this.lastTrackId) {
      chosen = (chosen + 1 + Math.floor(Math.random() * (MAGIC_TRACK_COUNT - 1))) % MAGIC_TRACK_COUNT;
    }
    this.lastTrackId = chosen;
    return chosen;
  }

  private playTone(freqHz: number, durationMs: number, pwmMode: boolean): void {
    this.silenceOscillator();
    if (freqHz <= 0) return;

    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const durSec = Math.max(0.05, durationMs / 1000);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = pwmMode ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(freqHz, now);

      const peak = pwmMode ? 0.14 : 0.06;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(peak * 0.75, Math.max(now + 0.02, now + durSec - 0.02));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durSec);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + durSec + 0.01);

      this.activeOsc = osc;
      this.activeGain = gain;
    } catch {
      // Ignore autoplay/audio device failures in headless environments
    }
  }

  playTrack(
    trackId: number | -1,
    pwmMode: boolean,
    onStateChange?: StateListener,
  ): number {
    this.stop();
    this.listener = onStateChange ?? null;

    const chosenId = this.pickTrack(trackId);
    const track = MAGIC_TRACKS[chosenId];

    if (pwmMode) {
      let elapsed = 0;
      track.notes.forEach((note, idx) => {
        const timerId = window.setTimeout(() => {
          this.playTone(note.freqHz, Math.max(50, note.durationMs - 15), true);
          this.emit({
            playing: true,
            trackId: chosenId,
            stepIndex: idx,
            freqHz: note.freqHz,
          });
        }, elapsed);
        this.timers.push(timerId);
        elapsed += note.durationMs;
      });

      const endTimer = window.setTimeout(() => {
        this.stop();
      }, elapsed + 40);
      this.timers.push(endTimer);
    } else {
      const slices = track.rhythmSlices;
      slices.forEach((on, idx) => {
        const timerId = window.setTimeout(() => {
          const freq = on ? 2700 : 0;
          this.playTone(freq, 85, false);
          this.emit({
            playing: true,
            trackId: chosenId,
            stepIndex: idx,
            freqHz: freq,
          });
        }, idx * 100);
        this.timers.push(timerId);
      });

      const endTimer = window.setTimeout(() => {
        this.stop();
      }, slices.length * 100 + 40);
      this.timers.push(endTimer);
    }

    this.emit({
      playing: true,
      trackId: chosenId,
      stepIndex: 0,
      freqHz: pwmMode ? (track.notes[0]?.freqHz ?? 0) : (track.rhythmSlices[0] ? 2700 : 0),
    });

    return chosenId;
  }

  stop(): void {
    const wasListener = this.listener;
    this.clearTimers();
    this.silenceOscillator();
    this.listener = null;
    if (this.state.playing || this.state.trackId !== null) {
      this.emit({ ...IDLE_STATE }, wasListener);
    }
  }
}

export const momentraSoundSynth = new MomentraSoundSynth();
