#include "clock_web.h"

#include <stdio.h>
#include <string.h>

#include "clock_alarm.h"
#include "clock_display.h"
#include "clock_form.h"
#include "clock_network.h"
#include "clock_status.h"
#include "clock_store.h"
#include "clock_time.h"
#include "clock_timers.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_ota_ops.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

/* The build embeds the dashboard as a binary resource; the linker provides
 * these bounds, including an extra terminating byte at the end. */
extern const char web_index_start[] asm("_binary_index_html_start");
extern const char web_index_end[] asm("_binary_index_html_end");

static const char *TAG = "clock_web";

/** Read and parse a bounded URL-encoded request body.
 * @param req HTTP request; @param form Parsed destination.
 * @return False for an empty, oversized, interrupted or malformed body.
 */
static bool read_form(httpd_req_t *req, clock_form_t *form)
{
    if (req->content_len <= 0 || req->content_len > 1024) return false;
    char body[1025];
    size_t used = 0;
    while (used < req->content_len) {
        int count = httpd_req_recv(req, body + used, req->content_len - used);
        if (count <= 0) return false;
        used += count;
    }
    return clock_form_parse(form, body, used);
}

/** Send a JSON error using the supplied HTTP status and fixed message. */
static esp_err_t json_error(httpd_req_t *req, const char *status, const char *message)
{
    httpd_resp_set_status(req, status);
    httpd_resp_set_type(req, "application/json");
    char body[160];
    snprintf(body, sizeof(body), "{\"error\":\"%s\"}", message);
    return httpd_resp_sendstr(req, body);
}

/** Send the standard JSON success response. */
static esp_err_t json_ok(httpd_req_t *req)
{
    httpd_resp_set_type(req, "application/json");
    return httpd_resp_sendstr(req, "{\"ok\":true}");
}

/** Serve the embedded dashboard. Returns the HTTP send result. */
static esp_err_t index_handler(httpd_req_t *req)
{
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    return httpd_resp_send(req, web_index_start, web_index_end - web_index_start - 1);
}

/** Gather subsystem snapshots and return the uncached status JSON response. */
static esp_err_t status_handler(httpd_req_t *req)
{
    clock_status_t status = {0};
    clock_store_get(&status.config);
    clock_network_status_t network = clock_network_status();
    clock_time_snapshot_t clock = clock_time_snapshot();
    clock_alarm_status_t alarm = clock_alarm_status();
    clock_timers_snapshot_t timers = clock_timers_snapshot();
    esp_err_t err = esp_efuse_mac_get_default(status.chip_id);
    if (err == ESP_OK) err = esp_wifi_get_mac(WIFI_IF_STA, status.wifi_mac);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Device identity unavailable: %s", esp_err_to_name(err));
        return json_error(req, "500 Internal Server Error", "device identity unavailable");
    }
    if (network.connected || network.ap_active) {
        const char *key = network.connected ? "WIFI_STA_DEF" : "WIFI_AP_DEF";
        esp_netif_t *netif = esp_netif_get_handle_from_ifkey(key);
        esp_netif_ip_info_t info;
        err = netif ? esp_netif_get_ip_info(netif, &info) : ESP_ERR_INVALID_STATE;
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Local IP unavailable: %s", esp_err_to_name(err));
            return json_error(req, "500 Internal Server Error", "local IP unavailable");
        }
        status.ip_valid = info.ip.addr != 0;
        if (status.ip_valid) {
            uint32_t ip = esp_netif_htonl(info.ip.addr);
            status.ip[0] = ip >> 24;
            status.ip[1] = ip >> 16;
            status.ip[2] = ip >> 8;
            status.ip[3] = ip;
        }
    }
    status.uptime_seconds = esp_timer_get_time() / 1000000;
    status.free_heap_bytes = esp_get_free_heap_size();
    status.min_free_heap_bytes = esp_get_minimum_free_heap_size();
    status.wifi_connected = network.connected;
    status.setup_ap = network.ap_active;
    status.rssi_valid = network.rssi_valid;
    status.wifi_rssi = network.rssi;
    status.time_valid = clock.valid;
    status.unix_time = clock.unix_time;
    status.unix_time_ms = clock.unix_time_ms;
    status.sync_age_seconds = clock.sync_age_seconds;
    status.display_ready = clock_display_is_ready();
    status.buzzer_configured = clock_alarm_is_configured();
    status.ringing = alarm.ringing;
    status.ringing_mask = alarm.alarm_mask;
    status.stopwatch_state = timers.stopwatch_state;
    status.stopwatch_ms = timers.stopwatch_us / 1000;
    status.reminder_state = timers.reminder_state;
    status.reminder_ms = (timers.reminder_us + 999) / 1000;
    char body[1400];
    if (!clock_status_json(&status, body, sizeof(body))) {
        return json_error(req, "500 Internal Server Error", "status too large");
    }
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    return httpd_resp_sendstr(req, body);
}

