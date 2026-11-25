#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <time.h>

#define CLOCK_TIMEZONE_NAME_SIZE 40
#define CLOCK_TIMEZONE_DEFAULT "Asia/Kolkata"
#define CLOCK_TIMEZONE_SECONDARY_DEFAULT "Etc/UTC"

/** IANA names and offsets generated from tzdb 2026f, valid for 1970-2100. */
size_t clock_timezone_count(void);
const char *clock_timezone_name(size_t index);
bool clock_timezone_valid(const char *name);
bool clock_timezone_offset(const char *name, int64_t unix_seconds, int32_t *offset);
bool clock_timezone_local(const char *name, time_t unix_time, struct tm *local);
/** Find the next matching local minute; skipped DST minutes are not returned. */
bool clock_timezone_next_alarm(const char *name, int64_t now, unsigned hour,
                               unsigned minute, int64_t *result);
