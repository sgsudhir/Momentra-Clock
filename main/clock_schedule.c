#include "clock_schedule.h"

/* Scheduling uses a fixed UTC+05:30 offset, independent of libc timezone state. */
#define INDIA_OFFSET_SECONDS (5 * 3600 + 30 * 60)

void clock_schedule_init(clock_schedule_t *schedule)
{
    schedule->last_minute = -1;
}

clock_events_t clock_schedule_check(clock_schedule_t *schedule, const clock_config_t *config,
                                    int64_t unix_seconds, bool time_valid)
{
    clock_events_t events = {0};
    if (!time_valid || unix_seconds < 0) {
        return events;
    }

    /* Track an absolute local minute, not minute-of-day, so each minute is
     * considered once even when the wall clock moves backwards. */
    int64_t minute = (unix_seconds + INDIA_OFFSET_SECONDS) / 60;
    if (minute <= schedule->last_minute) {
        return events;
    }
    schedule->last_minute = minute;
    unsigned minute_of_day = minute % (24 * 60);
    unsigned hour = minute_of_day / 60;
    unsigned minute_of_hour = minute_of_day % 60;
    events.hourly = config->hourly_enabled && minute_of_hour == 0;
    for (unsigned i = 0; i < CLOCK_ALARM_COUNT; ++i) {
        const clock_alarm_t *alarm = &config->alarms[i];
        if (alarm->enabled && alarm->hour == hour && alarm->minute == minute_of_hour) {
            events.alarms |= 1U << i;
        }
    }
    return events;
}
