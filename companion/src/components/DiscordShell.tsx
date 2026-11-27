import React, { useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import {
  addOutline,
  alarmOutline,
  closeOutline,
  colorPaletteOutline,
  flashOutline,
  hardwareChipOutline,
  notificationsOffOutline,
  refreshOutline,
  timeOutline,
  volumeHighOutline,
  volumeMuteOutline,
  wifiOutline,
} from 'ionicons/icons';
import { useClock } from '../state/ClockContext';
import { THEMES, normalizeDeviceUrl } from '../types/clock';
import { DeviceBar } from './DeviceBar';

export interface ChannelMeta {
  id: string;
  path: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  group: 'Control' | 'Hardware & Flashing';
}

export const CHANNELS: readonly ChannelMeta[] = [
  {
    id: 'overview',
    path: '/overview',
    label: 'clock-overview',
    shortLabel: 'Clock',
    description: 'Live 32×16 P10 matrix preview, brightness, and active timers',
    icon: timeOutline,
    group: 'Control',
  },
  {
    id: 'alarms',
    path: '/alarms',
    label: 'alarms-timers',
    shortLabel: 'Alarms',
    description: 'Five NVS alarms, stopwatch, and reminder countdown',
    icon: alarmOutline,
    group: 'Control',
  },
  {
    id: 'display',
    path: '/display',
    label: 'display-sound',
    shortLabel: 'Display',
    description: 'Typography, animations, timezones, and hourly chimes',
    icon: colorPaletteOutline,
    group: 'Control',
  },
  {
    id: 'device',
    path: '/device',
    label: 'device-network',
    shortLabel: 'Device',
    description: 'LAN connections, Wi-Fi setup, OTA updates, and telemetry',
    icon: wifiOutline,
    group: 'Hardware & Flashing',
  },
  {
    id: 'flasher',
    path: '/flasher',
    label: 'usb-flasher',
    shortLabel: 'Flasher',
    description: 'Web Serial USB flashing for ESP32 and ESP32-S3 boards',
    icon: flashOutline,
    group: 'Hardware & Flashing',
  },
];

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'MC';
}

