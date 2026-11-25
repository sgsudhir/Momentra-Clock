#pragma once

#include <stdbool.h>
#include <stdint.h>

/* Counts are also used as exclusive upper bounds for API validation. Font IDs
 * 2-4 remain valid for compatibility, although they render as style 1. */
#define CLOCK_ALARM_COUNT 5
#define CLOCK_FONT_COUNT 15
#define CLOCK_SOUND_COUNT 4

/** Persisted animation IDs; do not reorder existing values. */
typedef enum {
    CLOCK_SECONDS_NONE = 0,
    CLOCK_SECONDS_DOT,
    CLOCK_SECONDS_PROGRESS,
    CLOCK_SECONDS_BOUNCE,
    CLOCK_SECONDS_JUMP,
    CLOCK_SECONDS_ANIMATION_COUNT,
} clock_seconds_animation_t;

/** Persisted alarm recurrence IDs. */
typedef enum {
    ALARM_ONCE = 0,
    ALARM_DAILY = 1,
} alarm_repeat_t;

/** One local-time alarm. Boolean fields use 0/1 to keep the stored layout stable. */
typedef struct {
    uint8_t enabled;          /**< Whether the alarm participates in scheduling. */
    uint8_t hour;             /**< Local hour, 0-23. */
    uint8_t minute;           /**< Minute within the hour, 0-59. */
    uint8_t repeat;           /**< A value from alarm_repeat_t. */
    uint16_t duration_seconds; /**< Buzzer duration, subject to validation. */
} clock_alarm_t;

/** Live settings. The prefix through alarms must match the legacy NVS blob. */
typedef struct {
    uint8_t brightness;        /**< Panel brightness percentage, 0-100. */
    uint8_t font;              /**< Persisted font ID. */
    uint8_t format_12h;        /**< 1 for 12-hour display, otherwise 24-hour. */
    uint8_t hourly_enabled;    /**< Enable the hourly buzzer. */
    uint8_t hourly_pattern;    /**< Chime pattern ID. */
    clock_alarm_t alarms[CLOCK_ALARM_COUNT]; /**< Alarm slots, indexed from zero. */
    uint8_t feedback_enabled;  /**< Enable short action-confirmation beeps. */
    uint8_t colon_blink;       /**< Alternate the separator on and off each second. */
    uint8_t seconds_animation; /**< A value from clock_seconds_animation_t. */
} clock_config_t;

/** Initialize *config with safe defaults, including disabled alarms.
 * @param config Non-NULL destination.
 */
void clock_config_defaults(clock_config_t *config);
/** @param seconds Requested buzzer duration. @return True for a supported duration. */
bool clock_alarm_duration_valid(unsigned seconds);
/** Validate every setting and alarm. @return False for NULL or invalid data. */
bool clock_config_valid(const clock_config_t *config);
