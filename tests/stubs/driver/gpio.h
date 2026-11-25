#pragma once
#if CONFIG_IDF_TARGET_ESP32S3
#define GPIO_IS_VALID_OUTPUT_GPIO(pin) ((pin) >= 0 && (pin) <= 48 && ((pin) < 22 || (pin) > 25))
#else
#define GPIO_IS_VALID_OUTPUT_GPIO(pin) ((pin) >= 0 && (pin) <= 33 && (pin) != 20 && (pin) != 24 && (pin) != 28 && (pin) != 29 && (pin) != 30 && (pin) != 31)
#endif
