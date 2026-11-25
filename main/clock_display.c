#include "clock_display.h"

#include <string.h>
#include <time.h>

#include "clock_render.h"
#include "clock_network.h"
#include "clock_pins.h"
#include "clock_scan.h"
#include "clock_store.h"
#include "clock_time.h"
#include "clock_timers.h"
#include "driver/gpio.h"
#include "driver/gptimer.h"
#include "driver/ledc.h"
#include "driver/spi_master.h"
#include "esp_check.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"
#include "sdkconfig.h"

static const char *TAG = "clock_display";

#if CONFIG_CLOCK_PANEL_ENABLED
#ifdef CONFIG_CLOCK_OE_ACTIVE_LOW
#define OE_INVERTED 1
#else
#define OE_INVERTED 0
#endif
#ifdef CONFIG_CLOCK_DATA_ACTIVE_LOW
#define DATA_INVERTED 1
#else
#define DATA_INVERTED 0
#endif
/* The core-0 renderer publishes complete frames; the core-1 scanner copies
 * one frame at row zero and keeps it for all four addresses. This prevents
 * partially rendered frames from being shown during a scan. */
static spi_device_handle_t spi;
static EventGroupHandle_t display_events;
static portMUX_TYPE pause_lock = portMUX_INITIALIZER_UNLOCKED;
static portMUX_TYPE frame_lock = portMUX_INITIALIZER_UNLOCKED;
static clock_frame_t rendered_frame;
static unsigned rendered_brightness;
static bool paused; /* Requested pause state, protected by pause_lock. */
static bool ready;  /* Scanner health/startup state, protected by pause_lock. */
#define DISPLAY_PAUSED BIT0
#define DISPLAY_RUNNING BIT1
#define DISPLAY_INITIALIZED BIT2
#define DISPLAY_INIT_FAILED BIT3

/** Check panel pins are safe, unique and do not conflict with the buzzer. */
static bool pins_valid(void)
{
    int pins[] = {CONFIG_CLOCK_PIN_DATA, CONFIG_CLOCK_PIN_CLOCK, CONFIG_CLOCK_PIN_LATCH,
                  CONFIG_CLOCK_PIN_OE, CONFIG_CLOCK_PIN_A, CONFIG_CLOCK_PIN_B};
    for (unsigned i = 0; i < sizeof(pins) / sizeof(pins[0]); ++i) {
        if (!clock_pin_safe(pins[i]) || pins[i] == CONFIG_CLOCK_PIN_BUZZER) return false;
        for (unsigned j = 0; j < i; ++j) {
            if (pins[i] == pins[j]) return false;
        }
    }
    return true;
}

/** Read the requested pause state under its lock. */
static bool is_paused(void)
{
    portENTER_CRITICAL(&pause_lock);
    bool result = paused;
    portEXIT_CRITICAL(&pause_lock);
    return result;
}

bool clock_display_is_ready(void)
{
    portENTER_CRITICAL(&pause_lock);
    bool result = ready;
    portEXIT_CRITICAL(&pause_lock);
    return result;
}

/** Publish panel readiness under its lock. */
static void set_ready(bool value)
{
    portENTER_CRITICAL(&pause_lock);
    ready = value;
    portEXIT_CRITICAL(&pause_lock);
}

esp_err_t clock_display_pause(bool pause)
{
    xEventGroupClearBits(display_events, pause ? DISPLAY_PAUSED : DISPLAY_RUNNING);
    portENTER_CRITICAL(&pause_lock);
    paused = pause;
    portEXIT_CRITICAL(&pause_lock);
    EventBits_t expected = pause ? DISPLAY_PAUSED : DISPLAY_RUNNING;
    EventBits_t bits = xEventGroupWaitBits(display_events, expected, pdFALSE, pdTRUE,
                                           pdMS_TO_TICKS(1000));
    return (bits & expected) ? ESP_OK : ESP_ERR_TIMEOUT;
}

/** Shift one multiplexed row group, latch it while blanked, then restore PWM.
 * @param frame Stable logical frame for this scan.
 * @param row Panel address 0-3.
 * @param brightness Percent, 0-100.
 * @return First SPI/GPIO/PWM error or ESP_OK.
 */
