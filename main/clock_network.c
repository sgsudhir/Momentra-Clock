#include "clock_network.h"

#include <stdlib.h>
#include <string.h>

#include "clock_time.h"
#include "esp_check.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "mdns.h"
#include "nvs.h"

#define RETRY_LIMIT 5

typedef struct {
    char ssid[33];
    char password[65];
} credentials_t;

typedef enum {
    NETWORK_STARTED,
    NETWORK_DISCONNECTED,
    NETWORK_GOT_IP,
} network_event_t;

static const char *TAG = "clock_network";
static QueueHandle_t events;
static SemaphoreHandle_t credentials_lock;
static portMUX_TYPE status_lock = portMUX_INITIALIZER_UNLOCKED;
static bool connected;
static bool ap_active;
static credentials_t credentials;
static bool have_credentials;
static bool pending_credentials;
static portMUX_TYPE scan_lock = portMUX_INITIALIZER_UNLOCKED;
static clock_scan_result_t scan_result;

clock_scan_result_t clock_network_scan_result(void)
{
    portENTER_CRITICAL(&scan_lock);
    clock_scan_result_t result = scan_result;
    portEXIT_CRITICAL(&scan_lock);
    return result;
}

static void scan_task(void *arg)
{
    (void)arg;
    wifi_ap_record_t *records = calloc(CLOCK_SCAN_MAX_NETWORKS, sizeof(*records));
    uint16_t count = CLOCK_SCAN_MAX_NETWORKS;
    esp_err_t err = records ? esp_wifi_scan_start(NULL, true) : ESP_ERR_NO_MEM;
    if (err == ESP_OK) {
        err = esp_wifi_scan_get_ap_records(&count, records);
        if (err != ESP_OK) {
            esp_err_t clear_err = esp_wifi_clear_ap_list();
            if (clear_err != ESP_OK) ESP_LOGW(TAG, "Could not clear scan list: %s", esp_err_to_name(clear_err));
        }
    }
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "Wi-Fi scan failed: %s", esp_err_to_name(err));
    }
    clock_scan_result_t result = {.state = err == ESP_OK ? SCAN_DONE : SCAN_FAILED, .error = err};
    if (err == ESP_OK) {
        for (unsigned i = 0; i < count; ++i) {
            records[i].ssid[32] = 0;
            if (!records[i].ssid[0]) continue;
            bool duplicate = false;
            for (unsigned j = 0; j < result.count; ++j) {
                if (strcmp((char *)result.networks[j].ssid, (char *)records[i].ssid) == 0) {
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) {
                memcpy(result.networks[result.count].ssid, records[i].ssid, 33);
                result.networks[result.count++].rssi = records[i].rssi;
            }
        }
    }
    free(records);
    portENTER_CRITICAL(&scan_lock);
    scan_result = result;
    portEXIT_CRITICAL(&scan_lock);
    vTaskDelete(NULL);
}

esp_err_t clock_network_scan_start(void)
{
    portENTER_CRITICAL(&scan_lock);
    bool busy = scan_result.state == SCAN_RUNNING;
    if (!busy) scan_result.state = SCAN_RUNNING;
    portEXIT_CRITICAL(&scan_lock);
    if (busy) return ESP_ERR_INVALID_STATE;
    if (xTaskCreatePinnedToCore(scan_task, "wifi_scan", 6144, NULL, 4, NULL, 0) != pdPASS) {
        portENTER_CRITICAL(&scan_lock);
        scan_result.state = SCAN_FAILED;
        scan_result.error = ESP_ERR_NO_MEM;
        portEXIT_CRITICAL(&scan_lock);
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}

static bool credentials_valid(const credentials_t *value)
{
    size_t ssid_length = strnlen(value->ssid, sizeof(value->ssid));
    size_t password_length = strnlen(value->password, sizeof(value->password));
    return ssid_length > 0 && ssid_length <= 32 &&
           (password_length == 0 || (password_length >= 8 && password_length <= 63));
}

static esp_err_t load_credentials(void)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open("network", NVS_READONLY, &handle);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        return ESP_OK;
    }
    if (err != ESP_OK) {
        return err;
    }
    size_t size = sizeof(credentials);
    err = nvs_get_blob(handle, "pending", &credentials, &size);
    if (err == ESP_OK) {
        pending_credentials = true;
    } else if (err == ESP_ERR_NVS_NOT_FOUND) {
        size = sizeof(credentials);
        err = nvs_get_blob(handle, "saved", &credentials, &size);
    }
    nvs_close(handle);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        return ESP_OK;
    }
    if (err != ESP_OK) {
        return err;
    }
    if (size != sizeof(credentials) || !credentials_valid(&credentials)) {
        return ESP_ERR_INVALID_STATE;
    }
    have_credentials = true;
    return ESP_OK;
}

