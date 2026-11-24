#include <assert.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

#include "clock_store.h"
#include "nvs.h"

static clock_config_t saved;
static bool exists;
static bool fail_commit;
static unsigned writes;
static bool feedback_exists;
static uint8_t saved_feedback;

esp_err_t nvs_open(const char *name, int mode, nvs_handle_t *handle)
{
    (void)name;
    if (mode == NVS_READONLY && !exists) return ESP_ERR_NVS_NOT_FOUND;
    *handle = 1;
    return ESP_OK;
}

esp_err_t nvs_get_blob(nvs_handle_t handle, const char *key, void *value, size_t *size)
{
    (void)handle;
    (void)key;
    if (!exists) return ESP_ERR_NVS_NOT_FOUND;
    size_t legacy_size = offsetof(clock_config_t, feedback_enabled);
    assert(*size >= legacy_size);
    *size = legacy_size;
    memcpy(value, &saved, legacy_size);
    return ESP_OK;
}

esp_err_t nvs_set_blob(nvs_handle_t handle, const char *key, const void *value, size_t size)
{
    (void)handle;
    (void)key;
    assert(size == offsetof(clock_config_t, feedback_enabled));
    memcpy(&saved, value, size);
    exists = true;
    ++writes;
    return ESP_OK;
}

esp_err_t nvs_get_u8(nvs_handle_t handle, const char *key, uint8_t *value)
{
    (void)handle;
    assert(strcmp(key, "feedback") == 0);
    if (!feedback_exists) return ESP_ERR_NVS_NOT_FOUND;
    *value = saved_feedback;
    return ESP_OK;
}

esp_err_t nvs_set_u8(nvs_handle_t handle, const char *key, uint8_t value)
{
    (void)handle;
    assert(strcmp(key, "feedback") == 0);
    saved_feedback = value;
    feedback_exists = true;
    return ESP_OK;
}

esp_err_t nvs_commit(nvs_handle_t handle)
{
    (void)handle;
    if (fail_commit) return ESP_FAIL;
    return ESP_OK;
}

void nvs_close(nvs_handle_t handle)
{
    (void)handle;
}

int main(void)
{
    assert(clock_store_init() == ESP_OK);
    clock_config_t config;
    clock_store_get(&config);
    assert(config.brightness == 50 && config.feedback_enabled == 1);
    config.alarms[0] = (clock_alarm_t){1, 7, 30, ALARM_ONCE, 10};
    config.alarms[1] = (clock_alarm_t){1, 7, 30, ALARM_DAILY, 30};
    assert(clock_store_set(&config) == ESP_OK);
    assert(clock_store_set(&config) == ESP_OK && writes == 1);

    clock_config_t prior = config;
    config.brightness = 75;
    assert(clock_store_set(&config) == ESP_OK);
    assert(clock_store_set_if_unchanged(&prior, &prior) == ESP_ERR_INVALID_STATE);
    uint8_t claimed;
    unsigned duration;
    assert(clock_store_claim_alarms(&prior, 3, &claimed, &duration) == ESP_OK);
    assert(claimed == 3 && duration == 30);
    clock_store_get(&config);
    assert(config.brightness == 75 && !config.alarms[0].enabled && config.alarms[1].enabled);

    config.alarms[0].enabled = 1;
    assert(clock_store_set(&config) == ESP_OK);
    fail_commit = true;
    assert(clock_store_claim_alarms(&config, 1, &claimed, &duration) == ESP_FAIL);
    assert(claimed == 0 && duration == 0);
    clock_config_t after;
    clock_store_get(&after);
    assert(after.alarms[0].enabled && !saved.alarms[0].enabled);

    fail_commit = false;
    after.alarms[0].hour = 8;
    assert(clock_store_set(&after) == ESP_OK);
    assert(clock_store_claim_alarms(&config, 1, &claimed, &duration) == ESP_OK);
    assert(claimed == 0 && duration == 0);
    after.feedback_enabled = 0;
    assert(clock_store_set(&after) == ESP_OK);
    assert(clock_store_init() == ESP_OK);
    clock_store_get(&config);
    assert(config.feedback_enabled == 0 && config.brightness == 75 &&
           config.alarms[0].hour == 8);
    feedback_exists = false;
    assert(clock_store_init() == ESP_OK);
    clock_store_get(&config);
    assert(config.feedback_enabled == 1 && config.brightness == 75 &&
           config.alarms[0].hour == 8);
    config.feedback_enabled = 2;
    assert(clock_store_set(&config) == ESP_ERR_INVALID_ARG);
    puts("clock store tests passed");
    return 0;
}
