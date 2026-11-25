#pragma once

#include <stdbool.h>
#include <stdint.h>

#define CLOCK_SYNC_MAX_AGE_SECONDS (12 * 60 * 60) /**< Maximum usable sync age. */

/** Test NTP freshness using monotonic microsecond timestamps.
 * @param last_sync_us Last successful sync, or -1 if never synchronized.
 * @param now_us Current monotonic time.
 * @return True only for a nonnegative age below CLOCK_SYNC_MAX_AGE_SECONDS.
 */
bool clock_sync_is_fresh(int64_t last_sync_us, int64_t now_us);
