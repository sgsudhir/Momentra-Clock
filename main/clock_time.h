#pragma once

#include <stdbool.h>
#include <stdint.h>
#include <time.h>

#include "esp_err.h"

typedef struct {
    bool valid;
    int64_t sync_age_seconds;
    time_t unix_time;
    int64_t unix_time_ms;
} clock_time_snapshot_t;

esp_err_t clock_time_init(void);
esp_err_t clock_time_start_sync(void);
clock_time_snapshot_t clock_time_snapshot(void);
