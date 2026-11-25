#include "clock_render.h"

#include <stdio.h>
#include <string.h>

#include "clock_config.h"

/* Bitmap tables hold original digit designs: string glyphs are 3x5, while
 * integer rows encode pixels from the most significant used bit to the right. */
static const char *const digits[5][10] = {
    {"111101101101111","010110010010111","111001111100111","111001111001111","101101111001001",
     "111100111001111","111100111101111","111001001001001","111101111101111","111101111001111"},
    {"111101101101111","010010010010010","110001010100111","110001011001110","101101111001001",
     "111100110001110","011100110101010","111001010010010","010101010101010","010101011001110"},
    {"111101101101111","110010010010111","110001010100111","110001010001110","101101111001001",
     "111100110001110","011100111101111","111001010100100","111101111101111","111101111001110"},
    {"111101101101111","011001001001001","111001111100111","111001111001111","101101111001001",
     "111100111001111","111100111101111","111001001001001","111101111101111","111101111001111"},
    {"111101101101111","010110010010111","111001010100111","111001011001111","101101111001001",
     "111100111001110","011100111101111","111001010010010","111101111101111","111101111001110"},
};

static const uint8_t large_digits[10][7] = {
    {0x1e, 0x33, 0x37, 0x3b, 0x33, 0x33, 0x1e},
    {0x0c, 0x1c, 0x0c, 0x0c, 0x0c, 0x0c, 0x3f},
    {0x1e, 0x33, 0x03, 0x06, 0x0c, 0x18, 0x3f},
    {0x1e, 0x33, 0x03, 0x0e, 0x03, 0x33, 0x1e},
    {0x06, 0x0e, 0x16, 0x26, 0x3f, 0x06, 0x06},
    {0x3f, 0x30, 0x3e, 0x03, 0x03, 0x33, 0x1e},
    {0x0e, 0x18, 0x30, 0x3e, 0x33, 0x33, 0x1e},
    {0x3f, 0x03, 0x06, 0x0c, 0x0c, 0x18, 0x18},
    {0x1e, 0x33, 0x33, 0x1e, 0x33, 0x33, 0x1e},
    {0x1e, 0x33, 0x33, 0x1f, 0x03, 0x06, 0x1c},
};

static const uint8_t medium_digits[10][6] = {
    {0x0e, 0x11, 0x13, 0x19, 0x11, 0x0e},
    {0x04, 0x0c, 0x04, 0x04, 0x04, 0x0e},
    {0x0e, 0x11, 0x02, 0x04, 0x08, 0x1f},
    {0x1e, 0x01, 0x06, 0x01, 0x11, 0x0e},
    {0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02},
    {0x1f, 0x10, 0x1e, 0x01, 0x11, 0x0e},
    {0x06, 0x08, 0x1e, 0x11, 0x11, 0x0e},
    {0x1f, 0x01, 0x02, 0x04, 0x08, 0x08},
    {0x0e, 0x11, 0x0e, 0x11, 0x11, 0x0e},
    {0x0e, 0x11, 0x11, 0x0f, 0x02, 0x0c},
};

static const uint8_t small_digits[10][7] = {
    {0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e},
    {0x04, 0x0c, 0x14, 0x04, 0x04, 0x04, 0x1f},
    {0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f},
    {0x1e, 0x01, 0x01, 0x0e, 0x01, 0x01, 0x1e},
    {0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02},
    {0x1f, 0x10, 0x10, 0x1e, 0x01, 0x01, 0x1e},
    {0x0e, 0x10, 0x10, 0x1e, 0x11, 0x11, 0x0e},
    {0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08},
    {0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e},
    {0x0e, 0x11, 0x11, 0x0f, 0x01, 0x01, 0x0e},
};

