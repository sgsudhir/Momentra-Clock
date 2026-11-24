#pragma once

#include "clock_timer_logic.h"

typedef struct {
    clock_timer_state_t stopwatch_state;
    int64_t stopwatch_us;
    clock_timer_state_t reminder_state;
    int64_t reminder_us;
} clock_timers_snapshot_t;

bool clock_timers_apply(bool reminder, clock_timer_action_t action, unsigned seconds);
clock_timers_snapshot_t clock_timers_snapshot(void);
bool clock_timers_update(void);
