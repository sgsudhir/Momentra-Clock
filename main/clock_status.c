#include "clock_status.h"
#include "clock_version.h"

#include <stdio.h>
#include <string.h>

static bool append_json_str(char *buffer, size_t capacity, size_t *used, const char *src)
{
    static const char hex[] = "0123456789abcdef";
    if (*used >= capacity) return false;
    buffer[(*used)++] = '"';
    for (size_t i = 0; src && src[i] != '\0'; ++i) {
        unsigned char c = (unsigned char)src[i];
        char esc[7];
        size_t len = 1;
        if (c == '"' || c == '\\') {
            esc[0] = '\\';
            esc[1] = (char)c;
            len = 2;
        } else if (c == '\b') {
            memcpy(esc, "\\b", 2);
            len = 2;
        } else if (c == '\f') {
            memcpy(esc, "\\f", 2);
            len = 2;
        } else if (c == '\n') {
            memcpy(esc, "\\n", 2);
            len = 2;
        } else if (c == '\r') {
            memcpy(esc, "\\r", 2);
            len = 2;
        } else if (c == '\t') {
            memcpy(esc, "\\t", 2);
            len = 2;
        } else if (c < 0x20) {
            esc[0] = '\\';
            esc[1] = 'u';
            esc[2] = '0';
            esc[3] = '0';
            esc[4] = hex[c >> 4];
            esc[5] = hex[c & 0x0f];
            len = 6;
        } else {
            esc[0] = (char)c;
        }
        if (*used + len >= capacity) return false;
        memcpy(buffer + *used, esc, len);
        *used += len;
    }
    if (*used + 1 >= capacity) return false;
    buffer[(*used)++] = '"';
    return true;
}

