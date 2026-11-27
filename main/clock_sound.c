#include "clock_sound.h"

#include <stddef.h>

#include "clock_config.h"

typedef struct {
    uint16_t freq_hz;
    uint16_t duration_ms;
} magic_note_t;

typedef struct {
    const magic_note_t *notes;
    size_t count;
} magic_track_t;

/* 0: Beethoven - Fur Elise (7660 ms) */
static const magic_note_t track_fur_elise[] = {
    {659, 220}, {622, 220}, {659, 220}, {622, 220}, {659, 220},
    {494, 220}, {587, 220}, {523, 220}, {440, 520}, {0, 180},
    {262, 220}, {330, 220}, {440, 220}, {494, 520}, {0, 160},
    {330, 220}, {415, 220}, {494, 220}, {523, 520}, {0, 160},
    {330, 200}, {659, 200}, {622, 200}, {659, 200}, {622, 200},
    {659, 200}, {494, 200}, {587, 200}, {523, 200}, {440, 700},
};

/* 1: Beethoven - Ode to Joy (7200 ms) */
static const magic_note_t track_ode_to_joy[] = {
    {659, 290}, {659, 290}, {698, 290}, {784, 290},
    {784, 290}, {698, 290}, {659, 290}, {587, 290},
    {523, 290}, {523, 290}, {587, 290}, {659, 290},
    {659, 440}, {587, 160}, {587, 600}, {0, 180},
    {587, 280}, {659, 280}, {523, 280}, {587, 280},
    {659, 150}, {698, 150}, {659, 280}, {523, 280},
    {587, 280}, {392, 280}, {523, 700},
};

/* 2: Beethoven - Symphony No. 5 Fate Motif (7200 ms) */
static const magic_note_t track_symphony_5[] = {
    {392, 160}, {0, 60}, {392, 160}, {0, 60}, {392, 160}, {0, 60}, {311, 900}, {0, 280},
    {349, 160}, {0, 60}, {349, 160}, {0, 60}, {349, 160}, {0, 60}, {294, 900}, {0, 320},
    {392, 160}, {0, 50}, {392, 160}, {0, 50}, {392, 160}, {0, 50}, {311, 340},
    {415, 160}, {0, 50}, {415, 160}, {0, 50}, {415, 160}, {0, 50}, {392, 340},
    {622, 160}, {0, 50}, {622, 160}, {0, 50}, {622, 160}, {0, 50}, {523, 950},
};

/* 3: Beethoven - Moonlight Sonata Adagio (7970 ms) */
static const magic_note_t track_moonlight_sonata[] = {
    {415, 300}, {554, 300}, {659, 300}, {415, 300}, {554, 300}, {659, 300},
    {440, 300}, {554, 300}, {659, 300}, {440, 300}, {587, 300}, {740, 300},
    {415, 300}, {523, 300}, {740, 300}, {415, 300}, {554, 300}, {659, 300},
    {831, 650}, {831, 220}, {831, 650}, {880, 350}, {831, 700},
};

/* 4: Indian Classical - Raag Bhupali (7550 ms) */
static const magic_note_t track_raag_bhupali[] = {
    {659, 480}, {587, 280}, {523, 650}, {0, 180},
    {440, 320}, {523, 320}, {587, 280}, {659, 620}, {0, 180},
    {523, 220}, {587, 220}, {659, 260}, {784, 260}, {880, 280}, {1047, 650}, {0, 160},
    {1047, 240}, {880, 240}, {784, 280}, {659, 340}, {587, 240}, {523, 850},
};

/* 5: Indian Classical - Raag Yaman (7190 ms) */
static const magic_note_t track_raag_yaman[] = {
    {494, 340}, {587, 340}, {659, 480}, {0, 120}, {740, 300}, {784, 600}, {0, 180},
    {659, 240}, {740, 240}, {880, 260}, {988, 280}, {1047, 680}, {0, 160},
    {988, 220}, {880, 220}, {784, 300}, {740, 260}, {659, 280},
    {587, 260}, {494, 280}, {587, 300}, {523, 850},
};

/* 6: Indian Classical - Raag Desh (6560 ms) */
static const magic_note_t track_raag_desh[] = {
    {523, 420}, {587, 300}, {698, 320}, {784, 650}, {0, 160},
    {988, 320}, {1047, 580}, {0, 160},
    {1175, 260}, {932, 360}, {880, 280}, {784, 520}, {0, 140},
    {880, 240}, {698, 260}, {659, 260}, {587, 240}, {659, 240}, {523, 850},
};