static esp_err_t refresh_row(const clock_frame_t *frame, unsigned row, unsigned brightness)
{
    uint8_t bytes[16];
    if (!clock_scan_encode(frame, row, DATA_INVERTED, bytes)) return ESP_ERR_INVALID_ARG;
    spi_transaction_t transaction = {.length = sizeof(bytes) * 8, .tx_buffer = bytes};
    ESP_RETURN_ON_ERROR(spi_device_polling_transmit(spi, &transaction), TAG, "panel SPI failed");
    ESP_RETURN_ON_ERROR(ledc_stop(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, 0), TAG, "panel blank failed");
    ESP_RETURN_ON_ERROR(gpio_set_level(CONFIG_CLOCK_PIN_LATCH, 1), TAG, "panel latch failed");
    ESP_RETURN_ON_ERROR(gpio_set_level(CONFIG_CLOCK_PIN_LATCH, 0), TAG, "panel latch failed");
    ESP_RETURN_ON_ERROR(gpio_set_level(CONFIG_CLOCK_PIN_A, row & 1), TAG, "panel row failed");
    ESP_RETURN_ON_ERROR(gpio_set_level(CONFIG_CLOCK_PIN_B, (row >> 1) & 1), TAG, "panel row failed");
    ESP_RETURN_ON_ERROR(ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, brightness * 255 / 100),
                        TAG, "panel brightness failed");
    return ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
}

/** Core-0 worker composing frames independently of the time-critical scanner.
 * @param arg Unused. Runs until display readiness is cleared.
 */
static void render_task(void *arg)
{
    (void)arg;
    while (clock_display_is_ready()) {
        clock_frame_t frame;
        clock_config_t config;
        clock_store_get(&config);
        clock_timers_snapshot_t timers = clock_timers_snapshot();
        bool stopwatch = timers.stopwatch_state == TIMER_RUNNING;
        bool reminder = timers.reminder_state == TIMER_RUNNING || timers.reminder_state == TIMER_RINGING;
        /* Running timers take priority over connection screens and clock time. */
        if (stopwatch) {
            uint64_t centis = timers.stopwatch_us / 10000;
            clock_render_timer(&frame, false, centis / 6000, centis / 100 % 60,
                               centis % 100, config.font);
        } else if (reminder) {
            uint64_t seconds = (timers.reminder_us + 999999) / 1000000;
            clock_render_timer(&frame, true, seconds / 3600, seconds / 60 % 60,
                               seconds % 60, config.font);
        } else {
            clock_network_display_t network = clock_network_display_status();
            clock_connection_phase_t phase = clock_connection_phase(network.connected,
                                                                     network.connected_at_us,
                                                                     esp_timer_get_time());
            if (phase != CLOCK_CONNECTION_DONE) {
                clock_render_connection(&frame, phase, network.rssi_valid, network.rssi,
                                        network.ip_last_octet);
            } else {
                clock_time_snapshot_t time_state = clock_time_snapshot();
                struct tm local = {0};
                bool local_valid = time_state.valid &&
                    clock_timezone_local(config.timezone_primary, time_state.unix_time, &local);
                if (config.timezone_secondary_enabled) {
                    struct tm secondary = {0};
                    bool both_valid = local_valid &&
                        clock_timezone_local(config.timezone_secondary, time_state.unix_time, &secondary);
                    clock_render_dual(&frame, both_valid, local.tm_hour, local.tm_min,
                                      secondary.tm_hour, secondary.tm_min,
                                      config.colon_blink, local.tm_sec);
                } else {
                    int separator_x = clock_render(&frame, local_valid, local.tm_hour, local.tm_min,
                                                   config.format_12h, config.font);
                    if (local_valid) {
                        clock_render_seconds(&frame, local.tm_sec, time_state.unix_time_ms % 1000,
                                             config.colon_blink, config.seconds_animation,
                                             config.font, separator_x);
                    }
                }
            }
        }
        portENTER_CRITICAL(&frame_lock);
        rendered_frame = frame;
        rendered_brightness = config.brightness;
        portEXIT_CRITICAL(&frame_lock);
        vTaskDelay(pdMS_TO_TICKS(stopwatch ? 10 : 100));
    }
    vTaskDelete(NULL);
}

