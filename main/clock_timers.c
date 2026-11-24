#include "clock_timers.h"

#include "esp_timer.h"
#include "freertos/FreeRTOS.h"

static portMUX_TYPE timers_lock = portMUX_INITIALIZER_UNLOCKED;
static clock_timers_t timers;

bool clock_timers_apply(bool reminder, clock_timer_action_t action, unsigned seconds)
{
    int64_t now = esp_timer_get_time();
    portENTER_CRITICAL(&timers_lock);
    bool result = clock_timers_command(&timers, reminder, action, seconds, now);
    portEXIT_CRITICAL(&timers_lock);
    return result;
}

clock_timers_snapshot_t clock_timers_snapshot(void)
{
    int64_t now = esp_timer_get_time();
    portENTER_CRITICAL(&timers_lock);
    clock_timers_snapshot_t snapshot = {
        .stopwatch_state = timers.stopwatch.state,
        .stopwatch_us = clock_timer_value(&timers.stopwatch, false, now),
        .reminder_state = timers.reminder.state,
        .reminder_us = clock_timer_value(&timers.reminder, true, now),
    };
    portEXIT_CRITICAL(&timers_lock);
    return snapshot;
}

bool clock_timers_update(void)
{
    int64_t now = esp_timer_get_time();
    portENTER_CRITICAL(&timers_lock);
    bool stopped = clock_timers_tick(&timers, now);
    portEXIT_CRITICAL(&timers_lock);
    return stopped;
}