/** Validate display/sound settings and save with optimistic conflict detection.
 * Optional newer fields retain their existing values when older clients omit them.
 */
static esp_err_t settings_handler(httpd_req_t *req)
{
    clock_form_t form;
    int brightness, font, format, hourly, pattern, feedback = 0, blink = 0, animation = 0;
    if (!read_form(req, &form)) return json_error(req, "400 Bad Request", "invalid settings");
    bool has_feedback = clock_form_value(&form, "feedback_enabled") != NULL;
    bool has_blink = clock_form_value(&form, "colon_blink") != NULL;
    bool has_animation = clock_form_value(&form, "seconds_animation") != NULL;
    const char *timezone = clock_form_value(&form, "timezone_primary");
    if (form.count != 5U + has_feedback + has_blink + has_animation + (timezone != NULL) ||
        !clock_form_int(&form, "brightness", 0, 100, &brightness) ||
        !clock_form_int(&form, "font", 0, CLOCK_FONT_COUNT - 1, &font) ||
        !clock_form_int(&form, "format_12h", 0, 1, &format) ||
        !clock_form_int(&form, "hourly_enabled", 0, 1, &hourly) ||
        !clock_form_int(&form, "hourly_pattern", 0, CLOCK_SOUND_COUNT - 1, &pattern) ||
        (has_feedback && !clock_form_int(&form, "feedback_enabled", 0, 1, &feedback)) ||
        (has_blink && !clock_form_int(&form, "colon_blink", 0, 1, &blink)) ||
        (timezone && !clock_timezone_valid(timezone)) ||
        (has_animation && !clock_form_int(&form, "seconds_animation", 0,
                                          CLOCK_SECONDS_ANIMATION_COUNT - 1, &animation))) {
        return json_error(req, "400 Bad Request", "invalid settings");
    }
    clock_config_t old;
    clock_store_get(&old);
    clock_config_t updated = old;
    updated.brightness = brightness;
    updated.font = font;
    updated.format_12h = format;
    updated.hourly_enabled = hourly;
    updated.hourly_pattern = pattern;
    if (has_feedback) updated.feedback_enabled = feedback;
    if (has_blink) updated.colon_blink = blink;
    if (has_animation) updated.seconds_animation = animation;
    if (timezone) {
        memset(updated.timezone_primary, 0, sizeof(updated.timezone_primary));
        strcpy(updated.timezone_primary, timezone);
    }
    esp_err_t err = clock_store_set_if_unchanged(&old, &updated);
    if (err == ESP_ERR_INVALID_STATE) return json_error(req, "409 Conflict", "settings changed; retry");
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Settings save failed: %s", esp_err_to_name(err));
        return json_error(req, "500 Internal Server Error", "settings save failed");
    }
    clock_alarm_beep();
    return json_ok(req);
}

static esp_err_t timezones_handler(httpd_req_t *req)
{
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    char chunk[512] = "[";
    size_t used = 1;
    esp_err_t err = ESP_OK;
    for (size_t i = 0; err == ESP_OK && i < clock_timezone_count(); ++i) {
        char item[CLOCK_TIMEZONE_NAME_SIZE + 4];
        size_t length = snprintf(item, sizeof(item), "%s\"%s\"", i ? "," : "", clock_timezone_name(i));
        if (used + length >= sizeof(chunk)) {
            err = httpd_resp_send_chunk(req, chunk, used);
            used = 0;
        }
        memcpy(chunk + used, item, length);
        used += length;
    }
    if (err == ESP_OK) err = httpd_resp_send_chunk(req, chunk, used);
    if (err == ESP_OK) err = httpd_resp_sendstr_chunk(req, "]");
    if (err == ESP_OK) err = httpd_resp_sendstr_chunk(req, NULL);
    return err;
}

