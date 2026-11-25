#include <assert.h>
#include <stdio.h>

#include "clock_status.h"

int main(void)
{
    clock_status_t status = {.uptime_seconds = 42, .sync_age_seconds = -1};
    clock_config_defaults(&status.config);
    char output[1400];
    char tiny[10];
    assert(!clock_status_json(&status, tiny, sizeof(tiny)));
    assert(clock_status_json(&status, output, sizeof(output)));
    puts(output);
    status.wifi_connected = true;
    status.rssi_valid = true;
    status.wifi_rssi = -67;
    status.ip_valid = true;
    status.ip[0] = 192;
    status.ip[1] = 168;
    status.ip[2] = 1;
    status.ip[3] = 23;
    status.chip_id[0] = 0x12;
    status.chip_id[5] = 0xab;
    status.wifi_mac[0] = 0x34;
    status.wifi_mac[5] = 0xcd;
    status.time_valid = true;
    status.unix_time = 1700000000;
    status.unix_time_ms = INT64_C(1700000000123);
    status.sync_age_seconds = 15;
    status.ringing = true;
    status.ringing_mask = 4;
    status.stopwatch_state = TIMER_RUNNING;
    status.stopwatch_ms = 1234;
    status.reminder_state = TIMER_PAUSED;
    status.reminder_ms = 5000;
    status.config.feedback_enabled = 0;
    status.config.colon_blink = 1;
    status.config.seconds_animation = CLOCK_SECONDS_PROGRESS;
    status.config.alarms[2] = (clock_alarm_t){1, 7, 30, ALARM_DAILY, 180};
    assert(clock_status_json(&status, output, sizeof(output)));
    puts(output);
    status.uptime_seconds = INT64_MAX;
    status.free_heap_bytes = UINT32_MAX;
    status.min_free_heap_bytes = UINT32_MAX;
    status.wifi_rssi = INT32_MIN;
    status.unix_time = INT64_MAX;
    status.unix_time_ms = INT64_MAX;
    status.sync_age_seconds = INT64_MAX;
    status.stopwatch_ms = INT64_MAX;
    status.reminder_ms = INT64_MAX;
    for (unsigned i = 0; i < 4; ++i) status.ip[i] = UINT8_MAX;
    for (unsigned i = 0; i < CLOCK_ALARM_COUNT; ++i) {
        status.config.alarms[i] = (clock_alarm_t){1, 23, 59, ALARM_DAILY, 300};
    }
    assert(clock_status_json(&status, output, sizeof(output)));
    return 0;
}
