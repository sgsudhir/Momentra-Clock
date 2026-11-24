#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "clock_config.h"

typedef struct {
    int64_t last_minute;
} clock_schedule_t;

typedef struct {
    uint8_t alarms;
    bool hourly;
} clock_events_t;

void clock_schedule_init(clock_schedule_t *schedule);
clock_events_t clock_schedule_check(clock_schedule_t *schedule, const clock_config_t *config,
                                    int64_t unix_seconds, bool time_valid);
