#pragma once

#include "esp_err.h"

/** Start the HTTP server on core 0 and register the dashboard/API routes.
 * @return ESP_OK or the server/route registration error.
 */
esp_err_t clock_web_start(void);