static esp_err_t secondary_timezone_handler(httpd_req_t *req)
{
    clock_form_t form;
    int enabled;
    if (!read_form(req, &form) || form.count != 2 ||
        !clock_form_int(&form, "timezone_secondary_enabled", 0, 1, &enabled)) {
        return json_error(req, "400 Bad Request", "invalid second timezone");
    }
    const char *name = clock_form_value(&form, "timezone_secondary");
    if (!clock_timezone_valid(name)) return json_error(req, "400 Bad Request", "invalid second timezone");
    clock_config_t old;
    clock_store_get(&old);
    clock_config_t updated = old;
    memset(updated.timezone_secondary, 0, sizeof(updated.timezone_secondary));
    strcpy(updated.timezone_secondary, name);
    updated.timezone_secondary_enabled = enabled;
    esp_err_t err = clock_store_set_if_unchanged(&old, &updated);
    if (err == ESP_ERR_INVALID_STATE) return json_error(req, "409 Conflict", "settings changed; retry");
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Second timezone save failed: %s", esp_err_to_name(err));
        return json_error(req, "500 Internal Server Error", "second timezone save failed");
    }
    clock_alarm_beep();
    return json_ok(req);
}

/** Validate and persist one alarm slot without overwriting concurrent updates. */
static esp_err_t alarm_handler(httpd_req_t *req)
{
    clock_form_t form;
    int index, enabled, hour, minute, repeat, duration;
    if (!read_form(req, &form) || form.count != 6 ||
        !clock_form_int(&form, "index", 0, CLOCK_ALARM_COUNT - 1, &index) ||
        !clock_form_int(&form, "enabled", 0, 1, &enabled) ||
        !clock_form_int(&form, "hour", 0, 23, &hour) ||
        !clock_form_int(&form, "minute", 0, 59, &minute) ||
        !clock_form_int(&form, "repeat", 0, 1, &repeat) ||
        !clock_form_int(&form, "duration_seconds", 5, 300, &duration) ||
        !clock_alarm_duration_valid(duration)) {
        return json_error(req, "400 Bad Request", "invalid alarm");
    }
    clock_config_t old;
    clock_store_get(&old);
    clock_config_t updated = old;
    updated.alarms[index] = (clock_alarm_t){enabled, hour, minute, repeat, duration};
    esp_err_t err = clock_store_set_if_unchanged(&old, &updated);
    if (err == ESP_ERR_INVALID_STATE) return json_error(req, "409 Conflict", "settings changed; retry");
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Alarm save failed: %s", esp_err_to_name(err));
        return json_error(req, "500 Internal Server Error", "alarm save failed");
    }
    clock_alarm_beep();
    return json_ok(req);
}

/** Request that the alarm task stop its active scheduled sound. */
static esp_err_t stop_handler(httpd_req_t *req)
{
    clock_alarm_stop();
    return json_ok(req);
}

/** Validate a stopwatch/reminder command and apply its state transition. */
static esp_err_t timer_handler(httpd_req_t *req)
{
    clock_form_t form;
    if (!read_form(req, &form)) return json_error(req, "400 Bad Request", "invalid timer request");
    const char *name = clock_form_value(&form, "timer");
    const char *action_name = clock_form_value(&form, "action");
    if (!name || !action_name) return json_error(req, "400 Bad Request", "invalid timer request");
    bool reminder = strcmp(name, "reminder") == 0;
    if (!reminder && strcmp(name, "stopwatch") != 0) {
        return json_error(req, "400 Bad Request", "invalid timer");
    }
    clock_timer_action_t action;
    if (strcmp(action_name, "start") == 0) action = TIMER_START;
    else if (strcmp(action_name, "pause") == 0) action = TIMER_PAUSE;
    else if (strcmp(action_name, "resume") == 0) action = TIMER_RESUME;
    else if (strcmp(action_name, "stop") == 0) action = TIMER_STOP;
    else return json_error(req, "400 Bad Request", "invalid timer action");
    int seconds = 0;
    if (reminder && action == TIMER_START) {
        if (form.count != 3 || !clock_form_int(&form, "seconds", 1, CLOCK_REMINDER_MAX_SECONDS, &seconds)) {
            return json_error(req, "400 Bad Request", "invalid reminder duration");
        }
        if (!clock_alarm_is_configured()) {
            return json_error(req, "409 Conflict", "buzzer not configured");
        }
    } else if (form.count != 2) {
        return json_error(req, "400 Bad Request", "invalid timer request");
    }
    if (!clock_timers_apply(reminder, action, seconds)) {
        return json_error(req, "409 Conflict", "timer state changed; refresh and retry");
    }
    if (!reminder) clock_alarm_beep();
    return json_ok(req);
}

