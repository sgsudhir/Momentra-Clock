#include "clock_freshness.h"

bool clock_sync_is_fresh(int64_t last_sync_us, int64_t now_us)
{
    /* A negative or backward timestamp cannot establish freshness. The upper
     * bound is exclusive: exactly 12 hours old is already stale. */
    return last_sync_us >= 0 && now_us >= last_sync_us &&
           now_us - last_sync_us < (int64_t)CLOCK_SYNC_MAX_AGE_SECONDS * 1000000;
}
