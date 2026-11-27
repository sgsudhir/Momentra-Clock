idf_component_register(SRCS "main.c" "clock_config.c" "clock_store.c" "clock_schedule.c"
                            "clock_freshness.c" "clock_time.c" "clock_timezone.c" "clock_magic_time.c"
                            "clock_alarm.c" "clock_network.c"
                            "clock_web.c" "clock_form.c" "clock_status.c" "clock_display.c" "clock_render.c"
                            "clock_scan.c" "clock_timer_logic.c" "clock_timers.c" "clock_sound.c"
                       INCLUDE_DIRS "."
                       REQUIRES nvs_flash esp_netif lwip esp_timer esp_driver_gpio esp_wifi
                                esp_http_server app_update esp_driver_spi esp_driver_ledc esp_driver_gptimer mdns
                       EMBED_FILES "web/index.html.gz")