/** Start an asynchronous Wi-Fi scan, returning conflict if one is active. */
static esp_err_t scan_start_handler(httpd_req_t *req)
{
    esp_err_t err = clock_network_scan_start();
    if (err == ESP_ERR_INVALID_STATE) return json_error(req, "409 Conflict", "scan already running");
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Could not start Wi-Fi scan: %s", esp_err_to_name(err));
        return json_error(req, "500 Internal Server Error", "could not start scan");
    }
    return json_ok(req);
}

/** Return scan progress or stream results with SSID bytes encoded as hex. */
static esp_err_t scan_status_handler(httpd_req_t *req)
{
    clock_scan_result_t result = clock_network_scan_result();
    if (result.state == SCAN_FAILED) {
        return json_error(req, "500 Internal Server Error", "Wi-Fi scan failed; retry");
    }
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    if (result.state != SCAN_DONE) {
        return httpd_resp_sendstr(req, result.state == SCAN_RUNNING ?
                                  "{\"state\":\"running\"}" : "{\"state\":\"idle\"}");
    }
    esp_err_t err = httpd_resp_sendstr_chunk(req, "{\"state\":\"done\",\"networks\":[");
    for (unsigned i = 0; err == ESP_OK && i < result.count; ++i) {
        char hex[65], item[128];
        size_t length = strnlen((const char *)result.networks[i].ssid, 32);
        for (size_t j = 0; j < length; ++j) {
            static const char digits[] = "0123456789abcdef";
            hex[2 * j] = digits[result.networks[i].ssid[j] >> 4];
            hex[2 * j + 1] = digits[result.networks[i].ssid[j] & 15];
        }
        hex[2 * length] = '\0';
        snprintf(item, sizeof(item), "%s{\"ssid_hex\":\"%s\",\"rssi\":%d}",
                 i ? "," : "", hex, result.networks[i].rssi);
        err = httpd_resp_sendstr_chunk(req, item);
    }
    if (err == ESP_OK) err = httpd_resp_sendstr_chunk(req, "]}");
    if (err == ESP_OK) err = httpd_resp_sendstr_chunk(req, NULL);
    return err;
}

/** Wait briefly for the HTTP response, then restart. @param arg Unused. */
static void restart_task(void *arg)
{
    (void)arg;
    vTaskDelay(pdMS_TO_TICKS(1000));
    esp_restart();
}

/** Launch the delayed restart worker. @return False if task creation fails. */
static bool schedule_restart(void)
{
    return xTaskCreatePinnedToCore(restart_task, "restart", 2048, NULL, 5, NULL, 0) == pdPASS;
}

/** Schedule a reboot and send its acknowledgement. */
static esp_err_t reboot_handler(httpd_req_t *req)
{
    if (!schedule_restart()) return json_error(req, "500 Internal Server Error", "restart failed");
    return json_ok(req);
}

/** Save pending Wi-Fi credentials and schedule a reboot to try them. */
static esp_err_t wifi_handler(httpd_req_t *req)
{
    clock_form_t form;
    if (!read_form(req, &form) || form.count != 2) {
        return json_error(req, "400 Bad Request", "invalid Wi-Fi credentials");
    }
    const char *ssid = clock_form_value(&form, "ssid");
    const char *password = clock_form_value(&form, "password");
    esp_err_t err = clock_network_store_credentials(ssid, password);
    memset(&form, 0, sizeof(form));
    if (err == ESP_ERR_INVALID_ARG) return json_error(req, "400 Bad Request", "invalid Wi-Fi credentials");
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Wi-Fi credential save failed: %s", esp_err_to_name(err));
        return json_error(req, "500 Internal Server Error", "Wi-Fi credential save failed");
    }
    if (!schedule_restart()) return json_error(req, "500 Internal Server Error", "saved; restart failed");
    clock_alarm_beep();
    return json_ok(req);
}

/** Resume scanning after an OTA failure; log if the scanner does not respond. */
static void resume_display(void)
{
    esp_err_t err = clock_display_pause(false);
    if (err != ESP_OK) ESP_LOGE(TAG, "Could not resume display: %s", esp_err_to_name(err));
}

