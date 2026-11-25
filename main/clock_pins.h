#pragma once

#include <stdbool.h>
#include "driver/gpio.h"
#include "sdkconfig.h"

/* Restrict pins beyond the SoC mask: boot, serial, USB, flash and board LEDs. */
static inline bool clock_pin_safe(int pin)
{
    if (!GPIO_IS_VALID_OUTPUT_GPIO(pin)) return false;
#if CONFIG_IDF_TARGET_ESP32S3
    return pin != 0 && pin != 3 && pin != 19 && pin != 20 &&
           !(pin >= 26 && pin <= 48);
#elif CONFIG_IDF_TARGET_ESP32
    return pin != 0 && pin != 1 && pin != 2 && pin != 3 && pin != 5 &&
           !(pin >= 6 && pin <= 12) && pin != 15;
#else
    return false;
#endif
}