esp_err_t clock_network_store_credentials(const char *ssid, const char *password)
{
    if (!ssid || !password || strlen(ssid) > 32 || strlen(password) > 63) {
        return ESP_ERR_INVALID_ARG;
    }
    credentials_t value = {0};
    memcpy(value.ssid, ssid, strlen(ssid));
    memcpy(value.password, password, strlen(password));
    if (!credentials_valid(&value)) {
        return ESP_ERR_INVALID_ARG;
    }
    xSemaphoreTake(credentials_lock, portMAX_DELAY);
    nvs_handle_t handle;
    esp_err_t err = nvs_open("network", NVS_READWRITE, &handle);
    if (err == ESP_OK) {
        err = nvs_set_blob(handle, "pending", &value, sizeof(value));
        if (err == ESP_OK) {
            err = nvs_commit(handle);
        }
        nvs_close(handle);
    }
    xSemaphoreGive(credentials_lock);
    memset(&value, 0, sizeof(value));
    return err;
}

static esp_err_t save_successful_credentials(void)
{
    xSemaphoreTake(credentials_lock, portMAX_DELAY);
    nvs_handle_t handle;
    esp_err_t err = nvs_open("network", NVS_READWRITE, &handle);
    if (err == ESP_OK) {
        credentials_t candidate;
        size_t size = sizeof(candidate);
        err = nvs_get_blob(handle, "pending", &candidate, &size);
        bool still_pending = err == ESP_OK && size == sizeof(candidate) &&
                             memcmp(&candidate, &credentials, sizeof(candidate)) == 0;
        if (err == ESP_ERR_NVS_NOT_FOUND) err = ESP_OK;
        if (err == ESP_OK && size != sizeof(candidate)) err = ESP_ERR_INVALID_STATE;
        memset(&candidate, 0, sizeof(candidate));
        if (err == ESP_OK) {
            err = nvs_set_blob(handle, "saved", &credentials, sizeof(credentials));
        }
        if (err == ESP_OK && still_pending) {
            err = nvs_erase_key(handle, "pending");
        }
        if (err == ESP_OK) {
            err = nvs_commit(handle);
        }
        nvs_close(handle);
    }
    xSemaphoreGive(credentials_lock);
    return err;
}

static void set_status(bool station, bool access_point)
{
    portENTER_CRITICAL(&status_lock);
    connected = station;
    ap_active = access_point;
    portEXIT_CRITICAL(&status_lock);
}

clock_network_status_t clock_network_status(void)
{
    portENTER_CRITICAL(&status_lock);
    clock_network_status_t result = {.connected = connected, .ap_active = ap_active};
    portEXIT_CRITICAL(&status_lock);
    wifi_ap_record_t record;
    if (result.connected && esp_wifi_sta_get_ap_info(&record) == ESP_OK) {
        result.rssi_valid = true;
        result.rssi = record.rssi;
    }
    return result;
}

static void wifi_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    (void)arg;
    (void)data;
    network_event_t event;
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        event = NETWORK_STARTED;
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        event = NETWORK_DISCONNECTED;
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        const ip_event_got_ip_t *ip = data;
        ESP_LOGI(TAG, "Station IP: " IPSTR, IP2STR(&ip->ip_info.ip));
        event = NETWORK_GOT_IP;
    } else {
        return;
    }
    if (xQueueSend(events, &event, 0) != pdTRUE) {
        ESP_LOGE(TAG, "Network event queue is full");
    }
}

static esp_err_t enable_ap(void)
{
    wifi_config_t config = {
        .ap = {.ssid = "P10-Clock-Setup", .ssid_len = 15, .channel = 1,
               .max_connection = 4, .authmode = WIFI_AUTH_OPEN},
    };
    esp_err_t err = esp_wifi_set_mode(WIFI_MODE_APSTA);
    if (err == ESP_OK) {
        err = esp_wifi_set_config(WIFI_IF_AP, &config);
    }
    if (err == ESP_OK) {
        set_status(false, true);
        ESP_LOGW(TAG, "Open setup AP enabled: P10-Clock-Setup");
    }
    return err;
}

