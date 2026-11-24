#pragma once

#include <stdbool.h>
#include <stddef.h>

typedef struct {
    char name[24];
    char value[128];
} clock_form_field_t;

typedef struct {
    clock_form_field_t fields[10];
    size_t count;
} clock_form_t;

bool clock_form_parse(clock_form_t *form, const char *body, size_t length);
const char *clock_form_value(const clock_form_t *form, const char *name);
bool clock_form_int(const clock_form_t *form, const char *name, int min, int max, int *out);
