#include "clock_config.h"

#include <string.h>

void clock_config_defaults(clock_config_t *config)
{
    memset(config, 0, sizeof(*config));
    config->brightness = 50;
    for (unsigned i = 0; i < CLOCK_ALARM_COUNT; ++i) {
        config->alarms[i].duration_seconds = 10;
    }
}

bool clock_alarm_duration_valid(unsigned seconds)
{
    return seconds == 5 || seconds == 15 || seconds == 45 || seconds == 240 ||
           seconds == 300 || (seconds >= 10 && seconds <= 180 && seconds % 10 == 0);
}

bool clock_config_valid(const clock_config_t *config)
{
    if (!config || config->brightness > 100 || config->font >= CLOCK_FONT_COUNT ||
        config->format_12h > 1 || config->hourly_enabled > 1 ||
        config->hourly_pattern >= CLOCK_SOUND_COUNT) {
        return false;
    }
    for (unsigned i = 0; i < CLOCK_ALARM_COUNT; ++i) {
        const clock_alarm_t *alarm = &config->alarms[i];
        if (alarm->enabled > 1 || alarm->hour > 23 || alarm->minute > 59 ||
            alarm->repeat > ALARM_DAILY ||
            !clock_alarm_duration_valid(alarm->duration_seconds)) {
            return false;
        }
    }
    return true;
}
