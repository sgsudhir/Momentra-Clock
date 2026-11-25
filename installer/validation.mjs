export function parseOffset(value) {
  const text = value.trim();
  if (!/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(text)) {
    throw new Error(`Invalid offset: ${value}`);
  }
  const offset = Number(text);
  if (!Number.isSafeInteger(offset) || offset % 4096 !== 0) {
    throw new Error("Offsets must be non-negative and aligned to 4096 bytes.");
  }
  return offset;
}

export function validateImages(images, flashBytes) {
  if (!images.length) throw new Error("Select at least one firmware file.");
  if (!Number.isSafeInteger(flashBytes) || flashBytes <= 0) {
    throw new Error("Unable to determine the device's flash size.");
  }
  const regions = images.map(({name, address, data}) => {
    if (!Number.isSafeInteger(address) || address < 0 || address % 4096 !== 0) {
      throw new Error(`Invalid or unaligned offset for ${name}.`);
    }
    if (!data.length) throw new Error(`${name} is empty.`);
    const end = address + Math.ceil(data.length / 4096) * 4096;
    if (!Number.isSafeInteger(end) || end > flashBytes) {
      throw new Error(`${name} exceeds the detected flash size.`);
    }
    return {name, address, end};
  }).sort((a, b) => a.address - b.address);
  for (let i = 1; i < regions.length; i++) {
    if (regions[i].address < regions[i - 1].end) {
      throw new Error(`${regions[i - 1].name} and ${regions[i].name} overlap in an erase sector.`);
    }
  }
}

export function validatePreset(chip, flashBytes) {
  if (flashBytes < 4 * 1024 * 1024) throw new Error("Momentra requires at least 4 MB flash.");
  if (chip === "ESP32") return "momentra-factory.bin";
  if (chip === "ESP32-S3") return "momentra-s3-factory.bin";
  throw new Error("Momentra supports only ESP32 and ESP32-S3. Use custom mode for other chips.");
}
