#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "clock_config.h"
#include "clock_freshness.h"
#include "clock_form.h"
#include "clock_magic_time.h"
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
            if ((i >= 2 && i <= 4) || (j >= 2 && j <= 4)) continue;
            assert(memcmp(&fonts[i], &fonts[j], sizeof(fonts[i])) != 0);
        }
    }
    for (unsigned i = 2; i <= 4; ++i) assert(memcmp(&fonts[i], &fonts[0], sizeof(fonts[0])) == 0);
    clock_frame_t am, pm, unsynced, invalid;
    for (unsigned font = 0; font < CLOCK_FONT_COUNT; ++font) {
        clock_render(&am, true, 0, 30, true, font);
        clock_render(&pm, true, 12, 30, true, font);
        assert(memcmp(&am, &pm, sizeof(am)) == 0);
    }
    clock_render(&unsynced, false, 0, 0, false, 0);
    clock_render(&invalid, true, 24, 0, false, 0);
    assert(memcmp(&unsynced, &invalid, sizeof(invalid)) == 0);
    clock_frame_t dual, line;
    clock_render_dual(&dual, true, 5, 30, 17, 45, false, 0);
    clock_render(&line, true, 5, 30, false, 7);
    for (unsigned y = 0; y < 7; ++y) {
        assert(memcmp(dual.rows[y], line.rows[y + 4], sizeof(line.rows[0])) == 0);
    }
    clock_render(&line, true, 17, 45, false, 7);
    for (unsigned y = 0; y < 7; ++y) {
        assert(memcmp(dual.rows[y + 8], line.rows[y + 4], sizeof(line.rows[0])) == 0);
    }
    assert(!memcmp(dual.rows[7], (uint8_t[4]){0}, 4));
    assert(!memcmp(dual.rows[15], (uint8_t[4]){0}, 4));
    clock_render_dual(&dual, true, 0, 30, 12, 30, false, 0);
    clock_render(&line, true, 0, 30, false, 7);
    for (unsigned y = 0; y < 7; ++y) {
        assert(memcmp(dual.rows[y], line.rows[y + 4], sizeof(line.rows[0])) == 0);
    }
    clock_render(&line, true, 12, 30, false, 7);
    for (unsigned y = 0; y < 7; ++y) {
        assert(memcmp(dual.rows[y + 8], line.rows[y + 4], sizeof(line.rows[0])) == 0);
    }
    clock_render_dual(&dual, true, 5, 30, 17, 45, true, 1);
    int line_separator = clock_render(&line, true, 5, 30, false, 7);
    clock_render_seconds(&line, 1, 0, true, CLOCK_SECONDS_NONE, 7, line_separator);
    for (unsigned y = 0; y < 7; ++y) {
        assert(memcmp(dual.rows[y], line.rows[y + 4], sizeof(line.rows[0])) == 0);
    }
    clock_render_dual(&dual, true, 5, 30, 24, 0, false, 0);
    assert(memcmp(&dual, &unsynced, sizeof(dual)) == 0);
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
    for (unsigned font = 5; font < CLOCK_FONT_COUNT; ++font) {
        clock_render_timer(&invalid, false, 12, 34, 56, font);
        assert(memcmp(&stopwatch, &invalid, sizeof(stopwatch)) == 0);
        config.font = font;
        assert(clock_config_valid(&config));
    }
    config.font = CLOCK_FONT_COUNT;
    assert(!clock_config_valid(&config));
    config.font = 0;
    for (unsigned font = 0; font < CLOCK_FONT_COUNT; ++font) {
        for (unsigned hour = 0; hour < 24; ++hour) {
            for (unsigned minute = 0; minute < 60; ++minute) {
                clock_render(&invalid, true, hour, minute, false, font);
                assert(invalid.rows[15][0] == 0 && invalid.rows[15][1] == 0 &&
                       invalid.rows[15][2] == 0 && invalid.rows[15][3] == 0);
                unsigned left = 32, right = 0;
                for (unsigned y = 0; y < 15; ++y) {
                    for (unsigned x = 0; x < 32; ++x) {
                        if (invalid.rows[y][x / 8] & (0x80U >> (x % 8))) {
                            if (x < left) left = x;
                            if (x > right) right = x;
                        }
                    }
                }
                assert(left < 32);
                int difference = (int)left - (int)(31 - right);
                assert(difference >= -1 && difference <= 1);
            }
        }
    }
    clock_frame_t steady, animated;
    int separator = clock_render(&steady, true, 12, 45, false, 5);
    animated = steady;
    clock_render_seconds(&animated, 0, 0, true, CLOCK_SECONDS_NONE, 5, separator);
    assert(memcmp(&steady, &animated, sizeof(steady)) == 0);
    clock_render_seconds(&animated, 1, 0, true, CLOCK_SECONDS_NONE, 5, separator);
    for (unsigned row = 0; row < 16; ++row) {
        for (unsigned x = 0; x < 32; ++x) {
            bool difference = ((steady.rows[row][x / 8] ^ animated.rows[row][x / 8]) &
                               (0x80U >> (x % 8))) != 0;
            bool expected = (row == 5 || row == 6 || row == 9 || row == 10) &&
                            (x == (unsigned)separator || x == (unsigned)separator + 1);
            assert(difference == expected);
        }
    }
    animated = steady;
    clock_render_seconds(&animated, 0, 0, false, CLOCK_SECONDS_DOT, 5, separator);
    assert(memcmp(&steady, &animated, sizeof(steady)) == 0);
    const unsigned tall_fonts[] = {5, 6, 8, 11, 13};
    for (unsigned i = 0; i < sizeof(tall_fonts) / sizeof(tall_fonts[0]); ++i) {
        separator = clock_render(&steady, true, 12, 45, false, tall_fonts[i]);
        for (unsigned effect = CLOCK_SECONDS_DOT; effect < CLOCK_SECONDS_ANIMATION_COUNT; ++effect) {
            animated = steady;
            clock_render_seconds(&animated, 17, 400, false, effect, tall_fonts[i], separator);
            assert(memcmp(&steady, &animated, sizeof(steady)) == 0);
        }
    }
    separator = clock_render(&steady, true, 12, 45, false, 7);
    animated = steady;
    clock_render_seconds(&animated, 1, 0, true, CLOCK_SECONDS_NONE, 7, separator);
    for (unsigned row = 0; row < 16; ++row) {
        for (unsigned x = 0; x < 32; ++x) {
            bool difference = ((steady.rows[row][x / 8] ^ animated.rows[row][x / 8]) &
                               (0x80U >> (x % 8))) != 0;
            assert(difference == ((row == 5 || row == 9) && x == (unsigned)separator));
        }
    }
    animated = steady;
    clock_render_seconds(&animated, 0, 0, false, CLOCK_SECONDS_DOT, 7, separator);
    assert(animated.rows[15][0] == 0x80 && animated.rows[15][3] == 0);
    animated = steady;
    clock_render_seconds(&animated, 59, 0, false, CLOCK_SECONDS_DOT, 7, separator);
    assert(animated.rows[15][0] == 0 && animated.rows[15][3] == 0x01);
    animated = steady;
    clock_render_seconds(&animated, 0, 0, false, CLOCK_SECONDS_PROGRESS, 7, separator);
    assert(animated.rows[15][0] == 0x80 && animated.rows[15][3] == 0);
    animated = steady;
    clock_render_seconds(&animated, 29, 0, false, CLOCK_SECONDS_PROGRESS, 7, separator);
    assert(animated.rows[15][0] == 0xff && animated.rows[15][1] == 0xff &&
           animated.rows[15][2] == 0 && animated.rows[15][3] == 0);
    animated = steady;
    clock_render_seconds(&animated, 59, 0, false, CLOCK_SECONDS_PROGRESS, 7, separator);
    for (unsigned col = 0; col < 4; ++col) assert(animated.rows[15][col] == 0xff);
    animated = steady;
    clock_render_seconds(&animated, 60, 0, true, CLOCK_SECONDS_PROGRESS, 7, separator);
    assert(memcmp(&animated, &steady, sizeof(steady)) == 0);
    for (unsigned effect = CLOCK_SECONDS_BOUNCE; effect <= CLOCK_SECONDS_JUMP; ++effect) {
        animated = steady;
        clock_render_seconds(&animated, 1, 400, false, effect, 7, separator);
        assert(memcmp(&animated, &steady, sizeof(steady)) != 0);
        for (unsigned row = 0; row < 12; ++row) {
            assert(memcmp(animated.rows[row], steady.rows[row], 4) == 0);
        }
    }
    assert(clock_connection_phase(false, 0, 0) == CLOCK_CONNECTING);
    assert(clock_connection_phase(true, 1000000, 2999999) == CLOCK_CONNECTION_RSSI);
    assert(clock_connection_phase(true, 1000000, 3000000) == CLOCK_CONNECTION_IP);
    assert(clock_connection_phase(true, 1000000, 4999999) == CLOCK_CONNECTION_IP);
    assert(clock_connection_phase(true, 1000000, 5000000) == CLOCK_CONNECTION_DONE);
    assert(clock_connection_phase(false, 1000000, 6000000) == CLOCK_CONNECTING);
    assert(clock_connection_phase(true, 6000000, 6000000) == CLOCK_CONNECTION_RSSI);
    clock_render_connection(&animated, CLOCK_CONNECTING, false, 0, 0);
    assert(memcmp(&animated, &blank, sizeof(blank)) != 0);
    clock_render_connection(&animated, CLOCK_CONNECTION_RSSI, true, -55, 0);
    assert(memcmp(&animated, &blank, sizeof(blank)) != 0);
    clock_render_connection(&steady, CLOCK_CONNECTION_RSSI, false, 0, 0);
    assert(memcmp(&animated, &steady, sizeof(steady)) != 0);
    clock_render_connection(&animated, CLOCK_CONNECTION_RSSI, true, -129, 0);
    assert(memcmp(&animated, &steady, sizeof(steady)) == 0);
    clock_render_connection(&animated, CLOCK_CONNECTION_IP, false, 0, 102);
    assert(memcmp(&animated, &blank, sizeof(blank)) != 0);
    clock_render_connection(&animated, CLOCK_CONNECTION_DONE, false, 0, 0);
    assert(memcmp(&animated, &unsynced, sizeof(unsynced)) == 0);

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
    const char *zones = "timezone_secondary_enabled=1&timezone_secondary=America%2FNew_York";
    assert(clock_form_parse(&form, zones, strlen(zones)));
    assert(strcmp(clock_form_value(&form, "timezone_secondary_enabled"), "1") == 0);
    assert(strcmp(clock_form_value(&form, "timezone_secondary"), "America/New_York") == 0);
    const char *long_name = "abcdefghijklmnopqrstuvwxyzabcdef=1";
    assert(!clock_form_parse(&form, long_name, strlen(long_name)));
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

    /* Interesting-time classifier tests */
    assert(clock_magic_classify(1, 23, false) == CLOCK_MAGIC_SEQUENCE);
    assert(clock_magic_classify(1, 23, true) == CLOCK_MAGIC_SEQUENCE);
    assert(clock_magic_classify(13, 23, true) == CLOCK_MAGIC_SEQUENCE);
    assert(clock_magic_classify(23, 45, false) == CLOCK_MAGIC_SEQUENCE);
    assert(clock_magic_classify(23, 45, true) == CLOCK_MAGIC_NONE);
    assert(clock_magic_classify(1, 11, false) == CLOCK_MAGIC_REPDIGIT);
    assert(clock_magic_classify(1, 11, true) == CLOCK_MAGIC_REPDIGIT);
    assert(clock_magic_classify(0, 0, false) == CLOCK_MAGIC_REPDIGIT);
    assert(clock_magic_classify(0, 0, true) == CLOCK_MAGIC_NONE);
    assert(clock_magic_classify(11, 11, false) == CLOCK_MAGIC_REPDIGIT);
    assert(clock_magic_classify(11, 11, true) == CLOCK_MAGIC_REPDIGIT);
    assert(clock_magic_classify(22, 22, false) == CLOCK_MAGIC_REPDIGIT);
    assert(clock_magic_classify(22, 22, true) == CLOCK_MAGIC_NONE);
    assert(clock_magic_classify(12, 21, false) == CLOCK_MAGIC_PALINDROME);
    assert(clock_magic_classify(12, 21, true) == CLOCK_MAGIC_PALINDROME);
    assert(clock_magic_classify(3, 21, false) == CLOCK_MAGIC_SEQUENCE);
    assert(clock_magic_classify(3, 21, true) == CLOCK_MAGIC_SEQUENCE);
    assert(clock_magic_classify(14, 27, false) == CLOCK_MAGIC_NONE);
    assert(clock_magic_classify(14, 27, true) == CLOCK_MAGIC_NONE);
    assert(clock_magic_classify(-1, 0, false) == CLOCK_MAGIC_NONE);
    assert(clock_magic_classify(24, 0, false) == CLOCK_MAGIC_NONE);

    /* Magic-time musical track active & PWM note tests */
    for (unsigned track = 0; track < CLOCK_MAGIC_TRACK_COUNT; ++track) {
        bool finished = true;
        uint32_t start_freq = clock_sound_magic_note(track, 0, &finished);
        assert(!finished && start_freq > 0);
        assert(clock_sound_magic_active(track, 0));
        bool end_finished = false;
        assert(clock_sound_magic_note(track, 10000, &end_finished) == 0);
        assert(end_finished);
        assert(!clock_sound_magic_active(track, 10000));
    }
    bool bad_finished = false;
    assert(clock_sound_magic_note(CLOCK_MAGIC_TRACK_COUNT, 0, &bad_finished) == 0);
    assert(bad_finished);
    assert(!clock_sound_magic_active(CLOCK_MAGIC_TRACK_COUNT, 0));

    puts("clock logic tests passed");
    return 0;
}
