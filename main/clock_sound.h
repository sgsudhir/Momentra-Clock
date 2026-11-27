#pragma once

#include <stdbool.h>
#include <stdint.h>

#define CLOCK_MAGIC_TRACK_COUNT 8

/** Determine active-buzzer output for a chime pattern at elapsed milliseconds.
 * @return False for an invalid pattern or after the pattern has finished.
 */
bool clock_sound_chime(unsigned pattern, uint64_t elapsed_ms);
/** @return Buzzer level for an alarm at elapsed milliseconds; pattern repeats. */
bool clock_sound_alarm(uint64_t elapsed_ms);
/** @return Buzzer level for a reminder at elapsed milliseconds; pattern repeats. */
bool clock_sound_reminder(uint64_t elapsed_ms);

/** Determine active-buzzer ON/OFF rhythm for a magic-time track at elapsed_ms.
 * @param track Track index in [0, CLOCK_MAGIC_TRACK_COUNT - 1].
 * @param elapsed_ms Elapsed milliseconds since track start.
 * @return False for an invalid track, rest, or after the track has finished.
 */
bool clock_sound_magic_active(unsigned track, uint64_t elapsed_ms);

/** Look up passive-buzzer PWM note frequency for a magic-time track.
 * @param track Track index in [0, CLOCK_MAGIC_TRACK_COUNT - 1].
 * @param elapsed_ms Elapsed milliseconds since track start.
 * @param finished Optional output set to true once the track ends or track is invalid.
 * @return Frequency in Hz (0 for rest/silence or finished).
 */
uint32_t clock_sound_magic_note(unsigned track, uint64_t elapsed_ms, bool *finished);
