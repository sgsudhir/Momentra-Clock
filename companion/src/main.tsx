import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ClockProvider } from './state/ClockContext';

/* Core Ionic CSS */
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional Ionic CSS utilities */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

/* App theme & custom styles */
import './theme/variables.css';
import './theme/global.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root mount element #root not found');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <ClockProvider>
      <App />
    </ClockProvider>
  </React.StrictMode>,
);
