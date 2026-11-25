#pragma once

#include <stdbool.h>
#include <stddef.h>

/** Decoded, NUL-terminated form field with fixed storage limits. */
typedef struct {
    char name[24];
    char value[128];
} clock_form_field_t;

/** Parsed form; count identifies the initialized entries. */
typedef struct {
    clock_form_field_t fields[10];
    size_t count;
} clock_form_t;

/** Parse an application/x-www-form-urlencoded body.
 * @param form Destination; contents are incomplete if parsing fails.
 * @param body Input bytes, not necessarily NUL-terminated.
 * @param length Number of input bytes.
 * @return False for malformed input, duplicate names, NULs, or exceeded limits.
 */
bool clock_form_parse(clock_form_t *form, const char *body, size_t length);
/** Look up name in a parsed form. @return Borrowed value or NULL if absent. */
const char *clock_form_value(const clock_form_t *form, const char *name);
/** Parse a complete decimal field within inclusive [min, max].
 * @param out Destination written only on success. @return True on success.
 */
bool clock_form_int(const clock_form_t *form, const char *name, int min, int max, int *out);