static const uint8_t compact_digits[10][7] = {
    {0x6, 0x9, 0x9, 0x9, 0x9, 0x9, 0x6},
    {0x2, 0x6, 0x2, 0x2, 0x2, 0x2, 0x7},
    {0x6, 0x9, 0x1, 0x2, 0x4, 0x8, 0xf},
    {0xe, 0x1, 0x1, 0x6, 0x1, 0x1, 0xe},
    {0x2, 0x6, 0xa, 0xa, 0xf, 0x2, 0x2},
    {0xf, 0x8, 0x8, 0xe, 0x1, 0x1, 0xe},
    {0x6, 0x8, 0x8, 0xe, 0x9, 0x9, 0x6},
    {0xf, 0x1, 0x2, 0x2, 0x4, 0x4, 0x4},
    {0x6, 0x9, 0x9, 0x6, 0x9, 0x9, 0x6},
    {0x6, 0x9, 0x9, 0x7, 0x1, 0x1, 0x6},
};

static const uint8_t rounded_digits[10][7] = {
    {0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e},
    {0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e},
    {0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f},
    {0x1e, 0x01, 0x01, 0x0e, 0x01, 0x01, 0x1e},
    {0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02},
    {0x1f, 0x10, 0x10, 0x1e, 0x01, 0x01, 0x1e},
    {0x0e, 0x10, 0x10, 0x1e, 0x11, 0x11, 0x0e},
    {0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08},
    {0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e},
    {0x0e, 0x11, 0x11, 0x0f, 0x01, 0x01, 0x0e},
};

/** Set a logical pixel if it lies within the 32x16 frame; clip otherwise. */
static void pixel(clock_frame_t *frame, unsigned x, unsigned y)
{
    if (x < 32 && y < 16) frame->rows[y][x / 8] |= 0x80U >> (x % 8);
}

/** Draw a 3x5 string bitmap at (x,y), expanding both axes by scale. */
static void glyph(clock_frame_t *frame, const char *shape, unsigned x, unsigned y, unsigned scale)
{
    for (unsigned row = 0; row < 5; ++row) {
        for (unsigned col = 0; col < 3; ++col) {
            if (shape[row * 3 + col] != '1') continue;
            for (unsigned dy = 0; dy < scale; ++dy) {
                for (unsigned dx = 0; dx < scale; ++dx) {
                    pixel(frame, x + col * scale + dx, y + row * scale + dy);
                }
            }
        }
    }
}

/** Draw a selected bitmap digit, applying its vertical scaling and bolding. */
static void sized_digit(clock_frame_t *frame, unsigned digit, unsigned x, unsigned font)
{
    const uint8_t *rows = font == 5 || font == 10 || font == 11 ? large_digits[digit] :
                          font == 6 ? medium_digits[digit] :
                          font == 14 ? rounded_digits[digit] : small_digits[digit];
    unsigned width = font == 5 || font == 10 || font == 11 ? 6 : 5;
    unsigned height = font == 6 ? 6 : 7;
    unsigned scale_y = font == 5 || font == 6 || font == 8 || font == 11 ? 2 : 1;
    unsigned top = font == 5 || font == 8 || font == 11 ? 1 : font == 6 ? 2 : 4;
    for (unsigned y = 0; y < height; ++y) {
        uint8_t bits = rows[y];
        if (font == 11 || font == 12) bits |= bits >> 1;
        for (unsigned col = 0; col < width; ++col) {
            if (bits & (1U << (width - 1 - col))) {
                for (unsigned dy = 0; dy < scale_y; ++dy) {
                    pixel(frame, x + col, top + y * scale_y + dy);
                }
            }
        }
    }
}

/** Return whether this font uses 2x2 separator dots rather than single pixels. */
static bool square_separator(unsigned font)
{
    return font != 7 && font != 9 && font != 14;
}

/** Return whether the font occupies space reserved for seconds animations. */
static bool tall_font(unsigned font)
{
    return font == 5 || font == 6 || font == 8 || font == 11 || font == 13;
}

