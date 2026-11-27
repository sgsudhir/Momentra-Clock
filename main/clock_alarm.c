#include "clock_alarm.h"
#include "clock_pins.h"

#include "clock_config.h"
#include "clock_schedule.h"
#include "clock_sound.h"
#include "clock_store.h"
#include "clock_time.h"
#include "clock_timers.h"
#include "driver/gpio.h"
#include "driver/ledc.h"
#include "esp_log.h"
#include "esp_random.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"

static const char *TAG = "clock_alarm";
/* The alarm task owns the buzzer. Other tasks exchange its status and
 * coalesced requests through this lock; requests are consumed once. */
static portMUX_TYPE status_lock = portMUX_INITIALIZER_UNLOCKED;
static clock_alarm_status_t status = {.magic_track = -1};
static bool stop_requested;      /* Stop the current alarm/chime/magic at the next tick. */
static bool beep_requested;      /* Pending short confirmation, not a counted queue. */
static bool magic_req_pending;   /* Pending manual magic-track test request. */
static int magic_req_track = -1;
static int magic_req_pwm = -1;

bool clock_alarm_is_configured(void)
{
    return CONFIG_CLOCK_PIN_BUZZER >= 0;
}

/** Publish scheduled alarm and magic playback status. */
static void set_status(bool ringing, uint8_t mask, bool magic_playing, int magic_track)
{
    portENTER_CRITICAL(&status_lock);
    status.ringing = ringing;
    status.alarm_mask = mask;
    status.magic_playing = magic_playing;
    status.magic_track = magic_playing ? magic_track : -1;
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
    magic_req_pending = false;
    portEXIT_CRITICAL(&status_lock);
}

void clock_alarm_beep(void)
{
    if (!clock_alarm_is_configured()) return;
    clock_config_t config;
    clock_store_get(&config);
    if (!config.feedback_enabled) return;
    portENTER_CRITICAL(&status_lock);
    beep_requested = true;
    portEXIT_CRITICAL(&status_lock);
}

esp_err_t clock_alarm_play_magic(int track, int pwm_override)
{
    if (!clock_alarm_is_configured()) return ESP_ERR_INVALID_STATE;
    if (track < -1 || track >= CLOCK_MAGIC_TRACK_COUNT ||
        pwm_override < -1 || pwm_override > 1) {
        return ESP_ERR_INVALID_ARG;
    }
    portENTER_CRITICAL(&status_lock);
    magic_req_pending = true;
    magic_req_track = track;
    magic_req_pwm = pwm_override;
    portEXIT_CRITICAL(&status_lock);
    return ESP_OK;
}

/** Atomically consume the pending confirmation request; return whether present. */
static bool take_beep_request(void)
{
    portENTER_CRITICAL(&status_lock);
    bool result = beep_requested;
    beep_requested = false;
    portEXIT_CRITICAL(&status_lock);
    return result;
}

/** Atomically consume the pending stop request; return whether present. */
static bool take_stop_request(void)
{
    portENTER_CRITICAL(&status_lock);
    bool result = stop_requested;
    stop_requested = false;
    portEXIT_CRITICAL(&status_lock);
    return result;
}

/** Atomically consume a pending manual magic-track request. */
static bool take_magic_request(int *track, int *pwm_override)
{
    portENTER_CRITICAL(&status_lock);
    bool result = magic_req_pending;
    if (result) {
        *track = magic_req_track;
        *pwm_override = magic_req_pwm;
        magic_req_pending = false;
    }
    portEXIT_CRITICAL(&status_lock);
    return result;
}

/** Set the active buzzer level when configured; log GPIO errors. */
static void buzzer_write(bool on)
{
    if (CONFIG_CLOCK_PIN_BUZZER >= 0) {
        esp_err_t err = gpio_set_level(CONFIG_CLOCK_PIN_BUZZER, on);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Buzzer output failed: %s", esp_err_to_name(err));
        }
    }
}