static bool IRAM_ATTR scan_timer_alarm(gptimer_handle_t timer,
                                       const gptimer_alarm_event_data_t *event, void *arg)
{
    (void)timer;
    (void)event;
    BaseType_t awakened = pdFALSE;
    vTaskNotifyGiveFromISR((TaskHandle_t)arg, &awakened);
    return awakened == pdTRUE;
}

static esp_err_t scan_timer_start(gptimer_handle_t *timer)
{
    const gptimer_config_t config = {
        .clk_src = GPTIMER_CLK_SRC_DEFAULT,
        .direction = GPTIMER_COUNT_UP,
        .resolution_hz = 1000000,
    };
    const gptimer_event_callbacks_t callbacks = {.on_alarm = scan_timer_alarm};
    const gptimer_alarm_config_t alarm = {
        .alarm_count = 1000,
        .reload_count = 0,
        .flags.auto_reload_on_alarm = true,
    };
    esp_err_t err = gptimer_new_timer(&config, timer);
    if (err != ESP_OK) return err;
    bool enabled = false;
    err = gptimer_register_event_callbacks(*timer, &callbacks, xTaskGetCurrentTaskHandle());
    if (err == ESP_OK) err = gptimer_set_alarm_action(*timer, &alarm);
    if (err == ESP_OK) {
        err = gptimer_enable(*timer);
        enabled = err == ESP_OK;
    }
    if (err == ESP_OK) err = gptimer_start(*timer);
    if (err != ESP_OK) {
        if (enabled) {
            esp_err_t cleanup = gptimer_disable(*timer);
            if (cleanup != ESP_OK) {
                ESP_LOGE(TAG, "Panel timer disable failed: %s", esp_err_to_name(cleanup));
                xEventGroupSetBits(display_events, DISPLAY_INIT_FAILED);
                /* The ISR may still reference this task. */
                vTaskSuspend(NULL);
                return err;
            }
        }
        esp_err_t cleanup = gptimer_del_timer(*timer);
        if (cleanup != ESP_OK) ESP_LOGE(TAG, "Panel timer cleanup failed: %s", esp_err_to_name(cleanup));
        *timer = NULL;
    }
    return err;
}

/** Core-1 panel scan worker.
 * @param arg Unused. Acknowledges pauses and stops on a hardware error.
 */
static void display_task(void *arg)
{
    (void)arg;
    clock_frame_t frame = {0};
    unsigned row = 0;
    unsigned brightness = 0;
    gptimer_handle_t timer = NULL;
    esp_err_t err = scan_timer_start(&timer);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Panel timer setup failed: %s", esp_err_to_name(err));
        xEventGroupSetBits(display_events, DISPLAY_INIT_FAILED);
        vTaskDelete(NULL);
        return;
    }
    set_ready(true);
    xEventGroupSetBits(display_events, DISPLAY_INITIALIZED);
    for (;;) {
        if (!clock_display_is_ready()) break;
        if (is_paused()) {
            esp_err_t err = ledc_stop(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, 0);
            if (err != ESP_OK) {
                ESP_LOGE(TAG, "Panel pause failed: %s", esp_err_to_name(err));
                set_ready(false);
                break;
            }
            xEventGroupClearBits(display_events, DISPLAY_RUNNING);
            xEventGroupSetBits(display_events, DISPLAY_PAUSED);
            vTaskDelay(pdMS_TO_TICKS(10));
            continue;
        }
        if (ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(1000)) == 0) {
            ESP_LOGE(TAG, "Panel timer stopped signaling");
            set_ready(false);
            break;
        }
        if (is_paused()) continue;
        xEventGroupClearBits(display_events, DISPLAY_PAUSED);
        xEventGroupSetBits(display_events, DISPLAY_RUNNING);
        /* Switch frames only on a full-scan boundary. */
        if (row == 0) {
            portENTER_CRITICAL(&frame_lock);
            frame = rendered_frame;
            brightness = rendered_brightness;
            portEXIT_CRITICAL(&frame_lock);
        }
        err = refresh_row(&frame, row, brightness);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Display refresh stopped: %s", esp_err_to_name(err));
            set_ready(false);
            break;
        }
        row = (row + 1) % 4;
    }
    err = ledc_stop(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, 0);
    if (err != ESP_OK) ESP_LOGE(TAG, "Panel blank failed: %s", esp_err_to_name(err));
    err = gptimer_stop(timer);
    if (err != ESP_OK) ESP_LOGE(TAG, "Panel timer stop failed: %s", esp_err_to_name(err));
    err = gptimer_disable(timer);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Panel timer disable failed: %s", esp_err_to_name(err));
        /* The ISR may still reference this task. */
        vTaskSuspend(NULL);
        return;
    }
    err = gptimer_del_timer(timer);
    if (err != ESP_OK) ESP_LOGE(TAG, "Panel timer cleanup failed: %s", esp_err_to_name(err));
    vTaskDelete(NULL);
}

