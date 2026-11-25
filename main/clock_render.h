#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    uint8_t rows[16][4];
} clock_frame_t;

typedef enum {
    CLOCK_CONNECTING,
    CLOCK_CONNECTION_RSSI,
    CLOCK_CONNECTION_IP,
    CLOCK_CONNECTION_DONE,
} clock_connection_phase_t;

int clock_render(clock_frame_t *frame, bool valid, unsigned hour, unsigned minute,
                 bool format_12h, unsigned font);
void clock_render_seconds(clock_frame_t *frame, unsigned second, unsigned millisecond,
                          bool blink, unsigned animation, unsigned font, int separator_x);
clock_connection_phase_t clock_connection_phase(bool connected, int64_t connected_at_us,
                                               int64_t now_us);
void clock_render_connection(clock_frame_t *frame, clock_connection_phase_t phase,
                             bool rssi_valid, int rssi, unsigned ip_last_octet);
void clock_render_timer(clock_frame_t *frame, bool reminder, uint32_t first,
                        unsigned second, unsigned third, unsigned font);