/** Draw a six-pixel-wide seven-segment digit using a segment bitmask. */
static void segment_digit(clock_frame_t *frame, unsigned digit, unsigned x)
{
    static const uint8_t segments[10] = {0x3f, 0x06, 0x5b, 0x4f, 0x66,
                                         0x6d, 0x7d, 0x07, 0x7f, 0x6f};
    uint8_t bits = segments[digit];
    for (unsigned col = 1; col <= 4; ++col) {
        if (bits & 0x01) pixel(frame, x + col, 2);
        if (bits & 0x40) pixel(frame, x + col, 7);
        if (bits & 0x08) pixel(frame, x + col, 12);
    }
    for (unsigned y = 3; y <= 6; ++y) {
        if (bits & 0x20) pixel(frame, x, y);
        if (bits & 0x02) pixel(frame, x + 5, y);
        if (bits & 0x10) pixel(frame, x, y + 5);
        if (bits & 0x04) pixel(frame, x + 5, y + 5);
    }
}

/** Center the lit-pixel bounding box horizontally; return the applied x shift.
 * The separator is shifted with the digits and its coordinate must be adjusted.
 */
static int center_clock(clock_frame_t *frame)
{
    unsigned left = 32, right = 0;
    for (unsigned y = 0; y < 16; ++y) {
        for (unsigned x = 0; x < 32; ++x) {
            if (frame->rows[y][x / 8] & (0x80U >> (x % 8))) {
                if (x < left) left = x;
                if (x > right) right = x;
            }
        }
    }
    if (left == 32) return 0;
    int shift = (int)((32 - (right - left + 1)) / 2) - (int)left;
    if (shift) {
        clock_frame_t original = *frame;
        memset(frame, 0, sizeof(*frame));
        for (unsigned y = 0; y < 16; ++y) {
            for (unsigned x = left; x <= right; ++x) {
                if (original.rows[y][x / 8] & (0x80U >> (x % 8))) {
                    pixel(frame, (unsigned)((int)x + shift), y);
                }
            }
        }
    }
    return shift;
}

int clock_render(clock_frame_t *frame, bool valid, unsigned hour, unsigned minute,
                 bool format_12h, unsigned font)
{
    memset(frame, 0, sizeof(*frame));
    if (!valid || hour > 23 || minute > 59 || font >= CLOCK_FONT_COUNT) {
        clock_render_connection(frame, CLOCK_CONNECTION_DONE, false, 0, 0);
        return -1;
    }

    /* Preserve legacy IDs from saved settings, but render retired styles as 1. */
    if (font >= 2 && font <= 4) font = 0;
    if (format_12h) {
        hour %= 12;
        if (hour == 0) hour = 12;
    }
    const unsigned values[] = {hour / 10, hour % 10, minute / 10, minute % 10};
    const unsigned positions[] = {0, 7, 17, 24};
    for (unsigned i = 0; i < 4; ++i) {
        if (font < 5) glyph(frame, digits[font][values[i]], positions[i], 2, 2);
        else if (font == 9) glyph(frame, digits[0][values[i]], positions[i], 5, 1);
        else if (font == 13) segment_digit(frame, values[i], positions[i]);
        else sized_digit(frame, values[i], positions[i], font);
    }
    for (unsigned y = 5; y <= 9; y += 4) {
        pixel(frame, 14, y);
        if (square_separator(font)) {
            pixel(frame, 15, y);
            pixel(frame, 14, y + 1);
            pixel(frame, 15, y + 1);
        }
    }
    return 14 + center_clock(frame);
}

