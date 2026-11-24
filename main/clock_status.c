#include "clock_status.h"

#include <stdio.h>
#include <string.h>

bool clock_status_json(const clock_status_t *status, char *buffer, size_t capacity)
{
    if (!status || !buffer || !capacity) return false;
    char rssi[16], age[24], timestamp[24], timestamp_ms[24];
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
    int length = snprintf(buffer, capacity,
        "{\"uptime_seconds\":%lld,\"free_heap_bytes\":%u,\"min_free_heap_bytes\":%u,"
        "\"wifi_connected\":%s,\"setup_ap\":%s,\"wifi_rssi\":%s,\"local_ip\":%s,"
        "\"chip_id\":\"%02X%02X%02X%02X%02X%02X\","
        "\"wifi_mac\":\"%02X:%02X:%02X:%02X:%02X:%02X\","
        "\"time_valid\":%s,\"unix_time\":%s,\"unix_time_ms\":%s,\"sync_age_seconds\":%s,"
        "\"display_ready\":%s,\"buzzer_configured\":%s,"
        "\"ringing\":%s,\"ringing_mask\":%u,"
        "\"stopwatch_state\":%u,\"stopwatch_ms\":%lld,"
        "\"reminder_state\":%u,\"reminder_ms\":%lld,\"brightness\":%u,\"font\":%u,"
        "\"format_12h\":%u,\"hourly_enabled\":%u,\"hourly_pattern\":%u,\"alarms\":[",
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
        config->hourly_enabled, config->hourly_pattern);
    if (length < 0 || (size_t)length >= capacity) return false;
    size_t used = length;
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
    if (capacity - used < 3) return false;
    memcpy(buffer + used, "]}", 3);
    return true;
}
