#include <assert.h>
#include "clock_pins.h"

int main(void)
{
#if CONFIG_IDF_TARGET_ESP32S3
    int allowed[] = {4, 5, 6, 7, 15, 16, 17};
    int blocked[] = {-1, 0, 3, 19, 20, 22, 25, 26, 35, 36, 37, 38, 43, 44, 45, 46, 48, 49};
#else
    int allowed[] = {23, 18, 19, 21, 22, 25, 26};
    int blocked[] = {-1, 0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 15, 34};
#endif
    for (unsigned i = 0; i < sizeof(allowed) / sizeof(allowed[0]); ++i) assert(clock_pin_safe(allowed[i]));
    for (unsigned i = 0; i < sizeof(blocked) / sizeof(blocked[0]); ++i) assert(!clock_pin_safe(blocked[i]));
    return 0;
}
