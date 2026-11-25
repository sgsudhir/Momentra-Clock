#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "clock_render.h"

/** Encode one of four multiplexed panel addresses into SPI shift-register order.
 * @param frame Logical 32x16 framebuffer.
 * @param row Address 0-3; selects four physical rows.
 * @param data_active_low Invert pixel bits for active-low panel inputs.
 * @param output Destination for exactly 16 bytes.
 * @return False for NULL pointers or an invalid row.
 */
bool clock_scan_encode(const clock_frame_t *frame, unsigned row, bool data_active_low,
                       uint8_t output[16]);
