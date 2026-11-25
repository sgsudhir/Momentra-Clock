#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

/** Current scheduled-alarm output; bit i identifies alarm slot i. */
typedef struct {
    bool ringing;
    uint8_t alarm_mask;
} clock_alarm_status_t;

/** Configure the buzzer, if present, and launch the alarm/timer task.
 * @return ESP_OK or a GPIO/task creation error.
 */
esp_err_t clock_alarm_start(void);
/** @return Whether a buzzer GPIO was configured at build time. */
bool clock_alarm_is_configured(void);
/** Request that the alarm task stop the current alarm/chime. */
void clock_alarm_stop(void);
/** Queue a short feedback beep if configured and enabled; it waits for other sounds. */
void clock_alarm_beep(void);
/** @return A thread-safe snapshot of active scheduled alarms. */
clock_alarm_status_t clock_alarm_status(void);
