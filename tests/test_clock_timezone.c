#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "clock_config.h"
#include "clock_schedule.h"
#include "clock_timezone.h"

static void check_offset(const char *zone, int64_t instant, int32_t expected)
{
    int32_t actual;
    assert(clock_timezone_offset(zone, instant, &actual));
    if (actual != expected) fprintf(stderr, "%s at %lld: expected %d, got %d\n",
                                    zone, (long long)instant, expected, actual);
    assert(actual == expected);
}

int main(void)
{
    assert(clock_timezone_count() >= 590);
    for (size_t i = 0; i < clock_timezone_count(); ++i) {
        assert(clock_timezone_valid(clock_timezone_name(i)));
        if (i) assert(strcmp(clock_timezone_name(i - 1), clock_timezone_name(i)) < 0);
    }
    assert(!clock_timezone_valid("Europe/Imaginary"));
    int32_t offset;
    assert(!clock_timezone_offset("Asia/Kolkata", -1, &offset));
    assert(!clock_timezone_offset("Asia/Kolkata", INT64_C(4133980800), &offset));
    check_offset("Asia/Kolkata", 1774746000, 19800);
    check_offset("Asia/Kathmandu", 1774746000, 20700);
    check_offset("Europe/London", 1774745999, 0);
    check_offset("Europe/London", 1774746000, 3600);
    check_offset("Europe/London", 1792889999, 3600);
    check_offset("Europe/London", 1792890000, 0);
    check_offset("Africa/Casablanca", 1771120799, 3600);
    check_offset("Africa/Casablanca", 1771120800, 0);
    check_offset("Australia/Lord_Howe", 1775314799, 39600);
    check_offset("Australia/Lord_Howe", 1775314800, 37800);

    int64_t next;
    assert(clock_timezone_next_alarm("Europe/London", 1774742400, 1, 30, &next));
    assert(next == 1774830600);

    clock_config_t config;
    clock_config_defaults(&config);
    strcpy(config.timezone_primary, "America/New_York");
    config.alarms[0] = (clock_alarm_t){1, 1, 30, ALARM_DAILY, 10};
    clock_schedule_t schedule;
    clock_schedule_init(&schedule);
    assert(clock_schedule_check(&schedule, &config, 1793511000, true).alarms == 1);
    assert(clock_schedule_check(&schedule, &config, 1793514600, true).alarms == 0);
    strcpy(config.timezone_primary, "Etc/UTC");
    config.alarms[0].hour = 6;
    assert(clock_schedule_check(&schedule, &config, 1793514600, true).alarms == 1);
    puts("timezone tests passed");
    return 0;
}