export const DiscordShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const history = useHistory();
  const {
    status,
    demoMode,
    connectionStatus,
    profiles,
    activeProfile,
    theme,
    busy,
    magicPlayback,
    magicSoundMuted,
    setTheme,
    setMagicSoundMuted,
    setConnectionMode,
    selectProfile,
    addProfile,
    refresh,
    stopAlarm,
    showToast,
  } = useClock();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newProxy, setNewProxy] = useState(true);

  const activeChannel =
    CHANNELS.find((c) => location.pathname.startsWith(c.path)) ?? CHANNELS[0];

  const enabledAlarmCount = status?.alarms.filter((a) => a.enabled === 1).length ?? 0;
  const isAnyRinging = Boolean(status?.ringing) || status?.reminder_state === 3;
  const isMagicPlaying = Boolean(status?.magic_playing) || magicPlayback.playing;

  const navigateChannel = (path: string) => {
    history.push(path);
    setDrawerOpen(false);
  };

  const handleSelectDemo = () => {
    setConnectionMode('demo');
    setDrawerOpen(false);
  };

  const handleSelectProfile = (profileId: string) => {
    selectProfile(profileId);
    setConnectionMode('live');
    setDrawerOpen(false);
  };

  const handleCycleTheme = () => {
    const idx = THEMES.findIndex((t) => t.id === theme);
    const next = THEMES[(idx + 1) % THEMES.length];
    setTheme(next.id);
    showToast(`Theme switched to ${next.label}.`, 'primary');
  };

  const handleAddDevice = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim() || 'Momentra Clock';
    const baseUrl = normalizeDeviceUrl(newUrl);
    const created = addProfile({ name, baseUrl, useProxy: newProxy });
    selectProfile(created.id);
    setConnectionMode('live');
    setNewName('');
    setNewUrl('');
    setAddModalOpen(false);
    setDrawerOpen(false);
    showToast(`Added "${created.name}" (${created.baseUrl}).`, 'success');
  };

  const groups: ('Control' | 'Hardware & Flashing')[] = ['Control', 'Hardware & Flashing'];

  return (
    <div className={`discord-workspace ${drawerOpen ? 'drawer-open' : ''}`}>
      {drawerOpen && (
        <div
          className="mobile-drawer-backdrop"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Server / Device Rail */}
      <nav className="server-rail" aria-label="Device servers">
        <div className={`server-pill-wrap ${demoMode ? 'active' : ''}`}>
          <span className="server-pill-indicator" aria-hidden="true" />
          <button
            type="button"
            className="server-icon-btn"
            title="Momentra Demo Simulator"
            aria-label="Select Momentra Demo Simulator"
            onClick={handleSelectDemo}
            data-testid="rail-demo-btn"
          >
            <IonIcon icon={hardwareChipOutline} style={{ fontSize: 21 }} />
            {demoMode && <span className="server-status-badge demo" aria-hidden="true" />}
          </button>
        </div>

        <div className="server-rail-divider" role="separator" />

        {profiles.map((profile) => {
          const isActive = !demoMode && activeProfile.id === profile.id;
          return (
            <div key={profile.id} className={`server-pill-wrap ${isActive ? 'active' : ''}`}>
              <span className="server-pill-indicator" aria-hidden="true" />
              <button
                type="button"
                className="server-icon-btn"
                title={`${profile.name} (${profile.baseUrl})`}
                aria-label={`Connect to ${profile.name}`}
                onClick={() => handleSelectProfile(profile.id)}
                data-testid={`rail-profile-${profile.id}`}
              >
                <span>{getInitials(profile.name)}</span>
                {isActive && (
                  <span
                    className={`server-status-badge ${connectionStatus}`}
                    aria-hidden="true"
                  />
                )}
              </button>
            </div>
          );
        })}

        <div className="server-pill-wrap">
          <button
            type="button"
            className="server-icon-btn add-btn"
            title="Add clock device"
            aria-label="Add clock device"
            onClick={() => setAddModalOpen(true)}
            data-testid="rail-add-device-btn"
          >
            <IonIcon icon={addOutline} style={{ fontSize: 21 }} />
          </button>
        </div>

        <div className="server-rail-spacer" />

        <div className="server-pill-wrap">
          <button
            type="button"
            className="server-icon-btn"
            title={`Cycle theme (current: ${THEMES.find((t) => t.id === theme)?.label ?? theme})`}
            aria-label="Cycle theme"
            onClick={handleCycleTheme}
            data-testid="rail-theme-btn"
          >
            <IonIcon icon={colorPaletteOutline} style={{ fontSize: 20 }} />
          </button>
        </div>
      </nav>

      {/* Channel Sidebar */}
      <aside className="channel-sidebar" aria-label="Workspace channels">
        <div className="sidebar-server-header">
          <span className="sidebar-server-name" data-testid="sidebar-server-name">
            {demoMode ? 'Momentra Simulator' : activeProfile.name}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="m-pill-surface">v{status?.firmware_version ?? '—'}</span>
            {drawerOpen && (
              <button
                type="button"
                className="icon-btn"
                aria-label="Close drawer"
                onClick={() => setDrawerOpen(false)}
              >
                <IonIcon icon={closeOutline} />
              </button>
            )}
          </div>
        </div>

        <div className="sidebar-channels-scroll">
          {groups.map((groupName) => (
            <div key={groupName}>
              <div className="channel-group-title">{groupName}</div>
              <div className="channel-list">
                {CHANNELS.filter((c) => c.group === groupName).map((channel) => {
                  const isActive = activeChannel.id === channel.id;
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      className={`channel-item-btn ${isActive ? 'active' : ''}`}
                      onClick={() => navigateChannel(channel.path)}
                      data-testid={`channel-${channel.id}`}
                    >
                      <span className="channel-item-left">
                        <IonIcon icon={channel.icon} className="channel-hash" aria-hidden="true" />
                        <span>{channel.label}</span>
                      </span>

                      {channel.id === 'alarms' && isAnyRinging && (
                        <span className="channel-badge danger">Ringing</span>
                      )}
                      {channel.id === 'alarms' && !isAnyRinging && enabledAlarmCount > 0 && (
                        <span className="channel-badge">{enabledAlarmCount}</span>
                      )}
                      {channel.id === 'display' && isMagicPlaying && (
                        <span className="channel-badge">Music</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="device-dock" data-testid="device-dock">
          <div className="device-dock-info">
            <span className={`status-dot ${connectionStatus}`} aria-hidden="true" />
            <div className="device-dock-meta">
              <strong>{demoMode ? 'Virtual ESP32' : activeProfile.name}</strong>
              <span>{status?.local_ip ?? status?.chip_id ?? 'Connecting'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className="icon-btn"
              title={magicSoundMuted ? 'Unmute browser synth audio' : 'Mute browser synth audio'}
              aria-label={magicSoundMuted ? 'Unmute browser synth audio' : 'Mute browser synth audio'}
              onClick={() => setMagicSoundMuted(!magicSoundMuted)}
              data-testid="dock-mute-btn"
            >
              <IonIcon icon={magicSoundMuted ? volumeMuteOutline : volumeHighOutline} />
            </button>
            {status?.ringing && (
              <button
                type="button"
                className="icon-btn"
                title="Stop ringing alarm"
                aria-label="Stop ringing alarm"
                disabled={busy}
                onClick={() => void stopAlarm()}
              >
                <IonIcon icon={notificationsOffOutline} />
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              title="Refresh clock status"
              aria-label="Refresh clock status"
              disabled={busy}
              onClick={() => void refresh()}
            >
              <IonIcon icon={refreshOutline} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Channel Stage */}
      <div className="channel-stage">
        <DeviceBar
          channelTitle={activeChannel.label}
          channelDescription={activeChannel.description}
          channelIcon={activeChannel.icon}
          onOpenMobileDrawer={() => setDrawerOpen(true)}
        />

        <main className="channel-scroll-area">{children}</main>

        {/* Mobile Bottom Channel Bar */}
        <nav className="mobile-channel-bar" aria-label="Mobile channel bar" data-testid="mobile-channel-bar">
          {CHANNELS.map((channel) => {
            const isActive = activeChannel.id === channel.id;
            return (
              <button
                key={channel.id}
                type="button"
                className={`mobile-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => navigateChannel(channel.path)}
                data-testid={`mobile-tab-${channel.id}`}
              >
                <IonIcon icon={channel.icon} aria-hidden="true" />
                <span>{channel.shortLabel}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Add Device Modal */}
      <IonModal isOpen={addModalOpen} onDidDismiss={() => setAddModalOpen(false)}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Add Clock Device</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setAddModalOpen(false)}>Close</IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          <form onSubmit={handleAddDevice} style={{ padding: 20 }}>
            <div className="form-grid">
              <label className="field-block form-full">
                <span className="field-label">Device name</span>
                <input
                  className="m-input"
                  type="text"
                  placeholder="e.g. Studio P10 Clock"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  data-testid="rail-modal-name"
                />
              </label>

              <label className="field-block form-full">
                <span className="field-label">Device address (mDNS or private IPv4)</span>
                <input
                  className="m-input"
                  type="text"
                  required
                  placeholder="http://192.168.1.42"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  data-testid="rail-modal-url"
                />
              </label>

              <label
                className="form-full"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: 'var(--m-muted)',
                }}
              >
                <input
                  type="checkbox"
                  checked={newProxy}
                  onChange={(e) => setNewProxy(e.target.checked)}
                />
                Route through Vite /device-proxy when running locally
              </label>
            </div>

            <div style={{ marginTop: 18 }}>
              <IonButton type="submit" expand="block" data-testid="rail-modal-submit">
                Connect &amp; Save Device
              </IonButton>
            </div>
          </form>
        </IonContent>
      </IonModal>
    </div>
  );
};