bool clock_status_json(const clock_status_t *status, char *buffer, size_t capacity)
{
    if (!status || !buffer || !capacity) return false;
    /* Prepare JSON tokens for optional fields: unavailable values are null,
     * rather than misleading zeroes. String fields are escaped defensively. */
    char rssi[16], age[24], timestamp[24], timestamp_ms[24], offset1[16], offset2[16];
    char ip[20];
    if (status->ip_valid) {
        snprintf(ip, sizeof(ip), "\"%u.%u.%u.%u\"", status->ip[0], status->ip[1],
                 status->ip[2], status->ip[3]);
    } else {
        strcpy(ip, "null");
    }
    if (status->rssi_valid) snprintf(rssi, sizeof(rssi), "%d", status->wifi_rssi);
    else strcpy(rssi, "null");
    if (status->sync_age_seconds >= 0) {
        snprintf(age, sizeof(age), "%lld", (long long)status->sync_age_seconds);
    } else {
        strcpy(age, "null");
    }
    if (status->time_valid) {
        snprintf(timestamp, sizeof(timestamp), "%lld", (long long)status->unix_time);
        snprintf(timestamp_ms, sizeof(timestamp_ms), "%lld", (long long)status->unix_time_ms);
    } else {
        strcpy(timestamp, "null");
        strcpy(timestamp_ms, "null");
    }

    const clock_config_t *config = &status->config;
    if (!clock_timezone_valid(config->timezone_primary) ||
        !clock_timezone_valid(config->timezone_secondary)) return false;
    int32_t first_offset, second_offset;
    bool offsets_valid = status->time_valid &&
        clock_timezone_offset(config->timezone_primary, status->unix_time, &first_offset) &&
        clock_timezone_offset(config->timezone_secondary, status->unix_time, &second_offset);
    if (offsets_valid) {
        snprintf(offset1, sizeof(offset1), "%d", (int)first_offset);
        snprintf(offset2, sizeof(offset2), "%d", (int)second_offset);
    } else {
        strcpy(offset1, "null");
        strcpy(offset2, "null");
    }
    size_t used = 0;
    int length = snprintf(buffer, capacity, "{\"firmware_version\":");
    if (length < 0 || (size_t)length >= capacity) return false;
    used = (size_t)length;
    if (!append_json_str(buffer, capacity, &used, CLOCK_FIRMWARE_VERSION)) return false;
    length = snprintf(buffer + used, capacity - used,
        ",\"uptime_seconds\":%lld,\"free_heap_bytes\":%u,\"min_free_heap_bytes\":%u,"
        "\"wifi_connected\":%s,\"setup_ap\":%s,\"wifi_rssi\":%s,\"local_ip\":%s,"
        "\"chip_id\":\"%02X%02X%02X%02X%02X%02X\","
        "\"wifi_mac\":\"%02X:%02X:%02X:%02X:%02X:%02X\","
        "\"time_valid\":%s,\"unix_time\":%s,\"unix_time_ms\":%s,\"sync_age_seconds\":%s,"
        "\"display_ready\":%s,\"buzzer_configured\":%s,"
        "\"ringing\":%s,\"ringing_mask\":%u,"
        "\"stopwatch_state\":%u,\"stopwatch_ms\":%lld,"
        "\"reminder_state\":%u,\"reminder_ms\":%lld,\"brightness\":%u,\"font\":%u,"
        "\"format_12h\":%u,\"hourly_enabled\":%u,\"hourly_pattern\":%u,"
        "\"feedback_enabled\":%u,\"colon_blink\":%u,\"seconds_animation\":%u,"
        "\"timezone_primary\":",
        (long long)status->uptime_seconds, (unsigned)status->free_heap_bytes,
        (unsigned)status->min_free_heap_bytes, status->wifi_connected ? "true" : "false",
        status->setup_ap ? "true" : "false", rssi, ip,
        status->chip_id[0], status->chip_id[1], status->chip_id[2],
        status->chip_id[3], status->chip_id[4], status->chip_id[5],
        status->wifi_mac[0], status->wifi_mac[1], status->wifi_mac[2],
        status->wifi_mac[3], status->wifi_mac[4], status->wifi_mac[5],
        status->time_valid ? "true" : "false",
        timestamp, timestamp_ms, age, status->display_ready ? "true" : "false",
        status->buzzer_configured ? "true" : "false", status->ringing ? "true" : "false",
        status->ringing_mask, (unsigned)status->stopwatch_state, (long long)status->stopwatch_ms,
        (unsigned)status->reminder_state, (long long)status->reminder_ms,
        config->brightness, config->font, config->format_12h,
        config->hourly_enabled, config->hourly_pattern, config->feedback_enabled,
        config->colon_blink, config->seconds_animation);
    if (length < 0 || (size_t)length >= capacity - used) return false;
    used += (size_t)length;
    if (!append_json_str(buffer, capacity, &used, config->timezone_primary)) return false;
    length = snprintf(buffer + used, capacity - used, ",\"timezone_secondary\":");
    if (length < 0 || (size_t)length >= capacity - used) return false;
    used += (size_t)length;
    if (!append_json_str(buffer, capacity, &used, config->timezone_secondary)) return false;
    int magic_track = status->magic_playing ? status->magic_track : -1;
    length = snprintf(buffer + used, capacity - used,
        ",\"timezone_secondary_enabled\":%u,\"timezone_primary_offset\":%s,"
        "\"timezone_secondary_offset\":%s,"
        "\"magic_enabled\":%u,\"magic_pwm\":%u,"
        "\"magic_playing\":%s,\"magic_track\":%d,\"alarms\":[",
        config->timezone_secondary_enabled, offset1, offset2,
        config->magic_enabled, config->magic_pwm,
        status->magic_playing ? "true" : "false", magic_track);
    if (length < 0 || (size_t)length >= capacity - used) return false;
    /* snprintf reports the required size even on truncation. Check every
     * append before advancing the cursor, including space for the final NUL. */
    used += (size_t)length;
    for (unsigned i = 0; i < CLOCK_ALARM_COUNT; ++i) {
        const clock_alarm_t *item = &config->alarms[i];
        length = snprintf(buffer + used, capacity - used,
                          "%s{\"enabled\":%u,\"hour\":%u,\"minute\":%u,"
                          "\"repeat\":%u,\"duration_seconds\":%u}",
                          i ? "," : "", item->enabled, item->hour, item->minute,
                          item->repeat, item->duration_seconds);
        if (length < 0 || (size_t)length >= capacity - used) return false;
        used += length;
    }
    length = snprintf(buffer + used, capacity - used, "],\"alarm_next_seconds\":[");
    if (length < 0 || (size_t)length >= capacity - used) return false;
    used += length;
    for (unsigned i = 0; i < CLOCK_ALARM_COUNT; ++i) {
        const clock_alarm_t *item = &config->alarms[i];
        int64_t next;
        bool available = status->time_valid && item->enabled &&
            clock_timezone_next_alarm(config->timezone_primary, status->unix_time,
                                      item->hour, item->minute, &next);
        if (available) {
            length = snprintf(buffer + used, capacity - used, "%s%lld", i ? "," : "",
                              (long long)(next - status->unix_time));
        } else {
            length = snprintf(buffer + used, capacity - used, "%snull", i ? "," : "");
        }
        if (length < 0 || (size_t)length >= capacity - used) return false;
        used += length;
    }
    if (capacity - used < 3) return false;
    memcpy(buffer + used, "]}", 3);
    return true;
}
