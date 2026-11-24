#pragma once

#include <stdbool.h>

#include "esp_err.h"

esp_err_t clock_display_start(void);
esp_err_t clock_display_pause(bool pause);
bool clock_display_is_ready(void);
