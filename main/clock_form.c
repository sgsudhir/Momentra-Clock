#include "clock_form.h"

#include <errno.h>
#include <stdlib.h>
#include <string.h>

/** Decode one ASCII hexadecimal digit; return -1 for any other character. */
static int hex_digit(char c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

/** Decode one bounded form component into out, including its terminating NUL.
 * Return false for invalid escapes, embedded NUL or insufficient capacity.
 */
static bool decode(const char *source, size_t length, char *out, size_t capacity)
{
    size_t pos = 0;
    for (size_t i = 0; i < length; ++i) {
        unsigned char c = source[i];
        if (c == '+') {
            c = ' ';
        } else if (c == '%') {
            if (i + 2 >= length) return false;
            int hi = hex_digit(source[i + 1]);
            int lo = hex_digit(source[i + 2]);
            if (hi < 0 || lo < 0) return false;
            c = (hi << 4) | lo;
            i += 2;
        }
        if (c == 0 || pos + 1 >= capacity) return false;
        out[pos++] = c;
    }
    out[pos] = '\0';
    return true;
}

bool clock_form_parse(clock_form_t *form, const char *body, size_t length)
{
    if (!form || !body || !length || memchr(body, '\0', length)) return false;
    form->count = 0;
    const char *end_body = body + length;
    for (const char *part = body; part < end_body;) {
        if (form->count == sizeof(form->fields) / sizeof(form->fields[0])) return false;
        const char *end = memchr(part, '&', end_body - part);
        if (!end) end = end_body;
        const char *equal = memchr(part, '=', end - part);
        if (!equal || equal == part) return false;
        clock_form_field_t *field = &form->fields[form->count];
        if (!decode(part, equal - part, field->name, sizeof(field->name)) ||
            !decode(equal + 1, end - equal - 1, field->value, sizeof(field->value))) {
            return false;
        }
        /* Compare decoded names so aliases such as "a" and "%61" collide. */
        for (size_t i = 0; i < form->count; ++i) {
            if (strcmp(form->fields[i].name, field->name) == 0) return false;
        }
        ++form->count;
        part = end < end_body ? end + 1 : end;
        if (end < end_body && part == end_body) return false;
    }
    return true;
}

const char *clock_form_value(const clock_form_t *form, const char *name)
{
    for (size_t i = 0; i < form->count; ++i) {
        if (strcmp(form->fields[i].name, name) == 0) return form->fields[i].value;
    }
    return NULL;
}

bool clock_form_int(const clock_form_t *form, const char *name, int min, int max, int *out)
{
    const char *value = clock_form_value(form, name);
    if (!value || !*value) return false;
    char *end;
    errno = 0;
    long number = strtol(value, &end, 10);
    if (errno || *end || number < min || number > max) return false;
    *out = number;
    return true;
}
