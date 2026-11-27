import React from 'react';
import { IonIcon } from '@ionic/react';
import { menuOutline, openOutline, refreshOutline } from 'ionicons/icons';
import { THEMES, type ThemeId } from '../types/clock';
import { useClock } from '../state/ClockContext';

interface DeviceBarProps {
  channelTitle: string;
  channelDescription: string;
  channelIcon: string;
  onOpenMobileDrawer: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  demo: 'Demo Sim',
  live: 'Live',
  connecting: 'Connecting',
  disconnected: 'Offline',
  rebooting: 'Rebooting',
};

export const DeviceBar: React.FC<DeviceBarProps> = ({
  channelTitle,
  channelDescription,
  channelIcon,
  onOpenMobileDrawer,
}) => {
  const {
    connectionStatus,
    demoMode,
    activeProfile,
    setConnectionMode,
    theme,
    setTheme,
    refresh,
    busy,
  } = useClock();

  const statusText = STATUS_LABELS[connectionStatus] ?? 'Live';

  const handleQuickModeToggle = () => {
    setConnectionMode(demoMode ? 'live' : 'demo');
  };

  return (
    <header className="channel-header">
      <div className="channel-header-left">
        <button
          type="button"
          className="icon-btn mobile-menu-btn"
          aria-label="Open workspace navigation"
          onClick={onOpenMobileDrawer}
          data-testid="mobile-menu-btn"
        >
          <IonIcon icon={menuOutline} />
        </button>

        <div className="channel-header-title">
          <IonIcon icon={channelIcon} className="channel-hash" aria-hidden="true" />
          <h1 data-testid="channel-header-title">{channelTitle}</h1>
          <span className="channel-header-desc">{channelDescription}</span>
        </div>
      </div>

      <div className="channel-header-actions">
        <button
          type="button"
          className="status-chip-btn"
          onClick={handleQuickModeToggle}
          title={
            demoMode
              ? 'Running in Demo Simulator — switch to Live Device'
              : `Connected to ${activeProfile.baseUrl} — switch to Demo Simulator`
          }
          data-testid="connection-mode-btn"
        >
          <span className={`status-dot ${connectionStatus}`} aria-hidden="true" />
          <span>{statusText}</span>
        </button>

        <select
          className="theme-select-native"
          aria-label="Theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value as ThemeId)}
          data-testid="theme-select"
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>

        {!demoMode && (
          <a
            className="icon-btn"
            href={`${activeProfile.baseUrl}/`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open device web dashboard"
            title={`Open ${activeProfile.baseUrl}/`}
            data-testid="toolbar-dashboard-link"
          >
            <IonIcon icon={openOutline} />
          </a>
        )}

        <button
          type="button"
          className="icon-btn"
          aria-label="Refresh clock status"
          title="Refresh clock status"
          disabled={busy}
          onClick={() => void refresh()}
          data-testid="refresh-btn"
        >
          <IonIcon icon={refreshOutline} />
        </button>
      </div>
    </header>
  );
};
