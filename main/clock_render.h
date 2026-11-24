#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    uint8_t rows[16][4];
} clock_frame_t;

void clock_render(clock_frame_t *frame, bool valid, unsigned hour, unsigned minute,
                  bool format_12h, unsigned font);
void clock_render_timer(clock_frame_t *frame, bool reminder, uint32_t first,
                        unsigned second, unsigned third, unsigned font);
