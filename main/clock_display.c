#include "clock_display.h"

#include <string.h>
#include <time.h>

#include "clock_render.h"
#include "clock_scan.h"
#include "clock_store.h"
#include "clock_time.h"
#include "clock_timers.h"
#include "driver/gpio.h"
#include "driver/ledc.h"
#include "driver/spi_master.h"
#include "esp_check.h"
#include "esp_log.h"
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
static spi_device_handle_t spi;
static EventGroupHandle_t display_events;
static portMUX_TYPE pause_lock = portMUX_INITIALIZER_UNLOCKED;
static portMUX_TYPE frame_lock = portMUX_INITIALIZER_UNLOCKED;
static clock_frame_t rendered_frame;
static unsigned rendered_brightness;
static bool paused;
static bool ready;
#define DISPLAY_PAUSED BIT0
#define DISPLAY_RUNNING BIT1

static bool pin_safe(int pin)
{
    return GPIO_IS_VALID_OUTPUT_GPIO(pin) && pin != 0 && pin != 1 && pin != 2 &&
           pin != 3 && pin != 5 && !(pin >= 6 && pin <= 12) && pin != 15;
}

static bool pins_valid(void)
{
    int pins[] = {CONFIG_CLOCK_PIN_DATA, CONFIG_CLOCK_PIN_CLOCK, CONFIG_CLOCK_PIN_LATCH,
                  CONFIG_CLOCK_PIN_OE, CONFIG_CLOCK_PIN_A, CONFIG_CLOCK_PIN_B};
    for (unsigned i = 0; i < sizeof(pins) / sizeof(pins[0]); ++i) {
        if (!pin_safe(pins[i]) || pins[i] == CONFIG_CLOCK_PIN_BUZZER) return false;
        for (unsigned j = 0; j < i; ++j) {
            if (pins[i] == pins[j]) return false;
        }
    }
    return true;
}

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
        if (stopwatch) {
            uint64_t centis = timers.stopwatch_us / 10000;
            clock_render_timer(&frame, false, centis / 6000, centis / 100 % 60,
                               centis % 100, config.font);
        } else if (reminder) {
            uint64_t seconds = (timers.reminder_us + 999999) / 1000000;
            clock_render_timer(&frame, true, seconds / 3600, seconds / 60 % 60,
                               seconds % 60, config.font);
        } else {
            clock_time_snapshot_t time_state = clock_time_snapshot();
            struct tm local = {0};
            if (time_state.valid) localtime_r(&time_state.unix_time, &local);
            clock_render(&frame, time_state.valid, local.tm_hour, local.tm_min,
                         config.format_12h, config.font);
        }
        portENTER_CRITICAL(&frame_lock);
        rendered_frame = frame;
        rendered_brightness = config.brightness;
        portEXIT_CRITICAL(&frame_lock);
        vTaskDelay(pdMS_TO_TICKS(stopwatch ? 10 : 100));
    }
    vTaskDelete(NULL);
}

static void display_task(void *arg)
{
    (void)arg;
    clock_frame_t frame = {0};
    unsigned row = 0;
    unsigned brightness = 0;
    for (;;) {
        if (is_paused()) {
            esp_err_t err = ledc_stop(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, 0);
            if (err != ESP_OK) {
                ESP_LOGE(TAG, "Panel pause failed: %s", esp_err_to_name(err));
                set_ready(false);
                vTaskDelete(NULL);
                return;
            }
            xEventGroupClearBits(display_events, DISPLAY_RUNNING);
            xEventGroupSetBits(display_events, DISPLAY_PAUSED);
            vTaskDelay(pdMS_TO_TICKS(10));
            continue;
        }
        xEventGroupClearBits(display_events, DISPLAY_PAUSED);
        xEventGroupSetBits(display_events, DISPLAY_RUNNING);
        if (row == 0) {
            portENTER_CRITICAL(&frame_lock);
            frame = rendered_frame;
            brightness = rendered_brightness;
            portEXIT_CRITICAL(&frame_lock);
        }
        esp_err_t err = refresh_row(&frame, row, brightness);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Display refresh stopped: %s", esp_err_to_name(err));
            esp_err_t blank_err = ledc_stop(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, 0);
            if (blank_err != ESP_OK) {
                ESP_LOGE(TAG, "Panel blank failed: %s", esp_err_to_name(blank_err));
            }
            set_ready(false);
            vTaskDelete(NULL);
            return;
        }
        row = (row + 1) % 4;
        vTaskDelay(pdMS_TO_TICKS(1));
    }
}

esp_err_t clock_display_start(void)
{
    if (pdMS_TO_TICKS(1) == 0) {
        ESP_LOGE(TAG, "Panel refresh requires a FreeRTOS tick of at least 1000 Hz");
        return ESP_ERR_INVALID_STATE;
    }
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
    set_ready(true);
    if (xTaskCreatePinnedToCore(render_task, "clock_render", 4096, NULL, 5, NULL, 0) != pdPASS) {
        set_ready(false);
        return ESP_ERR_NO_MEM;
    }
    if (xTaskCreatePinnedToCore(display_task, "clock_display", 4096, NULL, 8, NULL, 1) != pdPASS) {
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
