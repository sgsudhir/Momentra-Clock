#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

typedef struct {
    bool connected;
    bool ap_active;
    bool rssi_valid;
    int rssi;
} clock_network_status_t;

typedef struct {
    bool connected;
    bool rssi_valid;
    int rssi;
    uint8_t ip_last_octet;
    int64_t connected_at_us;
} clock_network_display_t;

esp_err_t clock_network_start(void);
esp_err_t clock_network_store_credentials(const char *ssid, const char *password);
clock_network_status_t clock_network_status(void);
clock_network_display_t clock_network_display_status(void);

#define CLOCK_SCAN_MAX_NETWORKS 20
typedef struct {
    uint8_t ssid[33];
    int8_t rssi;
} clock_scan_network_t;
typedef enum { SCAN_IDLE, SCAN_RUNNING, SCAN_DONE, SCAN_FAILED } clock_scan_state_t;
typedef struct {
    clock_scan_state_t state;
    esp_err_t error;
    unsigned count;
    clock_scan_network_t networks[CLOCK_SCAN_MAX_NETWORKS];
} clock_scan_result_t;

esp_err_t clock_network_scan_start(void);
clock_scan_result_t clock_network_scan_result(void);
