#include "clock_schedule.h"
#include <string.h>

void clock_schedule_init(clock_schedule_t *schedule)
{
    schedule->last_minute = INT64_MIN;
    schedule->timezone[0] = '\0';
}

clock_events_t clock_schedule_check(clock_schedule_t *schedule, const clock_config_t *config,
                                    int64_t unix_seconds, bool time_valid)
{
    clock_events_t events = {0};
    if (!time_valid || unix_seconds < 0) {
        return events;
    }

    int32_t offset;
    if (!clock_timezone_offset(config->timezone_primary, unix_seconds, &offset)) return events;
    if (strcmp(schedule->timezone, config->timezone_primary) != 0) {
        strcpy(schedule->timezone, config->timezone_primary);
        schedule->last_minute = INT64_MIN;
    }
    /* Local-minute tracking suppresses repeated minutes after an NTP or DST rollback. */
    int64_t local_seconds = unix_seconds + offset;
    int64_t minute = local_seconds >= 0 ? local_seconds / 60 : (local_seconds - 59) / 60;
    if (minute <= schedule->last_minute) {
        return events;
    }
    schedule->last_minute = minute;
    unsigned minute_of_day = (minute % (24 * 60) + 24 * 60) % (24 * 60);
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
