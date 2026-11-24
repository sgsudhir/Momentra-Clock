#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "clock_config.h"
#include "clock_freshness.h"
#include "clock_form.h"
#include "clock_render.h"
#include "clock_scan.h"
#include "clock_schedule.h"
#include "clock_sound.h"

int main(void)
{
    clock_config_t config;
    clock_config_defaults(&config);
    assert(clock_config_valid(&config));
    config.alarms[0] = (clock_alarm_t){1, 5, 30, ALARM_ONCE, 5};
    config.alarms[1] = (clock_alarm_t){1, 5, 30, ALARM_DAILY, 180};
    config.hourly_enabled = 1;
    assert(clock_config_valid(&config));

    clock_schedule_t schedule;
    clock_schedule_init(&schedule);
    assert(clock_schedule_check(&schedule, &config, 0, false).alarms == 0);
    clock_events_t event = clock_schedule_check(&schedule, &config, 0, true);
    assert(event.alarms == 3 && !event.hourly);
    assert(clock_schedule_check(&schedule, &config, 59, true).alarms == 0);
    assert(clock_schedule_check(&schedule, &config, 3600, true).alarms == 0);
    assert(clock_schedule_check(&schedule, &config, 0, true).alarms == 0);
    event = clock_schedule_check(&schedule, &config, 86400, true);
    assert(event.alarms == 3);
    event = clock_schedule_check(&schedule, &config, 88200, true);
    assert(event.hourly);
    assert(!clock_schedule_check(&schedule, &config, 88201, true).hourly);

    const char *chimes[] = {
        "11111100000000000000",
        "11100111000000000000",
        "10010010000000000000",
        "10101111100000000000",
    };
    for (unsigned pattern = 0; pattern < CLOCK_SOUND_COUNT; ++pattern) {
        for (unsigned tick = 0; tick < 20; ++tick) {
            assert(clock_sound_chime(pattern, tick * 100) == (chimes[pattern][tick] == '1'));
            assert(clock_sound_chime(pattern, tick * 100 + 99) == (chimes[pattern][tick] == '1'));
        }
    }
    assert(!clock_sound_chime(CLOCK_SOUND_COUNT, 0));
    assert(!clock_sound_chime(0, UINT64_MAX));
    for (unsigned tick = 0; tick < 48; ++tick) {
        bool alarm_on = tick % 16 < 8 && tick % 2 == 0;
        assert(clock_sound_alarm(tick * 75) == alarm_on);
        assert(clock_sound_alarm(tick * 75 + 74) == alarm_on);
    }
    for (unsigned tick = 0; tick < 30; ++tick) {
        assert(clock_sound_reminder(tick * 100) == (tick % 4 < 2));
        assert(clock_sound_reminder(tick * 100 + 99) == (tick % 4 < 2));
    }

    assert(!clock_sync_is_fresh(-1, 0));
    assert(!clock_sync_is_fresh(100, 99));
    assert(clock_sync_is_fresh(100, 100));
    assert(clock_sync_is_fresh(100, 99 + (int64_t)CLOCK_SYNC_MAX_AGE_SECONDS * 1000000));
    assert(!clock_sync_is_fresh(100, 100 + (int64_t)CLOCK_SYNC_MAX_AGE_SECONDS * 1000000));
    assert(!clock_sync_is_fresh(100, 101 + (int64_t)CLOCK_SYNC_MAX_AGE_SECONDS * 1000000));

    clock_frame_t fonts[CLOCK_FONT_COUNT];
    for (unsigned i = 0; i < CLOCK_FONT_COUNT; ++i) {
        clock_render(&fonts[i], true, 12, 45, false, i);
        for (unsigned j = 0; j < i; ++j) {
            assert(memcmp(&fonts[i], &fonts[j], sizeof(fonts[i])) != 0);
        }
    }
    clock_frame_t am, pm, unsynced, invalid;
    clock_render(&am, true, 0, 30, true, 0);
    clock_render(&pm, true, 12, 30, true, 0);
    assert(memcmp(&am, &pm, sizeof(am)) != 0);
    clock_render(&unsynced, false, 0, 0, false, 0);
    clock_render(&invalid, true, 24, 0, false, 0);
    assert(memcmp(&unsynced, &invalid, sizeof(invalid)) == 0);
    clock_frame_t stopwatch, reminder;
    clock_render_timer(&stopwatch, false, 12, 34, 56, 0);
    clock_render_timer(&reminder, true, 12, 34, 56, 0);
    assert(memcmp(&stopwatch, &reminder, sizeof(stopwatch)) != 0);
    clock_render_timer(&invalid, false, 12, 34, 59, 0);
    assert(memcmp(&stopwatch, &invalid, sizeof(stopwatch)) == 0);
    clock_render_timer(&invalid, false, 12, 34, 60, 0);
    assert(memcmp(&stopwatch, &invalid, sizeof(stopwatch)) != 0);
    clock_render_timer(&invalid, false, 100, 0, 0, 0);
    clock_frame_t blank = {0};
    assert(memcmp(&invalid, &blank, sizeof(blank)) == 0);
    for (unsigned font = 0; font < CLOCK_FONT_COUNT; ++font) {
        for (unsigned hour = 0; hour < 24; ++hour) {
            for (unsigned minute = 0; minute < 60; ++minute) {
                clock_render(&invalid, true, hour, minute, false, font);
            }
        }
    }

    clock_frame_t scan = {0};
    for (unsigned col = 0; col < 4; ++col) {
        scan.rows[2][col] = 0x10 + col;
        scan.rows[6][col] = 0x20 + col;
        scan.rows[10][col] = 0x40 + col;
        scan.rows[14][col] = 0x80 + col;
    }
    const uint8_t expected[] = {
        0x80, 0x40, 0x20, 0x10, 0x81, 0x41, 0x21, 0x11,
        0x82, 0x42, 0x22, 0x12, 0x83, 0x43, 0x23, 0x13,
    };
    uint8_t bytes[16];
    assert(clock_scan_encode(&scan, 2, false, bytes));
    assert(memcmp(bytes, expected, sizeof(expected)) == 0);
    assert(clock_scan_encode(&scan, 2, true, bytes));
    for (unsigned i = 0; i < sizeof(bytes); ++i) {
        assert(bytes[i] == (uint8_t)(expected[i] ^ 0xffU));
    }
    for (unsigned row = 0; row < 4; ++row) {
        if (row == 2) continue;
        assert(clock_scan_encode(&scan, row, true, bytes));
        for (unsigned i = 0; i < sizeof(bytes); ++i) assert(bytes[i] == 0xff);
    }
    assert(!clock_scan_encode(&scan, 4, true, bytes));
    assert(!clock_scan_encode(NULL, 0, true, bytes));
    assert(!clock_scan_encode(&scan, 0, true, NULL));

    clock_form_t form;
    const char *wifi = "ssid=Home+WiFi&password=a%26b%3Dc";
    assert(clock_form_parse(&form, wifi, strlen(wifi)));
    assert(strcmp(clock_form_value(&form, "ssid"), "Home WiFi") == 0);
    assert(strcmp(clock_form_value(&form, "password"), "a&b=c") == 0);
    const char *duplicate = "a=1&%61=2";
    assert(!clock_form_parse(&form, duplicate, strlen(duplicate)));
    const char *bad_escape = "a=%00";
    assert(!clock_form_parse(&form, bad_escape, strlen(bad_escape)));
    const char *bad_trailing = "a=1&";
    assert(!clock_form_parse(&form, bad_trailing, strlen(bad_trailing)));
    const char *numeric = "level=101";
    int number;
    assert(clock_form_parse(&form, numeric, strlen(numeric)));
    assert(!clock_form_int(&form, "level", 0, 100, &number));

    const unsigned durations[] = {5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 180, 240, 300};
    for (unsigned i = 0; i < sizeof(durations) / sizeof(durations[0]); ++i) {
        config.alarms[0].duration_seconds = durations[i];
        assert(clock_config_valid(&config));
    }
    config.alarms[0].duration_seconds = 40;
    assert(clock_config_valid(&config));
    config.alarms[0].duration_seconds = 190;
    assert(!clock_config_valid(&config));
    config.alarms[0].duration_seconds = 10;
    config.brightness = 101;
    assert(!clock_config_valid(&config));
    puts("clock logic tests passed");
    return 0;
}
