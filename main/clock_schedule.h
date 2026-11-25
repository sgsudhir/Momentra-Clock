#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "clock_config.h"

/** Last local-epoch minute processed; prevents repeat triggers after clock rollback. */
typedef struct {
    int64_t last_minute;
} clock_schedule_t;

/** Events due in one minute; bit i in alarms corresponds to alarm slot i. */
typedef struct {
    uint8_t alarms; /**< Mask of enabled alarm slots matching this minute. */
    bool hourly;    /**< Hourly chime is enabled and this is minute zero. */
} clock_events_t;

/** Initialize a non-NULL schedule before its first check. */
void clock_schedule_init(clock_schedule_t *schedule);
/** Check the current local minute once, without replaying missed minutes.
 * @param schedule Mutable scheduling state.
 * @param config Current validated settings.
 * @param unix_seconds UTC seconds since the Unix epoch.
 * @param time_valid False suppresses all scheduled events.
 * @return Alarm bitmask and hourly chime flag.
 */
clock_events_t clock_schedule_check(clock_schedule_t *schedule, const clock_config_t *config,
                                    int64_t unix_seconds, bool time_valid);
