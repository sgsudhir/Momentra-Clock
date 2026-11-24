#pragma once

#include "clock_config.h"
#include "esp_err.h"

esp_err_t clock_store_init(void);
void clock_store_get(clock_config_t *config);
esp_err_t clock_store_set(const clock_config_t *config);
esp_err_t clock_store_set_if_unchanged(const clock_config_t *expected,
                                       const clock_config_t *config);
esp_err_t clock_store_claim_alarms(const clock_config_t *expected, uint8_t candidates,
                                   uint8_t *claimed, unsigned *duration_seconds);
