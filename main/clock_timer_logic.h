#pragma once

#include <stdbool.h>
#include <stdint.h>

#define CLOCK_STOPWATCH_MAX_US INT64_C(5999990000)
#define CLOCK_REMINDER_MAX_SECONDS 86400

typedef enum {
    TIMER_IDLE, TIMER_RUNNING, TIMER_PAUSED, TIMER_RINGING
} clock_timer_state_t;

typedef struct {
    clock_timer_state_t state;
    int64_t value_us;
    int64_t mark_us;
} clock_timer_t;

typedef struct {
    clock_timer_t stopwatch;
    clock_timer_t reminder;
} clock_timers_t;

typedef enum {
    TIMER_START, TIMER_PAUSE, TIMER_RESUME, TIMER_STOP
} clock_timer_action_t;

int64_t clock_timer_value(const clock_timer_t *timer, bool countdown, int64_t now);
bool clock_timers_command(clock_timers_t *timers, bool reminder,
                          clock_timer_action_t action, unsigned seconds, int64_t now);
bool clock_timers_tick(clock_timers_t *timers, int64_t now);
