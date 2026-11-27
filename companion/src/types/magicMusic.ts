export type MagicCategory = 'none' | 'repdigit' | 'sequence' | 'palindrome';

export interface InterestingTimeMatch {
  matched: boolean;
  category: MagicCategory;
  label: string;
  digits: string;
}

export interface NextInterestingTime {
  hour24: number;
  minute: number;
  formatted: string;
  category: MagicCategory;
  label: string;
  waitMinutes: number;
  waitText: string;
}

export interface SampleInterestingTime {
  hour24: number;
  minute: number;
  formatted: string;
  category: Exclude<MagicCategory, 'none'>;
  label: string;
}

export interface MagicTrackNote {
  freqHz: number;
  durationMs: number;
}

export interface MagicTrack {
  id: number;
  name: string;
  mood: string;
  durationMs: number;
  notes: readonly MagicTrackNote[];
  /** 100ms active-buzzer ON(1) / OFF(0) slices covering durationMs. */
  rhythmSlices: readonly number[];
}

export const MAGIC_TRACK_COUNT = 8;

function expandNotesToSlices(
  notes: readonly MagicTrackNote[],
  activePatternForNote: (note: MagicTrackNote, index: number) => number[],
): number[] {
  const slices: number[] = [];
  notes.forEach((note, idx) => {
    const steps = Math.max(1, Math.round(note.durationMs / 100));
    if (note.freqHz <= 0) {
      for (let i = 0; i < steps; i += 1) slices.push(0);
    } else {
      const pattern = activePatternForNote(note, idx);
      for (let i = 0; i < steps; i += 1) {
        slices.push(pattern[i % pattern.length]);
      }
    }
  });
  return slices;
}

