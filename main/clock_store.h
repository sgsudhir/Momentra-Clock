#pragma once

#include "clock_config.h"
#include "esp_err.h"

/** Load validated settings from NVS or defaults when absent; create locks.
 * @return ESP_OK, an NVS error, ESP_ERR_INVALID_STATE or ESP_ERR_NO_MEM.
 */
esp_err_t clock_store_init(void);
/** Copy the current settings to non-NULL config under the state lock. */
void clock_store_get(clock_config_t *config);
/** Validate and persist config before publishing it. @return ESP-IDF status. */
esp_err_t clock_store_set(const clock_config_t *config);
/** Save only if current settings still match expected.
 * @param expected Previously read settings snapshot.
 * @param config Valid replacement settings.
 * @return ESP_ERR_INVALID_STATE on conflict, otherwise save/validation status.
 */
esp_err_t clock_store_set_if_unchanged(const clock_config_t *expected,
                                       const clock_config_t *config);
/** Claim still-matching alarms and disable one-shot alarms before they ring.
 * @param expected Snapshot used for scheduling.
 * @param candidates Bitmask of potentially due slots.
 * @param claimed Output bitmask of claimed slots; cleared on failure.
 * @param duration_seconds Output longest claimed duration; cleared on failure.
 * @return ESP_OK or persistence/argument error.
 */
esp_err_t clock_store_claim_alarms(const clock_config_t *expected, uint8_t candidates,
                                   uint8_t *claimed, unsigned *duration_seconds);
