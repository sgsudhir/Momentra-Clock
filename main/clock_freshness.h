#pragma once

#include <stdbool.h>
#include <stdint.h>

#define CLOCK_SYNC_MAX_AGE_SECONDS (12 * 60 * 60)

bool clock_sync_is_fresh(int64_t last_sync_us, int64_t now_us);
