#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "clock_render.h"

bool clock_scan_encode(const clock_frame_t *frame, unsigned row, bool data_active_low,
                       uint8_t output[16]);
