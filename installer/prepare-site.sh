#!/bin/sh
set -eu
if [ "$#" -ne 2 ] || [ ! -s "$1" ] || [ ! -s "$2" ]; then
  echo "Usage: sh installer/prepare-site.sh ESP32_FACTORY_BIN ESP32_S3_FACTORY_BIN" >&2
  exit 1
fi
npm run build --prefix installer
mkdir -p installer/launcher/site/firmware installer/launcher/site/licenses
cp installer/index.html installer/style.css installer/launcher/site/
cp installer/dist/app.js installer/launcher/site/app.js
cp "$1" installer/launcher/site/firmware/momentra-factory.bin
cp "$2" installer/launcher/site/firmware/momentra-s3-factory.bin
cp installer/node_modules/esptool-js/LICENSE installer/launcher/site/licenses/esptool-js.txt
cp installer/node_modules/js-md5/LICENSE.txt installer/launcher/site/licenses/js-md5.txt
cp installer/node_modules/pako/LICENSE installer/launcher/site/licenses/pako.txt
cp installer/node_modules/atob-lite/LICENSE.md installer/launcher/site/licenses/atob-lite.txt
