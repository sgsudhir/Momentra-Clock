#include "esp_log.h"
#include "esp_ota_ops.h"
#include "nvs_flash.h"

#include "clock_alarm.h"
#include "clock_display.h"
#include "clock_network.h"
#include "clock_store.h"
#include "clock_web.h"

/** ESP-IDF entry point. Initialize services in dependency order, then mark a
 * pending OTA image valid once startup has succeeded. Failures are fatal.
 */
void app_main(void)
{
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(clock_store_init());
    ESP_ERROR_CHECK(clock_display_start());
    ESP_ERROR_CHECK(clock_alarm_start());
    ESP_ERROR_CHECK(clock_network_start());
    ESP_ERROR_CHECK(clock_web_start());
    const esp_partition_t *running = esp_ota_get_running_partition();
    esp_ota_img_states_t state;
    esp_err_t err = esp_ota_get_state_partition(running, &state);
    if (err == ESP_OK && state == ESP_OTA_IMG_PENDING_VERIFY) {
#ifdef CONFIG_CLOCK_PANEL_ENABLED
        if (!clock_display_is_ready()) {
            ESP_LOGE("app", "Panel driver not ready during OTA verification; rolling back");
            esp_ota_mark_app_invalid_rollback_and_reboot();
        }
#endif
        ESP_ERROR_CHECK(esp_ota_mark_app_valid_cancel_rollback());
    } else if (err != ESP_OK && err != ESP_ERR_NOT_FOUND) {
        ESP_ERROR_CHECK(err);
    }
    ESP_LOGI("app", "Clock configuration initialized");
}