/** Stop LEDC PWM on timer/channel 1 and re-attach the buzzer pin as GPIO output low. */
static void pwm_detach_gpio_low(bool *pwm_attached, uint32_t *last_freq, bool *previous_output)
{
    int pin = CONFIG_CLOCK_PIN_BUZZER;
    if (!*pwm_attached || pin < 0) return;
    ledc_stop(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1, 0);
    gpio_config_t cfg = {
        .pin_bit_mask = 1ULL << (unsigned)pin,
        .mode = GPIO_MODE_OUTPUT,
    };
    esp_err_t err = gpio_config(&cfg);
    if (err == ESP_OK) {
        err = gpio_set_level(pin, 0);
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Buzzer GPIO restore failed: %s", esp_err_to_name(err));
    }
    *pwm_attached = false;
    *last_freq = 0;
    *previous_output = false;
}

/** Drive passive buzzer note via LEDC_TIMER_1 / LEDC_CHANNEL_1 (display owns timer/channel 0). */
static void pwm_drive_note(bool *pwm_attached, uint32_t *last_freq, uint32_t freq_hz)
{
    if (CONFIG_CLOCK_PIN_BUZZER < 0) return;
    if (!*pwm_attached) {
        uint32_t initial_freq = freq_hz > 0 ? freq_hz : 2000;
        ledc_timer_config_t timer = {
            .speed_mode = LEDC_LOW_SPEED_MODE,
            .duty_resolution = LEDC_TIMER_8_BIT,
            .timer_num = LEDC_TIMER_1,
            .freq_hz = initial_freq,
            .clk_cfg = LEDC_AUTO_CLK,
        };
        esp_err_t err = ledc_timer_config(&timer);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Buzzer PWM timer failed: %s", esp_err_to_name(err));
            return;
        }
        ledc_channel_config_t channel = {
            .gpio_num = CONFIG_CLOCK_PIN_BUZZER,
            .speed_mode = LEDC_LOW_SPEED_MODE,
            .channel = LEDC_CHANNEL_1,
            .timer_sel = LEDC_TIMER_1,
            .duty = 0,
        };
        err = ledc_channel_config(&channel);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Buzzer PWM channel failed: %s", esp_err_to_name(err));
            return;
        }
        *pwm_attached = true;
        *last_freq = initial_freq;
    }
    if (freq_hz > 0) {
        if (freq_hz != *last_freq) {
            esp_err_t err = ledc_set_freq(LEDC_LOW_SPEED_MODE, LEDC_TIMER_1, freq_hz);
            if (err != ESP_OK) {
                ESP_LOGW(TAG, "Buzzer PWM freq failed (%lu Hz): %s",
                         (unsigned long)freq_hz, esp_err_to_name(err));
                return;
            }
            *last_freq = freq_hz;
        }
        ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1, 128);
        ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1);
    } else {
        ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1, 0);
        ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1);
    }
}

static int pick_magic_track(int requested, int last_track)
{
    if (requested >= 0 && requested < CLOCK_MAGIC_TRACK_COUNT) return requested;
    unsigned idx = esp_random() % CLOCK_MAGIC_TRACK_COUNT;
    if ((int)idx == last_track && CLOCK_MAGIC_TRACK_COUNT > 1) {
        idx = (idx + 1 + (esp_random() % (CLOCK_MAGIC_TRACK_COUNT - 1))) % CLOCK_MAGIC_TRACK_COUNT;
    }
    return (int)idx;
}

/** FreeRTOS worker for schedules, timers, magic music and buzzer arbitration.
 * @param arg Unused task argument. The task runs until device restart.
 */