const RAW_TRACKS: readonly Omit<MagicTrack, 'durationMs' | 'rhythmSlices'>[] = [
  {
    id: 0,
    name: 'Beethoven — Für Elise',
    mood: 'Iconic A-minor classical motif',
    notes: [
      { freqHz: 659, durationMs: 220 }, { freqHz: 622, durationMs: 220 },
      { freqHz: 659, durationMs: 220 }, { freqHz: 622, durationMs: 220 },
      { freqHz: 659, durationMs: 220 }, { freqHz: 494, durationMs: 220 },
      { freqHz: 587, durationMs: 220 }, { freqHz: 523, durationMs: 220 },
      { freqHz: 440, durationMs: 520 }, { freqHz: 0, durationMs: 180 },
      { freqHz: 262, durationMs: 220 }, { freqHz: 330, durationMs: 220 },
      { freqHz: 440, durationMs: 220 }, { freqHz: 494, durationMs: 520 },
      { freqHz: 0, durationMs: 160 },
      { freqHz: 330, durationMs: 220 }, { freqHz: 415, durationMs: 220 },
      { freqHz: 494, durationMs: 220 }, { freqHz: 523, durationMs: 520 },
      { freqHz: 0, durationMs: 160 },
      { freqHz: 330, durationMs: 200 }, { freqHz: 659, durationMs: 200 },
      { freqHz: 622, durationMs: 200 }, { freqHz: 659, durationMs: 200 },
      { freqHz: 622, durationMs: 200 }, { freqHz: 659, durationMs: 200 },
      { freqHz: 494, durationMs: 200 }, { freqHz: 587, durationMs: 200 },
      { freqHz: 523, durationMs: 200 }, { freqHz: 440, durationMs: 700 },
    ],
  },
  {
    id: 1,
    name: 'Beethoven — Ode to Joy',
    mood: 'Symphony No. 9 choral theme',
    notes: [
      { freqHz: 659, durationMs: 290 }, { freqHz: 659, durationMs: 290 },
      { freqHz: 698, durationMs: 290 }, { freqHz: 784, durationMs: 290 },
      { freqHz: 784, durationMs: 290 }, { freqHz: 698, durationMs: 290 },
      { freqHz: 659, durationMs: 290 }, { freqHz: 587, durationMs: 290 },
      { freqHz: 523, durationMs: 290 }, { freqHz: 523, durationMs: 290 },
      { freqHz: 587, durationMs: 290 }, { freqHz: 659, durationMs: 290 },
      { freqHz: 659, durationMs: 440 }, { freqHz: 587, durationMs: 160 },
      { freqHz: 587, durationMs: 600 }, { freqHz: 0, durationMs: 180 },
      { freqHz: 587, durationMs: 280 }, { freqHz: 659, durationMs: 280 },
      { freqHz: 523, durationMs: 280 }, { freqHz: 587, durationMs: 280 },
      { freqHz: 659, durationMs: 150 }, { freqHz: 698, durationMs: 150 },
      { freqHz: 659, durationMs: 280 }, { freqHz: 523, durationMs: 280 },
      { freqHz: 587, durationMs: 280 }, { freqHz: 392, durationMs: 280 },
      { freqHz: 523, durationMs: 700 },
    ],
  },
  {
    id: 2,
    name: 'Beethoven — Symphony No. 5',
    mood: 'Dramatic fate motif',
    notes: [
      { freqHz: 392, durationMs: 160 }, { freqHz: 0, durationMs: 60 },
      { freqHz: 392, durationMs: 160 }, { freqHz: 0, durationMs: 60 },
      { freqHz: 392, durationMs: 160 }, { freqHz: 0, durationMs: 60 },
      { freqHz: 311, durationMs: 900 }, { freqHz: 0, durationMs: 280 },
      { freqHz: 349, durationMs: 160 }, { freqHz: 0, durationMs: 60 },
      { freqHz: 349, durationMs: 160 }, { freqHz: 0, durationMs: 60 },
      { freqHz: 349, durationMs: 160 }, { freqHz: 0, durationMs: 60 },
      { freqHz: 294, durationMs: 900 }, { freqHz: 0, durationMs: 320 },
      { freqHz: 392, durationMs: 160 }, { freqHz: 0, durationMs: 50 },
      { freqHz: 392, durationMs: 160 }, { freqHz: 0, durationMs: 50 },
      { freqHz: 392, durationMs: 160 }, { freqHz: 0, durationMs: 50 },
      { freqHz: 311, durationMs: 340 },
      { freqHz: 415, durationMs: 160 }, { freqHz: 0, durationMs: 50 },
      { freqHz: 415, durationMs: 160 }, { freqHz: 0, durationMs: 50 },
      { freqHz: 415, durationMs: 160 }, { freqHz: 0, durationMs: 50 },
      { freqHz: 392, durationMs: 340 },
      { freqHz: 622, durationMs: 160 }, { freqHz: 0, durationMs: 50 },
      { freqHz: 622, durationMs: 160 }, { freqHz: 0, durationMs: 50 },
      { freqHz: 622, durationMs: 160 }, { freqHz: 0, durationMs: 50 },
      { freqHz: 523, durationMs: 950 },
    ],
  },
  {
    id: 3,
    name: 'Beethoven — Moonlight Sonata',
    mood: 'Nocturnal C# minor triplets',
    notes: [
      { freqHz: 415, durationMs: 300 }, { freqHz: 554, durationMs: 300 }, { freqHz: 659, durationMs: 300 },
      { freqHz: 415, durationMs: 300 }, { freqHz: 554, durationMs: 300 }, { freqHz: 659, durationMs: 300 },
      { freqHz: 440, durationMs: 300 }, { freqHz: 554, durationMs: 300 }, { freqHz: 659, durationMs: 300 },
      { freqHz: 440, durationMs: 300 }, { freqHz: 587, durationMs: 300 }, { freqHz: 740, durationMs: 300 },
      { freqHz: 415, durationMs: 300 }, { freqHz: 523, durationMs: 300 }, { freqHz: 740, durationMs: 300 },
      { freqHz: 415, durationMs: 300 }, { freqHz: 554, durationMs: 300 }, { freqHz: 659, durationMs: 300 },
      { freqHz: 831, durationMs: 650 }, { freqHz: 831, durationMs: 220 },
      { freqHz: 831, durationMs: 650 }, { freqHz: 880, durationMs: 350 },
      { freqHz: 831, durationMs: 700 },
    ],
  },
  {
    id: 4,
    name: 'Raag Bhupali (Indian Classical)',
    mood: 'Pentatonic evening alaap & pakad',
    notes: [
      { freqHz: 659, durationMs: 480 }, { freqHz: 587, durationMs: 280 },
      { freqHz: 523, durationMs: 650 }, { freqHz: 0, durationMs: 180 },
      { freqHz: 440, durationMs: 320 }, { freqHz: 523, durationMs: 320 },
      { freqHz: 587, durationMs: 280 }, { freqHz: 659, durationMs: 620 },
      { freqHz: 0, durationMs: 180 },
      { freqHz: 523, durationMs: 220 }, { freqHz: 587, durationMs: 220 },
      { freqHz: 659, durationMs: 260 }, { freqHz: 784, durationMs: 260 },
      { freqHz: 880, durationMs: 280 }, { freqHz: 1047, durationMs: 650 },
      { freqHz: 0, durationMs: 160 },
      { freqHz: 1047, durationMs: 240 }, { freqHz: 880, durationMs: 240 },
      { freqHz: 784, durationMs: 280 }, { freqHz: 659, durationMs: 340 },
      { freqHz: 587, durationMs: 240 }, { freqHz: 523, durationMs: 850 },
    ],
  },
  {
    id: 5,
    name: 'Raag Yaman (Indian Classical)',
    mood: 'Kalyan thaat with Teevra Ma',
    notes: [
      { freqHz: 494, durationMs: 340 }, { freqHz: 587, durationMs: 340 },
      { freqHz: 659, durationMs: 480 }, { freqHz: 0, durationMs: 120 },
      { freqHz: 740, durationMs: 300 }, { freqHz: 784, durationMs: 600 },
      { freqHz: 0, durationMs: 180 },
      { freqHz: 659, durationMs: 240 }, { freqHz: 740, durationMs: 240 },
      { freqHz: 880, durationMs: 260 }, { freqHz: 988, durationMs: 280 },
      { freqHz: 1047, durationMs: 680 }, { freqHz: 0, durationMs: 160 },
      { freqHz: 988, durationMs: 220 }, { freqHz: 880, durationMs: 220 },
      { freqHz: 784, durationMs: 300 }, { freqHz: 740, durationMs: 260 },
      { freqHz: 659, durationMs: 280 }, { freqHz: 587, durationMs: 260 },
      { freqHz: 494, durationMs: 280 }, { freqHz: 587, durationMs: 300 },
      { freqHz: 523, durationMs: 850 },
    ],
  },
  {
    id: 6,
    name: 'Raag Desh (Indian Classical)',
    mood: 'Expressive monsoon Khamaj cadence',
    notes: [
      { freqHz: 523, durationMs: 420 }, { freqHz: 587, durationMs: 300 },
      { freqHz: 698, durationMs: 320 }, { freqHz: 784, durationMs: 650 },
      { freqHz: 0, durationMs: 160 },
      { freqHz: 988, durationMs: 320 }, { freqHz: 1047, durationMs: 580 },
      { freqHz: 0, durationMs: 160 },
      { freqHz: 1175, durationMs: 260 }, { freqHz: 932, durationMs: 360 },
      { freqHz: 880, durationMs: 280 }, { freqHz: 784, durationMs: 520 },
      { freqHz: 0, durationMs: 140 },
      { freqHz: 880, durationMs: 240 }, { freqHz: 698, durationMs: 260 },
      { freqHz: 659, durationMs: 260 }, { freqHz: 587, durationMs: 240 },
      { freqHz: 659, durationMs: 240 }, { freqHz: 523, durationMs: 850 },
    ],
  },
  {
    id: 7,
    name: 'Raag Shivranjani & Taan',
    mood: 'Komal Ga alaap & fast closing taan',
    notes: [
      { freqHz: 523, durationMs: 380 }, { freqHz: 587, durationMs: 300 },
      { freqHz: 622, durationMs: 620 }, { freqHz: 784, durationMs: 540 },
      { freqHz: 0, durationMs: 160 },
      { freqHz: 880, durationMs: 380 }, { freqHz: 784, durationMs: 300 },
      { freqHz: 622, durationMs: 520 }, { freqHz: 587, durationMs: 280 },
      { freqHz: 523, durationMs: 540 }, { freqHz: 0, durationMs: 180 },
      { freqHz: 523, durationMs: 150 }, { freqHz: 587, durationMs: 150 },
      { freqHz: 622, durationMs: 150 }, { freqHz: 784, durationMs: 150 },
      { freqHz: 880, durationMs: 150 }, { freqHz: 1047, durationMs: 260 },
      { freqHz: 880, durationMs: 150 }, { freqHz: 784, durationMs: 150 },
      { freqHz: 622, durationMs: 150 }, { freqHz: 587, durationMs: 150 },
      { freqHz: 523, durationMs: 820 },
    ],
  },
];

