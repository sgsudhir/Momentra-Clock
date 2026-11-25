#pragma once

#include <stdbool.h>

#include "esp_err.h"

/** Initialize panel hardware and start the renderer and scanner tasks.
 * @return ESP_OK or a GPIO, SPI, PWM, or task creation error.
 */
esp_err_t clock_display_start(void);
/** Request and wait for scan pause/resume; used during flash operations.
 * @param pause True to blank/pause, false to resume.
 * @return ESP_OK on acknowledgement or ESP_ERR_TIMEOUT.
 */
esp_err_t clock_display_pause(bool pause);
/** @return Whether the panel tasks were started and the scanner has not failed. */
bool clock_display_is_ready(void);