/* 7: Indian Classical - Raag Shivranjani & Taan (6630 ms) */
static const magic_note_t track_raag_shivranjani[] = {
    {523, 380}, {587, 300}, {622, 620}, {784, 540}, {0, 160},
    {880, 380}, {784, 300}, {622, 520}, {587, 280}, {523, 540}, {0, 180},
    {523, 150}, {587, 150}, {622, 150}, {784, 150}, {880, 150}, {1047, 260},
    {880, 150}, {784, 150}, {622, 150}, {587, 150}, {523, 820},
};

static const magic_track_t magic_tracks[CLOCK_MAGIC_TRACK_COUNT] = {
    {track_fur_elise, sizeof(track_fur_elise) / sizeof(track_fur_elise[0])},
    {track_ode_to_joy, sizeof(track_ode_to_joy) / sizeof(track_ode_to_joy[0])},
    {track_symphony_5, sizeof(track_symphony_5) / sizeof(track_symphony_5[0])},
    {track_moonlight_sonata, sizeof(track_moonlight_sonata) / sizeof(track_moonlight_sonata[0])},
    {track_raag_bhupali, sizeof(track_raag_bhupali) / sizeof(track_raag_bhupali[0])},
    {track_raag_yaman, sizeof(track_raag_yaman) / sizeof(track_raag_yaman[0])},
    {track_raag_desh, sizeof(track_raag_desh) / sizeof(track_raag_desh[0])},
    {track_raag_shivranjani, sizeof(track_raag_shivranjani) / sizeof(track_raag_shivranjani[0])},
};

bool clock_sound_chime(unsigned pattern, uint64_t elapsed_ms)
{
    /* Bit n is the output level for the nth 100 ms slice. The active buzzer
     * has fixed pitch, so patterns differ by rhythm rather than frequency. */
    static const uint16_t masks[CLOCK_SOUND_COUNT] = {0x003f, 0x00e7, 0x0049, 0x01f5};
    uint64_t phase = elapsed_ms / 100;
    return pattern < CLOCK_SOUND_COUNT && phase < 16 && (masks[pattern] & (1U << phase));
}

bool clock_sound_alarm(uint64_t elapsed_ms)
{
    uint64_t phase = elapsed_ms % 1200;
    return phase < 600 && phase % 150 < 75;
}

bool clock_sound_reminder(uint64_t elapsed_ms)
{
    return elapsed_ms % 400 < 200;
}

static bool lookup_magic_step(unsigned track, uint64_t elapsed_ms,
                              uint32_t *freq_out, uint64_t *note_offset_ms,
                              uint16_t *note_duration_ms)
{
    if (track >= CLOCK_MAGIC_TRACK_COUNT) return false;
    const magic_track_t *item = &magic_tracks[track];
    uint64_t cursor = 0;
    for (size_t i = 0; i < item->count; ++i) {
        uint64_t end = cursor + item->notes[i].duration_ms;
        if (elapsed_ms < end) {
            *freq_out = item->notes[i].freq_hz;
            *note_offset_ms = elapsed_ms - cursor;
            *note_duration_ms = item->notes[i].duration_ms;
            return true;
        }
        cursor = end;
    }
    return false;
}

bool clock_sound_magic_active(unsigned track, uint64_t elapsed_ms)
{
    uint32_t freq = 0;
    uint64_t offset = 0;
    uint16_t duration = 0;
    if (!lookup_magic_step(track, elapsed_ms, &freq, &offset, &duration) || freq == 0) {
        return false;
    }
    /* Clear articulation gaps prevent consecutive notes from blurring together on active buzzers. */
    uint64_t on_ms = duration > 200 ? (uint64_t)duration - 55 :
                     duration > 90  ? (uint64_t)duration - 35 : duration;
    return offset < on_ms;
}

uint32_t clock_sound_magic_note(unsigned track, uint64_t elapsed_ms, bool *finished)
{
    uint32_t freq = 0;
    uint64_t offset = 0;
    uint16_t duration = 0;
    bool active = lookup_magic_step(track, elapsed_ms, &freq, &offset, &duration);
    if (finished) *finished = !active;
    return active ? freq : 0;
}
