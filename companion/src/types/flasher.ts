export type FlasherMode = 'momentra' | 'custom';
export type PresetChipName = 'ESP32' | 'ESP32-S3';

export interface FlashImageInput {
  name: string;
  address: number;
  data: Uint8Array;
}

export interface ChipInfo {
  chip: string;
  flashSizeLabel: string;
  flashBytes: number;
  isSimulated: boolean;
  isStub: boolean;
}

export interface FlashProgressEvent {
  fileIndex: number;
  fileCount: number;
  fileName: string;
  writtenBytes: number;
  totalBytes: number;
  percent: number;
}

export interface FactoryPinoutRow {
  signal: string;
  esp32: string;
  esp32s3: string;
}

export const FLASH_SECTOR_BYTES = 4096;
export const MIN_MOMENTRA_FLASH_BYTES = 4 * 1024 * 1024;

export const SUPPORTED_CUSTOM_CHIPS: readonly string[] = [
  'ESP8266',
  'ESP32',
  'ESP32-S2',
  'ESP32-S3',
  'ESP32-S31',
  'ESP32-C2',
  'ESP32-C3',
  'ESP32-C5',
  'ESP32-C6',
  'ESP32-C61',
  'ESP32-H2',
  'ESP32-H4',
  'ESP32-P4',
];

export const LINUX_DIALOUT_COMMAND = 'sudo usermod -aG dialout "$USER"';

export const FACTORY_PINOUT_ROWS: readonly FactoryPinoutRow[] = [
  { signal: 'P10 DATA', esp32: 'GPIO 23 / IO23 (J3-2)', esp32s3: 'GPIO 4' },
  { signal: 'P10 CLK', esp32: 'GPIO 18 / IO18 (J3-9)', esp32s3: 'GPIO 5' },
  { signal: 'P10 LATCH / STB', esp32: 'GPIO 19 / IO19 (J3-8)', esp32s3: 'GPIO 6' },
  { signal: 'P10 OE', esp32: 'GPIO 21 / IO21 (J3-6)', esp32s3: 'GPIO 7' },
  { signal: 'P10 A', esp32: 'GPIO 22 / IO22 (J3-3)', esp32s3: 'GPIO 15' },
  { signal: 'P10 B', esp32: 'GPIO 25 / IO25 (J2-9)', esp32s3: 'GPIO 16' },
  { signal: 'Buzzer driver input', esp32: 'GPIO 26 / IO26 (J2-10)', esp32s3: 'GPIO 17' },
  { signal: 'Common ground', esp32: 'GND (J3-1, J3-7 or J2-14)', esp32s3: 'GND (J1-22)' },
];

export function parseOffset(value: string): number {
  const text = value.trim();
  if (!/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(text)) {
    throw new Error(`Invalid offset: ${value}`);
  }
  const offset = Number(text);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % FLASH_SECTOR_BYTES !== 0) {
    throw new Error('Offsets must be non-negative and aligned to 4096 bytes.');
  }
  return offset;
}

export function validateImages(images: readonly FlashImageInput[], flashBytes: number): void {
  if (!images.length) {
    throw new Error('Select at least one firmware file.');
  }
  if (!Number.isSafeInteger(flashBytes) || flashBytes <= 0) {
    throw new Error("Unable to determine the device's flash size.");
  }
  const regions = images
    .map(({ name, address, data }) => {
      if (!Number.isSafeInteger(address) || address < 0 || address % FLASH_SECTOR_BYTES !== 0) {
        throw new Error(`Invalid or unaligned offset for ${name}.`);
      }
      if (!data.length) {
        throw new Error(`${name} is empty.`);
      }
      const end = address + Math.ceil(data.length / FLASH_SECTOR_BYTES) * FLASH_SECTOR_BYTES;
      if (!Number.isSafeInteger(end) || end > flashBytes) {
        throw new Error(`${name} exceeds the detected flash size.`);
      }
      return { name, address, end };
    })
    .sort((a, b) => a.address - b.address);

  for (let i = 1; i < regions.length; i += 1) {
    if (regions[i].address < regions[i - 1].end) {
      throw new Error(`${regions[i - 1].name} and ${regions[i].name} overlap in an erase sector.`);
    }
  }
}

export function validatePreset(chip: string, flashBytes: number): string {
  if (flashBytes < MIN_MOMENTRA_FLASH_BYTES) {
    throw new Error('Momentra requires at least 4 MB flash.');
  }
  if (chip === 'ESP32') return 'momentra-factory.bin';
  if (chip === 'ESP32-S3') return 'momentra-s3-factory.bin';
  throw new Error('Momentra supports only ESP32 and ESP32-S3. Use custom mode for other chips.');
}
