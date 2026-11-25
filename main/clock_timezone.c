#define _POSIX_C_SOURCE 200809L
#include "clock_timezone.h"

#include <string.h>

typedef struct {
    char name[CLOCK_TIMEZONE_NAME_SIZE];
    int32_t initial_offset;
    uint32_t first;
    uint16_t count;
} timezone_entry_t;

typedef struct {
    uint32_t utc;
    int32_t offset;
} timezone_transition_t;

#include "clock_timezone_data.inc"

size_t clock_timezone_count(void)
{
    return sizeof(zones) / sizeof(zones[0]);
}

const char *clock_timezone_name(size_t index)
{
    return index < clock_timezone_count() ? zones[index].name : NULL;
}

static const timezone_entry_t *find_timezone(const char *name)
{
    if (!name) return NULL;
    size_t low = 0, high = clock_timezone_count();
    while (low < high) {
        size_t mid = low + (high - low) / 2;
        int cmp = strcmp(name, zones[mid].name);
        if (cmp == 0) return &zones[mid];
        if (cmp < 0) high = mid;
        else low = mid + 1;
    }
    return NULL;
}

bool clock_timezone_valid(const char *name)
{
    return find_timezone(name) != NULL;
}

bool clock_timezone_offset(const char *name, int64_t unix_seconds, int32_t *offset)
{
    const timezone_entry_t *zone = find_timezone(name);
    if (!zone || !offset || unix_seconds < 0 || unix_seconds >= INT64_C(4133980800)) return false;
    size_t low = 0, high = zone->count;
    while (low < high) {
        size_t mid = low + (high - low) / 2;
        if (transitions[zone->first + mid].utc <= (uint64_t)unix_seconds) low = mid + 1;
        else high = mid;
    }
    *offset = low ? transitions[zone->first + low - 1].offset : zone->initial_offset;
    return true;
}

bool clock_timezone_local(const char *name, time_t unix_time, struct tm *local)
{
    int32_t offset;
    if (!local || !clock_timezone_offset(name, unix_time, &offset)) return false;
    time_t adjusted = unix_time + offset;
    return gmtime_r(&adjusted, local) != NULL;
}

bool clock_timezone_next_alarm(const char *name, int64_t now, unsigned hour,
                               unsigned minute, int64_t *result)
{
    const timezone_entry_t *zone = find_timezone(name);
    int32_t current;
    if (!zone || !result || hour > 23 || minute > 59 ||
        !clock_timezone_offset(name, now, &current)) return false;
    int64_t local = now + current;
    int64_t day = local >= 0 ? local / 86400 : (local - 86399) / 86400;
    int64_t best = INT64_MAX;
    for (size_t i = 0; i <= zone->count; ++i) {
        int32_t candidate_offset;
        if (i == 0) {
            candidate_offset = current;
        } else {
            const timezone_transition_t *transition = &transitions[zone->first + i - 1];
            if (transition->utc <= now || transition->utc > now + 4 * INT64_C(86400)) continue;
            candidate_offset = transition->offset;
        }
        for (int d = -1; d <= 4; ++d) {
            int64_t candidate = (day + d) * 86400 + hour * 3600 + minute * 60 - candidate_offset;
            int32_t actual;
            if (candidate < now || candidate >= best ||
                !clock_timezone_offset(name, candidate, &actual) || actual != candidate_offset) continue;
            best = candidate;
        }
    }
    if (best == INT64_MAX) return false;
    *result = best;
    return true;
}