esp_err_t clock_display_start(void)
{
    if (!pins_valid()) {
        ESP_LOGE(TAG, "Panel GPIOs are missing, unsafe, duplicated or conflict with the buzzer");
        return ESP_ERR_INVALID_ARG;
    }
    display_events = xEventGroupCreate();
    if (!display_events) return ESP_ERR_NO_MEM;
    unsigned latch = CONFIG_CLOCK_PIN_LATCH;
    unsigned row_a = CONFIG_CLOCK_PIN_A;
    unsigned row_b = CONFIG_CLOCK_PIN_B;
    gpio_config_t outputs = {
        .pin_bit_mask = (1ULL << latch) | (1ULL << row_a) | (1ULL << row_b),
        .mode = GPIO_MODE_OUTPUT,
    };
    ESP_RETURN_ON_ERROR(gpio_config(&outputs), TAG, "panel GPIO setup failed");
    ledc_timer_config_t timer = {
        .speed_mode = LEDC_LOW_SPEED_MODE, .duty_resolution = LEDC_TIMER_8_BIT,
        .timer_num = LEDC_TIMER_0, .freq_hz = 20000, .clk_cfg = LEDC_AUTO_CLK,
    };
    ESP_RETURN_ON_ERROR(ledc_timer_config(&timer), TAG, "panel PWM timer setup failed");
    ledc_channel_config_t channel = {
        .gpio_num = CONFIG_CLOCK_PIN_OE, .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = LEDC_CHANNEL_0, .timer_sel = LEDC_TIMER_0, .duty = 0,
        .flags.output_invert = OE_INVERTED,
    };
    ESP_RETURN_ON_ERROR(ledc_channel_config(&channel), TAG, "panel PWM setup failed");
    spi_bus_config_t bus = {
        .mosi_io_num = CONFIG_CLOCK_PIN_DATA, .miso_io_num = -1,
        .sclk_io_num = CONFIG_CLOCK_PIN_CLOCK, .quadwp_io_num = -1, .quadhd_io_num = -1,
        .max_transfer_sz = 16,
    };
    ESP_RETURN_ON_ERROR(spi_bus_initialize(SPI3_HOST, &bus, SPI_DMA_DISABLED), TAG, "panel SPI setup failed");
    spi_device_interface_config_t device = {.clock_speed_hz = 4000000, .mode = 0,
                                            .spics_io_num = -1, .queue_size = 1};
    ESP_RETURN_ON_ERROR(spi_bus_add_device(SPI3_HOST, &device, &spi), TAG, "panel SPI device failed");
    if (xTaskCreatePinnedToCore(display_task, "clock_display", 4096, NULL, 8, NULL, 1) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }
    EventBits_t bits = xEventGroupWaitBits(display_events, DISPLAY_INITIALIZED | DISPLAY_INIT_FAILED,
                                           pdFALSE, pdFALSE, pdMS_TO_TICKS(1000));
    if (!(bits & DISPLAY_INITIALIZED)) {
        ESP_LOGE(TAG, "Panel scanner initialization failed or timed out");
        set_ready(false);
        return ESP_ERR_INVALID_STATE;
    }
    if (xTaskCreatePinnedToCore(render_task, "clock_render", 4096, NULL, 5, NULL, 0) != pdPASS) {
        set_ready(false);
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}
#else
esp_err_t clock_display_start(void)
{
    ESP_LOGW(TAG, "Panel disabled; configure GPIOs and enable it after checking the wiring");
    return ESP_OK;
}

esp_err_t clock_display_pause(bool pause)
{
    (void)pause;
    return ESP_OK;
}

bool clock_display_is_ready(void)
{
    return false;
}
#endif