void clock_render_seconds(clock_frame_t *frame, unsigned second, unsigned millisecond,
                          bool blink, unsigned animation, unsigned font, int separator_x)
{
    if (!frame || second >= 60 || millisecond >= 1000 || font >= CLOCK_FONT_COUNT ||
        separator_x < 0 || separator_x > 30 || animation >= CLOCK_SECONDS_ANIMATION_COUNT) return;
    if (font >= 2 && font <= 4) font = 0;
    if (blink && second % 2) {
        for (unsigned y = 5; y <= 9; y += 4) {
            for (unsigned dy = 0; dy < (square_separator(font) ? 2U : 1U); ++dy) {
                for (unsigned dx = 0; dx < (square_separator(font) ? 2U : 1U); ++dx) {
                    unsigned x = separator_x + dx;
                    frame->rows[y + dy][x / 8] &= (uint8_t)~(0x80U >> (x % 8));
                }
            }
        }
    }
    if (tall_font(font)) return;
    if (animation == CLOCK_SECONDS_DOT) {
        pixel(frame, second * 31 / 59, 15);
    } else if (animation == CLOCK_SECONDS_PROGRESS) {
        unsigned width = ((second + 1) * 32 + 59) / 60;
        for (unsigned x = 0; x < width; ++x) pixel(frame, x, 15);
    } else if (animation == CLOCK_SECONDS_BOUNCE || animation == CLOCK_SECONDS_JUMP) {
        /* 100 ms steps move the bounce horizontally; the five-frame arc uses
         * rows 12-15. Jump follows the minute and hops once each second. */
        unsigned step = (second * 10 + millisecond / 100);
        unsigned x = animation == CLOCK_SECONDS_BOUNCE ? step % 60 : second * 30 / 59;
        if (x > 30) x = 60 - x;
        static const unsigned arc[] = {14, 13, 12, 13, 14};
        unsigned y = arc[animation == CLOCK_SECONDS_BOUNCE ? step % 5 : millisecond / 200];
        for (unsigned dy = 0; dy < 2; ++dy) {
            for (unsigned dx = 0; dx < 2; ++dx) pixel(frame, x + dx, y + dy);
        }
    }
}

/** Draw a supported 5x7 status character at (x,y); unsupported characters are blank. */
static void small_character(clock_frame_t *frame, char c, unsigned x, unsigned y)
{
    static const uint8_t w[] = {0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0a};
    static const uint8_t i[] = {0x04, 0x00, 0x0c, 0x04, 0x04, 0x04, 0x0e};
    static const uint8_t f[] = {0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10};
    static const uint8_t s[] = {0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e};
    static const uint8_t y_shape[] = {0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04};
    static const uint8_t n[] = {0x11, 0x19, 0x19, 0x15, 0x13, 0x13, 0x11};
    static const uint8_t c_shape[] = {0x0f, 0x10, 0x10, 0x10, 0x10, 0x10, 0x0f};
    static const uint8_t r[] = {0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11};
    static const uint8_t capital_i[] = {0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e};
    static const uint8_t p[] = {0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10};
    static const uint8_t t[] = {0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04};
    static const uint8_t e[] = {0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f};
    static const uint8_t minus[] = {0, 0, 0, 0x1f, 0, 0, 0};
    const uint8_t *rows = NULL;
    if (c >= '0' && c <= '9') rows = small_digits[c - '0'];
    else switch (c) {
        case 'W': rows = w; break;
        case 'i': rows = i; break;
        case 'F': rows = f; break;
        case 'S': rows = s; break;
        case 'Y': rows = y_shape; break;
        case 'N': rows = n; break;
        case 'C': rows = c_shape; break;
        case 'R': rows = r; break;
        case 'I': rows = capital_i; break;
        case 'P': rows = p; break;
        case 'T': rows = t; break;
        case 'E': rows = e; break;
        case '-': rows = minus; break;
    }
    if (!rows) return;
    for (unsigned row = 0; row < 7; ++row) {
        for (unsigned col = 0; col < 5; ++col) {
            if (rows[row] & (1U << (4 - col))) pixel(frame, x + col, y + row);
        }
    }
}

/** Draw up to five fixed-width status characters horizontally centered. */
static void centered_text(clock_frame_t *frame, const char *text, unsigned y)
{
    size_t count = strlen(text);
    if (!count || count > 5) return;
    unsigned x = (32 - (count * 6 - 1)) / 2;
    for (size_t i = 0; i < count; ++i) small_character(frame, text[i], x + i * 6, y);
}

