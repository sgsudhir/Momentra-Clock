#include "clock_time.h"

#include <stdlib.h>
#include <sys/time.h>

#include "clock_freshness.h"
#include "esp_netif_sntp.h"
#include "esp_log.h"
#include "esp_sntp.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"

/* The SNTP callback and readers can run in different tasks. Keep the critical
 * section short: it protects only the monotonic timestamp, not wall time. */
static portMUX_TYPE sync_lock = portMUX_INITIALIZER_UNLOCKED;
static int64_t last_sync_us = -1; /* -1 means no successful sync since boot. */

/** Record a successful SNTP update.
 * @param time_value Time supplied by ESP-IDF; wall time is read separately.
 * @return Nothing. Called by the SNTP subsystem.
 */
static void on_time_sync(struct timeval *time_value)
{
    (void)time_value;
    int64_t now = esp_timer_get_time();
    portENTER_CRITICAL(&sync_lock);
    last_sync_us = now;
    portEXIT_CRITICAL(&sync_lock);
}

esp_err_t clock_time_init(void)
{
    /* POSIX TZ signs are reversed: IST-5:30 denotes UTC+05:30. SNTP is
     * initialized now but started only after the station obtains an IP. */
    if (setenv("TZ", "IST-5:30", 1) != 0) {
        return ESP_FAIL;
    }
    tzset();
    esp_sntp_set_sync_interval(60 * 1000);
    esp_sntp_config_t config = ESP_NETIF_SNTP_DEFAULT_CONFIG("pool.ntp.org");
    config.start = false;
    config.sync_cb = on_time_sync;
    return esp_netif_sntp_init(&config);
}

esp_err_t clock_time_start_sync(void)
{
    return esp_netif_sntp_start();
}

clock_time_snapshot_t clock_time_snapshot(void)
{
    portENTER_CRITICAL(&sync_lock);
    int64_t sync_us = last_sync_us;
    portEXIT_CRITICAL(&sync_lock);
    int64_t now_us = esp_timer_get_time();

    /* Freshness uses monotonic time so an NTP correction cannot make an old
     * synchronization appear new. gettimeofday() supplies the wall time. */
    clock_time_snapshot_t result = {
        .valid = clock_sync_is_fresh(sync_us, now_us),
        .sync_age_seconds = sync_us < 0 || now_us < sync_us ? -1 : (now_us - sync_us) / 1000000,
        .unix_time = 0,
    };
    if (result.valid) {
        struct timeval wall_time;
        if (gettimeofday(&wall_time, NULL) != 0) {
            ESP_LOGE("clock_time", "Could not read system time");
            result.valid = false;
        } else {
            result.unix_time = wall_time.tv_sec;
            result.unix_time_ms = (int64_t)wall_time.tv_sec * 1000 + wall_time.tv_usec / 1000;
        }
    }
    return result;
}