static void alarm_task(void *arg)
{
    (void)arg;
    clock_schedule_t schedule;
    clock_schedule_init(&schedule);
    int64_t sound_start = 0;     /* Monotonic start of active alarm/chime. */
    int64_t sound_end = 0;       /* Monotonic end of active alarm/chime. */
    uint8_t active_alarms = 0;   /* Bitmask; zero means sound is a chime. */
    unsigned pattern = 0;        /* Chime rhythm selected at its start. */
    bool previous_output = false; /* Avoid redundant GPIO writes. */
    int64_t feedback_end = 0;    /* Deadline for the short confirmation beep. */
    int64_t reminder_start = -1; /* Monotonic start of reminder sound, or absent. */
    bool magic_active = false;
    bool magic_pwm_active = false;
    int magic_track = -1;
    int last_magic_track = -1;
    int64_t magic_start = 0;
    bool pwm_attached = false;
    uint32_t last_pwm_freq = 0;

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
            magic_active = false;
            magic_track = -1;
            pwm_detach_gpio_low(&pwm_attached, &last_pwm_freq, &previous_output);
        }

        clock_config_t config;
        clock_store_get(&config);
        clock_time_snapshot_t time_state = clock_time_snapshot();
        clock_events_t events = clock_schedule_check(&schedule, &config,
                                                     time_state.unix_time, time_state.valid);
        int req_track = -1;
        int req_pwm = -1;
        bool manual_magic = take_magic_request(&req_track, &req_pwm);

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
                magic_active = false;
                magic_track = -1;
            } else if (err != ESP_OK) {
                ESP_LOGE(TAG, "Alarm not started; could not persist current settings: %s",
                         esp_err_to_name(err));
            }
        } else if (events.magic && CONFIG_CLOCK_PIN_BUZZER >= 0 && !active_alarms && sound_end <= now) {
            /* Prefer interesting-time music over hourly chime when both match (e.g. 00:00). */
            magic_track = pick_magic_track(-1, last_magic_track);
            last_magic_track = magic_track;
            magic_pwm_active = config.magic_pwm != 0;
            magic_start = now;
            magic_active = true;
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
                magic_active = false;
                magic_track = -1;
            }
        } else if (manual_magic && CONFIG_CLOCK_PIN_BUZZER >= 0 && !active_alarms && sound_end <= now) {
            magic_track = pick_magic_track(req_track, last_magic_track);
            last_magic_track = magic_track;
            magic_pwm_active = (req_pwm >= 0) ? (req_pwm != 0) : (config.magic_pwm != 0);
            magic_start = now;
            magic_active = true;
        }
        if (now >= sound_end) {
            active_alarms = 0;
        }

        /* Priority: Alarm > Hourly Chime > Magic Music > Reminder > Feedback. */
        bool output = false;
        if (now < sound_end) {
            pwm_detach_gpio_low(&pwm_attached, &last_pwm_freq, &previous_output);
            if (active_alarms) {
                output = clock_sound_alarm((now - sound_start) / 1000);
            } else {
                output = clock_sound_chime(pattern, (now - sound_start) / 1000);
            }
        } else if (magic_active && magic_track >= 0) {
            uint64_t elapsed_ms = (uint64_t)(now > magic_start ? (now - magic_start) / 1000 : 0);
            bool finished = false;
            uint32_t freq = clock_sound_magic_note((unsigned)magic_track, elapsed_ms, &finished);
            if (finished) {
                magic_active = false;
                magic_track = -1;
                pwm_detach_gpio_low(&pwm_attached, &last_pwm_freq, &previous_output);
                output = false;
            } else if (magic_pwm_active) {
                pwm_drive_note(&pwm_attached, &last_pwm_freq, freq);
            } else {
                pwm_detach_gpio_low(&pwm_attached, &last_pwm_freq, &previous_output);
                output = clock_sound_magic_active((unsigned)magic_track, elapsed_ms);
            }
        } else {
            pwm_detach_gpio_low(&pwm_attached, &last_pwm_freq, &previous_output);
            if (timers.reminder_state == TIMER_RINGING) {
                output = clock_sound_reminder((now - reminder_start) / 1000);
            } else {
                if (!config.feedback_enabled) {
                    take_beep_request();
                    feedback_end = 0;
                } else if (now >= feedback_end && take_beep_request()) {
                    feedback_end = now + 100000;
                }
                output = config.feedback_enabled && now < feedback_end;
            }
        }
        set_status(active_alarms != 0, active_alarms, magic_active, magic_track);
        if (!pwm_attached && output != previous_output) {
            buzzer_write(output);
            previous_output = output;
        }
        vTaskDelay(pdMS_TO_TICKS(magic_active ? 10 : active_alarms ? 25 : 50));
    }
}

esp_err_t clock_alarm_start(void)
{
    if (CONFIG_CLOCK_PIN_BUZZER >= 0) {
        int pin = CONFIG_CLOCK_PIN_BUZZER;
        if (!clock_pin_safe(pin)) {
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
