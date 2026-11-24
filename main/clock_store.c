#include "clock_store.h"

#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "nvs.h"

static SemaphoreHandle_t state_lock;
static SemaphoreHandle_t write_lock;
static clock_config_t current;

esp_err_t clock_store_init(void)
{
    state_lock = xSemaphoreCreateMutex();
    write_lock = xSemaphoreCreateMutex();
    if (!state_lock || !write_lock) {
        if (state_lock) {
            vSemaphoreDelete(state_lock);
            state_lock = NULL;
        }
        if (write_lock) {
            vSemaphoreDelete(write_lock);
            write_lock = NULL;
        }
        return ESP_ERR_NO_MEM;
    }

    nvs_handle_t handle;
    esp_err_t err = nvs_open("clock", NVS_READONLY, &handle);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        clock_config_defaults(&current);
        return ESP_OK;
    }
    if (err != ESP_OK) {
        return err;
    }
    size_t size = sizeof(current);
    err = nvs_get_blob(handle, "config_v1", &current, &size);
    nvs_close(handle);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        clock_config_defaults(&current);
        return ESP_OK;
    }
    if (err != ESP_OK) {
        return err;
    }
    return size == sizeof(current) && clock_config_valid(&current) ? ESP_OK : ESP_ERR_INVALID_STATE;
}

void clock_store_get(clock_config_t *config)
{
    xSemaphoreTake(state_lock, portMAX_DELAY);
    *config = current;
    xSemaphoreGive(state_lock);
}

static esp_err_t commit_update(const clock_config_t *old, const clock_config_t *config)
{
    if (memcmp(old, config, sizeof(*old)) == 0) {
        return ESP_OK;
    }

    nvs_handle_t handle;
    esp_err_t err = nvs_open("clock", NVS_READWRITE, &handle);
    if (err == ESP_OK) {
        err = nvs_set_blob(handle, "config_v1", config, sizeof(*config));
        if (err == ESP_OK) {
            err = nvs_commit(handle);
        }
        nvs_close(handle);
    }
    if (err == ESP_OK) {
        xSemaphoreTake(state_lock, portMAX_DELAY);
        current = *config;
        xSemaphoreGive(state_lock);
    }
    return err;
}

static esp_err_t store_update(const clock_config_t *expected, const clock_config_t *config)
{
    if (!clock_config_valid(config)) {
        return ESP_ERR_INVALID_ARG;
    }
    xSemaphoreTake(write_lock, portMAX_DELAY);
    clock_config_t old;
    clock_store_get(&old);
    esp_err_t err;
    if (expected && memcmp(&old, expected, sizeof(old)) != 0) {
        err = ESP_ERR_INVALID_STATE;
    } else {
        err = commit_update(&old, config);
    }
    xSemaphoreGive(write_lock);
    return err;
}

esp_err_t clock_store_set(const clock_config_t *config)
{
    return store_update(NULL, config);
}

esp_err_t clock_store_set_if_unchanged(const clock_config_t *expected,
                                       const clock_config_t *config)
{
    if (!expected) {
        return ESP_ERR_INVALID_ARG;
    }
    return store_update(expected, config);
}

esp_err_t clock_store_claim_alarms(const clock_config_t *expected, uint8_t candidates,
                                   uint8_t *claimed, unsigned *duration_seconds)
{
    if (!expected || !claimed || !duration_seconds) return ESP_ERR_INVALID_ARG;
    *claimed = 0;
    *duration_seconds = 0;
    xSemaphoreTake(write_lock, portMAX_DELAY);
    clock_config_t old;
    clock_store_get(&old);
    clock_config_t updated = old;
    uint8_t matching = 0;
    unsigned duration = 0;
    for (unsigned i = 0; i < CLOCK_ALARM_COUNT; ++i) {
        clock_alarm_t *alarm = &updated.alarms[i];
        if (!(candidates & (1U << i)) || !alarm->enabled ||
            alarm->hour != expected->alarms[i].hour ||
            alarm->minute != expected->alarms[i].minute) {
            continue;
        }
        matching |= 1U << i;
        if (alarm->duration_seconds > duration) duration = alarm->duration_seconds;
        if (alarm->repeat == ALARM_ONCE) alarm->enabled = 0;
    }
    esp_err_t err = commit_update(&old, &updated);
    if (err == ESP_OK) {
        *claimed = matching;
        *duration_seconds = duration;
    }
    xSemaphoreGive(write_lock);
    return err;
}
