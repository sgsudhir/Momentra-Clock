#include "clock_sound.h"

#include "clock_config.h"

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
