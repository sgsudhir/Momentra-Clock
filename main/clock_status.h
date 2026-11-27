#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "clock_config.h"
#include "clock_timer_logic.h"

/** Aggregated input to the status JSON encoder. Time/IP/RSSI validity flags
 * select whether their associated fields appear as values or JSON null. */
typedef struct {
    clock_config_t config;    /**< Settings snapshot, including alarm slots. */
    int64_t uptime_seconds;   /**< Monotonic time since boot, in seconds. */
    uint32_t free_heap_bytes; /**< Currently available heap. */
    uint32_t min_free_heap_bytes; /**< Lowest free heap since boot. */
    bool wifi_connected;      /**< Station has received an IP address. */
    bool setup_ap;            /**< Setup access point is active. */
    bool rssi_valid;          /**< wifi_rssi is available. */
    int wifi_rssi;            /**< Station signal strength in dBm. */
    bool ip_valid;            /**< ip contains an available address. */
    uint8_t ip[4];            /**< Local IPv4 address, in display order. */
    uint8_t chip_id[6];        /**< Factory MAC used as the stable identifier. */
    uint8_t wifi_mac[6];       /**< Station interface MAC address. */
    bool time_valid;          /**< The NTP-derived wall time is usable. */
    int64_t unix_time;        /**< UTC Unix timestamp in seconds. */
    int64_t unix_time_ms;     /**< UTC Unix timestamp in milliseconds. */
    int64_t sync_age_seconds; /**< Negative means no usable sync age. */
    bool display_ready;       /**< Panel scanner is ready. */
    bool buzzer_configured;   /**< Buzzer GPIO is configured. */
    bool ringing;             /**< A scheduled alarm is ringing. */
    uint8_t ringing_mask;     /**< Bit i identifies ringing alarm slot i. */
    bool magic_playing;       /**< Interesting-time music track is currently playing. */
    int magic_track;          /**< Active track ID 0..7, or -1 when idle. */
    clock_timer_state_t stopwatch_state; /**< Stopwatch lifecycle state. */
    int64_t stopwatch_ms;      /**< Elapsed stopwatch milliseconds. */
    clock_timer_state_t reminder_state;  /**< Reminder lifecycle state. */
    int64_t reminder_ms;       /**< Remaining reminder milliseconds. */
} clock_status_t;

/** Serialize the status to a NUL-terminated JSON buffer.
 * @param status Non-NULL input snapshot.
 * @param buffer Destination; contents are incomplete on failure.
 * @param capacity Available bytes including the terminating NUL.
 * @return True if the entire JSON object fits.
 */
bool clock_status_json(const clock_status_t *status, char *buffer, size_t capacity);
