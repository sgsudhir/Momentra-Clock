#include "clock_scan.h"

bool clock_scan_encode(const clock_frame_t *frame, unsigned row, bool data_active_low,
                       uint8_t output[16])
{
    if (!frame || !output || row >= 4) return false;
    /* Each address drives four rows, sent bottom group first; bytes belonging
     * to the same horizontal block are adjacent in the panel's shift order. */
    for (unsigned i = 0; i < 16; ++i) {
        unsigned y = row + 4 * (3 - i % 4);
        uint8_t pixels = frame->rows[y][i / 4];
        output[i] = data_active_low ? (uint8_t)~pixels : pixels;
    }
    return true;
}
