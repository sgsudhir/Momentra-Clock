#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

typedef struct {
    bool ringing;
    uint8_t alarm_mask;
} clock_alarm_status_t;

esp_err_t clock_alarm_start(void);
bool clock_alarm_is_configured(void);
void clock_alarm_stop(void);
void clock_alarm_beep(void);
clock_alarm_status_t clock_alarm_status(void);
