import { ESPLoader, Transport } from 'esptool-js';
import md5 from 'js-md5';
import {
  type ChipInfo,
  type FlashImageInput,
  type FlashProgressEvent,
  type PresetChipName,
  validateImages,
} from '../types/flasher';

export interface FlashImagesOptions {
  images: FlashImageInput[];
  eraseAll?: boolean;
  onProgress?: (event: FlashProgressEvent) => void;
  onLog?: (line: string) => void;
}

type WebSerialPort = ConstructorParameters<typeof Transport>[0];
type FlashSizeArg = Parameters<ESPLoader['flashSizeBytes']>[0];

interface SerialNavigator extends Navigator {
  serial?: {
    requestPort: () => Promise<WebSerialPort>;
  };
}

export function isWebSerialAvailable(): boolean {
  if (typeof navigator === 'undefined') return false;
  const serialNav = navigator as SerialNavigator;
  return Boolean(serialNav.serial && typeof serialNav.serial.requestPort === 'function');
}

function createTerminalAdapter(onLog?: (line: string) => void) {
  let pendingLine = '';
  const flushLine = (text: string) => {
    const trimmed = text.trim();
    if (trimmed) onLog?.(trimmed);
  };
  return {
    clean: () => {
      pendingLine = '';
    },
    write: (data: string) => {
      pendingLine += data;
      const parts = pendingLine.split(/\r?\n/);
      pendingLine = parts.pop() ?? '';
      for (const part of parts) {
        flushLine(part);
      }
    },
    writeLine: (data: string) => {
      if (pendingLine) {
        flushLine(pendingLine + data);
        pendingLine = '';
      } else {
        flushLine(data);
      }
    },
  };
}

/**
 * Deep module encapsulating Web Serial ESP32/ESP32-S3 flashing via `esptool-js`
 * alongside a realistic simulated USB flasher for Demo Mode / offline testing.
 */
export class MomentraFlasher {
  private transport: Transport | null = null;
  private loader: ESPLoader | null = null;
  private connectedDevice: ChipInfo | null = null;

  getConnectedDevice(): ChipInfo | null {
    return this.connectedDevice ? { ...this.connectedDevice } : null;
  }

  isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  async connectUsbDevice(onLog?: (line: string) => void): Promise<ChipInfo> {
    if (!isWebSerialAvailable()) {
      throw new Error('Web Serial is unavailable. Open this app in Chrome or Edge on desktop.');
    }
    if (this.connectedDevice) {
      await this.disconnectUsbDevice(false);
    }

    const serialNav = navigator as SerialNavigator;
    onLog?.('Requesting serial port permission...');
    const port = await serialNav.serial!.requestPort();
    const transport = new Transport(port, true);
    const loader = new ESPLoader({
      transport,
      baudrate: 115200,
      terminal: createTerminalAdapter(onLog),
    });

    this.transport = transport;
    this.loader = loader;

    try {
      onLog?.('Connecting to bootloader (hold BOOT + tap EN/RESET if it waits)...');
      await loader.main();
      const chip = loader.chip.CHIP_NAME;
      const flashSizeLabel = await loader.detectFlashSize();
      if (!flashSizeLabel) {
        throw new Error('Could not detect flash size. Check USB cable and connection.');
      }
      const flashBytes = loader.flashSizeBytes(flashSizeLabel as FlashSizeArg);
      if (flashBytes <= 0) {
        throw new Error(`Unsupported detected flash size: ${flashSizeLabel}`);
      }
      const info: ChipInfo = {
        chip,
        flashSizeLabel,
        flashBytes,
        isSimulated: false,
        isStub: Boolean(loader.IS_STUB),
      };
      this.connectedDevice = info;
      onLog?.(`Detected ${chip} · ${flashSizeLabel} (${flashBytes.toLocaleString()} bytes)`);
      return { ...info };
    } catch (err) {
      try {
        await this.disconnectUsbDevice(false);
      } catch {
        // Ignore cleanup failure after connect error
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  async connectSimulatedDevice(
    chip: PresetChipName = 'ESP32',
    onLog?: (line: string) => void,
  ): Promise<ChipInfo> {
    if (this.connectedDevice) {
      await this.disconnectUsbDevice(false);
    }
    onLog?.(`[sim] Opening virtual USB-UART bridge for ${chip}...`);
    await new Promise((resolve) => setTimeout(resolve, 260));
    onLog?.('[sim] Syncing ROM bootloader & uploading flasher stub...');
    await new Promise((resolve) => setTimeout(resolve, 260));
    const info: ChipInfo = {
      chip,
      flashSizeLabel: '4MB',
      flashBytes: 4 * 1024 * 1024,
      isSimulated: true,
      isStub: true,
    };
    this.connectedDevice = info;
    onLog?.(`[sim] Connected: ${chip} · 4MB flash (stub ready)`);
    return { ...info };
  }

  async disconnectUsbDevice(reset = false, onLog?: (line: string) => void): Promise<void> {
    const currentTransport = this.transport;
    const currentLoader = this.loader;
    const wasSimulated = this.connectedDevice?.isSimulated ?? false;

    this.transport = null;
    this.loader = null;
    this.connectedDevice = null;

    if (wasSimulated) {
      onLog?.(reset ? '[sim] Hard-resetting target and closing virtual serial port.' : '[sim] Disconnected.');
      return;
    }

    if (!currentTransport) return;
    try {
      if (reset && currentLoader) {
        onLog?.('Resetting device via RTS...');
        await currentLoader.after();
      }
    } finally {
      await currentTransport.disconnect();
      onLog?.('Serial port closed.');
    }
  }

  async flashUsbImages(options: FlashImagesOptions): Promise<void> {
    const { images, eraseAll = false, onProgress, onLog } = options;
    const device = this.connectedDevice;
    const loader = this.loader;
    if (!device || !loader || device.isSimulated) {
      throw new Error('Connect a physical USB ESP device before flashing over Web Serial.');
    }
    validateImages(images, device.flashBytes);
    if (!loader.IS_STUB) {
      throw new Error('Flashing requires a supported flasher stub; this device did not start one.');
    }

    if (eraseAll) {
      onLog?.('Erasing entire flash chip...');
      await loader.eraseFlash();
    }

    onLog?.(`Writing ${images.length} image${images.length === 1 ? '' : 's'} with MD5 verification...`);
    await loader.writeFlash({
      fileArray: images.map((img) => ({ data: img.data, address: img.address })),
      flashMode: 'keep',
      flashFreq: 'keep',
      flashSize: 'keep',
      eraseAll: false,
      compress: true,
      calculateMD5Hash: (data: Uint8Array) => md5(data),
      reportProgress: (fileIndex: number, written: number, total: number) => {
        const target = images[fileIndex];
        const percent = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
        onProgress?.({
          fileIndex,
          fileCount: images.length,
          fileName: target?.name ?? `image-${fileIndex + 1}`,
          writtenBytes: written,
          totalBytes: total,
          percent,
        });
      },
    });

    onLog?.('Flash verified cleanly. Resetting board...');
    await this.disconnectUsbDevice(true, onLog);
  }

  async flashSimulatedImages(options: FlashImagesOptions): Promise<void> {
    const { images, eraseAll = false, onProgress, onLog } = options;
    const device = this.connectedDevice;
    if (!device || !device.isSimulated) {
      throw new Error('Connect a simulated USB device first.');
    }
    validateImages(images, device.flashBytes);

    if (eraseAll) {
      onLog?.('[sim] Erasing entire 4MB SPI flash...');
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    for (let idx = 0; idx < images.length; idx += 1) {
      const img = images[idx];
      const digest = md5(img.data);
      onLog?.(
        `[sim] Flashing ${img.name} @ 0x${img.address.toString(16)} (${img.data.length.toLocaleString()} B)...`,
      );
      for (const fraction of [0.25, 0.55, 0.85, 1]) {
        await new Promise((resolve) => setTimeout(resolve, 140));
        const writtenBytes = Math.round(img.data.length * fraction);
        onProgress?.({
          fileIndex: idx,
          fileCount: images.length,
          fileName: img.name,
          writtenBytes,
          totalBytes: img.data.length,
          percent: Math.round(fraction * 100),
        });
      }
      onLog?.(`[sim] Verified MD5 ${digest} for ${img.name}`);
    }

    await this.disconnectUsbDevice(true, onLog);
  }

  async flashImages(options: FlashImagesOptions): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error('No USB or simulated ESP device connected.');
    }
    if (this.connectedDevice.isSimulated) {
      await this.flashSimulatedImages(options);
    } else {
      await this.flashUsbImages(options);
    }
  }
}

export const momentraFlasher = new MomentraFlasher();
