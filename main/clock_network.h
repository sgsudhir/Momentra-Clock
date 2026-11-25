#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

/** Current station/setup AP state and an optional live signal measurement. */
typedef struct {
    bool connected;   /**< Station has received an IP address. */
    bool ap_active;   /**< Setup access point is enabled. */
    bool rssi_valid;  /**< rssi was read successfully. */
    int rssi;         /**< Station signal strength in dBm. */
} clock_network_status_t;

/** Cached connection data for the display, copied under a short lock. */
typedef struct {
    bool connected;          /**< Station connection state. */
    bool rssi_valid;         /**< Whether the cached RSSI is valid. */
    int rssi;                /**< RSSI at connection, in dBm. */
    uint8_t ip_last_octet;   /**< Last byte of the assigned station IPv4 address. */
    int64_t connected_at_us; /**< Monotonic connection time in microseconds. */
} clock_network_display_t;

/** Initialize Wi-Fi, mDNS, SNTP and network task. @return ESP-IDF error or ESP_OK. */
esp_err_t clock_network_start(void);
/** Save pending credentials for the next boot.
 * @param ssid Nonempty SSID, at most 32 bytes.
 * @param password Empty for open networks, otherwise 8-63 bytes.
 * @return ESP_OK or a validation/NVS error. Successful credentials are promoted
 * to saved credentials only after connection.
 */
esp_err_t clock_network_store_credentials(const char *ssid, const char *password);
/** @return Connection state and, when available, current RSSI. */
clock_network_status_t clock_network_status(void);
/** @return Cached display-specific connection state. */
clock_network_display_t clock_network_display_status(void);

#define CLOCK_SCAN_MAX_NETWORKS 20
/** A scan result: UTF-8/SSID bytes terminated within 33 bytes and RSSI in dBm. */
typedef struct {
    uint8_t ssid[33]; /**< Network name bytes plus terminator. */
    int8_t rssi;      /**< Signal strength in dBm. */
} clock_scan_network_t;
/** Scan lifecycle; error is meaningful when state is SCAN_FAILED. */
typedef enum { SCAN_IDLE, SCAN_RUNNING, SCAN_DONE, SCAN_FAILED } clock_scan_state_t;
typedef struct {
    clock_scan_state_t state; /**< Current scan lifecycle state. */
    esp_err_t error;          /**< ESP-IDF error when the scan failed. */
    unsigned count;           /**< Number of valid entries in networks. */
    clock_scan_network_t networks[CLOCK_SCAN_MAX_NETWORKS]; /**< Unique nonempty SSIDs. */
} clock_scan_result_t;

/** Start an asynchronous scan. @return ESP_ERR_INVALID_STATE if already running. */
esp_err_t clock_network_scan_start(void);
/** @return A copy of the current scan state and up to CLOCK_SCAN_MAX_NETWORKS entries. */
clock_scan_result_t clock_network_scan_result(void);
