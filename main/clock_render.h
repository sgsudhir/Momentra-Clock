#pragma once

#include <stdbool.h>
#include <stdint.h>

/** Logical 32x16 bitmap: each row has four bytes, leftmost pixel in bit 7. */
typedef struct {
    uint8_t rows[16][4];
} clock_frame_t;

/** Screens shown while connecting and during the four seconds after connection. */
typedef enum {
    CLOCK_CONNECTING,
    CLOCK_CONNECTION_RSSI,
    CLOCK_CONNECTION_IP,
    CLOCK_CONNECTION_DONE,
} clock_connection_phase_t;

/** Clear and draw a centered clock, or the sync screen if input is invalid.
 * @param frame Non-NULL destination; previous contents are discarded.
 * @param valid Whether wall time is usable.
 * @param hour Local hour in 24-hour form, 0-23.
 * @param minute Local minute, 0-59.
 * @param format_12h Use 12-hour digits without an AM/PM indicator.
 * @param font Persisted font ID.
 * @return Separator x-coordinate for clock_render_seconds(), or -1 if no clock.
 */
int clock_render(clock_frame_t *frame, bool valid, unsigned hour, unsigned minute,
                 bool format_12h, unsigned font);
/** Add blink and animation to an already rendered clock frame.
 * @param frame Clock frame to modify.
 * @param second Second within the minute, 0-59.
 * @param millisecond Millisecond within the second, 0-999.
 * @param blink Enable alternating separator visibility.
 * @param animation Animation ID; tall fonts suppress animations.
 * @param font Same font used for clock_render().
 * @param separator_x Coordinate returned by clock_render().
 */
void clock_render_seconds(clock_frame_t *frame, unsigned second, unsigned millisecond,
                          bool blink, unsigned animation, unsigned font, int separator_x);
/** Choose the connection screen using monotonic microseconds.
 * @param connected Current station connection state.
 * @param connected_at_us Monotonic timestamp at connection.
 * @param now_us Current monotonic timestamp.
 * @return Connecting, RSSI (<2 s), IP (<4 s), or done.
 */
clock_connection_phase_t clock_connection_phase(bool connected, int64_t connected_at_us,
                                               int64_t now_us);
/** Replace frame with a connection screen or the sync screen for DONE.
 * @param frame Non-NULL destination.
 * @param phase Screen to draw.
 * @param rssi_valid Whether rssi is available.
 * @param rssi Signal strength in dBm; unavailable/invalid values display "--".
 * @param ip_last_octet Last IPv4 octet, 0-255.
 */
void clock_render_connection(clock_frame_t *frame, clock_connection_phase_t phase,
                             bool rssi_valid, int rssi, unsigned ip_last_octet);
/** Draw a two-line timer, clearing frame first.
 * @param frame Non-NULL destination.
 * @param reminder True for HH:MM:SS; false for MM:SS:tenths.
 * @param first Hours for a reminder or minutes for a stopwatch.
 * @param second Minutes for a reminder or seconds for a stopwatch.
 * @param third Seconds for a reminder or hundredths for a stopwatch.
 * @param font Current font ID, validated even though timers use a fixed font.
 */
void clock_render_timer(clock_frame_t *frame, bool reminder, uint32_t first,
                        unsigned second, unsigned third, unsigned font);
