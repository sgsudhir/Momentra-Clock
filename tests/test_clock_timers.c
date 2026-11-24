#include <assert.h>
#include <stdio.h>

#include "clock_timer_logic.h"

int main(void)
{
    clock_timers_t timers = {0};
    assert(!clock_timers_command(&timers, true, TIMER_START, 0, 0));
    assert(!clock_timers_command(&timers, true, TIMER_START, 86401, 0));
    assert(clock_timers_command(&timers, false, TIMER_START, 0, 1000000));
    assert(clock_timers_command(&timers, true, TIMER_START, 60, 1000000));
    assert(clock_timer_value(&timers.stopwatch, false, 3500000) == 2500000);
    assert(clock_timer_value(&timers.reminder, true, 3500000) == 57500000);
    assert(clock_timers_command(&timers, true, TIMER_PAUSE, 0, 3500000));
    assert(clock_timer_value(&timers.reminder, true, 9000000) == 57500000);
    assert(clock_timers_command(&timers, true, TIMER_RESUME, 0, 9000000));
    assert(clock_timers_command(&timers, false, TIMER_PAUSE, 0, 9000000));
    assert(clock_timer_value(&timers.stopwatch, false, 10000000) == 8000000);
    assert(clock_timers_command(&timers, false, TIMER_RESUME, 0, 10000000));
    assert(!clock_timers_tick(&timers, 66499999));
    assert(timers.reminder.state == TIMER_RUNNING);
    assert(!clock_timers_tick(&timers, 66500000));
    assert(timers.reminder.state == TIMER_RINGING);
    assert(!clock_timers_tick(&timers, 81499999));
    assert(timers.reminder.state == TIMER_RINGING);
    assert(!clock_timers_tick(&timers, 81500000));
    assert(timers.reminder.state == TIMER_IDLE);
    assert(clock_timers_tick(&timers, CLOCK_STOPWATCH_MAX_US + 2000000));
    assert(timers.stopwatch.state == TIMER_PAUSED);
    assert(timers.stopwatch.value_us == CLOCK_STOPWATCH_MAX_US);
    assert(!clock_timers_command(&timers, false, TIMER_RESUME, 0, CLOCK_STOPWATCH_MAX_US + 2000000));
    assert(clock_timers_command(&timers, false, TIMER_STOP, 0, CLOCK_STOPWATCH_MAX_US + 2000000));
    assert(clock_timers_command(&timers, true, TIMER_START, 86400, 0));
    assert(!clock_timers_command(&timers, true, TIMER_START, 1, 0));
    assert(!clock_timers_command(&timers, true, TIMER_PAUSE, 0, INT64_C(86400000000)));
    assert(!clock_timers_tick(&timers, INT64_C(86400000000)));
    assert(timers.reminder.state == TIMER_RINGING);
    assert(clock_timers_command(&timers, true, TIMER_STOP, 0, INT64_C(86401000000)));
    assert(clock_timers_command(&timers, true, TIMER_START, 86400, 0));
    assert(clock_timers_command(&timers, true, TIMER_STOP, 0, 500000));
    assert(timers.reminder.state == TIMER_IDLE);
    puts("timer tests passed");
    return 0;
}
