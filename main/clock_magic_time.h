#pragma once

#include <stdbool.h>

/** Classification of visually interesting clock times for random chimes. */
typedef enum {
    CLOCK_MAGIC_NONE = 0,
    CLOCK_MAGIC_REPDIGIT,
    CLOCK_MAGIC_SEQUENCE,
    CLOCK_MAGIC_PALINDROME,
} clock_magic_category_t;

/** Classify a local hour/minute pair as an interesting time.
 * @param hour24 Local hour in [0, 23].
 * @param minute Minute within hour in [0, 59].
 * @param format_12h True when 12-hour clock representation is active.
 * @return Matching category, or CLOCK_MAGIC_NONE.
 */
clock_magic_category_t clock_magic_classify(int hour24, int minute, bool format_12h);
