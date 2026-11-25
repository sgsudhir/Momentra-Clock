#pragma once

#include <stdbool.h>
#include <stdint.h>
#include <time.h>

#include "esp_err.h"

/** A point-in-time view of NTP freshness and the system wall clock.
 * The timestamp fields are meaningful only when valid is true.
 */
typedef struct {
    bool valid;                 /**< Wall time was read and the last sync is fresh. */
    int64_t sync_age_seconds;   /**< Monotonic age of last sync, or -1 if unknown. */
    time_t unix_time;           /**< UTC seconds since the Unix epoch. */
    int64_t unix_time_ms;       /**< UTC milliseconds since the Unix epoch. */
} clock_time_snapshot_t;

/** Set the India time zone and initialize, but do not start, SNTP.
 * @return ESP_OK on success; otherwise the environment or SNTP error.
 */
esp_err_t clock_time_init(void);
/** Start SNTP after the station connects. @return ESP-IDF start result. */
esp_err_t clock_time_start_sync(void);
/** Read the current time and sync age. @return A self-contained snapshot. */
clock_time_snapshot_t clock_time_snapshot(void);
