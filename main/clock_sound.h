#pragma once

#include <stdbool.h>
#include <stdint.h>

bool clock_sound_chime(unsigned pattern, uint64_t elapsed_ms);
bool clock_sound_alarm(uint64_t elapsed_ms);
bool clock_sound_reminder(uint64_t elapsed_ms);
