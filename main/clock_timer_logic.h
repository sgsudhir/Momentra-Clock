#pragma once

#include <stdbool.h>
#include <stdint.h>

#define CLOCK_STOPWATCH_MAX_US INT64_C(5999990000) /**< 99:59.99 in microseconds. */
#define CLOCK_REMINDER_MAX_SECONDS 86400            /**< Maximum countdown: 24 hours. */

/** Timer state; only the reminder enters TIMER_RINGING. */
typedef enum {
    TIMER_IDLE, TIMER_RUNNING, TIMER_PAUSED, TIMER_RINGING
} clock_timer_state_t;

/** Timer storage: value is captured at mark, and advances while running. */
typedef struct {
    clock_timer_state_t state; /**< Current lifecycle state. */
    int64_t value_us;          /**< Elapsed stopwatch or remaining reminder time. */
    int64_t mark_us;           /**< Monotonic reference, or reminder expiration while ringing. */
} clock_timer_t;

typedef struct {
    clock_timer_t stopwatch; /**< Count-up timer. */
    clock_timer_t reminder;  /**< Count-down timer. */
} clock_timers_t;

/** Commands supported by the timer state machine. */
typedef enum {
    TIMER_START, TIMER_PAUSE, TIMER_RESUME, TIMER_STOP
} clock_timer_action_t;

/** Compute a timer's value without changing its state.
 * @param timer Non-NULL stored timer.
 * @param countdown True for a reminder; false for a stopwatch.
 * @param now Current monotonic time in microseconds.
 * @return Remaining or elapsed microseconds, clamped to the timer's limits.
 */
int64_t clock_timer_value(const clock_timer_t *timer, bool countdown, int64_t now);
/** Apply a state transition.
 * @param timers Non-NULL timer collection to update.
 * @param reminder Select the reminder rather than the stopwatch.
 * @param action Start, pause, resume, or stop.
 * @param seconds Duration for reminder start; ignored by other actions.
 * @param now Current monotonic time in microseconds.
 * @return True when the action was accepted, false for invalid state/duration.
 */
bool clock_timers_command(clock_timers_t *timers, bool reminder,
                          clock_timer_action_t action, unsigned seconds, int64_t now);
/** Advance expiration/limit transitions using monotonic microseconds.
 * @return True only when the stopwatch has just reached its limit.
 */
bool clock_timers_tick(clock_timers_t *timers, int64_t now);
