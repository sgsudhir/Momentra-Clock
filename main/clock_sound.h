#pragma once

#include <stdbool.h>
#include <stdint.h>

/** Determine active-buzzer output for a chime pattern at elapsed milliseconds.
 * @return False for an invalid pattern or after the pattern has finished.
 */
bool clock_sound_chime(unsigned pattern, uint64_t elapsed_ms);
/** @return Buzzer level for an alarm at elapsed milliseconds; pattern repeats. */
bool clock_sound_alarm(uint64_t elapsed_ms);
/** @return Buzzer level for a reminder at elapsed milliseconds; pattern repeats. */
bool clock_sound_reminder(uint64_t elapsed_ms);
