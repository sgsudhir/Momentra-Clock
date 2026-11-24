#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "clock_config.h"
#include "clock_timer_logic.h"

typedef struct {
    clock_config_t config;
    int64_t uptime_seconds;
    uint32_t free_heap_bytes;
    uint32_t min_free_heap_bytes;
    bool wifi_connected;
    bool setup_ap;
    bool rssi_valid;
    int wifi_rssi;
    bool ip_valid;
    uint8_t ip[4];
    uint8_t chip_id[6];
    uint8_t wifi_mac[6];
    bool time_valid;
    int64_t unix_time;
    int64_t unix_time_ms;
    int64_t sync_age_seconds;
    bool display_ready;
    bool buzzer_configured;
    bool ringing;
    uint8_t ringing_mask;
    clock_timer_state_t stopwatch_state;
    int64_t stopwatch_ms;
    clock_timer_state_t reminder_state;
    int64_t reminder_ms;
} clock_status_t;

bool clock_status_json(const clock_status_t *status, char *buffer, size_t capacity);
