cmake_minimum_required(VERSION 3.16)

set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
             "${CMAKE_CURRENT_LIST_DIR}/main/clock_version.h")
file(STRINGS "${CMAKE_CURRENT_LIST_DIR}/main/clock_version.h" version_line
     REGEX "^#define CLOCK_FIRMWARE_VERSION \"[0-9]+\\.[0-9]+\\.[0-9]+\"$")
if(NOT version_line)
    message(FATAL_ERROR "Invalid or missing CLOCK_FIRMWARE_VERSION")
endif()
string(REGEX REPLACE "^#define CLOCK_FIRMWARE_VERSION \"([^\"]+)\"$" "\\1" PROJECT_VER "${version_line}")

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(ESP_P10_Clock_BLR)