void clock_render_dual(clock_frame_t *frame, bool valid, unsigned first_hour,
                       unsigned first_minute, unsigned second_hour, unsigned second_minute,
                       bool blink, unsigned second)
{
    if (!valid || first_hour > 23 || first_minute > 59 ||
        second_hour > 23 || second_minute > 59 || second >= 60) {
        clock_render_connection(frame, CLOCK_CONNECTION_DONE, false, 0, 0);
        return;
    }

    const unsigned hours[] = {first_hour, second_hour};
    const unsigned minutes[] = {first_minute, second_minute};
    memset(frame, 0, sizeof(*frame));
    for (unsigned row = 0; row < 2; ++row) {
        clock_frame_t line;
        int separator = clock_render(&line, true, hours[row], minutes[row], false, 7);
        clock_render_seconds(&line, second, 0, blink, CLOCK_SECONDS_NONE, 7, separator);
        for (unsigned y = 0; y < 7; ++y) {
            memcpy(frame->rows[row * 8 + y], line.rows[y + 4], sizeof(frame->rows[0]));
        }
    }
}

clock_connection_phase_t clock_connection_phase(bool connected, int64_t connected_at_us,
                                               int64_t now_us)
{
    if (!connected) return CLOCK_CONNECTING;
    if (now_us < connected_at_us || now_us - connected_at_us < 2000000) return CLOCK_CONNECTION_RSSI;
    if (now_us - connected_at_us < 4000000) return CLOCK_CONNECTION_IP;
    return CLOCK_CONNECTION_DONE;
}

void clock_render_connection(clock_frame_t *frame, clock_connection_phase_t phase,
                             bool rssi_valid, int rssi, unsigned ip_last_octet)
{
    memset(frame, 0, sizeof(*frame));
    if (phase == CLOCK_CONNECTING) {
        centered_text(frame, "WiFi", 4);
    } else if (phase == CLOCK_CONNECTION_RSSI) {
        char value[8];
        centered_text(frame, "RSSI", 0);
        if (rssi_valid && rssi >= -128 && rssi <= 0) snprintf(value, sizeof(value), "%d", rssi);
        else strcpy(value, "--");
        centered_text(frame, value, 9);
    } else if (phase == CLOCK_CONNECTION_IP) {
        char value[4];
        centered_text(frame, "IP", 0);
        if (ip_last_octet <= 255) {
            snprintf(value, sizeof(value), "%u", ip_last_octet);
            centered_text(frame, value, 9);
        }
    } else {
        centered_text(frame, "SYNC", 0);
        for (unsigned x = 4; x <= 28; x += 6) {
            pixel(frame, x, 13);
            pixel(frame, x + 1, 13);
            pixel(frame, x, 14);
            pixel(frame, x + 1, 14);
        }
    }
}

void clock_render_timer(clock_frame_t *frame, bool reminder, uint32_t first,
                        unsigned second, unsigned third, unsigned font)
{
    memset(frame, 0, sizeof(*frame));
    if (first > 99 || second > 59 || third > 99 || font >= CLOCK_FONT_COUNT) return;
    centered_text(frame, reminder ? "RE" : "ST", 0);
    unsigned values[] = {first / 10, first % 10, second / 10, second % 10,
                         third / 10, third % 10};
    /* Six 4x7 digits fit in a reminder; stopwatch uses five digits because
     * only tenths (the tens digit of hundredths) are displayed. */
    static const unsigned reminder_x[] = {0, 5, 11, 16, 22, 27};
    static const unsigned stopwatch_x[] = {3, 8, 14, 19, 25};
    const unsigned *x = reminder ? reminder_x : stopwatch_x;
    for (unsigned i = 0; i < (reminder ? 6 : 5); ++i) {
        for (unsigned row = 0; row < 7; ++row) {
            for (unsigned col = 0; col < 4; ++col) {
                if (compact_digits[values[i]][row] & (1U << (3 - col))) {
                    pixel(frame, x[i] + col, 9 + row);
                }
            }
        }
    }
    for (unsigned y = 11; y <= 13; y += 2) {
        pixel(frame, reminder ? 10 : 13, y);
        pixel(frame, reminder ? 21 : 24, y);
    }
}
