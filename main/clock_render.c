#include "clock_render.h"

#include <string.h>

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

static void pixel(clock_frame_t *frame, unsigned x, unsigned y)
{
    if (x < 32 && y < 16) frame->rows[y][x / 8] |= 0x80U >> (x % 8);
}

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

void clock_render(clock_frame_t *frame, bool valid, unsigned hour, unsigned minute,
                  bool format_12h, unsigned font)
{
    memset(frame, 0, sizeof(*frame));
    if (!valid || hour > 23 || minute > 59 || font >= 5) {
        static const char *const text[] = {
            "111100111001111", "101101010010010", "101111111111101", "111100100100111",
            "000000000000010", "000000000000010", "000000000000010",
        };
        for (unsigned i = 0; i < 7; ++i) glyph(frame, text[i], 2 + i * 4, 5, 1);
        return;
    }

    bool pm = hour >= 12;
    if (format_12h) {
        hour %= 12;
        if (hour == 0) hour = 12;
    }
    glyph(frame, digits[font][hour / 10], 0, 2, 2);
    glyph(frame, digits[font][hour % 10], 7, 2, 2);
    glyph(frame, digits[font][minute / 10], 17, 2, 2);
    glyph(frame, digits[font][minute % 10], 24, 2, 2);
    for (unsigned y = 5; y <= 9; y += 4) {
        pixel(frame, 14, y);
        pixel(frame, 15, y);
    }
    if (format_12h) {
        const char *indicator = pm ? "110111100000000" : "010101111000000";
        glyph(frame, indicator, 28, 13, 1);
    }
}

void clock_render_timer(clock_frame_t *frame, bool reminder, uint32_t first,
                        unsigned second, unsigned third, unsigned font)
{
    memset(frame, 0, sizeof(*frame));
    if (first > 99 || second > 59 || third > 99 || font >= 5) return;
    static const char *const stopwatch_label[] = {
        "111100111001111", "111010010010010",
    };
    static const char *const reminder_label[] = {
        "110101110101101", "111100110100111",
    };
    const char *const *label = reminder ? reminder_label : stopwatch_label;
    glyph(frame, label[0], 12, 0, 1);
    glyph(frame, label[1], 16, 0, 1);
    unsigned values[] = {first / 10, first % 10, second / 10, second % 10,
                         third / 10, third % 10};
    static const unsigned x[] = {2, 6, 12, 16, 22, 26};
    for (unsigned i = 0; i < (reminder ? 6 : 5); ++i) glyph(frame, digits[font][values[i]], x[i], 10, 1);
    for (unsigned y = 11; y <= 13; y += 2) {
        pixel(frame, 10, y);
        pixel(frame, 20, y);
    }
}
