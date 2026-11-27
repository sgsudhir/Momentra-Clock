import React, { useState } from 'react';
import { IonAlert, IonButton, IonIcon, IonProgressBar } from '@ionic/react';
import {
  addOutline,
  checkmarkCircleOutline,
  copyOutline,
  flashOutline,
  hardwareChipOutline,
  linkOutline,
  terminalOutline,
  trashOutline,
  unlinkOutline,
  warningOutline,
} from 'ionicons/icons';
import { isWebSerialAvailable, momentraFlasher } from '../api/flasher';
import { RingingBanner } from '../components/RingingBanner';
import { useClock } from '../state/ClockContext';
import {
  type ChipInfo,
  FACTORY_PINOUT_ROWS,
  type FlashImageInput,
  type FlashProgressEvent,
  type FlasherMode,
  LINUX_DIALOUT_COMMAND,
  type PresetChipName,
  SUPPORTED_CUSTOM_CHIPS,
  parseOffset,
  validateImages,
  validatePreset,
} from '../types/flasher';

interface CustomFileRow {
  id: number;
  file: File | null;
  offset: string;
}

export const FlasherPage: React.FC = () => {
  const { demoMode, showToast } = useClock();

  const [chipInfo, setChipInfo] = useState<ChipInfo | null>(() =>
    momentraFlasher.getConnectedDevice(),
  );
  const [flasherBusy, setFlasherBusy] = useState(false);
  const [mode, setMode] = useState<FlasherMode>('momentra');
  const [presetFile, setPresetFile] = useState<File | null>(null);
  const [customRows, setCustomRows] = useState<CustomFileRow[]>([
    { id: 1, file: null, offset: '0x10000' },
  ]);
  const [nextRowId, setNextRowId] = useState(2);
  const [eraseAll, setEraseAll] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const [progress, setProgress] = useState<FlashProgressEvent | null>(null);
  const [logs, setLogs] = useState<string[]>(() =>
    isWebSerialAvailable()
      ? ['Ready. Connect an ESP32 / ESP32-S3 board over USB or use a simulated target.']
      : [
          'Web Serial is unavailable in this browser. Open in desktop Chrome/Edge for physical USB flashing, or test with the Simulated ESP32 targets.',
        ],
  );
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingImages, setPendingImages] = useState<FlashImageInput[] | null>(null);
  const [confirmMessage, setConfirmMessage] = useState('');

  const serialSupported = isWebSerialAvailable();

  const appendLog = (line: string) => {
    setLogs((prev) => [...prev.slice(-80), line]);
  };

  const handleConnectUsb = async () => {
    setFlasherBusy(true);
    setProgress(null);
    try {
      const info = await momentraFlasher.connectUsbDevice(appendLog);
      setChipInfo(info);
      showToast(`Connected ${info.chip} (${info.flashSizeLabel} flash).`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'USB connection failed.';
      appendLog(`Error: ${msg}`);
      showToast(msg, 'danger');
    } finally {
      setFlasherBusy(false);
    }
  };

  const handleConnectSim = async (chip: PresetChipName) => {
    setFlasherBusy(true);
    setProgress(null);
    try {
      const info = await momentraFlasher.connectSimulatedDevice(chip, appendLog);
      setChipInfo(info);
      showToast(`Connected simulated ${info.chip} (${info.flashSizeLabel}).`, 'primary');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Simulated connect failed.';
      appendLog(`Error: ${msg}`);
      showToast(msg, 'danger');
    } finally {
      setFlasherBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setFlasherBusy(true);
    try {
      await momentraFlasher.disconnectUsbDevice(true, appendLog);
      setChipInfo(null);
      setProgress(null);
      showToast('Board disconnected and reset.', 'primary');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Disconnect failed.';
      appendLog(`Disconnect error: ${msg}`);
      showToast(msg, 'danger');
    } finally {
      setFlasherBusy(false);
    }
  };

  const handleAddRow = () => {
    setCustomRows((prev) => [...prev, { id: nextRowId, file: null, offset: '0x10000' }]);
    setNextRowId((id) => id + 1);
  };

  const handleRemoveRow = (id: number) => {
    setCustomRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const handlePrepareFlash = async () => {
    if (!chipInfo) {
      showToast('Connect an ESP board before flashing.', 'danger');
      return;
    }

    try {
      let images: FlashImageInput[];
      if (mode === 'momentra') {
        const expectedName = validatePreset(chipInfo.chip, chipInfo.flashBytes);
        if (presetFile) {
          images = [
            {
              name: presetFile.name,
              address: 0,
              data: new Uint8Array(await presetFile.arrayBuffer()),
            },
          ];
        } else {
          let fetched: Uint8Array | null = null;
          try {
            const resp = await fetch(`/firmware/${expectedName}`);
            const contentType = resp.headers.get('content-type') || '';
            if (resp.ok && !contentType.includes('text/html')) {
              fetched = new Uint8Array(await resp.arrayBuffer());
            }
          } catch {
            // Fall through to simulated fallback or error
          }

          if (fetched && fetched.length > 0) {
            images = [{ name: expectedName, address: 0, data: fetched }];
          } else if (chipInfo.isSimulated) {
            const simBytes = new Uint8Array(4096);
            simBytes[0] = 0xe9;
            appendLog(`[sim] Using simulated ${expectedName} image (4,096 bytes).`);
            images = [{ name: expectedName, address: 0, data: simBytes }];
          } else {
            throw new Error(
              `Bundled ${expectedName} is not hosted on this web server. Select the local ${expectedName} file below.`,
            );
          }
        }
      } else {
        images = await Promise.all(
          customRows.map(async (row) => {
            if (!row.file) {
              throw new Error('Select a .bin firmware file for every custom row.');
            }
            const address = parseOffset(row.offset);
            return {
              name: row.file.name,
              address,
              data: new Uint8Array(await row.file.arrayBuffer()),
            };
          }),
        );
      }

      validateImages(images, chipInfo.flashBytes);

      const summary = images
        .map((img) => `${img.name} @ 0x${img.address.toString(16)} (${img.data.length.toLocaleString()} B)`)
        .join(' | ');
      const modeNote =
        mode === 'momentra'
          ? `Momentra factory image overwrites saved Wi-Fi credentials and settings.${
              chipInfo.chip === 'ESP32-S3'
                ? ' S3 outputs: DATA 4, CLK 5, LATCH 6, OE 7, A 15, B 16, buzzer 17.'
                : ''
            }`
          : 'Selected flash sectors will be erased and overwritten.';
      const eraseNote = eraseAll ? ' ALL FLASH WILL BE ERASED.' : '';

      setPendingImages(images);
      setConfirmMessage(`${chipInfo.chip} (${chipInfo.flashSizeLabel}): ${summary}. ${modeNote}${eraseNote}`);
      setConfirmDialogOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Firmware validation failed.';
      appendLog(`Validation error: ${msg}`);
      showToast(msg, 'danger');
    }
  };

  const executeFlash = async (images: FlashImageInput[]) => {
    setFlasherBusy(true);
    setProgress({
      fileIndex: 0,
      fileCount: images.length,
      fileName: images[0]?.name ?? 'firmware',
      writtenBytes: 0,
      totalBytes: images[0]?.data.length ?? 0,
      percent: 0,
    });
    try {
      await momentraFlasher.flashImages({
        images,
        eraseAll,
        onProgress: (ev) => setProgress(ev),
        onLog: appendLog,
      });
      setChipInfo(null);
      setConfirmed(false);
      setPresetFile(null);
      const doneMsg =
        mode === 'momentra'
          ? 'Flash verified and device reset. Join "Momentra Clock" Wi-Fi and open http://192.168.4.1/.'
          : 'Flash verified and device reset.';
      appendLog(doneMsg);
      showToast(doneMsg, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Flashing failed.';
      appendLog(`Flash error: ${msg}`);
      showToast(msg, 'danger');
    } finally {
      setFlasherBusy(false);
      setPendingImages(null);
    }
  };

  const handleCopyCommand = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable.');
      await navigator.clipboard.writeText(LINUX_DIALOUT_COMMAND);
      setCopyFeedback('Copied. Paste into your Ubuntu terminal.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Copy failed.';
      setCopyFeedback(`Copy failed: ${msg}`);
    }
  };

  let expectedPresetLabel: string | null = null;
  if (chipInfo && mode === 'momentra') {
    try {
      expectedPresetLabel = validatePreset(chipInfo.chip, chipInfo.flashBytes);
    } catch {
      expectedPresetLabel = null;
    }
  }

  return (
    <div className="page-shell">
      <RingingBanner />

      {/* USB Connection Panel */}
      <section className="glass-panel" aria-label="USB board connection">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <IonIcon icon={hardwareChipOutline} aria-hidden="true" />
              USB Serial Board Connection
            </h2>
            <p className="panel-subtitle">
              Connect an ESP32 or ESP32-S3 via USB data cable (Chrome or Edge desktop), or test the
              workflow with a simulated target.
            </p>
          </div>
          <span
            className={`m-pill-surface ${chipInfo ? 'accent' : ''}`}
            data-testid="flasher-device-badge"
          >
            {chipInfo
              ? `${chipInfo.chip} · ${chipInfo.flashSizeLabel}${chipInfo.isSimulated ? ' (Sim)' : ''}`
              : 'No board connected'}
          </span>
        </div>

        {!serialSupported && (
          <div className="hint-box warn" style={{ marginBottom: 14 }} data-testid="serial-unavailable-note">
            <IonIcon icon={warningOutline} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Web Serial is unavailable in this browser context. Open this app in desktop Chrome or
            Edge for physical USB flashing, or use the Simulated targets below.
          </div>
        )}

        <div className="btn-row">
          <IonButton
            disabled={flasherBusy || chipInfo !== null || !serialSupported}
            onClick={() => void handleConnectUsb()}
            data-testid="flasher-connect-usb-btn"
          >
            <IonIcon slot="start" icon={linkOutline} />
            Connect USB Board
          </IonButton>

          <IonButton
            fill="outline"
            disabled={flasherBusy || chipInfo !== null}
            onClick={() => void handleConnectSim('ESP32')}
            data-testid="flasher-connect-sim-esp32-btn"
          >
            <IonIcon slot="start" icon={flashOutline} />
            {demoMode ? 'Simulate ESP32' : 'Sim ESP32'}
          </IonButton>

          <IonButton
            fill="outline"
            disabled={flasherBusy || chipInfo !== null}
            onClick={() => void handleConnectSim('ESP32-S3')}
            data-testid="flasher-connect-sim-s3-btn"
          >
            <IonIcon slot="start" icon={flashOutline} />
            {demoMode ? 'Simulate ESP32-S3' : 'Sim ESP32-S3'}
          </IonButton>

          <IonButton
            color="secondary"
            disabled={flasherBusy || chipInfo === null}
            onClick={() => void handleDisconnect()}
            data-testid="flasher-disconnect-btn"
          >
            <IonIcon slot="start" icon={unlinkOutline} />
            Disconnect &amp; Reset
          </IonButton>
        </div>
      </section>

      {/* Firmware & Flashing Panel */}
      <section className="glass-panel" aria-label="Firmware selection and flashing">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <IonIcon icon={flashOutline} aria-hidden="true" />
              Firmware Image &amp; Flasher
            </h2>
            <p className="panel-subtitle">
              Supports Momentra factory images (ESP32 / ESP32-S3) and custom multi-offset binaries
              for {SUPPORTED_CUSTOM_CHIPS.slice(0, 6).join(', ')} and more.
            </p>
          </div>
        </div>

        <div className="form-grid" style={{ marginBottom: 14 }}>
          <label className="field-block form-full">
            <span className="field-label">Firmware mode</span>
            <select
              className="m-select"
              disabled={flasherBusy}
              value={mode}
              onChange={(e) => setMode(e.target.value as FlasherMode)}
              data-testid="flasher-mode-select"
            >
              <option value="momentra">Momentra Clock — ESP32 / ESP32-S3 (Preset)</option>
              <option value="custom">Custom ESP Firmware (Multi-offset .bin)</option>
            </select>
          </label>
        </div>

        {mode === 'momentra' ? (
          <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
            <div className="hint-box warn" data-testid="flasher-preset-warning">
              <strong>Factory installation overwrites data.</strong> Wi-Fi credentials, alarms, and
              settings are overwritten even without whole-chip erase.{' '}
              {expectedPresetLabel && (
                <span>
                  Target preset image: <strong>{expectedPresetLabel}</strong> (at offset 0x0).
                </span>
              )}
            </div>

            <label className="field-block">
              <span className="field-label">
                Local factory image override (.bin, optional for simulated targets)
              </span>
              <input
                className="m-input"
                type="file"
                accept=".bin,application/octet-stream"
                disabled={flasherBusy}
                onChange={(e) => setPresetFile(e.target.files?.[0] ?? null)}
                data-testid="flasher-preset-file-input"
              />
            </label>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10, marginBottom: 14 }} data-testid="flasher-custom-panel">
            <p className="panel-subtitle" style={{ margin: 0 }}>
              Choose binary files and 4096-byte aligned flash offsets (e.g. 0x0, 0x8000, 0x10000).
            </p>
            {customRows.map((row, idx) => (
              <div key={row.id} className="flash-file-row">
                <input
                  className="m-input"
                  type="file"
                  accept=".bin,application/octet-stream"
                  aria-label={`Firmware binary ${idx + 1}`}
                  disabled={flasherBusy}
                  onChange={(e) => {
                    const nextFile = e.target.files?.[0] ?? null;
                    setCustomRows((prev) =>
                      prev.map((r) => (r.id === row.id ? { ...r, file: nextFile } : r)),
                    );
                  }}
                  data-testid={`flasher-custom-file-${idx}`}
                />
                <input
                  className="m-input"
                  type="text"
                  placeholder="Offset, e.g. 0x10000"
                  aria-label={`Flash offset ${idx + 1}`}
                  disabled={flasherBusy}
                  value={row.offset}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomRows((prev) =>
                      prev.map((r) => (r.id === row.id ? { ...r, offset: val } : r)),
                    );
                  }}
                  data-testid={`flasher-custom-offset-${idx}`}
                />
                <IonButton
                  size="small"
                  fill="outline"
                  color="danger"
                  disabled={flasherBusy || customRows.length <= 1}
                  onClick={() => handleRemoveRow(row.id)}
                >
                  <IonIcon slot="start" icon={trashOutline} />
                  Remove
                </IonButton>
              </div>
            ))}

            <div>
              <IonButton
                size="small"
                fill="outline"
                disabled={flasherBusy}
                onClick={handleAddRow}
                data-testid="flasher-add-row-btn"
              >
                <IonIcon slot="start" icon={addOutline} />
                Add another file
              </IonButton>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              fontSize: 13.5,
              color: 'var(--m-ink)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={eraseAll}
              disabled={flasherBusy}
              onChange={(e) => setEraseAll(e.target.checked)}
              data-testid="flasher-erase-checkbox"
            />
            <span>
              Erase the <strong>entire flash</strong> before writing (destroys all device data)
            </span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              fontSize: 13.5,
              color: 'var(--m-ink)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={confirmed}
              disabled={flasherBusy}
              onChange={(e) => setConfirmed(e.target.checked)}
              data-testid="flasher-confirm-checkbox"
            />
            <span>
              I understand the data-loss warning and have selected the correct device and firmware.
            </span>
          </label>
        </div>

        {progress && (
          <div style={{ marginBottom: 14 }} data-testid="flasher-progress-wrap">
            <div className="field-label" style={{ marginBottom: 6 }}>
              <span>
                Writing {progress.fileName} ({progress.fileIndex + 1}/{progress.fileCount})
              </span>
              <output data-testid="flasher-progress-pct">{progress.percent}%</output>
            </div>
            <IonProgressBar value={progress.percent / 100} />
          </div>
        )}

        <div className="btn-row" style={{ marginBottom: 14 }}>
          <IonButton
            disabled={flasherBusy || chipInfo === null || !confirmed}
            onClick={() => void handlePrepareFlash()}
            data-testid="flasher-flash-btn"
          >
            <IonIcon slot="start" icon={checkmarkCircleOutline} />
            Review &amp; Flash
          </IonButton>
        </div>

        <div className="field-block">
          <span className="field-label">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <IonIcon icon={terminalOutline} aria-hidden="true" />
              Serial &amp; Flasher Log
            </span>
          </span>
          <div className="flash-log-box" role="log" aria-live="polite" data-testid="flasher-log-box">
            {logs.join('\n')}
          </div>
        </div>
      </section>

      {/* Guides & Pinouts */}
      <div className="two-col-grid" style={{ alignItems: 'start' }}>
        <section className="glass-panel" aria-label="USB recovery guides">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">USB Recovery &amp; Permissions</h2>
              <p className="panel-subtitle">
                Manual download mode and Linux serial port setup.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <details className="glass-accordion">
              <summary>BOOT / RESET sequence</summary>
              <div className="accordion-body">
                <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  <li>Press and hold <strong>BOOT</strong>.</li>
                  <li>While holding BOOT, press and release <strong>EN / RESET</strong>.</li>
                  <li>Release <strong>BOOT</strong>, then click <strong>Connect USB Board</strong>.</li>
                  <li>After flashing completes, press <strong>EN / RESET</strong> once.</li>
                </ol>
              </div>
            </details>

            <details className="glass-accordion">
              <summary>Ubuntu serial port permissions</summary>
              <div className="accordion-body">
                <p style={{ marginTop: 4 }}>
                  Add your user to the <code>dialout</code> group, then sign out and back in:
                </p>
                <div className="code-copy-row">
                  <code>{LINUX_DIALOUT_COMMAND}</code>
                  <IonButton
                    size="small"
                    fill="outline"
                    onClick={() => void handleCopyCommand()}
                    data-testid="flasher-copy-cmd-btn"
                  >
                    <IonIcon slot="start" icon={copyOutline} />
                    Copy
                  </IonButton>
                </div>
                {copyFeedback && (
                  <p style={{ marginTop: 6, color: 'var(--m-accent)' }}>{copyFeedback}</p>
                )}
              </div>
            </details>
          </div>
        </section>

        <section className="glass-panel" aria-label="Factory GPIO pinouts">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Factory Firmware Pinouts</h2>
              <p className="panel-subtitle">
                Chip GPIO numbers for P10 HUB12 panel and active buzzer driver.
              </p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="m-table" data-testid="flasher-pinout-table">
              <thead>
                <tr>
                  <th scope="col">Signal</th>
                  <th scope="col">ESP32 DevKitC V4</th>
                  <th scope="col">ESP32-S3 DevKitC-1</th>
                </tr>
              </thead>
              <tbody>
                {FACTORY_PINOUT_ROWS.map((row) => (
                  <tr key={row.signal}>
                    <th scope="row">{row.signal}</th>
                    <td>{row.esp32}</td>
                    <td>{row.esp32s3}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <IonAlert
        isOpen={confirmDialogOpen}
        onDidDismiss={() => setConfirmDialogOpen(false)}
        header="Confirm Firmware Flash"
        message={confirmMessage}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Flash Now',
            role: 'destructive',
            handler: () => {
              if (pendingImages) {
                void executeFlash(pendingImages);
              }
            },
          },
        ]}
      />
    </div>
  );
};
