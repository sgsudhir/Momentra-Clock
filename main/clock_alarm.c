#include "clock_alarm.h"

#include "clock_config.h"
#include "clock_schedule.h"
#include "clock_sound.h"
#include "clock_store.h"
#include "clock_time.h"
#include "clock_timers.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"

static const char *TAG = "clock_alarm";
static portMUX_TYPE status_lock = portMUX_INITIALIZER_UNLOCKED;
static clock_alarm_status_t status;
static bool stop_requested;
static bool beep_requested;

bool clock_alarm_is_configured(void)
{
    return CONFIG_CLOCK_PIN_BUZZER >= 0;
}

static void set_status(bool ringing, uint8_t mask)
{
    portENTER_CRITICAL(&status_lock);
    status.ringing = ringing;
    status.alarm_mask = mask;
    portEXIT_CRITICAL(&status_lock);
}

clock_alarm_status_t clock_alarm_status(void)
{
    portENTER_CRITICAL(&status_lock);
    clock_alarm_status_t result = status;
    portEXIT_CRITICAL(&status_lock);
    return result;
}

void clock_alarm_stop(void)
{
    portENTER_CRITICAL(&status_lock);
    stop_requested = true;
    portEXIT_CRITICAL(&status_lock);
}

void clock_alarm_beep(void)
{
    if (!clock_alarm_is_configured()) return;
    portENTER_CRITICAL(&status_lock);
    beep_requested = true;
    portEXIT_CRITICAL(&status_lock);
}

static bool take_beep_request(void)
{
    portENTER_CRITICAL(&status_lock);
    bool result = beep_requested;
    beep_requested = false;
    portEXIT_CRITICAL(&status_lock);
    return result;
}

static bool take_stop_request(void)
{
    portENTER_CRITICAL(&status_lock);
    bool result = stop_requested;
    stop_requested = false;
    portEXIT_CRITICAL(&status_lock);
    return result;
}

static void buzzer_write(bool on)
{
    if (CONFIG_CLOCK_PIN_BUZZER >= 0) {
        esp_err_t err = gpio_set_level(CONFIG_CLOCK_PIN_BUZZER, on);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Buzzer output failed: %s", esp_err_to_name(err));
        }
    }
}

static void alarm_task(void *arg)
{
    (void)arg;
    clock_schedule_t schedule;
    clock_schedule_init(&schedule);
    int64_t sound_start = 0;
    int64_t sound_end = 0;
    uint8_t active_alarms = 0;
    unsigned pattern = 0;
    bool previous_output = false;
    int64_t feedback_end = 0;
    int64_t reminder_start = -1;

    while (true) {
        int64_t now = esp_timer_get_time();
        if (clock_timers_update()) clock_alarm_beep();
        clock_timers_snapshot_t timers = clock_timers_snapshot();
        if (timers.reminder_state == TIMER_RINGING) {
            if (reminder_start < 0) reminder_start = now;
        } else {
            reminder_start = -1;
        }
        if (take_stop_request()) {
            active_alarms = 0;
            sound_end = 0;
        }

        clock_config_t config;
        clock_store_get(&config);
        clock_time_snapshot_t time_state = clock_time_snapshot();
        clock_events_t events = clock_schedule_check(&schedule, &config,
                                                    time_state.unix_time, time_state.valid);
        if (events.alarms && CONFIG_CLOCK_PIN_BUZZER < 0) {
            ESP_LOGE(TAG, "Alarm not started; buzzer GPIO is not configured");
        } else if (events.alarms) {
            unsigned duration = 0;
            uint8_t claimed = 0;
            esp_err_t err = clock_store_claim_alarms(&config, events.alarms, &claimed, &duration);
            if (err == ESP_OK && claimed) {
                int64_t end = now + (int64_t)duration * 1000000;
                if (active_alarms && sound_end > end) end = sound_end;
                active_alarms |= claimed;
                sound_start = now;
                sound_end = end;
            } else if (err != ESP_OK) {
                ESP_LOGE(TAG, "Alarm not started; could not persist current settings: %s",
                         esp_err_to_name(err));
            }
        } else if (events.hourly && CONFIG_CLOCK_PIN_BUZZER < 0) {
            ESP_LOGW(TAG, "Hourly chime skipped; buzzer GPIO is not configured");
        } else if (events.hourly && sound_end <= now) {
            if (config.hourly_pattern >= CLOCK_SOUND_COUNT) {
                ESP_LOGE(TAG, "Invalid hourly sound pattern: %u", config.hourly_pattern);
            } else {
                active_alarms = 0;
                pattern = config.hourly_pattern;
                sound_start = now;
                sound_end = now + 2000000;
            }
        }
        if (now >= sound_end) {
            active_alarms = 0;
        }
        set_status(active_alarms != 0, active_alarms);

        bool output = false;
        if (now < sound_end) {
            if (active_alarms) {
                output = clock_sound_alarm((now - sound_start) / 1000);
            } else {
                output = clock_sound_chime(pattern, (now - sound_start) / 1000);
            }
        } else if (timers.reminder_state == TIMER_RINGING) {
            output = clock_sound_reminder((now - reminder_start) / 1000);
        } else {
            if (now >= feedback_end && take_beep_request()) feedback_end = now + 100000;
            output = now < feedback_end;
        }
        if (output != previous_output) {
            buzzer_write(output);
            previous_output = output;
        }
        vTaskDelay(pdMS_TO_TICKS(active_alarms ? 25 : 50));
    }
}

esp_err_t clock_alarm_start(void)
{
    if (CONFIG_CLOCK_PIN_BUZZER >= 0) {
        int pin = CONFIG_CLOCK_PIN_BUZZER;
        if (!GPIO_IS_VALID_OUTPUT_GPIO(pin) || pin == 0 || pin == 1 || pin == 2 ||
            pin == 3 || pin == 5 || (pin >= 6 && pin <= 12) || pin == 15) {
            ESP_LOGE(TAG, "Unsafe buzzer GPIO: %d", pin);
            return ESP_ERR_INVALID_ARG;
        }
        gpio_config_t config = {
            .pin_bit_mask = 1ULL << (unsigned)pin,
            .mode = GPIO_MODE_OUTPUT,
        };
        esp_err_t err = gpio_config(&config);
        if (err != ESP_OK) {
            return err;
        }
        err = gpio_set_level(CONFIG_CLOCK_PIN_BUZZER, 0);
        if (err != ESP_OK) {
            return err;
        }
    } else {
        ESP_LOGW(TAG, "Buzzer GPIO is not configured");
    }
    return xTaskCreatePinnedToCore(alarm_task, "clock_alarm", 4096, NULL, 5, NULL, 0) == pdPASS
               ? ESP_OK : ESP_ERR_NO_MEM;
}