/** Stream an OTA image into the inactive partition and select it for next boot.
 * Requires station-only mode. On error abort the write when necessary and
 * resume the paused display. Returns the HTTP response/send status.
 */
static esp_err_t ota_handler(httpd_req_t *req)
{
    clock_network_status_t network = clock_network_status();
    if (!network.connected || network.ap_active) {
        return json_error(req, "403 Forbidden", "OTA requires station-only mode");
    }
    const esp_partition_t *partition = esp_ota_get_next_update_partition(NULL);
    if (!partition || req->content_len <= 0 || req->content_len > partition->size) {
        return json_error(req, "400 Bad Request", "invalid firmware size");
    }
    /* Flash writes interfere with scan timing; blank and pause the panel until
     * reboot or until an error requires normal operation to resume. */
    esp_err_t err = clock_display_pause(true);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Could not pause display: %s", esp_err_to_name(err));
        resume_display();
        return json_error(req, "500 Internal Server Error", "display pause failed");
    }
    esp_ota_handle_t handle;
    err = esp_ota_begin(partition, req->content_len, &handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "OTA begin failed: %s", esp_err_to_name(err));
        resume_display();
        return json_error(req, "500 Internal Server Error", "OTA begin failed");
    }
    char buffer[1024];
    size_t remaining = req->content_len;
    while (remaining > 0) {
        int count = httpd_req_recv(req, buffer, remaining < sizeof(buffer) ? remaining : sizeof(buffer));
        if (count <= 0) {
            esp_ota_abort(handle);
            resume_display();
            return json_error(req, "400 Bad Request", "firmware upload interrupted");
        }
        err = esp_ota_write(handle, buffer, count);
        if (err != ESP_OK) {
            esp_ota_abort(handle);
            ESP_LOGE(TAG, "OTA write failed: %s", esp_err_to_name(err));
            resume_display();
            return json_error(req, "500 Internal Server Error", "OTA write failed");
        }
        remaining -= count;
    }
    err = esp_ota_end(handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "OTA validation failed: %s", esp_err_to_name(err));
        resume_display();
        return json_error(req, "400 Bad Request", "invalid firmware");
    }
    err = esp_ota_set_boot_partition(partition);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "OTA boot selection failed: %s", esp_err_to_name(err));
        resume_display();
        return json_error(req, "500 Internal Server Error", "OTA boot selection failed");
    }
    if (!schedule_restart()) {
        resume_display();
        return json_error(req, "500 Internal Server Error", "uploaded; restart failed");
    }
    return json_ok(req);
}

esp_err_t clock_web_start(void)
{
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.core_id = 0;
    config.stack_size = 8192;
    config.max_uri_handlers = 13;
    httpd_handle_t server;
    esp_err_t err = httpd_start(&server, &config);
    if (err != ESP_OK) return err;
    const httpd_uri_t routes[] = {
        {.uri = "/", .method = HTTP_GET, .handler = index_handler},
        {.uri = "/api/status", .method = HTTP_GET, .handler = status_handler},
        {.uri = "/api/settings", .method = HTTP_POST, .handler = settings_handler},
        {.uri = "/api/timezones", .method = HTTP_GET, .handler = timezones_handler},
        {.uri = "/api/timezones", .method = HTTP_POST, .handler = secondary_timezone_handler},
        {.uri = "/api/alarm", .method = HTTP_POST, .handler = alarm_handler},
        {.uri = "/api/alarm/stop", .method = HTTP_POST, .handler = stop_handler},
        {.uri = "/api/timer", .method = HTTP_POST, .handler = timer_handler},
        {.uri = "/api/wifi/scan", .method = HTTP_POST, .handler = scan_start_handler},
        {.uri = "/api/wifi/scan", .method = HTTP_GET, .handler = scan_status_handler},
        {.uri = "/api/wifi", .method = HTTP_POST, .handler = wifi_handler},
        {.uri = "/api/reboot", .method = HTTP_POST, .handler = reboot_handler},
        {.uri = "/api/ota", .method = HTTP_POST, .handler = ota_handler},
    };
    for (size_t i = 0; i < sizeof(routes) / sizeof(routes[0]); ++i) {
        err = httpd_register_uri_handler(server, &routes[i]);
        if (err != ESP_OK) {
            httpd_stop(server);
            return err;
        }
    }
    return ESP_OK;
}
