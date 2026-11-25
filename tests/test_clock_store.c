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
static struct {
    const char *key;
    bool exists;
    uint8_t value;
} saved_options[] = {
    {"feedback", false, 0},
    {"colon_blink", false, 0},
    {"seconds_anim", false, 0},
    {"tz2_enabled", false, 0},
};
static struct {
    const char *key;
    bool exists;
    char value[CLOCK_TIMEZONE_NAME_SIZE];
} saved_zones[] = {
    {"tz_primary", false, ""},
    {"tz_secondary", false, ""},
};

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
    for (unsigned i = 0; i < sizeof(saved_options) / sizeof(saved_options[0]); ++i) {
        if (strcmp(key, saved_options[i].key) == 0) {
            if (!saved_options[i].exists) return ESP_ERR_NVS_NOT_FOUND;
            *value = saved_options[i].value;
            return ESP_OK;
        }
    }
    assert(false);
    return ESP_FAIL;
}

esp_err_t nvs_set_u8(nvs_handle_t handle, const char *key, uint8_t value)
{
    (void)handle;
    for (unsigned i = 0; i < sizeof(saved_options) / sizeof(saved_options[0]); ++i) {
        if (strcmp(key, saved_options[i].key) == 0) {
            saved_options[i].value = value;
            saved_options[i].exists = true;
            return ESP_OK;
        }
    }
    assert(false);
    return ESP_FAIL;
}

esp_err_t nvs_get_str(nvs_handle_t handle, const char *key, char *value, size_t *size)
{
    (void)handle;
    for (unsigned i = 0; i < sizeof(saved_zones) / sizeof(saved_zones[0]); ++i) {
        if (strcmp(key, saved_zones[i].key) == 0) {
            if (!saved_zones[i].exists) return ESP_ERR_NVS_NOT_FOUND;
            size_t length = strlen(saved_zones[i].value) + 1;
            assert(*size >= length);
            memcpy(value, saved_zones[i].value, length);
            *size = length;
            return ESP_OK;
        }
    }
    assert(false);
    return ESP_FAIL;
}

esp_err_t nvs_set_str(nvs_handle_t handle, const char *key, const char *value)
{
    (void)handle;
    for (unsigned i = 0; i < sizeof(saved_zones) / sizeof(saved_zones[0]); ++i) {
        if (strcmp(key, saved_zones[i].key) == 0) {
            strcpy(saved_zones[i].value, value);
            saved_zones[i].exists = true;
            return ESP_OK;
        }
    }
    assert(false);
    return ESP_FAIL;
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
    assert(config.brightness == 50 && config.feedback_enabled == 1 &&
           config.colon_blink == 0 && config.seconds_animation == CLOCK_SECONDS_NONE);
    assert(strcmp(config.timezone_primary, "Asia/Kolkata") == 0);
    assert(strcmp(config.timezone_secondary, "Etc/UTC") == 0);
    strcpy(config.timezone_primary, "Europe/London");
    strcpy(config.timezone_secondary, "America/New_York");
    config.timezone_secondary_enabled = 1;
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
    after.colon_blink = 1;
    after.seconds_animation = CLOCK_SECONDS_PROGRESS;
    assert(clock_store_set(&after) == ESP_OK);
    assert(clock_store_init() == ESP_OK);
    clock_store_get(&config);
    assert(config.feedback_enabled == 0 && config.colon_blink == 1 &&
           config.seconds_animation == CLOCK_SECONDS_PROGRESS && config.brightness == 75 &&
           config.alarms[0].hour == 8);
    assert(strcmp(config.timezone_primary, "Europe/London") == 0 &&
           strcmp(config.timezone_secondary, "America/New_York") == 0 &&
           config.timezone_secondary_enabled == 1);
    for (unsigned effect = CLOCK_SECONDS_BOUNCE; effect <= CLOCK_SECONDS_JUMP; ++effect) {
        config.font = effect == CLOCK_SECONDS_BOUNCE ? 13 : 14;
        config.seconds_animation = effect;
        assert(clock_store_set(&config) == ESP_OK);
        assert(clock_store_init() == ESP_OK);
        clock_store_get(&config);
        assert(config.seconds_animation == effect && config.font ==
               (effect == CLOCK_SECONDS_BOUNCE ? 13 : 14));
    }
    config.font = 3;
    assert(clock_store_set(&config) == ESP_OK);
    assert(clock_store_init() == ESP_OK);
    clock_store_get(&config);
    assert(config.font == 3);
    saved_options[1].exists = false;
    saved_options[2].exists = false;
    assert(clock_store_init() == ESP_OK);
    clock_store_get(&config);
    assert(config.feedback_enabled == 0 && config.colon_blink == 0 &&
           config.seconds_animation == CLOCK_SECONDS_NONE && config.brightness == 75);
    for (unsigned i = 0; i < sizeof(saved_options) / sizeof(saved_options[0]); ++i) {
        saved_options[i].exists = false;
    }
    for (unsigned i = 0; i < sizeof(saved_zones) / sizeof(saved_zones[0]); ++i) saved_zones[i].exists = false;
    assert(clock_store_init() == ESP_OK);
    clock_store_get(&config);
    assert(config.feedback_enabled == 1 && config.colon_blink == 0 &&
           config.seconds_animation == CLOCK_SECONDS_NONE && config.brightness == 75 &&
           config.alarms[0].hour == 8);
    assert(strcmp(config.timezone_primary, "Asia/Kolkata") == 0 &&
           strcmp(config.timezone_secondary, "Etc/UTC") == 0 && !config.timezone_secondary_enabled);
    config.feedback_enabled = 2;
    assert(clock_store_set(&config) == ESP_ERR_INVALID_ARG);
    config.feedback_enabled = 1;
    config.colon_blink = 2;
    assert(clock_store_set(&config) == ESP_ERR_INVALID_ARG);
    config.colon_blink = 0;
    config.seconds_animation = CLOCK_SECONDS_ANIMATION_COUNT;
    assert(clock_store_set(&config) == ESP_ERR_INVALID_ARG);
    puts("clock store tests passed");
    return 0;
}