export const MAGIC_TRACKS: readonly MagicTrack[] = RAW_TRACKS.map((track) => {
  const durationMs = track.notes.reduce((sum, n) => sum + n.durationMs, 0);
  const rhythmSlices = expandNotesToSlices(track.notes, (note) => {
    const steps = Math.max(1, Math.round(note.durationMs / 100));
    if (steps <= 1) return [1];
    // Articulate every note cleanly: keep tail slice 0 so notes stay distinct on active buzzers.
    return Array.from({ length: steps }, (_, i) => (i === steps - 1 ? 0 : 1));
  });
  return {
    ...track,
    durationMs,
    rhythmSlices,
  };
});

export function classifyInterestingTime(
  hour24: number,
  minute: number,
  format12h: boolean,
): InterestingTimeMatch {
  const h24 = ((Math.trunc(hour24) % 24) + 24) % 24;
  const min = ((Math.trunc(minute) % 60) + 60) % 60;
  const dispH = format12h ? (h24 % 12 || 12) : h24;
  const h1 = Math.floor(dispH / 10);
  const h0 = dispH % 10;
  const m1 = Math.floor(min / 10);
  const m0 = min % 10;

  const digits =
    format12h && dispH < 10
      ? `${dispH}:${String(min).padStart(2, '0')}`
      : `${String(dispH).padStart(2, '0')}:${String(min).padStart(2, '0')}`;

  // 1. Repdigits: 00:00, 11:11, 22:22, or 3-digit 1:11..5:55 / 01:11..05:55
  if ((h1 === h0 && h0 === m1 && m1 === m0) || (dispH >= 1 && dispH <= 9 && dispH === m1 && m1 === m0)) {
    return { matched: true, category: 'repdigit', label: 'Repdigit', digits };
  }

  // 2. Sequences: 4-digit ascending (01:23, 12:34, 23:45), 3-digit asc (1..9), 3-digit desc (2..9)
  const isFourAsc = h0 === h1 + 1 && m1 === h0 + 1 && m0 === m1 + 1;
  const isThreeAsc = dispH >= 1 && dispH <= 9 && m1 === dispH + 1 && m0 === m1 + 1;
  const isThreeDesc = dispH >= 2 && dispH <= 9 && m1 === dispH - 1 && m0 === m1 - 1;
  if (isFourAsc || isThreeAsc || isThreeDesc) {
    return { matched: true, category: 'sequence', label: 'Sequence', digits };
  }

  // 3. Palindromes: 4-digit mirror (h1 == m0 && h0 == m1), e.g. 01:10, 10:01, 12:21, 23:32
  if (h1 === m0 && h0 === m1) {
    return { matched: true, category: 'palindrome', label: 'Palindrome', digits };
  }

  return { matched: false, category: 'none', label: 'Standard minute', digits };
}

