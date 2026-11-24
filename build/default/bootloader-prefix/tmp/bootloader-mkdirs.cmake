# Distributed under the OSI-approved BSD 3-Clause License.  See accompanying
# file Copyright.txt or https://cmake.org/licensing for details.

cmake_minimum_required(VERSION 3.5)

file(MAKE_DIRECTORY
  "/home/sudhir/.espressif/v6.1/esp-idf/components/bootloader/subproject"
  "/home/sudhir/Projects/ESP_P10_Clock_BLR/build/default/bootloader"
  "/home/sudhir/Projects/ESP_P10_Clock_BLR/build/default/bootloader-prefix"
  "/home/sudhir/Projects/ESP_P10_Clock_BLR/build/default/bootloader-prefix/tmp"
  "/home/sudhir/Projects/ESP_P10_Clock_BLR/build/default/bootloader-prefix/src/bootloader-stamp"
  "/home/sudhir/Projects/ESP_P10_Clock_BLR/build/default/bootloader-prefix/src"
  "/home/sudhir/Projects/ESP_P10_Clock_BLR/build/default/bootloader-prefix/src/bootloader-stamp"
)

set(configSubDirs )
foreach(subDir IN LISTS configSubDirs)
    file(MAKE_DIRECTORY "/home/sudhir/Projects/ESP_P10_Clock_BLR/build/default/bootloader-prefix/src/bootloader-stamp/${subDir}")
endforeach()
if(cfgdir)
  file(MAKE_DIRECTORY "/home/sudhir/Projects/ESP_P10_Clock_BLR/build/default/bootloader-prefix/src/bootloader-stamp${cfgdir}") # cfgdir has leading slash
endif()
