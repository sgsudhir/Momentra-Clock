#include "clock_timer_logic.h"

int64_t clock_timer_value(const clock_timer_t *timer, bool countdown, int64_t now)
{
    int64_t delta = now > timer->mark_us ? now - timer->mark_us : 0;
    if (timer->state != TIMER_RUNNING) return timer->value_us;
    if (countdown) return delta >= timer->value_us ? 0 : timer->value_us - delta;
    return delta >= CLOCK_STOPWATCH_MAX_US - timer->value_us
               ? CLOCK_STOPWATCH_MAX_US : timer->value_us + delta;
}

bool clock_timers_command(clock_timers_t *timers, bool reminder,
                          clock_timer_action_t action, unsigned seconds, int64_t now)
{
    clock_timer_t *timer = reminder ? &timers->reminder : &timers->stopwatch;
    if (action == TIMER_START) {
        if (timer->state != TIMER_IDLE ||
            (reminder && (seconds == 0 || seconds > CLOCK_REMINDER_MAX_SECONDS))) return false;
        timer->value_us = reminder ? (int64_t)seconds * 1000000 : 0;
        timer->mark_us = now;
        timer->state = TIMER_RUNNING;
        return true;
    }
    if (action == TIMER_PAUSE && timer->state == TIMER_RUNNING) {
        int64_t value = clock_timer_value(timer, reminder, now);
        if (reminder && value == 0) return false;
        timer->value_us = value;
        timer->state = TIMER_PAUSED;
        return true;
    }
    if (action == TIMER_RESUME && timer->state == TIMER_PAUSED &&
        (reminder || timer->value_us < CLOCK_STOPWATCH_MAX_US)) {
        timer->mark_us = now;
        timer->state = TIMER_RUNNING;
        return true;
    }
    if (action == TIMER_STOP && timer->state != TIMER_IDLE) {
        *timer = (clock_timer_t){0};
        return true;
    }
    return false;
}

bool clock_timers_tick(clock_timers_t *timers, int64_t now)
{
    bool stopwatch_stopped = false;
    clock_timer_t *sw = &timers->stopwatch;
    if (sw->state == TIMER_RUNNING && clock_timer_value(sw, false, now) == CLOCK_STOPWATCH_MAX_US) {
        sw->value_us = CLOCK_STOPWATCH_MAX_US;
        sw->state = TIMER_PAUSED;
        stopwatch_stopped = true;
    }
    clock_timer_t *rem = &timers->reminder;
    if (rem->state == TIMER_RUNNING && clock_timer_value(rem, true, now) == 0) {
        rem->mark_us += rem->value_us;
        rem->value_us = 0;
        rem->state = TIMER_RINGING;
    }
    if (rem->state == TIMER_RINGING && now - rem->mark_us >= INT64_C(15000000)) {
        *rem = (clock_timer_t){0};
    }
    return stopwatch_stopped;
}
