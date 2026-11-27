#include "clock_magic_time.h"

clock_magic_category_t clock_magic_classify(int hour24, int minute, bool format_12h)
{
    if (hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) {
        return CLOCK_MAGIC_NONE;
    }

    int disp_h = format_12h ? ((hour24 % 12) ? (hour24 % 12) : 12) : hour24;
    int h1 = disp_h / 10;
    int h0 = disp_h % 10;
    int m1 = minute / 10;
    int m0 = minute % 10;

    /* 1. Repdigits: 00:00, 11:11, 22:22, or 3-digit 1:11..5:55 / 01:11..05:55. */
    if ((disp_h == 0 || disp_h >= 10) && h1 == h0 && h0 == m1 && m1 == m0) {
        return CLOCK_MAGIC_REPDIGIT;
    }
    if (disp_h >= 1 && disp_h <= 9 && disp_h == m1 && m1 == m0) {
        return CLOCK_MAGIC_REPDIGIT;
    }

    /* 2. Sequences: 4-digit ascending (01:23, 12:34, 23:45),
     * 3-digit ascending (02:34, 03:45, 04:56), or 3-digit descending (02:10..06:54). */
    if (h0 == h1 + 1 && m1 == h0 + 1 && m0 == m1 + 1) {
        return CLOCK_MAGIC_SEQUENCE;
    }
    if (disp_h >= 1 && disp_h <= 9) {
        if (m1 == disp_h + 1 && m0 == m1 + 1) {
            return CLOCK_MAGIC_SEQUENCE;
        }
        if (m1 == disp_h - 1 && m0 == m1 - 1) {
            return CLOCK_MAGIC_SEQUENCE;
        }
    }

    /* 3. Palindromes: 4-digit h1 == m0 && h0 == m1 (repdigits already handled). */
    if (h1 == m0 && h0 == m1) {
        return CLOCK_MAGIC_PALINDROME;
    }

    return CLOCK_MAGIC_NONE;
}
