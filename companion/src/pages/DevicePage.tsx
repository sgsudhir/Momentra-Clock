import React, { useState } from 'react';
import { IonAlert, IonButton, IonIcon, IonProgressBar, IonToggle } from '@ionic/react';
import {
  addCircleOutline,
  cloudUploadOutline,
  hardwareChipOutline,
  openOutline,
  powerOutline,
  radioOutline,
  trashOutline,
  wifiOutline,
} from 'ionicons/icons';
import { RingingBanner } from '../components/RingingBanner';
import { useClock } from '../state/ClockContext';
import {
  type OtaImageInspection,
  formatElapsed,
  normalizeDeviceUrl,
  validateWifiCredentials,
} from '../types/clock';

export const DevicePage: React.FC = () => {
  const {
    status,
    mode,
    demoMode,
    connectionStatus,
    profiles,
    activeProfile,
    busy,
    otaProgress,
    scanningWifi,
    scannedNetworks,
    wifiScanMessage,
    setConnectionMode,
    selectProfile,
    addProfile,
    updateProfile,
    removeProfile,
    scanWifi,
    saveWifi,
    rebootDevice,
    inspectOtaBinary,
    uploadOta,
    triggerDemoAlarm,
    setDemoNetworkMode,
    setDemoBuzzerConfigured,
    showToast,
  } = useClock();

  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileUrl, setNewProfileUrl] = useState('');
  const [newProfileProxy, setNewProfileProxy] = useState(true);

  const [selectedWifiValue, setSelectedWifiValue] = useState('');
  const [hiddenSsid, setHiddenSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');

  const [firmwareFile, setFirmwareFile] = useState<File | null>(null);
  const [otaInspection, setOtaInspection] = useState<OtaImageInspection | null>(null);
  const [confirmRebootOpen, setConfirmRebootOpen] = useState(false);
  const [confirmOtaOpen, setConfirmOtaOpen] = useState(false);
  const [confirmWifiOpen, setConfirmWifiOpen] = useState(false);
  const [pendingWifiCreds, setPendingWifiCreds] = useState<{ ssid: string; password: string } | null>(
    null,
  );

  const otaAllowed = Boolean(status?.wifi_connected && !status?.setup_ap);

  const handleAddProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProfileName.trim() || 'Custom Momentra';
    const baseUrl = normalizeDeviceUrl(newProfileUrl);
    const created = addProfile({ name, baseUrl, useProxy: newProfileProxy });
    selectProfile(created.id);
    setNewProfileName('');
    setNewProfileUrl('');
    showToast(`Added device profile "${created.name}".`, 'success');
  };

  const handleWifiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ssid =
      selectedWifiValue === 'hidden'
        ? hiddenSsid.trim()
        : selectedWifiValue.startsWith('ssid:')
          ? selectedWifiValue.slice(5)
          : '';
    if (!ssid) {
      showToast('Select a scanned network or enter a hidden network SSID.', 'danger');
      return;
    }
    const err = validateWifiCredentials(ssid, wifiPassword);
    if (err) {
      showToast(err, 'danger');
      return;
    }
    setPendingWifiCreds({ ssid, password: wifiPassword });
    setConfirmWifiOpen(true);
  };

  const handleFirmwareFileChange = async (file: File | null) => {
    setFirmwareFile(file);
    if (!file) {
      setOtaInspection(null);
      return;
    }
    try {
      const inspection = await inspectOtaBinary(file);
      setOtaInspection(inspection);
    } catch {
      setOtaInspection(null);
    }
  };

  const handleOtaClick = () => {
    if (!firmwareFile) {
      showToast('Select a firmware .bin file first.', 'danger');
      return;
    }
    if (otaInspection && !otaInspection.valid) {
      showToast(otaInspection.errors[0] || 'Invalid OTA firmware image.', 'danger');
      return;
    }
    if (!otaAllowed) {
      showToast('OTA firmware upload requires station-only mode (Setup AP inactive).', 'danger');
      return;
    }
    setConfirmOtaOpen(true);
  };

  return (
    <div className="page-shell">
      <RingingBanner />

      <section className="glass-panel" aria-label="Device connection manager">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <IonIcon icon={radioOutline} aria-hidden="true" />
              Device Connection
            </h2>
            <p className="panel-subtitle">
              Run with the built-in ESP32 simulator or connect to a physical Momentra Clock over
              LAN or Setup AP.
            </p>
          </div>
          <span className="m-pill-surface accent" data-testid="device-conn-status">
            {connectionStatus.toUpperCase()}
          </span>
        </div>

        <div className="btn-row" style={{ marginBottom: 14 }}>
          <IonButton
            fill={mode === 'demo' ? 'solid' : 'outline'}
            onClick={() => setConnectionMode('demo')}
            data-testid="mode-demo-btn"
          >
            Demo Simulator
          </IonButton>
          <IonButton
            fill={mode === 'live' ? 'solid' : 'outline'}
            onClick={() => setConnectionMode('live')}
            data-testid="mode-live-btn"
          >
            Live Device HTTP
          </IonButton>
          {!demoMode && (
            <IonButton
              fill="outline"
              color="secondary"
              href={`${activeProfile.baseUrl}/`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="open-device-dashboard-btn"
            >
              <IonIcon slot="start" icon={openOutline} />
              Open Device Web Dashboard
            </IonButton>
          )}
        </div>

        <div className="alarm-grid" style={{ marginBottom: 14 }}>
          {profiles.map((profile) => {
            const isActive = profile.id === activeProfile.id;
            return (
              <div
                key={profile.id}
                className={`surface-row ${isActive ? 'active' : ''}`}
                style={{ padding: '12px 14px' }}
                data-testid={`profile-card-${profile.id}`}
              >
                <div className="surface-row-top">
                  <div style={{ minWidth: 0 }}>
                    <strong>{profile.name}</strong>
                    <div className="panel-subtitle" style={{ wordBreak: 'break-all' }}>
                      {profile.baseUrl}
                    </div>
                    <div className="alarm-meta-row">
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          color: 'var(--m-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={profile.useProxy}
                          onChange={(e) =>
                            updateProfile({ ...profile, useProxy: e.target.checked })
                          }
                        />
                        Use dev proxy (/device-proxy)
                      </label>
                    </div>
                  </div>

                  <div className="btn-row">
                    <IonButton
                      size="small"
                      fill={isActive ? 'solid' : 'outline'}
                      onClick={() => selectProfile(profile.id)}
                      data-testid={`profile-select-${profile.id}`}
                    >
                      {isActive ? 'Selected' : 'Use'}
                    </IonButton>
                    {profiles.length > 1 && (
                      <IonButton
                        size="small"
                        fill="clear"
                        color="danger"
                        aria-label={`Remove ${profile.name}`}
                        onClick={() => removeProfile(profile.id)}
                      >
                        <IonIcon icon={trashOutline} />
                      </IonButton>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <form className="surface-row" onSubmit={handleAddProfile} data-testid="add-profile-form">
          <strong style={{ fontSize: 14 }}>Add Custom Device URL</strong>
          <div className="form-grid">
            <label className="field-block">
              <span className="field-label">Profile name</span>
              <input
                className="m-input"
                type="text"
                placeholder="e.g. Living Room Clock"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                data-testid="new-profile-name"
              />
            </label>

            <label className="field-block">
              <span className="field-label">Base URL / IP</span>
              <input
                className="m-input"
                type="text"
                required
                placeholder="http://192.168.1.42"
                value={newProfileUrl}
                onChange={(e) => setNewProfileUrl(e.target.value)}
                data-testid="new-profile-url"
              />
            </label>
          </div>
          <div className="btn-row" style={{ justifyContent: 'space-between' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: 'var(--m-muted)',
              }}
            >
              <input
                type="checkbox"
                checked={newProfileProxy}
                onChange={(e) => setNewProfileProxy(e.target.checked)}
              />
              Route through Vite /device-proxy (avoids browser CORS block)
            </label>
            <IonButton type="submit" size="small" data-testid="add-profile-btn">
              <IonIcon slot="start" icon={addCircleOutline} />
              Add Device
            </IonButton>
          </div>
        </form>

        {demoMode && status && (
          <div className="surface-row" style={{ marginTop: 14 }} data-testid="demo-controls-box">
            <strong style={{ fontSize: 14 }}>Simulator Hardware Toggles</strong>
            <div className="form-grid">
              <div className="toggle-row">
                <div>
                  <strong style={{ fontSize: 13 }}>Setup AP Mode (192.168.4.1)</strong>
                  <div className="panel-subtitle">Disables OTA (403 guard)</div>
                </div>
                <IonToggle
                  checked={status.setup_ap}
                  onIonChange={(e) => void setDemoNetworkMode(e.detail.checked)}
                  data-testid="demo-setup-ap-toggle"
                />
              </div>

              <div className="toggle-row">
                <div>
                  <strong style={{ fontSize: 13 }}>Buzzer Configured</strong>
                  <div className="panel-subtitle">Disable to test 409 reminder guard</div>
                </div>
                <IonToggle
                  checked={status.buzzer_configured}
                  onIonChange={(e) => void setDemoBuzzerConfigured(e.detail.checked)}
                  data-testid="demo-buzzer-toggle"
                />
              </div>
            </div>
            <div className="btn-row">
              <IonButton
                size="small"
                color="warning"
                fill="outline"
                onClick={() => void triggerDemoAlarm(0)}
              >
                Simulate Alarm 1 Ring
              </IonButton>
            </div>
          </div>
        )}
      </section>

      <div className="two-col-grid" style={{ alignItems: 'start' }}>
        <section className="glass-panel" aria-label="Wi-Fi setup">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">
                <IonIcon icon={wifiOutline} aria-hidden="true" />
                Wi-Fi Setup
              </h2>
              <p className="panel-subtitle">Scan 2.4 GHz networks and provision credentials.</p>
            </div>
            <IonButton
              size="small"
              fill="outline"
              disabled={scanningWifi || busy || !status}
              onClick={() => void scanWifi()}
              data-testid="wifi-scan-btn"
            >
              {scanningWifi ? 'Scanning…' : 'Scan'}
            </IonButton>
          </div>

          <div className="hint-box warn" style={{ marginBottom: 12 }}>
            The ESP32 setup AP is open: nearby devices can observe credentials sent over it.
          </div>

          <form onSubmit={handleWifiSubmit} data-testid="wifi-setup-form">
            <div className="form-grid">
              <label className="field-block form-full">
                <span className="field-label">Available networks</span>
                <select
                  className="m-select"
                  value={selectedWifiValue}
                  onChange={(e) => setSelectedWifiValue(e.target.value)}
                  data-testid="wifi-network-select"
                >
                  <option value="">Select a network</option>
                  <option value="hidden">Other / hidden network</option>
                  {scannedNetworks.map((net) => (
                    <option key={`${net.ssid_hex}-${net.rssi}`} value={`ssid:${net.ssid}`}>
                      {net.ssid} ({net.rssi} dBm)
                    </option>
                  ))}
                </select>
              </label>

              {selectedWifiValue === 'hidden' && (
                <label className="field-block form-full">
                  <span className="field-label">Hidden network SSID (1–32 bytes)</span>
                  <input
                    className="m-input"
                    type="text"
                    maxLength={32}
                    required
                    value={hiddenSsid}
                    onChange={(e) => setHiddenSsid(e.target.value)}
                    data-testid="wifi-hidden-ssid-input"
                  />
                </label>
              )}

              <label className="field-block form-full">
                <span className="field-label">Password (empty for open, or 8–63 bytes)</span>
                <input
                  className="m-input"
                  type="password"
                  maxLength={63}
                  autoComplete="new-password"
                  value={wifiPassword}
                  onChange={(e) => setWifiPassword(e.target.value)}
                  data-testid="wifi-password-input"
                />
              </label>
            </div>

            <p className="panel-subtitle" style={{ margin: '10px 0 14px' }} data-testid="wifi-scan-msg">
              {wifiScanMessage ?? 'Tap Scan to discover nearby 2.4 GHz Wi-Fi networks.'}
            </p>

            <IonButton
              type="submit"
              expand="block"
              disabled={busy || !status}
              data-testid="wifi-save-btn"
            >
              Save &amp; Reboot
            </IonButton>
          </form>
        </section>

        <section className="glass-panel" aria-label="Firmware OTA and reboot">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">
                <IonIcon icon={cloudUploadOutline} aria-hidden="true" />
                Firmware &amp; Maintenance
              </h2>
              <p className="panel-subtitle">Over-the-air .bin update and device reboot controls.</p>
            </div>
          </div>

          {!otaAllowed && (
            <div className="hint-box warn" style={{ marginBottom: 12 }} data-testid="ota-guard-note">
              Firmware upload requires station-only mode (wifi_connected true and Setup AP
              inactive). Switch to Station mode before uploading.
            </div>
          )}

          <div className="field-block" style={{ marginBottom: 12 }}>
            <span className="field-label">Firmware application binary (.bin)</span>
            <input
              className="m-input"
              type="file"
              accept=".bin"
              onChange={(e) => void handleFirmwareFileChange(e.target.files?.[0] ?? null)}
              data-testid="ota-file-input"
            />
            {firmwareFile && (
              <span className="panel-subtitle">
                Selected: {firmwareFile.name} ({(firmwareFile.size / 1024).toFixed(1)} KiB)
              </span>
            )}
          </div>

          {otaInspection && (
            <div
              className={`hint-box ${otaInspection.valid ? '' : 'warn'}`}
              style={{ marginBottom: 12 }}
              data-testid="ota-preflight"
            >
              {otaInspection.valid ? (
                <>
                  <strong>Preflight OK:</strong>{' '}
                  {otaInspection.projectName || 'ESP-IDF Application'}
                  {otaInspection.version ? ` v${otaInspection.version}` : ''} ·{' '}
                  {(otaInspection.sizeBytes / 1024).toFixed(1)} KiB /{' '}
                  {(otaInspection.maxBytes / 1024).toFixed(0)} KiB max
                </>
              ) : (
                <>
                  <strong>Invalid OTA binary:</strong> {otaInspection.errors.join(' ')}
                </>
              )}
              {otaInspection.warnings.length > 0 && (
                <div style={{ marginTop: 4 }}>{otaInspection.warnings.join(' ')}</div>
              )}
            </div>
          )}

          {otaProgress !== null && (
            <div style={{ marginBottom: 12 }} data-testid="ota-progress-wrap">
              <div className="field-label" style={{ marginBottom: 6 }}>
                <span>Uploading firmware…</span>
                <output data-testid="ota-progress-text">{Math.round(otaProgress)}%</output>
              </div>
              <IonProgressBar
                value={Math.max(0, Math.min(1, otaProgress / 100))}
                data-testid="ota-progress-bar"
              />
            </div>
          )}

          <div className="hint-box" style={{ marginBottom: 14 }}>
            Upload only trusted application .bin images — do not upload bootloader or combined
            flash images. The LED panel blanks during flash write.
          </div>

          <div className="btn-row">
            <IonButton
              disabled={
                busy ||
                !status ||
                !otaAllowed ||
                !firmwareFile ||
                (otaInspection !== null && !otaInspection.valid)
              }
              onClick={handleOtaClick}
              data-testid="ota-upload-btn"
            >
              <IonIcon slot="start" icon={cloudUploadOutline} />
              Upload &amp; Reboot
            </IonButton>

            <IonButton
              color="danger"
              fill="outline"
              disabled={busy || !status}
              onClick={() => setConfirmRebootOpen(true)}
              data-testid="reboot-device-btn"
            >
              <IonIcon slot="start" icon={powerOutline} />
              Reboot Device
            </IonButton>
          </div>
        </section>
      </div>

      <section className="glass-panel" aria-label="System telemetry">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <IonIcon icon={hardwareChipOutline} aria-hidden="true" />
              System Telemetry
            </h2>
            <p className="panel-subtitle">Live ESP32 hardware health and network identity.</p>
          </div>
          <span className="m-pill-surface">v{status?.firmware_version ?? '—'}</span>
        </div>

        <dl className="telemetry-grid" data-testid="telemetry-grid">
          <div className="telemetry-item">
            <dt>Uptime</dt>
            <dd>{status ? formatElapsed(status.uptime_seconds) : '—'}</dd>
          </div>
          <div className="telemetry-item">
            <dt>Wi-Fi Signal (RSSI)</dt>
            <dd>
              {status ? (status.wifi_rssi === null ? 'Unavailable' : `${status.wifi_rssi} dBm`) : '—'}
            </dd>
          </div>
          <div className="telemetry-item">
            <dt>Local IP</dt>
            <dd>{status?.local_ip ?? 'Unavailable'}</dd>
          </div>
          <div className="telemetry-item">
            <dt>Wi-Fi MAC</dt>
            <dd>{status?.wifi_mac ?? '—'}</dd>
          </div>
          <div className="telemetry-item">
            <dt>Chip ID</dt>
            <dd>{status?.chip_id ?? '—'}</dd>
          </div>
          <div className="telemetry-item">
            <dt>Time Sync</dt>
            <dd>
              {status
                ? status.time_valid
                  ? `Synced${
                      status.sync_age_seconds !== null
                        ? ` · ${formatElapsed(status.sync_age_seconds)} ago`
                        : ''
                    }`
                  : 'Not synchronized'
                : '—'}
            </dd>
          </div>
          <div className="telemetry-item">
            <dt>Panel Driver</dt>
            <dd>{status ? (status.display_ready ? 'Ready' : 'Not ready') : '—'}</dd>
          </div>
          <div className="telemetry-item">
            <dt>Buzzer</dt>
            <dd>{status ? (status.buzzer_configured ? 'Configured' : 'Not configured') : '—'}</dd>
          </div>
          <div className="telemetry-item">
            <dt>Free Heap</dt>
            <dd>{status ? `${(status.free_heap_bytes / 1024).toFixed(1)} KiB` : '—'}</dd>
          </div>
          <div className="telemetry-item">
            <dt>Min Free Heap</dt>
            <dd>{status ? `${(status.min_free_heap_bytes / 1024).toFixed(1)} KiB` : '—'}</dd>
          </div>
        </dl>
      </section>

      <IonAlert
        isOpen={confirmRebootOpen}
        onDidDismiss={() => setConfirmRebootOpen(false)}
        header="Reboot Momentra Clock?"
        message="Active stopwatch/reminder timers and sounds are cleared on reboot."
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Reboot',
            role: 'destructive',
            handler: () => {
              void rebootDevice();
            },
          },
        ]}
      />

      <IonAlert
        isOpen={confirmOtaOpen}
        onDidDismiss={() => setConfirmOtaOpen(false)}
        header="Upload Firmware & Reboot?"
        message={`Flash "${firmwareFile?.name ?? 'firmware.bin'}" to the OTA partition? The panel will blank during write and reboot automatically.`}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Upload & Reboot',
            role: 'destructive',
            handler: () => {
              if (firmwareFile) {
                void uploadOta(firmwareFile);
              }
            },
          },
        ]}
      />

      <IonAlert
        isOpen={confirmWifiOpen}
        onDidDismiss={() => setConfirmWifiOpen(false)}
        header="Save Wi-Fi & Reboot?"
        message={`Save credentials for "${pendingWifiCreds?.ssid ?? ''}" and reboot into the new network?`}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Save & Reboot',
            handler: () => {
              if (pendingWifiCreds) {
                void saveWifi(pendingWifiCreds.ssid, pendingWifiCreds.password);
              }
            },
          },
        ]}
      />
    </div>
  );
};