static void network_task(void *arg)
{
    (void)arg;
    unsigned failures = 0;
    bool setup_ap = !have_credentials;
    for (;;) {
        network_event_t event;
        if (xQueueReceive(events, &event, pdMS_TO_TICKS(30000)) != pdTRUE) {
            if (have_credentials && !clock_network_status().connected) {
                esp_err_t err = esp_wifi_connect();
                if (err != ESP_OK) {
                    ESP_LOGW(TAG, "Wi-Fi retry failed: %s", esp_err_to_name(err));
                }
            }
            continue;
        }
        if (event == NETWORK_GOT_IP) {
            failures = 0;
            if (pending_credentials) {
                esp_err_t err = save_successful_credentials();
                if (err == ESP_OK) {
                    pending_credentials = false;
                } else {
                    ESP_LOGE(TAG, "Could not save successful Wi-Fi credentials: %s",
                             esp_err_to_name(err));
                }
            }
            if (setup_ap) {
                esp_err_t err = esp_wifi_set_mode(WIFI_MODE_STA);
                if (err == ESP_OK) {
                    setup_ap = false;
                } else {
                    ESP_LOGE(TAG, "Could not stop setup AP: %s", esp_err_to_name(err));
                }
            }
            set_status(true, setup_ap);
            esp_err_t err = clock_time_start_sync();
            if (err != ESP_OK) {
                ESP_LOGE(TAG, "Could not start NTP: %s", esp_err_to_name(err));
            }
        } else if (have_credentials) {
            if (event == NETWORK_DISCONNECTED) {
                set_status(false, setup_ap);
                ++failures;
                if (failures >= RETRY_LIMIT && !setup_ap) {
                    esp_err_t err = enable_ap();
                    if (err == ESP_OK) {
                        setup_ap = true;
                    } else {
                        ESP_LOGE(TAG, "Could not start setup AP: %s", esp_err_to_name(err));
                    }
                }
            }
            if (failures < RETRY_LIMIT) {
                esp_err_t err = esp_wifi_connect();
                if (err != ESP_OK) {
                    ESP_LOGW(TAG, "Wi-Fi connection failed: %s", esp_err_to_name(err));
                }
            }
        }
    }
}

esp_err_t clock_network_start(void)
{
    credentials_lock = xSemaphoreCreateMutex();
    if (!credentials_lock) return ESP_ERR_NO_MEM;
    esp_err_t err = load_credentials();
    if (err != ESP_OK) {
        return err;
    }
    events = xQueueCreate(16, sizeof(network_event_t));
    if (!events) {
        return ESP_ERR_NO_MEM;
    }
    ESP_RETURN_ON_ERROR(esp_netif_init(), TAG, "netif initialization failed");
    ESP_RETURN_ON_ERROR(esp_event_loop_create_default(), TAG, "event loop initialization failed");
    if (!esp_netif_create_default_wifi_sta() || !esp_netif_create_default_wifi_ap()) {
        return ESP_ERR_NO_MEM;
    }
    ESP_RETURN_ON_ERROR(mdns_init(), TAG, "mDNS initialization failed");
    ESP_RETURN_ON_ERROR(mdns_hostname_set("momentra"), TAG, "mDNS hostname setup failed");
    ESP_RETURN_ON_ERROR(mdns_instance_name_set("Momentra Clock"), TAG, "mDNS instance setup failed");
    ESP_RETURN_ON_ERROR(mdns_service_add(NULL, "_http", "_tcp", 80, NULL, 0),
                        TAG, "mDNS HTTP service setup failed");
    wifi_init_config_t wifi_config = WIFI_INIT_CONFIG_DEFAULT();
    ESP_RETURN_ON_ERROR(esp_wifi_init(&wifi_config), TAG, "Wi-Fi initialization failed");
    ESP_RETURN_ON_ERROR(esp_wifi_set_storage(WIFI_STORAGE_RAM), TAG, "Wi-Fi storage setup failed");
    ESP_RETURN_ON_ERROR(clock_time_init(), TAG, "NTP initialization failed");
    ESP_RETURN_ON_ERROR(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event, NULL),
                        TAG, "Wi-Fi event registration failed");
    ESP_RETURN_ON_ERROR(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event, NULL),
                        TAG, "IP event registration failed");
    ESP_RETURN_ON_ERROR(esp_wifi_set_mode(WIFI_MODE_STA), TAG, "Wi-Fi mode setup failed");
    if (have_credentials) {
        wifi_config_t station = {0};
        memcpy(station.sta.ssid, credentials.ssid, strlen(credentials.ssid));
        memcpy(station.sta.password, credentials.password, strlen(credentials.password));
        ESP_RETURN_ON_ERROR(esp_wifi_set_config(WIFI_IF_STA, &station), TAG, "station setup failed");
    } else {
        ESP_RETURN_ON_ERROR(enable_ap(), TAG, "setup AP initialization failed");
    }
    if (xTaskCreatePinnedToCore(network_task, "clock_network", 4096, NULL, 5, NULL, 0) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }
    return esp_wifi_start();
}
