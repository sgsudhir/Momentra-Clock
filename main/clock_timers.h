#pragma once

#include "clock_timer_logic.h"

/** Thread-safe snapshot of timer states and values in microseconds. */
typedef struct {
    clock_timer_state_t stopwatch_state;
    int64_t stopwatch_us;      /**< Elapsed time, capped at the stopwatch limit. */
    clock_timer_state_t reminder_state;
    int64_t reminder_us;       /**< Remaining time, zero while ringing. */
} clock_timers_snapshot_t;

/** Apply a command at the current monotonic time.
 * @param reminder Select reminder instead of stopwatch.
 * @param action Requested transition.
 * @param seconds Reminder start duration, otherwise ignored.
 * @return True if accepted; false for an invalid transition or duration.
 */
bool clock_timers_apply(bool reminder, clock_timer_action_t action, unsigned seconds);
/** @return A consistent copy of both timers evaluated at the current time. */
clock_timers_snapshot_t clock_timers_snapshot(void);
/** Advance timers. @return True if the stopwatch just reached its limit. */
bool clock_timers_update(void);
