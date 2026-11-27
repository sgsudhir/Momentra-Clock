#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

/** Current scheduled-alarm and magic-music output; bit i identifies alarm slot i. */
typedef struct {
    bool ringing;
    uint8_t alarm_mask;
    bool magic_playing;
    int magic_track;
} clock_alarm_status_t;

/** Configure the buzzer, if present, and launch the alarm/timer task.
 * @return ESP_OK or a GPIO/task creation error.
 */
esp_err_t clock_alarm_start(void);
/** @return Whether a buzzer GPIO was configured at build time. */
bool clock_alarm_is_configured(void);
/** Request that the alarm task stop the current alarm, chime, or magic track. */
void clock_alarm_stop(void);
/** Queue a short feedback beep if configured and enabled; it waits for other sounds. */
void clock_alarm_beep(void);
/** Request playback of a magic-time track (-1 picks a random non-repeating track).
 * @param track Track ID in [-1, CLOCK_MAGIC_TRACK_COUNT - 1].
 * @param pwm_override -1 to use saved config.magic_pwm, 0 for active buzzer, 1 for PWM.
 */
esp_err_t clock_alarm_play_magic(int track, int pwm_override);
/** @return A thread-safe snapshot of active scheduled alarms and magic playback. */
clock_alarm_status_t clock_alarm_status(void);
