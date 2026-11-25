#pragma once

#include <stdbool.h>
#include <stdint.h>

#define CLOCK_ALARM_COUNT 5
#define CLOCK_FONT_COUNT 15
#define CLOCK_SOUND_COUNT 4

typedef enum {
    CLOCK_SECONDS_NONE = 0,
    CLOCK_SECONDS_DOT,
    CLOCK_SECONDS_PROGRESS,
    CLOCK_SECONDS_BOUNCE,
    CLOCK_SECONDS_JUMP,
    CLOCK_SECONDS_ANIMATION_COUNT,
} clock_seconds_animation_t;

typedef enum {
    ALARM_ONCE = 0,
    ALARM_DAILY = 1,
} alarm_repeat_t;

typedef struct {
    uint8_t enabled;
    uint8_t hour;
    uint8_t minute;
    uint8_t repeat;
    uint16_t duration_seconds;
} clock_alarm_t;

typedef struct {
    uint8_t brightness;
    uint8_t font;
    uint8_t format_12h;
    uint8_t hourly_enabled;
    uint8_t hourly_pattern;
    clock_alarm_t alarms[CLOCK_ALARM_COUNT];
    uint8_t feedback_enabled;
    uint8_t colon_blink;
    uint8_t seconds_animation;
} clock_config_t;

void clock_config_defaults(clock_config_t *config);
bool clock_alarm_duration_valid(unsigned seconds);
bool clock_config_valid(const clock_config_t *config);
