import React, { useMemo, useState } from 'react';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { checkmarkCircle } from 'ionicons/icons';

interface TimezoneModalProps {
  isOpen: boolean;
  title: string;
  selectedZone: string;
  zones: string[];
  onSelect: (zone: string) => void;
  onDismiss: () => void;
}

const REGIONS = ['All', 'Asia', 'America', 'Europe', 'Pacific', 'Africa', 'Etc'] as const;

export const TimezoneModal: React.FC<TimezoneModalProps> = ({
  isOpen,
  title,
  selectedZone,
  zones,
  onSelect,
  onDismiss,
}) => {
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<string>('All');

  const filteredZones = useMemo(() => {
    const q = query.trim().toLowerCase();
    return zones
      .filter((z) => {
        if (region !== 'All' && !z.startsWith(`${region}/`)) return false;
        if (!q) return true;
        return z.toLowerCase().includes(q);
      })
      .slice(0, 250);
  }, [zones, query, region]);

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDismiss} data-testid="timezone-modal">
      <IonHeader>
        <IonToolbar>
          <IonTitle>{title}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onDismiss}>Close</IonButton>
          </IonButtons>
        </IonToolbar>
        <IonToolbar>
          <IonSearchbar
            value={query}
            placeholder="Search city or region (e.g. Kolkata, Tokyo, UTC)"
            onIonInput={(e) => setQuery(e.detail.value ?? '')}
            debounce={80}
            data-testid="timezone-searchbar"
          />
        </IonToolbar>
        <div
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            padding: '6px 12px 10px',
            background: 'var(--ion-toolbar-background)',
            borderBottom: '1px solid var(--m-border)',
          }}
        >
          {REGIONS.map((r) => (
            <button
              key={r}
              type="button"
              className={`chip-btn ${region === r ? 'active' : ''}`}
              onClick={() => setRegion(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </IonHeader>

      <IonContent>
        <IonList>
          {filteredZones.map((zone) => {
            const active = zone === selectedZone;
            return (
              <IonItem
                key={zone}
                button
                detail={false}
                onClick={() => {
                  onSelect(zone);
                  onDismiss();
                }}
                data-testid={`tz-option-${zone}`}
              >
                <IonLabel>
                  <strong style={{ color: active ? 'var(--m-accent)' : 'var(--m-ink)' }}>
                    {zone}
                  </strong>
                </IonLabel>
                {active && <IonIcon slot="end" icon={checkmarkCircle} color="primary" />}
              </IonItem>
            );
          })}
          {filteredZones.length === 0 && (
            <IonItem lines="none">
              <IonLabel color="medium">No matching timezones found.</IonLabel>
            </IonItem>
          )}
        </IonList>
      </IonContent>
    </IonModal>
  );
};
