import React from 'react';
import { Redirect, Route, Switch } from 'react-router-dom';
import { IonApp, IonToast, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { DiscordShell } from './components/DiscordShell';
import { useClock } from './state/ClockContext';
import { OverviewPage } from './pages/OverviewPage';
import { AlarmsTimersPage } from './pages/AlarmsTimersPage';
import { DisplaySoundPage } from './pages/DisplaySoundPage';
import { DevicePage } from './pages/DevicePage';
import { FlasherPage } from './pages/FlasherPage';

setupIonicReact({
  mode: 'md',
});

const App: React.FC = () => {
  const { toast, clearToast } = useClock();

  return (
    <IonApp>
      <IonReactRouter>
        <DiscordShell>
          <Switch>
            <Route exact path="/overview" component={OverviewPage} />
            <Route exact path="/alarms" component={AlarmsTimersPage} />
            <Route exact path="/display" component={DisplaySoundPage} />
            <Route exact path="/device" component={DevicePage} />
            <Route exact path="/flasher" component={FlasherPage} />
            <Route exact path="/">
              <Redirect to="/overview" />
            </Route>
            <Route>
              <Redirect to="/overview" />
            </Route>
          </Switch>
        </DiscordShell>
      </IonReactRouter>

      <IonToast
        isOpen={toast !== null}
        message={toast?.message ?? ''}
        color={toast?.color ?? 'primary'}
        duration={3200}
        position="bottom"
        onDidDismiss={clearToast}
      />
    </IonApp>
  );
};

export default App;