function getLocalHourMinute(date: Date, timeZone: string): { hour24: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    let hour24 = 0;
    let minute = 0;
    for (const part of parts) {
      if (part.type === 'hour') hour24 = Number(part.value) % 24;
      if (part.type === 'minute') minute = Number(part.value) % 60;
    }
    return { hour24, minute };
  } catch {
    return { hour24: date.getUTCHours(), minute: date.getUTCMinutes() };
  }
}

function formatWaitMinutes(waitMinutes: number): string {
  const hrs = Math.floor(waitMinutes / 60);
  const mins = waitMinutes % 60;
  if (hrs > 0 && mins > 0) return `in ${hrs}h ${mins}m`;
  if (hrs > 0) return `in ${hrs}h`;
  return `in ${mins}m`;
}

export function getNextInterestingTime(
  nowDate: Date,
  timeZone: string,
  format12h: boolean,
): NextInterestingTime {
  const { hour24, minute } = getLocalHourMinute(nowDate, timeZone);
  const currentTotalMinutes = hour24 * 60 + minute;

  for (let delta = 1; delta <= 1440; delta += 1) {
    const total = (currentTotalMinutes + delta) % 1440;
    const candH = Math.floor(total / 60);
    const candM = total % 60;
    const match = classifyInterestingTime(candH, candM, format12h);
    if (match.matched) {
      return {
        hour24: candH,
        minute: candM,
        formatted: match.digits,
        category: match.category,
        label: match.label,
        waitMinutes: delta,
        waitText: formatWaitMinutes(delta),
      };
    }
  }

  return {
    hour24: 11,
    minute: 11,
    formatted: '11:11',
    category: 'repdigit',
    label: 'Repdigit',
    waitMinutes: 1440,
    waitText: 'in 24h',
  };
}

export function listSampleInterestingTimes(format12h: boolean): SampleInterestingTime[] {
  const candidates: Array<{ hour24: number; minute: number }> = [
    { hour24: 1, minute: 23 },
    { hour24: 3, minute: 21 },
    { hour24: 11, minute: 11 },
    { hour24: 12, minute: 21 },
    { hour24: 12, minute: 34 },
    format12h ? { hour24: 4, minute: 56 } : { hour24: 23, minute: 45 },
    format12h ? { hour24: 5, minute: 55 } : { hour24: 0, minute: 0 },
  ];
  const samples: SampleInterestingTime[] = [];
  for (const item of candidates) {
    const res = classifyInterestingTime(item.hour24, item.minute, format12h);
    if (res.matched && res.category !== 'none') {
      samples.push({
        hour24: item.hour24,
        minute: item.minute,
        formatted: res.digits,
        category: res.category,
        label: res.label,
      });
    }
  }
  return samples;
}
